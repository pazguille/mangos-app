// Configuration Manager
class Config {
    constructor() {
        this.storageKey = 'mangos_config';
        this.load();
    }

    load() {
        this.sheetId = '';
        this.sheetName = '';
        this.provider = 'openrouter'; // 'openrouter' or 'gemini'

        const stored = localStorage.getItem(this.storageKey);

        if (stored) {
            const data = JSON.parse(stored);
            this.sheetId = data.sheetId || '';
            this.sheetName = data.sheetName || '';
        }
    }

    save() {
        const data = {
            sheetId: this.sheetId,
            sheetName: this.sheetName,
        };
        localStorage.setItem(this.storageKey, JSON.stringify(data));
    }

    isConfigured() {
        return !!this.sheetId;
    }
}

export const config = new Config();
