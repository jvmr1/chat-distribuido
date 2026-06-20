declare module "node-zookeeper-client" {
  type Callback = (error?: ZooKeeperError) => void;
  type CreateCallback = (error?: ZooKeeperError, path?: string) => void;

  export type ZooKeeperError = Error & {
    getCode(): number;
  };

  export type Stat = unknown;

  export type Client = {
    once(event: "connected", listener: () => void): void;
    on(event: "connected" | "connectedReadOnly" | "disconnected" | "expired" | "authenticationFailed", listener: () => void): void;
    addAuthInfo(scheme: string, auth: Buffer): void;
    mkdirp(path: string, callback: Callback): void;
    mkdirp(path: string, acls: ACL[], callback: Callback): void;
    create(path: string, data: Buffer, mode: number, callback: CreateCallback): void;
    create(path: string, data: Buffer, acls: ACL[], mode: number, callback: CreateCallback): void;
    getChildren(path: string, watcher: (event: unknown) => void, callback: (error?: ZooKeeperError, children?: string[]) => void): void;
    getChildren(path: string, callback: (error?: ZooKeeperError, children?: string[]) => void): void;
    getData(path: string, callback: (error?: ZooKeeperError, data?: Buffer, stat?: Stat) => void): void;
    setACL(path: string, acls: ACL[], version: number, callback: Callback): void;
    remove(path: string, callback: Callback): void;
    connect(): void;
    close(): void;
  };

  export type ACL = unknown;

  const zookeeper: {
    createClient(connectionString: string, options?: { sessionTimeout?: number }): Client;
    ACL: {
      CREATOR_ALL_ACL: ACL[];
      OPEN_ACL_UNSAFE: ACL[];
    };
    CreateMode: {
      PERSISTENT: number;
      EPHEMERAL: number;
      EPHEMERAL_SEQUENTIAL: number;
    };
    Exception: {
      NODE_EXISTS: number;
      NO_NODE: number;
    };
  };

  export default zookeeper;
}
