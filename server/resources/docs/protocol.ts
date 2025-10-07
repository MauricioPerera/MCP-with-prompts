export const protocolDocResource = {
        meta: {
                uri: 'doc://medical-protocol@1.0.0',
                mimeType: 'text/markdown',
                title: 'Medical Protocol',
        },
        read: async () => ({
                contents: [
                        {
                                uri: 'doc://medical-protocol@1.0.0',
                                mimeType: 'text/markdown',
                                text: '# Protocol\n1) Verify patient\n2) Create appointment\n3) Notify user\n',
                        },
                ],
        }),
};
