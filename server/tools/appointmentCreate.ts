import { z } from 'zod';

export const appointmentCreateTool = {
        schema: z.object({
                patientId: z.string(),
                slot: z.string(),
        }),
        handler: async ({ patientId, slot }: { patientId: string; slot: string }) => {
                const created = {
                        id: 'apt-001',
                        patientId,
                        slot,
                        status: 'confirmed',
                };

                return { content: [{ type: 'json', json: created }] };
        },
};
