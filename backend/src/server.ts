import http from "node:http";
import https from "node:https";
import fs from "node:fs/promises";
import { app } from "./app";
import { config } from "./config";
import { attachRealtime } from "./realtime/hub";
import { registerNodeInZookeeper } from "./zookeeper/registerNode";

let server: http.Server | https.Server | null = null;

let zkClient: ReturnType<typeof registerNodeInZookeeper> | null = null;

start().catch((error) => {
  console.error(error);
  process.exit(1);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function start() {
  server = await createServer();
  attachRealtime(server);

  // Cada processo tenta abrir a primeira porta livre a partir da porta base.
  // Assim e possivel subir varios backends com o mesmo comando `npm run dev`.
  const port = await listenWithPortFallback(config.port);
  config.port = port;
  const protocol = config.tlsEnabled ? "https" : "http";
  console.log(`Backend listening on ${protocol}://localhost:${config.port}`);

  // O registro no ZooKeeper acontece depois do listen, porque o znode guarda
  // a URL interna real deste backend para roteamento entre os nos.
  zkClient = registerNodeInZookeeper();
}

async function createServer() {
  if (!config.tlsEnabled) {
    return http.createServer(app);
  }

  if (!config.tlsCertPath || !config.tlsKeyPath) {
    throw new Error("TLS_ENABLED requires TLS_CERT_PATH and TLS_KEY_PATH.");
  }

  const [cert, key] = await Promise.all([
    fs.readFile(config.tlsCertPath),
    fs.readFile(config.tlsKeyPath)
  ]);

  return https.createServer({ cert, key }, app);
}

async function listenWithPortFallback(startPort: number) {
  const maxPort = startPort + config.portRangeSize - 1;

  for (let port = startPort; port <= maxPort; port += 1) {
    try {
      await listenOnPort(port);
      return port;
    } catch (error) {
      if (isAddressInUse(error)) {
        console.warn(`Port ${port} already in use. Trying ${port + 1}...`);
        continue;
      }

      throw error;
    }
  }

  throw new Error(`No available backend port in range ${startPort}-${maxPort}`);
}

function listenOnPort(port: number) {
  return new Promise<void>((resolve, reject) => {
    if (!server) {
      reject(new Error("SERVER_NOT_CREATED"));
      return;
    }

    const handleError = (error: Error) => {
      server?.off("listening", handleListening);
      reject(error);
    };

    const handleListening = () => {
      server?.off("error", handleError);
      resolve();
    };

    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(port);
  });
}

function isAddressInUse(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EADDRINUSE";
}

function shutdown() {
  zkClient?.close();
  server?.close(() => process.exit(0));
}
