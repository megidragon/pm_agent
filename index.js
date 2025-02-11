// index.js
import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { db } from './database.js';
import { processMessage } from './botHandlers.js';
import { scheduleGoogleServicesCheck, scheduleTaskStatusUpdate } from './cronJobs.js';

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text) return;

    // Registro de usuario
    if (text.startsWith('/login')) {
        const parts = text.split(' ');
        if (parts.length < 2) {
            return bot.sendMessage(chatId, "⚠️ Uso: /login <tu nombre>");
        }
        const username = parts.slice(1).join(' ');
        const telegramId = msg.from.id;
        db.run(
            "INSERT OR REPLACE INTO users (telegram_id, username) VALUES (?, ?)",
            [telegramId, username],
            function (err) {
                if (err) {
                    console.error("Error en /login:", err);
                    return bot.sendMessage(chatId, "❌ Error al registrar el usuario.");
                } else {
                    return bot.sendMessage(chatId, `🎉 ¡Bienvenido, ${username}! Te has registrado correctamente.`);
                }
            }
        );
    } else {
        // Verifica si el usuario está registrado
        db.get("SELECT * FROM users WHERE telegram_id = ?", [msg.from.id], (err, user) => {
            if (err) {
                console.error("Error al verificar usuario:", err);
                return bot.sendMessage(chatId, "❌ Error al verificar el usuario.");
            }
            if (!user) {
                return bot.sendMessage(chatId, "🚫 No estás registrado. Por favor, regístrate usando /login <tu nombre>.");
            }
            processMessage(bot, user, msg);
        });
    }
});

// Inicia los cron jobs
scheduleGoogleServicesCheck();
scheduleTaskStatusUpdate();

console.log("🤖 Agente de IA Project Manager en ejecución...");
