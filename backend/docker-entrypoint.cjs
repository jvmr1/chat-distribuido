const net = require("node:net");
const { spawn, spawnSync } = require("node:child_process");
const { ensureDevCertificate } = require("../infra/ensure-dev-cert.cjs");

const databaseUrl = new URL(process.env.DATABASE_URL ?? "postgres://chat:chat@postgres:5432/chatdb");
const [zookeeperHost, zookeeperPort = "2181"] = (process.env.ZOOKEEPER_HOST ?? "zookeeper:2181").split(":");
const shouldRunDbSetup = process.env.RUN_DB_SETUP !== "false";
const shouldRunServer = process.env.RUN_SERVER !== "false";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  await waitForTcp(databaseUrl.hostname, Number(databaseUrl.port || 5432), "PostgreSQL");
  await waitForTcp(zookeeperHost, Number(zookeeperPort), "ZooKeeper");

  if (process.env.DEV_TLS_ENABLED !== "false" || process.env.TLS_ENABLED === "true") {
    ensureDevCertificate();
  }

  if (shouldRunDbSetup) {
    run("node", ["dist/db/migrate.js"]);
    run("node", ["dist/db/seed.js"]);
  }

  if (!shouldRunServer) return;

  const child = spawn("node", ["dist/server.js"], {
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  child.on("exit", (code) => process.exit(code ?? 0));
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function waitForTcp(host, port, label) {
  const timeoutMs = 60000;
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host, port });

      socket.once("connect", () => {
        socket.destroy();
        console.log(`${label} available at ${host}:${port}`);
        resolve();
      });

      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`${label} not available at ${host}:${port}`));
          return;
        }

        setTimeout(attempt, 1000);
      });
    };

    attempt();
  });
}
