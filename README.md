# MCP Server Trigger para n8n

Este paquete anade un nodo trigger para [n8n](https://n8n.io) que levanta un servidor MCP (Model Context Protocol) via WebSocket. El nodo permite exponer herramientas, prompts y recursos compatibles con clientes MCP, facilitando la orquestacion de agentes y flujos de IA directamente en n8n.

## Caracteristicas principales

- Servidor MCP embebido que escucha en el host y puerto definidos.
- Definicion declarativa de tools con validacion opcional mediante JSON Schema y plantillas de respuesta.
- Gestion de colecciones de prompts con mensajes por rol, variables declarativas y generacion dinamica via subworkflows.
- Exposicion de recursos estaticos (texto o JSON) accesibles por URI, con opcion de resolverlos dinamicamente mediante subworkflows.
- Emision de eventos `serverListening` y `serverClosed` para integrar el estado del servidor dentro del workflow.
- Integracion opcional con subworkflows de n8n para personalizar la ejecucion de tools, prompts y recursos sin escribir codigo adicional.

## MCP Nodes y servidor de ejemplo

Este paquete agrupa componentes listos para explorar el [Model Context Protocol (MCP)](https://modelcontextprotocol.io) desde n8n:

- **Servidor MCP de referencia (`/server`)**: proyecto TypeScript independiente que publica tools, prompts y resources de ejemplo junto con un catalogo **ARDF** (`ardf://index`) y el tool `ardf.list`.
- **Agent MCP (ARDF-aware)**: nuevo nodo que actua como agente multi-modelo. Detecta descriptores ARDF, planifica pasos (workflows, tools y prompts) y ejecuta llamadas MCP apoyandose en el LLM que elijas.
- **MCP Server Trigger** y **MCP Client** existentes: continuan disponibles para construir servidores MCP dentro de n8n y consumirlos desde workflows clasicos.

Los tres nodos se pueden combinar para prototipar integraciones complejas. Ademas, el servidor de ejemplo te ayuda a validar rapidamente la interoperabilidad sin depender de infraestructura externa.

### Servidor MCP con catalogo ARDF

En la carpeta `/server` encontraras un servidor MCP minimalista que usa el SDK oficial:

- **Tools**: `patient_lookup` y `appointment_create` devuelven JSON simulado para agilizar pruebas.
- **Prompt**: `notification_send` genera plantillas parametrizadas para confirmar citas.
- **Resources**: politicas y documentacion en Markdown, junto con el catalogo `ardf://index`.
- **Tools auxiliares**: `ardf.list`, `prompt.run` y `resource.read` ofrecen filtros y fallbacks pensados para clientes que solo soportan tools.

Para ejecutarlo basta con compilar el proyecto (`npm run build`) y lanzar `node dist/server/index.js`, o bien utilizar `ts-node` durante el desarrollo. El transporte por defecto es `stdio`, pero puedes adaptar facilmente la conexion a WebSocket u otros transports disponibles en el SDK.

### Nodo Agent MCP (ARDF-aware)

El nodo `Agent MCP` amplia el ecosistema MCP dentro de n8n:

1. **Descubrimiento ARDF**: intenta leer `ardf://index` y, si no existe, degrada a `tools/list`, `prompts/list` y `resources/list` estandar.
2. **Planificacion heuristica**: selecciona workflows completos cuando estan disponibles, o bien combina tools y prompts relevantes segun `when_to_use`, `description` y `tags`.
3. **Contexto y politicas**: descarga recursos tipo `policy` y los inyecta como mensaje de sistema antes de llamar al LLM.
4. **Ejecucion multi-modelo**: elige proveedor y modelo (OpenAI, Anthropic, Mistral, Ollama u HuggingFace) para ejecutar prompts MCP o resolver pasos generados.
5. **Fallback opcional**: documenta como invocar `prompt.run` y `resource.read` como tools cuando un cliente MCP no soporta prompts/resources nativos.

El nodo devuelve un `runLog` detallado con cada paso ejecutado (tool invocado, prompt evaluado y salidas producidas), lo que facilita integrar los resultados en el resto de tu workflow.

### MCP Server Trigger y MCP Client

Los nodos originales siguen presentes:

- **MCP Server Trigger**: levanta un servidor MCP directamente desde n8n y permite declarar tools, prompts y resources sin salir del editor.
- **MCP Client**: conecta con un servidor MCP existente para listar y utilizar herramientas, plantillas y recursos.

Puedes combinar el nuevo `Agent MCP` con estos nodos para cerrar el ciclo completo: definir recursos, publicarlos, consumirlos desde un agente y orquestar workflows adicionales en n8n.

### Configuracion del MCP Server Trigger

El disparador del servidor MCP incorpora subnodos para describir y operar cada recurso MCP sin escribir codigo adicional:

- **Tools**: define nombre, descripcion, esquema de argumentos y permite enlazar un subworkflow de n8n. El subworkflow recibe un item con `arguments`, `tool`, `description` y debe devolver texto o JSON para responder la llamada.
- **Prompts**: permite declarar mensajes estaticos, variables con metadatos (descripcion, requerido y valor por defecto) y un subworkflow opcional que genere dinamicamente los mensajes a partir de las variables recibidas.
- **Recursos**: registra URI, metadatos y contenido base. Tambien puede invocar un subworkflow para resolver el contenido de manera dinamica (por ejemplo, leer archivos o APIs externas) devolviendo texto o JSON con su `mimeType` correspondiente.

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
2. Anade los nodos **MCP Server Trigger**, **MCP Client** o **Agent MCP** al workflow segun necesites.
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
