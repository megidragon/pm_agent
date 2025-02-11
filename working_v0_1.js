// index.js
import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import sqlite3 from 'sqlite3';
import cron from 'node-cron';
import { google } from 'googleapis';
import { Configuration, OpenAIApi } from 'openai';

//const { verbose } = sqlite3;
//const db = new verbose.Database(process.env.DB_PATH || './project_manager.db');
const db = new sqlite3.Database(process.env.DB_PATH || './project_manager.db');

db.serialize(() => {
    // Crea la tabla de tareas si no existe
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT,
    status TEXT,
    assigned_to TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// -----------------------------------------------------
// Configuración del Bot de Telegram
// -----------------------------------------------------
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Comando: /addTask [descripción]
    if (text.startsWith('/addTask')) {
        const taskDetails = text.replace('/addTask', '').trim();
        if (!taskDetails) {
            return bot.sendMessage(chatId, 'Por favor proporciona la descripción de la tarea. Ejemplo: /addTask Crear la landing page.');
        }
        db.run("INSERT INTO tasks (description, status, assigned_to) VALUES (?, ?, ?)",
            [taskDetails, 'pendiente', 'sin asignar'], function(err) {
                if (err) {
                    bot.sendMessage(chatId, 'Error al agregar la tarea.');
                } else {
                    bot.sendMessage(chatId, `Tarea agregada con ID: ${this.lastID}`);
                }
            });

        // Comando: /updateTask [id] [nuevoStatus]
    } else if (text.startsWith('/updateTask')) {
        const parts = text.split(' ');
        if (parts.length >= 3) {
            const id = parts[1];
            const newStatus = parts[2];
            db.run("UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                [newStatus, id], function(err) {
                    if (err) {
                        bot.sendMessage(chatId, 'Error al actualizar la tarea.');
                    } else {
                        bot.sendMessage(chatId, `Tarea ${id} actualizada a: ${newStatus}`);
                    }
                });
        } else {
            bot.sendMessage(chatId, 'Uso: /updateTask <id> <nuevoStatus>');
        }

        // Comando: /listTasks
    } else if (text.startsWith('/listTasks')) {
        db.all("SELECT * FROM tasks", (err, rows) => {
            if (err) {
                bot.sendMessage(chatId, 'Error al obtener las tareas.');
            } else {
                if (rows.length === 0) {
                    return bot.sendMessage(chatId, 'No hay tareas registradas.');
                }
                let message = 'Listado de Tareas:\n';
                rows.forEach((row) => {
                    message += `ID: ${row.id} | ${row.description} | Estado: ${row.status} | Asignado a: ${row.assigned_to}\n`;
                });
                bot.sendMessage(chatId, message);
            }
        });

        // Comando: /summary - Genera un resumen de tareas usando OpenAI API
    } else if (text.startsWith('/summary')) {
        db.all("SELECT * FROM tasks", async (err, rows) => {
            if (err) {
                return bot.sendMessage(chatId, 'Error al obtener las tareas.');
            }
            if (rows.length === 0) {
                return bot.sendMessage(chatId, 'No hay tareas para resumir.');
            }
            const taskSummary = rows.map(task => `Tarea ${task.id}: ${task.description} - Estado: ${task.status}`).join('\n');

            const configuration = new Configuration({
                apiKey: process.env.OPENAI_API_KEY,
                basePath: 'https://api.openai.com/v1'
            });
            const openai = new OpenAIApi(configuration);
            try {
                const completion = await openai.createChatCompletion({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: "Eres un project manager." },
                        { role: "user", content: `Resume el siguiente listado de tareas:\n\n${taskSummary}` }
                    ],
                    max_tokens: 200,
                });

                bot.sendMessage(chatId, completion.data.choices[0].message.content.trim());

                //bot.sendMessage(chatId, completion.data.choices[0].text.trim());
            } catch (error) {
                console.error(error);
                bot.sendMessage(chatId, 'Error al generar el resumen.');
            }
        });

        // Comando: /help
    } else if (text.startsWith('/help')) {
        bot.sendMessage(chatId, `Comandos disponibles:
    /addTask [descripción] - Agrega una nueva tarea.
    /updateTask [id] [nuevoStatus] - Actualiza el estado de una tarea.
    /listTasks - Muestra todas las tareas.
    /summary - Genera un resumen de las tareas usando OpenAI.
    /help - Muestra este mensaje de ayuda.`);
    }
});

// -----------------------------------------------------
// Funciones para revisar Google Calendar y Gmail (Opcional)
// -----------------------------------------------------
async function checkGoogleServices() {
    // Configura el cliente OAuth2 para las APIs de Google
    const oAuth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
    oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

    // Revisión de eventos en Google Calendar
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

    // Revisión de emails en Gmail
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

// Programa la revisión de Google Calendar y Gmail cada 15 minutos
cron.schedule('*/15 * * * *', () => {
    console.log('Revisando Google Calendar y Gmail...');
    checkGoogleServices();
});

// -----------------------------------------------------
// Actualización de estado de tareas (Placeholder)
// -----------------------------------------------------
// Aquí puedes implementar la lógica para mantener el seguimiento del progreso de las tareas,
// por ejemplo, conectándote a otro sistema o recibiendo webhooks.
// En este ejemplo se incluye una función "placeholder" que se ejecuta cada minuto.
async function updateTaskStatus() {
    // Lógica para actualizar el estado de las tareas.
    console.log("Actualizando el estado de las tareas... (placeholder)");
}

cron.schedule('* * * * *', () => {
    updateTaskStatus();
});

// -----------------------------------------------------
// Mensaje de inicio
// -----------------------------------------------------
console.log("Agente de IA Project Manager en ejecución...");
