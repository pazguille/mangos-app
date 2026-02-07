/**
 * Beta Wizard Logic
 * Handles the multi-step signup form and Google Forms submission
 */

class BetaWizard {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 2;

        // Dom Elements
        this.modal = document.getElementById('betaModal');
        this.form = document.getElementById('betaForm');
        this.steps = document.querySelectorAll('.wizard-step');

        this.btnNext = document.getElementById('nextStep');
        this.btnSubmit = document.getElementById('submitBeta');
        this.btnClose = document.getElementById('closeBetaBtn');
        this.btnFinish = document.getElementById('finishBetaBtn');
        this.actionsContainer = document.querySelector('.wizard-actions');

        // Open Triggers
        this.openBtns = [
            document.getElementById('openBetaBtn'),
            document.getElementById('openBetaBtnFinal')
        ];

        this.init();
    }

    init() {
        // Event Listeners
        this.openBtns.forEach(btn => {
            if (btn) btn.addEventListener('click', () => this.open());
        });

        if (this.btnClose) this.btnClose.addEventListener('click', () => this.close());
        if (this.btnNext) this.btnNext.addEventListener('click', () => this.next());
        if (this.form) {
            this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        }
        if (this.btnFinish) this.btnFinish.addEventListener('click', () => this.close());

        // Close on click outside
        window.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });
    }

    open() {
        this.currentStep = 1;
        this.updateUI();
        this.modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent scroll
    }

    close() {
        this.modal.classList.remove('active');
        document.body.style.overflow = '';

        // Reset form after delay
        setTimeout(() => {
            this.form.reset();
            this.updateUI();
        }, 400);
    }

    next() {
        if (this.validateStep(this.currentStep)) {
            if (this.currentStep < this.totalSteps) {
                this.currentStep++;
                this.updateUI();
            }
        }
    }

    prev() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateUI();
        }
    }

    validateStep(step) {
        const currentStepEl = document.querySelector(`.wizard-step[data-step="${step}"]`);
        const inputs = currentStepEl.querySelectorAll('input[required]');

        let valid = true;
        inputs.forEach(input => {
            if (!input.value.trim() || !input.checkValidity()) {
                input.reportValidity();
                valid = false;
            }
        });

        return valid;
    }

    updateUI() {
        // Update Steps Visibility and Required attributes
        this.steps.forEach(step => {
            const stepNum = step.dataset.step;
            const isActive = stepNum == this.currentStep;
            step.classList.toggle('active', isActive);

            // Dynamically manage 'required' to prevent browser from blocking hidden fields
            const inputs = step.querySelectorAll('input');
            inputs.forEach(input => {
                if (isActive) {
                    input.setAttribute('required', '');
                } else {
                    input.removeAttribute('required');
                }
            });
        });

        // Update Buttons
        this.btnNext.classList.toggle('hidden', this.currentStep === this.totalSteps || this.currentStep === 'success');
        this.btnSubmit.classList.toggle('hidden', this.currentStep !== this.totalSteps);

        // Hide entire actions container on success
        if (this.actionsContainer) {
            this.actionsContainer.classList.toggle('hidden', this.currentStep === 'success');
        }

        // Focus first input of current step
        setTimeout(() => {
            const currentStepEl = document.querySelector(`.wizard-step[data-step="${this.currentStep}"]`);
            const firstInput = currentStepEl?.querySelector('input');
            if (firstInput) firstInput.focus();
        }, 100);
    }

    async handleSubmit(e) {
        e.preventDefault();

        // If not on the last step, hitting Enter should behave as "Next"
        if (this.currentStep !== this.totalSteps && this.currentStep !== 'success') {
            this.next();
            return;
        }

        this.btnSubmit.disabled = true;
        this.btnSubmit.innerHTML = 'Enviando...';

        try {
            const formData = new FormData(this.form);

            /**
             * IMPORTANTE/WARNING:
             * Google Forms no permite enviar datos vía AJAX (CORS) directamente.
             * Una forma común es usar un <iframe> oculto o postear a un endpoint
             * que actúe de bridge.
             *
             * Para este prototipo, simularemos el éxito o usaremos un POST ciego
             * (no-cors) que suele funcionar para registrar la entrada.
             */

            // Reemplazar con URL real del usuario
            const GOOGLE_FORM_URL = 'https://docs.google.com/forms/u/0/d/e/1FAIpQLSeW6-MUozbSgbgOfn2FGYDo9aRrlvE3_im1SSSoKbCzPJPl5A/formResponse';

            // Enviamos de forma "ciega" (no-cors)
            // Nota: Esto disparará el registro en el form pero no podemos leer la respuesta oficial.
            fetch(GOOGLE_FORM_URL, {
                method: 'POST',
                mode: 'no-cors',
                body: formData
            }).then(() => {
                console.log('✅ Datos enviados (no-cors estimate)');
            }).catch(err => console.error('Error enviando a Google Forms:', err));

            // Mostramos éxito de todas formas ya que el usuario no necesita saber
            // los detalles del bridge.
            this.currentStep = 'success';
            this.updateUI();

        } catch (error) {
            console.error('Submission error:', error);
            alert('Hubo un error al enviar. Por favor intenta de nuevo.');
            this.btnSubmit.disabled = false;
            this.btnSubmit.innerHTML = 'Finalizar';
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new BetaWizard();
});
