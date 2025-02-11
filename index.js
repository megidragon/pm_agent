// index.js
import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import sqlite3 from 'sqlite3';
import cron from 'node-cron';
import { google } from 'googleapis';
import { Configuration, OpenAIApi } from 'openai';

// Inicialización de la base de datos
const db = new sqlite3.Database(process.env.DB_PATH || './project_manager.db');

db.serialize(() => {
    // Tabla de usuarios
    db.run(`CREATE TABLE IF NOT EXISTS users (
    telegram_id TEXT PRIMARY KEY,
    username TEXT,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
    // Tabla de sprints
    db.run(`CREATE TABLE IF NOT EXISTS sprints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    start_date TEXT,
    end_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
    // Tabla de tareas
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    status TEXT,
    assigned_to TEXT,
    sprint_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Inicialización del bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

/**
 * Envía la respuesta del bot junto con el listado de comandos.
 */
function sendReply(chatId, message) {
    const availableCommands = `Atajos: /listTasks | /summary | /help`;
    bot.sendMessage(chatId, message + availableCommands);
}

/**
 * Obtiene (o crea) el sprint correspondiente a la semana actual (de lunes a domingo).
 * Se usa la cláusula SQL BETWEEN para comparar la fecha actual.
 */
function getCurrentSprint() {
    return new Promise((resolve, reject) => {
        let now = new Date();
        let day = now.getDay();
        let diff = now.getDate() - day + (day === 0 ? -6 : 1);
        let monday = new Date(now);
        monday.setDate(diff);
        monday.setHours(0, 0, 0, 0);
        let sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        let startDate = monday.toISOString();
        let endDate = sunday.toISOString();

        // Consulta usando BETWEEN para ver si existe un sprint que incluya la fecha actual
        db.get(
            "SELECT * FROM sprints WHERE ? BETWEEN start_date AND end_date ORDER BY start_date DESC LIMIT 1",
            [now.toISOString()],
            (err, row) => {
                if (err) {
                    console.error("Error en getCurrentSprint:", err);
                    return reject(err);
                }
                if (row) {
                    resolve(row);
                } else {
                    const sprintName = `Sprint ${monday.toLocaleDateString()} - ${sunday.toLocaleDateString()}`;
                    db.run(
                        "INSERT INTO sprints (name, start_date, end_date) VALUES (?, ?, ?)",
                        [sprintName, startDate, endDate],
                        function (err) {
                            if (err) return reject(err);
                            db.get("SELECT * FROM sprints WHERE id = ?", [this.lastID], (err, newSprint) => {
                                if (err) return reject(err);
                                resolve(newSprint);
                            });
                        }
                    );
                }
            }
        );
    });
}

// Función auxiliar para insertar una tarea y devolver un objeto con el ID y la descripción.
function insertTask(title, description, user, sprintId) {
    return new Promise((resolve, reject) => {
        db.run(
            "INSERT INTO tasks (title, description, status, assigned_to, sprint_id) VALUES (?, ?, ?, ?, ?)",
            [title, description || "", 'pendiente', user.username, sprintId],
            function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, title, description: description || "" });
                }
            }
        );
    });
}


/**
 * Función para interpretar mensajes sin comando usando OpenAI.
 * Además de procesar las acciones (crear, actualizar, etc.), genera un mensaje final (vía OpenAI)
 * que resume las tareas creadas, explica sus implicaciones y pregunta (opcionalmente) sobre estimaciones de tiempo.
 */
async function handleFallback(user, msg) {
    const chatId = msg.chat.id;
    const text = msg.text;

    const configuration = new Configuration({
        apiKey: process.env.OPENAI_API_KEY,
        basePath: 'https://api.openai.com/v1'
    });
    const openai = new OpenAIApi(configuration);

    try {
        // Prompt más específico para interpretar la solicitud del usuario.
        const prompt = `
Eres un project management muy preciso. 
Un usuario dice: "${text}"
Analiza la intención y responde exclusivamente en formato JSON, sin ningún comentario adicional.
Debes determinar las acciones que el usuario desea realizar en relación con las tareas. Las acciones permitidas son:
  - "crear": para crear una tarea. Responde con un objeto que incluya:
         "title": un título breve y claro de la tarea,
         "description": una descripción detallada (opcional; si no se proporciona, debe ser una cadena vacía).
  - "actualizar": para actualizar una tarea (incluye "id" y "status").
  - "asignar": para asignar una tarea (incluye "id" y "assigned_to").
  - "completar": para marcar una tarea como completada (incluye "id").
  - "listar": para obtener el listado de tareas del sprint actual (no requiere datos adicionales).
Si el mensaje no se relaciona con tareas, responde: { "action": "none" }.
Cuando el mensaje implique desglosar una feature en varias tareas, debes responder con un array de objetos. 
Por ejemplo, si el usuario dice "Quiero que desgloses la feature de implementar un sistema de pago para recargar tarjetas NFC usando la tarjeta de crédito en 4 tareas", 
responde con un array de 4 objetos, cada uno con "action": "crear" y las propiedades "title" y "description" (la "description" puede estar vacía si no se especifica).
Ejemplos:
  - Entrada: "Crea una tarea para actualizar el sitio web"
    Respuesta: { "action": "crear", "title": "Actualizar el sitio web", "description": "" }
  - Entrada: "Actualiza la tarea 3 a completada"
    Respuesta: { "action": "actualizar", "id": 3, "status": "completada" }
  - Entrada: "Que tareas hay este sprint"
    Respuesta: { "action": "listar" }
  - Entrada: "Quiero que desgloses la feature de implementar un sistema de pago para recargar tarjetas NFC usando la tarjeta de crédito en 4 tareas"
    Respuesta: [
       { "action": "crear", "title": "Definir requisitos y casos de uso para el sistema de pago NFC", "description": "Identificar requerimientos funcionales y de seguridad" },
       { "action": "crear", "title": "Diseñar la arquitectura e integración con la pasarela de pago", "description": "Crear diagramas de arquitectura y definir puntos de integración" },
       { "action": "crear", "title": "Desarrollar el módulo de recarga NFC", "description": "Programar la funcionalidad para recargar tarjetas NFC" },
       { "action": "crear", "title": "Realizar pruebas de integración y seguridad", "description": "Ejecutar tests de rendimiento y vulnerabilidades" }
    ]

! NOTA IMPORTANTE: La respuesta debe ser sola y exclusivamente un json valido. Si es una lista con multiples acciones, asegurarse de incluir []
`;

        // Se registra en consola el prompt enviado a OpenAI.
        console.log("Prompt enviado a OpenAI:", prompt);

        const completion = await openai.createChatCompletion({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Eres un project management muy preciso." },
                { role: "user", content: prompt }
            ],
            max_tokens: 250,
        });

        const responseText = completion.data.choices[0].message.content.trim();
        console.log("Respuesta de OpenAI:", responseText);

        let commands;
        try {
            commands = JSON.parse(responseText);
        } catch (parseError) {
            return bot.sendMessage(chatId, "No pude interpretar tu solicitud. Por favor, intenta de nuevo.");
        }
        if (!Array.isArray(commands)) {
            commands = [commands];
        }

        // Array para almacenar las tareas creadas.
        let createdTasks = [];

        // Procesamos cada comando obtenido.
        for (const command of commands) {
            if (command.action === "crear") {
                const title = command.title;
                // La descripción puede no venir; en ese caso, se usará una cadena vacía.
                const description = command.description || "";
                if (!title) {
                    await bot.sendMessage(chatId, "Para crear una tarea se requiere una descripción.");
                    continue;
                }
                const sprint = await getCurrentSprint();
                try {
                    const task = await insertTask(title, description, user, sprint.id);
                    createdTasks.push(task);
                } catch (err) {
                    await bot.sendMessage(chatId, "Error al crear la tarea: " + err.message);
                }
            } else if (command.action === "actualizar") {
                const { id, status } = command;
                if (!id || !status) {
                    await bot.sendMessage(chatId, "Para actualizar una tarea se requiere el ID y el nuevo estado.");
                    continue;
                }
                await new Promise((resolve) => {
                    db.run("UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                        [status, id],
                        function (err) {
                            if (err) {
                                bot.sendMessage(chatId, "Error al actualizar la tarea.");
                            } else {
                                bot.sendMessage(chatId, `Tarea ${id} actualizada a ${status}.`);
                            }
                            resolve();
                        });
                });
            } else if (command.action === "asignar") {
                const { id, assigned_to } = command;
                if (!id || !assigned_to) {
                    await bot.sendMessage(chatId, "Para asignar una tarea se requiere el ID y el usuario asignado.");
                    continue;
                }
                await new Promise((resolve) => {
                    db.run("UPDATE tasks SET assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                        [assigned_to, id],
                        function (err) {
                            if (err) {
                                bot.sendMessage(chatId, "Error al asignar la tarea.");
                            } else {
                                bot.sendMessage(chatId, `Tarea ${id} asignada a ${assigned_to}.`);
                            }
                            resolve();
                        });
                });
            } else if (command.action === "completar") {
                const { id } = command;
                if (!id) {
                    await bot.sendMessage(chatId, "Para completar una tarea se requiere el ID.");
                    continue;
                }
                await new Promise((resolve) => {
                    db.run("UPDATE tasks SET status = 'completada', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                        [id],
                        function (err) {
                            if (err) {
                                bot.sendMessage(chatId, "Error al marcar la tarea como completada.");
                            } else {
                                bot.sendMessage(chatId, `Tarea ${id} marcada como completada.`);
                            }
                            resolve();
                        });
                });
            } else if (command.action === "listar") {
                const sprint = await getCurrentSprint();
                db.all("SELECT * FROM tasks WHERE sprint_id = ?", [sprint.id], (err, rows) => {
                    if (err) {
                        console.error("Error en fallback listar:", err);
                        return bot.sendMessage(chatId, 'Error al obtener las tareas.');
                    }
                    if (rows.length === 0) {
                        return bot.sendMessage(chatId, 'No hay tareas registradas en el sprint actual.');
                    }
                    let message = `Listado de Tareas para el sprint "${sprint.name}":\n`;
                    rows.forEach((row) => {
                        message += `ID: ${row.id} | ${row.description} | Estado: ${row.status} | Asignado a: ${row.assigned_to}\n`;
                    });
                    return bot.sendMessage(chatId, message);
                });
            } else {
                await bot.sendMessage(chatId, "No se identificó una acción relacionada con tareas en tu mensaje.");
            }
        }

        // Después de procesar todas las acciones, se arma un prompt de resumen para OpenAI.
        let summaryPrompt = "";
        if (createdTasks.length > 0) {
            summaryPrompt = `Se han creado las siguientes tareas:\n`;
            createdTasks.forEach((task, index) => {
                summaryPrompt += `${index + 1}. Tarea: "${task.description}" (ID: ${task.id})\n`;
            });
            summaryPrompt += `Explica de manera clara las implicaciones de estas tareas para el proyecto y pregunta al usuario si desea proporcionar estimaciones de tiempo para cada una de ellas (esto es opcional).`;
        } else {
            summaryPrompt = `No se han creado tareas nuevas a partir de la solicitud.`;
        }
        console.log("Prompt de resumen enviado a OpenAI:", summaryPrompt);

        const finalCompletion = await openai.createChatCompletion({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Eres un project management muy preciso." },
                { role: "user", content: summaryPrompt }
            ],
            max_tokens: 200,
        });
        const finalResponse = finalCompletion.data.choices[0].message.content.trim();
        console.log("Respuesta final de OpenAI:", finalResponse);

        // Se envía la respuesta final al usuario.
        await bot.sendMessage(chatId, finalResponse);

    } catch (error) {
        console.error("Error en fallback:", error);
        return bot.sendMessage(chatId, "Error al procesar tu solicitud. Por favor, intenta de nuevo.");
    }
}





/**
 * Procesa los comandos conocidos de usuarios ya registrados.
 */
function processMessage(user, msg) {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text.startsWith('/addTask')) {
        const taskDetails = text.replace('/addTask', '').trim();
        if (!taskDetails) {
            return sendReply(chatId, 'Por favor proporciona la descripción de la tarea. Ejemplo: /addTask Crear la landing page.');
        }
        getCurrentSprint()
            .then(sprint => {
                db.run(
                    "INSERT INTO tasks (description, status, assigned_to, sprint_id) VALUES (?, ?, ?, ?)",
                    [taskDetails, 'pendiente', user.username, sprint.id],
                    function (err) {
                        if (err) {
                            console.error("Error en /addTask:", err);
                            sendReply(chatId, 'Error al agregar la tarea.');
                        } else {
                            sendReply(chatId, `Tarea agregada con ID: ${this.lastID}`);
                        }
                    }
                );
            })
            .catch(err => {
                console.error("Error al obtener el sprint en /addTask:", err);
                sendReply(chatId, "Error al obtener el sprint actual.");
            });
    } else if (text.startsWith('/updateTask')) {
        const parts = text.split(' ');
        if (parts.length >= 3) {
            const id = parts[1];
            const newStatus = parts[2];
            db.run(
                "UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                [newStatus, id],
                function (err) {
                    if (err) {
                        console.error("Error en /updateTask:", err);
                        sendReply(chatId, 'Error al actualizar la tarea.');
                    } else {
                        sendReply(chatId, `Tarea ${id} actualizada a: ${newStatus}`);
                    }
                }
            );
        } else {
            sendReply(chatId, 'Uso: /updateTask <id> <nuevoStatus>');
        }
    } else if (text.startsWith('/listTasks')) {
        getCurrentSprint()
            .then(sprint => {
                db.all("SELECT * FROM tasks WHERE sprint_id = ?", [sprint.id], (err, rows) => {
                    if (err) {
                        console.error("Error en /listTasks:", err);
                        sendReply(chatId, 'Error al obtener las tareas.');
                    } else {
                        if (rows.length === 0) {
                            sendReply(chatId, 'No hay tareas registradas en el sprint actual.');
                        } else {
                            let message = `Listado de Tareas para el sprint "${sprint.name}":\n`;
                            rows.forEach((row) => {
                                message += `ID: ${row.id} | ${row.description} | Estado: ${row.status} | Asignado a: ${row.assigned_to}\n`;
                            });
                            sendReply(chatId, message);
                        }
                    }
                });
            })
            .catch(err => {
                console.error("Error al obtener el sprint en /listTasks:", err);
                sendReply(chatId, "Error al obtener el sprint actual.");
            });
    } else if (text.startsWith('/summary')) {
        getCurrentSprint()
            .then(sprint => {
                db.all("SELECT * FROM tasks WHERE sprint_id = ?", [sprint.id], async (err, rows) => {
                    if (err) {
                        console.error("Error en /summary:", err);
                        return sendReply(chatId, 'Error al obtener las tareas.');
                    }
                    if (rows.length === 0) {
                        return sendReply(chatId, 'No hay tareas para resumir en el sprint actual.');
                    }
                    const taskSummary = rows
                        .map(task => `Tarea ${task.id}: ${task.description} - Estado: ${task.status} - Asignado a: ${task.assigned_to}`)
                        .join('\n');

                    const configuration = new Configuration({
                        apiKey: process.env.OPENAI_API_KEY,
                        basePath: 'https://api.openai.com/v1'
                    });
                    const openai = new OpenAIApi(configuration);
                    try {
                        const completion = await openai.createChatCompletion({
                            model: "gpt-4o-mini",
                            messages: [
                                { role: "system", content: "Eres un project manager. Resume el sprint actual de manera estandarizada. El formato debe ser:\nResumen del Sprint: [nombre del sprint]\n- Tarea [id]: [descripción] (Estado: [estado], Asignado a: [asignado])." },
                                { role: "user", content: `Sprint: ${sprint.name}\nTareas:\n${taskSummary}` }
                            ],
                            max_tokens: 200,
                        });
                        const summary = completion.data.choices[0].message.content.trim();
                        sendReply(chatId, summary);
                    } catch (error) {
                        console.error("Error en generación de summary:", error);
                        sendReply(chatId, 'Error al generar el resumen.');
                    }
                });
            })
            .catch(err => {
                console.error("Error al obtener el sprint en /summary:", err);
                sendReply(chatId, "Error al obtener el sprint actual.");
            });
    } else if (text.startsWith('/help')) {
        sendReply(chatId, `Comandos disponibles:
    /login <nombre> - Regístrate con un nombre.
    /addTask [descripción] - Agrega una nueva tarea.
    /updateTask [id] [nuevoStatus] - Actualiza el estado de una tarea.
    /listTasks - Muestra las tareas del sprint actual.
    /summary - Genera un resumen de las tareas del sprint actual.
    /help - Muestra este mensaje de ayuda.
    O puedes escribir lo que necesites`);
    } else {
        // Si no es un comando, se utiliza el fallback con OpenAI
        handleFallback(user, msg);
    }
}

// Manejador principal de mensajes
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text) return;

    // Si el usuario se registra
    if (text.startsWith('/login')) {
        const parts = text.split(' ');
        if (parts.length < 2) {
            return sendReply(chatId, "Uso: /login <tu nombre>");
        }
        const username = parts.slice(1).join(' ');
        const telegramId = msg.from.id;
        db.run(
            "INSERT OR REPLACE INTO users (telegram_id, username) VALUES (?, ?)",
            [telegramId, username],
            function (err) {
                if (err) {
                    console.error("Error en /login:", err);
                    return sendReply(chatId, "Error al registrar el usuario.");
                } else {
                    return sendReply(chatId, `¡Bienvenido, ${username}! Te has registrado correctamente.`);
                }
            }
        );
    } else {
        // Verifica que el usuario esté registrado
        db.get("SELECT * FROM users WHERE telegram_id = ?", [msg.from.id], (err, user) => {
            if (err) {
                console.error("Error al verificar usuario:", err);
                return sendReply(chatId, "Error al verificar el usuario.");
            }
            if (!user) {
                return sendReply(chatId, "No estás registrado. Por favor, regístrate usando /login <tu nombre>.");
            }
            processMessage(user, msg);
        });
    }
});

// Funciones para revisar Google Calendar y Gmail (opcional)
async function checkGoogleServices() {
    if (!process.env.GOOGLE_CLIENT_ID.length)
    {
        return;
    }
    const oAuth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
    oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

    try {
        const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
        const res = await calendar.events.list({
            calendarId: 'primary',
            timeMin: (new Date()).toISOString(),
            maxResults: 10,
            singleEvents: true,
            orderBy: 'startTime',
        });
        const events = res.data.items;
        if (events && events.length) {
            console.log('Próximos eventos en Google Calendar:');
            events.forEach((event) => {
                const start = event.start.dateTime || event.start.date;
                console.log(`${start} - ${event.summary}`);
            });
        } else {
            console.log('No se encontraron eventos próximos en Google Calendar.');
        }
    } catch (error) {
        console.error('Error al obtener eventos de Google Calendar:', error);
    }

    try {
        const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
        const res = await gmail.users.messages.list({
            userId: 'me',
            q: 'is:unread',
            maxResults: 5,
        });
        const messages = res.data.messages;
        if (messages && messages.length) {
            console.log('Emails no leídos en Gmail:');
            for (const message of messages) {
                const msg = await gmail.users.messages.get({
                    userId: 'me',
                    id: message.id,
                });
                console.log(`Email: ${msg.data.snippet}`);
            }
        } else {
            console.log('No hay nuevos emails en Gmail.');
        }
    } catch (error) {
        console.error('Error al obtener emails de Gmail:', error);
    }
}

// Revisa Google Calendar y Gmail cada 15 minutos
cron.schedule('*/15 * * * *', () => {
    console.log('Revisando Google Calendar y Gmail...');
    checkGoogleServices();
});

// Placeholder: Actualización de estado de tareas cada minuto
async function updateTaskStatus() {
    //console.log("Actualizando el estado de las tareas... (placeholder)");
}
cron.schedule('* * * * *', () => {
    updateTaskStatus();
});

console.log("Agente de IA Project Manager en ejecución...");
