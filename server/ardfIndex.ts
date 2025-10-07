import type { ARDFDescriptor, ARDFIndex } from '../ardf/schema';

export const ardfItems: ARDFDescriptor[] = [
        {
                resource_id: 'patient_lookup',
                resource_type: 'tool',
                description: 'Busca paciente por ID o atributos.',
                when_to_use: 'Cuando necesites verificar identidad o existencia de un paciente.',
                metadata: { domain: 'healthcare', tags: ['patient', 'lookup'] },
        },
        {
                resource_id: 'appointment_create',
                resource_type: 'tool',
                description: 'Crea una cita médica para un paciente.',
                when_to_use: 'Tras verificar paciente y slot disponible.',
                metadata: { domain: 'healthcare', tags: ['appointment'] },
        },
        {
                resource_id: 'notification_send',
                resource_type: 'prompt',
                description: 'Redacta notificación para confirmar cita.',
                when_to_use: 'Después de crear la cita, para notificar al usuario.',
                metadata: { domain: 'healthcare', tags: ['notification'] },
                content: {
                        type: 'prompt/messages',
                        data: {
                                messages: [
                                        {
                                                role: 'system',
                                                content: 'Eres un asistente que genera mensajes claros y cortos.',
                                        },
                                        {
                                                role: 'user',
                                                content:
                                                        'Confirma la cita al paciente {{name}} el {{date}} a las {{time}}.',
                                        },
                                ],
                        },
                },
        },
        {
                resource_id: 'medical_booking_flow',
                resource_type: 'workflow',
                description: 'Orquesta verificación de paciente, creación de cita y notificación.',
                when_to_use:
                        'Cuando el usuario pida reservar una cita suministrando identificador y preferencia de horario.',
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
                description: 'Política de privacidad y manejo de datos del paciente.',
                when_to_use: 'Siempre leer antes de procesar datos personales.',
                metadata: { domain: 'compliance', tags: ['privacy', 'policy'], version: '1.0.0' },
        },
];

export function getArdfIndexPage(): ARDFIndex {
        return { items: ardfItems };
}
