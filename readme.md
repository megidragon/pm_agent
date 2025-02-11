# Project Manager Agent

El **Project Manager Agent** es un agente de IA construido en Node.js que actúa como gestor de proyectos para desarrollos web. Integra herramientas como Telegram, SQLite, y la API de OpenAI para administrar tareas, gestionar sprints semanales, interpretar comandos en lenguaje natural y mucho más.

## Características

- **Gestión de tareas:**
    - Crear, actualizar, asignar y completar tareas.
    - Separación de tareas en **título** y **descripción** (la descripción es opcional).
- **Sistema de usuarios y login:**
    - Registro de usuarios a través de Telegram, asociando el `telegram_id` con un nombre de usuario.
- **Gestión de sprints:**
    - Organiza las tareas por sprints semanales (de lunes a domingo).
- **Integración con OpenAI:**
    - Interpreta mensajes sin comando y genera acciones (p. ej., desglose de features en múltiples tareas).
    - Genera resúmes y preguntas sobre las estimaciones de tiempo.
- **Soporte para comandos de Telegram:**
    - `/login <nombre>`, `/addTask [descripción]`, `/updateTask [id] [nuevoStatus]`, `/listTasks`, `/summary` y `/help`.
- **Opcional:**
    - Integración con Google Calendar y Gmail para revisar eventos y correos electrónicos.

## Requisitos

- **Node.js** (versión 14 o superior)
- **npm**

## Instalación

1. **Clona el repositorio:**

   ```bash
   git clone https://github.com/tuusuario/pm-agent-nodejs.git
   cd pm-agent-nodejs
   ```

2. **Instala las dependencias:**

   ```bash
   npm install
   ```

3. **Configura las variables de entorno:**

   Crea un archivo `.env` en la raíz del proyecto y agrega lo siguiente (reemplazando los valores según corresponda):

   ```ini
   # Telegram
   TELEGRAM_BOT_TOKEN=tu_telegram_bot_token

   # OpenAI
   OPENAI_API_KEY=tu_openai_api_key

   # Base de datos
   DB_PATH=./project_manager.db

   # Google API (opcional)
   GOOGLE_CLIENT_ID=tu_google_client_id
   GOOGLE_CLIENT_SECRET=tu_google_client_secret
   GOOGLE_REDIRECT_URI=tu_google_redirect_uri
   GOOGLE_REFRESH_TOKEN=tu_google_refresh_token
   ```

4. **Inicia la aplicación:**

   ```bash
   node index.js
   ```

## Uso

- **Registro de usuario:**  
  En Telegram, usa el comando `/login <tu nombre>` para registrarte.

- **Gestión de tareas:**
    - **Crear tareas:**  
      Usa `/addTask [descripción]` para agregar una nueva tarea.  
      O bien, envía un mensaje en lenguaje natural (por ejemplo, "Quiero que desgloses la feature de implementar un sistema de pago para recargar tarjetas NFC usando la tarjeta de crédito en 4 tareas") y el agente interpretará y creará múltiples tareas.
    - **Actualizar tareas:**  
      Usa `/updateTask [id] [nuevoStatus]`.
    - **Listar tareas:**  
      Usa `/listTasks` para ver las tareas del sprint actual.
    - **Resumen del sprint:**  
      Usa `/summary` para generar un resumen de las tareas del sprint actual.

- **Interacción en lenguaje natural:**  
  Si envías un mensaje sin comando, el agente usará OpenAI para interpretar la solicitud, ejecutar la acción correspondiente y generar un mensaje final que resume las implicaciones de las tareas creadas, preguntando opcionalmente por las estimaciones de tiempo.

## Licencia

Este proyecto es de código abierto bajo la **Licencia MIT**.

```text
MIT License

Copyright (c) [Año] [Tu Nombre]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Contribuciones

Las contribuciones son bienvenidas. Por favor, abre un _issue_ o envía un _pull request_ para cualquier mejora o corrección.

## Contacto

Para preguntas o sugerencias, por favor contacta a [tu_email@ejemplo.com](mailto:tu_email@ejemplo.com).

