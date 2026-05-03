import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : authorization;
  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === "string") {
      return res.status(401).json({ message: "Invalid token" });
    }
    const userId = (decoded as JwtPayload).userId ?? (decoded as JwtPayload).id;
    if (typeof userId !== "string") {
      return res.status(401).json({ message: "Invalid token" });
    }
    req.userId = userId;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}
