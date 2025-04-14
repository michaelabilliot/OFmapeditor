// --- Step 3: Finalization (Normalization, Sea Level, Image Generation) ---
import { findMinMaxHeight } from '../utils/gridUtils.js';

/**
 * Normalizes grid height values to the range [0, 1].
 * Modifies the grid heights in place.
 * @param {Array<Array<object>>} grid - The world grid.
 * @param {number} iterations - How many times to run normalization (often 1 is enough).
 */
export function normalizeHeights(grid, iterations = 1) {
    if (!grid || !grid.length || !grid[0]) return;
    console.log(`Step 3a: Normalizing Heights (${iterations} iterations)...`);

    for (let i = 0; i < iterations; i++) {
        const { min, max } = findMinMaxHeight(grid);
        const range = max - min;

        if (range <= 0) {
             console.warn("Normalization skipped: Height range is zero or negative.");
             // Optionally set all heights to 0 or 0.5
             const height = grid.length;
             const width = grid[0].length;
             for (let y = 0; y < height; y++) {
                 for (let x = 0; x < width; x++) {
                     grid[y][x].height = 0.5; // Or 0
                 }
             }
            return; // Exit if range is invalid
        }

        const height = grid.length;
        const width = grid[0].length;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                grid[y][x].height = (grid[y][x].height - min) / range;
            }
        }
         console.log(`Iteration ${i+1}: Normalized range [${min.toFixed(4)}, ${max.toFixed(4)}] to [0, 1]`);
    }
     console.log("Step 3a: Normalization Complete.");
}

/**
 * Sets the isWater flag based on normalized height and sea level threshold.
 * Modifies the grid cells in place.
 * @param {Array<Array<object>>} grid - The world grid (heights assumed normalized 0-1).
 * @param {object} config - Generator configuration.
 */
export function setWaterMask(grid, config) {
    if (!grid || !grid.length || !grid[0]) return;
    console.log(`Step 3b: Setting Water Mask (Sea Level: ${config.SEA_LEVEL_THRESHOLD})...`);

    const height = grid.length;
    const width = grid[0].length;
    let waterCells = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (grid[y][x].height < config.SEA_LEVEL_THRESHOLD) {
                grid[y][x].isWater = true;
                waterCells++;
            } else {
                grid[y][x].isWater = false;
            }
        }
    }
     console.log(`Step 3b: Water Mask Set. Found ${waterCells} water cells.`);
}

/**
 * Generates a black and white map image Data URL from the grid.
 * Water is black, land is grayscale based on height.
 * @param {Array<Array<object>>} grid - The world grid (heights normalized 0-1, isWater set).
 * @param {object} config - Generator configuration (uses SEA_LEVEL_THRESHOLD for mapping).
 * @returns {string} Data URL (e.g., "data:image/png;base64,...").
 */
export function generateGrayscaleDataURL(grid, config) {
    if (!grid || !grid.length || !grid[0]) return null;
    console.log("Step 3c: Generating Grayscale Image Data URL...");

    const width = grid[0].length;
    const height = grid.length;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); // Use willReadFrequently maybe? No, only writing.
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data; // Uint8ClampedArray [R, G, B, A, ...]

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = grid[y][x];
            const index = (y * width + x) * 4;
            let grayscaleValue;

            if (cell.isWater) {
                grayscaleValue = 0; // Black for water
            } else {
                // Map land height (from sea level up to 1.0) to grayscale (e.g., 50 to 255)
                const landHeightRatio = (cell.height - config.SEA_LEVEL_THRESHOLD) / (1.0 - config.SEA_LEVEL_THRESHOLD);
                // Ensure ratio is clamped [0, 1] in case of float inaccuracies
                const clampedRatio = Math.max(0, Math.min(1, landHeightRatio));
                // Map to 50-255 range (adjust 50 if you want darker low land)
                grayscaleValue = Math.round(50 + clampedRatio * (255 - 50));
            }

            data[index] = grayscaleValue;     // R
            data[index + 1] = grayscaleValue; // G
            data[index + 2] = grayscaleValue; // B
            data[index + 3] = 255;           // A (fully opaque)
        }
    }

    ctx.putImageData(imageData, 0, 0);
    console.log("Step 3c: Image Data URL Generated.");
    return canvas.toDataURL('image/png'); // Or 'image/jpeg'
}