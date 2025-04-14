// --- START OF FILE js/map-generator/modules/noiseUtils.js ---
// --- Noise Utility Wrapper ---

// Import using the specific path provided.
// IMPORTANT: Ensure your environment can handle importing .ts files directly,
// or compile this file to .js first and import the .js version.
import SimplexNoise from '/Users/emirhankurtalanli/Documents/OFmapeditor/node_modules/simplex-noise/simplex-noise.ts'; // <<<--- UPDATED PATH

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
        if (typeof SimplexNoise === 'function' && SimplexNoise.prototype && SimplexNoise.prototype.constructor.name === 'SimplexNoise') {
            // Looks like a class constructor
            simplex = new SimplexNoise(seed);
        } else if (typeof SimplexNoise === 'function') {
             // Might be a factory function
             simplex = SimplexNoise(seed);
             // Check if the returned object has the expected method
             if (typeof simplex?.noise2D !== 'function') {
                  throw new Error("SimplexNoise function did not return expected object.");
             }
        } else {
            // Could be an object with methods directly (less common for simplex libraries)
            simplex = SimplexNoise;
             if (typeof simplex?.noise2D !== 'function') {
                  throw new Error("SimplexNoise import is not a class, function, or expected object.");
             }
        }
        console.log(`Noise generator initialized with seed: "${seed}"`);
    } catch (e) {
         console.error("Failed to initialize SimplexNoise:", e);
         console.error("Ensure the imported module is compatible and the path is correct.");
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
        // Attempt recovery? Or just return 0/random? Let's return 0 for now.
        // init(Date.now().toString()); // Avoid re-init on every call if it failed once
        return 0;
    }
    try {
        // Check if the library uses a method directly or needs instantiation
         if (typeof simplex.noise2D === 'function') {
             return simplex.noise2D(x, y);
         } else {
             console.error("simplex.noise2D is not a function");
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