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

            // 1. Obtener los datos actuales. Rango amplio para encontrar headers.
            const values = await this.getSheetData(sheetId, sheetName, 'A1:M60');

            if (!values || values.length === 0) {
                throw new Error('No se pudieron leer los datos del sheet');
            }

            const entry = entries[0];
            let targetRange = '';
            let targetValues = [[entry.name, entry.amount]];
            let foundInFijos = false;

            // RANGOS DEFINIDOS POR EL USUARIO: Filas 20 a 54
            // Nota: En arrays de JS (0-indexed), fila 20 es index 19, fila 54 es index 53.
            const MIN_ROW = 20;
            const MAX_ROW = 54;

            // --- INTENTO 1: SECTION "FIJOS" (Columna G, I) ---
            // Buscamos espacio entre fila 20 y 54
            for (let i = MIN_ROW - 1; i < MAX_ROW; i++) {
                // Columna G es index 6
                const rowData = values[i] || [];
                if (!rowData[6] || rowData[6].trim() === '') {
                    // Encontré fila vacía en Fijos (Columna G)
                    const rowNumber = i + 1;
                    const concepto = entry.name;
                    const importe = entry.amount;
                    const colH = rowData[7] || ''; // Mantener columna H intacta

                    targetRange = `${sheetName}!G${rowNumber}:I${rowNumber}`;
                    targetValues = [[concepto, colH, importe]];
                    foundInFijos = true;
                    break;
                }
            }

            // --- INTENTO 2: SECTION "GASTOS EXTRA" (Columna K, L) (FALLBACK) ---
            if (!foundInFijos) {
                let extraTargetRow = -1;
                for (let i = MIN_ROW - 1; i < MAX_ROW; i++) {
                    // Columna K es index 10
                    const rowData = values[i] || [];
                    if (!rowData[10] || rowData[10].trim() === '') {
                        extraTargetRow = i;
                        break;
                    }
                }

                if (extraTargetRow === -1) {
                    throw new Error('⚠️ Ambas secciones (Fijos y Gastos Extra) están llenas hasta la fila 54.');
                }

                const rowNumber = extraTargetRow + 1;
                targetRange = `${sheetName}!K${rowNumber}:L${rowNumber}`;
                targetValues = [[entry.name, entry.amount]];
            }

            // --- EJECUTAR UPDATE ---
            const url = `${this.baseUrl}/${sheetId}/values/${targetRange}?valueInputOption=USER_ENTERED`;

            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                },
                body: JSON.stringify({ values: targetValues })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'Error al actualizar sheet');
            }

            showSpinner(false);
            const section = foundInFijos ? 'Fijos' : 'Gastos Extra';
            showToast(`✅ Guardado en ${section}: ${entry.name}`, 'success');
            return await response.json();

        } catch (error) {
            showSpinner(false);
            console.error('Sheets Error:', error);
            showToast(`${error.message}`, 'error');
            throw error;
        }
    }

    async getSheetData(sheetId, sheetName, range = 'A1:M100') {
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
