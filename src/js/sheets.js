import { config } from './config.js';
import { authManager } from './auth.js';
import { showToast, showSpinner } from './utils.js';

// Google Sheets API Integration con OAuth2
export class GoogleSheetsManager {
    constructor(accessToken) {
        this.accessToken = accessToken;
        this.baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
    }

    async addExpense(sheetId, sheetName, entries) {
        try {
            showSpinner(true);

            // 1. Obtener los datos actuales.
            const values = await this.getSheetData(sheetId, sheetName, 'A1:H120');

            if (!values || values.length === 0) {
                throw new Error('No se pudieron leer los datos del sheet');
            }

            const batchData = [];
            const savedItems = [];

            // NUEVOS RANGOS: Filas 12 a 118, Columnas G (6) y H (7)
            const MIN_ROW = 12;
            const MAX_ROW = 118;

            // Iterar sobre cada entrada para encontrarle lugar
            for (const entry of entries) {
                let foundRow = false;
                let targetRange = '';
                let targetValues = null;

                for (let i = MIN_ROW - 1; i < MAX_ROW; i++) {
                    const rowData = values[i] || [];
                    // Verificar si la celda G está vacía
                    if (!rowData[6] || rowData[6].trim() === '') {
                        const rowNumber = i + 1;
                        const concepto = entry.name;
                        const importe = entry.amount;

                        targetRange = `${sheetName}!G${rowNumber}:H${rowNumber}`;
                        targetValues = [[concepto, importe]];
                        foundRow = true;

                        // ACTUALIZAR local values para que la siguiente iteración sepa que esta fila está ocupada
                        if (!values[i]) values[i] = [];
                        values[i][6] = concepto;
                        values[i][7] = importe;
                        break;
                    }
                }

                if (foundRow && targetRange && targetValues) {
                    batchData.push({
                        range: targetRange,
                        values: targetValues
                    });
                    savedItems.push(entry.name);
                } else {
                    console.warn(`⚠️ No se encontró espacio para: ${entry.name}`);
                }
            }

            if (batchData.length === 0) {
                throw new Error('No se encontró espacio disponible para ningún gasto.');
            }

            // --- EJECUTAR BATCH UPDATE ---
            const url = `${this.baseUrl}/${sheetId}/values:batchUpdate`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                },
                body: JSON.stringify({
                    valueInputOption: 'USER_ENTERED',
                    data: batchData
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'Error al actualizar sheet');
            }

            showSpinner(false);
            if (savedItems.length === 1) {
                showToast(`✅ Guardado: ${savedItems[0]}`, 'success');
            } else {
                showToast(`✅ ${savedItems.length} gastos guardados exitosamente`, 'success');
            }

            return await response.json();

        } catch (error) {
            showSpinner(false);
            console.error('Sheets Error:', error);
            showToast(`${error.message}`, 'error');
            throw error;
        }
    }

    async getSheetData(sheetId, sheetName, range = 'A1:H120') {
        try {
            showSpinner(true);

            const url = `${this.baseUrl}/${sheetId}/values/${sheetName}!${range}`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'Error al leer Sheets');
            }

            const data = await response.json();
            showSpinner(false);

            return data.values || [];

        } catch (error) {
            showSpinner(false);
            console.error('Sheets Error:', error);
            showToast(`Error al leer datos: ${error.message}`, 'error');
            throw error;
        }
    }

    async getSpreadsheetTabs(spreadsheetId) {
        try {
            showSpinner(true);
            const url = `${this.baseUrl}/${spreadsheetId}?fields=sheets.properties.title`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'Error al obtener tabs');
            }

            const data = await response.json();
            showSpinner(false);

            return data.sheets.map(sheet => sheet.properties.title);
        } catch (error) {
            showSpinner(false);
            console.error('Sheets Error:', error);
            showToast(`Error al leer tabs: ${error.message}`, 'error');
            throw error;
        }
    }

    async copyFile(fileId, newTitle) {
        try {
            showSpinner(true);
            const url = `https://www.googleapis.com/drive/v3/files/${fileId}/copy`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: newTitle
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'Error al copiar archivo');
            }

            const data = await response.json();
            showSpinner(false);
            return data.id;
        } catch (error) {
            showSpinner(false);
            console.error('Drive Error:', error);
            showToast(`Error al clonar sheet: ${error.message}`, 'error');
            throw error;
        }
    }
}

let sheetsManager = null;

export function getSheetsManager() {
    if (!authManager || !authManager.isSignedIn()) {
        return null;
    }
    const token = authManager.getAccessToken();
    if (!sheetsManager || sheetsManager.accessToken !== token) {
        sheetsManager = new GoogleSheetsManager(token);
    }
    return sheetsManager;
}
