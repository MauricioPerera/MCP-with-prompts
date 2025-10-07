import { z } from 'zod';

export const ARDFDescriptor = z.object({
        resource_id: z.string(),
        resource_type: z.enum([
                'tool',
                'prompt',
                'resource',
                'workflow',
                'policy',
                'model',
                'document',
        ]),
        description: z.string().optional(),
        when_to_use: z.string().optional(),
        content: z
                .object({
                        type: z.string(),
                        data: z.unknown(),
                })
                .optional(),
        metadata: z
                .object({
                        domain: z.string().optional(),
                        tags: z.array(z.string()).optional(),
                        version: z.string().optional(),
                        author: z.string().optional(),
                        ardf_version: z.string().default('1.0'),
                        mediaType: z.string().default('application/vnd.ardf+json'),
                })
                .partial()
                .default({}),
});

export type ARDFDescriptor = z.infer<typeof ARDFDescriptor>;

export const ARDFIndex = z.object({
        items: z.array(ARDFDescriptor),
        cursor: z.string().optional(),
});

export type ARDFIndex = z.infer<typeof ARDFIndex>;
