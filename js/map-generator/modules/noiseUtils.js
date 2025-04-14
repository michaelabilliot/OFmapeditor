// --- START OF FILE js/map-generator/modules/noiseUtils.js ---
// --- Noise Utility Wrapper ---

// Import the SPECIFIC function(s) needed, as the module uses named exports (CommonJS style)
import { createNoise2D } from '../lib/simplex-noise.js'; // <<<--- CORRECTED IMPORT SYNTAX

let noise2D; // Store the function itself
let seed = 'default seed';

/**
 * Initializes the noise generator with a seed.
 * @param {string} initialSeed
 */
export function init(initialSeed) {
    seed = initialSeed || 'default seed';
    console.log("[noiseUtils] Attempting to initialize SimplexNoise...");
    try {
        // The imported createNoise2D is a factory function that takes a random generator
        if (typeof createNoise2D !== 'function') {
             throw new Error("Imported createNoise2D is not a function.");
        }
        // Create the actual noise function using the factory
        // We can use the default Math.random or provide our own seeded random if needed
        noise2D = createNoise2D(Math.random); // Or use a seeded random function based on 'seed' if desired
        console.log(`[noiseUtils] Noise generator initialized successfully using createNoise2D factory.`);

    } catch (e) {
         console.error("[noiseUtils] Failed to initialize SimplexNoise:", e);
         console.error("[noiseUtils] Ensure 'js/map-generator/lib/simplex-noise.js' exists and is valid JS.");
         noise2D = null; // Ensure noise2D is null if init fails
    }
}

/**
 * Gets 2D Simplex noise value for given coordinates. Output range: -1 to 1.
 * @param {number} x
 * @param {number} y
 * @returns {number} Noise value between -1 and 1.
 */
export function getNoise2D(x, y) {
    if (!noise2D) {
        // console.warn("[noiseUtils] Noise function not initialized. Returning 0.");
        return 0;
    }
    try {
        // Call the noise function that was created by the factory during init()
        return noise2D(x, y);
    } catch (e) {
        console.error("[noiseUtils] Error calling noise2D function:", e);
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
        total += getNoise2D(x * frequency, y * frequency) * amplitude; // Uses the initialized noise2D function
        maxValue += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
    }

    // Normalize to be roughly between -1 and 1
    return maxValue === 0 ? 0 : total / maxValue;
}

// --- Add other noise functions if needed (e.g., 3D, ridge noise) ---
// --- END OF FILE js/map-generator/modules/noiseUtils.js ---