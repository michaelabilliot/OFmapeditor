// --- START OF FILE js/mapUtils.js ---
import * as cfg from './config.js';
import { updateStatus, showModal, updateNationList, updateInfoPanel, closeInlineEditor } from './domUtils.js';
import { redrawCanvas, resetView, setInitialCanvasSize } from './canvasUtils.js';

async function colorizeLoadedMap(sourceImage, imageType) {
    // ... (Keep the exact colorizeLoadedMap function from the original script)
    return new Promise((resolve, reject) => {
        if (!sourceImage || !sourceImage.complete || sourceImage.naturalWidth === 0) {
            return reject(new Error("Invalid source image for colorization."));
        }
        updateStatus("Colorizing map..."); // Update status

        const offscreenCanvas = document.createElement('canvas');
        const offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true }); // Hint for performance
        const width = sourceImage.naturalWidth;
        const height = sourceImage.naturalHeight;
        offscreenCanvas.width = width;
        offscreenCanvas.height = height;

        try {
            // Draw the original image to the offscreen canvas
            offscreenCtx.drawImage(sourceImage, 0, 0);

            // Get pixel data
            const imageData = offscreenCtx.getImageData(0, 0, width, height);
            const data = imageData.data; // Array of [R,G,B,A, R,G,B,A, ...]

            // Loop through each pixel (4 elements at a time)
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const a = data[i + 3];

                let newR = r, newG = g, newB = b; // Default to original color

                // --- Apply PowerShell Color Logic ---
                if (b === 106 || a < 20) { // Water
                    newR = 0; newG = 0; newB = 106;
                } else if (b <= 140) { // Plains (Base) - Excludes water already checked
                    newR = 190; newG = 220; newB = 140;
                } else if (b <= 158) { // Plains (Gradient)
                    let evenB = (b % 2 !== 0) ? b + 1 : b; // Make blue even
                     if (evenB > 158) evenB = 158; // Clamp if incrementing pushed it over
                    const magnitude = (evenB - 140) / 2;
                    newR = 190;
                    newG = Math.max(0, 220 - (magnitude * 2)); // Clamp Green at 0
                    newB = evenB;
                } else if (b <= 178) { // Highlands (Gradient)
                    let evenB = (b % 2 !== 0) ? b + 1 : b;
                    if (evenB > 178) evenB = 178;
                    const magnitude = (evenB - 140) / 2; // Still based on 140 baseline
                    newR = Math.min(255, 200 + (magnitude * 2)); // Clamp Red at 255
                    newG = Math.min(255, 183 + (magnitude * 2)); // Clamp Green at 255
                    newB = evenB;
                } else if (b <= 199) { // Mountains (Gradient)
                    let evenB = (b % 2 !== 0) ? b + 1 : b;
                     // Clamp below 200 (exclusive boundary with Peaks)
                    if (evenB >= 200) evenB = 198; // Clamp to 198 if it reaches or exceeds 200
                    const magnitude = (evenB - 140) / 2;
                    newR = Math.min(255, 230 + Math.floor(magnitude / 2)); // Use floor for int result
                    newG = Math.min(255, 230 + Math.floor(magnitude / 2));
                    newB = evenB;
                 } else { // Mountains (Peak) b >= 200
                     newR = 245;
                     newG = 245;
                     newB = 200;
                 }

                // Update the imageData array
                data[i] = Math.round(newR);     // R
                data[i + 1] = Math.round(newG); // G
                data[i + 2] = Math.round(newB); // B
                data[i + 3] = 255;           // A (Force full opacity)
            }

            // Put the modified data back onto the offscreen canvas
            offscreenCtx.putImageData(imageData, 0, 0);

            // Get the data URL of the colorized canvas
            const dataUrl = offscreenCanvas.toDataURL(imageType || 'image/png'); // Use original type or default to png
            updateStatus("Map colorization complete.");
            resolve(dataUrl);

        } catch (error) {
            console.error("Error during map colorization:", error);
            updateStatus("Error during map colorization.", true);
            reject(error);
        }
    });
}

export async function handleMapImageLoad(file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        await showModal('alert', 'Invalid File', 'Please select a valid image file.');
        updateStatus("Invalid map file type.", true);
        return; // Stop processing
    }

    updateStatus("Loading map image...");
    const reader = new FileReader();

    reader.onload = async (e) => {
        const tempImage = new Image();
        tempImage.onload = async () => {
            try {
                // Store original info before colorization
                const originalWidth = tempImage.naturalWidth;
                const originalHeight = tempImage.naturalHeight;
                const originalFileName = file.name;
                const originalFileType = file.type;
                const mapBaseName = originalFileName.split('.').slice(0, -1).join('.') || "Untitled Map";

                // --- COLORIZATION STEP ---
                const colorizedDataUrl = await colorizeLoadedMap(tempImage, originalFileType);

                // Create the final mapImage object for the colorized version
                const finalMapImage = new Image();
                finalMapImage.onload = () => {
                    // --- Update Global State AFTER colorized image is loaded ---
                     cfg.setMapImage(finalMapImage);
                     cfg.setMapInfo({
                         name: mapBaseName,
                         width: originalWidth, // Use original dimensions
                         height: originalHeight,
                         fileName: originalFileName, // Keep original filename for reference if needed
                         fileType: originalFileType  // Keep original filetype
                     });

                    // Reset editor state for the new map
                    cfg.setNations([]);
                    cfg.setSelectedNationIndex(null);
                    cfg.setDraggingNation(false);
                    cfg.setIsPanning(false);
                    cfg.setPotentialPan(false);
                    closeInlineEditor(); // closeInlineEditor needs import

                    // Resize canvas *after* map info is known
                    setInitialCanvasSize(); // Resize before resetView
                    resetView(); // Reset view to fit the new map

                    // Update UI elements
                    if(cfg.jsonLoadLabel) cfg.jsonLoadLabel.removeAttribute('data-disabled');
                    if(cfg.saveButton) cfg.saveButton.disabled = false;
                    if(cfg.loadFlagsButton) cfg.loadFlagsButton.disabled = false;
                    if(cfg.jsonLoadInput) cfg.jsonLoadInput.value = ''; // Clear file input

                    updateStatus(`Loaded and colorized map: ${originalFileName} (${originalWidth}x${originalHeight}).`);
                    updateNationList();
                    updateInfoPanel(null);
                };
                finalMapImage.onerror = async () => {
                    await showModal('alert', 'Error', 'Failed to load the colorized map image data.');
                    updateStatus("Error loading colorized map.", true);
                    // Reset state completely on error
                    cfg.setMapImage(null);
                    cfg.setMapInfo({ name: "Untitled Map", width: 0, height: 0, fileName: "", fileType: "image/png" });
                    if(cfg.jsonLoadLabel) cfg.jsonLoadLabel.setAttribute('data-disabled', 'true');
                    if(cfg.saveButton) cfg.saveButton.disabled = true;
                    if(cfg.loadFlagsButton) cfg.loadFlagsButton.disabled = true;
                    cfg.setNations([]);
                    resetView();
                    updateNationList();
                    updateInfoPanel(null);
                };
                finalMapImage.src = colorizedDataUrl; // Trigger load of colorized image

            } catch (error) {
                console.error("Error during map loading/colorization process:", error);
                await showModal('alert', 'Processing Error', `Failed to load or colorize map: ${error.message}`);
                updateStatus("Error processing map.", true);
                // Reset state on error
                cfg.setMapImage(null);
                cfg.setMapInfo({ name: "Untitled Map", width: 0, height: 0, fileName: "", fileType: "image/png" });
                 if(cfg.jsonLoadLabel) cfg.jsonLoadLabel.setAttribute('data-disabled', 'true');
                 if(cfg.saveButton) cfg.saveButton.disabled = true;
                 if(cfg.loadFlagsButton) cfg.loadFlagsButton.disabled = true;
                cfg.setNations([]);
                resetView();
                updateNationList();
                updateInfoPanel(null);
            }
        };
        tempImage.onerror = async () => {
            await showModal('alert', 'Error', 'Error loading the selected image file. It might be corrupted or invalid.');
            updateStatus("Error loading initial map image.", true);
        };
        tempImage.src = e.target.result; // Load the original selected file data into temp image
    };
    reader.onerror = async () => {
        await showModal('alert', 'Error', 'Error reading the selected map file.');
        updateStatus("Error reading map file.", true);
    };
    reader.readAsDataURL(file); // Start reading the original file
}


// --- END OF FILE js/mapUtils.js ---