"use client";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Copy,
  DoorOpen,
  Loader2,
  Save,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ensureAnonSession,
  getBoard,
  joinBoard,
  saveBoardContent,
  WS_URL,
} from "../../../lib/api";
import {
  decodeBoardContent,
  encodeBoardContent,
} from "../../../lib/board-content";
import type {
  Board,
  BoardElement,
  DrawEvent,
  PresenceMember,
  Session,
} from "../../../lib/board-types";

import styles from "./board.module.css";

const WhiteboardCanvas = dynamic(
  () =>
    import("../../../components/WhiteboardCanvas").then(
      (module) => module.WhiteboardCanvas,
    ),
  {
    ssr: false,
    loading: () => (
      <div className={styles.canvasLoading}>Loading canvas...</div>
    ),
  },
);

function shortenId(id: string) {
  return id.slice(0, 8);
}

function upsertElement(elements: BoardElement[], element: BoardElement) {
  const existingIndex = elements.findIndex(
    (candidate) => candidate.id === element.id,
  );
  if (existingIndex === -1) {
    return [...elements, element];
  }

  const nextElements = [...elements];
  nextElements[existingIndex] = element;
  return nextElements;
}

export default function BoardPageClient({ slug }: { slug: string }) {
  const { push } = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string>(crypto.randomUUID());
  const elementsRef = useRef<BoardElement[]>([]);
  const boardRef = useRef<Board | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const hasJoinedRoomRef = useRef(false);
  const pendingDrawEventsRef = useRef<BoardElement[]>([]);
  const isSavingRef = useRef(false);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const sendDrawEvent = useCallback((element: BoardElement) => {
    const activeSession = sessionRef.current;
    const activeBoard = boardRef.current;
    const socket = wsRef.current;
    if (
      !activeSession ||
      !activeBoard ||
      socket?.readyState !== WebSocket.OPEN ||
      !hasJoinedRoomRef.current
    ) {
      pendingDrawEventsRef.current.push(element);
      return;
    }

    const event: DrawEvent = {
      kind: "upsert",
      element,
      originClientId: clientIdRef.current,
      originUserId: activeSession.user.id,
      eventId: crypto.randomUUID(),
    };

    socket.send(
      JSON.stringify({
        type: "draw-event",
        boardId: activeBoard.id,
        event,
      }),
    );
  }, []);

  const flushPendingDrawEvents = useCallback(() => {
    const pendingElements = pendingDrawEventsRef.current;
    if (pendingElements.length === 0) return;

    pendingDrawEventsRef.current = [];
    for (const element of pendingElements) {
      sendDrawEvent(element);
    }
  }, [sendDrawEvent]);

  const handleElementsChange = useCallback(
    (nextElements: BoardElement[], changedElement?: BoardElement) => {
      setElements(nextElements);
      setIsDirty(true);
      if (changedElement) {
        sendDrawEvent(changedElement);
      }
    },
    [sendDrawEvent],
  );

  const saveNow = useCallback(async () => {
    const activeSession = sessionRef.current;
    const activeBoard = boardRef.current;
    if (!activeSession || !activeBoard || isSavingRef.current) return;

    isSavingRef.current = true;
    setIsSaving(true);

    try {
      const content = encodeBoardContent(elementsRef.current);
      await saveBoardContent(activeBoard.slug, activeSession.token, content);
      setIsDirty(false);
      setLastSavedAt(new Date());
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to save board",
      );
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, []);

  const leaveBoard = useCallback(() => {
    const activeBoard = boardRef.current;
    const socket = wsRef.current;
    if (socket && activeBoard && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "leave-board",
          boardId: activeBoard.id,
        }),
      );
    }
    socket?.close();
    push("/");
  }, [push]);

  useEffect(() => {
    let disposed = false;

    async function loadBoard() {
      setIsLoading(true);
      setError(null);

      try {
        const activeSession = await ensureAnonSession();
        if (disposed) return;

        setSession(activeSession);
        await joinBoard(slug, activeSession.token);
        const { board: fetchedBoard } = await getBoard(
          slug,
          activeSession.token,
        );
        if (disposed) return;

        setBoard(fetchedBoard);
        setElements(decodeBoardContent(fetchedBoard.content).elements);
        setIsDirty(false);

        const socket = new WebSocket(
          `${WS_URL}?token=${encodeURIComponent(activeSession.token)}`,
        );
        wsRef.current = socket;

        socket.addEventListener("open", () => {
          if (disposed) return;
          setSocketConnected(true);
          socket.send(
            JSON.stringify({
              type: "join-room",
              boardId: fetchedBoard.id,
            }),
          );
          flushPendingDrawEvents();
        });

        socket.addEventListener("message", (event) => {
          if (disposed) return;

          let message: {
            boardId?: string;
            type?: string;
            members?: PresenceMember[];
            event?: DrawEvent;
          };

          try {
            message = JSON.parse(event.data as string);
          } catch {
            return;
          }

          if (message.type === "presence") {
            setMembers(message.members ?? []);
            if (message.boardId === fetchedBoard.id) {
              hasJoinedRoomRef.current = true;
              flushPendingDrawEvents();
            }
          }

          if (
            message.type === "draw-event" &&
            message.event?.kind === "upsert" &&
            message.event.originClientId !== clientIdRef.current
          ) {
            setElements((currentElements) =>
              upsertElement(currentElements, message.event!.element),
            );
            setIsDirty(true);
          }
        });

        socket.addEventListener("close", () => {
          if (disposed) return;
          setSocketConnected(false);
          hasJoinedRoomRef.current = false;
        });

        socket.addEventListener("error", () => {
          if (disposed) return;
          setSocketConnected(false);
          hasJoinedRoomRef.current = false;
          setError("Realtime connection failed");
        });
      } catch (caughtError) {
        if (disposed) return;
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load board",
        );
      } finally {
        if (!disposed) {
          setIsLoading(false);
        }
      }
    }

    loadBoard();

    return () => {
      disposed = true;
      const activeBoard = boardRef.current;
      const socket = wsRef.current;
      hasJoinedRoomRef.current = false;
      if (socket && activeBoard && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "leave-board",
            boardId: activeBoard.id,
          }),
        );
      }
      socket?.close();
      wsRef.current = null;
    };
  }, [flushPendingDrawEvents, slug]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      if (isDirtyRef.current) {
        void saveNow();
      }
    }, 7500);

    return () => window.clearInterval(timerId);
  }, [saveNow]);

  async function copyBoardLink() {
    await navigator.clipboard.writeText(window.location.href);
  }

  if (isLoading) {
    return (
      <main className={styles.loadingPage}>
        <Loader2 aria-hidden className={styles.spinIcon} size={22} />
        Opening board...
      </main>
    );
  }

  if (error && !board) {
    return (
      <main className={styles.errorPage}>
        <p>{error}</p>
        <button onClick={() => push("/")} type="button">
          Back to lobby
        </button>
      </main>
    );
  }

  return (
    <main className={styles.boardPage}>
      <header className={styles.topBar}>
        <div className={styles.boardMeta}>
          <span className={styles.boardLabel}>Board</span>
          <strong>{slug}</strong>
        </div>

        <div className={styles.topActions}>
          <span className={styles.connectionStatus}>
            {socketConnected ? (
              <Wifi aria-hidden size={16} />
            ) : (
              <WifiOff aria-hidden size={16} />
            )}
            {socketConnected ? "Live" : "Offline"}
          </span>
          <button onClick={copyBoardLink} title="Copy board link" type="button">
            <Copy aria-hidden size={17} />
          </button>
          <button disabled={isSaving} onClick={saveNow} type="button">
            {isSaving ? (
              <Loader2 aria-hidden className={styles.spinIcon} size={17} />
            ) : (
              <Save aria-hidden size={17} />
            )}
            Save
          </button>
          <button onClick={leaveBoard} type="button">
            <DoorOpen aria-hidden size={17} />
            Leave
          </button>
        </div>
      </header>

      <WhiteboardCanvas
        elements={elements}
        onElementsChange={handleElementsChange}
      />

      <aside className={styles.memberPanel}>
        <div className={styles.memberHeader}>
          <Users aria-hidden size={17} />
          <strong>{members.length}</strong>
          <span>active</span>
        </div>
        <div className={styles.memberList}>
          {members.map((member) => (
            <span key={member.userId}>{shortenId(member.userId)}</span>
          ))}
        </div>
      </aside>

      <footer className={styles.saveStatus}>
        {error ? <span className={styles.inlineError}>{error}</span> : null}
        {!error && isSaving ? <span>Saving...</span> : null}
        {!error && !isSaving && isDirty ? <span>Unsaved changes</span> : null}
        {!error && !isSaving && !isDirty && lastSavedAt ? (
          <span>Saved {lastSavedAt.toLocaleTimeString()}</span>
        ) : null}
      </footer>
    </main>
  );
}
