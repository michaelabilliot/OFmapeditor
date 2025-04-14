// --- Tectonics Worker ---
import * as mapGenConfig from '../mapGenConfig.js'; // Default config
import { getCell, distanceSq, createGrid } from '../utils/gridUtils.js';
// NOTE: Noise utils usually NOT needed directly for basic tectonics, maybe for plate shape variation?

self.onmessage = (event) => {
    const { type, worldState: initialWorldState } = event.data;

    if (type === 'startTectonics') {
        console.log("[Worker Tectonics] Received start command.");
        try {
            const config = initialWorldState.config || mapGenConfig; // Use passed config

            // 1. Initialize Plates
            const plates = initializePlates(initialWorldState, config);
            initialWorldState.plateData = plates; // Store plate data back

            // 2. Apply initial plate properties (height, thickness) to grid
            applyInitialPlateProperties(initialWorldState);

            // 3. Run Simulation Loop
            const finalWorldState = runTectonicSimulation(initialWorldState, config);

            // 4. Send final result back
            console.log("[Worker Tectonics] Simulation complete. Sending result.");
            self.postMessage({ type: 'result', result: finalWorldState });

        } catch (error) {
            console.error("[Worker Tectonics] Error:", error);
            self.postMessage({ type: 'error', message: error.message || 'Unknown tectonics worker error' });
        }
    } else {
        console.warn(`[Worker Tectonics] Unknown message type: ${type}`);
    }
};

// --- Helper Functions within Worker ---

/**
 * Creates initial plate data and assigns cells to plates via Voronoi.
 * @param {object} worldState
 * @param {object} config
 * @returns {Array<object>} Array of plate data objects.
 */
function initializePlates(worldState, config) {
    console.log("[Worker Tectonics] Initializing plates...");
    const plates = [];
    const { width, height } = worldState;
    const grid = worldState.grid;

    // 1. Place Plate Seeds randomly
    for (let i = 0; i < config.NUM_PLATES; i++) {
        plates.push({
            id: i,
            seedX: Math.random() * width,
            seedY: Math.random() * height,
            velocityX: (Math.random() - 0.5) * 2 * config.PLATE_BASE_SPEED, // Random direction
            velocityY: (Math.random() - 0.5) * 2 * config.PLATE_BASE_SPEED,
            crustType: Math.random() < config.OCEAN_PLATE_CHANCE ? 'oceanic' : 'continental',
            // Base height/thickness will be set based on type later
            baseHeight: 0,
            baseThickness: 0,
            // Store color for debugging maybe: `color: getRandomColor()`
        });
    }

    // 2. Assign each grid cell to the nearest plate seed (Voronoi)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let minDistSq = Infinity;
            let closestPlateId = -1;
            for (const plate of plates) {
                // Account for grid wrapping when calculating distance!
                let dx = Math.abs(x - plate.seedX);
                let dy = Math.abs(y - plate.seedY);
                // Choose the shorter distance considering wrap-around
                if (dx > width / 2) dx = width - dx;
                if (dy > height / 2) dy = height - dy;

                const distSq = dx * dx + dy * dy; // Use wrapped distance
                // const distSq = distanceSq(x, y, plate.seedX, plate.seedY); // Non-wrapping version

                if (distSq < minDistSq) {
                    minDistSq = distSq;
                    closestPlateId = plate.id;
                }
            }
            if(grid[y][x]) { // Check if cell exists (it should)
               grid[y][x].plateId = closestPlateId;
            }
        }
    }

    // 3. Set plate base properties based on type
    plates.forEach(plate => {
        if (plate.crustType === 'oceanic') {
            plate.baseHeight = -0.5; // Below sea level start (adjust as needed)
            plate.baseThickness = 0.3; // Thinner
        } else { // Continental
            plate.baseHeight = 0.2; // Above sea level start
            plate.baseThickness = 0.7; // Thicker
        }
        // Assign the properties to the plate object itself
        const owningPlate = plates.find(p => p.id === plate.id);
        if(owningPlate) {
             owningPlate.baseHeight = plate.baseHeight;
             owningPlate.baseThickness = plate.baseThickness;
        }
    });


    console.log(`[Worker Tectonics] ${plates.length} plates initialized.`);
    return plates;
}

/**
 * Applies the base height and thickness from each plate to its owned cells.
 * @param {object} worldState
 */
function applyInitialPlateProperties(worldState) {
     console.log("[Worker Tectonics] Applying initial plate properties to grid...");
    const { grid, plateData, width, height } = worldState;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = grid[y][x];
            const plate = plateData.find(p => p.id === cell.plateId);
            if (plate && cell) {
                cell.height = plate.baseHeight;
                cell.crustThickness = plate.baseThickness;
                cell.crustType = plate.crustType;
            } else if(cell) {
                 console.warn(`Cell (${x}, ${y}) has invalid plateId ${cell.plateId}`);
            }
        }
    }
     console.log("[Worker Tectonics] Initial properties applied.");
}


/**
 * Runs the main tectonic simulation loop.
 * @param {object} worldState
 * @param {object} config
 * @returns {object} The modified worldState.
 */
function runTectonicSimulation(worldState, config) {
    console.log(`[Worker Tectonics] Starting simulation (${config.TECTONIC_SIM_STEPS} steps)...`);
    for (let step = 0; step < config.TECTONIC_SIM_STEPS; step++) {
        // --- Core Tectonic Logic ---
        // This is the most complex part and requires significant geological rules.
        // Simplified conceptual steps:

        // 1. Calculate New Theoretical Plate Positions
        const theoreticalPositions = worldState.plateData.map(plate => ({
            id: plate.id,
            nextX: (plate.seedX + plate.velocityX * width + width) % width, // Wrap position
            nextY: (plate.seedY + plate.velocityY * height + height) % height,
            originalPlate: plate, // Keep reference to original data
        }));

        // 2. Reassign Cell Ownership (Simplified Voronoi Update)
        // For each cell, find the closest *new* theoretical plate center.
        // This determines which plate influences the cell *in this step*.
        // (More advanced: Calculate boundary zones instead of hard reassignment)
        const { grid, width, height } = worldState;
        const stepAssignments = createGrid(width, height, () => ({ influencingPlateId: -1, distanceSq: Infinity }));

         for (let y = 0; y < height; y++) {
             for (let x = 0; x < width; x++) {
                 let minDistSq = Infinity;
                 let closestPlateId = -1;
                  for (const theoPlate of theoreticalPositions) {
                        let dx = Math.abs(x - theoPlate.nextX);
                        let dy = Math.abs(y - theoPlate.nextY);
                        if (dx > width / 2) dx = width - dx;
                        if (dy > height / 2) dy = height - dy;
                        const distSq = dx * dx + dy * dy;

                        if (distSq < minDistSq) {
                            minDistSq = distSq;
                            closestPlateId = theoPlate.id;
                        }
                  }
                 stepAssignments[y][x].influencingPlateId = closestPlateId;
                 stepAssignments[y][x].distanceSq = minDistSq; // Store distance if needed for boundary checks
             }
         }


        // 3. Calculate Boundary Interactions & Apply Uplift/Subsidence
        // Iterate through the grid. If a cell's *current* owner (grid[y][x].plateId)
        // is different from its *influencing* plate (stepAssignments[y][x].influencingPlateId)
        // or if it's near a boundary (check neighbors), calculate interaction.
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const cell = grid[y][x];
                const currentOwnerId = cell.plateId;
                const influencingPlateId = stepAssignments[y][x].influencingPlateId;
                const currentPlate = worldState.plateData.find(p => p.id === currentOwnerId);
                const influencingPlate = worldState.plateData.find(p => p.id === influencingPlateId);

                if (!currentPlate || !influencingPlate) continue; // Skip if plate data is missing

                // --- Boundary Detection Logic ---
                // Simple check: is owner different from influencer?
                let onBoundary = currentOwnerId !== influencingPlateId;

                // More robust: check neighbors
                if (!onBoundary) {
                     const neighbors = getNeighbors(grid, x, y);
                     for(const neighborData of neighbors) {
                          if (neighborData.cell.plateId !== currentOwnerId) {
                              onBoundary = true;
                              break;
                          }
                     }
                }


                if (onBoundary) {
                    // *** CORE GEOLOGICAL INTERACTION LOGIC GOES HERE ***
                    // This is highly complex. Determine:
                    // - Convergence/Divergence/Transform based on relative velocity vectors of involved plates.
                    // - Interaction type based on crust types (Ocean-Ocean, Ocean-Cont, Cont-Cont).
                    // - Calculate uplift/subsidence/rifting/subduction effects.
                    // - Modify cell.height and cell.crustThickness accordingly.
                    // Example (VERY simplified convergence):
                    // if (isConvergent(currentPlate, influencingPlate)) {
                    //    if (currentPlate.crustType === 'continental' && influencingPlate.crustType === 'continental') {
                    //        cell.height += 0.05; // Mountain building
                    //        cell.crustThickness += 0.02;
                    //    } else if (currentPlate.crustType === 'oceanic' && influencingPlate.crustType === 'continental') {
                    //        cell.height -= 0.03; // Subduction trench (oceanic plate subducts)
                    //        cell.crustThickness -= 0.01; // Oceanic plate thins/melts
                    //        // Find the continental cell and uplift it maybe?
                    //    } // ... other cases ...
                    // } else if (isDivergent(...)) { ... }

                    // Placeholder: Simple "collision" uplift
                     cell.height += 0.01; // Tiny uplift at all boundaries for now
                }

                 // Assign the cell to the influencing plate for the *next* step's calculation
                 cell.plateId = influencingPlateId;
                 cell.crustType = influencingPlate.crustType; // Update crust type too
            }
        }


        // 4. Update Actual Plate Seed Positions
        worldState.plateData.forEach((plate, index) => {
            plate.seedX = theoreticalPositions[index].nextX;
            plate.seedY = theoreticalPositions[index].nextY;
        });

        // 5. Post Progress Update periodically
        if (step % config.PROGRESS_UPDATE_INTERVAL === 0 || step === config.TECTONIC_SIM_STEPS - 1) {
            self.postMessage({
                type: 'progress',
                currentStep: step + 1,
                totalSteps: config.TECTONIC_SIM_STEPS,
                phase: 'Tectonics'
            });
        }
    } // End simulation loop

    console.log("[Worker Tectonics] Simulation loop finished.");
    return worldState;
}