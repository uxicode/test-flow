declare module "@testflow/api" {
  export function startServer(options?: {
    port?: number;
    host?: string;
  }): Promise<void>;
}
