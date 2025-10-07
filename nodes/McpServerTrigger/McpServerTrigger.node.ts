import type {
        IDataObject,
        INodeExecutionData,
        INodeType,
        INodeTypeDescription,
        ITriggerFunctions,
        ITriggerResponse,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';

interface ToolConfig {
        name: string;
        description?: string;
        inputSchema?: IDataObject;
        responseTemplate: string;
        responseType: 'text' | 'json';
}

interface PromptMessageConfig {
        role: 'system' | 'user' | 'assistant';
        content: string;
}

interface PromptConfig {
        name: string;
        description?: string;
        messages: PromptMessageConfig[];
}

interface ResourceConfig {
        name: string;
        description?: string;
        uri: string;
        mimeType: string;
        content: string;
        responseType: 'text' | 'json';
}

interface McpServerModule {
        Server: new (
                metadata: IDataObject,
                options?: IDataObject,
        ) => {
                router?: {
                        setRequestHandler: (
                                method: string,
                                handler: (request: IDataObject) => Promise<IDataObject> | IDataObject,
                        ) => void;
                };
                setRequestHandler?: (
                        method: string,
                        handler: (request: IDataObject) => Promise<IDataObject> | IDataObject,
                ) => void;
                connect: (transport: McpTransport) => Promise<void>;
                close?: () => Promise<void>;
        };
        WebSocketServerTransport: {
                create: (options: { host?: string; port: number }) => Promise<McpTransport>;
        };
}

interface McpTransport {
        close?: () => Promise<void>;
        closed?: () => Promise<void>;
}

const renderTemplate = (template: string, variables: IDataObject) =>
        template.replace(/{{\s*([\w.]+)\s*}}/g, (_, key: string) => {
                const parts = key.split('.');
                let value: unknown = variables;
                for (const part of parts) {
                        if (value === null || typeof value !== 'object') {
                                value = undefined;
                                break;
                        }
                        value = (value as IDataObject)[part];
                }

                if (value === undefined || value === null) {
                        return '';
                }

                if (typeof value === 'string') return value;

                if (typeof value === 'object') {
                        try {
                                return JSON.stringify(value);
                        } catch (error) {
                                return '';
                        }
                }

                return String(value);
        });

export class McpServerTrigger implements INodeType {
        description: INodeTypeDescription = {
                displayName: 'MCP Server Trigger',
                name: 'mcpServerTrigger',
                icon: 'file:mcp.svg',
                group: ['trigger'],
                version: 1,
                description: 'Inicia un servidor MCP basado en WebSocket',
                subtitle: 'Exponer recursos MCP',
                defaults: {
                        name: 'MCP Server',
                },
                inputs: [],
                outputs: [NodeConnectionType.Main],
                triggering: true,
                properties: [
                        {
                                displayName: 'Servidor',
                                name: 'serverOptions',
                                type: 'collection',
                                default: {},
                                placeholder: 'Opciones del servidor',
                                options: [
                                        {
                                                displayName: 'Nombre',
                                                name: 'serverName',
                                                type: 'string',
                                                default: 'n8n-mcp-server',
                                        },
                                        {
                                                displayName: 'Versión',
                                                name: 'serverVersion',
                                                type: 'string',
                                                default: '0.1.0',
                                        },
                                        {
                                                displayName: 'Host',
                                                name: 'host',
                                                type: 'string',
                                                default: '127.0.0.1',
                                        },
                                        {
                                                displayName: 'Puerto',
                                                name: 'port',
                                                type: 'number',
                                                typeOptions: {
                                                        minValue: 1,
                                                        maxValue: 65535,
                                                },
                                                default: 3001,
                                        },
                                ],
                        },
                        {
                                displayName: 'Tools',
                                name: 'tools',
                                type: 'fixedCollection',
                                typeOptions: {
                                        multipleValues: true,
                                },
                                default: {},
                                placeholder: 'Añadir tool',
                                options: [
                                        {
                                                displayName: 'Tool',
                                                name: 'tool',
                                                values: [
                                                        {
                                                                displayName: 'Descripción',
                                                                name: 'description',
                                                                type: 'string',
                                                                typeOptions: {
                                                                        rows: 3,
                                                                },
                                                                default: '',
                                                        },
                                                        {
                                                                displayName: 'Input Schema (JSON)',
                                                                name: 'inputSchema',
                                                                type: 'json',
                                                                default: '{}',
                                                                description: 'JSON Schema para validar los argumentos del tool',
                                                        },
                                                        {
                                                                displayName: 'Nombre',
                                                                name: 'name',
                                                                type: 'string',
                                                                default: '',
                                                                required: true,
                                                        },
                                                        {
                                                                displayName: 'Plantilla De Respuesta',
                                                                name: 'responseTemplate',
                                                                type: 'string',
                                                                typeOptions: {
                                                                        rows: 4,
                                                                },
                                                                default: 'Tool {{name}} ejecutado',
                                                                description:
                                                                        'Plantilla usada para responder. Puedes usar {{argumento}} para acceder a los parámetros.',
                                                        },
                                                        {
                                                                displayName: 'Tipo De Respuesta',
                                                                name: 'responseType',
                                                                type: 'options',
                                                                options: [
                                                                        {
                                                                                name: 'Texto',
                                                                                value: 'text',
                                                                        },
                                                                        {
                                                                                name: 'JSON',
                                                                                value: 'json',
                                                                        },
                                                                ],
                                                                default: 'text',
                                                        },
                                                ],
                                        },
                                ],
                        },
                        {
                                displayName: 'Prompts',
                                name: 'prompts',
                                type: 'fixedCollection',
                                typeOptions: {
                                        multipleValues: true,
                                },
                                default: {},
                                placeholder: 'Añadir prompt',
                                options: [
                                        {
                                                displayName: 'Prompt',
                                                name: 'prompt',
                                                values: [
                                                        {
                                                                displayName: 'Nombre',
                                                                name: 'name',
                                                                type: 'string',
                                                                default: '',
                                                                required: true,
                                                        },
                                                        {
                                                                displayName: 'Descripción',
                                                                name: 'description',
                                                                type: 'string',
                                                                typeOptions: {
                                                                        rows: 3,
                                                                },
                                                                default: '',
                                                        },
                                                        {
                                                                displayName: 'Mensajes',
                                                                name: 'messages',
                                                                type: 'fixedCollection',
                                                                typeOptions: {
                                                                        multipleValues: true,
                                                                },
                                                                default: {},
                                                                options: [
                                                                        {
                                                                                displayName: 'Mensaje',
                                                                                name: 'message',
                                                                                values: [
                                                                                        {
                                                                                                displayName: 'Rol',
                                                                                                name: 'role',
                                                                                                type: 'options',
                                                                                                options: [
                                                                                                        { name: 'System', value: 'system' },
                                                                                                        { name: 'User', value: 'user' },
                                                                                                        { name: 'Assistant', value: 'assistant' },
                                                                                                ],
                                                                                                default: 'system',
                                                                                        },
                                                                                        {
                                                                                                displayName: 'Contenido',
                                                                                                name: 'content',
                                                                                                type: 'string',
                                                                                                typeOptions: {
                                                                                                        rows: 4,
                                                                                                },
                                                                                                default: '',
                                                                                        },
                                                                                ],
                                                                        },
                                                                ],
                                                        },
                                                ],
                                        },
                                ],
                        },
                        {
                                displayName: 'Recursos',
                                name: 'resources',
                                type: 'fixedCollection',
                                typeOptions: {
                                        multipleValues: true,
                                },
                                default: {},
                                placeholder: 'Añadir recurso',
                                options: [
                                        {
                                                displayName: 'Recurso',
                                                name: 'resource',
                                                values: [
                                                        {
                                                                displayName: 'Contenido',
                                                                name: 'content',
                                                                type: 'string',
                                                                typeOptions: {
                                                                        rows: 4,
                                                                },
                                                                default: '',
                                                        },
                                                        {
                                                                displayName: 'Descripción',
                                                                name: 'description',
                                                                type: 'string',
                                                                typeOptions: {
                                                                        rows: 3,
                                                                },
                                                                default: '',
                                                        },
                                                        {
                                                                displayName: 'MIME Type',
                                                                name: 'mimeType',
                                                                type: 'string',
                                                                default: 'text/plain',
                                                        },
                                                        {
                                                                displayName: 'Nombre',
                                                                name: 'name',
                                                                type: 'string',
                                                                default: '',
                                                                required: true,
                                                        },
                                                        {
                                                                displayName: 'Tipo De Contenido',
                                                                name: 'responseType',
                                                                type: 'options',
                                                                options: [
                                                                        {
                                                                                name: 'Texto',
                                                                                value: 'text',
                                                                        },
                                                                        {
                                                                                name: 'JSON',
                                                                                value: 'json',
                                                                        },
                                                                ],
                                                                default: 'text',
                                                        },
                                                        {
                                                                displayName: 'URI',
                                                                name: 'uri',
                                                                type: 'string',
                                                                default: '',
                                                                required: true,
                                                        },
                                                ],
                                        },
                                ],
                        },
                ],
        };

        async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
                const serverOptions = (this.getNodeParameter('serverOptions', 0, {}) ?? {}) as IDataObject;
                const host = (serverOptions.host as string | undefined) ?? '127.0.0.1';
                const port = Number(serverOptions.port ?? 3001);
                const serverName = (serverOptions.serverName as string | undefined) ?? 'n8n-mcp-server';
                const serverVersion = (serverOptions.serverVersion as string | undefined) ?? '0.1.0';

                if (!Number.isInteger(port) || port < 1 || port > 65535) {
                        throw new NodeOperationError(this.getNode(), 'El puerto debe estar entre 1 y 65535');
                }

                const toolsParameter = (this.getNodeParameter('tools', 0, {}) ?? {}) as IDataObject;
                const toolEntries = (toolsParameter.tool as IDataObject[]) ?? [];
                const tools: ToolConfig[] = toolEntries
                        .map((tool) => {
                                const name = (tool.name as string | undefined)?.trim();
                                const responseTemplate = (tool.responseTemplate as string | undefined) ?? '';
                                const responseType = (tool.responseType as string | undefined) === 'json' ? 'json' : 'text';

                                if (!name) return null;

                                let inputSchema: IDataObject | undefined;
                                const rawSchema = tool.inputSchema;
                                if (typeof rawSchema === 'string' && rawSchema.trim() !== '') {
                                        try {
                                                inputSchema = JSON.parse(rawSchema);
                                        } catch (error) {
                                                throw new NodeOperationError(
                                                        this.getNode(),
                                                        `Parameter "Tool ${name} input schema" must be valid JSON`,
                                                        { itemIndex: 0 },
                                                );
                                        }
                                } else if (typeof rawSchema === 'object' && rawSchema !== null) {
                                        inputSchema = rawSchema as IDataObject;
                                }

                                return {
                                        name,
                                        description: (tool.description as string | undefined) ?? undefined,
                                        inputSchema,
                                        responseTemplate,
                                        responseType,
                                } satisfies ToolConfig;
                        })
                        .filter((tool): tool is ToolConfig => tool !== null);

                const promptsParameter = (this.getNodeParameter('prompts', 0, {}) ?? {}) as IDataObject;
                const promptEntries = (promptsParameter.prompt as IDataObject[]) ?? [];
                const prompts: PromptConfig[] = promptEntries
                        .map((prompt) => {
                                const name = (prompt.name as string | undefined)?.trim();
                                if (!name) return null;

                                const messagesContainer = (prompt.messages as IDataObject | undefined) ?? {};
                                const messageEntries = (messagesContainer.message as IDataObject[]) ?? [];
                                const messages: PromptMessageConfig[] = messageEntries
                                        .map((message) => {
                                                const role = (message.role as string | undefined) ?? 'system';
                                                const content = (message.content as string | undefined) ?? '';

                                                if (!content.trim()) return null;

                                                return { role: role as PromptMessageConfig['role'], content };
                                        })
                                        .filter((message): message is PromptMessageConfig => message !== null);

                                return {
                                        name,
                                        description: (prompt.description as string | undefined) ?? undefined,
                                        messages,
                                } satisfies PromptConfig;
                        })
                        .filter((prompt): prompt is PromptConfig => prompt !== null);

                const resourcesParameter = (this.getNodeParameter('resources', 0, {}) ?? {}) as IDataObject;
                const resourceEntries = (resourcesParameter.resource as IDataObject[]) ?? [];
                const resources: ResourceConfig[] = resourceEntries
                        .map((resource) => {
                                const name = (resource.name as string | undefined)?.trim();
                                const uri = (resource.uri as string | undefined)?.trim();
                                if (!name || !uri) return null;

                                const responseType = (resource.responseType as string | undefined) === 'json' ? 'json' : 'text';

                                return {
                                        name,
                                        description: (resource.description as string | undefined) ?? undefined,
                                        uri,
                                        mimeType: (resource.mimeType as string | undefined) ?? 'text/plain',
                                        content: (resource.content as string | undefined) ?? '',
                                        responseType,
                                } satisfies ResourceConfig;
                        })
                        .filter((resource): resource is ResourceConfig => resource !== null);

                const capabilities: IDataObject = {};
                if (tools.length) {
                        capabilities.tools = {};
                }
                if (prompts.length) {
                        capabilities.prompts = {};
                }
                if (resources.length) {
                        capabilities.resources = {};
                }

                let sdk: McpServerModule;
                try {
                        sdk = (await import('@modelcontextprotocol/sdk/server/index.js')) as unknown as McpServerModule;
                } catch (error) {
                        throw new NodeOperationError(
                                this.getNode(),
                                'No se pudo cargar el SDK oficial de MCP. Asegúrate de instalar "@modelcontextprotocol/sdk".',
                        );
                }

                const server = new sdk.Server(
                        {
                                name: serverName,
                                version: serverVersion,
                        },
                        { capabilities },
                );

                const toolMap = new Map<string, ToolConfig>();
                for (const tool of tools) {
                        toolMap.set(tool.name, tool);
                }

                const promptMap = new Map<string, PromptConfig>();
                for (const prompt of prompts) {
                        promptMap.set(prompt.name, prompt);
                }

                const resourceMap = new Map<string, ResourceConfig>();
                for (const resource of resources) {
                        resourceMap.set(resource.uri, resource);
                }

                const setRequestHandler = (method: string, handler: (request: IDataObject) => Promise<IDataObject> | IDataObject) => {
                        if (typeof server.setRequestHandler === 'function') {
                                server.setRequestHandler(method, handler);
                                return;
                        }

                        if (server.router && typeof server.router.setRequestHandler === 'function') {
                                server.router.setRequestHandler(method, handler);
                                return;
                        }

                        throw new NodeOperationError(
                                this.getNode(),
                                'La instancia del servidor MCP no expone un método setRequestHandler compatible',
                        );
                };

                setRequestHandler('tools/list', async () => ({
                        tools: tools.map((tool) => ({
                                name: tool.name,
                                description: tool.description,
                                input_schema: tool.inputSchema ?? { type: 'object', properties: {} },
                        })),
                }));

                setRequestHandler('tools/call', async (request) => {
                        const params = (request.params ?? {}) as IDataObject;
                        const toolName = (params.name as string | undefined) ?? '';
                        const tool = toolMap.get(toolName);
                        if (!tool) {
                                throw new NodeOperationError(this.getNode(), `Tool "${toolName}" no encontrado`);
                        }

                        const argsInput = params.arguments as IDataObject | string | undefined;
                        let args: IDataObject = {};
                        if (typeof argsInput === 'string') {
                                try {
                                        args = JSON.parse(argsInput);
                                } catch (error) {
                                        throw new NodeOperationError(this.getNode(), `Arguments inválidos para el tool ${toolName}`);
                                }
                        } else if (typeof argsInput === 'object' && argsInput !== null) {
                                args = argsInput as IDataObject;
                        }

                        const rendered = renderTemplate(tool.responseTemplate ?? '', args);
                        if (tool.responseType === 'json') {
                                let jsonContent: IDataObject;
                                try {
                                        jsonContent = JSON.parse(rendered || '{}');
                                } catch (error) {
                                        throw new NodeOperationError(
                                                this.getNode(),
                                                `La respuesta del tool ${toolName} no es un JSON válido`,
                                        );
                                }

                                return {
                                        content: [
                                                {
                                                        type: 'json',
                                                        json: jsonContent,
                                                },
                                        ],
                                } as IDataObject;
                        }

                        return {
                                content: [
                                        {
                                                type: 'text',
                                                text: rendered,
                                        },
                                ],
                        } as IDataObject;
                });

                setRequestHandler('prompts/list', async () => ({
                        prompts: prompts.map((prompt) => ({
                                name: prompt.name,
                                description: prompt.description,
                        })),
                }));

                setRequestHandler('prompts/get', async (request) => {
                        const params = (request.params ?? {}) as IDataObject;
                        const promptName = (params.name as string | undefined) ?? '';
                        const prompt = promptMap.get(promptName);
                        if (!prompt) {
                                throw new NodeOperationError(this.getNode(), `Prompt "${promptName}" no encontrado`);
                        }

                        const variablesInput = params.arguments as IDataObject | string | undefined;
                        let variables: IDataObject = {};
                        if (typeof variablesInput === 'string') {
                                try {
                                        variables = JSON.parse(variablesInput);
                                } catch (error) {
                                        throw new NodeOperationError(
                                                this.getNode(),
                                                `Los argumentos del prompt ${promptName} no son válidos`,
                                        );
                                }
                        } else if (typeof variablesInput === 'object' && variablesInput !== null) {
                                variables = variablesInput as IDataObject;
                        }

                        return {
                                prompt: {
                                        name: prompt.name,
                                        description: prompt.description,
                                        messages: prompt.messages.map((message) => ({
                                                role: message.role,
                                                content: [
                                                        {
                                                                type: 'text',
                                                                text: renderTemplate(message.content, variables),
                                                        },
                                                ],
                                        })),
                                },
                        } as IDataObject;
                });

                setRequestHandler('resources/list', async () => ({
                        resources: resources.map((resource) => ({
                                name: resource.name,
                                description: resource.description,
                                uri: resource.uri,
                                mime_type: resource.mimeType,
                        })),
                }));

                setRequestHandler('resources/read', async (request) => {
                        const params = (request.params ?? {}) as IDataObject;
                        const uri = (params.uri as string | undefined) ?? '';
                        const resource = resourceMap.get(uri);
                        if (!resource) {
                                throw new NodeOperationError(this.getNode(), `Recurso "${uri}" no encontrado`);
                        }

                        if (resource.responseType === 'json') {
                                let jsonContent: IDataObject;
                                try {
                                        jsonContent = JSON.parse(resource.content || '{}');
                                } catch (error) {
                                        throw new NodeOperationError(
                                                this.getNode(),
                                                `El contenido del recurso ${resource.name} no es un JSON válido`,
                                        );
                                }

                                return {
                                        contents: [
                                                {
                                                        type: 'json',
                                                        json: jsonContent,
                                                },
                                        ],
                                } as IDataObject;
                        }

                        return {
                                contents: [
                                        {
                                                type: 'text',
                                                text: resource.content,
                                        },
                                ],
                        } as IDataObject;
                });

                const transport = await sdk.WebSocketServerTransport.create({ host, port });
                await server.connect(transport);

                this.emit([
                        [
                                {
                                        json: {
                                                event: 'serverListening',
                                                host,
                                                port,
                                                tools: tools.length,
                                                prompts: prompts.length,
                                                resources: resources.length,
                                        },
                                } satisfies INodeExecutionData,
                        ],
                ]);

                if (typeof transport.closed === 'function') {
                        transport.closed()
                                .then(() => {
                                        this.emit([[{ json: { event: 'serverClosed' } } as INodeExecutionData]]);
                                })
                                .catch(() => {
                                        // ignore
                                });
                }

                return {
                        closeFunction: async () => {
                                if (typeof transport.close === 'function') {
                                        await transport.close();
                                }
                                if (typeof server.close === 'function') {
                                        await server.close();
                                }
                        },
                };
        }
}
