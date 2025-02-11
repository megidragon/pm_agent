// utils.js
function sendReply(bot, chatId, message) {
    const availableCommands = `\n\r\n\r💡 Atajos: /listTasks | /summary | /help`;
    bot.sendMessage(chatId, message + availableCommands);
}

export { sendReply };
