export type ChatMessage = {
        role: 'system' | 'user' | 'assistant';
        content: string;
};

export type ChatFn = (messages: ChatMessage[]) => Promise<string>;

export interface LLMConfig {
        provider: 'openai' | 'anthropic' | 'mistral' | 'ollama' | 'hf' | 'gemini';
        model: string;
        apiKey?: string;
        baseUrl?: string;
}

export function makeChatLLM(config: LLMConfig): ChatFn {
        switch (config.provider) {
                case 'openai':
                        return async (messages) => {
                                const { default: OpenAI } = await import('openai');
                                const client = new OpenAI({ apiKey: config.apiKey });
                                const response = await client.chat.completions.create({
                                        model: config.model,
                                        messages,
                                });

                                return response.choices?.[0]?.message?.content ?? '';
                        };
                case 'anthropic':
                        return async (messages) => {
                                const { default: Anthropic } = await import('@anthropic-ai/sdk');
                                const client = new Anthropic({ apiKey: config.apiKey });
                                const systemPrompt = messages.find((message) => message.role === 'system');
                                const turns = messages
                                        .filter((message) => message.role !== 'system')
                                        .map((message) => ({
                                                role: message.role === 'assistant' ? 'assistant' : 'user',
                                                content: message.content,
                                        }));

                                const response = await client.messages.create({
                                        model: config.model,
                                        system: systemPrompt?.content,
                                        messages: turns as any,
                                        max_tokens: 1024,
                                });

                                const first = response.content?.[0] as { text?: string } | undefined;
                                return first?.text ?? '';
                        };
                case 'mistral':
                        return async (messages) => {
                                const { Mistral } = await import('@mistralai/mistralai');
                                const client = new Mistral({ apiKey: config.apiKey });
                                const response = await client.chat.complete({
                                        model: config.model,
                                        messages: messages as any,
                                } as any);

                                return (
                                        (response as any)?.output?.[0]?.content ??
                                        (response as any)?.choices?.[0]?.message?.content ??
                                        ''
                                );
                        };
                case 'ollama':
                        return async (messages) => {
                                const url = `${config.baseUrl ?? 'http://localhost:11434'}/api/chat`;
                                const response = await fetch(url, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ model: config.model, messages }),
                                });
                                const data = await response.json();
                                return data?.message?.content ?? data?.choices?.[0]?.message?.content ?? '';
                        };
                case 'hf':
                        return async (messages) => {
                                const url = `${config.baseUrl ?? 'https://api-inference.huggingface.co/models/'}${config.model}`;
                                const response = await fetch(url, {
                                        method: 'POST',
                                        headers: {
                                                'Content-Type': 'application/json',
                                                ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
                                        },
                                        body: JSON.stringify({
                                                inputs: messages
                                                        .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
                                                        .join('\n'),
                                        }),
                                });
                                const data = await response.json();
                                if (Array.isArray(data)) {
                                        return data[0]?.generated_text ?? '';
                                }
                                return data?.generated_text ?? '';
                        };
                case 'gemini':
                        return async (messages) => {
                                const { GoogleGenerativeAI } = await import('@google/generative-ai');
                                const apiKey = config.apiKey ?? '';
                                const genAI = new GoogleGenerativeAI(apiKey);

                                const systemPrompt = messages.find((m) => m.role === 'system');
                                const turns = messages.filter((m) => m.role !== 'system');

                                const model = genAI.getGenerativeModel({
                                        model: config.model,
                                        ...(systemPrompt?.content ? { systemInstruction: systemPrompt.content } : {}),
                                } as any);

                                const history = turns.slice(0, Math.max(0, turns.length - 1)).map((m) => ({
                                        role: m.role === 'assistant' ? 'model' : 'user',
                                        parts: [{ text: m.content }],
                                }));

                                const chat = model.startChat({ history } as any);
                                const last = turns[turns.length - 1];
                                const prompt = last ? last.content : 'Continue.';
                                const result = await chat.sendMessage(prompt as any);

                                const response = (result as any)?.response;
                                if (response && typeof response.text === 'function') {
                                        return response.text();
                                }
                                return (
                                        response?.candidates?.[0]?.content?.parts?.[0]?.text ??
                                        ''
                                );
                        };
                default:
                        throw new Error(`Proveedor no soportado: ${config.provider}`);
        }
}
