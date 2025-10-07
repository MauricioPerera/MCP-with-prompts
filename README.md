# MCP Server Trigger para n8n

Este paquete anade un nodo trigger para [n8n](https://n8n.io) que levanta un servidor MCP (Model Context Protocol) via WebSocket. El nodo permite exponer herramientas, prompts y recursos compatibles con clientes MCP, facilitando la orquestacion de agentes y flujos de IA directamente desde n8n.

## Caracteristicas principales

- Servidor MCP embebido que escucha en el host y puerto definidos.
- Definicion declarativa de tools con validacion opcional mediante JSON Schema y plantillas de respuesta.
- Gestion de colecciones de prompts con mensajes por rol, variables declarativas y generacion dinamica via subworkflows.
- Exposicion de recursos estaticos (texto o JSON) accesibles por URI, con opcion de resolverlos dinamicamente mediante subworkflows.
- Emision de eventos `serverListening` y `serverClosed` para integrar el estado del servidor dentro del workflow.
- Integracion opcional con subworkflows de n8n para personalizar la ejecucion de tools, prompts y recursos sin escribir codigo adicional.

## MCP Nodes

Este paquete agrega dos nodos complementarios para trabajar con el [Model Context Protocol (MCP)](https://modelcontextprotocol.io):

* **MCP Server Trigger**: inicia un servidor MCP WebSocket directamente desde n8n y expone tools, prompts y recursos configurables desde la UI.
* **MCP Client**: permite consumir un servidor MCP existente listando y utilizando tools, prompts y recursos a traves del SDK oficial.

Ambos nodos pueden combinarse en un mismo workflow para prototipar integraciones MCP sin salir de n8n.

### Configuracion del MCP Server Trigger

El disparador del servidor MCP incorpora subnodos para describir y operar cada recurso MCP sin escribir codigo adicional:

* **Tools**: define nombre, descripcion, esquema de argumentos y permite enlazar un subworkflow de n8n. El subworkflow recibe un item con `arguments`, `tool`, `description` y debe devolver texto o JSON para responder la llamada.
* **Prompts**: permite declarar mensajes estaticos, variables con metadatos (descripcion, requerido y valor por defecto) y un subworkflow opcional que genere dinamicamente los mensajes a partir de las variables recibidas.
* **Recursos**: registra URI, metadatos y contenido base. Tambien puede invocar un subworkflow para resolver el contenido de manera dinamica (por ejemplo, leer archivos o APIs externas) devolviendo texto o JSON con su `mimeType` correspondiente.

### Uso del MCP Client

El nodo cliente consume herramientas, prompts y recursos expuestos por cualquier servidor MCP (incluyendo el disparador anterior). Las operaciones devuelven la misma estructura de datos declarada por los subworkflows, por lo que puedes encadenar workflows que ejecuten tools, interpolen prompts o lean recursos remotos.

## Requisitos

- Node.js 20.15 o superior.
- n8n 1.0+ instalado localmente o en el entorno donde se desplegara el nodo.
- npm (incluido con Node.js).

## Instalacion y compilacion

```bash
git clone <url-de-este-repo>
cd MCP-with-prompts
npm install
npm run build
```

El comando `npm run build` genera la carpeta `dist/` con los artefactos listos para ser usados por n8n y optimiza los iconos SVG mediante `gulp`.

## Uso en n8n

1. Desde tu carpeta de nodos personalizados (`~/.n8n/custom/` por defecto) ejecuta `npm install --omit=dev "<ruta-a-este-proyecto>"` o crea un enlace simbolico (`npm link` / `npm link "<ruta>"`). Esto instala la carpeta completa con su `package.json`, que a su vez carga los artefactos generados en `dist/`.
2. Anade los nodos **MCP Server Trigger** o **MCP Client** al workflow segun necesites.
3. Configura el servidor MCP:
   - **Servidor**: define `host`, `port`, `serverName` y `serverVersion`. El puerto debe estar entre 1 y 65535.
   - **Tools**: cada elemento necesita un `name`. Puedes anadir `description`, `inputSchema` (JSON), `responseTemplate`, `responseType` (`text` o `json`) y un subworkflow opcional para procesar las llamadas.
   - **Prompts**: registra multiples prompts con mensajes por rol, variables declaradas y un subworkflow generador opcional.
   - **Recursos**: expone contenido mediante `uri`, con soporte para texto o JSON, configuracion de `mimeType` y un subworkflow opcional que cargue el contenido dinamicamente.
4. Activa el workflow. El primer item emitido contiene `event: "serverListening"` junto con host, puerto y contadores de herramientas/prompts/recursos. Al detenerlo se emite `event: "serverClosed"`.

### Eventos emitidos

- `serverListening`: el servidor esta aceptando conexiones.
- `serverClosed`: el servidor fue detenido manualmente o por flujo.

## Desarrollo

Scripts disponibles:

- `npm run dev`: compila TypeScript en modo watch.
- `npm run lint`: ejecuta ESLint sobre `nodes/`, `credentials/` y `package.json`.
- `npm run lintfix`: mismo alcance que `lint` pero intenta corregir errores automaticamente.
- `npm run format`: aplica Prettier a `nodes/` y `credentials/`.
- `npm run build`: limpia `dist/`, compila TypeScript y procesa iconos.

### Recomendaciones

- Ejecuta `npm run lint` antes de publicar o compartir cambios.
- Ajusta `package.json` para reflejar tu organizacion (nombre, `homepage`, `repository`, autor).
- Anade pruebas manuales conectando un cliente MCP (por ejemplo, la CLI del MCP SDK) al host y puerto configurados.

## Publicacion

Si deseas compartir el nodo:

1. Asegurate de que `dist/` contenga los archivos generados.
2. Actualiza `package.json` con version, palabras clave y metadata reales.
3. Publica en npm con `npm publish --access public` (o el flujo que utilices).
4. Sigue la guia oficial de n8n para proponer el nodo en la comunidad si lo crees oportuno.

## Licencia

Este proyecto se distribuye bajo licencia [MIT](LICENSE.md).
