// --- START OF FILE mapUtils.js ---
import * as cfg from './config.js';
import { updateStatus, showModal, updateNationList, updateInfoPanel, closeInlineEditor } from './domUtils.js';
import { redrawCanvas, resetView, setInitialCanvasSize } from './canvasUtils.js';
import { generateMap } from './mapGen.js'; // Import the generator

/**
 * Colorizes a loaded map image based on specific blue channel values.
 * Returns a Data URL of the colorized image.
 * @param {HTMLImageElement} sourceImage - The fully loaded source image.
 * @param {string} imageType - The original MIME type.
 * @returns {Promise<string>} A Promise resolving with the Data URL of the colorized image.
 */
async function colorizeLoadedMap(sourceImage, imageType) {
    // Reverted to the state before the previous edit - it returns a data URL.
    return new Promise((resolve, reject) => {
        if (!sourceImage || !sourceImage.complete || sourceImage.naturalWidth === 0) {
            return reject(new Error("Invalid source image provided for colorization."));
        }

        const width = sourceImage.naturalWidth;
        const height = sourceImage.naturalHeight;
        const canvas = document.createElement('canvas'); // Use a local canvas for this function
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return reject(new Error("Could not get 2D context for colorization."));

        try {
            ctx.drawImage(sourceImage, 0, 0);
            let imageData;
            try { imageData = ctx.getImageData(0, 0, width, height); }
            catch (imageDataError) { return reject(new Error("Could not read pixel data from the map image.")); }

            const data = imageData.data;
            const waterColor = { r: 0, g: 0, b: 106 };
            const plainsBaseColor = { r: 190, g: 220, b: 140 };
            const mountainsPeakColor = { r: 245, g: 245, b: 200 };
            const NEAR_BLACK_THRESHOLD = 1;

            for (let i = 0; i < data.length; i += 4) {
                const grayValue = data[i];
                const a = data[i + 3];
                let newR, newG, newB;

                const effectiveBlue = grayValue;

                if (a < 20 || effectiveBlue < NEAR_BLACK_THRESHOLD) {
                    newR = waterColor.r; newG = waterColor.g; newB = waterColor.b;
                }
                else if (effectiveBlue <= 140) {
                    newR = plainsBaseColor.r; newG = plainsBaseColor.g; newB = plainsBaseColor.b;
                }
                else if (effectiveBlue <= 158) {
                    const magnitude = Math.max(0, effectiveBlue - 140);
                    newR = plainsBaseColor.r;
                    newG = Math.max(0, plainsBaseColor.g - magnitude);
                    newB = plainsBaseColor.b;
                }
                 else if (effectiveBlue <= 178) {
                     const midMountainColor = { r: 220, g: 215, b: 160 };
                     const t = (effectiveBlue - 158) / (178 - 158);
                     const startR = plainsBaseColor.r;
                     const startG = Math.max(0, plainsBaseColor.g - (158 - 140));
                     const startB = plainsBaseColor.b;
                     newR = Math.round(startR + (midMountainColor.r - startR) * t);
                     newG = Math.round(startG + (midMountainColor.g - startG) * t);
                     newB = Math.round(startB + (midMountainColor.b - startB) * t);
                 }
                 else if (effectiveBlue < 200) {
                     const midMountainColor = { r: 220, g: 215, b: 160 };
                     const t = (effectiveBlue - 178) / (199 - 178);
                     newR = Math.round(midMountainColor.r + (mountainsPeakColor.r - midMountainColor.r) * t);
                     newG = Math.round(midMountainColor.g + (mountainsPeakColor.g - midMountainColor.g) * t);
                     newB = Math.round(midMountainColor.b + (mountainsPeakColor.b - midMountainColor.b) * t);
                 }
                else {
                    newR = mountainsPeakColor.r;
                    newG = mountainsPeakColor.g;
                    newB = mountainsPeakColor.b;
                }

                data[i] = Math.max(0, Math.min(255, newR));
                data[i + 1] = Math.max(0, Math.min(255, newG));
                data[i + 2] = Math.max(0, Math.min(255, newB));
                data[i + 3] = 255;
            }

            ctx.putImageData(imageData, 0, 0);
            const validImageType = imageType?.startsWith('image/') ? imageType : 'image/png';
            let dataUrl = canvas.toDataURL(validImageType); // Generate Data URL from the local canvas
            resolve(dataUrl); // Resolve with the Data URL

        } catch (error) {
            updateStatus("Error during map colorization.", true);
            reject(error); // Reject on error
        }
    });
}


/**
 * Applies the water level threshold to a grayscale image Data URL.
 * @param {string} grayscaleDataUrl The input grayscale map Data URL.
 * @param {number} waterLevel The threshold (0-255).
 * @param {number} width The width of the image.
 * @param {number} height The height of the image.
 * @returns {Promise<string>} A Promise resolving with the Data URL of the modified grayscale image.
 */
async function applyWaterLevel(grayscaleDataUrl, waterLevel, width, height) {
    // (Keep the existing applyWaterLevel function - no changes needed here)
    return new Promise(async (resolve, reject) => {
        if (waterLevel < 0 || waterLevel > 255) {
            return reject(new Error("Invalid water level. Must be between 0 and 255."));
        }

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
        if (!tempCtx) {
            return reject(new Error("Could not get context for water level processing."));
        }

        const tempImg = new Image();
        try {
            await new Promise((res, rej) => {
                tempImg.onload = res;
                tempImg.onerror = () => rej(new Error("Failed to load grayscale image for water level processing."));
                tempImg.src = grayscaleDataUrl;
            });

            tempCtx.drawImage(tempImg, 0, 0);
            let imageData;
            try {
                imageData = tempCtx.getImageData(0, 0, width, height);
            } catch (e) {
                return reject(new Error("Could not read pixel data for water level processing."));
            }

            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const grayValue = data[i];
                if (grayValue < waterLevel) {
                    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
                }
            }

            tempCtx.putImageData(imageData, 0, 0);
            const modifiedGrayscaleDataUrl = tempCanvas.toDataURL('image/png');
            resolve(modifiedGrayscaleDataUrl);

        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Corrects isolated single pixels (land in water, water in land).
 * @param {ImageData} imageData The colorized ImageData object to modify.
 * @param {number} width Image width.
 * @param {number} height Image height.
 */
function correctSinglePixels(imageData, width, height) {
    // (Keep the existing correctSinglePixels function - no changes needed here)
    const data = imageData.data;
    const waterColor = { r: 0, g: 0, b: 106 };
    const landColor = { r: 190, g: 220, b: 140 };
    const majorityThreshold = 5;

    const originalData = Uint8ClampedArray.from(data);

    const isWaterOriginal = (i) => {
         return originalData[i] === waterColor.r && originalData[i+1] === waterColor.g && originalData[i+2] === waterColor.b;
    }

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const centerIndex = (y * width + x) * 4;
            const centerIsWater = isWaterOriginal(centerIndex);

            let waterNeighbours = 0;
            let landNeighbours = 0;

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const neighbourIndex = ((y + dy) * width + (x + dx)) * 4;
                    if (isWaterOriginal(neighbourIndex)) {
                        waterNeighbours++;
                    } else {
                        landNeighbours++;
                    }
                }
            }

            if (centerIsWater && landNeighbours >= majorityThreshold) {
                data[centerIndex] = landColor.r;
                data[centerIndex + 1] = landColor.g;
                data[centerIndex + 2] = landColor.b;
                data[centerIndex + 3] = 255;
            } else if (!centerIsWater && waterNeighbours >= majorityThreshold) {
                data[centerIndex] = waterColor.r;
                data[centerIndex + 1] = waterColor.g;
                data[centerIndex + 2] = waterColor.b;
                data[centerIndex + 3] = 255;
            }
        }
    }
}


/**
 * Gathers parameters, triggers map generation (grayscale), applies water level,
 * colorizes it, corrects single pixels, and updates the application state.
 */
export async function triggerMapGeneration() {
    if (cfg.isGeneratingMap) {
        console.warn("Generation already in progress.");
        return;
    }

    cfg.setIsGeneratingMap(true);
    if(cfg.generateMapButton) cfg.generateMapButton.disabled = true;
    if(cfg.jsonLoadLabel) cfg.jsonLoadLabel.setAttribute('data-disabled', 'true');
    if(cfg.loadFlagsButton) cfg.loadFlagsButton.disabled = true;
    if(cfg.saveButton) cfg.saveButton.disabled = true;
    updateStatus("Starting map generation...", false, true);

    // Create a temporary canvas that will be reused
    const tempCanvas = document.createElement('canvas');
    let tempCtx = null;

    try {
        // --- Get Parameters ---
        const params = {
             seed: parseInt(cfg.paramSeed?.value, 10) || cfg.defaultGenParams.seed,
             width: parseInt(cfg.paramWidth?.value, 10) || cfg.defaultGenParams.width,
             height: parseInt(cfg.paramHeight?.value, 10) || cfg.defaultGenParams.height,
             numFaults: parseInt(cfg.paramNumFaults?.value, 10) || cfg.defaultGenParams.numFaults,
             enableSymmetry: cfg.paramEnableSymmetry?.checked ?? cfg.defaultGenParams.enableSymmetry,
             smoothing: { iterations: parseInt(cfg.paramSmoothingIterations?.value, 10) || cfg.defaultGenParams.smoothing.iterations, },
             noise: {
                 seed: parseInt(cfg.paramNoiseSeed?.value, 10) || cfg.defaultGenParams.noise.seed,
                 octaves: parseInt(cfg.paramNoiseOctaves?.value, 10) || cfg.defaultGenParams.noise.octaves,
                 persistence: parseFloat(cfg.paramNoisePersistence?.value) || cfg.defaultGenParams.noise.persistence,
                 lacunarity: parseFloat(cfg.paramNoiseLacunarity?.value) || cfg.defaultGenParams.noise.lacunarity,
                 scale: parseFloat(cfg.paramNoiseScale?.value) || cfg.defaultGenParams.noise.scale,
                 strength: parseFloat(cfg.paramNoiseStrength?.value) || cfg.defaultGenParams.noise.strength,
             },
             progressCallback: (stage, percent) => {
                 const overallPercent = Math.floor(percent * 0.60); // Generation is ~60%
                 updateStatus(`Generating: ${stage} (${overallPercent}%)`, false, true);
             }
        };
         const waterLevel = parseInt(cfg.paramWaterLevel?.value, 10) ?? cfg.defaultGenParams.waterLevel;

         // --- Validate Parameters ---
         if (params.width <= 0 || params.height <= 0 || params.numFaults < 0) throw new Error("Invalid generation parameters (size/faults).");
         if (params.noise.octaves <= 0 || params.noise.persistence <= 0 || params.noise.persistence >= 1 || params.noise.lacunarity < 1 || params.noise.scale <=0) throw new Error("Invalid noise parameters.");
         if (isNaN(waterLevel) || waterLevel < 0 || waterLevel > 255) throw new Error("Invalid Water Level parameter (must be 0-255).");


        // --- Generate Grayscale Map ---
        const grayscaleDataUrl = await generateMap(params);

        // --- Apply Water Level ---
        updateStatus("Applying water level (65%)...", false, true);
        const modifiedGrayscaleDataUrl = await applyWaterLevel(grayscaleDataUrl, waterLevel, params.width, params.height);

        // --- Load Modified Grayscale Image ---
        updateStatus("Loading modified heightmap (75%)...", false, true);
        const tempGrayscaleImage = new Image();
        await new Promise((resolve, reject) => { // Wait for modified grayscale image to load
            tempGrayscaleImage.onload = resolve;
            tempGrayscaleImage.onerror = () => reject(new Error("Failed to load modified grayscale map."));
            tempGrayscaleImage.src = modifiedGrayscaleDataUrl;
        });

        // --- Colorize Map ---
        updateStatus("Colorizing map (85%)...", false, true);
        // colorizeLoadedMap now returns a Data URL again
        const colorizedDataUrl = await colorizeLoadedMap(tempGrayscaleImage, 'image/png');

        // --- Load colorized image onto temp canvas for pixel correction ---
        updateStatus("Preparing for pixel correction (88%)...", false, true);
        const tempColorizedImage = new Image();
         await new Promise((resolve, reject) => {
            tempColorizedImage.onload = resolve;
            tempColorizedImage.onerror = () => reject(new Error("Failed to load intermediate colorized map for correction."));
            tempColorizedImage.src = colorizedDataUrl;
         });
        tempCanvas.width = params.width;
        tempCanvas.height = params.height;
        tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
        if (!tempCtx) throw new Error("Could not get context for correction canvas.");
        tempCtx.drawImage(tempColorizedImage, 0, 0); // Draw colorized image onto temp canvas

        // --- Correct Single Pixels ---
        updateStatus("Correcting single pixels (90%)...", false, true);
        let finalImageData;
        try {
            finalImageData = tempCtx.getImageData(0, 0, params.width, params.height);
            correctSinglePixels(finalImageData, params.width, params.height); // Modify imageData in place
            tempCtx.putImageData(finalImageData, 0, 0); // Put corrected data back
        } catch (e) {
             console.error("Failed during pixel correction step:", e);
             throw new Error("Pixel correction failed.");
        }

        // --- Get Final Data URL ---
        updateStatus("Preparing final image (95%)...", false, true);
        const finalCorrectedDataUrl = tempCanvas.toDataURL('image/png');

        // --- Load Final Image Object ---
        const finalMapImage = new Image();
        await new Promise((resolve, reject) => {
             finalMapImage.onload = resolve;
             finalMapImage.onerror = () => reject(new Error("Failed to load final corrected map."));
             finalMapImage.src = finalCorrectedDataUrl; // Load the URL from the corrected canvas
        });

        // --- Update Application State ---
        cfg.setMapImage(finalMapImage);
        cfg.setMapInfo({
            name: `Generated (${params.width}x${params.height} S${params.seed} F${params.numFaults} W${waterLevel})`,
            width: params.width, height: params.height,
            fileName: `generated_map_${Date.now()}.png`, fileType: "image/png"
        });
        cfg.setNations([]); cfg.setSelectedNationIndex(null); cfg.setDraggingNation(false);
        cfg.setIsPanning(false); cfg.setPotentialPan(false);
        if(cfg.nationIndexBeingEdited !== null) closeInlineEditor();

        // --- Update UI ---
        setInitialCanvasSize(); resetView();
        updateStatus(`Map generated & processed (${params.width}x${params.height}, WL: ${waterLevel}). Ready.`);
        updateNationList(); updateInfoPanel(null); redrawCanvas();

        if(cfg.jsonLoadLabel) cfg.jsonLoadLabel.removeAttribute('data-disabled');
        if(cfg.saveButton) cfg.saveButton.disabled = false;
        if(cfg.loadFlagsButton) cfg.loadFlagsButton.disabled = false;

    } catch (error) {
        console.error("Error during map generation process:", error);
        const errorMsg = error instanceof Error ? error.message : "Unknown generation error.";
        await showModal('alert', 'Generation Failed', `Map generation failed: ${errorMsg}`);
        updateStatus(`Generation Error: ${errorMsg}`, true);
        if (!cfg.mapImage) redrawCanvas(); // Redraw placeholder if needed
        // Ensure buttons dependent on map are disabled on failure
         if(cfg.jsonLoadLabel) cfg.jsonLoadLabel.setAttribute('data-disabled', 'true');
         if(cfg.saveButton) cfg.saveButton.disabled = true;
         if(cfg.loadFlagsButton) cfg.loadFlagsButton.disabled = true;

    } finally {
        cfg.setIsGeneratingMap(false); // CRITICAL: Reset flag here
        if(cfg.generateMapButton) cfg.generateMapButton.disabled = false; // Re-enable generate button
        // Clean up temp canvas context if it was created
        tempCtx = null;
    }
}

// --- END OF FILE mapUtils.js ---