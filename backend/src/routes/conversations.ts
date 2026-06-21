import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { isUserOnline, publishToUsersDistributed } from "../realtime/hub";
import { isUserOnlineInCluster } from "../zookeeper/registerNode";

export const conversationsRouter = Router();

conversationsRouter.use(requireAuth);

conversationsRouter.get("/", async (req, res) => {
  // A barra lateral mostra apenas conversas com mensagens. A conversa direta
  // recem-criada existe no banco, mas so entra no historico depois do primeiro envio.
  const result = await pool.query(
    `
      SELECT c.id, c.type, c.title, c.created_at, cm.role AS current_user_role,
        cm.cleared_at,
        cm.hidden_at,
        direct_user.id AS direct_user_id,
        direct_user.last_seen_at AS direct_user_last_seen_at,
        CASE
          WHEN c.type = 'direct' THEN direct_user.display_name
          ELSE c.title
        END AS display_title,
        last_message.body AS last_message,
        last_message.created_at AS last_message_at,
        (
          SELECT count(*)::int
          FROM messages unread_message
          WHERE unread_message.conversation_id = c.id
            AND unread_message.sender_id <> $1
            AND unread_message.created_at > COALESCE(cm.cleared_at, '-infinity'::timestamptz)
            AND unread_message.created_at > COALESCE(cr.last_read_at, '-infinity'::timestamptz)
        ) AS unread_count
      FROM conversations c
      JOIN conversation_members cm ON cm.conversation_id = c.id
      LEFT JOIN conversation_reads cr ON cr.conversation_id = c.id AND cr.user_id = $1
      LEFT JOIN LATERAL (
        SELECT other_user.id, other_user.display_name, other_user.last_seen_at
        FROM conversation_members other_member
        JOIN users other_user ON other_user.id = other_member.user_id
        WHERE other_member.conversation_id = c.id
          AND other_member.user_id <> $1
          AND other_member.removed_at IS NULL
        LIMIT 1
      ) direct_user ON c.type = 'direct'
      LEFT JOIN LATERAL (
        SELECT m.body, m.created_at
        FROM messages m
        WHERE m.conversation_id = c.id
          AND m.created_at > COALESCE(cm.cleared_at, '-infinity'::timestamptz)
        ORDER BY m.created_at DESC
        LIMIT 1
      ) last_message ON true
      WHERE cm.user_id = $1 AND cm.removed_at IS NULL
        AND (
          last_message.created_at IS NOT NULL
          OR (cm.cleared_at IS NOT NULL AND cm.hidden_at IS NULL)
        )
      ORDER BY COALESCE(last_message.created_at, cm.cleared_at, c.created_at) DESC
    `,
    [req.user!.id]
  );

  const conversations = await Promise.all(
    result.rows.map(async (conversation) => ({
      ...conversation,
      direct_user_online: conversation.direct_user_id
        ? isUserOnline(conversation.direct_user_id) || await isUserOnlineInCluster(conversation.direct_user_id)
        : null
    }))
  );

  return res.json({ conversations });
});

conversationsRouter.post("/direct", async (req, res) => {
  const { userId } = req.body ?? {};
  if (typeof userId !== "string") {
    return res.status(400).json({ error: "INVALID_BODY" });
  }

  if (userId === req.user!.id) {
    return res.status(400).json({ error: "CANNOT_START_DIRECT_WITH_SELF" });
  }

  const existing = await pool.query(
    `
      SELECT c.id
      FROM conversations c
      JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = $1 AND a.removed_at IS NULL
      JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = $2 AND b.removed_at IS NULL
      WHERE c.type = 'direct'
      LIMIT 1
    `,
    [req.user!.id, userId]
  );

  if (existing.rows[0]) {
    await pool.query(
      "UPDATE conversation_members SET hidden_at = NULL WHERE conversation_id = $1 AND user_id = $2",
      [existing.rows[0].id, req.user!.id]
    );
    return res.status(200).json({ conversationId: existing.rows[0].id });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const conversation = await client.query(
      "INSERT INTO conversations (type, created_by) VALUES ('direct', $1) RETURNING id",
      [req.user!.id]
    );
    const conversationId = conversation.rows[0].id;

    await client.query(
      `
        INSERT INTO conversation_members (conversation_id, user_id, role)
        VALUES ($1, $2, 'member'), ($1, $3, 'member')
      `,
      [conversationId, req.user!.id, userId]
    );

    await client.query("COMMIT");
    return res.status(201).json({ conversationId });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

conversationsRouter.post("/groups", async (req, res) => {
  const { title, memberIds } = req.body ?? {};
  if (typeof title !== "string" || !Array.isArray(memberIds)) {
    return res.status(400).json({ error: "INVALID_BODY" });
  }

  const uniqueMemberIds = [...new Set([req.user!.id, ...memberIds.filter((id) => typeof id === "string")])];
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const conversation = await client.query(
      "INSERT INTO conversations (type, title, created_by) VALUES ('group', $1, $2) RETURNING id",
      [title.trim(), req.user!.id]
    );
    const conversationId = conversation.rows[0].id;

    for (const memberId of uniqueMemberIds) {
      await client.query(
        "INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1, $2, $3)",
        [conversationId, memberId, memberId === req.user!.id ? "owner" : "member"]
      );
    }

    await client.query("COMMIT");
    return res.status(201).json({ conversationId });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

conversationsRouter.get("/:id/messages", async (req, res) => {
  const allowed = await ensureMember(req.params.id, req.user!.id);
  if (!allowed) return res.status(404).json({ error: "CONVERSATION_NOT_FOUND" });

  const result = await pool.query(
    `
      SELECT m.id, m.body, m.created_at, u.id AS sender_id, u.username, u.display_name
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = $2
      WHERE m.conversation_id = $1
        AND m.created_at > COALESCE(cm.cleared_at, '-infinity'::timestamptz)
      ORDER BY m.created_at ASC
      LIMIT 100
    `,
    [req.params.id, req.user!.id]
  );
  await markConversationRead(req.params.id, req.user!.id);

  return res.json({ messages: result.rows });
});

conversationsRouter.post("/:id/read", async (req, res) => {
  const allowed = await ensureMember(req.params.id, req.user!.id);
  if (!allowed) return res.status(404).json({ error: "CONVERSATION_NOT_FOUND" });

  await markConversationRead(req.params.id, req.user!.id);
  return res.status(204).send();
});

conversationsRouter.post("/:id/messages", async (req, res) => {
  const { body } = req.body ?? {};
  if (typeof body !== "string" || body.trim().length === 0) {
    return res.status(400).json({ error: "INVALID_BODY" });
  }

  const allowed = await ensureMember(req.params.id, req.user!.id);
  if (!allowed) return res.status(404).json({ error: "CONVERSATION_NOT_FOUND" });

  const message = await pool.query(
    `
      INSERT INTO messages (conversation_id, sender_id, body)
      VALUES ($1, $2, $3)
      RETURNING id, conversation_id, sender_id, body, created_at
    `,
    [req.params.id, req.user!.id, body.trim()]
  );
  const createdMessage = {
    ...message.rows[0],
    username: req.user!.username,
    display_name: req.user!.displayName
  };
  await markConversationRead(req.params.id, req.user!.id);
  await pool.query(
    "UPDATE conversation_members SET hidden_at = NULL WHERE conversation_id = $1 AND removed_at IS NULL",
    [req.params.id]
  );

  const members = await pool.query(
    "SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND removed_at IS NULL",
    [req.params.id]
  );
  // O evento e publicado para todos os membros, estejam eles no mesmo backend
  // ou em outro no descoberto pelo ZooKeeper.
  await publishToUsersDistributed(
    members.rows.map((row) => row.user_id),
    { type: "message.created", message: createdMessage }
  );

  return res.status(201).json({ message: createdMessage });
});

conversationsRouter.get("/:id/members", async (req, res) => {
  const allowed = await ensureMember(req.params.id, req.user!.id);
  if (!allowed) return res.status(404).json({ error: "CONVERSATION_NOT_FOUND" });

  const result = await pool.query(
    `
      SELECT u.id, u.username, u.display_name, u.last_seen_at, cm.role, cm.joined_at
      FROM conversation_members cm
      JOIN users u ON u.id = cm.user_id
      JOIN conversations c ON c.id = cm.conversation_id
      WHERE cm.conversation_id = $1
        AND cm.removed_at IS NULL
        AND c.type = 'group'
      ORDER BY cm.role DESC, u.display_name ASC
    `,
    [req.params.id]
  );

  const members = await Promise.all(
    result.rows.map(async (member) => ({
      ...member,
      online: isUserOnline(member.id) || await isUserOnlineInCluster(member.id)
    }))
  );

  return res.json({ members });
});

conversationsRouter.post("/:id/members", async (req, res) => {
  const { userId } = req.body ?? {};
  if (typeof userId !== "string") return res.status(400).json({ error: "INVALID_BODY" });

  const owner = await ensureOwner(req.params.id, req.user!.id);
  if (!owner) return res.status(403).json({ error: "FORBIDDEN" });

  await pool.query(
    `
      INSERT INTO conversation_members (conversation_id, user_id, role)
      VALUES ($1, $2, 'member')
      ON CONFLICT (conversation_id, user_id)
      DO UPDATE SET removed_at = NULL
    `,
    [req.params.id, userId]
  );

  const members = await activeMemberIds(req.params.id);
  await publishToUsersDistributed([...new Set([...members, userId])], {
    type: "group.members.changed",
    conversationId: req.params.id
  });

  return res.status(204).send();
});

conversationsRouter.post("/:id/members/:userId/promote", async (req, res) => {
  const owner = await ensureOwner(req.params.id, req.user!.id);
  if (!owner) return res.status(403).json({ error: "FORBIDDEN" });

  await pool.query(
    `
      UPDATE conversation_members
      SET role = 'owner'
      WHERE conversation_id = $1
        AND user_id = $2
        AND removed_at IS NULL
    `,
    [req.params.id, req.params.userId]
  );

  const members = await activeMemberIds(req.params.id);
  await publishToUsersDistributed(members, {
    type: "group.members.changed",
    conversationId: req.params.id
  });

  return res.status(204).send();
});

conversationsRouter.post("/:id/members/:userId/demote", async (req, res) => {
  const owner = await ensureOwner(req.params.id, req.user!.id);
  if (!owner) return res.status(403).json({ error: "FORBIDDEN" });
  if (req.params.userId === req.user!.id) return res.status(400).json({ error: "CANNOT_DEMOTE_SELF" });

  await pool.query(
    `
      UPDATE conversation_members
      SET role = 'member'
      WHERE conversation_id = $1
        AND user_id = $2
        AND removed_at IS NULL
    `,
    [req.params.id, req.params.userId]
  );

  const members = await activeMemberIds(req.params.id);
  await publishToUsersDistributed(members, {
    type: "group.members.changed",
    conversationId: req.params.id
  });

  return res.status(204).send();
});

conversationsRouter.post("/:id/clear", async (req, res) => {
  const allowed = await ensureMember(req.params.id, req.user!.id);
  if (!allowed) return res.status(404).json({ error: "CONVERSATION_NOT_FOUND" });

  await pool.query(
    `
      UPDATE conversation_members
      SET cleared_at = now(), hidden_at = NULL
      WHERE conversation_id = $1 AND user_id = $2 AND removed_at IS NULL
    `,
    [req.params.id, req.user!.id]
  );
  await markConversationRead(req.params.id, req.user!.id);
  await publishToUsersDistributed([req.user!.id], {
    type: "conversation.cleared",
    conversationId: req.params.id
  });

  return res.status(204).send();
});

conversationsRouter.delete("/:id/me", async (req, res) => {
  const allowed = await ensureMember(req.params.id, req.user!.id);
  if (!allowed) return res.status(404).json({ error: "CONVERSATION_NOT_FOUND" });

  await pool.query(
    `
      UPDATE conversation_members
      SET cleared_at = now(), hidden_at = now()
      WHERE conversation_id = $1 AND user_id = $2 AND removed_at IS NULL
    `,
    [req.params.id, req.user!.id]
  );
  await markConversationRead(req.params.id, req.user!.id);
  await publishToUsersDistributed([req.user!.id], {
    type: "conversation.hidden",
    conversationId: req.params.id
  });

  return res.status(204).send();
});

conversationsRouter.delete("/:id", async (req, res) => {
  const owner = await ensureOwner(req.params.id, req.user!.id);
  if (!owner) return res.status(403).json({ error: "FORBIDDEN" });

  const members = await activeMemberIds(req.params.id);
  await pool.query("DELETE FROM conversations WHERE id = $1 AND type = 'group'", [req.params.id]);
  await publishToUsersDistributed(members, { type: "conversation.deleted", conversationId: req.params.id });

  return res.status(204).send();
});

conversationsRouter.delete("/:id/members/:userId", async (req, res) => {
  const owner = await ensureOwner(req.params.id, req.user!.id);
  if (!owner) return res.status(403).json({ error: "FORBIDDEN" });
  if (req.params.userId === req.user!.id) return res.status(400).json({ error: "CANNOT_REMOVE_SELF" });

  await pool.query(
    `
      UPDATE conversation_members
      SET removed_at = now()
      WHERE conversation_id = $1 AND user_id = $2
    `,
    [req.params.id, req.params.userId]
  );

  const members = await activeMemberIds(req.params.id);
  await publishToUsersDistributed([...new Set([...members, req.params.userId])], {
    type: "group.members.changed",
    conversationId: req.params.id
  });

  return res.status(204).send();
});

async function activeMemberIds(conversationId: string) {
  const result = await pool.query(
    "SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND removed_at IS NULL",
    [conversationId]
  );

  return result.rows.map((row) => row.user_id);
}

async function markConversationRead(conversationId: string, userId: string) {
  // Guarda o ultimo instante em que o usuario abriu a conversa.
  // A contagem de nao lidas compara mensagens posteriores a esse horario.
  await pool.query(
    `
      INSERT INTO conversation_reads (conversation_id, user_id, last_read_at)
      VALUES ($1, $2, now())
      ON CONFLICT (conversation_id, user_id)
      DO UPDATE SET last_read_at = EXCLUDED.last_read_at
    `,
    [conversationId, userId]
  );
}

async function ensureMember(conversationId: string, userId: string) {
  const result = await pool.query(
    `
      SELECT 1
      FROM conversation_members
      WHERE conversation_id = $1 AND user_id = $2 AND removed_at IS NULL
    `,
    [conversationId, userId]
  );

  return (result.rowCount ?? 0) > 0;
}

async function ensureOwner(conversationId: string, userId: string) {
  const result = await pool.query(
    `
      SELECT 1
      FROM conversations c
      JOIN conversation_members cm ON cm.conversation_id = c.id
      WHERE c.id = $1
        AND c.type = 'group'
        AND cm.user_id = $2
        AND cm.role = 'owner'
        AND cm.removed_at IS NULL
    `,
    [conversationId, userId]
  );

  return (result.rowCount ?? 0) > 0;
}
