// --- START OF FILE js/map-generator/modules/noiseUtils.js ---
// --- Noise Utility Wrapper ---

// Import the COPIED Javascript file using a RELATIVE path
import SimplexNoise from '../lib/simplex-noise.js'; // <<<--- CORRECTED PATH

let simplex;
let seed = 'default seed';

/**
 * Initializes the noise generator with a seed.
 * @param {string} initialSeed
 */
export function init(initialSeed) {
    seed = initialSeed || 'default seed';
    // SimplexNoise might be a class or a function depending on the export
    try {
        // Check if it's a class constructor (common pattern)
        if (typeof SimplexNoise === 'function' && SimplexNoise.prototype?.constructor?.name) {
            simplex = new SimplexNoise(seed);
        // Check if it's a default export that *is* the class (less common but possible with some build outputs)
        } else if (typeof SimplexNoise?.default === 'function' && SimplexNoise.default.prototype?.constructor?.name) {
             simplex = new SimplexNoise.default(seed);
        // Check if it's a factory function
        } else if (typeof SimplexNoise === 'function') {
             simplex = SimplexNoise(seed); // Call it directly
             if (typeof simplex?.noise2D !== 'function') {
                 console.warn("SimplexNoise was called as a function, but the result doesn't have noise2D. Trying object access.");
                 // Fallback: Maybe it's an object with methods directly
                 simplex = SimplexNoise;
                 if (typeof simplex?.noise2D !== 'function') {
                     throw new Error("SimplexNoise import is not a callable function/class or expected object with noise2D.");
                 }
             }
        // Check if it's an object with the method directly (e.g., module.exports = { noise2D: ... })
        } else if (typeof SimplexNoise?.noise2D === 'function') {
            simplex = SimplexNoise;
        }
        else {
            throw new Error("Could not determine how to instantiate or use the imported SimplexNoise module.");
        }
        console.log(`Noise generator initialized with seed: "${seed}"`);
    } catch (e) {
         console.error("Failed to initialize SimplexNoise:", e);
         console.error("Ensure the correct JS file was copied to 'js/map-generator/lib/' and the import path is correct.");
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
        console.warn("Noise generator not initialized or failed to initialize. Returning 0.");
        return 0;
    }
    try {
        // Access the noise2D method based on how simplex was potentially initialized
         if (typeof simplex.noise2D === 'function') {
             return simplex.noise2D(x, y);
         } else {
             console.error("simplex.noise2D is not available or not a function");
             return 0;
         }
    } catch (e) {
        console.error("Error calling noise2D:", e);
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
    // Avoid division by zero if maxValue is 0 (e.g., octaves = 0 or persistence = 0)
    return maxValue === 0 ? 0 : total / maxValue;
}

// --- Add other noise functions if needed (e.g., 3D, ridge noise) ---
// --- END OF FILE js/map-generator/modules/noiseUtils.js ---