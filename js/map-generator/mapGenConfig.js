// --- Map Generator Configuration ---

// --- Grid Dimensions ---
export const GRID_WIDTH = 512; // Power of 2 often good for noise/FFT if used later
export const GRID_HEIGHT = 512;

// --- Randomness ---
export const RANDOM_SEED = 'hello world'; // Or use Date.now() or a user input

// --- Tectonics ---
export const TECTONICS_ENABLED = true;
export const NUM_PLATES = 12; // Number of tectonic plates
export const OCEAN_PLATE_CHANCE = 0.6; // % chance a plate starts as oceanic
export const TECTONIC_SIM_STEPS = 150; // How many steps to simulate plate movement
export const PLATE_BASE_SPEED = 0.01; // Base speed factor (adjust based on grid size)

// --- Detail Noise (Applied *after* Tectonics) ---
export const DETAIL_NOISE_ENABLED = true;
export const NOISE_FREQUENCY = 5.0; // How "zoomed in" the noise is
export const NOISE_OCTAVES = 4; // Number of noise layers
export const NOISE_PERSISTENCE = 0.5; // How much each octave contributes
export const NOISE_LACUNARITY = 2.0; // How much frequency increases per octave
export const NOISE_STRENGTH = 0.05; // How much noise affects final height (relative to normalized 0-1 range)

// --- Erosion ---
export const EROSION_ENABLED = true;
export const EROSION_ITERATIONS = 50; // How many cycles of erosion to run
export const RAINFALL_AMOUNT = 0.01; // Amount of water added per cell per iteration
export const EVAPORATION_RATE = 0.5; // % of water evaporating per iteration
export const EROSION_FACTOR = 0.1; // How easily soil is eroded
export const DEPOSITION_FACTOR = 0.1; // How easily sediment is deposited
export const INERTIA_FACTOR = 0.1; // How much water flow direction persists
export const MIN_SLOPE = 0.01; // Minimum slope to avoid division by zero / stagnation
export const CAPACITY_FACTOR = 4.0; // How much sediment water can carry relative to speed/volume

// --- Finalization ---
export const SEA_LEVEL_THRESHOLD = 0.35; // Normalized height (0-1) below which is water
export const NORMALIZE_ITERATIONS = 2; // How many times to normalize (sometimes helps clamp outliers)

// --- Worker Behavior ---
export const PROGRESS_UPDATE_INTERVAL = 5; // Send progress update every N simulation steps

// --- Add any other parameters needed ---