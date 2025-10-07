import type { IDataObject } from 'n8n-workflow';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';

type TestContext = {
	endpoint: string;
	client: InstanceType<typeof Client>;
};

type TestCase = {
	name: string;
	run: (ctx: TestContext) => Promise<void>;
	skip?: (ctx: TestContext) => Promise<boolean>;
};

const defaultEndpoint = 'ws://127.0.0.1:3001';

function parseArgs(): { endpoint: string } {
	const args = process.argv.slice(2);
	let endpoint = defaultEndpoint;

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if ((arg === '--endpoint' || arg === '-e') && args[index + 1]) {
			endpoint = args[index + 1];
			index += 1;
		}
	}

	if (!/^wss?:\/\//i.test(endpoint)) {
		endpoint = `ws://${endpoint}`;
	}

	return { endpoint };
}

async function listTools(client: any) {
	const response = (await client.request('tools/list', {})) as IDataObject;
	const tools = (response.tools as IDataObject[]) ?? [];
	return tools.map((tool) => String(tool.name ?? '')).filter((name) => name.length > 0);
}

async function listPrompts(client: any) {
	const response = (await client.request('prompts/list', {})) as IDataObject;
	const prompts = (response.prompts as IDataObject[]) ?? [];
	return prompts.map((prompt) => String(prompt.name ?? '')).filter((name) => name.length > 0);
}

const testCases: TestCase[] = [
	{
		name: 'Server handshake',
		run: async ({ client }) => {
			const c: any = client;
			// MCP handshake is performed during connect; request a benign method to ensure communication works.
			await c.request('ping', {});
		},
	},
	{
		name: 'List tools',
		run: async ({ client }) => {
			const tools = await listTools(client);
			if (!Array.isArray(tools) || tools.length === 0) {
				throw new Error('tools/list did not return any tool names');
			}
		},
	},
	{
		name: 'Call sample tool',
		skip: async ({ client }) => {
			const tools = await listTools(client);
			return !tools.includes('ardf.list') && !tools.includes('patient_lookup');
		},
		run: async ({ client }) => {
			const tools = await listTools(client);
			let toolName = 'patient_lookup';
			let args: IDataObject = { patientId: 'TEST-123' };

			if (!tools.includes(toolName) && tools.includes('ardf.list')) {
				toolName = 'ardf.list';
				args = { type: 'tool' };
			}

			const c: any = client;
			const result = (await c.request('tools/call', {
				name: toolName,
				arguments: args,
			})) as IDataObject;

			const content = result.content as IDataObject[] | undefined;
			if (!content || content.length === 0) {
				throw new Error(`tools/call for ${toolName} returned no content`);
			}
		},
	},
	{
		name: 'Get prompt',
		skip: async ({ client }) => {
			const prompts = await listPrompts(client);
			return !prompts.includes('notification_send');
		},
		run: async ({ client }) => {
			const prompts = await listPrompts(client);
			const promptName = prompts.includes('notification_send') ? 'notification_send' : prompts[0];

			const c: any = client;
			const response = (await c.request('prompts/get', {
				name: promptName,
				arguments: { name: 'Alice', date: '2025-12-24', time: '14:00' },
			})) as IDataObject;

			const prompt = response.prompt as IDataObject | undefined;
			if (!prompt || !Array.isArray(prompt.messages) || prompt.messages.length === 0) {
				throw new Error(`prompts/get for ${promptName} returned no messages`);
			}
		},
	},
	{
		name: 'Read resource',
		skip: async ({ client }) => {
			const c: any = client;
			const response = (await c.request('resources/list', {})) as IDataObject;
			const resources = (response.resources as IDataObject[]) ?? [];
			if (resources.length === 0) return true;
			return false;
		},
		run: async ({ client }) => {
			const response = (await client.request('resources/list', {})) as IDataObject;
			const resources = ((response.resources as IDataObject[]) ?? []).map((resource) => ({
				name: String(resource.name ?? ''),
				uri: String(resource.uri ?? ''),
				mimeType: String(resource.mime_type ?? resource.mimeType ?? ''),
			}));

			if (resources.length === 0) {
				throw new Error('resources/list returned no resources');
			}

			const target = resources.find((resource) => resource.uri === 'ardf://index') ?? resources[0];

			const readResult = (await client.request('resources/read', { uri: target.uri })) as IDataObject;
			const contents = readResult.contents as IDataObject[] | undefined;
			if (!contents || contents.length === 0) {
				throw new Error(`resources/read for ${target.uri} returned no contents`);
			}
		},
	},
];

async function runTests(endpoint: string) {
	const client = new Client({
		name: 'mcp-test-suite',
		version: '0.1.0',
	});

	const transport = await WebSocketClientTransport.create({ url: endpoint });

	await client.connect(transport);

	const ctx: TestContext = { client, endpoint };
	const results: Array<{ name: string; status: 'passed' | 'skipped' | 'failed'; error?: string }> = [];

	for (const testCase of testCases) {
		try {
			if (testCase.skip && (await testCase.skip(ctx))) {
				results.push({ name: testCase.name, status: 'skipped' });
				continue;
			}

			await testCase.run(ctx);
			results.push({ name: testCase.name, status: 'passed' });
		} catch (error) {
			results.push({
				name: testCase.name,
				status: 'failed',
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	if (typeof transport.close === 'function') {
		await transport.close();
	}

	const passed = results.filter((result) => result.status === 'passed').length;
	const skipped = results.filter((result) => result.status === 'skipped').length;
	const failed = results.filter((result) => result.status === 'failed');

	for (const result of results) {
		if (result.status === 'passed') {
			console.log(`✔ ${result.name}`);
		} else if (result.status === 'skipped') {
			console.log(`⚪ ${result.name} (skipped)`);
		} else {
			console.error(`✖ ${result.name}: ${result.error ?? 'Unknown error'}`);
		}
	}

	console.log('');
	console.log(`Summary: ${passed} passed, ${failed.length} failed, ${skipped} skipped.`);

	if (failed.length > 0) {
		process.exitCode = 1;
	}
}

(async () => {
	const { endpoint } = parseArgs();

	try {
		await runTests(endpoint);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
})();
