// openaiService.js
import { Configuration, OpenAIApi } from 'openai';

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
    basePath: 'https://api.openai.com/v1'
});
const openai = new OpenAIApi(configuration);

async function createChatCompletion(model, messages, max_tokens = 250) {
    try {
        const completion = await openai.createChatCompletion({
            model,
            messages,
            max_tokens,
        });
        return completion.data.choices[0].message.content.trim();
    } catch (error) {
        throw error;
    }
}

export { createChatCompletion };
