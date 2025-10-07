declare module '@modelcontextprotocol/sdk/server/index.js' {
        export class Server {
                constructor(metadata: Record<string, any>, options?: Record<string, any>);
                router?: {
                        setRequestHandler: (
                                method: string,
                                handler: (request: Record<string, any>) => Promise<Record<string, any>> | Record<string, any>,
                        ) => void;
                };
                setRequestHandler?: (
                        method: string,
                        handler: (request: Record<string, any>) => Promise<Record<string, any>> | Record<string, any>,
                ) => void;
                connect(transport: any): Promise<void>;
                close?(): Promise<void>;
        }

        export class WebSocketServerTransport {
                static create(options: { host?: string; port: number }): Promise<any>;
        }
}
