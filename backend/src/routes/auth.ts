import bcrypt from "bcryptjs";
import { Router } from "express";
import { config } from "../config";
import { createSession, revokeSession, validateCredentials } from "../auth/session";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { disconnectUserDistributed } from "../realtime/hub";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "INVALID_BODY" });
  }

  const user = await validateCredentials(username.trim().toLowerCase(), password);
  if (!user) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  const token = await createSession(user.id);
  res.cookie(config.sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    maxAge: 1000 * 60 * 60 * 24 * 30
  });

  return res.json({ user });
});

authRouter.post("/register", async (req, res) => {
  const { username, password, displayName } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string" || typeof displayName !== "string") {
    return res.status(400).json({ error: "INVALID_BODY" });
  }

  const normalizedUsername = username.trim().toLowerCase();
  const trimmedDisplayName = displayName.trim();

  if (!/^[a-z0-9._-]{3,24}$/.test(normalizedUsername)) {
    return res.status(400).json({ error: "INVALID_USERNAME" });
  }

  if (trimmedDisplayName.length < 2) {
    return res.status(400).json({ error: "INVALID_DISPLAY_NAME" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "INVALID_PASSWORD" });
  }

  const existingUser = await pool.query("SELECT 1 FROM users WHERE username = $1", [normalizedUsername]);
  if ((existingUser.rowCount ?? 0) > 0) {
    return res.status(409).json({ error: "USERNAME_TAKEN" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    // username e unico no schema; se houver duplicidade o Postgres devolve 23505.
    const result = await pool.query(
      `
        INSERT INTO users (username, password_hash, display_name)
        VALUES ($1, $2, $3)
        RETURNING id, username, display_name
      `,
      [normalizedUsername, passwordHash, trimmedDisplayName]
    );

    const row = result.rows[0];
    const user = {
      id: row.id,
      username: row.username,
      displayName: row.display_name
    };
    const token = await createSession(user.id);

    res.cookie(config.sessionCookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.cookieSecure,
      maxAge: 1000 * 60 * 60 * 24 * 30
    });

    return res.status(201).json({ user });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      return res.status(409).json({ error: "USERNAME_TAKEN" });
    }

    throw error;
  }
});

authRouter.post("/logout", requireAuth, async (req, res) => {
  if (req.sessionToken) await revokeSession(req.sessionToken);
  await disconnectUserDistributed(req.user!.id);
  res.clearCookie(config.sessionCookieName);
  return res.status(204).send();
});

authRouter.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});
