import { WebSocket, WebSocketServer } from "ws";
import jwt, { JwtPayload } from "jsonwebtoken";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
config({
  path: fileURLToPath(new URL("../../http-backend/.env", import.meta.url)),
  quiet: true,
});
config({
  path: fileURLToPath(
    new URL("../../../packages/database/.env", import.meta.url),
  ),
  quiet: true,
});

const { prisma } = await import("@repo/db");

const wss = new WebSocketServer({
  port: 4001,
});

const boards = new Map<string, Map<WebSocket, string>>();

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for the WebSocket backend`);
  }
  return value;
}

const JWT_SECRET = requireEnv("JWT_SECRET");

// Check the user token and obtain their userId from the token
function verifyToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === "string") return null;
    const userId = (decoded as JwtPayload).userId ?? (decoded as JwtPayload).id;
    return typeof userId === "string" ? userId : null;
  } catch {
    return null;
  }
}

function removeFromBoard(ws: WebSocket, boardId: string) {
  const connections = boards.get(boardId);
  if (!connections) return;

  connections.delete(ws);
  if (connections.size === 0) {
    boards.delete(boardId);
    return;
  }

  broadcastPresence(boardId);
}

function broadcastPresence(boardId: string) {
  const connections = boards.get(boardId);
  if (!connections) return;

  const members = Array.from(new Set(connections.values())).map((memberId) => ({
    userId: memberId,
  }));
  const payload = JSON.stringify({
    type: "presence",
    boardId,
    members,
  });

  for (const client of connections.keys()) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

wss.on("connection", function connection(ws, request) {
  // Obtain the token from request url and pass to verifyToken
  const url = new URL(request.url || "/", "ws://localhost");
  const token = url.searchParams.get("token");
  const userId = token ? verifyToken(token) : null;
  if (!userId) {
    ws.close();
    return;
  }

  let currentBoardId: string | null = null;

  ws.on("message", async (data) => {
    let message: {
      type?: string;
      boardId?: string;
      event?: unknown;
    };

    try {
      // Convert the data into JSON and process it
      message = JSON.parse(data.toString());
    } catch {
      ws.close();
      return;
    }

    // Check if the request has type of join-room
    if (message.type === "join-room") {
      const boardId = message.boardId;
      if (!boardId) {
        ws.close();
        return;
      }
      // Check if the user has been added to the room by HTTP Backend
      const board = await prisma.board.findUnique({
        where: { id: boardId },
        include: { members: true },
      });
      if (!board || !board.members.some((member) => member.userId === userId)) {
        ws.close();
        return;
      }
      if (currentBoardId && currentBoardId !== boardId) {
        removeFromBoard(ws, currentBoardId);
      }
      // Add this connection to the board
      if (!boards.has(boardId)) {
        boards.set(boardId, new Map());
      }
      boards.get(boardId)!.set(ws, userId);
      currentBoardId = boardId;
      broadcastPresence(boardId);
    } else if (message.type === "leave-board") {
      // Remove this connection from the in-memory room
      const boardId = message.boardId;
      if (boardId) {
        removeFromBoard(ws, boardId);
      }
      currentBoardId = null;
      return;
    } else if (message.type === "draw-event") {
      // Relay the event to all users connected to the same board
      const boardId = message.boardId;
      if (!boardId || currentBoardId !== boardId) return;
      const connections = boards.get(boardId);
      if (connections) {
        const payload = JSON.stringify(message);
        for (const client of connections.keys()) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        }
      }
    }
  });

  ws.on("close", () => {
    // Clean up: remove this connection from its room on disconnect
    if (currentBoardId) {
      removeFromBoard(ws, currentBoardId);
    }
  });
});
