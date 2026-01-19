// Utility Functions
export function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast-neo show ${type}`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

let lastClickedBtn = null;

// Track general button clicks to know where to show the spinner
document.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('button');
    if (btn) lastClickedBtn = btn;
}, true);

export function showSpinner(show) {
    if (show) {
        let target = null;

        // 1. Si el panel de resultados está visible, el botón relevante es "Confirmar"
        const resultsPanel = document.getElementById('resultsPanel');
        const isResultsVisible = resultsPanel && !resultsPanel.classList.contains('hidden');

        if (isResultsVisible) {
            target = document.getElementById('confirmBtn');
        }
        // 2. Si no, usamos el último botón clickeado si es válido
        else if (lastClickedBtn && lastClickedBtn.isConnected && lastClickedBtn.id !== 'settingsBtn') {
            target = lastClickedBtn;
        }
        // 3. Fallback: Botón principal de la pestaña activa (ej: disparado por voz o Ctrl+Enter)
        else {
            const activeTab = document.querySelector('.tab-content.active');
            if (activeTab) {
                target = activeTab.querySelector('button.btn-neo');
            }
        }

        if (target) target.classList.add('loading');
    } else {
        // Limpiar estado de carga de todos los botones
        document.querySelectorAll('button').forEach(btn => btn.classList.remove('loading'));
        lastClickedBtn = null;
    }
}
