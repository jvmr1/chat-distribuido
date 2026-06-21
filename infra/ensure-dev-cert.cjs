const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const certPath = path.join(__dirname, "certs", "localhost-cert.pem");
const keyPath = path.join(__dirname, "certs", "localhost-key.pem");

function ensureDevCertificate() {
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) return;

  fs.mkdirSync(path.dirname(certPath), { recursive: true });

  if (hasCommand("mkcert")) {
    run("mkcert", [
      "-cert-file", certPath,
      "-key-file", keyPath,
      "localhost", "127.0.0.1", "::1"
    ]);
    return;
  }

  if (hasCommand("openssl")) {
    const configPath = path.join(path.dirname(certPath), "localhost-openssl.cnf");
    fs.writeFileSync(configPath, opensslConfig(), "utf8");
    run("openssl", [
      "req", "-x509", "-newkey", "rsa:2048",
      "-keyout", keyPath, "-out", certPath,
      "-sha256", "-days", "365", "-nodes",
      "-subj", "/CN=localhost",
      "-extensions", "v3_req",
      "-config", configPath
    ]);
    fs.rmSync(configPath, { force: true });
    return;
  }

  if (process.platform === "win32") {
    run("powershell.exe", [
      "-ExecutionPolicy", "Bypass",
      "-File", path.join(__dirname, "create-dev-cert.ps1")
    ]);
    return;
  }

  throw new Error("Nao foi possivel gerar certificado local. Instale mkcert ou openssl.");
}

function hasCommand(command) {
  const finder = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(finder, [command], { stdio: "ignore" });
  return result.status === 0;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false
  });

  if (result.status !== 0) {
    if (result.error) console.error(result.error);
    process.exit(result.status ?? 1);
  }
}

function opensslConfig() {
  return [
    "[req]",
    "distinguished_name=req_distinguished_name",
    "x509_extensions=v3_req",
    "prompt=no",
    "",
    "[req_distinguished_name]",
    "CN=localhost",
    "",
    "[v3_req]",
    "keyUsage=keyEncipherment,digitalSignature",
    "extendedKeyUsage=serverAuth",
    "subjectAltName=@alt_names",
    "",
    "[alt_names]",
    "DNS.1=localhost",
    "IP.1=127.0.0.1",
    "IP.2=::1",
    ""
  ].join("\n");
}

if (require.main === module) {
  ensureDevCertificate();
}

module.exports = { ensureDevCertificate, certPath, keyPath };
