import { config } from './config.js';
import { showToast } from './utils.js';

// Web Speech API Integration
export class VoiceRecorder {
    constructor() {
        this.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!this.SpeechRecognition) {
            showToast('Web Speech API no soportada', 'error');
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
        this.recognition.continuous = true;
        this.recognition.interimResults = false;
        this.recognition.lang = config.lang || 'es-AR';

        this.onComplete = null;
        this.prevText = '';

        this.recognition.onstart = async () => {
            this.isRecording = true;
            await this._startAnalyser();
        };

        this.recognition.onresult = (event) => {
            const { results, resultIndex } = event;

            // Handle edge case where results is undefined (mobile chrome sometimes)
            if (!results) return;

            let interim = '';
            let final = '';

            // Iterate ONLY from resultIndex to avoid processing old results
            for (let i = resultIndex; i < results.length; i++) {
                const result = results[i];
                const transcript = result[0].transcript;

                if (result.isFinal) {
                    // Format or clean if needed
                    final += transcript;
                } else {
                    interim += transcript;
                }
            }

            // If we have final text, append it to our full transcript or handle it
            if (final) {
                // In continuous mode with 'resultIndex', we accumulate manually if we wanted
                // but checking the reference, they assume `final` is just the current chunk.
                // However, for our textarea, we usually want the FULL text.
                // SpeechRecognition usually keeps 'results' accumulating in continuous mode
                // UNLESS we stop/start.
                // Let's stick to the current simpler logic but using resultIndex correctly.

                // CRITICAL: In continuous mode, event.results grows.
                // We need to re-construct the full text or just append new parts.
                // Simpler approach for text input: Re-construct full text from ALL results
                // to ensure we don't duplicate or lose edits if we were syncing.
                // But `resultIndex` optimization suggests we only look at new stuff.

                // Let's adopt the reference's approach of `prevText` if we were stream-processing,
                // but for filling a textarea, iterating all `results` is safer to keep sync,
                // UNLESS user edits text while speaking (which is rare here).
                // Let's stick to standard full iteration but SAFELY.

                // Actually, the reference logic:
                // [...results].slice(resultIndex).map(...)
                // and accumulation.

                // Let's revert to a robust full-scan for simplicity and data integrity
                // unless performance is an issue (it won't be for short commands).
                // But we MUST respect `resultIndex` to know what's new vs old if we did stream actions.
            }

            // Re-build full transcript from scratch to ensure consistency
            let fullTranscript = '';
            let currentInterim = '';

            for (let i = 0; i < results.length; i++) {
                if (results[i].isFinal) {
                    fullTranscript += results[i][0].transcript;
                } else {
                    currentInterim += results[i][0].transcript;
                }
            }

            // Allow external access to the "live" text (final + interim)
            this.transcript = (fullTranscript + currentInterim).trim();
            console.log(this.transcript); // Debug

            // If we had a callback for realtime updates, we'd call it here
            // The app currently polls or waits for onend.
            // We should probably update the textarea on the fly!
            // But right now app architecture reads `this.transcript` on callback?
            // Checking app.js:
            // voiceRecorder.start((transcript) => { ... }) -> this is ONEND callback usually
            // But wait, app.js logic:
            // voiceRecorder.start((transcript) => { document.getElementById('textInput').value = transcript; ... })
            // This suggests the callback is called ONCE at the end?
            // Let's check `start` implementation.
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            if (event.error === 'no-speech') {
                return; // Ignore no-speech errors, just stay listening or stop if desired
            }
            this._updateUI('error');
        };

        this.recognition.onend = () => {
            this.isRecording = false;
            this._updateUI('stopped');
            this._stopAnalyser();

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

        // Always re-create recognition instance for stability
        this.recognition = new this.SpeechRecognition();
        this._setupRecognition();

        this.transcript = '';
        this.onComplete = onCompleteCallback;

        try {
            this._updateUI('recording');
            this.recognition.start();
        } catch (e) {
            console.error(e);
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
            if (!window.AudioContext && !window.webkitAudioContext) {
                console.warn('Web Audio API not supported');
                return;
            }

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
        const container = document.querySelector('.voice-nexus');

        if (state === 'recording') {
            container.classList.add('recording');
        } else if (state === 'stopped' || state === 'error') {
            container.classList.remove('recording');
        }
    }
}

export const voiceRecorder = new VoiceRecorder();

export function initVoiceRecorder() {
    // Basic checks for support if needed in the future
}
