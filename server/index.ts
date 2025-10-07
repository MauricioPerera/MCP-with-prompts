import { ardfItems, getArdfIndexPage } from './ardfIndex';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { appointmentCreateTool } from './tools/appointmentCreate';
import { patientLookupTool } from './tools/patientLookup';
import { notificationPrompt } from './prompts/notificationSend';
import { privacyPolicyResource } from './resources/policies/privacy';
import { protocolDocResource } from './resources/docs/protocol';

async function main(): Promise<void> {
        const server = new Server({ name: 'mcp-ardf-demo', version: '0.1.0' }) as any;

        server.registerTool('patient_lookup', patientLookupTool.schema, patientLookupTool.handler);
        server.registerTool(
                'appointment_create',
                appointmentCreateTool.schema,
                appointmentCreateTool.handler,
        );

        server.registerPrompt('notification_send', notificationPrompt.get, {
                title: 'Notification Send',
        });

        server.registerResource(
                'policy_privacy_v1',
                privacyPolicyResource.meta,
                privacyPolicyResource.read,
        );

        server.registerResource(
                'protocol_doc_v1',
                protocolDocResource.meta,
                protocolDocResource.read,
        );

        server.registerResource(
                'ardf-index',
                {
                        uri: 'ardf://index',
                        mimeType: 'application/vnd.ardf+json',
                        title: 'ARDF Index',
                },
                async () => {
                        const index = getArdfIndexPage();
                        return {
                                contents: [
                                        {
                                                uri: 'ardf://index',
                                                mimeType: 'application/vnd.ardf+json',
                                                text: JSON.stringify(index),
                                        },
                                ],
                        };
                },
        );

        const ArdfListInput = z.object({
                type: z.string().optional(),
                tags: z.array(z.string()).optional(),
                domain: z.string().optional(),
        });

        type ArdfListInputData = z.infer<typeof ArdfListInput>;

        server.registerTool('ardf.list', ArdfListInput, async ({ type, tags, domain }: ArdfListInputData) => {
                let items = ardfItems;

                if (type) {
                        items = items.filter((descriptor) => descriptor.resource_type === type);
                }

                if (domain) {
                        items = items.filter((descriptor) => descriptor.metadata?.domain === domain);
                }

                if (tags?.length) {
                        items = items.filter((descriptor) => {
                                const descriptorTags = descriptor.metadata?.tags ?? [];
                                return descriptorTags.some((tag) => tags.includes(tag));
                        });
                }

                return { content: [{ type: 'json', json: { items } }] };
        });

        const PromptRunInput = z.object({ name: z.string(), vars: z.record(z.string()).optional() });

        server.registerTool(
                'prompt.run',
                PromptRunInput,
                async ({ name, vars }: z.infer<typeof PromptRunInput>) => {
                        if (name !== 'notification_send') {
                                return {
                                        content: [
                                                {
                                                        type: 'text',
                                                        text: `Prompt "${name}" not found`,
                                                },
                                        ],
                                };
                        }

                        const prompt = await notificationPrompt.get();
                        const resolved = (prompt.messages ?? []).map((message) => ({
                                ...message,
                                content:
                                        typeof message.content === 'string'
                                                ? renderPrompt(message.content, vars ?? {})
                                                : message.content,
                        }));

                        return { content: [{ type: 'json', json: { messages: resolved } }] };
                },
        );

        const ResourceReadInput = z.object({ id: z.string() });

        server.registerTool(
                'resource.read',
                ResourceReadInput,
                async ({ id }: z.infer<typeof ResourceReadInput>) => {
                        if (id === 'policy_privacy_v1') {
                                return privacyPolicyResource.read();
                        }

                        if (id === 'protocol_doc_v1') {
                                return protocolDocResource.read();
                        }

                        return {
                                content: [
                                        {
                                                type: 'text',
                                                text: `Resource "${id}" not found`,
                                        },
                                ],
                        };
                },
        );

        const transport = new StdioServerTransport();
        await server.connect(transport);
}

function renderPrompt(template: string, vars: Record<string, string>): string {
        return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

main().catch((error) => {
        console.error(error);
        process.exit(1);
});
