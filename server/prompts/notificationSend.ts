export const notificationPrompt = {
        get: async () => ({
                messages: [
                        {
                                role: 'system',
                                content: 'Eres un asistente que genera mensajes claros y cortos.',
                        },
                        {
                                role: 'user',
                                content: 'Confirma la cita al paciente {{name}} el {{date}} a las {{time}}.',
                        },
                ],
        }),
};
