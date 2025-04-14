// --- Grid Utility Functions ---

/**
 * Creates a 2D grid initialized with a default cell factory function.
 * @param {number} width
 * @param {number} height
 * @param {function} cellFactory - Function returning the initial state for a cell (e.g., () => ({ height: 0 }))
 * @returns {Array<Array<object>>} The initialized grid.
 */
export function createGrid(width, height, cellFactory = () => ({ height: 0 })) {
    const grid = new Array(height);
    for (let y = 0; y < height; y++) {
        grid[y] = new Array(width);
        for (let x = 0; x < width; x++) {
            grid[y][x] = cellFactory(x, y);
        }
    }
    return grid;
}

/**
 * Gets the value of a cell, handling boundary conditions (wrapping).
 * @param {Array<Array<object>>} grid
 * @param {number} x
 * @param {number} y
 * @returns {object | null} The cell object or null if grid is invalid.
 */
export function getCell(grid, x, y) {
    if (!grid || !grid.length || !grid[0]) return null;
    const height = grid.length;
    const width = grid[0].length;
    // Wrap coordinates
    const wrappedX = (x % width + width) % width;
    const wrappedY = (y % height + height) % height;
    return grid[wrappedY][wrappedX];
}

/**
 * Finds the neighbors of a cell (e.g., Moore neighborhood - 8 neighbors).
 * Handles wrapping boundary conditions.
 * @param {Array<Array<object>>} grid
 * @param {number} x
 * @param {number} y
 * @returns {Array<object>} An array of neighbor cell objects.
 */
export function getNeighbors(grid, x, y) {
    const neighbors = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue; // Skip self
            const cell = getCell(grid, x + dx, y + dy);
            if (cell) { // Should always be true with wrapping getCell
                neighbors.push({ cell, dx, dy }); // Include relative offset if needed
            }
        }
    }
    return neighbors;
}

/**
 * Calculates Euclidean distance squared between two points (faster than sqrt).
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {number}
 */
export function distanceSq(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return dx * dx + dy * dy;
}

/**
 * Simple linear interpolation.
 * @param {number} a Start value
 * @param {number} b End value
 * @param {number} t Interpolation factor (0-1)
 * @returns {number}
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

// --- Add other grid utilities as needed (e.g., findMinMaxHeight) ---

/**
 * Finds the minimum and maximum height values in the grid.
 * @param {Array<Array<object>>} grid
 * @returns {{min: number, max: number}}
 */
export function findMinMaxHeight(grid) {
    let min = Infinity;
    let max = -Infinity;
    if (!grid || !grid.length || !grid[0]) return { min: 0, max: 0 };
    const height = grid.length;
    const width = grid[0].length;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cellHeight = grid[y][x].height;
            if (cellHeight < min) min = cellHeight;
            if (cellHeight > max) max = cellHeight;
        }
    }
    return { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
}