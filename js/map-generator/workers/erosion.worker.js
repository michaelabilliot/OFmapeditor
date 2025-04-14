// --- Erosion Worker ---
import * as mapGenConfig from '../mapGenConfig.js'; // Default config
import { getCell, getNeighbors } from '../utils/gridUtils.js';

self.onmessage = (event) => {
    const { type, worldState: initialWorldState } = event.data;

    if (type === 'startErosion') {
        console.log("[Worker Erosion] Received start command.");
        try {
            const config = initialWorldState.config || mapGenConfig; // Use passed config

            // 1. Initialize Erosion Properties on Grid
            initializeErosionGrid(initialWorldState);

            // 2. Run Simulation Loop
            const finalWorldState = runErosionSimulation(initialWorldState, config);

            // 3. Send final result back
            console.log("[Worker Erosion] Simulation complete. Sending result.");
            self.postMessage({ type: 'result', result: finalWorldState });

        } catch (error) {
            console.error("[Worker Erosion] Error:", error);
            self.postMessage({ type: 'error', message: error.message || 'Unknown erosion worker error' });
        }
    } else {
         console.warn(`[Worker Erosion] Unknown message type: ${type}`);
    }
};

// --- Helper Functions within Worker ---

/**
 * Initializes water, sediment, etc., on the grid.
 * @param {object} worldState
 */
function initializeErosionGrid(worldState) {
    console.log("[Worker Erosion] Initializing grid properties...");
    const { grid, width, height } = worldState;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = grid[y][x];
            if(cell) {
                cell.water = 0.0;
                cell.sediment = 0.0;
                cell.outflow = [0, 0, 0, 0]; // N, E, S, W outflow proportions (or use neighbor array)
                cell.flowVelocity = { x: 0, y: 0 }; // Optional: Track water velocity
            }
        }
    }
    console.log("[Worker Erosion] Grid initialized.");
}

/**
 * Runs the main erosion simulation loop.
 * @param {object} worldState
 * @param {object} config
 * @returns {object} The modified worldState.
 */
function runErosionSimulation(worldState, config) {
    console.log(`[Worker Erosion] Starting simulation (${config.EROSION_ITERATIONS} iterations)...`);
    const { grid, width, height } = worldState;

    for (let iter = 0; iter < config.EROSION_ITERATIONS; iter++) {
        // --- Core Erosion Logic (Conceptual Steps) ---
        // Based on common hydraulic erosion models (e.g., https://www.firespark.de/resources/downloads/implementation%20of%20a%20methode%20for%20hydraulic%20erosion.pdf)

        // 1. Add Water (Rainfall)
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (grid[y][x]) {
                    grid[y][x].water += config.RAINFALL_AMOUNT;
                }
            }
        }

        // 2. Calculate Water Flow (Outflow determination)
        // For each cell, determine how much water flows to lower neighbors.
        // Create a temporary grid or update outflows directly
        const waterDeltaGrid = createGrid(width, height, () => 0); // Track water change per cell this iteration

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const cell = grid[y][x];
                if (!cell || cell.water <= 0) continue;

                const cellTotalHeight = cell.height + cell.water;
                let totalOutflowVolume = 0;
                let totalSlopeDown = 0;
                const outflows = []; // Store { neighbor, slope, heightDiff }

                const neighbors = getNeighbors(grid, x, y);
                for (const neighborData of neighbors) {
                     const neighbor = neighborData.cell;
                     if(!neighbor) continue;
                     const neighborTotalHeight = neighbor.height + neighbor.water; // Use neighbor's current water level
                     const heightDiff = cellTotalHeight - neighborTotalHeight;

                     if (heightDiff > 0) { // Water flows downhill
                         outflows.push({ neighbor, heightDiff });
                         totalSlopeDown += heightDiff; // Use heightDiff as a proxy for slope influence
                     }
                }

                 if (totalSlopeDown > 0 && outflows.length > 0) {
                      // Calculate how much water *can* flow out (don't drain below neighbors)
                     let maxOutflowPossible = cell.water; // Start with current water
                     // Find lowest neighbor height difference to potentially limit outflow
                     let minHeightDiffToDrain = height; // Find minimum height difference for outflow
                    outflows.forEach(o => {
                        if (o.heightDiff < minHeightDiffToDrain) minHeightDiffToDrain = o.heightDiff;
                    });
                    // Limit outflow so cell level doesn't drop below lowest outflow neighbor
                    maxOutflowPossible = Math.min(cell.water, minHeightDiffToDrain);


                      // Distribute outflow proportionally to height difference
                      for (const outflow of outflows) {
                           const proportion = outflow.heightDiff / totalSlopeDown;
                           let outflowVolume = maxOutflowPossible * proportion;

                           // Limit outflow volume per neighbor if needed (e.g., pipe model limits) - simple for now

                            // Add water to neighbor's delta grid
                            const neighborCoords = findCellCoords(grid, outflow.neighbor); // Need a way to get coords back
                            if(neighborCoords) {
                                waterDeltaGrid[neighborCoords.y][neighborCoords.x] += outflowVolume;
                            }
                            totalOutflowVolume += outflowVolume;
                      }
                 }
                // Subtract total outflow from current cell's delta
                waterDeltaGrid[y][x] -= totalOutflowVolume;
            }
        }

         // 3. Update Water Levels and Erode/Transport Sediment
         const sedimentDeltaGrid = createGrid(width, height, () => 0); // Track sediment change

         for (let y = 0; y < height; y++) {
             for (let x = 0; x < width; x++) {
                 const cell = grid[y][x];
                 if (!cell) continue;

                 // Update water level first
                 cell.water += waterDeltaGrid[y][x];
                 cell.water = Math.max(0, cell.water); // Clamp water at 0

                 // --- Erosion & Transport ---
                 if (waterDeltaGrid[y][x] < 0) { // Water flowed OUT of this cell
                      // Calculate sediment capacity based on water volume, slope (approximated by outflow amount/heightDiff)
                      // Simplified: capacity proportional to water volume and outflow amount
                      const outflowVolume = -waterDeltaGrid[y][x];
                      const sedimentCapacity = outflowVolume * config.CAPACITY_FACTOR * config.MIN_SLOPE; // Very basic

                      // Erode material from cell height
                      const amountToErode = Math.min(cell.height, outflowVolume * config.EROSION_FACTOR); // Don't erode below 0
                      cell.height -= amountToErode;

                      // Add eroded sediment + existing sediment to transport pool
                      const sedimentToTransport = cell.sediment + amountToErode;

                      // Calculate how much sediment can actually be carried away
                      const carriedSediment = Math.min(sedimentToTransport, sedimentCapacity);

                      // Calculate sediment to deposit *locally* (what exceeds capacity)
                      const sedimentToDeposit = sedimentToTransport - carriedSediment;

                      // Update local sediment delta (deposition)
                      sedimentDeltaGrid[y][x] += sedimentToDeposit;
                      cell.sediment = 0; // Sediment is either transported or deposited this step


                      // *** Distribute carriedSediment to neighbors where water flowed ***
                      // This requires tracking where the outflow went in step 2 more explicitly
                      // For now, simplify: assume sediment magically appears in neighbors based on water delta
                      // A better way involves tracking sediment flux between cells.
                      const neighbors = getNeighbors(grid, x, y);
                      let distributedSediment = 0;
                      // Find neighbors that *received* water from this cell in the previous step (tricky without explicit flow)
                      // Simplification: Distribute proportionally to positive waterDelta in neighbors
                       let totalPositiveNeighborDelta = 0;
                       const receivingNeighbors = [];
                       for(const neighborData of neighbors) {
                           const neighborCoords = findCellCoords(grid, neighborData.cell);
                            if(neighborCoords) {
                                const neighborWaterDelta = waterDeltaGrid[neighborCoords.y][neighborCoords.x];
                                if (neighborWaterDelta > 0) {
                                    // Check if this neighbor likely received water *from this cell*
                                    // Heuristic: if neighbor is lower than current cell
                                    const neighbor = neighborData.cell;
                                    const cellTotalHeight = cell.height + cell.water; // Use potentially updated height/water
                                    const neighborTotalHeight = neighbor.height + neighbor.water;
                                     if(cellTotalHeight > neighborTotalHeight) {
                                         totalPositiveNeighborDelta += neighborWaterDelta;
                                         receivingNeighbors.push({coords: neighborCoords, delta: neighborWaterDelta});
                                     }
                                }
                            }
                       }
                       if(totalPositiveNeighborDelta > 0) {
                            for(const rn of receivingNeighbors) {
                                const proportion = rn.delta / totalPositiveNeighborDelta;
                                const sedimentToAdd = carriedSediment * proportion;
                                sedimentDeltaGrid[rn.coords.y][rn.coords.x] += sedimentToAdd;
                                distributedSediment += sedimentToAdd;
                            }
                       }
                       // Handle sediment that couldn't be distributed (deposit locally?)
                       const undistributedSediment = carriedSediment - distributedSediment;
                        if (undistributedSediment > 0) {
                             sedimentDeltaGrid[y][x] += undistributedSediment; // Deposit remainder locally
                             console.warn(`Undistributed sediment at ${x},${y}: ${undistributedSediment.toFixed(4)}`)
                        }


                 } else if (cell.water > 0) {
                      // Cell received water or had standing water - potential deposition
                      const sedimentCapacity = cell.water * config.CAPACITY_FACTOR * config.MIN_SLOPE; // Capacity of standing water
                      if (cell.sediment > sedimentCapacity) {
                           const amountToDeposit = (cell.sediment - sedimentCapacity) * config.DEPOSITION_FACTOR;
                           cell.sediment -= amountToDeposit;
                           sedimentDeltaGrid[y][x] += amountToDeposit; // Add to deposition delta
                      }
                 }
             }
         }


         // 4. Update Heightmap with Deposited Sediment
         for (let y = 0; y < height; y++) {
             for (let x = 0; x < width; x++) {
                  if (grid[y][x]) {
                     grid[y][x].height += sedimentDeltaGrid[y][x]; // Add deposited sediment to height
                  }
             }
         }

        // 5. Evaporate Water
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                 if (grid[y][x]) {
                     grid[y][x].water *= (1.0 - config.EVAPORATION_RATE);
                     if (grid[y][x].water < 1e-5) grid[y][x].water = 0; // Threshold small amounts
                 }
            }
        }


        // 6. Post Progress Update periodically
        if (iter % config.PROGRESS_UPDATE_INTERVAL === 0 || iter === config.EROSION_ITERATIONS - 1) {
            self.postMessage({
                type: 'progress',
                currentStep: iter + 1,
                totalSteps: config.EROSION_ITERATIONS,
                phase: 'Erosion'
            });
        }
    } // End simulation loop

    console.log("[Worker Erosion] Simulation loop finished.");
    return worldState;
}

// Helper to find coordinates of a cell object (inefficient, needs better way if used often)
function findCellCoords(grid, targetCell) {
    const height = grid.length;
    const width = grid[0].length;
     for (let y = 0; y < height; y++) {
         for (let x = 0; x < width; x++) {
             if (grid[y][x] === targetCell) {
                 return { x, y };
             }
         }
     }
     return null;
}