import dotenv from "dotenv";

dotenv.config();

const args = parseArgs(process.argv.slice(2));

// Configuracao unica do backend. Valores de linha de comando vencem o .env
// para permitir testes como `npm run dev -- --port 3002`.
export const config = {
  port: Number(args.port ?? process.env.PORT ?? 3001),
  portRangeSize: Number(process.env.PORT_RANGE_SIZE ?? 20),
  databaseUrl: process.env.DATABASE_URL ?? "postgres://chat:chat@localhost:5432/chatdb",
  frontendOrigins: parseList(process.env.FRONTEND_ORIGINS ?? process.env.FRONTEND_ORIGIN ?? "https://localhost:5173,http://localhost:5173"),
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "chat_session",
  cookieSecure: parseBoolean(process.env.COOKIE_SECURE ?? process.env.TLS_ENABLED ?? "false"),
  tlsEnabled: parseBoolean(process.env.TLS_ENABLED ?? "false"),
  tlsCertPath: process.env.TLS_CERT_PATH ?? null,
  tlsKeyPath: process.env.TLS_KEY_PATH ?? null,
  internalTlsRejectUnauthorized: parseBoolean(process.env.INTERNAL_TLS_REJECT_UNAUTHORIZED ?? "true"),
  zookeeperHost: process.env.ZOOKEEPER_HOST ?? "localhost:2181",
  zookeeperAuth: process.env.ZOOKEEPER_AUTH ?? null,
  zookeeperAclEnabled: parseBoolean(process.env.ZOOKEEPER_ACL_ENABLED ?? (process.env.ZOOKEEPER_AUTH ? "true" : "false")),
  nodeHost: process.env.NODE_HOST ?? "localhost",
  nodeId: args.nodeId ?? process.env.NODE_ID ?? null
};

function parseArgs(argv: string[]) {
  const parsed: { port?: string; nodeId?: string } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--port") {
      parsed.port = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--port=")) {
      parsed.port = arg.slice("--port=".length);
      continue;
    }

    if (arg === "--node-id") {
      parsed.nodeId = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--node-id=")) {
      parsed.nodeId = arg.slice("--node-id=".length);
      continue;
    }

    if (!parsed.port && /^\d+$/.test(arg)) {
      parsed.port = arg;
    }
  }

  return parsed;
}

function parseBoolean(value: string) {
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
