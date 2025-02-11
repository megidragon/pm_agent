// botHandlers.js
import { getCurrentSprint, insertTask, db } from './database.js';
import { createChatCompletion } from './openaiService.js';
import { sendReply } from './utils.js';

async function handleFallback(bot, user, msg) {
    const chatId = msg.chat.id;
    const text = msg.text;
    const currentUTCTime = new Date().toISOString();

    const prompt = `
La hora actual UTC es: ${currentUTCTime}.
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
Si el mensaje no se relaciona con tareas o no requiera el uso de herramientas del sistema, responde: { "action": "none" }.
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

    console.log("Prompt enviado a OpenAI:", prompt);

    let commands;
    try {
        const responseText = await createChatCompletion(
            "gpt-4o-mini",
            [
                { role: "system", content: "Eres un project management muy preciso." },
                { role: "user", content: prompt }
            ],
            250
        );
        console.log("Respuesta de OpenAI:", responseText);
        let parsedText = parseAIResponse(responseText);
        if (parsedText === null)
        {
            console.error("Respuesta mal formateada en OpenAI");
            bot.sendMessage(chatId, "❌ No pude interpretar tu solicitud. Por favor, intenta de nuevo.");
            return;
        }

        commands = JSON.parse(parsedText);
    } catch (error) {
        console.error("Error en OpenAI:", error);
        return bot.sendMessage(chatId, "❌ No pude interpretar tu solicitud. Por favor, intenta de nuevo.");
    }

    if (!Array.isArray(commands)) {
        commands = [commands];
    }

    let createdTasks = [];

    for (const command of commands) {
        if (command.action === "crear") {
            const title = command.title;
            const description = command.description || "";
            if (!title) {
                await bot.sendMessage(chatId, "⚠️ Para crear una tarea se requiere una descripción.");
                continue;
            }
            const sprint = await getCurrentSprint();
            try {
                const task = await insertTask(title, description, user, sprint.id);
                createdTasks.push(task);
            } catch (err) {
                await bot.sendMessage(chatId, "❌ Error al crear la tarea: " + err.message);
            }
        } else if (command.action === "actualizar") {
            const { id, status } = command;
            if (!id || !status) {
                await bot.sendMessage(chatId, "⚠️ Para actualizar una tarea se requiere el ID y el nuevo estado.");
                continue;
            }
            await new Promise((resolve) => {
                db.run(
                    "UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    [status, id],
                    function (err) {
                        if (err) {
                            bot.sendMessage(chatId, "❌ Error al actualizar la tarea.");
                        } else {
                            bot.sendMessage(chatId, `✅ Tarea ${id} actualizada a ${status}.`);
                        }
                        resolve();
                    }
                );
            });
        } else if (command.action === "asignar") {
            const { id, assigned_to } = command;
            if (!id || !assigned_to) {
                await bot.sendMessage(chatId, "⚠️ Para asignar una tarea se requiere el ID y el usuario asignado.");
                continue;
            }
            await new Promise((resolve) => {
                db.run(
                    "UPDATE tasks SET assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    [assigned_to, id],
                    function (err) {
                        if (err) {
                            bot.sendMessage(chatId, "❌ Error al asignar la tarea.");
                        } else {
                            bot.sendMessage(chatId, `✅ Tarea ${id} asignada a ${assigned_to}.`);
                        }
                        resolve();
                    }
                );
            });
        } else if (command.action === "completar") {
            const { id } = command;
            if (!id) {
                await bot.sendMessage(chatId, "⚠️ Para completar una tarea se requiere el ID.");
                continue;
            }
            await new Promise((resolve) => {
                db.run(
                    "UPDATE tasks SET status = 'completada', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    [id],
                    function (err) {
                        if (err) {
                            bot.sendMessage(chatId, "❌ Error al marcar la tarea como completada.");
                        } else {
                            bot.sendMessage(chatId, `✅ Tarea ${id} marcada como completada.`);
                        }
                        resolve();
                    }
                );
            });
        } else if (command.action === "listar") {
            const sprint = await getCurrentSprint();
            db.all("SELECT * FROM tasks WHERE sprint_id = ?", [sprint.id], (err, rows) => {
                if (err) {
                    console.error("Error en fallback listar:", err);
                    return bot.sendMessage(chatId, '❌ Error al obtener las tareas.');
                }
                if (rows.length === 0) {
                    return bot.sendMessage(chatId, 'ℹ️ No hay tareas registradas en el sprint actual.');
                }
                let message = `📝 Listado de Tareas para el sprint "${sprint.name}":\n`;
                rows.forEach((row) => {
                    message += `ID: ${row.id} | ${row.description} | Estado: ${row.status} | Asignado a: ${row.assigned_to}\n`;
                });
                return bot.sendMessage(chatId, message);
            });
        } else if (command.action === "none") {
            // Si la acción es "none", el mensaje es random y no requiere acción sobre tareas.
            // Se realiza una nueva consulta a la IA para generar una respuesta natural, incluyendo la hora UTC.
            try {
                const naturalResponse = await createChatCompletion(
                    "gpt-4o-mini",
                    [
                        { role: "system", content: "Eres un asistente de project management amigable y conversacional. Responderas de manera concisa y corta de ser posible a menos que el usuario pida una explicacion detallada o larga." },
                        { role: "user", content: `Hora UTC: ${currentUTCTime}. ${text}` }
                    ],
                    250
                );
                await bot.sendMessage(chatId, naturalResponse);
            } catch (error) {
                console.error("Error al generar respuesta de IA:", error);
                await bot.sendMessage(chatId, "❌ Error al generar respuesta de IA.");
            }
            return;
        } else {
            await bot.sendMessage(chatId, "❓ No se identificó una acción relacionada con tareas en tu mensaje.");
        }
    }

    // Si se crearon tareas, se genera un resumen final.
    let summaryPrompt = "";
    if (createdTasks.length > 0) {
        summaryPrompt = `Se han creado las siguientes tareas:\n`;
        createdTasks.forEach((task, index) => {
            summaryPrompt += `${index + 1}. Tarea: "${task.description}" (ID: ${task.id})\n`;
        });
        summaryPrompt += `Explica de manera clara las implicaciones de estas tareas para el proyecto y pregunta si el usuario desea proporcionar estimaciones de tiempo.`;
    } else {
        summaryPrompt = `No se han creado tareas nuevas a partir de la solicitud.`;
    }
    console.log("Prompt de resumen enviado a OpenAI:", summaryPrompt);

    try {
        const finalResponse = await createChatCompletion(
            "gpt-4o-mini",
            [
                { role: "system", content: "Eres un project management muy preciso." },
                { role: "user", content: summaryPrompt }
            ],
            200
        );
        console.log("Respuesta final de OpenAI:", finalResponse);
        await bot.sendMessage(chatId, finalResponse);
    } catch (error) {
        console.error("Error en generación de summary:", error);
        sendReply(bot, chatId, '❌ Error al generar el resumen.');
    }
}

function processMessage(bot, user, msg) {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text.startsWith('/addTask')) {
        const taskDetails = text.replace('/addTask', '').trim();
        if (!taskDetails) {
            return sendReply(bot, chatId, '📝 Por favor proporciona la descripción de la tarea. Ejemplo: /addTask Crear la landing page.');
        }
        getCurrentSprint()
            .then(sprint => {
                db.run(
                    "INSERT INTO tasks (description, status, assigned_to, sprint_id) VALUES (?, ?, ?, ?)",
                    [taskDetails, 'pendiente', user.username, sprint.id],
                    function (err) {
                        if (err) {
                            console.error("Error en /addTask:", err);
                            sendReply(bot, chatId, '❌ Error al agregar la tarea.');
                        } else {
                            sendReply(bot, chatId, `🎉 Tarea agregada con ID: ${this.lastID}`);
                        }
                    }
                );
            })
            .catch(err => {
                console.error("Error al obtener el sprint en /addTask:", err);
                sendReply(bot, chatId, "❌ Error al obtener el sprint actual.");
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
                        sendReply(bot, chatId, '❌ Error al actualizar la tarea.');
                    } else {
                        sendReply(bot, chatId, `✅ Tarea ${id} actualizada a: ${newStatus}`);
                    }
                }
            );
        } else {
            sendReply(bot, chatId, '⚠️ Uso: /updateTask <id> <nuevoStatus>');
        }
    } else if (text.startsWith('/listTasks')) {
        getCurrentSprint()
            .then(sprint => {
                db.all("SELECT * FROM tasks WHERE sprint_id = ?", [sprint.id], (err, rows) => {
                    if (err) {
                        console.error("Error en /listTasks:", err);
                        sendReply(bot, chatId, '❌ Error al obtener las tareas.');
                    } else {
                        if (rows.length === 0) {
                            sendReply(bot, chatId, 'ℹ️ No hay tareas registradas en el sprint actual.');
                        } else {
                            let message = `📝 Listado de Tareas para el sprint "${sprint.name}":\n`;
                            rows.forEach((row) => {
                                message += `ID: ${row.id} | ${row.description} | Estado: ${row.status} | Asignado a: ${row.assigned_to}\n`;
                            });
                            sendReply(bot, chatId, message);
                        }
                    }
                });
            })
            .catch(err => {
                console.error("Error al obtener el sprint en /listTasks:", err);
                sendReply(bot, chatId, "❌ Error al obtener el sprint actual.");
            });
    } else if (text.startsWith('/summary')) {
        getCurrentSprint()
            .then(sprint => {
                db.all("SELECT * FROM tasks WHERE sprint_id = ?", [sprint.id], async (err, rows) => {
                    if (err) {
                        console.error("Error en /summary:", err);
                        return sendReply(bot, chatId, '❌ Error al obtener las tareas.');
                    }
                    if (rows.length === 0) {
                        return sendReply(bot, chatId, 'ℹ️ No hay tareas para resumir en el sprint actual.');
                    }
                    const taskSummary = rows
                        .map(task => `Tarea ${task.id}: ${task.description} - Estado: ${task.status} - Asignado a: ${task.assigned_to}`)
                        .join('\n');

                    try {
                        const summary = await createChatCompletion(
                            "gpt-4o-mini",
                            [
                                { role: "system", content: "Eres un project manager. Resume el sprint actual de manera estandarizada. El formato debe ser:\nResumen del Sprint: [nombre del sprint]\n- Tarea [id]: [descripción] (Estado: [estado], Asignado a: [asignado])." },
                                { role: "user", content: `Sprint: ${sprint.name}\nTareas:\n${taskSummary}` }
                            ],
                            200
                        );
                        sendReply(bot, chatId, summary);
                    } catch (error) {
                        console.error("Error en generación de summary:", error);
                        sendReply(bot, chatId, '❌ Error al generar el resumen.');
                    }
                });
            })
            .catch(err => {
                console.error("Error al obtener el sprint en /summary:", err);
                sendReply(bot, chatId, "❌ Error al obtener el sprint actual.");
            });
    } else if (text.startsWith('/help')) {
        sendReply(bot, chatId, `💡 Comandos disponibles:
    /login <nombre> - Regístrate con un nombre.
    /addTask [descripción] - Agrega una nueva tarea.
    /updateTask [id] [nuevoStatus] - Actualiza el estado de una tarea.
    /listTasks - Muestra las tareas del sprint actual.
    /summary - Genera un resumen de las tareas del sprint actual.
    /help - Muestra este mensaje de ayuda.
    O puedes escribir lo que necesites`);
    } else {
        // Si el mensaje no es un comando reconocido, se invoca el fallback.
        handleFallback(bot, user, msg);
    }
}

/**
 * Intenta extraer y parsear únicamente el contenido JSON de una respuesta.
 * Elimina marcas de código como ```json o ``` y extrae el contenido que coincida con
 * un objeto o array JSON.
 *
 * @param {string} responseText - Texto de la respuesta de la IA.
 * @returns {Object|Array|null} - El objeto/array parseado o null si no se pudo extraer JSON válido.
 */
function parseAIResponse(responseText) {
    // Elimina las marcas de código y etiquetas de lenguaje (como ```json)
    let cleanedText = responseText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

    // Intenta parsear directamente
    try {
        JSON.parse(cleanedText);
    } catch (error) {
        // Si falla, intenta extraer un bloque JSON (ya sea objeto o array)
        const jsonMatch = cleanedText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (jsonMatch && jsonMatch[0]) {
            try {
                cleanedText = jsonMatch[0]
                JSON.parse(jsonMatch[0]);
            } catch (err) {
                console.error("Error al parsear el JSON extraído:", err);
                return null;
                //return '{ "action": "none" }';
            }
        }
        console.error("No se encontró un bloque JSON válido en la respuesta.");
        return null;
        //return '{ "action": "none" }';
    }

    return cleanedText;
}

export { processMessage, handleFallback, parseAIResponse };
