import type {
        IDataObject,
        IExecuteFunctions,
        INodeExecutionData,
        INodeType,
        INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

interface McpClientModule {
        Client: new (options?: IDataObject) => {
                connect: (transport: McpTransport) => Promise<void>;
                close?: () => Promise<void>;
                request?: (method: string, params?: IDataObject) => Promise<IDataObject>;
                sendRequest?: (method: string, params?: IDataObject) => Promise<IDataObject>;
        };
        WebSocketClientTransport: {
                create: (options: { url: string }) => Promise<McpTransport>;
        };
}

interface McpTransport {
        close?: () => Promise<void>;
}

const ensureUrl = (url: string): string => {
        if (!/^wss?:\/\//i.test(url)) {
                return `ws://${url}`;
        }
        return url;
};

type NormalizedJson = IDataObject | NormalizedJson[] | string | number | boolean | null;

const normalizeJson = (value: unknown): NormalizedJson => {
        if (value === null) return null;
        if (Array.isArray(value)) {
                return value.map((entry) => normalizeJson(entry));
        }
        if (typeof value === 'object') {
                const result: IDataObject = {};
                for (const [key, entry] of Object.entries(value as IDataObject)) {
                        result[key] = normalizeJson(entry);
                }
                return result;
        }
        return value as string | number | boolean;
};

export class McpClient implements INodeType {
        description: INodeTypeDescription = {
                displayName: 'MCP Client',
                name: 'mcpClient',
                icon: 'file:mcp.svg',
                group: ['transform'],
                version: 1,
                description: 'Interactúa con un servidor MCP utilizando el SDK oficial',
                defaults: {
                        name: 'MCP Client',
                },
                inputs: ['main'],
                outputs: ['main'],
                properties: [
                        {
                                displayName: 'Conexión',
                                name: 'connection',
                                type: 'collection',
                                default: {},
                                options: [
                                        {
                                                displayName: 'URL',
                                                name: 'url',
                                                type: 'string',
                                                default: 'ws://127.0.0.1:3001',
                                                placeholder: 'ws://127.0.0.1:3001',
                                        },
                                ],
                        },
                        {
                                displayName: 'Operación',
                                name: 'operation',
                                type: 'options',
                                noDataExpression: true,
                                options: [
                                        {
                                                name: 'Leer Recurso',
                                                value: 'readResource',
                                                action: 'Lee un recurso remoto',
                                                description: 'Lee un recurso remoto',
                                        },
                                        {
                                                name: 'Listar ARDF',
                                                value: 'listArdf',
                                                action: 'Lista descriptores ARDF disponibles',
                                                description:
                                                        'Recupera el índice ARDF usando el tool ardf.list o leyendo el recurso ardf://index',
                                        },
                                        {
                                                name: 'Listar Prompts',
                                                value: 'listPrompts',
                                                action: 'Obtiene la lista de prompts disponibles',
                                                description: 'Obtiene la lista de prompts disponibles',
                                        },
                                        {
                                                name: 'Listar Recursos',
                                                value: 'listResources',
                                                action: 'Obtiene la lista de recursos disponibles',
                                                description: 'Obtiene la lista de recursos disponibles',
                                        },
                                        {
                                                name: 'Listar Tools',
                                                value: 'listTools',
                                                action: 'Obtiene la lista de tools disponibles',
                                                description: 'Obtiene la lista de tools disponibles',
                                        },
                                        {
                                                name: 'Llamar Tool',
                                                value: 'callTool',
                                                action: 'Ejecuta un tool remoto',
                                                description: 'Ejecuta un tool remoto',
                                        },
                                        {
                                                name: 'Obtener Prompt',
                                                value: 'getPrompt',
                                                action: 'Recupera un prompt e interpola variables',
                                                description: 'Recupera un prompt e interpola variables',
                                        },
                                ],
                                default: 'listTools',
                        },
                        {
                                displayName: 'Nombre Del Tool',
                                name: 'toolName',
                                type: 'string',
                                default: '',
                                required: true,
                                displayOptions: {
                                        show: {
                                                operation: ['callTool'],
                                        },
                                },
                        },
                        {
                                displayName: 'Argumentos (JSON)',
                                name: 'toolArguments',
                                type: 'json',
                                default: '{}',
                                description: 'Argumentos a enviar al tool MCP como objeto JSON',
                                displayOptions: {
                                        show: {
                                                operation: ['callTool'],
                                        },
                                },
                        },
                        {
                                displayName: 'Nombre Del Prompt',
                                name: 'promptName',
                                type: 'string',
                                default: '',
                                required: true,
                                displayOptions: {
                                        show: {
                                                operation: ['getPrompt'],
                                        },
                                },
                        },
                        {
                                displayName: 'Variables (JSON)',
                                name: 'promptVariables',
                                type: 'json',
                                default: '{}',
                                description: 'Variables a interpolar en el prompt',
                                displayOptions: {
                                        show: {
                                                operation: ['getPrompt'],
                                        },
                                },
                        },
                        {
                                displayName: 'URI Del Recurso',
                                name: 'resourceUri',
                                type: 'string',
                                default: '',
                                required: true,
                                displayOptions: {
                                        show: {
                                                operation: ['readResource'],
                                        },
                                },
                        },
                        {
                                displayName: 'Tipo (ARDF)',
                                name: 'ardfType',
                                type: 'string',
                                default: '',
                                displayOptions: {
                                        show: {
                                                operation: ['listArdf'],
                                        },
                                },
                        },
                        {
                                displayName: 'Tags (ARDF)',
                                name: 'ardfTags',
                                type: 'string',
                                default: '',
                                description: 'Separadas por coma',
                                displayOptions: {
                                        show: {
                                                operation: ['listArdf'],
                                        },
                                },
                        },
                        {
                                displayName: 'Dominio (ARDF)',
                                name: 'ardfDomain',
                                type: 'string',
                                default: '',
                                displayOptions: {
                                        show: {
                                                operation: ['listArdf'],
                                        },
                                },
                        },
                        {
                                displayName: 'URI Del Índice ARDF',
                                name: 'ardfIndexUri',
                                type: 'string',
                                default: 'ardf://index',
                                displayOptions: {
                                        show: {
                                                operation: ['listArdf'],
                                        },
                                },
                        },
                ],
        };

        async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
                const items = this.getInputData();

                const urlParam = this.getNodeParameter('connection.url', 0, 'ws://127.0.0.1:3001') as string;
                const url = ensureUrl(urlParam.trim() || 'ws://127.0.0.1:3001');

                let sdk: McpClientModule;
                try {
                        sdk = (await import('@modelcontextprotocol/sdk/client/index.js')) as unknown as McpClientModule;
                } catch (error) {
                        throw new NodeOperationError(
                                this.getNode(),
                                'No se pudo cargar el SDK oficial de MCP. Asegúrate de instalar "@modelcontextprotocol/sdk".',
                        );
                }

                const client = new sdk.Client();
                const transport = await sdk.WebSocketClientTransport.create({ url });

                const sendRequest = async (method: string, params?: IDataObject) => {
                        if (typeof client.request === 'function') {
                                return normalizeJson(await client.request(method, params));
                        }
                        if (typeof client.sendRequest === 'function') {
                                return normalizeJson(await client.sendRequest(method, params));
                        }
                        throw new NodeOperationError(
                                this.getNode(),
                                'El cliente MCP no expone un método compatible para enviar solicitudes',
                        );
                };

                const returnData: INodeExecutionData[] = [];

                try {
                        await client.connect(transport);

                        for (let index = 0; index < items.length; index++) {
                                const currentOperation = this.getNodeParameter('operation', index) as string;

                                if (currentOperation === 'listArdf') {
                                        const typeFilter = (this.getNodeParameter('ardfType', index, '') as string).trim();
                                        const tagsInput = (this.getNodeParameter('ardfTags', index, '') as string).trim();
                                        const domainFilter = (this.getNodeParameter('ardfDomain', index, '') as string).trim();
                                        const indexUri = (this.getNodeParameter('ardfIndexUri', index, 'ardf://index') as string).trim() || 'ardf://index';

                                        const filters: IDataObject = {};
                                        const toolArguments: IDataObject = {};

                                        if (typeFilter) {
                                                filters.type = typeFilter;
                                                toolArguments.type = typeFilter;
                                        }

                                        if (domainFilter) {
                                                filters.domain = domainFilter;
                                                toolArguments.domain = domainFilter;
                                        }

                                        const parsedTags = tagsInput
                                                ? tagsInput
                                                          .split(',')
                                                          .map((tag) => tag.trim())
                                                          .filter((tag) => tag.length > 0)
                                                : [];

                                        if (parsedTags.length === 1) {
                                                filters.tags = parsedTags;
                                                toolArguments.tags = parsedTags[0];
                                        } else if (parsedTags.length > 1) {
                                                filters.tags = parsedTags;
                                                toolArguments.tags = parsedTags;
                                        }

                                        let response: IDataObject | undefined;
                                        let source: 'tool' | 'resource' = 'resource';

                                        try {
                                                response = (await sendRequest('tools/call', {
                                                        name: 'ardf.list',
                                                        arguments: toolArguments,
                                                })) as IDataObject;
                                                source = 'tool';
                                        } catch (error) {
                                                response = undefined;
                                        }

                                        if (!response) {
                                                response = (await sendRequest('resources/read', { uri: indexUri })) as IDataObject;
                                                source = 'resource';
                                        }

                                        const payload: IDataObject = {
                                                operation: currentOperation,
                                                source,
                                                indexUri,
                                                ...(filters.type || filters.domain || filters.tags ? { filters } : {}),
                                                ...(response ?? {}),
                                        };

                                        returnData.push({ json: payload });
                                        continue;
                                }

                                if (currentOperation === 'listTools') {
                                        const response = (await sendRequest('tools/list')) as IDataObject;
                                        returnData.push({ json: { operation: currentOperation, ...(response ?? {}) } });
                                        continue;
                                }

                                if (currentOperation === 'callTool') {
                                        const name = this.getNodeParameter('toolName', index) as string;
                                        if (!name) {
                                                throw new NodeOperationError(this.getNode(), 'Debes indicar el nombre del tool');
                                        }
                                        const args = (this.getNodeParameter('toolArguments', index, {}) ?? {}) as IDataObject;
                                        const response = (await sendRequest('tools/call', {
                                                name,
                                                arguments: args,
                                        })) as IDataObject;
                                        returnData.push({ json: { operation: currentOperation, name, ...(response ?? {}) } });
                                        continue;
                                }

                                if (currentOperation === 'listPrompts') {
                                        const response = (await sendRequest('prompts/list')) as IDataObject;
                                        returnData.push({ json: { operation: currentOperation, ...(response ?? {}) } });
                                        continue;
                                }

                                if (currentOperation === 'getPrompt') {
                                        const name = this.getNodeParameter('promptName', index) as string;
                                        if (!name) {
                                                throw new NodeOperationError(this.getNode(), 'Debes indicar el nombre del prompt');
                                        }
                                        const variables = (this.getNodeParameter('promptVariables', index, {}) ?? {}) as IDataObject;
                                        const response = (await sendRequest('prompts/get', {
                                                name,
                                                arguments: variables,
                                        })) as IDataObject;
                                        returnData.push({ json: { operation: currentOperation, name, ...(response ?? {}) } });
                                        continue;
                                }

                                if (currentOperation === 'listResources') {
                                        const response = (await sendRequest('resources/list')) as IDataObject;
                                        returnData.push({ json: { operation: currentOperation, ...(response ?? {}) } });
                                        continue;
                                }

                                if (currentOperation === 'readResource') {
                                        const uri = this.getNodeParameter('resourceUri', index) as string;
                                        if (!uri) {
                                                throw new NodeOperationError(this.getNode(), 'Debes indicar la URI del recurso');
                                        }
                                        const response = (await sendRequest('resources/read', { uri })) as IDataObject;
                                        returnData.push({ json: { operation: currentOperation, uri, ...(response ?? {}) } });
                                        continue;
                                }

                                throw new NodeOperationError(
                                        this.getNode(),
                                        `Operación no soportada: ${currentOperation}`,
                                );
                        }
                } finally {
                        if (typeof transport.close === 'function') {
                                await transport.close();
                        }
                        if (typeof client.close === 'function') {
                                await client.close();
                        }
                }

                return [returnData];
        }
}
