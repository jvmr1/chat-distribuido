const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { certPath, ensureDevCertificate, keyPath } = require("../infra/ensure-dev-cert.cjs");

const rootDir = path.resolve(__dirname, "..");
const gatewayScript = path.join(rootDir, "infra", "dev-load-balancer.js");
const useDevTls = process.env.DEV_TLS_ENABLED !== "false";
const gatewayArgs = [gatewayScript, "--port", "3000"];
const gatewayCertPath = process.env.GATEWAY_TLS_CERT_PATH ?? (useDevTls ? certPath : "");
const gatewayKeyPath = process.env.GATEWAY_TLS_KEY_PATH ?? (useDevTls ? keyPath : "");
const apiUrl = process.env.VITE_API_URL ?? (gatewayCertPath && gatewayKeyPath
  ? "https://localhost:3000"
  : "http://localhost:3000");

if (useDevTls) {
  ensureDevCertificate();
}

if (gatewayCertPath && gatewayKeyPath) {
  gatewayArgs.push("--tls-cert", gatewayCertPath, "--tls-key", gatewayKeyPath);
}

if (process.env.GATEWAY_TARGETS) {
  gatewayArgs.push("--targets", process.env.GATEWAY_TARGETS);
}

gatewayArgs.push("--target-protocol", process.env.GATEWAY_TARGET_PROTOCOL ?? (useDevTls ? "https" : "http"));

gatewayArgs.push("--target-reject-unauthorized", process.env.GATEWAY_TARGET_REJECT_UNAUTHORIZED ?? (useDevTls ? "false" : "true"));

// Um unico `npm run dev` no frontend sobe tambem o gateway local.
// O navegador aponta para localhost:3000 e o gateway encaminha para backends vivos.
const gateway = spawn(process.execPath, gatewayArgs, {
  cwd: rootDir,
  stdio: "inherit",
  shell: false
});

let shuttingDown = false;
let viteServer = null;

gateway.on("exit", (code) => {
  if (!shuttingDown && code !== 0) {
    console.error(`Gateway exited with code ${code}`);
    shutdown(code ?? 1);
  }
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

startVite().catch((error) => {
  console.error(error);
  shutdown(1);
});

async function startVite() {
  process.env.VITE_API_URL = apiUrl;

  const [{ createServer }, react] = await Promise.all([
    import("vite"),
    import("@vitejs/plugin-react")
  ]);

  viteServer = await createServer({
    root: __dirname,
    configFile: false,
    plugins: [react.default()],
    server: {
      host: process.env.VITE_HOST ?? "localhost",
      port: Number(process.env.VITE_PORT ?? 5173),
      https: useDevTls
        ? {
            cert: fs.readFileSync(certPath),
            key: fs.readFileSync(keyPath)
          }
        : undefined
    }
  });

  await viteServer.listen();
  viteServer.printUrls();
}

async function shutdown(code) {
  shuttingDown = true;
  gateway.kill();
  if (viteServer) {
    await viteServer.close();
  }
  process.exit(code);
}
