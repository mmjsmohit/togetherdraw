"use client";

import { Circle, Layer, Line, Rect, Stage } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import {
  Circle as CircleIcon,
  MousePointer2,
  Minus,
  PenLine,
  Plus,
  RectangleHorizontal,
  RotateCcw,
} from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BoardElement,
  CircleElement,
  LineElement,
  RectElement,
  Tool,
} from "../lib/board-types";
import styles from "./WhiteboardCanvas.module.css";
import { useOthers, useUpdateMyPresence } from "@liveblocks/react/suspense";

type Point = {
  x: number;
  y: number;
};

type DrawingDraft =
  | {
      id: string;
      start: Point;
      type: "rect" | "circle";
    }
  | {
      id: string;
      type: "line";
    };

const TOOL_OPTIONS: Array<{
  icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  label: string;
  value: Tool;
}> = [
  { icon: MousePointer2, label: "Select", value: "select" },
  { icon: RectangleHorizontal, label: "Rectangle", value: "rect" },
  { icon: CircleIcon, label: "Circle", value: "circle" },
  { icon: PenLine, label: "Pen", value: "pen" },
];

function createRect(id: string, start: Point): RectElement {
  return {
    id,
    type: "rect",
    x: start.x,
    y: start.y,
    width: 1,
    height: 1,
    fill: "rgba(20, 184, 166, 0.18)",
    stroke: "#0f766e",
    strokeWidth: 2,
  };
}

function createCircle(id: string, start: Point): CircleElement {
  return {
    id,
    type: "circle",
    x: start.x,
    y: start.y,
    radius: 1,
    fill: "rgba(245, 158, 11, 0.2)",
    stroke: "#b45309",
    strokeWidth: 2,
  };
}

function createLine(id: string, start: Point): LineElement {
  return {
    id,
    type: "line",
    points: [start.x, start.y],
    stroke: "#1e293b",
    strokeWidth: 4,
  };
}

function updateRect(
  element: RectElement,
  start: Point,
  current: Point,
): RectElement {
  return {
    ...element,
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.max(1, Math.abs(current.x - start.x)),
    height: Math.max(1, Math.abs(current.y - start.y)),
  };
}

function updateCircle(
  element: CircleElement,
  start: Point,
  current: Point,
): CircleElement {
  return {
    ...element,
    radius: Math.max(1, Math.hypot(current.x - start.x, current.y - start.y)),
  };
}

function replaceElement(
  elements: BoardElement[],
  changedElement: BoardElement,
) {
  return elements.map((element) =>
    element.id === changedElement.id ? changedElement : element,
  );
}

function translateLine(element: LineElement, deltaX: number, deltaY: number) {
  return {
    ...element,
    points: element.points.map((point, index) =>
      index % 2 === 0 ? point + deltaX : point + deltaY,
    ),
  };
}

export function WhiteboardCanvas({
  elements,
  onElementsChange,
}: {
  elements: BoardElement[];
  onElementsChange: (
    nextElements: BoardElement[],
    changedElement?: BoardElement,
  ) => void;
}) {
  const [tool, setTool] = useState<Tool>("select");
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<KonvaStage | null>(null);
  const elementsRef = useRef(elements);
  const draftRef = useRef<DrawingDraft | null>(null);
  const lastLineEmitRef = useRef(0);
  const others = useOthers();
  const updateMyPresence = useUpdateMyPresence();
  const lastCursorEmitRef = useRef(0);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      setStageSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  const zoomLabel = useMemo(() => `${Math.round(scale * 100)}%`, [scale]);

  function getWorldPointer(): Point | null {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return null;

    return {
      x: (pointer.x - stage.x()) / scale,
      y: (pointer.y - stage.y()) / scale,
    };
  }
  function worldToScreen(point: Point): Point {
    return {
      x: point.x * scale + stagePosition.x,
      y: point.y * scale + stagePosition.y,
    };
  }

  function updateCursorPresence() {
    const pointer = getWorldPointer();
    if (!pointer) return;

    const now = Date.now();
    if (now - lastCursorEmitRef.current < 16) return;

    lastCursorEmitRef.current = now;
    updateMyPresence({ cursor: pointer });
  }

  function clearCursorPresence() {
    updateMyPresence({ cursor: null });
  }

  function syncStagePosition(event: KonvaEventObject<DragEvent>) {
    if (event.target === stageRef.current) {
      setStagePosition({
        x: event.target.x(),
        y: event.target.y(),
      });
    }
  }

  function commitElements(
    nextElements: BoardElement[],
    changedElement?: BoardElement,
    forceBroadcast = false,
  ) {
    elementsRef.current = nextElements;
    if (!changedElement) {
      onElementsChange(nextElements);
      return;
    }

    const now = Date.now();
    const shouldBroadcast =
      forceBroadcast ||
      changedElement.type !== "line" ||
      now - lastLineEmitRef.current > 50;
    if (shouldBroadcast) {
      lastLineEmitRef.current = now;
    }

    onElementsChange(
      nextElements,
      shouldBroadcast ? changedElement : undefined,
    );
  }

  function handlePointerDown() {
    if (tool === "select") return;

    const pointer = getWorldPointer();
    if (!pointer) return;

    const id = crypto.randomUUID();
    const element =
      tool === "rect"
        ? createRect(id, pointer)
        : tool === "circle"
          ? createCircle(id, pointer)
          : createLine(id, pointer);

    draftRef.current =
      element.type === "line"
        ? { id, type: "line" }
        : { id, start: pointer, type: element.type };
    commitElements([...elementsRef.current, element], element, true);
  }

  function handlePointerMove() {
    updateCursorPresence();

    const draft = draftRef.current;
    if (!draft) return;

    const pointer = getWorldPointer();
    if (!pointer) return;

    const currentElement = elementsRef.current.find(
      (element) => element.id === draft.id,
    );
    if (!currentElement) return;

    let changedElement: BoardElement;
    if (draft.type === "rect" && currentElement.type === "rect") {
      changedElement = updateRect(currentElement, draft.start, pointer);
    } else if (draft.type === "circle" && currentElement.type === "circle") {
      changedElement = updateCircle(currentElement, draft.start, pointer);
    } else if (draft.type === "line" && currentElement.type === "line") {
      changedElement = {
        ...currentElement,
        points: [...currentElement.points, pointer.x, pointer.y],
      };
    } else {
      return;
    }

    commitElements(
      replaceElement(elementsRef.current, changedElement),
      changedElement,
    );
  }

  function handlePointerUp() {
    const draft = draftRef.current;
    if (!draft) return;

    const changedElement = elementsRef.current.find(
      (element) => element.id === draft.id,
    );
    draftRef.current = null;

    if (changedElement) {
      commitElements(elementsRef.current, changedElement, true);
    }
  }

  function handleWheel(event: KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;

    const oldScale = scale;
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    let direction = event.evt.deltaY > 0 ? -1 : 1;
    if (event.evt.ctrlKey) {
      direction = -direction;
    }
    const nextScale = Math.min(
      3,
      Math.max(0.25, direction > 0 ? oldScale * 1.08 : oldScale / 1.08),
    );

    setScale(nextScale);
    setStagePosition({
      x: pointer.x - mousePointTo.x * nextScale,
      y: pointer.y - mousePointTo.y * nextScale,
    });
  }

  function zoomBy(multiplier: number) {
    const nextScale = Math.min(3, Math.max(0.25, scale * multiplier));
    const center = {
      x: stageSize.width / 2,
      y: stageSize.height / 2,
    };
    const pointTo = {
      x: (center.x - stagePosition.x) / scale,
      y: (center.y - stagePosition.y) / scale,
    };

    setScale(nextScale);
    setStagePosition({
      x: center.x - pointTo.x * nextScale,
      y: center.y - pointTo.y * nextScale,
    });
  }

  function resetZoom() {
    setScale(1);
    setStagePosition({ x: 0, y: 0 });
  }

  function updateDraggedElement(changedElement: BoardElement) {
    commitElements(
      replaceElement(elementsRef.current, changedElement),
      changedElement,
      true,
    );
  }

  return (
    <section ref={containerRef} className={styles.canvasShell}>
      <div className={styles.toolbar} aria-label="Canvas tools">
        {TOOL_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <button
              aria-pressed={tool === option.value}
              className={tool === option.value ? styles.activeTool : ""}
              key={option.value}
              onClick={() => setTool(option.value)}
              title={option.label}
              type="button"
            >
              <Icon aria-hidden size={18} />
            </button>
          );
        })}
      </div>

      <div className={styles.zoomControls}>
        <button onClick={() => zoomBy(1 / 1.15)} title="Zoom out" type="button">
          <Minus aria-hidden size={17} />
        </button>
        <span>{zoomLabel}</span>
        <button onClick={() => zoomBy(1.15)} title="Zoom in" type="button">
          <Plus aria-hidden size={17} />
        </button>
        <button onClick={resetZoom} title="Reset zoom" type="button">
          <RotateCcw aria-hidden size={17} />
        </button>
      </div>

      {stageSize.width > 0 && stageSize.height > 0 ? (
        <Stage
          draggable={tool === "select"}
          height={stageSize.height}
          onDragEnd={syncStagePosition}
          onDragMove={syncStagePosition}
          onMouseDown={handlePointerDown}
          onMouseLeave={() => {
            clearCursorPresence();
            handlePointerUp();
          }}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onTouchEnd={handlePointerUp}
          onTouchMove={handlePointerMove}
          onTouchStart={handlePointerDown}
          onWheel={handleWheel}
          ref={stageRef}
          scaleX={scale}
          scaleY={scale}
          width={stageSize.width}
          x={stagePosition.x}
          y={stagePosition.y}
        >
          <Layer>
            {elements.map((element) => {
              if (element.type === "rect") {
                return (
                  <Rect
                    draggable={tool === "select"}
                    key={element.id}
                    {...element}
                    onDragEnd={(event) => {
                      updateDraggedElement({
                        ...element,
                        x: event.target.x(),
                        y: event.target.y(),
                      });
                    }}
                  />
                );
              }

              if (element.type === "circle") {
                return (
                  <Circle
                    draggable={tool === "select"}
                    key={element.id}
                    {...element}
                    onDragEnd={(event) => {
                      updateDraggedElement({
                        ...element,
                        x: event.target.x(),
                        y: event.target.y(),
                      });
                    }}
                  />
                );
              }

              return (
                <Line
                  draggable={tool === "select"}
                  key={element.id}
                  lineCap="round"
                  lineJoin="round"
                  tension={0.35}
                  {...element}
                  onDragEnd={(event) => {
                    const deltaX = event.target.x();
                    const deltaY = event.target.y();
                    event.target.position({ x: 0, y: 0 });
                    updateDraggedElement(
                      translateLine(element, deltaX, deltaY),
                    );
                  }}
                />
              );
            })}
          </Layer>
        </Stage>
      ) : null}

      <div className={styles.remoteCursors}>
        {others.map(({ connectionId, presence }) => {
          if (!presence.cursor) return null;

          const cursor = worldToScreen(presence.cursor);

          return (
            <div
              className={styles.remoteCursor}
              key={connectionId}
              style={{
                transform: `translate(${cursor.x}px, ${cursor.y}px)`,
              }}
            >
              <MousePointer2 aria-hidden size={18} />
              <span>Guest {connectionId}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
