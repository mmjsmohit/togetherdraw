import express, { Request, Response } from "express";
import { prisma } from "@repo/db";
import jwt from "jsonwebtoken";
import { authMiddleware } from "./authMiddleware";

// Create a type where the express request includes userId when it has passed through authMiddleware
declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "";

const app = express();

app.use((req, res, next) => {
  const allowedOrigin = process.env.CLIENT_ORIGIN || "http://localhost:3000";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());
// Create an anonymous login endpoint
app.post("/anon-login", async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.create({
      data: {},
    });
    // Create a JWT token to be stored locally on user's device
    const token = jwt.sign(
      {
        userId: user.id,
      },
      JWT_SECRET,
    );
    res.status(201).json({
      message: "Anonymous login successful",
      user: {
        id: user.id,
        createdAt: user.createdAt,
      },
      token: token,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Create board
app.post("/boards", authMiddleware, async (req: Request, res: Response) => {
  const id = req.userId;
  const { slug } = req.body as { slug?: string };
  // Require a slug
  if (!slug?.trim()) {
    return res.status(400).json({ message: "Slug is required" });
  }
  const normalizedSlug = slug.trim();
  // Check if slug already exists
  const boardCheck = await prisma.board.findUnique({
    where: {
      slug: normalizedSlug,
    },
  });

  if (!!boardCheck) {
    return res
      .status(400)
      .json({ message: "A board with the provided slug already exists" });
  }

  try {
    const board = await prisma.$transaction(async (tx) => {
      const createdBoard = await tx.board.create({
        data: {
          slug: normalizedSlug,
          creatorId: id,
        },
      });

      await tx.boardMember.create({
        data: {
          boardId: createdBoard.id,
          userId: id,
        },
      });

      return createdBoard;
    });

    res.status(200).json({
      message: "Board created successfully!",
      board: board,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get currently active boards
app.get("/boards", authMiddleware, async (req: Request, res: Response) => {
  const boards = await prisma.board.findMany({
    where: {},
  });

  res.json({
    boards,
  });
});

// Get a board by slug
app.get(
  "/boards/:slug",
  authMiddleware,
  async (req: Request, res: Response) => {
    const { slug } = req.params as { slug: string };

    const board = await prisma.board.findUnique({
      where: {
        slug: slug,
      },
      select: {
        id: true,
        slug: true,
        creatorId: true,
        content: true,
        createdAt: true,
      },
    });

    if (!board) {
      return res.status(404).json({ message: "Board not found" });
    }

    res.status(200).json({ board });
  },
);

// Delete a board
app.delete(
  "/boards/:slug",
  authMiddleware,
  async (req: Request, res: Response) => {
    const { slug } = req.params as { slug: string };

    // Check if the user is the creator of the board
    const board = await prisma.board.findUnique({
      where: {
        slug: slug,
      },
    });
    if (!board) {
      return res.status(404).json({ message: "Board not found" });
    }
    if (board.creatorId !== req.userId) {
      return res
        .status(403)
        .json({ message: "You are not the creator of this board" });
    }

    try {
      await prisma.board.delete({
        where: {
          slug: slug,
        },
      });
      res.status(200).json({ message: "Board deleted successfully" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Internal server error" });
    }
  },
);

// Join a board
app.post(
  "/boards/:slug/join",
  authMiddleware,
  async (req: Request, res: Response) => {
    const { slug } = req.params as { slug: string };
    const { userId } = req;

    const board = await prisma.board.findUnique({
      where: {
        slug: slug,
      },
    });
    if (!board) {
      return res.status(404).json({ message: "Board not found" });
    }

    await prisma.boardMember.upsert({
      where: {
        userId_boardId: {
          boardId: board.id,
          userId: userId,
        },
      },
      update: {},
      create: {
        boardId: board.id,
        userId: userId,
      },
    });
    res.status(200).json({ message: "Joined board successfully" });
  },
);

// Save board content in DB (Save to cloud option)
app.post(
  "/boards/:slug/save",
  authMiddleware,
  async (req: Request, res: Response) => {
    const { slug } = req.params as { slug: string };
    const { content } = req.body as { content: string };
    const { userId } = req;

    if (typeof content !== "string") {
      return res.status(400).json({ message: "Content is required" });
    }

    const board = await prisma.board.findUnique({
      where: {
        slug: slug,
      },
    });
    if (!board) {
      return res.status(404).json({ message: "Board not found" });
    }

    // Check if the user is the member of the board
    const boardMembers = await prisma.boardMember.findFirst({
      where: {
        userId: userId,
        boardId: board.id,
      },
    });
    if (!boardMembers) {
      return res.status(403).json({
        message: "You are not a member of this board",
      });
    }
    await prisma.board.update({
      where: {
        slug: slug,
      },
      data: {
        content: content,
      },
    });
    res.status(200).json({ message: "Board saved successfully" });
  },
);

// Upload an image and get the S3 URL

app.listen(4000, (port) => {
  console.log("Server is running on port 4000");
});
