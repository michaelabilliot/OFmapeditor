// --- START OF FILE mapGen.js ---

/**
 * mapGen.js
 *
 * Module for generating procedural heightmaps using fractal faults,
 * smoothing, and layered Perlin noise. Replicates and enhances logic
 * from worldgen-2.2a.c.
 */

// --- Internal State (Module Scope) ---
let _prng_seed = 0; // Seed state for PRNG

// --- Pseudo-Random Number Generator (Mulberry32) ---
function _seedPRNG(seed) {
    _prng_seed = seed | 0;
    if (_prng_seed === 0) _prng_seed = 1; // Seed cannot be 0
}

function _prng() {
    _prng_seed |= 0;
    _prng_seed = (_prng_seed + 0x6D2B79F5) | 0;
    let t = Math.imul(_prng_seed ^ (_prng_seed >>> 15), 1 | _prng_seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // Returns [0, 1)
}

function _prngRange(min, max) {
    return _prng() * (max - min) + min;
}

// --- Perlin Noise Implementation (Basic 2D) ---
// Uses a fixed permutation table for simplicity here.
// For production with seeding, initialize this table using the seeded PRNG.
const _PERM_TABLE_SIZE = 256;
const _PERM_TABLE = new Uint8Array(_PERM_TABLE_SIZE * 2);
const _GRADIENTS_2D = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1]
];

// Call this once before generating any noise, or within generateMap if seed changes
function _initializePerlinTable(seed) {
    _seedPRNG(seed); // Seed PRNG specifically for table generation
    const p = new Uint8Array(_PERM_TABLE_SIZE);
    for (let i = 0; i < _PERM_TABLE_SIZE; i++) p[i] = i;
    for (let i = _PERM_TABLE_SIZE - 1; i > 0; i--) {
        const j = Math.floor(_prng() * (i + 1));
        [p[i], p[j]] = [p[j], p[i]]; // Swap
    }
    // Double the table for wrapping without modulo
    for (let i = 0; i < _PERM_TABLE_SIZE; i++) {
        _PERM_TABLE[i] = _PERM_TABLE[i + _PERM_TABLE_SIZE] = p[i];
    }
}

function _fadePerlin(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function _lerpPerlin(t, a, b) { return a + t * (b - a); }
function _getGradient2D(hash) { return _GRADIENTS_2D[hash & 7]; } // Use low 3 bits

function _dotGridGradient2D(ix, iy, x, y) {
    const grad = _getGradient2D(_PERM_TABLE[ix + _PERM_TABLE[iy]]);
    const dx = x - ix;
    const dy = y - iy;
    return (dx * grad[0] + dy * grad[1]);
}

function _noise2D(x, y) {
    const x0 = Math.floor(x); const y0 = Math.floor(y);
    const x1 = x0 + 1;        const y1 = y0 + 1;

    const sx = x - x0;        const sy = y - y0;
    const u = _fadePerlin(sx); const v = _fadePerlin(sy);

    // Use bitwise AND for faster wrapping with doubled table
    const ix0 = x0 & (_PERM_TABLE_SIZE - 1);
    const iy0 = y0 & (_PERM_TABLE_SIZE - 1);
    const ix1 = x1 & (_PERM_TABLE_SIZE - 1);
    const iy1 = y1 & (_PERM_TABLE_SIZE - 1);

    const n00 = _dotGridGradient2D(ix0, iy0, x, y);
    const n10 = _dotGridGradient2D(ix1, iy0, x, y);
    const n01 = _dotGridGradient2D(ix0, iy1, x, y);
    const n11 = _dotGridGradient2D(ix1, iy1, x, y);

    const nx0 = _lerpPerlin(u, n00, n10);
    const nx1 = _lerpPerlin(u, n01, n11);

    // Result roughly in [-0.707, 0.707], scale slightly towards [-1, 1]
    return _lerpPerlin(v, nx0, nx1) * 1.4;
}


// --- Map Generation Core Logic ---

/** Validates input parameters */
function _validateParams(params) {
    // (Keep validation logic from previous step)
     if (!params) throw new Error("Generation parameters are required.");
    const required = ['seed', 'width', 'height', 'numFaults', 'smoothing', 'noise'];
    const requiredSmoothing = ['iterations']; // strength removed for box blur
    const requiredNoise = ['seed', 'octaves', 'persistence', 'lacunarity', 'scale', 'strength'];

    for (const key of required) { if (params[key] === undefined || params[key] === null) throw new Error(`Missing required parameter: ${key}`); }
    if (typeof params.width !== 'number' || params.width <= 0 || !Number.isInteger(params.width)) throw new Error("Parameter 'width' must be a positive integer.");
    if (typeof params.height !== 'number' || params.height <= 0 || !Number.isInteger(params.height)) throw new Error("Parameter 'height' must be a positive integer.");
    if (typeof params.seed !== 'number') throw new Error("Parameter 'seed' must be a number.");
    if (typeof params.numFaults !== 'number' || params.numFaults < 0 || !Number.isInteger(params.numFaults)) throw new Error("Parameter 'numFaults' must be a non-negative integer.");

    if (typeof params.smoothing !== 'object') throw new Error("Parameter 'smoothing' must be an object.");
    for (const key of requiredSmoothing) { if (params.smoothing[key] === undefined || params.smoothing[key] === null) throw new Error(`Missing required smoothing parameter: ${key}`); }
    if (typeof params.smoothing.iterations !== 'number' || params.smoothing.iterations < 0 || !Number.isInteger(params.smoothing.iterations)) throw new Error("Parameter 'smoothing.iterations' must be a non-negative integer.");

    if (typeof params.noise !== 'object') throw new Error("Parameter 'noise' must be an object.");
    for (const key of requiredNoise) { if (params.noise[key] === undefined || params.noise[key] === null) throw new Error(`Missing required noise parameter: ${key}`); }
    if (typeof params.noise.seed !== 'number') throw new Error("Parameter 'noise.seed' must be a number.");
    if (typeof params.noise.octaves !== 'number' || params.noise.octaves <= 0 || !Number.isInteger(params.noise.octaves)) throw new Error("Parameter 'noise.octaves' must be a positive integer.");
    if (typeof params.noise.persistence !== 'number' || params.noise.persistence <= 0 || params.noise.persistence >= 1) throw new Error("Parameter 'noise.persistence' must be between 0 (exclusive) and 1 (exclusive).");
    if (typeof params.noise.lacunarity !== 'number' || params.noise.lacunarity < 1) throw new Error("Parameter 'noise.lacunarity' must be >= 1.");
    if (typeof params.noise.scale !== 'number' || params.noise.scale <= 0) throw new Error("Parameter 'noise.scale' must be positive.");
    if (typeof params.noise.strength !== 'number') throw new Error("Parameter 'noise.strength' must be a number.");

    // Optional parameter default
    if (params.enableSymmetry === undefined) params.enableSymmetry = true;
}

/** Precomputes sine lookup table */
function _precomputeSines(width) {
    const sineTable = new Float32Array(2 * width); // Store 2 periods for safe wrapping
    const factor = 2 * Math.PI / width;
    for (let i = 0; i < width; i++) {
        sineTable[i] = sineTable[i + width] = Math.sin(i * factor);
    }
    return sineTable;
}

/** Initializes the heightmap array */
function _initializeHeightmap(width, height) {
    // Using standard nested arrays with Float32Array rows for potentially better perf
    const heightMap = new Array(width);
    for (let x = 0; x < width; x++) {
        const column = new Float32Array(height);
        column[0] = 0; // Initialize top row to 0
        for (let y = 1; y < height; y++) {
            column[y] = NaN; // Sentinel value
        }
        heightMap[x] = column;
    }
    return heightMap;
}

/** Applies a single fault line to the delta map */
function _applySingleFaultLine(heightMap, params, sineTable) {
    const { width, height } = params;
    const yRangeDiv2 = height / 2.0;
    const yRangeDivPI = height / Math.PI;

    // Generate random great circle parameters using the seeded PRNG
    const alpha = _prngRange(-Math.PI / 2, Math.PI / 2); // Rotation around X
    const beta = _prngRange(-Math.PI / 2, Math.PI / 2);  // Rotation around Y

    const cosAlpha = Math.cos(alpha);
    const cosBeta = Math.cos(beta);

    // Calculate cosine of the angle between the Z-axis and the rotated Z-axis
    const acosArg = Math.max(-1.0, Math.min(1.0, cosAlpha * cosBeta));
    const rotationAngle = Math.acos(acosArg);

    // TanB from the C code: tan(acos(cos(Alpha)*cos(Beta)))
    // This is equivalent to tan(rotationAngle), ensuring it's >= 0
    const tanB = Math.tan(rotationAngle);

    // Pre-calculate offset for sine table lookup based on Beta rotation
    const xsi = Math.floor(width / 2.0 - (width / Math.PI) * beta);

    const raiseLower = _prng() < 0.5 ? -1.0 : 1.0; // Use floats for consistency

    // Process first half width (fault projection)
    for (let phi = 0; phi < width / 2; phi++) {
        // Calculate sine table index (handle wrapping carefully)
        // We need the sine of (Xsi - Phi + Width) * 2 * PI / Width
        // Our table stores sin(i * 2 * PI / Width) for i=0..2*Width-1
        // Index becomes (Xsi - Phi + Width) modulo Width, adjusted for 2*Width table
        const effectiveIndex = (xsi - phi + width) % width; // Wraps around 0 to width-1
        // We need the value from the second period if effectiveIndex < 0, but modulo handles this.
        // The original C code used `*(SinIterPhi+Xsi-Phi+XRange)` -> index Xsi-Phi+Width
        // So we use effectiveIndex + width to read from the second half of our doubled table for safety
        const sineTableIndex = effectiveIndex + width;
        const sinValue = sineTable[sineTableIndex];

        // Calculate projected latitude (Theta) - vertical position on the map
        const thetaRaw = yRangeDivPI * Math.atan(sinValue * tanB) + yRangeDiv2;
        const theta = Math.max(0, Math.min(height - 1, Math.floor(thetaRaw))); // Clamp Y

        // Apply delta to the map at (phi, theta)
        const currentDelta = heightMap[phi][theta];
        if (isNaN(currentDelta)) {
            heightMap[phi][theta] = raiseLower; // First hit
        } else {
            heightMap[phi][theta] = currentDelta + raiseLower; // Accumulate delta
        }
    }
}

/** Mirrors the fault deltas based on the C code's logic */
function _mirrorFaultDeltas(heightMap, width, height) {
     const halfWidth = Math.floor(width / 2);
     for (let x = 0; x < halfWidth; x++) {
         for (let y = 1; y < height; y++) { // Start from y=1 as in C
             const sourceVal = heightMap[x][y]; // Get delta from left half

             // Calculate target coordinates: X mirrored, Y flipped
             const targetX = x + halfWidth;
             const targetY = height - 1 - y; // Flip vertically (C code: YRange-i)

             // Check bounds and apply (overwrite as C code does)
             if (targetX < width && targetY >= 0) {
                 // Check if source value is valid (not NaN) before mirroring
                 if (!isNaN(sourceVal)) {
                      heightMap[targetX][targetY] = sourceVal;
                 }
                 // If source is NaN, ensure target is also NaN unless it was already set
                 // (This preserves hits on the right side that might have occurred
                 // if a fault line wrapped around, though less likely with this projection)
                 // else if (isNaN(heightMap[targetX][targetY])) {
                 //     heightMap[targetX][targetY] = NaN; // Keep target as NaN if source was
                 // }
                 // Simplest: just copy, NaN included. Reconstruction handles NaN.
                 // heightMap[targetX][targetY] = sourceVal;
             }
         }
     }
}


/** Reconstructs absolute heights from the delta map */
function _reconstructHeight(heightMap, params) {
    const { width, height } = params;
    for (let x = 0; x < width; x++) {
        let currentHeight = heightMap[x][0];
        if (isNaN(currentHeight)) currentHeight = 0; // Ensure top isn't NaN
        heightMap[x][0] = currentHeight; // Store initial height

        for (let y = 1; y < height; y++) {
            const delta = heightMap[x][y];
            if (!isNaN(delta)) { // If it's a valid delta (not the sentinel)
                currentHeight += delta;
            }
            // Store the accumulated height, overwriting the delta/sentinel
            heightMap[x][y] = currentHeight;
        }
    }
    // heightMap now contains absolute height values
}


/** Normalizes heightmap values to the range [0, 1] */
function _normalizeMap(heightMap, params) {
    const { width, height } = params;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            const val = heightMap[x][y];
            if (val < minZ) minZ = val;
            if (val > maxZ) maxZ = val;
        }
    }

    // Create new map for normalized values
    const normalizedHeightMap = new Array(width);
    for(let x=0; x<width; x++) normalizedHeightMap[x] = new Float32Array(height);

    const range = maxZ - minZ;

    if (range <= 1e-9) { // Use tolerance for floating point checks
        console.warn("Map is flat after reconstruction. Setting to 0.5.");
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                normalizedHeightMap[x][y] = 0.5;
            }
        }
    } else {
        const rangeInv = 1.0 / range;
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                normalizedHeightMap[x][y] = (heightMap[x][y] - minZ) * rangeInv;
            }
        }
    }
    console.log(`Normalized Height Range: Min=${minZ.toFixed(2)}, Max=${maxZ.toFixed(2)} -> [0, 1]`);
    return normalizedHeightMap;
}

/** Applies a basic Box Blur */
function _applyBoxBlur(sourceMap, width, height, iterations) {
    if (iterations <= 0) return sourceMap;

    let currentMap = sourceMap;
    let tempMap = new Array(width);
    for(let x=0; x<width; x++) tempMap[x] = new Float32Array(height);

    const kernelSize = 3; // 3x3 kernel
    const kernelRadius = Math.floor(kernelSize / 2);

    for (let iter = 0; iter < iterations; iter++) {
        // Swap source and target for ping-pong buffering
        const targetMap = (iter % 2 === 0) ? tempMap : sourceMap;
        const readMap = (iter % 2 === 0) ? sourceMap : tempMap;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sum = 0;
                let count = 0;
                for (let ky = -kernelRadius; ky <= kernelRadius; ky++) {
                    for (let kx = -kernelRadius; kx <= kernelRadius; kx++) {
                        const sampleX = Math.max(0, Math.min(width - 1, x + kx)); // Clamp edges
                        const sampleY = Math.max(0, Math.min(height - 1, y + ky)); // Clamp edges
                        sum += readMap[sampleX][sampleY];
                        count++;
                    }
                }
                targetMap[x][y] = sum / count;
            }
        }
        currentMap = targetMap; // Result is now in targetMap
    }
    return currentMap; // Return the map holding the final result
}


/** Generates layered FBM Perlin noise */
function _generateFBMNoise(params) {
    const { width, height, noise } = params;
    const { octaves, persistence, lacunarity, scale, seed } = noise;
    const noiseMap = new Array(width);
    for(let x=0; x<width; x++) noiseMap[x] = new Float32Array(height);

    // Ensure Perlin table is initialized with the noise-specific seed
    _initializePerlinTable(seed);

    const octaveOffsets = [];
    _seedPRNG(seed ^ 0x12345678); // Use seeded PRNG for offsets
    for (let i = 0; i < octaves; i++) {
        octaveOffsets.push({ x: _prngRange(-10000, 10000), y: _prngRange(-10000, 10000) });
    }

    const safeScale = Math.max(0.0001, scale);
    const halfWidth = width / 2.0;
    const halfHeight = height / 2.0;
    let minRawNoise = Infinity;
    let maxRawNoise = -Infinity;
    let totalAmplitudeMax = 0; // For normalization estimation

    // Generate raw noise layers
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            let amplitude = 1.0;
            let frequency = 1.0;
            let noiseHeight = 0.0;
            totalAmplitudeMax = 0; // Recalculate max possible amplitude per pixel

            for (let i = 0; i < octaves; i++) {
                const sampleX = (x - halfWidth) / safeScale * frequency + octaveOffsets[i].x;
                const sampleY = (y - halfHeight) / safeScale * frequency + octaveOffsets[i].y;

                const perlinValue = _noise2D(sampleX, sampleY); // Range approx [-1, 1]
                noiseHeight += perlinValue * amplitude;
                totalAmplitudeMax += amplitude; // Sum max possible amplitude

                amplitude *= persistence;
                frequency *= lacunarity;
            }
            noiseMap[x][y] = noiseHeight;
            if (noiseHeight < minRawNoise) minRawNoise = noiseHeight;
            if (noiseHeight > maxRawNoise) maxRawNoise = noiseHeight;
        }
    }

    // --- Normalize the raw noise to [-1, 1] ---
    // We can normalize using the theoretical max amplitude OR the measured range.
    // Using measured range gives full contrast but might vary run-to-run slightly.
    // Using theoretical max (totalAmplitudeMax) gives consistent scale but maybe less contrast.
    // Let's use measured range for better visual result.
    const noiseRange = maxRawNoise - minRawNoise;
    if (noiseRange <= 1e-9) { // Handle flat noise case
        console.warn("Generated FBM noise is flat.");
        // Map is already initialized to 0 via Float32Array default
    } else {
        const rangeInv = 2.0 / noiseRange; // Scale to range of 2
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                // Normalize to [0, 1], scale to [0, 2], shift to [-1, 1]
                noiseMap[x][y] = ((noiseMap[x][y] - minRawNoise) * rangeInv) - 1.0;
            }
        }
    }

    return noiseMap;
}


/** Combines the smoothed map with the noise map */
function _combineMaps(smoothedMap, noiseMap, noiseStrength, width, height) {
    const finalMap = new Array(width);
     for(let x=0; x<width; x++) finalMap[x] = new Float32Array(height);

    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            finalMap[x][y] = smoothedMap[x][y] + noiseMap[x][y] * noiseStrength;
        }
    }
    return finalMap;
}

/** Clamps map values to the range [0, 1] */
function _clampMap(map, width, height) {
    // Modify in place
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            map[x][y] = Math.max(0.0, Math.min(1.0, map[x][y]));
        }
    }
    return map;
}

/** Renders the final [0, 1] heightmap to a PNG Data URL using grayscale */
function _renderHeightmapToDataURL(finalHeightMap, params) {
    const { width, height } = params;
    // Create canvas in memory
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Cannot get 2D context for rendering.");

    const imageData = ctx.createImageData(width, height);
    const data = imageData.data; // Uint8ClampedArray

    let idx = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const heightVal = finalHeightMap[x][y]; // Value between 0 and 1
            const grayValue = Math.floor(heightVal * 255.999); // Clamp to 0-255

            data[idx++] = grayValue; // Red
            data[idx++] = grayValue; // Green
            data[idx++] = grayValue; // Blue
            data[idx++] = 255;       // Alpha
        }
    }

    ctx.putImageData(imageData, 0, 0);
    console.log(`Rendered map: ${width}x${height}`);
    return canvas.toDataURL('image/png');
}


// --- Exported Main Generation Function ---

/**
 * Generates a processed heightmap and returns its Data URL representation.
 * @param {object} params - Configuration object for generation.
 * @param {number} params.seed - Seed for the random number generator (faults).
 * @param {number} params.width - Desired width of the map.
 * @param {number} params.height - Desired height of the map.
 * @param {number} params.numFaults - Number of fault lines to iterate.
 * @param {boolean} [params.enableSymmetry=true] - Whether to mirror fault deltas.
 * @param {object} params.smoothing - Parameters for the smoothing filter.
 * @param {number} params.smoothing.iterations - How many times to apply the blur (e.g., 1-3).
 * @param {object} params.noise - Parameters for the FBM noise.
 * @param {number} params.noise.seed - Separate seed for noise generation.
 * @param {number} params.noise.octaves - Number of noise layers (e.g., 4-8).
 * @param {number} params.noise.persistence - Amplitude reduction per octave (e.g., 0.5).
 * @param {number} params.noise.lacunarity - Frequency increase per octave (e.g., 2.0).
 * @param {number} params.noise.scale - Base scale/frequency of the first noise octave (e.g., 50-200).
 * @param {number} params.noise.strength - Overall multiplier for the added noise height (e.g., 0.05 - 0.2).
 * @param {function} [params.progressCallback] - Optional callback function for progress updates (receives stage name and percentage 0-100).
 * @returns {Promise<string>} A Promise that resolves with the Data URL (PNG format) of the rendered map.
 */
export async function generateMap(params) {
    return new Promise(async (resolve, reject) => {
        try {
            _validateParams(params); // Validate parameters first
            const { width, height, seed, numFaults, smoothing, noise, enableSymmetry, progressCallback } = params;

            const reportProgress = (stage, percent) => {
                if (progressCallback) {
                    try { progressCallback(stage, percent); } catch (e) { console.warn("Progress callback error:", e); }
                }
                 // Add a small delay to allow UI updates in the main thread
                 // return new Promise(res => setTimeout(res, 0)); // Removed for simplicity/speed, add back if UI freezes
            };

            await reportProgress("Initializing", 0);
            _seedPRNG(seed); // Seed the main PRNG used for faults/symmetry choice
            const sineTable = _precomputeSines(width);

            // --- Stage 1: Initialize ---
            await reportProgress("Initializing Heightmap", 5);
            let heightMap = _initializeHeightmap(width, height);

            // --- Stage 2: Apply Faults ---
            await reportProgress("Applying Fault Lines", 10);
            const faultProgressEnd = enableSymmetry ? 40 : 45; // Adjust end percentage based on symmetry step
            for (let i = 0; i < numFaults; i++) {
                _applySingleFaultLine(heightMap, params, sineTable);
                if (i % Math.max(1, Math.floor(numFaults / 20)) === 0) {
                    await reportProgress("Applying Fault Lines", 10 + Math.floor((i / numFaults) * (faultProgressEnd - 10)));
                }
            }

            // --- Stage 2b: Mirror Faults (Optional) ---
            if (enableSymmetry) {
                await reportProgress("Mirroring Faults", faultProgressEnd);
                 _mirrorFaultDeltas(heightMap, width, height);
            }

            // --- Stage 3: Reconstruct Height ---
            await reportProgress("Reconstructing Height", 45);
            _reconstructHeight(heightMap, params);

            // --- Stage 4: Normalize to [0, 1] ---
            await reportProgress("Normalizing Heightmap", 55);
            let processedMap = _normalizeMap(heightMap, params);
            heightMap = null; // Release original delta/height map memory

            // --- Stage 5: Apply Smoothing ---
            await reportProgress("Applying Smoothing", 65);
            processedMap = _applyBoxBlur(processedMap, width, height, smoothing.iterations);

            // --- Stage 6: Generate FBM Noise ---
            await reportProgress("Generating Noise", 75);
            const noiseMap = _generateFBMNoise(params); // Uses noise.seed internally

            // --- Stage 7: Combine Maps ---
            await reportProgress("Combining Noise", 85);
            processedMap = _combineMaps(processedMap, noiseMap, noise.strength, width, height);
            // noiseMap = null; // Release noise map memory

            // --- Stage 8: Final Clamp ---
            await reportProgress("Final Clamping", 90);
            processedMap = _clampMap(processedMap, width, height);

            // --- Stage 9: Render ---
            await reportProgress("Rendering Image", 95);
            const dataURL = _renderHeightmapToDataURL(processedMap, params);
            // processedMap = null; // Release final map memory

            await reportProgress("Done", 100);
            resolve(dataURL);

        } catch (error) {
            console.error("Map generation failed:", error);
            reject(error); // Reject the promise on error
        }
    });
}

// --- END OF FILE mapGen.js ---