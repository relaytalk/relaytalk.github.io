// pages/chats/voice-recorder.js
// Voice message recorder + Cloudinary uploader.
// Loaded by chat-core.js on demand.

const CLOUDINARY_CLOUD_NAME = 'relaytalk_voice';   // ← replace
const CLOUDINARY_UPLOAD_PRESET = 'relaytalk_voice'; // ← from step 2

class VoiceRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.startTime = 0;
        this.recordTimer = null;
        this.analyser = null;
        this.audioContext = null;
        this.dataArray = null;
        this.rafId = null;

        // UI elements (set by attachUI)
        this.ui = null;

        // Public state
        this.isRecording = false;
        this.recordingMs = 0;
        this.recordedBlob = null;
        this.recordedUrl = null;

        // Callbacks
        this.onStateChange = null;
    }

    // --------------------------------------------------------
    // Check support
    // --------------------------------------------------------
    static isSupported() {
        return !!(
            navigator.mediaDevices &&
            typeof navigator.mediaDevices.getUserMedia === 'function' &&
            typeof window.MediaRecorder === 'function'
        );
    }

    static pickMimeType() {
        const candidates = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/ogg',
            'audio/mp4',
            'audio/aac'
        ];
        for (const c of candidates) {
            try {
                if (window.MediaRecorder.isTypeSupported(c)) return c;
            } catch (e) {}
        }
        return ''; // let the browser decide
    }

    // --------------------------------------------------------
    // Start recording
    // --------------------------------------------------------
    async start() {
        if (this.isRecording) return true;

        if (!VoiceRecorder.isSupported()) {
            if (window.showToast) window.showToast('Voice messages not supported here', '⚠️', 2500);
            return false;
        }

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
        } catch (e) {
            const name = e?.name || '';
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
                if (window.showToast) window.showToast('Microphone permission denied', '🎙️', 2500);
            } else if (name === 'NotFoundError') {
                if (window.showToast) window.showToast('No microphone found', '🎙️', 2500);
            } else {
                if (window.showToast) window.showToast('Could not start recording', '❌', 2500);
            }
            return false;
        }

        try {
            const mimeType = VoiceRecorder.pickMimeType();
            const opts = mimeType ? { mimeType } : undefined;
            this.mediaRecorder = new MediaRecorder(this.stream, opts);
            this.audioChunks = [];

            this.mediaRecorder.addEventListener('dataavailable', (e) => {
                if (e.data && e.data.size > 0) this.audioChunks.push(e.data);
            });

            this.mediaRecorder.addEventListener('error', (e) => {
                console.warn('[voice] recorder error', e);
            });

            this.mediaRecorder.start(100); // chunk every 100ms

            this.isRecording = true;
            this.recordingMs = 0;
            this.startTime = Date.now();

            // Live timer
            this.recordTimer = setInterval(() => {
                this.recordingMs = Date.now() - this.startTime;
                if (this.ui && this.ui.onTimer) this.ui.onTimer(this.recordingMs);
                if (this.recordingMs >= 60_000 * 5) {
                    // Hard cap: 5 minutes
                    this.stop();
                }
            }, 100);

            // Analyser for waveform
            this.setupAnalyser();

            if (this.onStateChange) this.onStateChange('recording');
            return true;
        } catch (e) {
            console.warn('[voice] MediaRecorder failed', e);
            this.cleanupStream();
            if (window.showToast) window.showToast('Recording failed', '❌', 2500);
            return false;
        }
    }

    // --------------------------------------------------------
    // Stop recording → returns a Blob
    // --------------------------------------------------------
    async stop() {
        if (!this.isRecording || !this.mediaRecorder) return null;

        return new Promise((resolve) => {
            const mr = this.mediaRecorder;

            const finalize = () => {
                try { mr.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
                this.cleanupStream();

                if (this.audioChunks.length === 0) {
                    this.isRecording = false;
                    this.recordingMs = 0;
                    if (this.onStateChange) this.onStateChange('idle');
                    resolve(null);
                    return;
                }

                const type = this.audioChunks[0].type || 'audio/webm';
                const blob = new Blob(this.audioChunks, { type });

                this.recordedBlob = blob;
                if (this.recordedUrl) {
                    try { URL.revokeObjectURL(this.recordedUrl); } catch (e) {}
                }
                this.recordedUrl = URL.createObjectURL(blob);

                this.isRecording = false;
                if (this.recordTimer) { clearInterval(this.recordTimer); this.recordTimer = null; }
                this.stopAnalyser();
                if (this.onStateChange) this.onStateChange('recorded');

                resolve(blob);
            };

            mr.addEventListener('stop', finalize, { once: true });

            try {
                mr.stop();
            } catch (e) {
                finalize();
            }
        });
    }

    // --------------------------------------------------------
    // Cancel recording (discard)
    // --------------------------------------------------------
    async cancel() {
        if (this.mediaRecorder && this.isRecording) {
            try { this.mediaRecorder.stop(); } catch (e) {}
        }
        this.cleanupStream();
        this.audioChunks = [];
        this.isRecording = false;
        this.recordingMs = 0;

        if (this.recordTimer) { clearInterval(this.recordTimer); this.recordTimer = null; }
        this.stopAnalyser();

        if (this.recordedUrl) {
            try { URL.revokeObjectURL(this.recordedUrl); } catch (e) {}
            this.recordedUrl = null;
        }
        this.recordedBlob = null;

        if (this.onStateChange) this.onStateChange('idle');
    }

    // --------------------------------------------------------
    // Discard the recorded blob (preview cancel)
    // --------------------------------------------------------
    discard() {
        this.audioChunks = [];
        if (this.recordedUrl) {
            try { URL.revokeObjectURL(this.recordedUrl); } catch (e) {}
            this.recordedUrl = null;
        }
        this.recordedBlob = null;
        this.recordingMs = 0;
        if (this.onStateChange) this.onStateChange('idle');
    }

    // --------------------------------------------------------
    // Cleanup stream
    // --------------------------------------------------------
    cleanupStream() {
        try {
            if (this.stream) this.stream.getTracks().forEach(t => t.stop());
        } catch (e) {}
        this.stream = null;
        this.mediaRecorder = null;
    }

    // --------------------------------------------------------
    // Waveform analyser
    // --------------------------------------------------------
    setupAnalyser() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            this.audioContext = new AudioContext();
            if (this.audioContext.state === 'suspended') this.audioContext.resume();
            const source = this.audioContext.createMediaStreamSource(this.stream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 64;
            source.connect(this.analyser);
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

            const tick = () => {
                if (!this.analyser) return;
                this.analyser.getByteFrequencyData(this.dataArray);
                if (this.ui && this.ui.onLevel) this.ui.onLevel(this.dataArray);
                this.rafId = requestAnimationFrame(tick);
            };
            tick();
        } catch (e) {}
    }

    stopAnalyser() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        try {
            if (this.audioContext && this.audioContext.state !== 'closed') {
                this.audioContext.close();
            }
        } catch (e) {}
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
    }

    // --------------------------------------------------------
    // Upload the recorded blob to Cloudinary
    // --------------------------------------------------------
    async upload() {
        if (!this.recordedBlob) throw new Error('No recording to upload');

        if (CLOUDINARY_CLOUD_NAME === 'YOUR_CLOUD_NAME') {
            throw new Error('Cloudinary not configured');
        }

        // Convert blob to a File so Cloudinary sees a filename
        const ext = this.recordedBlob.type.includes('ogg') ? 'ogg'
                  : this.recordedBlob.type.includes('mp4') ? 'm4a'
                  : this.recordedBlob.type.includes('aac') ? 'aac'
                  : 'webm';
        const filename = `relaytalk_voice_${Date.now()}.${ext}`;
        const file = new File([this.recordedBlob], filename, { type: this.recordedBlob.type });

        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        // Cloudinary treats audio as "video" resource type
        const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45000);

        let res;
        try {
            res = await fetch(url, {
                method: 'POST',
                body: formData,
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeout);
        }

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error('Upload failed: ' + res.status + ' ' + text.slice(0, 120));
        }

        const json = await res.json();
        if (!json.secure_url) throw new Error('No URL returned from Cloudinary');

        return {
            url: json.secure_url,
            publicId: json.public_id,
            durationMs: this.recordingMs,
            bytes: json.bytes
        };
    }
}

// Expose globally for chat-core.js
window.VoiceRecorder = VoiceRecorder;
