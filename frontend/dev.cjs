const { spawn } = require("node:child_process");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const gatewayScript = path.join(rootDir, "infra", "dev-load-balancer.js");
const viteScript = path.join(__dirname, "node_modules", "vite", "bin", "vite.js");

// Um unico `npm run dev` no frontend sobe tambem o gateway local.
// O navegador aponta para localhost:3000 e o gateway encaminha para backends vivos.
const gateway = spawn(process.execPath, [gatewayScript, "--port", "3000"], {
  cwd: rootDir,
  stdio: "inherit",
  shell: false
});

const vite = spawn(process.execPath, [viteScript], {
  cwd: __dirname,
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    VITE_API_URL: process.env.VITE_API_URL ?? "http://localhost:3000"
  }
});

let shuttingDown = false;

gateway.on("exit", (code) => {
  if (!shuttingDown && code !== 0) {
    console.error(`Gateway exited with code ${code}`);
    shutdown(code ?? 1);
  }
});

vite.on("exit", (code) => {
  if (!shuttingDown) {
    shutdown(code ?? 0);
  }
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function shutdown(code) {
  shuttingDown = true;
  gateway.kill();
  vite.kill();
  process.exit(code);
}
