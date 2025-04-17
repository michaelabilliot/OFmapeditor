// --- START OF FILE mapUtils.js ---
import * as cfg from './config.js';
import { updateStatus, showModal, updateNationList, updateInfoPanel, closeInlineEditor } from './domUtils.js';
import { redrawCanvas, resetView, setInitialCanvasSize } from './canvasUtils.js';
import { generateMap } from './mapGen.js'; // Import the generator

/**
 * Colorizes a loaded map image based on specific blue channel values.
 * THIS IS KEPT FROM ORIGINAL - ENSURE LOGIC MATCHES EXPECTED INPUT
 * @param {HTMLImageElement} sourceImage - The fully loaded source image (expects grayscale heightmap where gray = blue channel value).
 * @param {string} imageType - The original MIME type (e.g., 'image/png').
 * @returns {Promise<string>} A Promise resolving with the Data URL of the colorized image.
 */
async function colorizeLoadedMap(sourceImage, imageType) {
    return new Promise((resolve, reject) => {
        if (!sourceImage || !sourceImage.complete || sourceImage.naturalWidth === 0) {
            return reject(new Error("Invalid source image provided for colorization."));
        }
        // Note: Progress message moved to triggerMapGeneration for better flow
        // updateStatus("Colorizing map...", false, true);

        const width = sourceImage.naturalWidth;
        const height = sourceImage.naturalHeight;
        const canvas = document.createElement('canvas');
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

            for (let i = 0; i < data.length; i += 4) {
                const grayValue = data[i]; // Assume R=G=B for grayscale input
                const a = data[i + 3];
                let newR = grayValue, newG = grayValue, newB = grayValue;

                // Use grayscale value as the 'blue channel' indicator from original C code
                const effectiveBlue = grayValue;

                if (a < 20 || (effectiveBlue >= 104 && effectiveBlue <= 108)) { // Water
                    newR = waterColor.r; newG = waterColor.g; newB = waterColor.b;
                } else if (effectiveBlue <= 140) { // Plains (Base)
                    newR = plainsBaseColor.r; newG = plainsBaseColor.g; newB = plainsBaseColor.b;
                } else if (effectiveBlue <= 158) { // Plains (Gradient)
                    const magnitude = Math.max(0, effectiveBlue - 140);
                    newR = plainsBaseColor.r;
                    newG = Math.max(0, plainsBaseColor.g - magnitude);
                    newB = plainsBaseColor.b + Math.floor(magnitude*0.5); // Blend blue? Or just use base? Let's use base B here. newB = plainsBaseColor.b;
                } else if (effectiveBlue <= 178) { // Highlands (Gradient)
                     const magnitude = Math.max(0, effectiveBlue - 140);
                     newR = Math.min(255, 190 + magnitude);
                     newG = Math.min(255, 180 + magnitude);
                     newB = Math.min(255, 140 + Math.floor(magnitude*0.3));
                 } else if (effectiveBlue < 200) { // Mountains (Gradient)
                     const magnitude = Math.max(0, effectiveBlue - 140);
                     newR = Math.min(255, 210 + Math.floor(magnitude / 1.5));
                     newG = Math.min(255, 210 + Math.floor(magnitude / 1.5));
                     newB = Math.min(255, 140 + Math.floor(magnitude*0.6));
                 } else { // Mountains (Peak)
                     newR = mountainsPeakColor.r;
                     newG = mountainsPeakColor.g;
                     newB = mountainsPeakColor.b;
                 }

                data[i] = newR; data[i + 1] = newG; data[i + 2] = newB; data[i + 3] = 255;
            }

            ctx.putImageData(imageData, 0, 0);
            const validImageType = imageType?.startsWith('image/') ? imageType : 'image/png';
            let dataUrl = canvas.toDataURL(validImageType);
            // updateStatus("Map colorization complete."); // Status updated later
            resolve(dataUrl);

        } catch (error) {
            updateStatus("Error during map colorization.", true);
            reject(error);
        }
    });
}


/**
 * Gathers parameters, triggers map generation (grayscale), then colorizes it,
 * and updates the application state.
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

    try {
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
                 const overallPercent = Math.floor(percent * 0.7); // Generation is ~70%
                 updateStatus(`Generating: ${stage} (${overallPercent}%)`, false, true);
             }
        };
         if (params.width <= 0 || params.height <= 0 || params.numFaults < 0) throw new Error("Invalid generation parameters.");
         if (params.noise.octaves <= 0 || params.noise.persistence <= 0 || params.noise.persistence >= 1 || params.noise.lacunarity < 1 || params.noise.scale <=0) throw new Error("Invalid noise parameters.");

        const grayscaleDataUrl = await generateMap(params);

        updateStatus("Loading generated heightmap (70%)...", false, true);
        const tempGrayscaleImage = new Image();
        await new Promise((resolve, reject) => { // Wait for grayscale image to load
            tempGrayscaleImage.onload = resolve;
            tempGrayscaleImage.onerror = () => reject(new Error("Failed to load generated grayscale map."));
            tempGrayscaleImage.src = grayscaleDataUrl;
        });

        updateStatus("Colorizing generated map (85%)...", false, true);
        const colorizedDataUrl = await colorizeLoadedMap(tempGrayscaleImage, 'image/png');

        updateStatus("Loading final map (95%)...", false, true);
        const finalMapImage = new Image();
        await new Promise((resolve, reject) => { // Wait for colorized image to load
             finalMapImage.onload = resolve;
             finalMapImage.onerror = () => reject(new Error("Failed to load final colorized map."));
             finalMapImage.src = colorizedDataUrl;
        });

        cfg.setMapImage(finalMapImage);
        cfg.setMapInfo({
            name: `Generated (${params.width}x${params.height} S${params.seed} F${params.numFaults})`,
            width: params.width, height: params.height,
            fileName: `generated_map_${Date.now()}.png`, fileType: "image/png"
        });
        cfg.setNations([]); cfg.setSelectedNationIndex(null); cfg.setDraggingNation(false);
        cfg.setIsPanning(false); cfg.setPotentialPan(false);
        if(cfg.nationIndexBeingEdited !== null) closeInlineEditor();

        setInitialCanvasSize(); resetView();
        updateStatus(`Map generated & colorized (${params.width}x${params.height}). Ready.`);
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
    }
}

// --- END OF FILE mapUtils.js ---