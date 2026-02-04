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

        if (target) target.classList.add('loading');
    } else {
        // Limpiar estado de carga de todos los botones
        document.querySelectorAll('button').forEach(btn => btn.classList.remove('loading'));
        lastClickedBtn = null;
    }
}



export function pick(arr, options) {

  if (!Array.isArray(arr)) {
    throw new Error('shuffle.pick() expect an array as parameter.');
  }

  options = options || {};

  var rng = options.rng || Math.random,
      picks = options.picks || 1;

  if (typeof picks === 'number' && picks !== 1) {
    var len = arr.length,
        collection = arr.slice(),
        random = [],
        index;

    while (picks && len) {
      index = Math.floor(rng() * len);
      random.push(collection[index]);
      collection.splice(index, 1);
      len -= 1;
      picks -= 1;
    }

    return random;
  }

  return arr[Math.floor(rng() * arr.length)];
};

export function typeText(id, text, speed) {
  let i = 0;
  const el = document.getElementById(id);
  el.textContent = '';
  function loop() {
    if (i < text.length) {
      el.textContent += text.charAt(i);
      i++;
      setTimeout(loop, speed);
    }
  }
  loop();
}

export function getCurrentMonthName() {
    const formatter = new Intl.DateTimeFormat('es-ES', { month: 'long' });
    const month = formatter.format(new Date());
    return month.charAt(0).toUpperCase() + month.slice(1);
}
