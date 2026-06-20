import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { isUserOnline } from "../realtime/hub";
import { isUserOnlineInCluster } from "../zookeeper/registerNode";

export const usersRouter = Router();

usersRouter.get("/", requireAuth, async (req, res) => {
  const result = await pool.query(
    `
      SELECT id, username, display_name, last_seen_at
      FROM users
      WHERE id <> $1
      ORDER BY username ASC
    `,
    [req.user!.id]
  );

  const users = await Promise.all(
    result.rows.map(async (user) => ({
      ...user,
      online: isUserOnline(user.id) || await isUserOnlineInCluster(user.id)
    }))
  );

  return res.json({ users });
});
