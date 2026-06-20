import http from "node:http";
import { app } from "./app";
import { config } from "./config";
import { attachRealtime } from "./realtime/hub";
import { registerNodeInZookeeper } from "./zookeeper/registerNode";

const server = http.createServer(app);
attachRealtime(server);

let zkClient: ReturnType<typeof registerNodeInZookeeper> | null = null;

start().catch((error) => {
  console.error(error);
  process.exit(1);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function start() {
  // Cada processo tenta abrir a primeira porta livre a partir da porta base.
  // Assim e possivel subir varios backends com o mesmo comando `npm run dev`.
  const port = await listenWithPortFallback(config.port);
  config.port = port;
  console.log(`Backend listening on http://localhost:${config.port}`);

  // O registro no ZooKeeper acontece depois do listen, porque o znode guarda
  // a URL interna real deste backend para roteamento entre os nos.
  zkClient = registerNodeInZookeeper();
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
    const handleError = (error: Error) => {
      server.off("listening", handleListening);
      reject(error);
    };

    const handleListening = () => {
      server.off("error", handleError);
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
  server.close(() => process.exit(0));
}
