const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const gatewayScript = path.join(rootDir, "infra", "dev-load-balancer.js");
const certPath = path.join(rootDir, "infra", "certs", "localhost-cert.pem");
const keyPath = path.join(rootDir, "infra", "certs", "localhost-key.pem");
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
      host: "localhost",
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

function ensureDevCertificate() {
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) return;

  const certsDir = path.dirname(certPath);
  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }

  if (process.platform === "win32") {
    const script = path.join(rootDir, "infra", "create-dev-cert.ps1");
    const result = spawnSync(
      "powershell.exe",
      ["-ExecutionPolicy", "Bypass", "-File", script],
      {
        cwd: rootDir,
        stdio: "inherit",
        shell: false
      }
    );

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  } else {
    const result = spawnSync(
      "openssl",
      [
        "req", "-x509", "-newkey", "rsa:2048",
        "-keyout", keyPath, "-out", certPath,
        "-sha256", "-days", "365", "-nodes",
        "-subj", "/CN=localhost"
      ],
      {
        cwd: rootDir,
        stdio: "inherit",
        shell: false
      }
    );

    if (result.status !== 0) {
      console.error("Erro ao gerar certificado autoassinado com OpenSSL.");
      if (result.error) console.error(result.error);
      process.exit(result.status ?? 1);
    }
  }
}
