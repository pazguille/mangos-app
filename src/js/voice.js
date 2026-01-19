import { config } from './config.js';
import { showToast } from './utils.js';

// Web Speech API Integration
export class VoiceRecorder {
    constructor() {
        this.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!this.SpeechRecognition) {
            console.error('Web Speech API no soportada');
            this.supported = false;
            return;
        }

        this.supported = true;
        this.isRecording = false;
        this.transcript = '';
        this.recognition = null;
        this.lang = 'es-AR'; // Default to Argentine Spanish
    }

    _setupRecognition() {
        this.recognition.continuous = false; // Auto-stop cuando el usuario deja de hablar
        this.recognition.interimResults = true;
        this.recognition.lang = config.lang || 'es-AR';

        this.onComplete = null; // Callback para cuando termina

        this.recognition.onstart = () => {
            this.isRecording = true;
            this._updateUI('recording');
        };

        this.recognition.onresult = (event) => {
            let interim = '';
            let final = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    final += transcript + ' ';
                } else {
                    interim += transcript;
                }
            }
            this.transcript = final;
            this._updateTranscript(final + interim);
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            this._updateUI('error');
        };

        this.recognition.onend = () => {
            this.isRecording = false;
            this._updateUI('stopped');

            // Si hay transcript, avisar que terminó
            if (this.transcript.trim() && this.onComplete) {
                this.onComplete(this.transcript.trim());
            }
        };
    }

    start(onCompleteCallback) {
        if (!this.supported) {
            showToast('Web Speech API no está soportada en tu navegador', 'error');
            return;
        }

        // Safari fix: Re-initialize on each start to avoid state issues
        this.recognition = new this.SpeechRecognition();
        this._setupRecognition();
        this._startAnalyser(); // Iniciar analizador de audio real-time

        this.transcript = '';
        this.onComplete = onCompleteCallback;

        try {
            this.recognition.start();
        } catch (e) {
            console.error('Error starting recognition:', e);
            showToast('Error al iniciar micrófono', 'error');
            this._stopAnalyser();
        }
    }

    stop() {
        if (this.recognition) this.recognition.stop();
        this._stopAnalyser();
    }

    async _startAnalyser() {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.analyser = this.audioContext.createAnalyser();
                this.analyser.fftSize = 256;
            }

            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.source = this.audioContext.createMediaStreamSource(this.stream);
            this.source.connect(this.analyser);

            const bufferLength = this.analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const update = () => {
                if (!this.isRecording) return;

                this.analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                const average = sum / bufferLength;

                // Sensibilidad aumentada para que se note el cambio real-time
                // Multiplicamos por 3.5 para que reaccione más a voces normales
                const normalized = Math.min((average / 128) * 3.5, 1.2);

                document.documentElement.style.setProperty('--voice-amplitude', normalized.toFixed(3));

                this.analyserFrame = requestAnimationFrame(update);
            };

            update();
        } catch (e) {
            console.error('Error starting audio analyser:', e);
        }
    }

    _stopAnalyser() {
        if (this.analyserFrame) cancelAnimationFrame(this.analyserFrame);
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        document.documentElement.style.setProperty('--voice-amplitude', '0');
    }

    getTranscript() {
        return this.transcript.trim();
    }

    _updateUI(state) {
        const statusEl = document.getElementById('voiceStatus');
        const container = document.querySelector('.voice-nexus');
        const startBtn = document.getElementById('startVoiceBtn');
        const orb = document.getElementById('voiceOrb');
        const orbVideo = orb ? orb.querySelector('video') : null;

        if (state === 'recording') {
            statusEl.textContent = '';
            container.classList.add('recording');

            // Toggle visibility
            startBtn.classList.add('hidden');
            orb.classList.remove('hidden');
            if (orbVideo) orbVideo.play().catch(e => console.error("Error playing orb video:", e));

            if (window.navigator.vibrate) window.navigator.vibrate(40);
        } else if (state === 'stopped' || state === 'error') {
            statusEl.textContent = state === 'error' ? 'ERROR EN AUDIO' : '';
            container.classList.remove('recording');

            // Toggle visibility back
            startBtn.classList.remove('hidden');
            orb.classList.add('hidden');
            if (orbVideo) {
                orbVideo.pause();
                orbVideo.currentTime = 0;
            }

            if (state === 'stopped' && window.navigator.vibrate) window.navigator.vibrate([20, 20]);
        }
    }

    _updateTranscript(text) {
        const transcriptEl = document.getElementById('voiceTranscript');
        transcriptEl.textContent = text;
    }
}

export const voiceRecorder = new VoiceRecorder();

export function initVoiceRecorder() {
    if (!voiceRecorder.supported) {
        const voiceTab = document.getElementById('voice-tab');
        if (voiceTab) {
            voiceTab.innerHTML = `
                <div style="padding: 20px; text-align: center; color: var(--text-secondary);">
                    <p>⚠️ Web Speech API no está disponible en tu navegador.</p>
                    <p>Por favor usa Firefox, Chrome, Edge o Safari.</p>
                </div>
            `;
        }
    }
}
