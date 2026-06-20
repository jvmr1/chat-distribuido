import zookeeper, { Client, ZooKeeperError } from "node-zookeeper-client";
import { config } from "../config";

type NodeData = {
  requestedNodeId: string | null;
  nodeId?: string | null;
  port: number;
  internalUrl: string;
  startedAt: string;
};

type PresenceData = {
  userId: string;
  nodeId: string;
  internalUrl: string;
  connectedAt: string;
};

let connected = false;
let registered = false;
let lastError: string | null = null;
let registeredNodeId: string | null = null;
let registeredPath: string | null = null;
let clusterNodes: string[] = [];
let leaderNodeId: string | null = null;
let isLeader = false;
let activeClient: Client | null = null;

export function registerNodeInZookeeper() {
  // Este arquivo concentra o papel do ZooKeeper no projeto:
  // 1. registrar backends vivos em /chat/nodes;
  // 2. eleger o lider pelo menor znode sequencial;
  // 3. registrar presenca de usuarios em /chat/presence.
  const client = zookeeper.createClient(config.zookeeperHost, {
    sessionTimeout: 5000
  });
  activeClient = client;

  client.once("connected", () => {
    connected = true;
    lastError = null;

    client.mkdirp("/chat/nodes", (mkdirError) => {
      if (mkdirError) {
        registered = false;
        lastError = mkdirError.message;
        console.error("ZooKeeper mkdir failed", mkdirError);
        return;
      }

      // Sem NODE_ID fixo, o ZooKeeper gera nomes sequenciais como backend-0000000001.
      // Como o znode e efemero, ele some sozinho se o processo morrer.
      const path = config.nodeId ? `/chat/nodes/${config.nodeId}` : "/chat/nodes/backend-";
      const payload = Buffer.from(
        JSON.stringify({
          requestedNodeId: config.nodeId,
          nodeId: config.nodeId,
          port: config.port,
          internalUrl: `http://localhost:${config.port}`,
          startedAt: new Date().toISOString()
        } satisfies NodeData)
      );
      const createMode = config.nodeId ? zookeeper.CreateMode.EPHEMERAL : zookeeper.CreateMode.EPHEMERAL_SEQUENTIAL;

      client.create(path, payload, createMode, (createError, createdPath) => {
        if (createError && createError.getCode() === zookeeper.Exception.NODE_EXISTS) {
          registered = false;
          registeredNodeId = null;
          registeredPath = null;
          lastError = `ZooKeeper node already exists: ${path}`;
          console.error(lastError);
          return;
        }

        if (createError && createError.getCode() !== zookeeper.Exception.NODE_EXISTS) {
          registered = false;
          registeredNodeId = null;
          registeredPath = null;
          lastError = createError.message;
          console.error("ZooKeeper node registration failed", createError);
          return;
        }

        registeredPath = createdPath ?? path;
        registeredNodeId = registeredPath.split("/").pop() ?? null;
        registered = true;
        console.log(`Registered backend node in ZooKeeper: ${registeredPath}`);
        ensureBasePaths(client);
        watchClusterNodes(client);
      });
    });
  });

  client.on("disconnected", () => {
    connected = false;
    registered = false;
    registeredNodeId = null;
    registeredPath = null;
    clusterNodes = [];
    leaderNodeId = null;
    isLeader = false;
    console.warn("ZooKeeper connection closed.");
  });

  client.connect();
  return client;
}

export function getZookeeperStatus() {
  return {
    connected,
    registered,
    nodeId: registeredNodeId,
    path: registeredPath,
    requestedNodeId: config.nodeId,
    clusterNodes,
    leaderNodeId,
    isLeader,
    host: config.zookeeperHost,
    lastError
  };
}

export function getRegisteredNodeId() {
  return registeredNodeId;
}

export function isZookeeperRegistered() {
  return Boolean(activeClient && connected && registered && registeredNodeId);
}

export async function registerUserPresence(userId: string) {
  const client = requireRegisteredClient();
  const nodeId = requireRegisteredNodeId();
  const userPresencePath = `/chat/presence/${userId}`;
  const presencePath = `${userPresencePath}/${nodeId}`;
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      nodeId,
      internalUrl: `http://localhost:${config.port}`,
      connectedAt: new Date().toISOString()
    } satisfies PresenceData)
  );

  await mkdirpAsync(client, userPresencePath);
  await removeIfExists(client, presencePath);
  // A presenca tambem e efemera: queda do backend ou perda da sessao ZK
  // remove este registro, permitindo atualizar online/offline automaticamente.
  await createAsync(client, presencePath, payload, zookeeper.CreateMode.EPHEMERAL);
}

export async function unregisterUserPresence(userId: string) {
  if (!activeClient || !registeredNodeId) return;

  await removeIfExists(activeClient, `/chat/presence/${userId}/${registeredNodeId}`);
}

export async function getUserPresence(userId: string) {
  const client = requireRegisteredClient();
  const userPresencePath = `/chat/presence/${userId}`;
  const nodeIds = await getChildrenAsync(client, userPresencePath).catch(() => []);
  const presence = await Promise.all(
    nodeIds.map(async (nodeId) => {
      const data = await getJsonData<PresenceData>(client, `${userPresencePath}/${nodeId}`).catch(() => null);
      return data;
    })
  );

  return presence.filter((item): item is PresenceData => Boolean(item));
}

export async function isUserOnlineInCluster(userId: string) {
  const presence = await getUserPresence(userId).catch(() => []);
  return presence.length > 0;
}

export async function getClusterNodeUrls() {
  const client = requireRegisteredClient();
  const nodeIds = await getChildrenAsync(client, "/chat/nodes").catch(() => []);
  const entries = await Promise.all(
    nodeIds.map(async (nodeId) => {
      const data = await getJsonData<NodeData>(client, `/chat/nodes/${nodeId}`).catch(() => null);
      return data ? [nodeId, data.internalUrl] as const : null;
    })
  );

  return new Map(entries.filter((entry): entry is readonly [string, string] => Boolean(entry)));
}

function watchClusterNodes(client: Client) {
  // Watches do ZooKeeper disparam uma vez. Por isso a callback reinstala
  // o proprio watch sempre que ha mudanca na lista de nos.
  client.getChildren(
    "/chat/nodes",
    () => {
      watchClusterNodes(client);
    },
    (error?: ZooKeeperError, children: string[] = []) => {
      if (error) {
        lastError = error.message;
        console.error("ZooKeeper node watch failed", error);
        return;
      }

      clusterNodes = [...children].sort();
      const nextLeaderNodeId = clusterNodes[0] ?? null;
      const wasLeader = isLeader;

      leaderNodeId = nextLeaderNodeId;
      isLeader = Boolean(registeredNodeId && registeredNodeId === nextLeaderNodeId);

      console.log(`ZooKeeper cluster nodes: ${clusterNodes.length > 0 ? clusterNodes.join(", ") : "(none)"}`);

      if (isLeader && !wasLeader) {
        console.log(`This backend assumed cluster leadership: ${registeredNodeId}`);
      }

      if (!isLeader && wasLeader) {
        console.log(`This backend is no longer cluster leader. Current leader: ${leaderNodeId ?? "(none)"}`);
      }
    }
  );
}

function ensureBasePaths(client: Client) {
  for (const path of ["/chat/presence", "/chat/internal"]) {
    client.mkdirp(path, (error) => {
      if (error) {
        lastError = error.message;
        console.error(`ZooKeeper mkdir failed for ${path}`, error);
      }
    });
  }
}

function requireRegisteredClient() {
  if (!activeClient || !connected || !registered) {
    throw new Error("ZOOKEEPER_NOT_REGISTERED");
  }

  return activeClient;
}

function requireRegisteredNodeId() {
  if (!registeredNodeId) {
    throw new Error("ZOOKEEPER_NODE_NOT_REGISTERED");
  }

  return registeredNodeId;
}

function mkdirpAsync(client: Client, path: string) {
  return new Promise<void>((resolve, reject) => {
    client.mkdirp(path, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function createAsync(client: Client, path: string, data: Buffer, mode: number) {
  return new Promise<string>((resolve, reject) => {
    client.create(path, data, mode, (error, createdPath) => {
      if (error) reject(error);
      else resolve(createdPath ?? path);
    });
  });
}

function getChildrenAsync(client: Client, path: string) {
  return new Promise<string[]>((resolve, reject) => {
    client.getChildren(path, (error, children = []) => {
      if (error) reject(error);
      else resolve(children);
    });
  });
}

function getJsonData<T>(client: Client, path: string) {
  return new Promise<T>((resolve, reject) => {
    client.getData(path, (error, data) => {
      if (error) {
        reject(error);
        return;
      }

      if (!data) {
        reject(new Error(`No data at ${path}`));
        return;
      }

      resolve(JSON.parse(data.toString("utf8")) as T);
    });
  });
}

function removeIfExists(client: Client, path: string) {
  return new Promise<void>((resolve, reject) => {
    client.remove(path, (error) => {
      if (!error || error.getCode?.() === zookeeper.Exception.NO_NODE) {
        resolve();
        return;
      }

      reject(error);
    });
  });
}
