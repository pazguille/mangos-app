import { config } from './config.js';
import { showToast, showSpinner } from './utils.js';

// Gemini API Integration
export class GeminiProcessor {
    constructor() {
        this.apiKey = '';
        this.model = 'gemini-2.5-flash-lite';
        this.baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    }

    async processText(text) {
        const prompt = this._buildPrompt(text);
        return await this._callGemini(prompt);
    }


    _buildPrompt(text) {
        return `You are a financial assistant. Extract EXTRA EXPENSE data from the user.

RULES:
1. Extract only the concept (name) and the total amount (include $symbol).
2. The result must ALWAYS be a JSON with the indicated structure.
3. If there is no clear amount, estimate it or put 0 and lower the confidence.
4. Use spanish for the response.

Input: "${text}"

JSON Structure:
{
    "entries": [
        {
            "name": "Expense name",
            "amount": "positive number" (include $symbol)
        }
    ],
    "confidence": number (0-1)
}

Do not include any text outside of the JSON. If there are multiple expenses, list them all in "entries".`;
    }

    async _callGemini(prompt) {
        try {
            showSpinner(true);

            const url = `${this.baseUrl}?key=${this.apiKey}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.3,
                        topP: 0.8,
                        topK: 40,
                    }
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'Error en Gemini API');
            }

            const data = await response.json();
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!content) {
                throw new Error('Respuesta vacía de Gemini');
            }

            // Limpiar markdown si existe
            let jsonStr = content.trim();
            if (jsonStr.startsWith('```json')) {
                jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
            } else if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');
            }

            const parsed = JSON.parse(jsonStr);
            showSpinner(false);
            return parsed;

        } catch (error) {
            showSpinner(false);
            console.error('Gemini Error:', error);
            showToast(`Error al procesar con Gemini: ${error.message}`, 'error');
            throw error;
        }
    }

}

let geminiProcessor = null;

export function getGeminiProcessor() {
    if (!config.isConfigured()) {
        showToast('Por favor configura tu API Key primero', 'error');
        return null;
    }
    if (!geminiProcessor || geminiProcessor.apiKey !== config.apiKey) {
        geminiProcessor = new GeminiProcessor(config.apiKey);
    }
    return geminiProcessor;
}
