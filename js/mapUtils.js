// --- START OF FILE js/mapUtils.js ---
import * as cfg from './config.js';
import { updateStatus, showModal, updateNationList, updateInfoPanel, closeInlineEditor } from './domUtils.js';
import { redrawCanvas, resetView, setInitialCanvasSize } from './canvasUtils.js';

/**
 * Colorizes a loaded map image based on specific blue channel values,
 * similar to a reference PowerShell script, but made more robust.
 *
 * @param {HTMLImageElement} sourceImage - The fully loaded source image.
 * @param {string} imageType - The original MIME type (e.g., 'image/png').
 * @returns {Promise<string>} A Promise resolving with the Data URL of the colorized image.
 */
async function colorizeLoadedMap(sourceImage, imageType) {
    return new Promise((resolve, reject) => {
        if (!sourceImage || !sourceImage.complete || sourceImage.naturalWidth === 0) {
            return reject(new Error("Invalid source image provided for colorization."));
        }
        updateStatus("Colorizing map..."); // Update status

        const width = sourceImage.naturalWidth;
        const height = sourceImage.naturalHeight;

        // Use an offscreen canvas for processing if available, otherwise fallback to standard canvas
        const canvas = (typeof OffscreenCanvas === 'function')
            ? new OffscreenCanvas(width, height)
            : document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        // Request '2d' context with willReadFrequently hint for performance
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
            return reject(new Error("Could not get 2D context for colorization."));
        }

        try {
            // Draw the original image to the processing canvas
            ctx.drawImage(sourceImage, 0, 0);

            // Get pixel data
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data; // Uint8ClampedArray [R,G,B,A, R,G,B,A, ...]

            // --- Define Color Mapping Logic (based on blue channel, made robust) ---
            // Define target colors first
            const waterColor = { r: 0, g: 0, b: 106 };
            const plainsBaseColor = { r: 190, g: 220, b: 140 };
            const mountainsPeakColor = { r: 245, g: 245, b: 200 };

            // Loop through each pixel (4 elements at a time: R, G, B, A)
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const a = data[i + 3];

                let newR = r, newG = g, newB = b; // Default to original color initially

                // --- Apply Robust Color Logic based on Blue Channel ---

                // 1. Water: Check alpha first (transparent is water), then specific blue range
                //    Using a small range around 106 instead of exact match for robustness.
                if (a < 20 || (b >= 104 && b <= 108)) {
                    newR = waterColor.r; newG = waterColor.g; newB = waterColor.b;
                }
                // 2. Plains (Base): Blue <= 140 (and not water)
                else if (b <= 140) {
                    newR = plainsBaseColor.r; newG = plainsBaseColor.g; newB = plainsBaseColor.b;
                }
                // 3. Plains (Gradient): 140 < Blue <= 158
                else if (b <= 158) {
                    // Calculate magnitude based on how far blue is from the plains baseline (140)
                    // Use Math.max(0, ...) to prevent negative magnitude if b is exactly 140
                    const magnitude = Math.max(0, b - 140);
                    newR = plainsBaseColor.r; // Red stays the same as base plains
                    // Decrease Green based on magnitude, clamp at 0
                    newG = Math.max(0, plainsBaseColor.g - (magnitude)); // Adjusted formula (was *2)
                    newB = b; // Keep original blue for gradient effect
                }
                 // 4. Highlands (Gradient): 158 < Blue <= 178
                else if (b <= 178) {
                     const magnitude = Math.max(0, b - 140); // Still based on 140 baseline
                     // Increase Red and Green, clamp at 255
                     newR = Math.min(255, 190 + magnitude); // Adjusted base (was 200) and factor (was *2)
                     newG = Math.min(255, 180 + magnitude); // Adjusted base (was 183) and factor (was *2)
                     newB = b;
                 }
                // 5. Mountains (Gradient): 178 < Blue < 200 (exclusive upper bound)
                 else if (b < 200) {
                     const magnitude = Math.max(0, b - 140); // Still based on 140 baseline
                     // Increase R/G towards white/grey, clamp at 255
                     newR = Math.min(255, 210 + Math.floor(magnitude / 1.5)); // Adjusted base/factor
                     newG = Math.min(255, 210 + Math.floor(magnitude / 1.5)); // Adjusted base/factor
                     newB = b;
                 }
                 // 6. Mountains (Peak): Blue >= 200
                 else { // b >= 200
                     newR = mountainsPeakColor.r;
                     newG = mountainsPeakColor.g;
                     newB = mountainsPeakColor.b;
                 }

                // Update the imageData array (already clamped by Uint8ClampedArray)
                data[i] = newR;     // R
                data[i + 1] = newG; // G
                data[i + 2] = newB; // B
                data[i + 3] = 255;  // A (Force full opacity for all non-transparent areas)
            }

            // Put the modified data back onto the canvas
            ctx.putImageData(imageData, 0, 0);

            // Get the data URL of the colorized canvas
            // Use original imageType if valid, otherwise default to png
            const validImageType = imageType?.startsWith('image/') ? imageType : 'image/png';
            const dataUrl = canvas.toDataURL(validImageType);
            updateStatus("Map colorization complete.");
            resolve(dataUrl);

        } catch (error) {
            console.error("Error during map colorization:", error);
            updateStatus("Error during map colorization.", true);
            reject(error);
        }
    });
}

/** Handles loading, processing, and setting the map image */
export async function handleMapImageLoad(file) {
    if (!file) return;

    // Basic check for image MIME type
    if (!file.type.startsWith('image/')) {
        await showModal('alert', 'Invalid File Type', `Selected file (${file.name}) does not appear to be an image. Please select a valid image file (PNG, JPG, GIF, WEBP, etc.).`);
        updateStatus("Invalid map file type.", true);
        return; // Stop processing
    }

    updateStatus(`Loading map image: ${file.name}...`);
    const reader = new FileReader();

    reader.onload = async (e) => {
        if (!e.target?.result) {
             await showModal('alert', 'File Read Error', 'Could not read the selected image file.');
             updateStatus("Error reading map file.", true);
             return;
        }

        const tempImage = new Image();
        tempImage.onload = async () => {
            // Check for zero dimensions after load
            if (tempImage.naturalWidth === 0 || tempImage.naturalHeight === 0) {
                 await showModal('alert', 'Image Load Error', `The image file (${file.name}) loaded but has invalid dimensions (0x0).`);
                 updateStatus("Error: Map image has zero dimensions.", true);
                 return;
            }

            try {
                // Store original info before colorization
                const originalWidth = tempImage.naturalWidth;
                const originalHeight = tempImage.naturalHeight;
                const originalFileName = file.name;
                const originalFileType = file.type;
                // Generate a default map name from the filename
                const mapBaseName = originalFileName.split('.').slice(0, -1).join('.') || "Untitled Map";

                // --- COLORIZATION STEP ---
                const colorizedDataUrl = await colorizeLoadedMap(tempImage, originalFileType);

                // --- Create the final mapImage object for the colorized version ---
                const finalMapImage = new Image();
                finalMapImage.onload = () => {
                    // --- Update Global State ONLY AFTER colorized image is successfully loaded ---
                     cfg.setMapImage(finalMapImage);
                     cfg.setMapInfo({
                         name: mapBaseName, // Default name from file
                         width: originalWidth, // Use original dimensions for map data
                         height: originalHeight,
                         fileName: originalFileName, // Keep original filename for reference
                         fileType: originalFileType  // Keep original filetype for saving map later
                     });

                    // --- Reset editor state for the new map ---
                    cfg.setNations([]); // Clear existing nations
                    cfg.setSelectedNationIndex(null);
                    cfg.setDraggingNation(false);
                    cfg.setIsPanning(false);
                    cfg.setPotentialPan(false);
                    if(cfg.nationIndexBeingEdited !== null) closeInlineEditor(); // Ensure editor is closed

                    // Update canvas size and view AFTER map info is set
                    setInitialCanvasSize(); // Recalculate canvas size based on container
                    resetView(); // Reset zoom/pan to fit the new map

                    // --- Update UI element states ---
                    if(cfg.jsonLoadLabel) cfg.jsonLoadLabel.removeAttribute('data-disabled'); // Enable JSON load
                    if(cfg.saveButton) cfg.saveButton.disabled = false; // Enable Save
                    if(cfg.loadFlagsButton) cfg.loadFlagsButton.disabled = false; // Enable Load Flags
                    if(cfg.jsonLoadInput) cfg.jsonLoadInput.value = ''; // Clear file input selection

                    updateStatus(`Loaded & colorized map: ${originalFileName} (${originalWidth}x${originalHeight}). Ready.`);
                    updateNationList(); // Update list (will show empty)
                    updateInfoPanel(null); // Clear info panel
                    redrawCanvas(); // Explicitly redraw after resetView and state updates
                };
                finalMapImage.onerror = async () => {
                    // This error means the *colorized* data URL failed to load into an Image object
                    await showModal('alert', 'Internal Error', 'Failed to load the processed (colorized) map image data.');
                    updateStatus("Error loading colorized map data.", true);
                    // Reset state completely on critical error
                    cfg.setMapImage(null);
                    cfg.setMapInfo({ name: "Untitled Map", width: 0, height: 0, fileName: "", fileType: "image/png" });
                    if(cfg.jsonLoadLabel) cfg.jsonLoadLabel.setAttribute('data-disabled', 'true');
                    if(cfg.saveButton) cfg.saveButton.disabled = true;
                    if(cfg.loadFlagsButton) cfg.loadFlagsButton.disabled = true;
                    cfg.setNations([]);
                    resetView(); // Reset view to placeholder state
                    updateNationList();
                    updateInfoPanel(null);
                    redrawCanvas(); // Draw placeholder
                };
                // Set the source of the final image to the result of colorization
                finalMapImage.src = colorizedDataUrl;

            } catch (error) {
                // Catch errors specifically from the colorization process
                console.error("Error during map colorization process:", error);
                await showModal('alert', 'Map Processing Error', `Failed to process/colorize the map: ${error.message}`);
                updateStatus("Error processing map image.", true);
                // Reset state as the process failed
                cfg.setMapImage(null); // Ensure no partially loaded map is kept
                // ... (reset other states as in finalMapImage.onerror)
                 cfg.setMapInfo({ name: "Untitled Map", width: 0, height: 0, fileName: "", fileType: "image/png" });
                 if(cfg.jsonLoadLabel) cfg.jsonLoadLabel.setAttribute('data-disabled', 'true');
                 if(cfg.saveButton) cfg.saveButton.disabled = true;
                 if(cfg.loadFlagsButton) cfg.loadFlagsButton.disabled = true;
                 cfg.setNations([]);
                 resetView();
                 updateNationList();
                 updateInfoPanel(null);
                 redrawCanvas(); // Draw placeholder
            }
        };
        tempImage.onerror = async () => {
            // This error means the *original* selected file failed to load into an Image object
            await showModal('alert', 'Image Load Error', `Error loading the selected image file (${file.name}). It might be corrupted, invalid, or an unsupported format.`);
            updateStatus("Error loading initial map image.", true);
        };
        // Set the source of the temporary image to the file data read by FileReader
        tempImage.src = e.target.result.toString();
    };
    reader.onerror = async () => {
        await showModal('alert', 'File Read Error', 'An error occurred while trying to read the selected map file.');
        updateStatus("Error reading map file.", true);
    };
    // Start reading the selected file as a Data URL
    reader.readAsDataURL(file);
}


// --- END OF FILE js/mapUtils.js ---