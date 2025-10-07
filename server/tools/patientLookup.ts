import { z } from 'zod';

export const patientLookupTool = {
        schema: z.object({
                patientId: z.string().optional(),
                email: z.string().optional(),
        }),
        handler: async ({ patientId, email }: { patientId?: string; email?: string }) => {
                const found = {
                        id: patientId ?? '1234',
                        name: 'Jane Doe',
                        email: email ?? 'jane@example.com',
                };

                return { content: [{ type: 'json', json: found }] };
        },
};
