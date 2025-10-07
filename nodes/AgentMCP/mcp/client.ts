import { Client } from '@modelcontextprotocol/sdk/client';
import { WebSocketTransport } from '@modelcontextprotocol/sdk/client/ws';

export interface MCPClient {
        connect(): Promise<void>;
        listTools(): Promise<any[]>;
        listPrompts(): Promise<any[]>;
        listResources(): Promise<any[]>;
        callTool(name: string, args: unknown): Promise<any>;
        getPrompt(name: string): Promise<any>;
        readResource(uri: string): Promise<Array<{ mimeType?: string; text?: string; json?: unknown }>>;
}

export async function createMCPClient(serverUrl: string): Promise<MCPClient> {
        const transport = new WebSocketTransport(serverUrl);
        const client = new Client({ transport });

        await client.connect();

        return {
                async connect(): Promise<void> {
                        // Already connected by the time the wrapper is resolved.
                },
                async listTools(): Promise<any[]> {
                        const response = await client.tools.list();
                        return response.tools ?? response;
                },
                async listPrompts(): Promise<any[]> {
                        const response = await client.prompts.list();
                        return response.prompts ?? response;
                },
                async listResources(): Promise<any[]> {
                        const response = await client.resources.list();
                        return response.resources ?? response;
                },
                async callTool(name: string, args: unknown): Promise<any> {
                        return client.tools.call(name, args);
                },
                async getPrompt(name: string): Promise<any> {
                        return client.prompts.get(name);
                },
                async readResource(uri: string): Promise<Array<{ mimeType?: string; text?: string; json?: unknown }>> {
                        const response = await client.resources.read(uri);
                        const contents = response.contents ?? [];

                        return contents.map((content: any) => ({
                                mimeType: content.mimeType,
                                text: content.text,
                                json: content.json,
                        }));
                },
        };
}
