![Banner image](https://user-images.githubusercontent.com/10284570/173569848-c624317f-42b1-45a6-ab09-f0ea3c247648.png)

# n8n-nodes-starter

This repo contains example nodes to help you get started building your own custom integrations for [n8n](https://n8n.io). It includes the node linter and other dependencies.

## MCP Nodes y servidor de ejemplo

Este paquete agrupa componentes listos para explorar el [Model Context Protocol (MCP)](https://modelcontextprotocol.io) desde n8n:

* **Servidor MCP de referencia (`/server`)**: proyecto TypeScript independiente que publica tools, prompts y resources de ejemplo junto con un catálogo **ARDF** (`ardf://index`) y el tool `ardf.list`.
* **Agent MCP (ARDF-aware)**: nuevo nodo que actúa como agente multi-modelo. Detecta descriptores ARDF, planifica pasos (workflows, tools y prompts) y ejecuta llamadas MCP apoyándose en el LLM que elijas.
* **MCP Server Trigger** y **MCP Client** existentes: continúan disponibles para construir servidores MCP dentro de n8n y consumirlos desde workflows clásicos.

Los tres nodos se pueden combinar para prototipar integraciones complejas. Además, el servidor de ejemplo te ayuda a validar rápidamente la interoperabilidad sin depender de infraestructura externa.

### Servidor MCP con catálogo ARDF

En la carpeta `/server` encontrarás un servidor MCP minimalista que usa el SDK oficial:

* **Tools**: `patient_lookup` y `appointment_create` devuelven JSON simulado para agilizar pruebas.
* **Prompt**: `notification_send` genera plantillas parametrizadas para confirmar citas.
* **Resources**: políticas y documentación en Markdown, junto con el catálogo `ardf://index`.
* **Tools auxiliares**: `ardf.list`, `prompt.run` y `resource.read` ofrecen filtros y fallbacks pensados para clientes que sólo soportan tools.

Para ejecutarlo basta con compilar el proyecto (`npm run build`) y lanzar `node dist/server/index.js` o bien utilizar `ts-node` durante el desarrollo. El transporte por defecto es `stdio`, pero puedes adaptar fácilmente la conexión a WebSocket u otros transports disponibles en el SDK.

### Nodo Agent MCP (ARDF-aware)

El nuevo nodo `Agent MCP` amplía el ecosistema MCP dentro de n8n:

1. **Descubrimiento ARDF**: intenta leer `ardf://index` y, si no existe, degrada a `tools/list`, `prompts/list` y `resources/list` estándar.
2. **Planificación heurística**: selecciona workflows completos cuando están disponibles, o bien combina tools y prompts relevantes según `when_to_use`, `description` y `tags`.
3. **Contexto y políticas**: descarga recursos tipo `policy` y los inyecta como mensaje de sistema antes de llamar al LLM.
4. **Ejecución multi-modelo**: elige proveedor y modelo (OpenAI, Anthropic, Mistral, Ollama u HuggingFace) para ejecutar prompts MCP o resolver pasos generados.
5. **Fallback opcional**: documenta cómo invocar `prompt.run` y `resource.read` como tools cuando un cliente MCP no soporta prompts/resources nativos.

El nodo devuelve un `runLog` detallado con cada paso ejecutado (tool invocado, prompt evaluado y salidas producidas), lo que facilita integrar los resultados en el resto de tu workflow.

### MCP Server Trigger y MCP Client

Los nodos originales siguen presentes:

* **MCP Server Trigger**: levanta un servidor MCP directamente desde n8n y permite declarar tools, prompts y resources sin salir del editor.
* **MCP Client**: conecta con un servidor MCP existente para listar y utilizar herramientas, plantillas y recursos.

Puedes combinar el nuevo `Agent MCP` con estos nodos para cerrar el ciclo completo: definir recursos, publicarlos, consumirlos desde un agente y orquestar workflows adicionales en n8n.

To make your custom node available to the community, you must create it as an npm package, and [submit it to the npm registry](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry).

If you would like your node to be available on n8n cloud you can also [submit your node for verification](https://docs.n8n.io/integrations/creating-nodes/deploy/submit-community-nodes/).

## Prerequisites

You need the following installed on your development machine:

* [git](https://git-scm.com/downloads)
* Node.js and npm. Minimum version Node 20. You can find instructions on how to install both using nvm (Node Version Manager) for Linux, Mac, and WSL [here](https://github.com/nvm-sh/nvm). For Windows users, refer to Microsoft's guide to [Install NodeJS on Windows](https://docs.microsoft.com/en-us/windows/dev-environment/javascript/nodejs-on-windows).
* Install n8n with:
  ```
  npm install n8n -g
  ```
* Recommended: follow n8n's guide to [set up your development environment](https://docs.n8n.io/integrations/creating-nodes/build/node-development-environment/).

## Using this starter

These are the basic steps for working with the starter. For detailed guidance on creating and publishing nodes, refer to the [documentation](https://docs.n8n.io/integrations/creating-nodes/).

1. [Generate a new repository](https://github.com/n8n-io/n8n-nodes-starter/generate) from this template repository.
2. Clone your new repo:
   ```
   git clone https://github.com/<your organization>/<your-repo-name>.git
   ```
3. Run `npm i` to install dependencies.
4. Open the project in your editor.
5. Browse the examples in `/nodes` and `/credentials`. Modify the examples, or replace them with your own nodes.
6. Update the `package.json` to match your details.
7. Run `npm run lint` to check for errors or `npm run lintfix` to automatically fix errors when possible.
8. Test your node locally. Refer to [Run your node locally](https://docs.n8n.io/integrations/creating-nodes/test/run-node-locally/) for guidance.
9. Replace this README with documentation for your node. Use the [README_TEMPLATE](README_TEMPLATE.md) to get started.
10. Update the LICENSE file to use your details.
11. [Publish](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry) your package to npm.

## More information

Refer to our [documentation on creating nodes](https://docs.n8n.io/integrations/creating-nodes/) for detailed information on building your own nodes.

## License

[MIT](https://github.com/n8n-io/n8n-nodes-starter/blob/master/LICENSE.md)
