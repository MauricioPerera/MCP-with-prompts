import type {
        IDataObject,
        INodeExecutionData,
        INodeType,
        INodeTypeDescription,
        ITriggerFunctions,
        ITriggerResponse,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

interface WorkflowReference {
        id?: string;
        name?: string;
}

interface ArdfMetadata {
        whenToUse?: string;
        domain?: string;
        tags?: string[];
        version?: string;
        author?: string;
        mediaType?: string;
        resourceType?: string;
}

interface ToolConfig {
        name: string;
        description?: string;
        inputSchema?: IDataObject;
        responseTemplate: string;
        responseType: 'text' | 'json';
        subWorkflow?: WorkflowReference;
        ardf?: ArdfMetadata;
}

interface PromptMessageConfig {
        role: 'system' | 'user' | 'assistant';
        content: string;
}

interface PromptVariableConfig {
        name: string;
        description?: string;
        required?: boolean;
        default?: string;
}

interface PromptConfig {
        name: string;
        description?: string;
        messages: PromptMessageConfig[];
        variables: PromptVariableConfig[];
        generatorWorkflow?: WorkflowReference;
        ardf?: ArdfMetadata;
}

interface ResourceConfig {
        name: string;
        description?: string;
        uri: string;
        mimeType: string;
        content: string;
        responseType: 'text' | 'json';
        loaderWorkflow?: WorkflowReference;
        ardf?: ArdfMetadata;
}

interface ArdfOptions {
        enabled: boolean;
        indexUri: string;
        indexTitle: string;
        mediaType: string;
        exposeListTool: boolean;
        listToolName: string;
        version: string;
        defaultDomain?: string;
        defaultTags: string[];
        defaultAuthor?: string;
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

const normalizeWorkflowReference = (value: unknown): WorkflowReference | undefined => {
        if (value === undefined || value === null) {
                return undefined;
        }

        if (typeof value === 'string' && value.trim()) {
                return { id: value.trim() };
        }

        if (typeof value === 'number' && Number.isFinite(value)) {
                return { id: String(value) };
        }

        if (typeof value === 'object') {
                const data = value as IDataObject;
                const idValue = data.id ?? data.workflowId ?? data.value;
                const nameValue = data.name ?? data.workflowName ?? data.label;
                const reference: WorkflowReference = {};

                if (typeof idValue === 'string' && idValue.trim()) {
                        reference.id = idValue.trim();
                } else if (typeof idValue === 'number' && Number.isFinite(idValue)) {
                        reference.id = idValue.toString();
                }

                if (typeof nameValue === 'string' && nameValue.trim()) {
                        reference.name = nameValue.trim();
                }

                if (reference.id || reference.name) {
                        return reference;
                }
        }

        return undefined;
};

const executeSubWorkflow = async (
        context: ITriggerFunctions,
        reference: WorkflowReference | undefined,
        payload: IDataObject,
): Promise<IDataObject[]> => {
        if (!reference || (!reference.id && !reference.name)) {
                throw new NodeOperationError(context.getNode(), 'You must select a valid subworkflow.');
        }

        const executionContext = context as unknown as {
                workflowExecuteAdditionalData?: {
                        executeWorkflow?: (
                                workflowInfo: IDataObject,
                                inputData: INodeExecutionData[][],
                                additionalData?: IDataObject,
                        ) => Promise<INodeExecutionData[][]>;
                };
                getWorkflow?: () => { id: string; name: string } | undefined;
        };

        const executor = executionContext.workflowExecuteAdditionalData?.executeWorkflow;

        if (typeof executor !== 'function') {
                throw new NodeOperationError(
                        context.getNode(),
                        'Subworkflows cannot be executed from this trigger context.',
                );
        }

        const workflowInfo: IDataObject = reference.id ? { id: reference.id } : { name: reference.name };

        const inputData: INodeExecutionData[][] = [
                [
                        {
                                json: payload,
                        },
                ],
        ];

        const parentWorkflowGetter = executionContext.getWorkflow;
        const parentWorkflow = typeof parentWorkflowGetter === 'function' ? parentWorkflowGetter() : undefined;
        const additional: IDataObject | undefined = parentWorkflow
                ? {
                          parentWorkflowId: parentWorkflow.id,
                          parentWorkflowName: parentWorkflow.name,
                  }
                : undefined;

        const result = await executor(workflowInfo, inputData, additional);
        const primaryOutput = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : [];

        return primaryOutput.map((entry) => ({ ...(entry.json ?? ({} as IDataObject)) }));
};

const parseTags = (value: unknown): string[] => {
        if (!value) return [];
        if (Array.isArray(value)) {
                return value
                        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
                        .filter((entry) => entry.length > 0);
        }
        if (typeof value === 'string') {
                return value
                        .split(',')
                        .map((entry) => entry.trim())
                        .filter((entry) => entry.length > 0);
        }
        if (typeof value === 'object') {
                return Object.values(value as IDataObject)
                        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
                        .filter((entry) => entry.length > 0);
        }
        return [];
};

const normalizeString = (value: unknown): string | undefined => {
        if (typeof value === 'string') {
                const trimmed = value.trim();
                return trimmed ? trimmed : undefined;
        }
        return undefined;
};

const extractArdfMetadata = (data: IDataObject): ArdfMetadata | undefined => {
        const whenToUse = normalizeString(data.ardfWhenToUse);
        const domain = normalizeString(data.ardfDomain);
        const tags = parseTags(data.ardfTags);
        const version = normalizeString(data.ardfVersion);
        const author = normalizeString(data.ardfAuthor);
        const mediaType = normalizeString(data.ardfMediaType);
        const resourceType = normalizeString(data.ardfResourceType);

        if (!whenToUse && !domain && !tags.length && !version && !author && !mediaType && !resourceType) {
                return undefined;
        }

        const metadata: ArdfMetadata = {};
        if (whenToUse) metadata.whenToUse = whenToUse;
        if (domain) metadata.domain = domain;
        if (tags.length) metadata.tags = tags;
        if (version) metadata.version = version;
        if (author) metadata.author = author;
        if (mediaType) metadata.mediaType = mediaType;
        if (resourceType) metadata.resourceType = resourceType;

        return metadata;
};

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
                outputs: ['main'],
                properties: [
                        {
                                displayName: 'Server',
                                name: 'serverOptions',
                                type: 'collection',
                                default: {},
                                placeholder: 'Opciones del servidor',
                                options: [
                                        {
                                                displayName: 'Name',
                                                name: 'serverName',
                                                type: 'string',
                                                default: 'n8n-mcp-server',
                                        },
                                        {
                                                displayName: 'Version',
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
                                                displayName: 'Port',
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
                                displayName: 'ARDF',
                                name: 'ardf',
                                type: 'collection',
                                default: {},
                                placeholder: 'Opciones de Agent Resource Description Format',
                                options: [
                                        {
                                                displayName: 'Default Author',
                                                name: 'defaultAuthor',
                                                type: 'string',
                                                default: '',
                                        },
                                        {
                                                displayName: 'Default Domain',
                                                name: 'defaultDomain',
                                                type: 'string',
                                                default: '',
                                        },
                                        {
                                                displayName: 'Enable',
                                                name: 'enabled',
                                                type: 'boolean',
                                                default: true,
                                                description:
                                                        'Whether to generate an ARDF index automatically from the configured tools, prompts, and resources',
                                        },
                                        {
                                                displayName: 'Media Type',
                                                name: 'mediaType',
                                                type: 'string',
                                                default: 'application/vnd.ardf+json',
                                        },
                                        {
                                                displayName: 'ARDF Tool Name',
                                                name: 'listToolName',
                                                type: 'string',
                                                default: 'ardf.list',
                                                displayOptions: {
                                                        show: {
                                                                exposeListTool: [true],
                                                        },
                                                },
                                        },
                                        {
                                                displayName: 'Expose ardf.list Tool',
                                                name: 'exposeListTool',
                                                type: 'boolean',
                                                default: true,
                                                description: 'Whether to expose an MCP tool that lets clients filter ARDF descriptors',
                                        },
                                        {
                                                displayName: 'Default Tags',
                                                name: 'defaultTags',
                                                type: 'string',
                                                default: '',
                                                description: 'Separadas por coma',
                                        },
                                        {
                                                displayName: 'Index Title',
                                                name: 'indexTitle',
                                                type: 'string',
                                                default: 'ARDF Index',
                                        },
                                        {
                                                displayName: 'Index URI',
                                                name: 'indexUri',
                                                type: 'string',
                                                default: 'ardf://index',
                                        },
                                        {
                                                displayName: 'ARDF Version',
                                                name: 'version',
                                                type: 'string',
                                                default: '1.0',
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
                                placeholder: 'Add tool',
                                options: [
                                        {
                                                displayName: 'Tool',
                                                name: 'tool',
                                                values: [
																																					{
																																						displayName: 'Author (ARDF)',
																																						name: 'ardfAuthor',
																																						type: 'string',
																																						default: '',
																																					},
																																					{
																																						displayName: 'Description',
																																						name: 'description',
																																						type: 'string',
																																						default: '',
																																					},
																																					{
																																						displayName: 'Domain (ARDF)',
																																						name: 'ardfDomain',
																																						type: 'string',
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
																																						displayName: 'Media Type (ARDF)',
																																						name: 'ardfMediaType',
																																						type: 'string',
																																						default: '',
																																					},
																																					{
																																						displayName: 'Name',
																																						name: 'name',
																																						type: 'string',
																																						default: '',
																																							required: true,
																																					},
																																					{
																																						displayName: 'Response Template',
																																						name: 'responseTemplate',
																																						type: 'string',
																																						default: 'Tool {{name}} executed',
																																						description: 'Template used to render the tool response. Use {{argument}} to access argument values.',
																																					},
																																					{
																																						displayName: 'Response Type',
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
																																						displayName: 'Subworkflow',
																																						name: 'subWorkflow',
																																						type: 'workflowSelector',
																																						default: '',
																																						description: 'Workflow to run when the tool is invoked. It receives a single item containing the arguments as JSON.',
																																					},
																																					{
																																						displayName: 'Tags (ARDF)',
																																						name: 'ardfTags',
																																						type: 'string',
																																						default: '',
																																						description: 'Separadas por coma',
																																					},
																																					{
																																						displayName: 'Version (ARDF)',
																																						name: 'ardfVersion',
																																						type: 'string',
																																						default: '',
																																					},
																																					{
																																						displayName: 'When To Use (ARDF)',
																																						name: 'ardfWhenToUse',
																																						type: 'string',
																																						default: '',
																																						description: 'Contexto recomendado para el descriptor ARDF',
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
                                placeholder: 'Add prompt',
                                options: [
                                        {
                                                displayName: 'Prompt',
                                                name: 'prompt',
                                                values: [
																																					{
																																						displayName: 'Author (ARDF)',
																																						name: 'ardfAuthor',
																																						type: 'string',
																																						default: '',
																																					},
																																					{
																																						displayName: 'Description',
																																						name: 'description',
																																						type: 'string',
																																						default: '',
																																					},
																																					{
																																						displayName: 'Domain (ARDF)',
																																						name: 'ardfDomain',
																																						type: 'string',
																																						default: '',
																																					},
																																					{
																																						displayName: 'Generator (Subworkflow)',
																																						name: 'generatorWorkflow',
																																						type: 'workflowSelector',
																																						default: '',
																																						description: 'Workflow opcional que recibe las variables interpoladas y devuelve un prompt completo',
																																					},
																																					{
																																						displayName: 'Media Type (ARDF)',
																																						name: 'ardfMediaType',
																																						type: 'string',
																																						default: '',
																																					},
																																					{
																																						displayName: 'Messages',
																																						name: 'messages',
																																						type: 'fixedCollection',
																																						default: {},
																																						options: [
																																									{
																																										displayName: 'Message',
																																										name: 'message',
																																											values:	[
																																											{
																																												displayName: 'Role',
																																												name: 'role',
																																												type: 'options',
																																												options: [
																																															{
																																																name: 'System',
																																																value: 'system',
																																															},
																																															{
																																																name: 'User',
																																																value: 'user',
																																															},
																																															{
																																																name: 'Assistant',
																																																value: 'assistant',
																																															},
																																														],
																																												default: 'system',
																																											},
																																											{
																																												displayName: 'Content',
																																												name: 'content',
																																												type: 'string',
																																												default: '',
																																											},
																																											]
																																									},
																																							]
																																					},
																																					{
																																						displayName: 'Name',
																																						name: 'name',
																																						type: 'string',
																																						default: '',
																																							required: true,
																																					},
																																					{
																																						displayName: 'Tags (ARDF)',
																																						name: 'ardfTags',
																																						type: 'string',
																																						default: '',
																																						description: 'Separadas por coma',
																																					},
																																					{
																																						displayName: 'Variables',
																																						name: 'variables',
																																						type: 'fixedCollection',
																																						default: {},
																																						options: [
																																									{
																																										displayName: 'Variable',
																																										name: 'variable',
																																											values:	[
																																											{
																																												displayName: 'Name',
																																												name: 'name',
																																												type: 'string',
																																												default: '',
																																													required:	true,
																																											},
																																											{
																																												displayName: 'Description',
																																												name: 'description',
																																												type: 'string',
																																												default: '',
																																											},
																																											{
																																												displayName: 'Required',
																																												name: 'required',
																																												type: 'boolean',
																																												default: false,
																																											},
																																											{
																																												displayName: 'Default Value',
																																												name: 'default',
																																												type: 'string',
																																												default: '',
																																											},
																																											]
																																									},
																																							]
																																					},
																																					{
																																						displayName: 'Version (ARDF)',
																																						name: 'ardfVersion',
																																						type: 'string',
																																						default: '',
																																					},
																																					{
																																						displayName: 'When To Use (ARDF)',
																																						name: 'ardfWhenToUse',
																																						type: 'string',
																																						default: '',
																																					},
																																					],
                                        },
                                ],
                        },
                        {
                                displayName: 'Resources',
                                name: 'resources',
                                type: 'fixedCollection',
                                typeOptions: {
                                        multipleValues: true,
                                },
                                default: {},
                                placeholder: 'Add resource',
                                options: [
                                        {
                                                displayName: 'Resource',
                                                name: 'resource',
                                                values: [
																																					{
																																						displayName: 'Author (ARDF)',
																																						name: 'ardfAuthor',
																																						type: 'string',
																																						default: '',
																																					},
																																					{
																																						displayName: 'Content',
																																						name: 'content',
																																						type: 'string',
																																						default: '',
																																					},
																																					{
																																						displayName: 'Content Type',
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
																																						displayName: 'Description',
																																						name: 'description',
																																						type: 'string',
																																						default: '',
																																					},
																																					{
																																						displayName: 'Domain (ARDF)',
																																						name: 'ardfDomain',
																																						type: 'string',
																																						default: '',
																																					},
																																					{
																																						displayName: 'Loader (Subworkflow)',
																																						name: 'loaderWorkflow',
																																						type: 'workflowSelector',
																																						default: '',
																																						description: 'Workflow opcional que resuelve el contenido del recurso. Recibe el URI y debe devolver texto o JSON.',
																																					},
																																					{
																																						displayName: 'Media Type (ARDF)',
																																						name: 'ardfMediaType',
																																						type: 'string',
																																						default: '',
																																					},
																																					{
																																						displayName: 'MIME Type',
																																						name: 'mimeType',
																																						type: 'string',
																																						default: 'text/plain',
																																					},
																																					{
																																						displayName: 'Name',
																																						name: 'name',
																																						type: 'string',
																																						default: '',
																																							required:	true,
																																					},
																																					{
																																						displayName: 'Tags (ARDF)',
																																						name: 'ardfTags',
																																						type: 'string',
																																						default: '',
																																						description: 'Separadas por coma',
																																					},
																																					{
																																						displayName: 'Type (ARDF)',
																																						name: 'ardfResourceType',
																																						type: 'options',
																																						options: [
																																									{
																																										name: 'Document',
																																										value: 'document',
																																									},
																																									{
																																										name: 'Model',
																																										value: 'model',
																																									},
																																									{
																																										name: 'Policy',
																																										value: 'policy',
																																									},
																																									{
																																										name: 'Prompt Wrapper',
																																										value: 'prompt',
																																									},
																																									{
																																										name: 'Resource',
																																										value: 'resource',
																																									},
																																									{
																																										name: 'Tool Wrapper',
																																										value: 'tool',
																																									},
																																									{
																																										name: 'Workflow',
																																										value: 'workflow',
																																									},
																																							],
																																						default: 'resource',
																																					},
																																					{
																																						displayName: 'URI',
																																						name: 'uri',
																																						type: 'string',
																																						default: '',
																																							required:	true,
																																					},
																																					{
																																						displayName: 'Version (ARDF)',
																																						name: 'ardfVersion',
																																						type: 'string',
																																						default: '',
																																					},
																																					{
																																						displayName: 'When To Use (ARDF)',
																																						name: 'ardfWhenToUse',
																																						type: 'string',
																																						default: '',
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
                const tools: ToolConfig[] = [];
                for (const tool of toolEntries) {
                        const name = (tool.name as string | undefined)?.trim();
                        if (!name) continue;

                        const responseTemplate = (tool.responseTemplate as string | undefined) ?? '';
                        const responseType = (tool.responseType as string | undefined) === 'json' ? 'json' : 'text';

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

                        tools.push({
                                name,
                                description: (tool.description as string | undefined) ?? undefined,
                                inputSchema,
                                responseTemplate,
                                responseType,
                                subWorkflow: normalizeWorkflowReference(tool.subWorkflow),
                                ardf: extractArdfMetadata(tool),
                        });
                }

                const promptsParameter = (this.getNodeParameter('prompts', 0, {}) ?? {}) as IDataObject;
                const promptEntries = (promptsParameter.prompt as IDataObject[]) ?? [];
                const prompts: PromptConfig[] = [];
                for (const prompt of promptEntries) {
                        const name = (prompt.name as string | undefined)?.trim();
                        if (!name) continue;

                        const messagesContainer = (prompt.messages as IDataObject | undefined) ?? {};
                        const messageEntries = (messagesContainer.message as IDataObject[]) ?? [];
                        const messages: PromptMessageConfig[] = [];
                        for (const message of messageEntries) {
                                const role = (message.role as string | undefined) ?? 'system';
                                const content = (message.content as string | undefined) ?? '';
                                if (!content.trim()) continue;

                                messages.push({ role: role as PromptMessageConfig['role'], content });
                        }

                        const variablesContainer = (prompt.variables as IDataObject | undefined) ?? {};
                        const variableEntries = (variablesContainer.variable as IDataObject[]) ?? [];
                        const variables: PromptVariableConfig[] = [];
                        for (const variable of variableEntries) {
                                const variableName = (variable.name as string | undefined)?.trim();
                                if (!variableName) continue;

                                variables.push({
                                        name: variableName,
                                        description: (variable.description as string | undefined) ?? undefined,
                                        required: Boolean(variable.required),
                                        default: (variable.default as string | undefined) ?? undefined,
                                });
                        }

                        prompts.push({
                                name,
                                description: (prompt.description as string | undefined) ?? undefined,
                                messages,
                                variables,
                                generatorWorkflow: normalizeWorkflowReference(prompt.generatorWorkflow),
                                ardf: extractArdfMetadata(prompt),
                        });
                }

                const resourcesParameter = (this.getNodeParameter('resources', 0, {}) ?? {}) as IDataObject;
                const resourceEntries = (resourcesParameter.resource as IDataObject[]) ?? [];
                const resources: ResourceConfig[] = [];
                for (const resource of resourceEntries) {
                        const name = (resource.name as string | undefined)?.trim();
                        const uri = (resource.uri as string | undefined)?.trim();
                        if (!name || !uri) continue;

                        const responseType = (resource.responseType as string | undefined) === 'json' ? 'json' : 'text';

                        resources.push({
                                name,
                                description: (resource.description as string | undefined) ?? undefined,
                                uri,
                                mimeType: (resource.mimeType as string | undefined) ?? 'text/plain',
                                content: (resource.content as string | undefined) ?? '',
                                responseType,
                                loaderWorkflow: normalizeWorkflowReference(resource.loaderWorkflow),
                                ardf: extractArdfMetadata(resource),
                        });
                }

                const ardfParameter = (this.getNodeParameter('ardf', 0, {}) ?? {}) as IDataObject;
                const ardfOptions: ArdfOptions = {
                        enabled: ardfParameter.enabled !== false,
                        indexUri: normalizeString(ardfParameter.indexUri) ?? 'ardf://index',
                        indexTitle: normalizeString(ardfParameter.indexTitle) ?? 'ARDF Index',
                        mediaType: normalizeString(ardfParameter.mediaType) ?? 'application/vnd.ardf+json',
                        exposeListTool: ardfParameter.exposeListTool !== false,
                        listToolName: normalizeString(ardfParameter.listToolName) ?? 'ardf.list',
                        version: normalizeString(ardfParameter.version) ?? '1.0',
                        defaultDomain: normalizeString(ardfParameter.defaultDomain),
                        defaultTags: parseTags(ardfParameter.defaultTags),
                        defaultAuthor: normalizeString(ardfParameter.defaultAuthor),
                };

                const ardfDescriptors: IDataObject[] = [];
                const ardfTimestamp = new Date().toISOString();
                const buildArdfMetadata = (metadata?: ArdfMetadata): IDataObject => {
                        const descriptorMetadata: IDataObject = {
                                ardf_version: ardfOptions.version,
                                generated_at: ardfTimestamp,
                        };

                        const tags = metadata?.tags?.length ? metadata.tags : ardfOptions.defaultTags;
                        if (tags.length) {
                                descriptorMetadata.tags = tags;
                        }

                        const domain = metadata?.domain ?? ardfOptions.defaultDomain;
                        if (domain) {
                                descriptorMetadata.domain = domain;
                        }

                        const version = metadata?.version;
                        if (version) {
                                descriptorMetadata.version = version;
                        }

                        const author = metadata?.author ?? ardfOptions.defaultAuthor;
                        if (author) {
                                descriptorMetadata.author = author;
                        }

                        const mediaType = metadata?.mediaType ?? ardfOptions.mediaType;
                        if (mediaType) {
                                descriptorMetadata.mediaType = mediaType;
                        }

                        return descriptorMetadata;
                };

                if (ardfOptions.enabled) {
                        for (const tool of tools) {
                                const toolData: IDataObject = {
                                        name: tool.name,
                                        input_schema: tool.inputSchema ?? { type: 'object', properties: {} },
                                        response: {
                                                type: tool.responseType,
                                                template: tool.responseTemplate,
                                        },
                                };

                                if (tool.description) {
                                        toolData.description = tool.description;
                                }

                                if (tool.subWorkflow) {
                                        toolData.workflow = {
                                                id: tool.subWorkflow.id,
                                                name: tool.subWorkflow.name,
                                        };
                                }

                                const descriptor: IDataObject = {
                                        resource_id: tool.name,
                                        resource_type: tool.ardf?.resourceType ?? 'tool',
                                        name: tool.name,
                                        description: tool.description,
                                        content: {
                                                type: 'tool/schema',
                                                data: toolData,
                                        },
                                        metadata: buildArdfMetadata(tool.ardf),
                                };

                                if (tool.ardf?.whenToUse) {
                                        descriptor.when_to_use = tool.ardf.whenToUse;
                                }

                                ardfDescriptors.push(descriptor);
                        }

                        for (const prompt of prompts) {
                                const promptData: IDataObject = {
                                        name: prompt.name,
                                        messages: prompt.messages.map((message) => ({
                                                role: message.role,
                                                content: message.content,
                                        })),
                                        variables: prompt.variables.map((variable) => ({
                                                name: variable.name,
                                                description: variable.description,
                                                required: Boolean(variable.required),
                                                default: variable.default,
                                        })),
                                };

                                if (prompt.generatorWorkflow) {
                                        promptData.generator = {
                                                id: prompt.generatorWorkflow.id,
                                                name: prompt.generatorWorkflow.name,
                                        };
                                }

                                const descriptor: IDataObject = {
                                        resource_id: prompt.name,
                                        resource_type: prompt.ardf?.resourceType ?? 'prompt',
                                        name: prompt.name,
                                        description: prompt.description,
                                        content: {
                                                type: 'prompt/messages',
                                                data: promptData,
                                        },
                                        metadata: buildArdfMetadata(prompt.ardf),
                                };

                                if (prompt.ardf?.whenToUse) {
                                        descriptor.when_to_use = prompt.ardf.whenToUse;
                                }

                                ardfDescriptors.push(descriptor);
                        }

                        for (const resource of resources) {
                                const resourceData: IDataObject = {
                                        name: resource.name,
                                        uri: resource.uri,
                                        mimeType: resource.mimeType,
                                        response_type: resource.responseType,
                                };

                                if (resource.description) {
                                        resourceData.description = resource.description;
                                }

                                if (resource.loaderWorkflow) {
                                        resourceData.loader = {
                                                id: resource.loaderWorkflow.id,
                                                name: resource.loaderWorkflow.name,
                                        };
                                }

                                const descriptor: IDataObject = {
                                        resource_id: resource.uri,
                                        resource_type: resource.ardf?.resourceType ?? 'resource',
                                        name: resource.name,
                                        description: resource.description,
                                        content: {
                                                type: `resource/${resource.responseType}`,
                                                data: resourceData,
                                        },
                                        metadata: buildArdfMetadata(resource.ardf),
                                };

                                if (resource.ardf?.whenToUse) {
                                        descriptor.when_to_use = resource.ardf.whenToUse;
                                }

                                ardfDescriptors.push(descriptor);
                        }
                }

                const ardfListToolEnabled =
                        ardfOptions.enabled && ardfOptions.exposeListTool && ardfDescriptors.length > 0;
                const ardfResourceEnabled = ardfOptions.enabled && ardfDescriptors.length > 0;

                const capabilities: IDataObject = {};
                if (tools.length || ardfListToolEnabled) {
                        capabilities.tools = {};
                }
                if (prompts.length) {
                        capabilities.prompts = {};
                }
                if (resources.length || ardfResourceEnabled) {
                        capabilities.resources = {};
                }

                let sdk: McpServerModule;
                try {
                        sdk = (await import('@modelcontextprotocol/sdk/server/index.js')) as unknown as McpServerModule;
                } catch (error) {
                        throw new NodeOperationError(
                                this.getNode(),
                                'Failed to load the official MCP SDK. Make sure "@modelcontextprotocol/sdk" is installed.',
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
                                'The MCP server instance does not expose a compatible setRequestHandler method',
                        );
                };

                const ardfListToolName = ardfOptions.listToolName;
                const buildArdfIndexPayload = (items: IDataObject[]): IDataObject => ({
                        index_uri: ardfOptions.indexUri,
                        generated_at: ardfTimestamp,
                        version: ardfOptions.version,
                        total: items.length,
                        items,
                });

                setRequestHandler('tools/list', async () => {
                        const toolList = tools.map((tool) => ({
                                name: tool.name,
                                description: tool.description,
                                input_schema: tool.inputSchema ?? { type: 'object', properties: {} },
                        }));

                        if (ardfListToolEnabled) {
                                toolList.push({
                                        name: ardfListToolName,
                                        description: 'Returns ARDF descriptors optionally filtered by type, domain, or tags',
                                        input_schema: {
                                                type: 'object',
                                                properties: {
                                                        type: { type: 'string' },
                                                        domain: { type: 'string' },
                                                        tags: {
                                                                anyOf: [
                                                                        { type: 'string' },
                                                                        {
                                                                                type: 'array',
                                                                                items: { type: 'string' },
                                                                        },
                                                                ],
                                                        },
                                                },
                                        },
                                });
                        }

                        return { tools: toolList };
                });

                setRequestHandler('tools/call', async (request) => {
                        const params = (request.params ?? {}) as IDataObject;
                        const toolName = (params.name as string | undefined) ?? '';
                        const argsInput = params.arguments as IDataObject | string | undefined;
                        let args: IDataObject = {};
                        if (typeof argsInput === 'string') {
                                try {
                                        args = JSON.parse(argsInput);
                                } catch (error) {
                                        throw new NodeOperationError(this.getNode(), `Invalid arguments for tool ${toolName}`);
                                }
                        } else if (typeof argsInput === 'object' && argsInput !== null) {
                                args = argsInput as IDataObject;
                        }

                        if (ardfListToolEnabled && toolName === ardfListToolName) {
                                const typeFilter = normalizeString(args.type);
                                const domainFilter = normalizeString(args.domain);
                                const tagsFilter = parseTags(args.tags);

                                const filteredDescriptors = ardfDescriptors.filter((descriptor) => {
                                        const descriptorType = normalizeString(descriptor.resource_type);
                                        if (typeFilter && descriptorType !== typeFilter) {
                                                return false;
                                        }

                                        const metadata = descriptor.metadata as IDataObject | undefined;
                                        if (domainFilter) {
                                                const descriptorDomain = normalizeString(metadata?.domain);
                                                if (descriptorDomain !== domainFilter) {
                                                        return false;
                                                }
                                        }

                                        if (tagsFilter.length) {
                                                const descriptorTags = parseTags(metadata?.tags);
                                                return tagsFilter.every((tag) => descriptorTags.includes(tag));
                                        }

                                        return true;
                                });

                                const payload = buildArdfIndexPayload(filteredDescriptors);
                                if (typeFilter) {
                                        payload.filter_type = typeFilter;
                                }
                                if (domainFilter) {
                                        payload.filter_domain = domainFilter;
                                }
                                if (tagsFilter.length) {
                                        payload.filter_tags = tagsFilter;
                                }

                                return {
                                        content: [
                                                {
                                                        type: 'json',
                                                        json: payload,
                                                },
                                        ],
                                } as IDataObject;
                        }

                        const tool = toolMap.get(toolName);
                        if (!tool) {
                                throw new NodeOperationError(this.getNode(), `Tool "${toolName}" no encontrado`);
                        }

                        let toolResponseType: 'text' | 'json' = tool.responseType;
                        let textContent: string | undefined;
                        let jsonContent: IDataObject | undefined;

                        if (tool.subWorkflow) {
                                const [result] = await executeSubWorkflow(this, tool.subWorkflow, {
                                        tool: tool.name,
                                        description: tool.description,
                                        arguments: args,
                                });

                                if (result) {
                                        const explicitType = typeof result.type === 'string' ? result.type.toLowerCase() : undefined;
                                        if (explicitType === 'json' || explicitType === 'text') {
                                                toolResponseType = explicitType;
                                        }

                                        if (toolResponseType === 'json') {
                                                const candidate =
                                                        (typeof result.json === 'object' && result.json !== null
                                                                ? (result.json as IDataObject)
                                                                : undefined) ??
                                                        (typeof result.data === 'object' && result.data !== null
                                                                ? (result.data as IDataObject)
                                                                : undefined) ??
                                                        (typeof result.response === 'object' && result.response !== null
                                                                ? (result.response as IDataObject)
                                                                : undefined) ??
                                                        (typeof result.content === 'object' && result.content !== null
                                                                ? (result.content as IDataObject)
                                                                : undefined) ??
                                                        (typeof result.result === 'object' && result.result !== null
                                                                ? (result.result as IDataObject)
                                                                : undefined);

                                                if (candidate) {
                                                        jsonContent = candidate;
                                                } else if (typeof result.json === 'string') {
                                                        try {
                                                                jsonContent = JSON.parse(result.json);
                                                        } catch (error) {
                                                                throw new NodeOperationError(
                                                                        this.getNode(),
                                                                        `The subworkflow for tool ${toolName} returned invalid JSON`,
                                                                );
                                                        }
                                                }
                                        } else {
                                                const textCandidate =
                                                        typeof result.text === 'string'
                                                                ? result.text
                                                                : typeof result.content === 'string'
                                                                ? result.content
                                                                : typeof result.response === 'string'
                                                                ? result.response
                                                                : typeof result.result === 'string'
                                                                ? result.result
                                                                : undefined;

                                                if (textCandidate !== undefined) {
                                                        textContent = textCandidate;
                                                } else if (typeof result.json === 'string') {
                                                        textContent = result.json;
                                                } else if (result.json && typeof result.json === 'object') {
                                                        textContent = JSON.stringify(result.json);
                                                }
                                        }
                                }
                        }

                        if (toolResponseType === 'json') {
                                if (!jsonContent) {
                                        const rendered = renderTemplate(tool.responseTemplate ?? '', args);
                                        try {
                                                jsonContent = rendered ? JSON.parse(rendered) : {};
                                        } catch (error) {
                                                throw new NodeOperationError(
                                                        this.getNode(),
                                                        `The response from tool ${toolName} is not valid JSON`,
                                                );
                                        }
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

                        if (textContent === undefined) {
                                textContent = renderTemplate(tool.responseTemplate ?? '', args);
                        }

                        return {
                                content: [
                                        {
                                                type: 'text',
                                                text: textContent,
                                        },
                                ],
                        } as IDataObject;
                });

                setRequestHandler('prompts/list', async () => ({
                        prompts: prompts.map((prompt) => ({
                                name: prompt.name,
                                description: prompt.description,
                                arguments: prompt.variables.map((variable) => ({
                                        name: variable.name,
                                        description: variable.description,
                                        required: Boolean(variable.required),
                                        default: variable.default,
                                })),
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
                                                `The arguments for prompt ${promptName} are not valid`,
                                        );
                                }
                        } else if (typeof variablesInput === 'object' && variablesInput !== null) {
                                variables = variablesInput as IDataObject;
                        }

                        type PromptMessagePayload = {
                                role: PromptMessageConfig['role'];
                                content: Array<{ type: 'text'; text: string } | { type: 'json'; json: IDataObject }>;
                        };

                        const staticMessages: PromptMessagePayload[] = prompt.messages.map((message) => ({
                                role: message.role,
                                content: [
                                        {
                                                type: 'text',
                                                text: renderTemplate(message.content, variables),
                                        },
                                ],
                        }));

                        let finalMessages: PromptMessagePayload[] = staticMessages;
                        let finalDescription = prompt.description;
                        let finalArguments = [...prompt.variables];

                        if (prompt.generatorWorkflow) {
                                const [generated] = await executeSubWorkflow(this, prompt.generatorWorkflow, {
                                        name: prompt.name,
                                        description: prompt.description,
                                        variables,
                                        arguments: finalArguments,
                                });

                                if (generated) {
                                        const payload = (generated.prompt as IDataObject | undefined) ?? generated;

                                        const normalizeArguments = (value: unknown): PromptVariableConfig[] => {
                                                if (!Array.isArray(value)) return [];

                                                const result: PromptVariableConfig[] = [];
                                                for (const entry of value) {
                                                        if (typeof entry !== 'object' || entry === null) continue;
                                                        const argument = entry as IDataObject;
                                                        const argumentName = (argument.name as string | undefined)?.trim();
                                                        if (!argumentName) continue;

                                                        result.push({
                                                                name: argumentName,
                                                                description:
                                                                        (argument.description as string | undefined) ?? undefined,
                                                                required: Boolean(argument.required),
                                                                default: (argument.default as string | undefined) ?? undefined,
                                                        });
                                                }

                                                return result;
                                        };

                                        const normalizeMessages = (value: unknown): PromptMessagePayload[] => {
                                                if (!Array.isArray(value)) return [];

                                                const coerceRole = (candidate: unknown): PromptMessageConfig['role'] => {
                                                        return candidate === 'system' || candidate === 'user' || candidate === 'assistant'
                                                                ? candidate
                                                                : 'assistant';
                                                };

                                                const result: PromptMessagePayload[] = [];

                                                for (const entry of value) {
                                                        if (typeof entry !== 'object' || entry === null) continue;
                                                        const message = entry as IDataObject;
                                                        const role = coerceRole(message.role);
                                                        const contentSegments = message.content;

                                                        if (Array.isArray(contentSegments)) {
                                                                const normalizedSegments: PromptMessagePayload['content'] = [];

                                                                for (const segment of contentSegments) {
                                                                        if (typeof segment !== 'object' || segment === null) continue;
                                                                        const segmentData = segment as IDataObject;
                                                                        const segmentType = (segmentData.type as string | undefined)?.toLowerCase();

                                                                        if (segmentType === 'json') {
                                                                                normalizedSegments.push({
                                                                                        type: 'json',
                                                                                        json:
                                                                                                (segmentData.json as IDataObject | undefined) ??
                                                                                                (segmentData.data as IDataObject | undefined) ??
                                                                                                (segmentData.value as IDataObject | undefined) ??
                                                                                                (segmentData.content as IDataObject | undefined) ??
                                                                                                {},
                                                                                });
                                                                                continue;
                                                                        }

                                                                        const textCandidate =
                                                                                typeof segmentData.text === 'string'
                                                                                        ? segmentData.text
                                                                                        : typeof segmentData.value === 'string'
                                                                                        ? segmentData.value
                                                                                        : typeof segmentData.content === 'string'
                                                                                        ? segmentData.content
                                                                                        : undefined;

                                                                        if (textCandidate !== undefined) {
                                                                                normalizedSegments.push({
                                                                                        type: 'text',
                                                                                        text: textCandidate,
                                                                                });
                                                                        }
                                                                }

                                                                if (normalizedSegments.length > 0) {
                                                                        result.push({ role, content: normalizedSegments });
                                                                        continue;
                                                                }
                                                        }

                                                        const textMessage =
                                                                typeof message.text === 'string'
                                                                        ? message.text
                                                                        : typeof message.content === 'string'
                                                                        ? message.content
                                                                        : undefined;

                                                        if (textMessage !== undefined) {
                                                                result.push({
                                                                        role,
                                                                        content: [
                                                                                {
                                                                                        type: 'text',
                                                                                        text: textMessage,
                                                                                },
                                                                        ],
                                                                });
                                                        }
                                                }

                                                return result;
                                        };

                                        if (typeof payload.description === 'string') {
                                                finalDescription = payload.description;
                                        }

                                        const dynamicArguments =
                                                normalizeArguments(payload.arguments ?? payload.variables ?? generated.variables);
                                        if (dynamicArguments.length > 0) {
                                                finalArguments = dynamicArguments;
                                        }

                                        const dynamicMessages =
                                                normalizeMessages(payload.messages ?? generated.messages ?? []);
                                        if (dynamicMessages.length > 0) {
                                                finalMessages = dynamicMessages;
                                        }
                                }
                        }

                        return {
                                prompt: {
                                        name: prompt.name,
                                        description: finalDescription,
                                        arguments: finalArguments.map((variable) => ({
                                                name: variable.name,
                                                description: variable.description,
                                                required: Boolean(variable.required),
                                                default: variable.default,
                                        })),
                                        messages: finalMessages,
                                },
                        } as IDataObject;
                });

                setRequestHandler('resources/list', async () => {
                        const resourceList = resources.map((resource) => ({
                                name: resource.name,
                                description: resource.description,
                                uri: resource.uri,
                                mime_type: resource.mimeType,
                        }));

                        if (ardfResourceEnabled) {
                                resourceList.push({
                                        name: ardfOptions.indexTitle,
                                        description: 'Autogenerated ARDF index describing available tools, prompts, and resources',
                                        uri: ardfOptions.indexUri,
                                        mime_type: ardfOptions.mediaType,
                                });
                        }

                        return { resources: resourceList };
                });

                setRequestHandler('resources/read', async (request) => {
                        const params = (request.params ?? {}) as IDataObject;
                        const uri = (params.uri as string | undefined) ?? '';

                        if (ardfResourceEnabled && uri === ardfOptions.indexUri) {
                                return {
                                        contents: [
                                                {
                                                        type: 'json',
                                                        json: buildArdfIndexPayload(ardfDescriptors),
                                                },
                                        ],
                                        mime_type: ardfOptions.mediaType,
                                        description: ardfOptions.indexTitle,
                                } as IDataObject;
                        }

                        const resource = resourceMap.get(uri);
                        if (!resource) {
                                throw new NodeOperationError(this.getNode(), `Recurso "${uri}" no encontrado`);
                        }

                        let responseType: 'text' | 'json' = resource.responseType;
                        let mimeType = resource.mimeType;
                        let description = resource.description;
                        let textContent = resource.content;
                        let jsonContent: IDataObject | undefined;

                        if (responseType === 'json') {
                                try {
                                        jsonContent = resource.content ? JSON.parse(resource.content) : {};
                                } catch (error) {
                                        throw new NodeOperationError(
                                                this.getNode(),
                                                `The content of resource ${resource.name} is not valid JSON`,
                                        );
                                }
                        }

                        if (resource.loaderWorkflow) {
                                const [loaded] = await executeSubWorkflow(this, resource.loaderWorkflow, {
                                        uri: resource.uri,
                                        name: resource.name,
                                        description: resource.description,
                                        mimeType: resource.mimeType,
                                        requestedUri: uri,
                                });

                                if (loaded) {
                                        const explicitType = typeof loaded.type === 'string' ? loaded.type.toLowerCase() : undefined;
                                        if (explicitType === 'json' || explicitType === 'text') {
                                                responseType = explicitType;
                                        }

                                        if (typeof loaded.mimeType === 'string' && loaded.mimeType.trim()) {
                                                mimeType = loaded.mimeType.trim();
                                        }

                                        if (typeof loaded.description === 'string' && loaded.description.trim()) {
                                                description = loaded.description;
                                        }

                                        if (responseType === 'json') {
                                                const candidate =
                                                        (typeof loaded.json === 'object' && loaded.json !== null
                                                                ? (loaded.json as IDataObject)
                                                                : undefined) ??
                                                        (typeof loaded.data === 'object' && loaded.data !== null
                                                                ? (loaded.data as IDataObject)
                                                                : undefined) ??
                                                        (typeof loaded.content === 'object' && loaded.content !== null
                                                                ? (loaded.content as IDataObject)
                                                                : undefined);

                                                if (candidate) {
                                                        jsonContent = candidate;
                                                } else if (typeof loaded.json === 'string') {
                                                        try {
                                                                jsonContent = JSON.parse(loaded.json);
                                                        } catch (error) {
                                                                throw new NodeOperationError(
                                                                        this.getNode(),
                                                                        `The loader for resource ${resource.name} returned invalid JSON`,
                                                                );
                                                        }
                                                }
                                        } else {
                                                const textCandidate =
                                                        typeof loaded.text === 'string'
                                                                ? loaded.text
                                                                : typeof loaded.content === 'string'
                                                                ? loaded.content
                                                                : typeof loaded.response === 'string'
                                                                ? loaded.response
                                                                : undefined;

                                                if (textCandidate !== undefined) {
                                                        textContent = textCandidate;
                                                } else if (loaded.json && typeof loaded.json === 'object') {
                                                        textContent = JSON.stringify(loaded.json);
                                                }
                                        }
                                }
                        }

                        if (responseType === 'json') {
                                if (!jsonContent) {
                                        jsonContent = {};
                                }

                                const response: IDataObject = {
                                        contents: [
                                                {
                                                        type: 'json',
                                                        json: jsonContent,
                                                },
                                        ],
                                };

                                if (mimeType) {
                                        response.mime_type = mimeType;
                                }

                                if (description) {
                                        response.description = description;
                                }

                                return response;
                        }

                        const response: IDataObject = {
                                contents: [
                                        {
                                                type: 'text',
                                                text: textContent,
                                        },
                                ],
                        };

                        if (mimeType) {
                                response.mime_type = mimeType;
                        }

                        if (description) {
                                response.description = description;
                        }

                        return response;
                });

                const transport = await sdk.WebSocketServerTransport.create({ host, port });
                await server.connect(transport);

                const toolCount = tools.length + (ardfListToolEnabled ? 1 : 0);
                const resourceCount = resources.length + (ardfResourceEnabled ? 1 : 0);

                const eventPayload: IDataObject = {
                        event: 'serverListening',
                        host,
                        port,
                        tools: toolCount,
                        prompts: prompts.length,
                        resources: resourceCount,
                };

                if (ardfResourceEnabled || ardfListToolEnabled) {
                        eventPayload.ardf = {
                                descriptors: ardfDescriptors.length,
                                indexUri: ardfOptions.indexUri,
                                listTool: ardfListToolEnabled ? ardfListToolName : undefined,
                        } satisfies IDataObject;
                }

                this.emit([[{ json: eventPayload } as INodeExecutionData]]);

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












