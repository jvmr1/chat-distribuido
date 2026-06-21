const net = require("node:net");
const { spawn, spawnSync } = require("node:child_process");

const databaseUrl = new URL(process.env.DATABASE_URL ?? "postgres://chat:chat@postgres:5432/chatdb");
const [zookeeperHost, zookeeperPort = "2181"] = (process.env.ZOOKEEPER_HOST ?? "zookeeper:2181").split(":");

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  await waitForTcp(databaseUrl.hostname, Number(databaseUrl.port || 5432), "PostgreSQL");
  await waitForTcp(zookeeperHost, Number(zookeeperPort), "ZooKeeper");

  run("npm", ["run", "db:migrate"]);
  run("npm", ["run", "db:seed"]);

  const child = spawn("npm", ["run", "dev"], {
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
