declare module '@modelcontextprotocol/sdk/client/index.js' {
        export class Client {
                constructor(options?: Record<string, any>);
                connect(transport: any): Promise<void>;
                close?(): Promise<void>;
                request?(method: string, params?: Record<string, any>): Promise<Record<string, any>>;
                sendRequest?(method: string, params?: Record<string, any>): Promise<Record<string, any>>;
        }

        export class WebSocketClientTransport {
                static create(options: { url: string }): Promise<any>;
        }
}
