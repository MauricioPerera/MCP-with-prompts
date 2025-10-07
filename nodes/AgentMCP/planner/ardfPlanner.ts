import type { ARDFDescriptor } from '../../../ardf/schema';

export type PlanItem =
        | { kind: 'workflow'; id: string; steps: Array<{ step: string; tool_id?: string; prompt_id?: string }> }
        | { kind: 'tool'; id: string }
        | { kind: 'prompt'; id: string };

export function planWithARDF(goal: string, items: ARDFDescriptor[]): PlanItem[] {
        const normalizedGoal = goal.toLowerCase();

        const workflow = items.find(
                (descriptor) =>
                        descriptor.resource_type === 'workflow' &&
                        ((descriptor.when_to_use ?? '').toLowerCase().includes('reservar') ||
                                descriptor.metadata?.tags?.includes('workflow')),
        );

        if (workflow?.content?.type === 'workflow/steps') {
                const steps = Array.isArray((workflow.content.data as any)?.steps)
                        ? ((workflow.content.data as any).steps as Array<{
                                  step: string;
                                  tool_id?: string;
                                  prompt_id?: string;
                          }>)
                        : [];

                return [
                        {
                                kind: 'workflow',
                                id: workflow.resource_id,
                                steps,
                        },
                ];
        }

        const picks: PlanItem[] = [];

        for (const descriptor of items) {
                const blob = `${descriptor.when_to_use ?? ''} ${descriptor.description ?? ''} ${(descriptor.metadata?.tags ?? []).join(' ')}`.toLowerCase();

                if (!blob) {
                        continue;
                }

                if (blob.includes('paciente') || normalizedGoal.includes('cita')) {
                        if (descriptor.resource_type === 'tool') {
                                picks.push({ kind: 'tool', id: descriptor.resource_id });
                        }

                        if (descriptor.resource_type === 'prompt') {
                                picks.push({ kind: 'prompt', id: descriptor.resource_id });
                        }
                }
        }

        if (!picks.length) {
                picks.push({ kind: 'prompt', id: 'notification_send' });
        }

        return picks;
}
