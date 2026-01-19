import { config } from './config.js';
import { authManager, initializeAuth, updateAuthUI } from './auth.js';
import { getGeminiProcessor } from './gemini.js';
import { getSheetsManager } from './sheets.js';
import { voiceRecorder, initVoiceRecorder } from './voice.js';
import { showToast, showSpinner } from './utils.js';

// Main Application Logic
class CashFlowApp {
    constructor() {
        this.currentParsedData = null;
        this.isProcessing = false;
        this.init();
    }

    async init() {
        this._setupEventListeners();
        this._checkConfiguration();
        this._updateGreeting();

        // Initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }

        // Register Service Worker for PWA
        this._registerServiceWorker();

        // Initialize Google Auth
        await this._initGoogleAuth();

        // Initialize Voice Recorder UI
        initVoiceRecorder();
    }

    async _initGoogleAuth() {
        console.log('📄 Iniciando flujo de Google Auth...');

        // Esperar a que google esté disponible
        const checkGoogle = setInterval(async () => {
            if (typeof google !== 'undefined' && google.accounts) {
                clearInterval(checkGoogle);
                await initializeAuth();
            }
        }, 300);

        // Timeout de seguridad (máximo 15 segundos esperando)
        setTimeout(() => {
            clearInterval(checkGoogle);
            if (!authManager || !authManager.isInitialized) {
                console.warn('⚠️ google.accounts no cargó después de 15 segundos');
                showToast('Error cargando Google. Recarga la página.', 'error');
                updateAuthUI();
            }
        }, 15000);
    }

    _registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(reg => console.log('🚀 PWA: Service Worker registrado'))
                    .catch(err => console.log('❌ PWA: Error al registrar SW', err));
            });
        }
    }

    _setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this._switchTab(e.target.closest('.tab-btn').dataset.tab));
        });

        // Text Input
        document.getElementById('submitTextBtn').addEventListener('click', () => this._handleTextInput());
        document.getElementById('textInput').addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                this._handleTextInput();
            }
        });

        // Voice Input
        document.getElementById('startVoiceBtn').addEventListener('click', () => this._handleVoiceStart());
        document.getElementById('stopVoiceBtn').addEventListener('click', () => this._handleVoiceStop());


        // Settings
        document.getElementById('settingsBtn').addEventListener('click', () => this._openSettings());

        // Modal controls
        const modal = document.getElementById('settingsModal');

        // Close on click outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });

        // Handle form submit instead of button click
        document.getElementById('settingsForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this._saveSettings();
        });

        // AI Response Actions
        document.getElementById('confirmBtn').addEventListener('click', () => this._confirmAndSave());
        document.getElementById('rejectBtn').addEventListener('click', () => this._rejectData());
    }

    _switchTab(tabName) {
        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Hide results if they were visible
        this._clearAIResponse();

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
            content.classList.add('hidden');
        });
        const targetTab = document.getElementById(`${tabName}-tab`);
        if (targetTab) {
            targetTab.classList.add('active');
            targetTab.classList.remove('hidden');
        }

        // Limpiar estado previo
        this.currentParsedData = null;
        this._clearAIResponse();
    }

    async _handleTextInput() {
        const textArea = document.getElementById('textInput');
        const text = textArea.value.trim();

        if (!text) {
            showToast('Por favor ingresá algo de texto', 'warning');
            return;
        }

        if (this.isProcessing) return;

        this.isProcessing = true;
        try {
            const processor = getGeminiProcessor();
            if (!processor) return;

            const result = await processor.processText(text);
            this._displayAIResponse(result);
            this.currentParsedData = result;

        } catch (error) {
            console.error('Error:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    _handleVoiceStart() {
        if (voiceRecorder.isRecording) {
            voiceRecorder.stop();
            return;
        }

        voiceRecorder.start((transcript) => {
            // Este callback se ejecuta cuando se detecta el final del habla
            document.getElementById('textInput').value = transcript;
            this._handleTextInput();
            showToast('🎤 Procesando voz automáticamente...', 'info');
        });
    }

    _handleVoiceStop() {
        voiceRecorder.stop();
    }


    /**
     * Display AI interpretation with Neo-Minimalist styling
     */
    _displayAIResponse(data) {
        const responseEl = document.getElementById('aiResponse');
        const confirmBtn = document.getElementById('confirmBtn');
        const rejectBtn = document.getElementById('rejectBtn');

        if (!data || !data.entries) {
            responseEl.innerHTML = '<p style="color: #ff4747;">❌ Error en interpretación.</p>';
            return;
        }

        let html = '<ul class="entries-neo" style="list-style: none; padding: 0; margin: 0;">';
        data.entries.forEach(entry => {
            html += `
                <li class="entry-neo" style="margin-bottom: 12px;">
                    <div style="display: flex; align-items: flex-end; width: 100%; justify-content: space-between;">
                        <div>
                            <div class="name" style="display: flex; align-items: center; gap: 6px;">
                                <i data-lucide="tag" style="width: 12px; height: 12px;"></i>
                                ${entry.name}
                            </div>
                            <div class="amount">$${entry.amount}</div>
                        </div>
                    </div>
                </li>
            `;
        });
        html += '</ul>';

        responseEl.innerHTML = html;
        confirmBtn.disabled = false;
        rejectBtn.disabled = false;

        // Show results panel and hide inputs
        document.getElementById('resultsPanel').classList.remove('hidden');
        document.querySelector('.tab-content.active').classList.add('hidden');

        // Initialize newly added icons
        if (window.lucide) {
            lucide.createIcons();
        }

        // Haptic feel
        if (window.navigator.vibrate) window.navigator.vibrate([20, 10, 20]);

        document.getElementById('resultsPanel').scrollIntoView({ behavior: 'smooth' });
    }

    _clearAIResponse() {
        document.getElementById('aiResponse').innerHTML = '<p style="opacity: 0.5; font-size: 0.9rem;">Esperando actividad...</p>';
        document.getElementById('confirmBtn').disabled = true;
        document.getElementById('rejectBtn').disabled = true;

        // Hide results panel and show active tab
        document.getElementById('resultsPanel').classList.add('hidden');
        const activeTabBtn = document.querySelector('.tab-btn.active');
        if (activeTabBtn) {
            const activeTab = activeTabBtn.dataset.tab;
            document.getElementById(`${activeTab}-tab`).classList.remove('hidden');
        }

        // Reset inputs
        document.getElementById('textInput').value = '';
        const voiceTranscriptEl = document.getElementById('voiceTranscript');
        if (voiceTranscriptEl) voiceTranscriptEl.textContent = '';
    }

    async _confirmAndSave() {
        if (!this.currentParsedData || !this.currentParsedData.entries) return;

        try {
            const manager = getSheetsManager();
            if (!manager) {
                showToast('🔑 Por favor inicia sesión con Google primero', 'warning');
                return;
            }

            // Usamos el nuevo método de ruteo inteligente (Fijos -> Gastos Extra)
            await manager.addExpense(
                config.sheetId,
                config.sheetName,
                this.currentParsedData.entries
            );

            // Limpiar UI
            document.getElementById('textInput').value = '';
            this._clearAIResponse();
            this.currentParsedData = null;

        } catch (error) {
            console.error('Error saving:', error);
        }
    }

    _rejectData() {
        this.currentParsedData = null;
        this._clearAIResponse();
        showToast('Datos rechazados', 'info');
    }

    _openSettings() {
        const modal = document.getElementById('settingsModal');
        document.getElementById('googleClientId').value = config.googleClientId;
        document.getElementById('apiKey').value = config.apiKey;
        document.getElementById('sheetId').value = config.sheetId;
        document.getElementById('sheetName').value = config.sheetName;
        modal.classList.add('active');
    }

    _saveSettings() {
        const googleClientId = document.getElementById('googleClientId').value.trim();
        const apiKey = document.getElementById('apiKey').value.trim();
        const sheetId = document.getElementById('sheetId').value.trim();
        const sheetName = document.getElementById('sheetName').value.trim();

        config.googleClientId = googleClientId;
        config.apiKey = apiKey;
        config.sheetId = sheetId;
        config.sheetName = sheetName;
        const appLang = document.getElementById('appLang');
        if (appLang) config.lang = appLang.value;
        config.save();

        document.getElementById('settingsModal').classList.remove('active');
        showToast('✅ Configuración guardada', 'success');

        // Reload page to apply changes in ESM structure easily
        setTimeout(() => window.location.reload(), 500);
    }

    _checkConfiguration() {
        if (!config.isConfigured()) {
            showToast('⚙️ Por favor configura tu API Key en Configuración', 'warning');
        }
    }

    _updateGreeting() {
        const name = localStorage.getItem('cashflow_user_name') || '¡Hola!';
        const greetingEl = document.getElementById('userGreeting');
        if (greetingEl) {
            greetingEl.textContent = name === '¡Hola!' ? '¡Hola!' : `¡Hola, ${name}!`;
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new CashFlowApp();
    window.app = app; // For debugging
});
