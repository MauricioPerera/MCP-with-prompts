# MCP Toolkit for n8n

This package delivers a complete toolset for working with the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) inside n8n. It contains:

- **MCP Server Trigger** - start a WebSocket-based MCP server directly from a workflow and expose tools, prompts, resources, and ARDF metadata.
- **MCP Client** - connect to any MCP server, list its capabilities, and invoke them from regular n8n flows.
- **Agent MCP (ARDF aware)** - run an agent that discovers ARDF catalogs, plans multi-step executions, and orchestrates LLM calls.
- **Reference MCP Server (`/server`)** - standalone TypeScript project with sample tools, prompts, resources, and an ARDF index for local testing.

All components are designed to work together, so you can prototype an end-to-end MCP environment without leaving n8n.

## Highlights

- Host and consume MCP resources from the same workflow.
- Provide structured metadata for ARDF-aware planners.
- Run dynamic subworkflows to generate responses on demand.
- Support multiple LLM providers (OpenAI, Anthropic, Mistral, Ollama, HuggingFace) through the Agent MCP node.
- Ship a ready-to-run demo server for quick validation.

## Requirements

- Node.js 20.15 or newer.
- n8n 1.0 or newer, installed locally or wherever you deploy custom nodes.
- npm (bundled with Node.js).

## Installation & Build

```bash
git clone <repo-url>
cd MCP-with-prompts
npm install
npm run build
```

`npm run build` compiles TypeScript to `dist/` and copies icon assets so n8n can load the nodes.

To install the package in your custom nodes directory:

```bash
npm install --omit=dev "<path-to-repo>/n8n-nodes-mcp-server-trigger-0.1.0.tgz"
```

Alternatively, create an npm link if you prefer a live workspace (`npm link` in the repo, then `npm link n8n-nodes-mcp-server-trigger` inside the custom nodes folder).

## MCP Server Trigger

The trigger node exposes a fully configurable MCP server. Each collection inside the node mirrors an MCP capability:

- **Tools** - define name, description, JSON schema for arguments, default templates, and an optional subworkflow. When a tool is invoked, the subworkflow receives a single item with `tool`, `description`, and `arguments`, letting you produce text or JSON responses dynamically.
- **Prompts** - declare static messages, variable descriptors (name, description, required, default), and an optional generator subworkflow. The generator can build the final prompt structure at runtime.
- **Resources** - register URI, MIME type, body, ARDF metadata, and an optional loader subworkflow that can fetch content on demand (text or JSON).
- **ARDF settings** - enable or disable ARDF output, configure the index URI, list tool name, default tags/domain/author, and expose a synthetic catalog.

### Events

The node emits:

- `serverListening` when the MCP server is ready (includes host, port, and ARDF info).
- `serverClosed` when the server stops, either manually or because the transport is closed.

## MCP Client

The client node connects to an MCP endpoint and lets you:

- List tools, prompts, and resources.
- Fetch prompt definitions with arguments interpolated.
- Read remote resources in text or JSON form.
- Execute tools with arbitrary arguments.

Use it to integrate external MCP servers into ordinary n8n workflows or to consume the MCP Server Trigger above.

## Agent MCP (ARDF aware)

Key capabilities:

1. **ARDF discovery** - attempts to read `ardf://index`, falling back to standard MCP listings when the catalog is missing.
2. **Planning** - prioritizes full workflows defined in ARDF (`workflow` descriptors), otherwise composes relevant tools/prompts by inspecting metadata (`when_to_use`, `tags`, `domain`).
3. **Context injection** - pulls policy or documentation resources and prepends them to the LLM conversation.
4. **Multi-model execution** - choose OpenAI, Anthropic, Mistral, Ollama, or HuggingFace to run the plan.
5. **Fallback helpers** - documents how to invoke `prompt.run` and `resource.read` as tools when the client lacks native support.

The node outputs a `runLog` describing each step, making it easy to audit or chain subsequent actions.

See `agents.md` for a quick-start walkthrough.

## Reference MCP Server

The `/server` directory includes a TypeScript MCP server that mirrors the configuration described above:

- Tools: `patient_lookup`, `appointment_create`, plus helpers for ARDF listing, prompts, and resources.
- Prompt: `notification_send`.
- Resources: privacy policy, protocol documentation, and an ARDF index.
- Transport: standard input/output via the official MCP SDK.

Run it with `npm run build` followed by `node dist/server/index.js`, or use `ts-node` during development.

## Development Scripts

- `npm run dev` - watch-mode TypeScript build.
- `npm run lint` - run ESLint on `nodes/`, `credentials/`, and `package.json`.
- `npm run lintfix` - ESLint with automatic fixes.
- `npm run format` - Prettier on `nodes/` and `credentials/`.
- `npm run build` - clean `dist/`, compile TypeScript, and copy icons.

## Publishing Tips

1. Verify `dist/` is up to date (`npm run build`).
2. Update `package.json` metadata (version, repository, keywords) before releasing.
3. Publish with `npm publish --access public` when ready.
4. Follow n8n's community-node submission guide if you want it listed publicly.

## License

Distributed under the [MIT](LICENSE.md) license.
