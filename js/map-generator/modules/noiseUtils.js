// --- START OF FILE js/map-generator/modules/noiseUtils.js ---
// --- Noise Utility Wrapper ---

// Import the COPIED Javascript file using a RELATIVE path from THIS file's location.
// This file is in 'modules/', so '../lib/' goes up one level and then into 'lib'.
import SimplexNoise from '../lib/simplex-noise.js';

let simplex;
let seed = 'default seed';

/**
 * Initializes the noise generator with a seed.
 * @param {string} initialSeed
 */
export function init(initialSeed) {
    seed = initialSeed || 'default seed';
    console.log("[noiseUtils] Attempting to initialize SimplexNoise..."); // Added log
    try {
        // Reset simplex instance in case of re-initialization
        simplex = null;

        // CommonJS Module Check (if the library uses module.exports = SimplexNoise)
        if (typeof SimplexNoise === 'function' && SimplexNoise.prototype?.constructor?.name) {
            console.log("[noiseUtils] Initializing as new SimplexNoise(seed)");
            simplex = new SimplexNoise(seed);
        }
        // ES Module Default Export Check (export default class SimplexNoise)
        else if (typeof SimplexNoise?.default === 'function' && SimplexNoise.default.prototype?.constructor?.name) {
            console.log("[noiseUtils] Initializing as new SimplexNoise.default(seed)");
            simplex = new SimplexNoise.default(seed);
        }
        // Factory Function Check (export default function(seed) { ... })
        else if (typeof SimplexNoise === 'function') {
             console.log("[noiseUtils] Initializing by calling SimplexNoise(seed)");
             simplex = SimplexNoise(seed);
             // Verify the result of the function call
             if (typeof simplex?.noise2D !== 'function') {
                 console.warn("[noiseUtils] SimplexNoise called as function, but result lacks noise2D. Trying object access.");
                 simplex = SimplexNoise; // Fallback: maybe it's just an object exported
             }
        }
        // Direct Object Export Check (export const noise2D = ...)
        else if (typeof SimplexNoise?.noise2D === 'function') {
            console.log("[noiseUtils] Using SimplexNoise directly as an object with methods");
            simplex = SimplexNoise; // Use the imported object directly
        }
        else {
            throw new Error("Could not determine how to instantiate or use the imported SimplexNoise module.");
        }

        // Final check after attempting initialization
        if (!simplex || typeof simplex.noise2D !== 'function') {
             throw new Error("Initialization succeeded but simplex.noise2D is not a function.");
        }

        console.log(`[noiseUtils] Noise generator initialized successfully with seed: "${seed}"`);

    } catch (e) {
         console.error("[noiseUtils] Failed to initialize SimplexNoise:", e);
         console.error("[noiseUtils] Ensure 'js/map-generator/lib/simplex-noise.js' exists and is valid JS.");
         simplex = null; // Ensure simplex is null if init fails
    }
}

/**
 * Gets 2D Simplex noise value for given coordinates. Output range: -1 to 1.
 * @param {number} x
 * @param {number} y
 * @returns {number} Noise value between -1 and 1.
 */
export function getNoise2D(x, y) {
    if (!simplex) {
        // console.warn("[noiseUtils] Noise generator not initialized. Returning 0."); // Less noisy log
        return 0;
    }
    try {
        return simplex.noise2D(x, y);
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