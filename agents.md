# Agent MCP Quick Reference

The **Agent MCP** node bridges n8n workflows with Model Context Protocol (MCP) servers. It discovers ARDF catalogs, plans multi-step executions, and calls LLMs to complete high-level requests.

## Core Features

- **ARDF discovery** - reads `ardf://index` when available and falls back to standard MCP listings otherwise.
- **Heuristic planning** - selects full workflows provided by ARDF or combines tools/prompts using metadata such as `when_to_use`, `tags`, and `domain`.
- **Context injection** - downloads policy or documentation resources and prepends them to the conversation.
- **Multi-model execution** - supports OpenAI, Anthropic, Mistral, Ollama, and HuggingFace providers.
- **Fallback helpers** - documents how to use `prompt.run` and `resource.read` as tools when native support is missing.

## Prerequisites

1. MCP server endpoint (for example the demo in `/server`, run with `node dist/server/index.js`).
2. LLM credentials configured in n8n for the provider you intend to use.
3. The latest build of this package (`npm install` followed by `npm run build`).

## Setup Steps

1. Install the package inside the n8n custom nodes directory:
   ```bash
   npm install --omit=dev "<path-to-repo>/n8n-nodes-mcp-server-trigger-0.1.0.tgz"
   ```
2. Restart n8n and add the **Agent MCP** node to your workflow.
3. Configure the connection (MCP endpoint, transport, authentication if required).
4. Select the LLM provider/model and planning options (auto planner, direct call, tag filters, etc.).
5. Provide an input item describing the goal, for example "Schedule an appointment for patient 123 tomorrow at 14:00."

## Execution Flow

1. The agent attempts to download the ARDF index. If it exists, descriptors guide the plan; otherwise the agent lists tools/prompts/resources directly.
2. Policies or supporting documents are fetched and injected into the conversation when tagged as such.
3. The agent builds a plan: workflow execution, tool invocations, prompt evaluations, or combinations thereof.
4. Each step is executed via MCP (tool call, prompt retrieval, resource read) and passed to the configured LLM.
5. The node outputs a `runLog` array showing the decision path plus the final response.

## Best Practices

- Provide rich ARDF metadata (`when_to_use`, `tags`, `domain`, `mediaType`, `author`, `version`) for every tool, prompt, and resource.
- Version the catalog so agents can confirm compatibility.
- Persist or review the `runLog` to audit actions or notify humans before committing critical changes.

Combine the Agent MCP node with the MCP Server Trigger and MCP Client nodes to build complete MCP workflows within n8n.
