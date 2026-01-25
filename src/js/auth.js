import { showToast } from './utils.js';

// OAuth2 Authentication for Google Sheets (usando Google Identity Services)
export class GoogleAuthManager {
// ... (rest of the class remains the same)
    constructor() {
        this.CLIENT_ID = '256070338281-j2n8l3662cs52te244u462h48svrgpi5.apps.googleusercontent.com';
        this.accessToken = localStorage.getItem('mangos_access_token');
        this.tokenExpiry = localStorage.getItem('mangos_token_expiry');
        this.isInitialized = false;
        this.tokenClient = null;
    }

    async initialize() {
        return new Promise((resolve) => {
            try {
                // Check if we have a token in the URL after redirect
                this._checkTokenFromUrl();

                // GIS Token Model Initialization (keep for silent refresh)
                if (typeof google === 'undefined' || !google.accounts) {
                    console.error('❌ google.accounts no disponible');
                    resolve(false);
                    return;
                }

                // Initialize Token Client
                this.tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: this.CLIENT_ID,
                    scope: 'https://www.googleapis.com/auth/spreadsheets openid profile email',
                    callback: (response) => this._handleTokenResponse(response),
                });

                this.isInitialized = true;
                console.log('✅ Google Identity Services (Token Model) inicializado');

                // Si tenemos un token, verificar si está por expirar para refrescarlo
                if (this.accessToken && this.tokenExpiry) {
                    this._checkAndRefreshIfNeeded();
                }

                resolve(true);

            } catch (error) {
                console.error('Error inicializando Google Auth:', error);
                resolve(false);
            }
        });
    }

    _checkTokenFromUrl() {
        const hash = window.location.hash.substring(1);
        if (!hash) return;

        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const expiresIn = params.get('expires_in');

        if (accessToken) {
            console.log('🏷️ Token encontrado en URL (Redirect Flow)');

            this.accessToken = accessToken;
            localStorage.setItem('mangos_access_token', this.accessToken);

            const expiry = new Date();
            expiry.setSeconds(expiry.getSeconds() + (parseInt(expiresIn) || 3600));
            this.tokenExpiry = expiry.toISOString();
            localStorage.setItem('mangos_token_expiry', this.tokenExpiry);

            // Clean URL
            history.replaceState(null, null, window.location.pathname);

            // Fetch user info
            this._fetchUserInfo(this.accessToken);
        }
    }

    _handleTokenResponse(response) {
        console.log('📝 Token response recibida:', response.access_token ? 'OK' : 'Error');

        if (response.error !== undefined) {
            console.error('❌ Error obteniendo token:', response.error);
            if (response.error === 'immediate_failed') {
                console.warn('⚠️ Refresh silencioso falló, se requiere interacción del usuario');
            } else {
                showToast('Error en autenticación. Intenta de nuevo.', 'error');
            }
            return;
        }

        // Guardar access token
        this.accessToken = response.access_token;
        localStorage.setItem('mangos_access_token', this.accessToken);

        // Calcular expiry (típicamente 3600 segundos = 1 hora)
        const expiry = new Date();
        const expiresIn = response.expires_in || 3600;
        expiry.setSeconds(expiry.getSeconds() + expiresIn);
        this.tokenExpiry = expiry.toISOString();
        localStorage.setItem('mangos_token_expiry', this.tokenExpiry);

        console.log(`✅ Token actualizado. Expira en: ${this.tokenExpiry}`);

        // Intentar obtener info del usuario si no la tenemos
        if (!localStorage.getItem('mangos_user_name')) {
            this._fetchUserInfo(this.accessToken);
        }

        updateAuthUI();
        if (window.app) window.app._updateGreeting();
    }

    async _fetchUserInfo(token) {
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Error fetching user info');
            const data = await response.json();
            if (data.given_name || data.name) {
                const name = data.given_name || data.name.split(' ')[0];
                localStorage.setItem('mangos_user_name', name);
                localStorage.setItem('mangos_user_email', data.email);
                console.log(`👤 Usuario obtenido: ${name} (${data.email})`);
                if (window.app) window.app._updateGreeting();
            }
        } catch (e) {
            console.warn('⚠️ No se pudo obtener info del usuario:', e);
        }
    }

    _checkAndRefreshIfNeeded() {
        if (!this.tokenExpiry) return;

        const expiry = new Date(this.tokenExpiry);
        const now = new Date();
        const diffMinutes = (expiry - now) / 1000 / 60;

        // Si falta menos de 5 minutos, refrescar
        if (diffMinutes < 5) {
            console.log('🔄 Token por expirar o expirado, intentando refresh silencioso...');
            this.requestAccessToken(true);
        }

        // Programar siguiente chequeo en 1 minuto
        setTimeout(() => this._checkAndRefreshIfNeeded(), 60000);
    }

    requestAccessToken(silent = false) {
        if (!this.tokenClient) {
            console.error('❌ TokenClient no inicializado');
            return;
        }

        console.log(`🔄 Solicitando Access Token (${silent ? 'silencioso' : 'con redirect'})...`);

        if (silent) {
            // Peligroso: Si falla el silencioso, GIS abre un popup por defecto en algunos navegadores
            // si no seteamos prompt: ''. Pero para redirect flow real, preferimos que si no es silent,
            // hagamos un redirect manual.
            this.tokenClient.requestAccessToken({ prompt: '' });
        } else {
            // Redirect Flow (Implicit Flow manual)
            const rootUrl = window.location.origin;
            const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
                `client_id=${this.CLIENT_ID}&` +
                `redirect_uri=${rootUrl}&` +
                `response_type=token&` +
                `scope=https://www.googleapis.com/auth/spreadsheets openid profile email&` +
                `include_granted_scopes=true&` +
                `state=oauth_redirect`;

            window.location.href = oauthUrl;
        }
    }

    signIn() {
        this.requestAccessToken(false);
    }

    async signOut() {
        try {
            // Revocar el access token
            if (this.accessToken) {
                google.accounts.oauth2.revoke(this.accessToken, () => {
                    console.log('✅ Token revocado');
                });
            }

            localStorage.removeItem('mangos_access_token');
            localStorage.removeItem('mangos_token_expiry');
            localStorage.removeItem('mangos_user_email');
            localStorage.removeItem('mangos_user_name');

            this.accessToken = null;
            this.tokenExpiry = null;

            showToast('Sesión cerrada', 'info');
            updateAuthUI();
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
        }
    }

    isSignedIn() {
        if (!this.accessToken) return false;

        // Verificar si el token expiró
        if (this.tokenExpiry) {
            const expiry = new Date(this.tokenExpiry);
            if (new Date() > expiry) {
                // Intentar refresh silencioso
                this.requestAccessToken(true);
                return false; // Retornamos false mientras se refresca
            }
        }
        return true;
    }

    getAccessToken() {
        // Antes de devolver, chequear si necesita refresh
        if (this.tokenExpiry) {
            const expiry = new Date(this.tokenExpiry);
            if (new Date() > expiry) {
                console.warn('⚠️ getAccessToken: Token expirado, solicitando refresh...');
                this.requestAccessToken(true);
                return null;
            }
        }
        return this.accessToken;
    }

    getUserEmail() {
        return localStorage.getItem('mangos_user_email') || 'Usuario';
    }
}

// Instancia global
export let authManager = new GoogleAuthManager();

export async function initializeAuth() {
    console.log('🔄 Inicializando auth (Google SDK)...');
    const initialized = await authManager.initialize();

    console.log('Initialized result:', initialized);

    if (initialized) {
        if (authManager.isSignedIn()) {
            console.log(`✅ OAuth2 inicializado. Usuario: ${authManager.getUserEmail()}`);
        } else {
            console.log('⚠️ OAuth2 inicializado, pero usuario no autenticado - mostrando botón');
        }
        updateAuthUI();
    } else {
        console.error('❌ Error inicializando OAuth2');
        // No mostramos toast ya que es esperado si no está configurado aún
    }
}

export function updateAuthUI() {
    console.log('🎨 Actualizando UI...');
    const settingsBtn = document.getElementById('settingsBtn');
    const headerActions = document.querySelector('.header-actions');

    if (!headerActions) {
        console.error('❌ No encontré .header-actions');
        return;
    }

    if (authManager && authManager.isSignedIn()) {
        console.log('✅ Usuario autenticado');
        if (settingsBtn) settingsBtn.disabled = false;

        // Quitar botón de Google Sign-In si existe
        const googleSignInContainer = document.getElementById('googleSignInContainer');
        if (googleSignInContainer) googleSignInContainer.remove();

        console.log(`✅ Conectado como: ${authManager.getUserEmail()}`);
    } else {
        console.log('❌ Usuario NO autenticado');
        if (settingsBtn) settingsBtn.disabled = false;

        // Renderizar Google Sign-In Button si no existe
        if (!document.getElementById('googleSignInContainer')) {
            console.log('Creando botón de Google Sign-In');
            const container = document.createElement('div');
            container.id = 'googleSignInContainer';
            container.style.display = 'inline-block';
            headerActions.insertBefore(container, headerActions.firstChild);

            // Renderizar un botón custom de Google (más confiable para redirección manual)
            container.innerHTML = `
                <button class="btn-neo" style="padding: 8px 16px; font-size: 0.8rem; border-radius: 40px; background: white; color: var(--text-main); border: 1px solid var(--border-strong);">
                    <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z" fill="#EA4335"/>
                    </svg>
                    Ingresar
                </button>
            `;

            container.querySelector('button').addEventListener('click', () => {
                console.log('👆 Click en botón custom, solicitando login...');
                authManager.requestAccessToken();
            });

            console.log('✅ Botón custom de Google renderizado');
        }

        console.log('⚠️ Usuario no autenticado');
    }
}
