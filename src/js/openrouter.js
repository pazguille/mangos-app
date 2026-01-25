import { config } from './config.js';
import { showToast, showSpinner } from './utils.js';

// OpenRouter API Integration
export class OpenRouterProcessor {
    constructor() {
        this.apiKey = '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';
        this.model = 'google/gemma-3n-e2b-it:free';
        this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
    }

    async processText(text) {
        const prompt = this._buildPrompt(text);
        return await this._callOpenRouter(prompt);
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

Do not include any text, reasoning, or markdown outside of the JSON. Return ONLY the JSON string. If there are multiple expenses, list them all in "entries".`;
    }

    async _callOpenRouter(prompt) {
        try {
            showSpinner(true);

            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': window.location.origin, // Required by OpenRouter
                    'X-Title': 'Mangos App' // Optional
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.1, // Low temperature for deterministic output
                    top_p: 0.9,
                })
            });

            if (!response.ok) {
                const error = await response.json();
                // Handle different error structures
                const errorMessage = error.error?.message || error.message || 'Error en OpenRouter API';
                throw new Error(errorMessage);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;

            if (!content) {
                throw new Error('Respuesta vacía de OpenRouter');
            }

            // Limpiar markdown si existe (DeepSeek suele usar markdown)
            let jsonStr = content.trim();
            // Buscar inicio y fin de JSON si hay texto alrededor (DeepSeek a veces incluye reasoning)
            const jsonStart = jsonStr.indexOf('{');
            const jsonEnd = jsonStr.lastIndexOf('}');

            if (jsonStart !== -1 && jsonEnd !== -1) {
                jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
            }

            const parsed = JSON.parse(jsonStr);
            showSpinner(false);
            return parsed;

        } catch (error) {
            showSpinner(false);
            console.error('OpenRouter Error:', error);
            showToast(`Error con OpenRouter: ${error.message}`, 'error');
            throw error;
        }
    }
}

let openRouterProcessor = null;

export function getOpenRouterProcessor() {
    if (!openRouterProcessor) {
        openRouterProcessor = new OpenRouterProcessor();
    }
    return openRouterProcessor;
}
