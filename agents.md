# Agent MCP en n8n

Este repositorio incluye un nodo **Agent MCP** que actua como puente entre n8n y servidores compatibles con el Model Context Protocol (MCP). El agente puede descubrir catálogos ARDF, planificar pasos usando tools, prompts y resources, y ejecutar cada paso apoyándose en proveedores de LLM configurables.

## Capacidades principales

- **Descubrimiento ARDF**: intenta leer `ardf://index` para obtener workflows, tools y recursos enriquecidos. Si no está disponible, degrada a las llamadas clásicas `tools/list`, `prompts/list` y `resources/list`.
- **Planificación heurística**: selecciona workflows completos cuando existen o compone herramientas y prompts según la metadata `when_to_use`, `tags`, `domain` y `description`.
- **Contexto enriquecido**: recupera policies o documentación y las inyecta como mensajes de sistema antes de llamar al modelo.
- **Ejecución multi-modelo**: permite usar OpenAI, Anthropic, Mistral, Ollama o HuggingFace (según el provider configurado) para generar respuestas o resolver subtareas.
- **Fallback clásico**: documenta cómo invocar `prompt.run` y `resource.read` cuando el cliente MCP solo soporta tools.

## Requisitos previos

1. **Servidor MCP**: puedes usar el que expone este repositorio en `server/` o cualquier instancia externa con soporte ARDF.
2. **Credenciales LLM**: configura las credenciales necesarias para el proveedor que elijas (apikey, endpoint, etc.).
3. **n8n >= 1.0**: instala este paquete en la carpeta de nodos personalizados y ejecuta `npm run build`.

## Configuración básica

1. Genera los artefactos:
   ```bash
   npm install
   npm run build
   ```
2. Instala el paquete en la carpeta de nodos personalizados de n8n:
   ```bash
   npm install --omit=dev "<ruta-al-repo>/n8n-nodes-mcp-server-trigger-0.1.0.tgz"
   ```
3. Reinicia n8n y arrastra el nodo **Agent MCP** al canvas.
4. Define:
   - **Servidor MCP**: URL o transporte (WebSocket/stdio) al servidor.
   - **Proveedor LLM**: selecciona proveedor y modelo.
   - **Modo de resolución** (planificación automática, modo directo, etc.).
   - Opcional: reglas para prompts, policies, filtros por tags o dominios.

## Flujo de trabajo típico

1. **Preparar el servidor**: ejecuta `node dist/server/index.js` para levantar el demo MCP incluido (publica tools, prompts y recursos ARDF-ready).
2. **Configurar el agente**: ingresa la URL del servidor (por ejemplo `ws://127.0.0.1:3001`) y selecciona el LLM.
3. **Proveer la tarea**: en el workflow, alimenta al nodo Agent MCP con un objetivo (ej. “programar una cita con ID de paciente 123”).
4. **Revisar el `runLog`**: la salida contiene cada paso ejecutado (tool invocado, prompts resueltos y resultados). Puedes encadenar el `runLog` con otros nodos para auditar o persistir la ejecución.

## Combos recomendados

- **MCP Server Trigger** + **MCP Client** + **Agent MCP**: crea recursos dentro de n8n, publícalos, consúmelos desde el cliente y orquesta acciones complejas con el agente.
- **Servidor stand-alone (`/server`)** + **Agent MCP**: usa el servidor demo como backend y valida los flujos del agente sin depender de infraestructura adicional.

## Buenas prácticas

- Añade descripciones ricas (`when_to_use`, `tags`, `domain`) a cada tool/prompt/recurso para mejorar la planificación.
- Mantén versiones (`ardfVersion`) y `mediaType` consistentes para que el catálogo sea predecible.
- Loguea y evalúa el `runLog` para ajustar la planificación o agregar mecanismos de aprobación humana.

Con estos pasos tendrás un agente MCP plenamente operativo en n8n, listo para explorar integraciones complejas con catálogos ARDF y herramientas externas.  
