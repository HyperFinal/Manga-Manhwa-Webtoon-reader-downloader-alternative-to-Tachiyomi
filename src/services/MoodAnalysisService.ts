export type Mood = 'romance' | 'sadness' | 'tension' | 'epic' | 'action' | 'calm' | 'dark' | 'unknown';

interface ImageStats {
    brightness: number; // 0-255
    contrast: number;   // 0-255
    edgeDensity: number; // 0-1 (Percentage of edge pixels)
    warmth: number;     // 0-255 (Red/Yellow dominance)
}

export class MoodAnalysisService {

    /**
     * Analyzes an image element and returns the detected mood.
     * Uses heuristic analysis of brightness, contrast, and edge density.
     */
    static async analyzeImage(imageElement: HTMLImageElement): Promise<Mood> {
        try {
            const stats = this.getImageStats(imageElement);
            return this.determineMood(stats);
        } catch (error) {
            console.error("Mood analysis failed:", error);
            return 'unknown';
        }
    }

    private static getImageStats(img: HTMLImageElement): ImageStats {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not get canvas context");

        // Downscale for performance (e.g., 100x100 is enough for mood)
        const width = 100;
        const height = 100;
        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(img, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        let totalBrightness = 0;
        let totalRed = 0;
        let totalBlue = 0;
        let minBrightness = 255;
        let maxBrightness = 0;

        // 1. Calculate Basic Stats (Brightness, Warmth)
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Perceived brightness
            const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
            totalBrightness += brightness;

            if (brightness < minBrightness) minBrightness = brightness;
            if (brightness > maxBrightness) maxBrightness = brightness;

            totalRed += r;
            totalBlue += b;
        }

        const avgBrightness = totalBrightness / (width * height);
        const contrast = maxBrightness - minBrightness;
        const warmth = (totalRed - totalBlue) / (width * height); // Positive = Warm, Negative = Cool

        // 2. Calculate Edge Density (Simple Sobel-like check)
        // We'll do a simplified pass: check difference between adjacent pixels
        let edgePixels = 0;
        const threshold = 30; // Difference threshold to count as an edge

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width - 1; x++) {
                const i = (y * width + x) * 4;
                const nextI = (y * width + (x + 1)) * 4;

                const b1 = (data[i] + data[i + 1] + data[i + 2]) / 3;
                const b2 = (data[nextI] + data[nextI + 1] + data[nextI + 2]) / 3;

                if (Math.abs(b1 - b2) > threshold) {
                    edgePixels++;
                }
            }
        }

        const edgeDensity = edgePixels / (width * height);

        return {
            brightness: avgBrightness,
            contrast: contrast,
            edgeDensity: edgeDensity,
            warmth: warmth
        };
    }

    private static determineMood(stats: ImageStats): Mood {
        console.log("[MoodAnalysis] Stats:", stats);

        // HEURISTIC RULES

        // 0. WHITESPACE / BLANK / LOW INFO:
        // - High Brightness (White background) OR Very Low Contrast
        // - AND Low Edge Density (No content or just simple text)
        // - AND Low Warmth (Neutral color, to avoid catching bright Romance scenes)
        if ((stats.brightness > 180 || stats.contrast < 50) && stats.edgeDensity < 0.2 && Math.abs(stats.warmth) < 20) {
            console.log("[MoodAnalysis] Detected whitespace/blank page - preserving mood");
            return 'unknown';
        }

        // 1. DARK: Very low brightness (Pitch black/Night scenes)
        if (stats.brightness < 40) {
            return 'dark';
        }

        // 2. ACTION: High Edge Density (Chaos) + High Contrast
        if (stats.edgeDensity > 0.25 && stats.contrast > 150) {
            return 'action';
        }

        // 2. TENSION: Dark + High Edge Density (Scary/Chaotic but dark)
        if (stats.brightness < 60 && stats.edgeDensity > 0.15) {
            return 'tension';
        }

        // 3. SADNESS: Dark + Low Contrast + Low Edge Density (Flat, gloomy)
        if (stats.brightness < 80 && stats.contrast < 100 && stats.edgeDensity < 0.1) {
            return 'sadness';
        }

        // 4. ROMANCE: Bright + Warm + Soft Edges
        if (stats.brightness > 150 && stats.warmth > 10 && stats.edgeDensity < 0.15) {
            return 'romance';
        }

        // 5. EPIC: High Contrast + Balanced Brightness (Dramatic lighting)
        if (stats.contrast > 200 && stats.brightness > 60 && stats.brightness < 180) {
            return 'epic';
        }

        // 6. CALM: Moderate Brightness + Low Edge Density (Clean art)
        if (stats.edgeDensity < 0.1) {
            return 'calm';
        }

        // Default fallback
        return 'calm';
    }
}
