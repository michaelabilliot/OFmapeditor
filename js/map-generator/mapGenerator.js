// --- Map Generator Orchestrator (Main Thread) ---
import * as mapGenConfig from './mapGenConfig.js';
import { initializeWorldState } from './modules/step0_setup.js';
import { apply as applyDetailNoise } from './modules/step2_detailNoise.js';
import { normalizeHeights, setWaterMask, generateGrayscaleDataURL } from './modules/step3_finalize.js';
import { runWorkerTask } from './utils/workerUtils.js';

// Store worker paths relative to the main script or use absolute paths if needed
const TECTONICS_WORKER_PATH = './js/map-generator/workers/tectonics.worker.js';
const EROSION_WORKER_PATH = './js/map-generator/workers/erosion.worker.js';

/**
 * Generates a new map based on the provided configuration.
 * @param {object} [userConfig={}] - Optional user overrides for mapGenConfig.
 * @param {function} [onProgress] - Optional callback for progress updates: (progressData) => {}.
 * @returns {Promise<string>} A promise that resolves with the Data URL of the generated map image.
 */
export async function generateMap(userConfig = {}, onProgress) {
    console.log("--- Starting Map Generation ---");

    // Merge user config with defaults
    const effectiveConfig = { ...mapGenConfig, ...userConfig };

    let worldState;

    try {
        // --- Phase 0: Setup ---
        worldState = initializeWorldState(effectiveConfig);
        if (onProgress) onProgress({ phase: 'Setup', status: 'Complete' });

        // --- Phase 1: Tectonics (Worker) ---
        if (effectiveConfig.TECTONICS_ENABLED) {
            console.log("--- Phase 1: Tectonics ---");
            const tectonicsResult = await runWorkerTask(
                TECTONICS_WORKER_PATH,
                { type: 'startTectonics', worldState: worldState }, // Pass initial state
                (progressData) => {
                    if (onProgress) onProgress({ phase: 'Tectonics', ...progressData });
                }
            );
            worldState = tectonicsResult; // Update worldState with worker result
             if (onProgress) onProgress({ phase: 'Tectonics', status: 'Complete' });
        } else {
            console.log("--- Phase 1: Tectonics (Skipped) ---");
            if (onProgress) onProgress({ phase: 'Tectonics', status: 'Skipped' });
        }

        // --- Phase 2: Detail Noise (Main Thread or Worker) ---
        if (effectiveConfig.DETAIL_NOISE_ENABLED) {
             console.log("--- Phase 2: Detail Noise ---");
            // Currently running on main thread
            applyDetailNoise(worldState.grid, effectiveConfig);
             if (onProgress) onProgress({ phase: 'Detail Noise', status: 'Complete' });
            // OPTIONAL: Convert this to a worker task if it becomes slow
            // const noiseResult = await runWorkerTask(NOISE_WORKER_PATH, { type: 'applyNoise', worldState }, onProgress);
            // worldState = noiseResult;
        } else {
             console.log("--- Phase 2: Detail Noise (Skipped) ---");
              if (onProgress) onProgress({ phase: 'Detail Noise', status: 'Skipped' });
        }

        // --- Phase 3: Erosion (Worker) ---
        if (effectiveConfig.EROSION_ENABLED) {
            console.log("--- Phase 3: Erosion ---");
            const erosionResult = await runWorkerTask(
                EROSION_WORKER_PATH,
                { type: 'startErosion', worldState: worldState }, // Pass state after tectonics/noise
                 (progressData) => {
                    if (onProgress) onProgress({ phase: 'Erosion', ...progressData });
                }
            );
            worldState = erosionResult; // Update worldState with worker result
            if (onProgress) onProgress({ phase: 'Erosion', status: 'Complete' });
        } else {
            console.log("--- Phase 3: Erosion (Skipped) ---");
             if (onProgress) onProgress({ phase: 'Erosion', status: 'Skipped' });
        }

        // --- Phase 4: Finalization (Main Thread) ---
        console.log("--- Phase 4: Finalization ---");
        if (onProgress) onProgress({ phase: 'Finalization', status: 'Normalizing...' });
        normalizeHeights(worldState.grid, effectiveConfig.NORMALIZE_ITERATIONS);

        if (onProgress) onProgress({ phase: 'Finalization', status: 'Setting Water...' });
        setWaterMask(worldState.grid, effectiveConfig);

        if (onProgress) onProgress({ phase: 'Finalization', status: 'Generating Image...' });
        const dataUrl = generateGrayscaleDataURL(worldState.grid, effectiveConfig);

        console.log("--- Map Generation Complete ---");
         if (onProgress) onProgress({ phase: 'Complete', status: 'Finished' });

        return dataUrl; // Resolve the promise with the final image data

    } catch (error) {
        console.error("Map Generation Failed:", error);
        if (onProgress) onProgress({ phase: 'Error', status: `Failed: ${error.message}` });
        throw error; // Re-throw the error to be caught by the caller
    }
}