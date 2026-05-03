import express, { type Express } from "express";
import { prisma } from "@repo/db";
import { error } from "node:console";
const app = express();

app.post("/anon-login", async (req, res) => {
  try {
    const user = await prisma.user.create({
      data: {},
    });
    res.status(201).json({
      message: "Anonymous login successful",
      user: {
        id: user.id,
        createdAt: user.createdAt,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.listen(4000, (port) => {
  console.log("Server is running on port 4000");
});
