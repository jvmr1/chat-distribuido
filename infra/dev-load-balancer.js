const http = require("node:http");
const net = require("node:net");

// Gateway simples para desenvolvimento local. Ele mantem uma porta fixa para
// o frontend e distribui HTTP/WebSocket entre backends que responderem /health.
const listenPort = Number(readArg("--port") ?? 3000);
const targets = readTargets();

let nextTargetIndex = 0;

if (targets.length === 0) {
  console.error("No targets configured. Use --targets localhost:3001,localhost:3002");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  proxyHttp(req, res);
});

server.on("upgrade", (req, socket, head) => {
  proxyWebSocket(req, socket, head);
});

server.listen(listenPort, () => {
  console.log(`Dev load balancer listening on http://localhost:${listenPort}`);
  console.log(`Targets: ${targets.map((target) => `${target.host}:${target.port}`).join(", ")}`);
});

setInterval(checkTargets, 3000);
checkTargets();

function proxyHttp(req, res) {
  const target = pickHealthyTarget();

  if (!target) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "NO_BACKEND_AVAILABLE" }));
    return;
  }

  const proxyReq = http.request(
    {
      host: target.host,
      port: target.port,
      method: req.method,
      path: req.url,
      headers: {
        ...req.headers,
        host: `${target.host}:${target.port}`
      }
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", () => {
    target.healthy = false;
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "BACKEND_UNAVAILABLE" }));
  });

  req.pipe(proxyReq);
}

function proxyWebSocket(req, socket, head) {
  const target = pickHealthyTarget();

  if (!target) {
    socket.destroy();
    return;
  }

  const backendSocket = net.connect(target.port, target.host, () => {
    backendSocket.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);

    for (const [name, value] of Object.entries(req.headers)) {
      backendSocket.write(`${name}: ${value}\r\n`);
    }

    backendSocket.write("\r\n");
    if (head.length > 0) backendSocket.write(head);
    socket.pipe(backendSocket).pipe(socket);
  });

  backendSocket.on("error", () => {
    target.healthy = false;
    socket.destroy();
  });
}

function pickHealthyTarget() {
  const healthyTargets = targets.filter((target) => target.healthy);
  if (healthyTargets.length === 0) return null;

  // Round-robin entre os alvos saudaveis para demonstrar distribuicao.
  const target = healthyTargets[nextTargetIndex % healthyTargets.length];
  nextTargetIndex += 1;
  return target;
}

function checkTargets() {
  for (const target of targets) {
    const req = http.request(
      {
        host: target.host,
        port: target.port,
        path: "/health",
        method: "GET",
        timeout: 1000
      },
      (res) => {
        target.healthy = (res.statusCode ?? 500) < 500;
        res.resume();
      }
    );

    req.on("timeout", () => {
      target.healthy = false;
      req.destroy();
    });

    req.on("error", () => {
      target.healthy = false;
    });

    req.end();
  }
}

function readArg(name) {
  const arg = process.argv.find((item) => item === name || item.startsWith(`${name}=`));
  if (!arg) return null;
  if (arg.includes("=")) return arg.slice(name.length + 1);
  return process.argv[process.argv.indexOf(arg) + 1] ?? null;
}

function readTargets() {
  const explicitTargets = readArg("--targets");
  if (explicitTargets) {
    return explicitTargets
      .split(",")
      .map((target) => {
        const [host, port] = target.trim().split(":");
        return { host, port: Number(port), healthy: false };
      })
      .filter((target) => target.host && target.port);
  }

  const host = readArg("--target-host") ?? "localhost";
  const startPort = Number(readArg("--target-start") ?? 3001);
  const endPort = Number(readArg("--target-end") ?? 3020);
  const generatedTargets = [];

  for (let port = startPort; port <= endPort; port += 1) {
    generatedTargets.push({ host, port, healthy: false });
  }

  return generatedTargets;
}
