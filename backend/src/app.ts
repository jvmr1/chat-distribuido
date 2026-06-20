import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { config } from "./config";
import { loadSession } from "./middleware/auth";
import { authRouter } from "./routes/auth";
import { conversationsRouter } from "./routes/conversations";
import { usersRouter } from "./routes/users";
import { disconnectUserLocally, publishToAll, publishToUsers } from "./realtime/hub";
import { getZookeeperStatus } from "./zookeeper/registerNode";

export const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.frontendOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(loadSession);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/system/status", (_req, res) => {
  res.json({
    zookeeper: getZookeeperStatus()
  });
});

app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/conversations", conversationsRouter);

// Canal interno usado entre backends. Um no recebe uma mensagem HTTP normal,
// consulta o ZooKeeper e repassa o evento em tempo real para o no que tem
// o WebSocket do destinatario.
app.post("/internal/events", async (req, res) => {
  const { mode, userId, userIds, lastSeenAt, event } = req.body ?? {};

  if (mode === "broadcast") {
    publishToAll(event);
    return res.status(204).send();
  }

  if (mode === "users" && Array.isArray(userIds)) {
    publishToUsers(userIds.filter((id) => typeof id === "string"), event);
    return res.status(204).send();
  }

  if (mode === "disconnect_user" && typeof userId === "string" && typeof lastSeenAt === "string") {
    await disconnectUserLocally(userId, lastSeenAt);
    return res.status(204).send();
  }

  return res.status(400).json({ error: "INVALID_INTERNAL_EVENT" });
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "INTERNAL_ERROR" });
});
