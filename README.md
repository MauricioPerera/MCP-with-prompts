![Banner image](https://user-images.githubusercontent.com/10284570/173569848-c624317f-42b1-45a6-ab09-f0ea3c247648.png)

# n8n-nodes-starter

This repo contains example nodes to help you get started building your own custom integrations for [n8n](https://n8n.io). It includes the node linter and other dependencies.

## MCP Nodes

Este paquete agrega dos nodos complementarios para trabajar con el [Model Context Protocol (MCP)](https://modelcontextprotocol.io):

* **MCP Server Trigger**: inicia un servidor MCP WebSocket directamente desde n8n y expone tools, prompts y recursos configurables desde la UI.
* **MCP Client**: permite consumir un servidor MCP existente listando y utilizando tools, prompts y recursos a través del SDK oficial.

Ambos nodos pueden combinarse en un mismo workflow para prototipar integraciones MCP sin salir de n8n.

### Configuración del MCP Server Trigger

El disparador del servidor MCP incorpora subnodos para describir y operar cada recurso MCP sin escribir código adicional:

* **Tools**: define nombre, descripción y esquema de argumentos y opcionalmente enlaza un subworkflow de n8n. El subworkflow recibe un item con `arguments`, `tool`, `description` y debe devolver texto o JSON para responder la llamada.
* **Prompts**: permite declarar mensajes estáticos, variables con metadatos (descripción, requerido y valor por defecto) y un subworkflow opcional que genere dinámicamente los mensajes a partir de las variables recibidas.
* **Recursos**: registra URI, metadatos y contenido base. También puede invocar un subworkflow para resolver el contenido de manera dinámica (por ejemplo, leer archivos o APIs externas) devolviendo texto o JSON con su `mimeType` correspondiente.

Cada entry incorpora campos adicionales para describir **ARDF (Agent Resource Description Format)**: cuándo utilizarlo, dominio, tags, versión, autor y media type. Estos metadatos se utilizan para generar un catálogo autodocumentado.

#### Catálogo ARDF opcional

La colección **ARDF** dentro del nodo permite publicar automáticamente:

* Un recurso `ardf://index` (URI configurable) con la lista de descriptores generados a partir de tus tools, prompts y recursos.
* Un tool `ardf.list` que filtra el índice por tipo, dominio o tags para clientes MCP con soporte limitado a tools.

Puedes personalizar dominio, autor y tags por defecto y sobrescribirlos por elemento. Para recursos también se expone el **tipo ARDF** (document, workflow, policy, etc.) para catalogar contenido especializado.

### Uso del MCP Client

El nodo cliente consume herramientas, prompts y recursos expuestos por cualquier servidor MCP (incluyendo el disparador anterior). Las operaciones devuelven la misma estructura de datos declarada por los subworkflows, por lo que puedes encadenar workflows que ejecuten tools, interpolen prompts o lean recursos remotos.

La operación **Listar ARDF** intentará llamar al tool `ardf.list` y, si no está disponible, leerá el recurso `ardf://index`. Puedes proporcionar filtros de tipo, tags y dominio desde la propia UI del nodo.

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
