const { spawn } = require("node:child_process");
const path = require("node:path");
const { certPath, ensureDevCertificate, keyPath } = require("../infra/ensure-dev-cert.cjs");

const tsxScript = path.join(__dirname, "node_modules", "tsx", "dist", "cli.cjs");
const useDevTls = process.env.DEV_TLS_ENABLED !== "false";
const useZookeeperAcl = process.env.DEV_ZOOKEEPER_ACL_ENABLED !== "false";

if (useDevTls) {
  ensureDevCertificate();
}

const child = spawn(
  process.execPath,
  [tsxScript, "watch", "src/server.ts", ...process.argv.slice(2)],
  {
    cwd: __dirname,
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      TLS_ENABLED: process.env.TLS_ENABLED ?? String(useDevTls),
      TLS_CERT_PATH: process.env.TLS_CERT_PATH ?? certPath,
      TLS_KEY_PATH: process.env.TLS_KEY_PATH ?? keyPath,
      COOKIE_SECURE: process.env.COOKIE_SECURE ?? String(useDevTls),
      INTERNAL_TLS_REJECT_UNAUTHORIZED: process.env.INTERNAL_TLS_REJECT_UNAUTHORIZED ?? "false",
      ZOOKEEPER_AUTH: process.env.ZOOKEEPER_AUTH ?? (useZookeeperAcl ? "chat:dev-secret" : ""),
      ZOOKEEPER_ACL_ENABLED: process.env.ZOOKEEPER_ACL_ENABLED ?? String(useZookeeperAcl)
    }
  }
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
