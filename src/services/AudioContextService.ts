import type { Mood } from './MoodAnalysisService';

export class AudioContextService {
    private static context: AudioContext | null = null;
    private static masterGain: GainNode | null = null;
    private static currentSource: AudioBufferSourceNode | null = null;
    private static currentGain: GainNode | null = null;
    private static currentMood: Mood | 'none' = 'none';

    private static buffers: Map<Mood, AudioBuffer> = new Map();
    private static isMuted: boolean = false;
    private static volume: number = 0.5;

    // Placeholder URLs - User will replace these with actual files later
    // For now, we can use empty strings or dummy paths.
    // The service will log errors if files are missing but won't crash.
    private static trackUrls: Record<Mood, string> = {
        'romance': '/audio/moods/romance.mp3',
        'sadness': '/audio/moods/sadness.mp3',
        'tension': '/audio/moods/tension.mp3',
        'epic': '/audio/moods/epic.mp3',
        'action': '/audio/moods/action.mp3',
        'calm': '/audio/moods/calm.mp3',
        'dark': '/audio/moods/dark.mp3',
        'unknown': '/audio/moods/calm.mp3'
    };

    static async initialize() {
        if (this.context) return;

        try {
            this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.masterGain = this.context.createGain();
            this.masterGain.connect(this.context.destination);
            this.masterGain.gain.value = this.volume;

            console.log("[AudioContextService] Initialized");

            // Unlock audio context on first user interaction (browser policy)
            const unlock = () => {
                if (this.context?.state === 'suspended') {
                    this.context.resume();
                }
                document.removeEventListener('click', unlock);
                document.removeEventListener('touchstart', unlock);
            };
            document.addEventListener('click', unlock);
            document.addEventListener('touchstart', unlock);

        } catch (e) {
            console.error("[AudioContextService] Failed to initialize", e);
        }
    }

    static setVolume(val: number) {
        this.volume = Math.max(0, Math.min(1, val));
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, this.context!.currentTime, 0.1);
        }
    }

    static toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.masterGain && this.context) {
            const target = this.isMuted ? 0 : this.volume;
            this.masterGain.gain.setTargetAtTime(target, this.context.currentTime, 0.1);
        }
        return this.isMuted;
    }

    private static async loadBuffer(mood: Mood): Promise<AudioBuffer | null> {
        if (this.buffers.has(mood)) return this.buffers.get(mood)!;

        const url = this.trackUrls[mood];
        if (!url) return null;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();
            if (!this.context) return null;
            const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
            this.buffers.set(mood, audioBuffer);
            return audioBuffer;
        } catch (error) {
            console.warn(`[AudioContextService] Failed to load track for ${mood}:`, error);
            return null;
        }
    }

    static async playMood(mood: Mood) {
        if (!this.context) await this.initialize();
        if (this.currentMood === mood) return; // Already playing

        console.log(`[AudioContextService] Transitioning to ${mood}`);
        this.currentMood = mood;

        const newBuffer = await this.loadBuffer(mood);
        if (!newBuffer) {
            console.warn(`[AudioContextService] No audio buffer for ${mood}`);
            // If we can't load the new track, fade out the current one
            this.fadeOutCurrent();
            return;
        }

        // Cross-fade
        const fadeTime = 2.0; // 2 seconds
        const now = this.context!.currentTime;

        // Fade out current
        if (this.currentSource && this.currentGain) {
            this.currentGain.gain.setValueAtTime(this.currentGain.gain.value, now);
            this.currentGain.gain.linearRampToValueAtTime(0, now + fadeTime);
            this.currentSource.stop(now + fadeTime);
        }

        // Setup new source
        const source = this.context!.createBufferSource();
        source.buffer = newBuffer;
        source.loop = true;

        const gain = this.context!.createGain();
        gain.gain.value = 0;

        source.connect(gain);
        gain.connect(this.masterGain!);

        source.start(0);
        gain.gain.linearRampToValueAtTime(1, now + fadeTime);

        this.currentSource = source;
        this.currentGain = gain;
    }

    private static fadeOutCurrent() {
        if (this.currentSource && this.currentGain && this.context) {
            const now = this.context.currentTime;
            this.currentGain.gain.setValueAtTime(this.currentGain.gain.value, now);
            this.currentGain.gain.linearRampToValueAtTime(0, now + 2);
            this.currentSource.stop(now + 2);
            this.currentSource = null;
            this.currentGain = null;
        }
    }

    static stopAll() {
        this.fadeOutCurrent();
        this.currentMood = 'none';
    }
}
