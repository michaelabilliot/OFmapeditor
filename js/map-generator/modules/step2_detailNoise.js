// --- Step 2: Apply Detail Noise ---
import { getFBM } from './noiseUtils.js';

/**
 * Applies detail noise (FBM) to the heightmap.
 * Modifies the grid heights in place.
 * @param {Array<Array<object>>} grid - The world grid.
 * @param {object} config - Generator configuration.
 */
export function apply(grid, config) {
    if (!grid || !grid.length || !grid[0]) return;
    console.log("Step 2: Applying Detail Noise...");

    const width = grid[0].length;
    const height = grid.length;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // Get noise value (-1 to 1 range usually)
            const noiseVal = getFBM(
                x / width, // Normalize coords for frequency
                y / height,
                config.NOISE_OCTAVES,
                config.NOISE_PERSISTENCE,
                config.NOISE_LACUNARITY,
                config.NOISE_FREQUENCY
            );

            // Apply noise, scaled by strength
            // Assumes grid height is somewhat normalized (e.g., post-tectonics)
            // Adjust strength application as needed based on tectonic height range
            grid[y][x].height += noiseVal * config.NOISE_STRENGTH;
        }
    }
    console.log("Step 2: Detail Noise Applied.");
    // Note: Height might now be outside 0-1, normalization happens in finalize step
}