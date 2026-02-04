import { config } from './config.js';
import { authManager, initializeAuth, updateAuthUI } from './auth.js';
import { getGeminiProcessor } from './gemini.js';
import { getOpenRouterProcessor } from './openrouter.js';
import { getSheetsManager } from './sheets.js';
import { voiceRecorder, initVoiceRecorder } from './voice.js';
import { showToast, pick, typeText, getCurrentMonthName } from './utils.js';
import { PullToRefresh } from './pull-to-refresh.js';
import { getPageFromURL } from './router.js';
import { SheetView } from './sheet-view.js';

// Main Application Logic
class mangosApp {
    constructor() {
        this.currentParsedData = null;
        this.isProcessing = false;
        this.longPressTimer = null;
        this.isLongPress = false;
        this.longPressThreshold = 300; // milliseconds
        this.sheetView = null;
        this.init();
    }

    async init() {
        this._setupEventListeners();

        // Register Service Worker for PWA
        this._registerServiceWorker();

        // Initialize Google Auth
        await this._initGoogleAuth();

        // Initialize Voice Recorder UI
        initVoiceRecorder();

        // Initialize Routing
        const { page, id } = getPageFromURL(window.location.href);
        if (page && page !== 'home') {
            this.showPage(page, id);
        } else {
            // Initial load of home: trigger entrance animation
            const $home = document.getElementById('home');
            const $currentMonth = document.querySelector('.badge-current-month');
            try {
                $currentMonth.textContent = JSON.parse(window.localStorage.getItem('mangos_config')).sheetName;
            } catch (e) {
                $currentMonth.textContent = getCurrentMonthName();
            }
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    console.log('Home loaded');
                    document.body.classList.add('loaded');
                    $home.classList.add('home--loaded');
                    // Typing effect is now handled by _showMainApp()
                });
            });
        }

        window.addEventListener('popstate', (eve) => {
            const { page, id } = getPageFromURL(window.location.href);
            const isBack = eve.state?.isBack || page === 'home';
            this.showPage(page, id, isBack);
        });

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
                this._handleAuthChange();
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

    async showPage(page, id, isBack = false) {
        if (!page) { page = 'home'; }

        let $prevPage = document.querySelector('.page-on');
        const $currentPage = document.getElementById(page);

        // If no page is "on", then the current visible thing must be home (if we are moving away from it)
        if (!$prevPage && page !== 'home') {
            $prevPage = document.getElementById('home');
        }

        if (!$currentPage) {
            console.warn(`Page ${page} not found, redirecting to home`);
            return this.showPage('home');
        }

        // Special handling for Home visibility
        if (page === 'home') {
            $currentPage.hidden = false;
        }

        if ($prevPage && $prevPage !== $currentPage) {
            if (isBack) {
                // Going back: Current page comes from the left (-80px) to 0 (z-index 5)
                // Previous page slides out to the right (z-index 10)

                $currentPage.classList.remove('page-on', 'page-off-right');
                $currentPage.classList.add('page-prev-on'); // at -80px (z-index 2)
                $currentPage.hidden = false;

                // Force reflow and wait for a frame
                $currentPage.offsetHeight;

                setTimeout(() => {
                    $prevPage.classList.remove('page-on');
                    $prevPage.classList.add('page-off-right'); // slides to 100% (z-index 10)

                    $currentPage.classList.remove('page-prev-on');
                    $currentPage.classList.add('page-on'); // slides to 0 (z-index 5)
                }, 20); // Small delay is often more reliable than rAF for transitions

                setTimeout(() => {
                    $prevPage.classList.remove('page-off-right');
                    $prevPage.hidden = true;
                }, 320);
            } else {
                // Going forward: Current page comes from the right (100%) to 0
                // Previous page slides to the left (0 to -80px)

                $prevPage.classList.add('page-prev-on'); // Slides to -80px
                $prevPage.classList.remove('page-on');

                $currentPage.classList.remove('page-prev-on'); // Ensure it's not at -80px
                $currentPage.hidden = false;
                $currentPage.offsetHeight; // Force reflow
                $currentPage.classList.add('page-on'); // Slides to 0

                setTimeout(() => {
                    // We keep .page-prev-on so it stays at -80px in the background
                    $prevPage.hidden = true;
                }, 300);
            }
        } else {
            // Initial load or same page
            $currentPage.hidden = false;
            $currentPage.classList.add('page-on');
        }

        // Page specific logic
        if (page === 'sheet') {
            if (!this.sheetView) {
                this.sheetView = new SheetView();
            } else {
                this.sheetView.loadData();
            }
        }
    }

    // --- Onboarding & Auth State Machine ---

    _handleAuthChange() {
        console.log('🔄 Auth State Changed. Checking flow...');
        const isSignedIn = authManager.isSignedIn();

        if (!authManager.tokenExpiry && !isSignedIn) {
            console.log('👋 User not signed in -> Welcome Screen');
            this._showWelcomeScreen();
            return;
        }

        const tokenExpired = new Date() > new Date(authManager.tokenExpiry);
        if (tokenExpired) {
            console.log('🔄 Token Expired. Requesting Access Token...');
            authManager.requestAccessToken(true);
            this._showMainApp();
            this._checkConfiguration(); // Run background checks (month update)
            return;
        }

        if (isSignedIn) {
            if (config.isConfigured()) {
                console.log('✅ User signed in & configured -> Main App');
                this._showMainApp();
                this._checkConfiguration(); // Run background checks (month update)
            } else {
                console.log('✨ User signed in but NOT configured -> Setup Choice');
                this._showSetupChoice();
            }
        }
    }

    _showWelcomeScreen() {
        // Show mainApp container first
        document.getElementById('mainApp').style.display = 'block';
        // Show welcome, hide others
        document.getElementById('welcomeSection').style.display = 'flex';
        document.getElementById('onboardingLoader').style.display = 'none';
        document.getElementById('setupChoiceSection').style.display = 'none';
        document.getElementById('home').style.display = 'none';
    }

    _showSetupChoice() {
        // Show mainApp container
        document.getElementById('mainApp').style.display = 'block';
        // Show choice, hide others
        document.getElementById('welcomeSection').style.display = 'none';
        document.getElementById('onboardingLoader').style.display = 'none';
        document.getElementById('setupChoiceSection').style.display = 'flex';
        document.getElementById('home').style.display = 'none';
    }

    _showMainApp() {
        // Show mainApp container
        document.getElementById('mainApp').style.display = 'block';
        // Hide welcome and loader
        document.getElementById('welcomeSection').style.display = 'none';
        document.getElementById('onboardingLoader').style.display = 'none';
        document.getElementById('setupChoiceSection').style.display = 'none';

        const home = document.getElementById('home');
        if (home.style.display === 'none') {
            home.style.display = 'flex'; // Show home
            // Trigger entrance animation
        }
        requestAnimationFrame(() => {
            document.body.classList.add('loaded');
            this._setupGreeting();
            this._typeGreetingSubtitle();

            // Show enhanced hint for first-time users
            if (localStorage.getItem('mangos_first_run') === 'true') {
                this._showFirstRunHint();
                localStorage.removeItem('mangos_first_run');
            }
        });
    }

    _showFirstRunHint() {
        const hintEl = document.getElementById('voiceHint');
        if (hintEl) {
            // Make hint more prominent temporarily
            hintEl.style.fontSize = '0.85rem';
            hintEl.style.fontWeight = '600';
            hintEl.style.opacity = '0.8';

            // Reset to normal after 5 seconds
            setTimeout(() => {
                hintEl.style.fontSize = '';
                hintEl.style.fontWeight = '';
                hintEl.style.opacity = '';
            }, 5000);
        }
    }

    async _startOnboardingFlow() {
        // Show mainApp container and loader
        document.getElementById('mainApp').style.display = 'block';
        document.getElementById('welcomeSection').style.display = 'none';
        document.getElementById('setupChoiceSection').style.display = 'none';
        document.getElementById('home').style.display = 'none';
        document.getElementById('onboardingLoader').style.display = 'flex';

        const statusEl = document.getElementById('onboardingStatus');

        try {
            const manager = getSheetsManager();
            if (!manager) throw new Error('Auth failed during onboarding');

            // 1. Clone Template
            statusEl.textContent = 'Creando tu sheet personal...';
            const TEMPLATE_ID = '17EqSTyy0Ey5aX3IJm1T1_6mPDlx5NNT9-PVOmWz_z6E';
            const date = new Date().toISOString().split('T')[0];
            const newTitle = `Mangos - ${date}`;

            const newFileId = await manager.copyFile(TEMPLATE_ID, newTitle);

            if (!newFileId) throw new Error('Failed to create file');

            // 2. Configure App
            statusEl.textContent = 'Configurando aplicación...';
            config.sheetId = newFileId;
            // Default sheet name, will be refined by auto-update later if needed
            // But we should try to set it correctly now if possible
            config.sheetName = getCurrentMonthName();
            config.save();

            // 3. Pre-load tabs (warmup)
            statusEl.textContent = 'Preparando tu espacio...';
            await this._loadSheetTabs(newFileId, config.sheetName);

            // 4. Mark as first run for hint display
            localStorage.setItem('mangos_first_run', 'true');

            // 5. Finish
            statusEl.textContent = '¡Todo listo!';
            await new Promise(resolve => setTimeout(resolve, 800)); // Brief pause to show success

            showToast('✅ ¡Todo listo!', 'success');

            // Reload to ensure clean state or just show app
            // Reload is safer to ensure all singletons bind correctly to new config
            window.location.reload();

        } catch (error) {
            console.error('Onboarding Error:', error);

            // More specific error messages
            let errorMsg = 'Hubo un problema preparando tu cuenta.';
            if (error.message.includes('Auth')) {
                errorMsg = 'Error de autenticación. Por favor, intentá iniciar sesión nuevamente.';
            } else if (error.message.includes('Failed to create')) {
                errorMsg = 'No pudimos crear tu hoja. Verificá tu conexión e intentá de nuevo.';
            }

            showToast(errorMsg, 'error');

            // Return to welcome screen for retry
            setTimeout(() => {
                this._showWelcomeScreen();
            }, 2000);
        }
    }

    _setupEventListeners() {
        // Global click listener for routing
        document.body.addEventListener('click', (eve) => {
            const $link = eve.target.closest('.link');
            if (!$link) return;

            // Only handle relative links or same-origin links
            const url = new URL($link.href, window.location.origin);
            if (url.origin !== window.location.origin) return;

            eve.preventDefault();
            const { page, id } = getPageFromURL($link.href);
            const isBack = page === 'home';

            history.pushState({ page, id, isBack: !isBack }, '', $link.href);
            this.showPage(page, id, isBack);
        });
        // Unified Input Button - Tap vs Long-Press
        const unifiedBtn = document.getElementById('unifiedInputBtn');
        this.voiceHintEl = document.getElementById('voiceHint');

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

        // Setup Choices
        document.getElementById('setupExistingBtn').addEventListener('click', () => this._openSettings());
        document.getElementById('setupCreateBtn').addEventListener('click', () => this._startOnboardingFlow());

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

        // Handle Sheet URL changes for dynamic tabs
        const sheetUrlInput = document.getElementById('sheetUrl');
        sheetUrlInput.addEventListener('blur', (e) => this._handleSheetUrlChange(e.target.value));
    }

    _handlePressStart(e) {
        e.preventDefault();
        this.isLongPress = false;

        // Start timer for long-press detection
        this.longPressTimer = setTimeout(() => {
            this.isLongPress = true;
            this._startVoiceRecording();
            if (this.voiceHintEl) this.voiceHintEl.classList.add('hidden');
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
            // Delay showing hint until orb returns to original size
            setTimeout(() => {
                if (this.voiceHintEl) this.voiceHintEl.classList.remove('hidden');
            }, 500);
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
            const processor = config.provider === 'openrouter'
                ? getOpenRouterProcessor()
                : getGeminiProcessor();

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
        data.entries.forEach((entry, i) => {
            html += `
                <li class="entry-neo" style="margin-bottom: 12px;">
                    <div style="display: flex; align-items: flex-end; width: 100%; justify-content: space-between;">
                        <div style="flex: 1; margin-right: 12px;">
                            <div class="name-edit-container">
                                <svg xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 16px; opacity: 0.5;" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-tag-icon lucide-tag"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>
                                <input type="text" class="input-edit-name" value="${entry.name}" data-index="${i}" placeholder="Nombre del gasto" autocomplete="off">
                            </div>
                            <input type="text" class="input-edit-amount" value="${entry.amount}" data-index="${i}" placeholder="0" inputmode="decimal">
                        </div>
                    </div>
                </li>
            `;
        });
        html += '</ul>';

        responseEl.innerHTML = html;
        confirmBtn.disabled = false;
        rejectBtn.disabled = false;

        // Attach event listeners for real-time updates
        const nameInputs = responseEl.querySelectorAll('.input-edit-name');
        const amountInputs = responseEl.querySelectorAll('.input-edit-amount');

        nameInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const index = e.target.dataset.index;
                this.currentParsedData.entries[index].name = e.target.value;
            });
        });

        amountInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const index = e.target.dataset.index;
                // Treat amount as string to allow symbols
                this.currentParsedData.entries[index].amount = e.target.value;
            });
        });

        // Show results panel and hide voice/text inputs
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

    async _handleSheetUrlChange(url) {
        if (!url) return;
        const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        const id = (match && match[1]) ? match[1] : (url.length > 20 && !url.includes('/') ? url : null);

        if (id) {
            await this._loadSheetTabs(id);
        }
    }

    async _loadSheetTabs(spreadsheetId, preselectedName = null) {
        const select = document.getElementById('sheetName');
        const loader = document.getElementById('sheetLoading');
        const manager = getSheetsManager();

        if (!manager) {
            select.innerHTML = '<option value="" disabled selected>Inicia sesión primero</option>';
            return;
        }

        try {
            select.disabled = true;
            loader.style.display = 'block';
            select.innerHTML = '<option value="" disabled selected>Cargando hojas...</option>';

            const tabs = await manager.getSpreadsheetTabs(spreadsheetId);

            if (tabs && tabs.length > 0) {
                // Filter out 'Informe' sheet
                const filteredTabs = tabs.filter(tab => tab !== 'Informe');

                if (filteredTabs.length > 0) {
                    select.innerHTML = filteredTabs.map(tab => `<option value="${tab}">${tab}</option>`).join('');
                    select.disabled = false;

                    if (preselectedName && filteredTabs.includes(preselectedName)) {
                        // User has a saved preference, respect it
                        select.value = preselectedName;
                    } else {
                        // First-time setup: auto-select current month if available
                        const currentMonth = getCurrentMonthName();
                        if (filteredTabs.includes(currentMonth)) {
                            select.value = currentMonth;
                        } else {
                            select.value = filteredTabs[0];
                        }
                    }
                } else {
                    select.innerHTML = '<option value="" disabled selected>No hay hojas disponibles para carga</option>';
                }
            } else {
                 select.innerHTML = '<option value="" disabled selected>No se encontraron hojas</option>';
            }

        } catch (error) {
            console.error('Error loading tabs:', error);
            select.innerHTML = '<option value="" disabled selected>Error al cargar hojas</option>';
        } finally {
            loader.style.display = 'none';
        }
    }


    _openSettings() {
        const modal = document.getElementById('settingsModal');

        // Show current values if they exist
        if (config.sheetId) {
            document.getElementById('sheetUrl').value = `https://docs.google.com/spreadsheets/d/${config.sheetId}/edit`;
            // Trigger load tabs
            this._loadSheetTabs(config.sheetId, config.sheetName);
        } else {
             document.getElementById('sheetUrl').value = '';
        }

        document.getElementById('apiKey').value = config.apiKey;

        modal.classList.add('active');
    }


    _saveSettings() {
        const sheetUrl = document.getElementById('sheetUrl').value.trim();
        const sheetName = document.getElementById('sheetName').value.trim();
        const apiKey = document.getElementById('apiKey').value.trim();

        // Extract ID from URL
        // Patterns: /spreadsheets/d/ID/edit, /spreadsheets/d/ID
        const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (match && match[1]) {
            config.sheetId = match[1];
        } else if (sheetUrl.length > 20 && !sheetUrl.includes('/')) {
            // Assume it is the ID directly if no URL pattern matches
            config.sheetId = sheetUrl;
        } else {
             showToast('URL de Spreadsheet inválida', 'error');
             return;
        }

        config.sheetName = sheetName;
        config.apiKey = apiKey;
        config.save();

        document.getElementById('settingsModal').classList.remove('active');

        // Reload page to apply changes in ESM structure easily
        setTimeout(() => window.location.reload(), 500);
    }

    async _checkConfiguration() {
        if (!config.isConfigured()) {
            console.warn('⚠️ Configuración incompleta');
            return;
        }
        // Configuration is valid, no auto-switching
    }

    _setupGreeting() {
        const name = localStorage.getItem('mangos_user_name');
        const greetingEl = document.getElementById('userGreeting');
        const subtitleEl = document.getElementById('greetingText');

        if (subtitleEl) subtitleEl.textContent = ''; // Ensure it's empty before typing
        if (!greetingEl) return;

        let greeting = 'Hola';
        if (name && name !== 'Hola') {
            greetingEl.textContent = `${greeting}, ${name}`;
        } else {
            greetingEl.textContent = `${greeting}`;
        }
    }

    _typeGreetingSubtitle() {
        const greetings = [
            '¿Cuántos gastaste?',
            'Decime cuántos y lo sumamos.',
            '¿Qué gastos sumamos?',
            'Pasame los gastos y los sumamos.',
        ];

        typeText('greetingText', pick(greetings), 15);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new mangosApp();
    window.app = app; // For debugging
});
