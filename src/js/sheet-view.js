import { config } from './config.js';
import { authManager, initializeAuth } from './auth.js';
import { getSheetsManager } from './sheets.js';

export class SheetView {
    constructor() {
        this.init();
    }

    async init() {
        console.log('📄 Iniciando Vista de Sheet...');

        // Initialize Auth if needed
        await this._initGoogleAuth();

        // Wait for auth to be ready
        if (authManager && authManager.isSignedIn()) {
            this.loadData();
        } else {
            // Listen for sign-in if not signed in yet
            document.addEventListener('auth-changed', (e) => {
                if (e.detail.isSignedIn) {
                    this.loadData();
                }
            });
        }
    }

    async _initGoogleAuth() {
        if (typeof google !== 'undefined' && google.accounts) {
            await initializeAuth();
        } else {
            const checkGoogle = setInterval(async () => {
                if (typeof google !== 'undefined' && google.accounts) {
                    clearInterval(checkGoogle);
                    await initializeAuth();
                }
            }, 300);

            setTimeout(() => clearInterval(checkGoogle), 15000);
        }
    }

    async loadData() {
        const container = document.getElementById('sheetDataContainer');
        const manager = getSheetsManager();

        if (!manager) {
            container.innerHTML = '<div class="empty-state">No se pudo iniciar el gestor de Sheets. Registrate de nuevo.</div>';
            return;
        }

        try {
            // Fetch range covering summary data and movements
            const data = await manager.getSheetData(config.sheetId, config.sheetName, 'A1:H118');

            if (!data || data.length === 0) {
                container.innerHTML = '<div class="empty-state">No se encontraron datos en el sheet.</div>';
                return;
            }

            // Extract Summary Data
            // D2 -> rows[1][3]
            // G11 -> rows[10][6]
            const disponible = data[1]?.[3] || '$0';
            const gastado = data[10]?.[6] || '$0';

            // Show/hide disponible card based on data availability
            const cardDisponible = document.getElementById('cardDisponible');
            const hasDisponibleData = disponible && disponible.trim() !== '' && disponible !== '$0';

            if (hasDisponibleData) {
                cardDisponible.style.display = 'block';
                document.getElementById('val-disponible').querySelector('.value-real').textContent = disponible;
            } else {
                cardDisponible.style.display = 'none';
            }

            document.getElementById('val-gastado').querySelector('.value-real').textContent = gastado;

            // Render Table (start from row 12 for expenses)
            const expenseRows = data.slice(11);
            this.renderTable(expenseRows);
        } catch (error) {
            console.error('Error loading sheet data:', error);
            container.innerHTML = `<div class="empty-state">Error al cargar datos: ${error.message}</div>`;
        }
    }

    renderTable(rows) {
        const container = document.getElementById('sheetDataContainer');

        // Filter out empty rows
        const validRows = rows.filter(row => row[6] && row[6].trim() !== '');

        if (validRows.length === 0) {
            container.innerHTML = '<div class="empty-state">No hay movimientos registrados.</div>';
            return;
        }

        // Reverse to show newest first
        validRows.reverse();

        let html = `
            <table class="neo-table">
                <thead>
                    <tr>
                        <th>Concepto</th>
                        <th class="text-right">Monto</th>
                    </tr>
                </thead>
                <tbody>
        `;

        validRows.forEach(row => {
            const name = row[6]; // Column G is index 6
            const amount = row[7] || '$0'; // Column H is index 7
            html += `
                <tr>
                    <td>${name}</td>
                    <td class="text-right amount-cell">${amount}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    }
}

// End of SheetView class
