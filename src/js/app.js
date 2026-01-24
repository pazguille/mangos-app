import { config } from './config.js';
import { authManager, initializeAuth, updateAuthUI } from './auth.js';
import { getGeminiProcessor } from './gemini.js';
import { getSheetsManager } from './sheets.js';
import { voiceRecorder, initVoiceRecorder } from './voice.js';
import { showToast, showSpinner } from './utils.js';
import { PullToRefresh } from './pull-to-refresh.js';

// Main Application Logic
class mangosApp {
    constructor() {
        this.currentParsedData = null;
        this.isProcessing = false;
        this.longPressTimer = null;
        this.isLongPress = false;
        this.longPressThreshold = 300; // milliseconds
        this.init();
    }

    async init() {
        this._setupEventListeners();
        this._checkConfiguration();
        this._updateGreeting();

        // Register Service Worker for PWA
        this._registerServiceWorker();

        // Initialize Google Auth
        await this._initGoogleAuth();

        // Initialize Voice Recorder UI
        initVoiceRecorder();

        // Initialize Pull-to-Refresh
        this.pullToRefresh = new PullToRefresh({
            headerHeight: 65,
            threshold: 65,
            onRefresh: () => window.location.reload()
        });
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
        // Unified Input Button - Tap vs Long-Press
        const unifiedBtn = document.getElementById('unifiedInputBtn');

        // Touch events for mobile
        unifiedBtn.addEventListener('touchstart', (e) => this._handlePressStart(e));
        unifiedBtn.addEventListener('touchend', (e) => this._handlePressEnd(e));
        unifiedBtn.addEventListener('touchcancel', (e) => this._handlePressEnd(e));

        // Text Input
        document.getElementById('submitTextBtn').addEventListener('click', () => this._handleTextInput());
        document.getElementById('textInput').addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                this._handleTextInput();
            }
        });

        // Click outside to hide text input
        document.addEventListener('click', (e) => {
            if (e.target.id === 'unifiedInputBtn') {
                this._showTextInput();
                return;
            }

            const textSection = document.getElementById('textInputSection');
            const isTextSectionVisible = !textSection.classList.contains('hidden');

            // If text section is visible and click is outside of it, hide it
            if (isTextSectionVisible && !textSection.contains(e.target)) {
                this._hideTextInput();
            }
        });

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

    _handlePressStart(e) {
        e.preventDefault();
        this.isLongPress = false;

        // Start timer for long-press detection
        this.longPressTimer = setTimeout(() => {
            this.isLongPress = true;
            this._startVoiceRecording();
        }, this.longPressThreshold);
    }

    _handlePressEnd(e) {
        e.preventDefault();

        // Clear the timer
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }

        // If it was a long press, stop recording
        if (this.isLongPress) {
            this._stopVoiceRecording();
            this.isLongPress = false;
        } else {
            // It was a tap - show text input
            this._showTextInput();
        }
    }

    _showTextInput() {
        const textSection = document.getElementById('textInputSection');
        const voiceNexus = document.querySelector('.voice-nexus');

        // Hide voice button, show text input
        voiceNexus.classList.add('hidden');
        textSection.classList.remove('hidden');

        document.getElementById('textInput').focus();
    }

    _hideTextInput() {
        const textSection = document.getElementById('textInputSection');
        const voiceNexus = document.querySelector('.voice-nexus');

        // Show voice button, hide text input
        textSection.classList.add('hidden');
        voiceNexus.classList.remove('hidden');
    }

    async _handleTextInput() {
        const textArea = document.getElementById('textInput');
        const text = textArea.value.trim();

        if (!text) {
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

    _startVoiceRecording() {
        if (voiceRecorder.isRecording) {
            return;
        }

        document.querySelector('video').playbackRate = 3;

        voiceRecorder.start(async (transcript) => {
            // Este callback se ejecuta cuando se detecta el final del habla
            document.getElementById('textInput').value = transcript;

            // Show loading state
            const unifiedBtn = document.getElementById('unifiedInputBtn');
            if (unifiedBtn) unifiedBtn.classList.add('loading');

            try {
                await this._handleTextInput();
            } finally {
                // Remove loading state
                if (unifiedBtn) unifiedBtn.classList.remove('loading');
            }
        });
    }

    _stopVoiceRecording() {
        document.querySelector('video').playbackRate = 1;
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
                            <div class="name" style="display: flex; align-items: center; gap: 4px;">
                                <svg xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 16px;" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-tag-icon lucide-tag"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>
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
        document.querySelector('.text-input-section').classList.add('hidden');
        document.querySelector('.voice-nexus').classList.add('hidden');

        document.getElementById('resultsPanel').scrollIntoView({ behavior: 'smooth' });
    }

    _clearAIResponse() {
        document.getElementById('aiResponse').innerHTML = '<p style="opacity: 0.5; font-size: 0.9rem;">Esperando actividad...</p>';
        document.getElementById('confirmBtn').disabled = true;
        document.getElementById('rejectBtn').disabled = true;

        // Hide results panel and show voice button
        document.getElementById('resultsPanel').classList.add('hidden');
        document.querySelector('.voice-nexus').classList.remove('hidden');
        this._hideTextInput();

        // Reset inputs
        document.getElementById('textInput').value = '';
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

        // Reload page to apply changes in ESM structure easily
        setTimeout(() => window.location.reload(), 500);
    }

    _checkConfiguration() {
        if (!config.isConfigured()) {
            console.warn('⚠️ Configuración incompleta');
        }
    }

    _updateGreeting() {
        const name = localStorage.getItem('mangos_user_name');
        const greetingEl = document.getElementById('userGreeting');

        if (!greetingEl) return;

        const hour = new Date().getHours();
        let greeting = 'Hola';

        if (hour >= 5 && hour < 12) {
            greeting = 'Buen día';
        } else if (hour >= 12 && hour < 20) {
            greeting = 'Buenas tardes';
        } else {
            greeting = 'Buenas noches';
        }

        if (name && name !== 'Hola') {
            greetingEl.textContent = `${greeting}, ${name}`;
        } else {
            greetingEl.textContent = `${greeting}`;
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new mangosApp();
    window.app = app; // For debugging
});
