// --- Step 0: Initialization and Setup ---
import * as mapGenConfig from '../mapGenConfig.js';
import { createGrid } from '../utils/gridUtils.js';
import { init as initNoise } from './noiseUtils.js';

/**
 * Initializes the world state for map generation.
 * @param {object} config - Merged configuration overrides.
 * @returns {object} Initial WorldState object.
 */
export function initializeWorldState(config = mapGenConfig) {
    console.log("Step 0: Initializing World State...");

    // Initialize noise generator
    initNoise(config.RANDOM_SEED);

    // Create the basic WorldState object
    const worldState = {
        width: config.GRID_WIDTH,
        height: config.GRID_HEIGHT,
        config: config, // Store effective config
        grid: null,
        plateData: [], // Will be populated by tectonics worker
    };

    // Define the initial state of each grid cell
    const initialCellFactory = (x, y) => ({
        height: 0.0,        // Initial elevation
        plateId: -1,        // Which tectonic plate it belongs to (-1 = unassigned)
        crustType: null,    // 'oceanic' or 'continental'
        crustThickness: 0.0,// Relative thickness
        isWater: false,     // Determined during finalization
        // Erosion properties (initialized later if needed)
        water: 0.0,
        sediment: 0.0,
        // You might add flow vectors (flowX, flowY) later
    });

    // Create the main grid
    worldState.grid = createGrid(worldState.width, worldState.height, initialCellFactory);

    console.log(`Created grid: ${worldState.width}x${worldState.height}`);
    console.log("Step 0: Initialization Complete.");
    return worldState;
}