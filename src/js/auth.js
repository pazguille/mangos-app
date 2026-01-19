import { config } from './config.js';
import { showToast } from './utils.js';

// OAuth2 Authentication for Google Sheets (usando Google Identity Services)
export class GoogleAuthManager {
// ... (rest of the class remains the same)
    constructor() {
        this.CLIENT_ID = config.googleClientId;
        this.accessToken = localStorage.getItem('cashflow_access_token');
        this.tokenExpiry = localStorage.getItem('cashflow_token_expiry');
        this.isInitialized = false;
    }

    async initialize() {
        return new Promise((resolve) => {
            try {
                // 1. Revisar si volvemos de una redirección con un token en el hash
                this._parseHashToken();

                // 2. Esperar a que google esté disponible
                if (typeof google === 'undefined' || !google.accounts) {
                    console.error('❌ google.accounts no disponible');
                    resolve(false);
                    return;
                }

                // Inicializar Google Identity Services CON SCOPES para OAuth2
                google.accounts.id.initialize({
                    client_id: config.googleClientId,
                    ux_mode: 'redirect', // Forzar modo redirección
                    callback: (response) => this._handleCredentialResponse(response),
                    // Scopes para acceder a Google Sheets
                    scope: 'https://www.googleapis.com/auth/spreadsheets'
                });

                this.isInitialized = true;
                console.log('✅ Google Identity Services inicializado');
                resolve(true);

            } catch (error) {
                console.error('Error inicializando Google Auth:', error);
                resolve(false);
            }
        });
    }

    _handleCredentialResponse(response) {
        console.log('📝 ID Token recibido, solicitando Access Token vía redirección...');

        // Extraer nombre del ID Token (JWT)
        try {
            const base64Url = response.credential.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(
                atob(base64).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
            );
            const decoded = JSON.parse(jsonPayload);

            if (decoded.given_name || decoded.name) {
                const name = decoded.given_name || decoded.name.split(' ')[0];
                localStorage.setItem('cashflow_user_name', name);
                console.log(`👤 Usuario detectado: ${name}`);
            }
        } catch (e) {
            console.warn('⚠️ No se pudo extraer el nombre del ID Token');
        }

        this.requestAccessToken();
    }

    _handleTokenResponse(response) {
        console.log('📝 Access Token recibido (para APIs):', response.access_token?.substring(0, 20) + '...');

        if (response.error !== undefined) {
            console.error('❌ Error obteniendo token:', response.error);
            showToast('Error en autenticación. Intenta de nuevo.', 'error');
            return;
        }

        // Guardar access token
        this.accessToken = response.access_token;
        localStorage.setItem('cashflow_access_token', this.accessToken);

        // Calcular expiry (típicamente 3600 segundos = 1 hora)
        const expiry = new Date();
        expiry.setSeconds(expiry.getSeconds() + (response.expires_in || 3600));
        this.tokenExpiry = expiry.toISOString();
        localStorage.setItem('cashflow_token_expiry', this.tokenExpiry);

        // Extraer email del token (si está disponible)
        try {
            const base64Url = this.accessToken.split('.')[1];
            if (base64Url) {
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const jsonPayload = decodeURIComponent(
                    atob(base64).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
                );
                const decoded = JSON.parse(jsonPayload);
                if (decoded.email) {
                    localStorage.setItem('cashflow_user_email', decoded.email);
                    console.log(`✅ Autenticado como: ${decoded.email}`);
                }
            }
        } catch (e) {
            console.warn('⚠️ No se pudo extraer email del token (es normal con access tokens)');
        }

        // showToast(`✅ Autenticado correctamente`, 'success');
        updateAuthUI();
        if (window.app) window.app._updateGreeting();
    }

    _parseHashToken() {
        const hash = window.location.hash;
        if (hash) {
            const params = new URLSearchParams(hash.substring(1));

            if (params.has('error')) {
                console.error('❌ Error de Google Auth:', params.get('error'));
                showToast(`Error: ${params.get('error')}`, 'error');
                window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
                return;
            }

            if (params.has('access_token')) {
                console.log('📝 Detectado token en URL hash (retorno de redirect)');
                const accessToken = params.get('access_token');
                const expiresIn = params.get('expires_in');

                this.accessToken = accessToken;
                localStorage.setItem('cashflow_access_token', this.accessToken);

                const expiry = new Date();
                expiry.setSeconds(expiry.getSeconds() + (parseInt(expiresIn) || 3600));
                this.tokenExpiry = expiry.toISOString();
                localStorage.setItem('cashflow_token_expiry', this.tokenExpiry);

                // Limpiar la URL para que no quede el token ahí
                window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

                // showToast(`✅ Autenticado correctamente`, 'success');

                // Intentar obtener el nombre del usuario
                this._fetchUserInfo(accessToken);

                // Actualizar UI inmediatamente
                setTimeout(() => {
                    updateAuthUI();
                    if (window.app) window.app._updateGreeting();
                }, 100);
            }
        }
    }

    async _fetchUserInfo(token) {
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.given_name || data.name) {
                const name = data.given_name || data.name.split(' ')[0];
                localStorage.setItem('cashflow_user_name', name);
                console.log(`👤 Usuario obtenido de userinfo: ${name}`);
                if (window.app) window.app._updateGreeting();
            }
        } catch (e) {
            console.warn('⚠️ No se pudo obtener info del usuario:', e);
        }
    }


    requestAccessToken() {
        console.log('🔄 Solicitando Access Token vía redirección...');
        const scopes = 'https://www.googleapis.com/auth/spreadsheets openid profile email';
        // Normalizar redirectUri para que sea el origen + /
        const redirectUri = window.location.origin;
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${this.CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(scopes)}&prompt=consent`;

        window.location.href = authUrl;
    }

    signIn() {
        // Con GIS, se usa el botón HTML directo
        // Esta función es para compatibilidad
        console.log('signIn() - Usa el botón HTML en su lugar');
    }

    async signOut() {
        try {
            if (typeof google !== 'undefined' && google.accounts) {
                google.accounts.id.disableAutoSelect();
            }

            // Revocar el access token
            if (this.accessToken) {
                fetch('https://oauth2.googleapis.com/revoke', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `token=${this.accessToken}`
                }).catch(e => console.warn('Error revocando token:', e));
            }

            localStorage.removeItem('cashflow_access_token');
            localStorage.removeItem('cashflow_token_expiry');
            localStorage.removeItem('cashflow_user_email');
            localStorage.removeItem('cashflow_user_name');

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
                localStorage.removeItem('cashflow_access_token');
                this.accessToken = null;
                return false;
            }
        }
        return true;
    }

    getAccessToken() {
        return this.accessToken;
    }

    getUserEmail() {
        return localStorage.getItem('cashflow_user_email') || 'Usuario';
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

        // Refresh icons after UI update
        if (window.lucide) lucide.createIcons();
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
