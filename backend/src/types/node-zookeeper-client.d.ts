declare module "node-zookeeper-client" {
  type Callback = (error?: ZooKeeperError) => void;
  type CreateCallback = (error?: ZooKeeperError, path?: string) => void;

  export type ZooKeeperError = Error & {
    getCode(): number;
  };

  export type Stat = unknown;

  export type Client = {
    once(event: "connected", listener: () => void): void;
    on(event: "disconnected", listener: () => void): void;
    mkdirp(path: string, callback: Callback): void;
    create(path: string, data: Buffer, mode: number, callback: CreateCallback): void;
    getChildren(path: string, watcher: (event: unknown) => void, callback: (error?: ZooKeeperError, children?: string[]) => void): void;
    getChildren(path: string, callback: (error?: ZooKeeperError, children?: string[]) => void): void;
    getData(path: string, callback: (error?: ZooKeeperError, data?: Buffer, stat?: Stat) => void): void;
    remove(path: string, callback: Callback): void;
    connect(): void;
    close(): void;
  };

  const zookeeper: {
    createClient(connectionString: string, options?: { sessionTimeout?: number }): Client;
    CreateMode: {
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
