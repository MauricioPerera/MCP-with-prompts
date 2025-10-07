import type { ARDFDescriptor, ARDFIndex } from '../ardf/schema';

export const ardfItems: ARDFDescriptor[] = [
        {
                resource_id: 'patient_lookup',
                resource_type: 'tool',
                description: 'Look up a patient by identifier or other attributes.',
                when_to_use: "Use when you need to confirm a patient's identity or existence.",
                metadata: { domain: 'healthcare', tags: ['patient', 'lookup'] },
        },
        {
                resource_id: 'appointment_create',
                resource_type: 'tool',
                description: 'Create a medical appointment for a patient.',
                when_to_use: 'After verifying the patient and finding an available slot.',
                metadata: { domain: 'healthcare', tags: ['appointment'] },
        },
        {
                resource_id: 'notification_send',
                resource_type: 'prompt',
                description: 'Draft a notification to confirm the appointment.',
                when_to_use: 'After creating the appointment to notify the user.',
                metadata: { domain: 'healthcare', tags: ['notification'] },
                content: {
                        type: 'prompt/messages',
                        data: {
                                messages: [
                                        {
                                                role: 'system',
                                                content: 'You are an assistant that produces clear, concise messages.',
                                        },
                                        {
                                                role: 'user',
                                                content:
                                                        'Confirm the appointment for patient {{name}} on {{date}} at {{time}}.',
                                        },
                                ],
                        },
                },
        },
        {
                resource_id: 'medical_booking_flow',
                resource_type: 'workflow',
                description: 'Orchestrates patient verification, appointment creation, and notification.',
                when_to_use:
                        'When the user requests an appointment and provides an identifier plus a preferred time slot.',
                metadata: {
                        domain: 'healthcare',
                        tags: ['workflow', 'coordination'],
                        version: '1.0.0',
                },
                content: {
                        type: 'workflow/steps',
                        data: {
                                steps: [
                                        { step: 'verify_patient', tool_id: 'patient_lookup' },
                                        { step: 'create_booking', tool_id: 'appointment_create' },
                                        { step: 'notify_user', prompt_id: 'notification_send' },
                                ],
                        },
                },
        },
        {
                resource_id: 'policy_privacy_v1',
                resource_type: 'policy',
                description: 'Privacy policy and guidance for handling patient data.',
                when_to_use: 'Always read before processing personal data.',
                metadata: { domain: 'compliance', tags: ['privacy', 'policy'], version: '1.0.0' },
        },
];

export function getArdfIndexPage(): ARDFIndex {
        return { items: ardfItems };
}
