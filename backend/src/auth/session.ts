import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool";
import { AuthenticatedUser } from "../types";

export function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

  // O cookie recebe o token original, mas o banco guarda apenas o hash.
  // Isso evita persistir o segredo reutilizavel da sessao.
  await pool.query(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, tokenHash, expiresAt]
  );

  return token;
}

export async function revokeSession(token: string) {
  await pool.query(
    "UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
    [hashSessionToken(token)]
  );
}

export async function findUserBySession(token: string): Promise<AuthenticatedUser | null> {
  const result = await pool.query(
    `
      SELECT u.id, u.username, u.display_name
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
      LIMIT 1
    `,
    [hashSessionToken(token)]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name
  };
}

export async function validateCredentials(username: string, password: string) {
  const result = await pool.query(
    "SELECT id, username, password_hash, display_name FROM users WHERE username = $1",
    [username]
  );

  const user = result.rows[0];
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;

  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name
  };
}
