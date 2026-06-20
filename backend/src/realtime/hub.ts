import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { findUserBySession } from "../auth/session";
import { config } from "../config";
import { pool } from "../db/pool";
import {
  getClusterNodeUrls,
  getRegisteredNodeId,
  getUserPresence,
  registerUserPresence,
  unregisterUserPresence
} from "../zookeeper/registerNode";

const socketsByUser = new Map<string, Set<WebSocket>>();
const offlineInProgress = new Set<string>();
const presenceRetryTimers = new Map<string, NodeJS.Timeout>();

export function attachRealtime(server: http.Server) {
  // Cada backend guarda apenas os WebSockets conectados nele.
  // Quando o usuario esta em outro backend, o roteamento usa a presenca no ZooKeeper.
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EADDRINUSE") {
      console.error("WebSocket server error", error);
    }
  });

  wss.on("connection", async (socket, request) => {
    const cookie = request.headers.cookie ?? "";
    const token = cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${config.sessionCookieName}=`))
      ?.split("=")[1];

    if (!token) {
      socket.close(1008, "Authentication required");
      return;
    }

    const user = await findUserBySession(decodeURIComponent(token));
    if (!user) {
      socket.close(1008, "Invalid session");
      return;
    }

    const wasOffline = !socketsByUser.has(user.id);
    const userSockets = socketsByUser.get(user.id) ?? new Set<WebSocket>();
    userSockets.add(socket);
    socketsByUser.set(user.id, userSockets);

    if (wasOffline) {
      registerLocalUserOnline(user.id);
    }

    socket.on("close", () => {
      if (socketsByUser.get(user.id) !== userSockets) return;

      userSockets.delete(socket);
      if (userSockets.size === 0) {
        markUserOffline(user.id, new Date().toISOString(), { broadcast: true })
          .catch((error) => console.error("Failed to unregister user presence", error));
      }
    });
  });

  return wss;
}

export function isUserOnline(userId: string) {
  return socketsByUser.has(userId);
}

export function publishToUsers(userIds: string[], event: unknown) {
  const payload = JSON.stringify(event);

  for (const userId of userIds) {
    const sockets = socketsByUser.get(userId);
    if (!sockets) continue;

    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }
}

export function publishToAll(event: unknown) {
  const payload = JSON.stringify(event);

  for (const sockets of socketsByUser.values()) {
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }
}

export async function disconnectUserDistributed(userId: string) {
  const lastSeenAt = new Date().toISOString();
  await markUserOffline(userId, lastSeenAt, { broadcast: false });

  const localNodeId = getRegisteredNodeId();
  const nodeUrls = await getClusterNodeUrls().catch(() => new Map<string, string>());

  await Promise.all(
    [...nodeUrls.entries()]
      .filter(([nodeId]) => nodeId !== localNodeId)
      .map(([, internalUrl]) =>
        postInternalEvent(internalUrl, {
          mode: "disconnect_user",
          userId,
          lastSeenAt
        })
      )
  );

  await publishToCluster({ type: "presence.changed", userId, online: false, lastSeenAt });
}

export async function disconnectUserLocally(userId: string, lastSeenAt: string) {
  await markUserOffline(userId, lastSeenAt, { broadcast: false });
}

export async function publishToUsersDistributed(userIds: string[], event: unknown) {
  const uniqueUserIds = [...new Set(userIds)];
  publishToUsers(uniqueUserIds, event);

  const localNodeId = getRegisteredNodeId();
  const usersByRemoteUrl = new Map<string, Set<string>>();

  // Descobre em quais backends cada usuario esta conectado e agrupa por URL
  // para evitar enviar uma requisicao interna por usuario.
  for (const userId of uniqueUserIds) {
    const presenceEntries = await getUserPresence(userId).catch(() => []);

    for (const presence of presenceEntries) {
      if (presence.nodeId === localNodeId) continue;

      const users = usersByRemoteUrl.get(presence.internalUrl) ?? new Set<string>();
      users.add(userId);
      usersByRemoteUrl.set(presence.internalUrl, users);
    }
  }

  await Promise.all(
    [...usersByRemoteUrl.entries()].map(([internalUrl, users]) =>
      postInternalEvent(internalUrl, {
        mode: "users",
        userIds: [...users],
        event
      })
    )
  );
}

export async function publishToCluster(event: unknown) {
  publishToAll(event);

  const localNodeId = getRegisteredNodeId();
  const nodeUrls = await getClusterNodeUrls().catch(() => new Map<string, string>());

  // Broadcast de eventos de sistema, como mudanca de presenca, para todos os nos vivos.
  await Promise.all(
    [...nodeUrls.entries()]
      .filter(([nodeId]) => nodeId !== localNodeId)
      .map(([, internalUrl]) =>
        postInternalEvent(internalUrl, {
          mode: "broadcast",
          event
        })
      )
  );
}

async function postInternalEvent(internalUrl: string, body: unknown) {
  try {
    await fetch(`${internalUrl}/internal/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    console.warn(`Failed to route internal event to ${internalUrl}`, error);
  }
}

async function markUserOffline(userId: string, lastSeenAt: string, options: { broadcast: boolean }) {
  if (offlineInProgress.has(userId)) return;
  offlineInProgress.add(userId);

  try {
    const retryTimer = presenceRetryTimers.get(userId);
    if (retryTimer) {
      clearTimeout(retryTimer);
      presenceRetryTimers.delete(userId);
    }

    const sockets = socketsByUser.get(userId);
    socketsByUser.delete(userId);

    if (sockets) {
      for (const socket of sockets) {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close(1000, "Logged out");
        }
      }
    }

    await unregisterUserPresence(userId);
    await updateLastSeen(userId, lastSeenAt);

    if (options.broadcast) {
      await publishToCluster({ type: "presence.changed", userId, online: false, lastSeenAt });
    }
  } finally {
    offlineInProgress.delete(userId);
  }
}

function registerLocalUserOnline(userId: string) {
  const retryTimer = presenceRetryTimers.get(userId);
  if (retryTimer) clearTimeout(retryTimer);

  registerUserPresence(userId)
    .then(() => {
      presenceRetryTimers.delete(userId);
      return publishToCluster({ type: "presence.changed", userId, online: true });
    })
    .catch((error) => {
      if (!socketsByUser.has(userId)) return;

      console.error("Failed to register user presence. Retrying...", error);
      const timer = setTimeout(() => registerLocalUserOnline(userId), 1000);
      presenceRetryTimers.set(userId, timer);
    });
}

async function updateLastSeen(userId: string, lastSeenAt: string) {
  await pool.query("UPDATE users SET last_seen_at = $1 WHERE id = $2", [lastSeenAt, userId]);
}
