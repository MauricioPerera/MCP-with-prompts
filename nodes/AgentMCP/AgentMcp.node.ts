import type {
        IExecuteFunctions,
        INodeExecutionData,
        INodeType,
        INodeTypeDescription,
} from 'n8n-workflow';
import { createMCPClient } from './mcp/client';
import { makeChatLLM, type ChatMessage } from './llm/providers';
import { planWithARDF, type PlanItem } from './planner/ardfPlanner';
import { ARDFIndex } from '../../ardf/schema';

interface PromptMessage {
        role: 'system' | 'user' | 'assistant';
        content: string;
}

export class AgentMCP implements INodeType {
        description: INodeTypeDescription = {
                displayName: 'Agent MCP (ARDF-Aware)',
                name: 'agentMcp',
                icon: 'file:agentMcp.svg',
                group: ['transform'],
                version: 1,
                description: 'Agente que consume MCP tools/prompts/resources con soporte ARDF.',
                defaults: {
                        name: 'Agent MCP',
                },
                inputs: ['main'],
                outputs: ['main'],
                properties: [
                        {
                                displayName: 'MCP Server URL',
                                name: 'serverUrl',
                                type: 'string',
                                default: 'ws://localhost:4000',
                        },
                        {
                                displayName: 'Model Provider',
                                name: 'provider',
                                type: 'options',
                                options: [
                                        { name: 'Anthropic', value: 'anthropic' },
                                        { name: 'Hugging Face Inference', value: 'hf' },
                                        { name: 'Mistral', value: 'mistral' },
                                        { name: 'Ollama (Local)', value: 'ollama' },
                                        { name: 'OpenAI', value: 'openai' },
                                        { name: 'Gemini', value: 'gemini' },
                                ],
                                default: 'openai',
                        },
                        {
                                displayName: 'Model Name',
                                name: 'model',
                                type: 'string',
                                default: 'gpt-4o-mini',
                        },
                        {
                                displayName: 'Base URL (Opcional)',
                                name: 'baseUrl',
                                type: 'string',
                                default: '',
                        },
                        {
                                displayName: 'API Key (Si Aplica)',
                                name: 'apiKey',
                                type: 'string',
                                typeOptions: { password: true },
                                default: '',
                        },
                        {
                                displayName: 'Goal / Instruction',
                                name: 'goal',
                                type: 'string',
                                default: 'Book an appointment for patient 1234 tomorrow at 10:00',
                        },
                        {
                                displayName: 'Use ARDF When Available',
                                name: 'useArdf',
                                type: 'boolean',
                                default: true,
                        },
                        {
                                displayName: 'Habilitar Fallback (Prompts/Resources Como Tools)',
                                name: 'fallbackTools',
                                type: 'boolean',
                                default: true,
                        },
                ],
        };

        async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
                const serverUrl = this.getNodeParameter('serverUrl', 0) as string;
                const provider = this.getNodeParameter('provider', 0) as string;
                const model = this.getNodeParameter('model', 0) as string;
                const baseUrl = this.getNodeParameter('baseUrl', 0) as string;
                const apiKey = this.getNodeParameter('apiKey', 0) as string;
                const goal = this.getNodeParameter('goal', 0) as string;
                const useArdf = this.getNodeParameter('useArdf', 0) as boolean;
                const fallbackTools = this.getNodeParameter('fallbackTools', 0) as boolean;

                const client = await createMCPClient(serverUrl);
                const chat = makeChatLLM({ provider: provider as any, model, apiKey, baseUrl: baseUrl || undefined });

                let ardfIndex: { items: Array<Record<string, any>> } | null = null;
                if (useArdf) {
                        try {
                                const contents = await client.readResource('ardf://index');
                                const text = contents.find((content) => content.text)?.text;

                                if (text) {
                                        ardfIndex = ARDFIndex.parse(JSON.parse(text));
                                }
                        } catch (error) {
                                ardfIndex = null;
                        }
                }

                if (!ardfIndex) {
                        const [tools, prompts, resources] = await Promise.all([
                                client.listTools().catch(() => []),
                                client.listPrompts().catch(() => []),
                                client.listResources().catch(() => []),
                        ]);

                        const fallbackItems = [
                                ...tools.map((tool: any) => ({
                                        resource_id: tool.name,
                                        resource_type: 'tool',
                                        description: tool.description,
                                })),
                                ...prompts.map((prompt: any) => ({
                                        resource_id: prompt.name,
                                        resource_type: 'prompt',
                                })),
                                ...resources.map((resource: any) => ({
                                        resource_id: resource.uri ?? resource.name,
                                        resource_type: 'resource',
                                })),
                        ];

                        ardfIndex = { items: fallbackItems };
                }

                const plan = planWithARDF(goal, ardfIndex.items as any);

                const policyDescriptor = (ardfIndex.items as any).find(
                        (descriptor: any) => descriptor.resource_type === 'policy',
                );

                let policyText = '';
                if (policyDescriptor?.resource_id) {
                        try {
                                const contents = await client.readResource(policyDescriptor.resource_id);
                                policyText = contents.find((content) => content.text)?.text ?? '';
                        } catch (error) {
                                policyText = '';
                        }
                }

                const runLog: Array<Record<string, unknown>> = [];

                for (const step of plan) {
                        if (step.kind === 'workflow') {
                                await executeWorkflowStep(step, client, goal, policyText, chat, runLog);
                                continue;
                        }

                        if (step.kind === 'tool') {
                                const payload = inferToolArgsFromGoal(goal);
                                const output = await client.callTool(step.id, payload);
                                runLog.push({ type: 'tool', id: step.id, input: payload, output });
                                continue;
                        }

                        if (step.kind === 'prompt') {
                                const answer = await runPrompt(step.id, client, goal, policyText, chat);
                                runLog.push({ type: 'prompt', id: step.id, output: answer });
                        }
                }

                if (fallbackTools) {
                        runLog.push({
                                fallbackExamples: [
                                        {
                                                tool: 'prompt.run',
                                                args: {
                                                        name: 'notification_send',
                                                        vars: { name: 'Jane', date: '2025-10-08', time: '10:00' },
                                                },
                                        },
                                        { tool: 'resource.read', args: { id: 'policy_privacy_v1' } },
                                ],
                        });
                }

                const item: INodeExecutionData = {
                        json: {
                                goal,
                                plan: plan as PlanItem[],
                                runLog,
                        },
                };

                return [[item]];
        }

}

async function executeWorkflowStep(
        step: Extract<PlanItem, { kind: 'workflow' }>,
        client: Awaited<ReturnType<typeof createMCPClient>>,
        goal: string,
        policyText: string,
        chat: ReturnType<typeof makeChatLLM>,
        runLog: Array<Record<string, unknown>>,
): Promise<void> {
        for (const workflowStep of step.steps) {
                if (workflowStep.tool_id) {
                        const payload = inferToolArgsFromGoal(goal);
                        const output = await client.callTool(workflowStep.tool_id, payload);
                        runLog.push({
                                type: 'tool',
                                id: workflowStep.tool_id,
                                input: payload,
                                output,
                        });
                        continue;
                }

                if (workflowStep.prompt_id) {
                        const answer = await runPrompt(workflowStep.prompt_id, client, goal, policyText, chat);
                        runLog.push({ type: 'prompt', id: workflowStep.prompt_id, output: answer });
                }
        }
}

async function runPrompt(
        promptId: string,
        client: Awaited<ReturnType<typeof createMCPClient>>,
        goal: string,
        policyText: string,
        chat: ReturnType<typeof makeChatLLM>,
): Promise<string> {
        const prompt = await client.getPrompt(promptId);
        const resolved = resolvePromptMessages(prompt.messages ?? prompt.content?.messages ?? [], { goal });

        const policyMessage: ChatMessage | null = policyText
                ? { role: 'system', content: `POLICY:\n${policyText}` }
                : null;

        const messages: ChatMessage[] = [
                ...(policyMessage ? [policyMessage] : []),
                ...resolved,
        ];

        return chat(messages);
}

function resolvePromptMessages(templateMessages: PromptMessage[], vars: Record<string, string>): ChatMessage[] {
        const replace = (value: string) => value.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);

        return templateMessages.map((message) => ({
                role: message.role,
                content: replace(message.content),
        }));
}

function inferToolArgsFromGoal(goal: string): Record<string, string> {
        const idMatch = goal.match(/\b(\d{3,})\b/);
        const slotMatch = goal.match(/\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})\b/);

        return {
                patientId: idMatch?.[1] ?? '1234',
                slot: slotMatch?.[1] ?? '2025-10-08T10:00',
        };
}
