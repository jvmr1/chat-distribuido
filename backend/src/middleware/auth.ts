import { NextFunction, Request, Response } from "express";
import { config } from "../config";
import { findUserBySession } from "../auth/session";

export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[config.sessionCookieName];
  if (!token) return next();

  const user = await findUserBySession(token);
  if (user) {
    req.user = user;
    req.sessionToken = token;
  }

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "AUTH_REQUIRED" });
  }

  next();
}
