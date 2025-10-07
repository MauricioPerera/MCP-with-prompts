export const privacyPolicyResource = {
        meta: {
                uri: 'policy://privacy@1.0.0',
                mimeType: 'text/markdown',
                title: 'Privacy Policy v1',
        },
        read: async () => ({
                contents: [
                        {
                                uri: 'policy://privacy@1.0.0',
                                mimeType: 'text/markdown',
                                text: '# Privacy Policy\nNo compartimos datos sin consentimiento.\n',
                        },
                ],
        }),
};
