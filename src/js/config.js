// Configuration Manager
class Config {
    constructor() {
        this.storageKey = 'cashflow_config';
        this.load();
    }

    load() {
        this.sheetId = '';
        this.sheetName = 'Cashflow';
        this.googleClientId = '';
        this.apiKey = '';

        const stored = localStorage.getItem(this.storageKey);

        if (stored) {
            const data = JSON.parse(stored);
            this.sheetId = data.sheetId || '';
            this.sheetName = data.sheetName || 'Cashflow';
            this.lang = data.lang || 'es-AR';
            this.googleClientId = data.googleClientId || '';
            this.apiKey = data.apiKey || '';
        }
    }

    save() {
        const data = {
            apiKey: this.apiKey,
            sheetId: this.sheetId,
            sheetName: this.sheetName,
            googleClientId: this.googleClientId,
            lang: this.lang
        };
        localStorage.setItem(this.storageKey, JSON.stringify(data));
    }

    isConfigured() {
        return !!this.apiKey;
    }
}

export const config = new Config();
