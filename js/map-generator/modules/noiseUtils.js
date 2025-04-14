// --- START OF FILE js/map-generator/modules/noiseUtils.js ---
// --- Noise Utility Wrapper ---

// Import the default export (which is the openSimplexNoise function)
import openSimplexNoise from '../lib/simplex-noise.js';

let noiseAPI; // Changed variable name for clarity - holds the RETURNED API object
let seed = 'default seed';

/**
 * Initializes the noise generator with a seed.
 * @param {string} initialSeed
 */
export function init(initialSeed) {
    seed = initialSeed || 'default seed';
    console.log("[noiseUtils] Attempting to initialize SimplexNoise...");
    try {
        // Call the imported factory function and store the returned API object
        noiseAPI = openSimplexNoise(seed);

        // Verify that the returned object has the necessary function
        if (!noiseAPI || typeof noiseAPI.noise2D !== 'function') {
             throw new Error("Initialization failed: openSimplexNoise did not return an object with a noise2D function.");
        }

        console.log(`[noiseUtils] Noise generator initialized successfully with seed: "${seed}"`);

    } catch (e) {
         console.error("[noiseUtils] Failed to initialize SimplexNoise:", e);
         console.error("[noiseUtils] Ensure 'js/map-generator/lib/simplex-noise.js' exists, is valid JS, and has 'export default openSimplexNoise;' at the end.");
         noiseAPI = null; // Ensure noiseAPI is null if init fails
    }
}

/**
 * Gets 2D Simplex noise value for given coordinates. Output range: -1 to 1.
 * @param {number} x
 * @param {number} y
 * @returns {number} Noise value between -1 and 1.
 */
export function getNoise2D(x, y) {
    if (!noiseAPI) {
        // console.warn("[noiseUtils] Noise generator not initialized. Returning 0.");
        return 0;
    }
    try {
        // Use the stored API object
        return noiseAPI.noise2D(x, y);
    } catch (e) {
        console.error("[noiseUtils] Error calling noise2D:", e);
        return 0;
    }
}

/**
 * Generates Fractional Brownian Motion (FBM) noise.
 * Combines multiple layers (octaves) of noise at different frequencies/amplitudes.
 * @param {number} x
 * @param {number} y
 * @param {number} octaves - Number of noise layers.
 * @param {number} persistence - How much amplitude decreases per octave (0-1).
 * @param {number} lacunarity - How much frequency increases per octave (>1).
 * @param {number} initialFrequency - Starting frequency.
 * @returns {number} FBM noise value (typically -1 to 1, but range can vary slightly).
 */
export function getFBM(x, y, octaves, persistence, lacunarity, initialFrequency) {
    let total = 0;
    let frequency = initialFrequency;
    let amplitude = 1;
    let maxValue = 0; // Used for normalization

    for (let i = 0; i < octaves; i++) {
        total += getNoise2D(x * frequency, y * frequency) * amplitude;
        maxValue += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
    }

    // Normalize to be roughly between -1 and 1
    return maxValue === 0 ? 0 : total / maxValue;
}

// --- END OF FILE js/map-generator/modules/noiseUtils.js ---