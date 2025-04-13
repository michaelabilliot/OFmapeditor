// --- START OF FILE js/dataUtils.js ---
import * as cfg from './config.js';
import { updateStatus, showModal, updateNationList, updateInfoPanel, closeInlineEditor } from './domUtils.js';
import { redrawCanvas, resetView } from './canvasUtils.js';
import { generateFlagName } from './nationUtils.js'; // Need this helper

// --- Helper ---
function getBase64FromDataUrl(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:')) return null;
    return dataUrl.split(',')[1];
}

// --- Flag Handling ---
// processAndAssignFlag remains the same as the previous version (with resizing for display)
export async function processAndAssignFlag(file, nation) {
    const MAX_FLAG_DIMENSION = 150; // Define max width/height for pre-resized flags

    return new Promise((resolve, reject) => {
        if (!file || !nation) { return reject(new Error("Invalid arguments for processAndAssignFlag")); }
        // Basic type check (more robust check later)
        const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
        const isImage = file.type?.startsWith('image/');

        if (!isSvg && !isImage) {
            console.warn(`File ${file.name} has unsupported type: ${file.type}. Skipping.`);
            return reject(new Error(`Unsupported file type for ${file.name}: ${file.type || 'Unknown'}`));
        }

        const reader = new FileReader();
        const flagName = generateFlagName(nation.name); // Use imported helper

        reader.onload = (e) => {
            try {
                const originalFileData = e.target.result;
                nation.flag = flagName; // Assign the generated name
                nation.flagData = originalFileData; // Store ORIGINAL raw data (text for SVG, dataURL for others)
                nation.flagDataType = isSvg ? 'svg' : file.type.split('/')[1] || 'png'; // Store original type more specifically

                const originalFlagImage = new Image();

                originalFlagImage.onload = () => {
                    // Store original dimensions for saving purposes (or potentially using them if needed)
                    nation.flagWidth = originalFlagImage.naturalWidth;
                    nation.flagHeight = originalFlagImage.naturalHeight;

                    if (nation.flagWidth === 0 || nation.flagHeight === 0) {
                        console.warn(`Loaded flag for ${nation.name} but natural dimensions are zero. Check file: ${file.name}`);
                        // Skip resizing if dimensions are invalid, assign original directly
                        nation.flagImage = originalFlagImage;
                        return resolve({ status: 'loaded_zero_dims', filename: file.name, nationName: nation.name });
                    }

                    // --- Calculate Resized Dimensions ---
                    let resizeRatio = 1;
                    if (nation.flagWidth > MAX_FLAG_DIMENSION || nation.flagHeight > MAX_FLAG_DIMENSION) {
                        resizeRatio = Math.min(MAX_FLAG_DIMENSION / nation.flagWidth, MAX_FLAG_DIMENSION / nation.flagHeight);
                    }
                    const resizedWidth = Math.round(nation.flagWidth * resizeRatio);
                    const resizedHeight = Math.round(nation.flagHeight * resizeRatio);

                    // --- Resize using Offscreen Canvas ---
                    const offscreenCanvas = document.createElement('canvas');
                    offscreenCanvas.width = resizedWidth;
                    offscreenCanvas.height = resizedHeight;
                    const offscreenCtx = offscreenCanvas.getContext('2d');

                    // Draw original image scaled down onto the offscreen canvas
                    offscreenCtx.drawImage(originalFlagImage, 0, 0, resizedWidth, resizedHeight);

                    // Get data URL of the *resized* image
                    const resizedDataUrl = offscreenCanvas.toDataURL(); // Defaults to PNG

                    // --- Create Final Image Object for Resized Version ---
                    const finalResizedImage = new Image();
                    finalResizedImage.onload = () => {
                        // Assign the RESIZED image to be used for drawing
                        nation.flagImage = finalResizedImage;
                        console.log(`Flag processed & resized for ${nation.name}: ${flagName}.${nation.flagDataType} (Orig: ${nation.flagWidth}x${nation.flagHeight}, Drawn: ${resizedWidth}x${resizedHeight})`);
                        resolve({ status: 'loaded', filename: file.name, nationName: nation.name });
                    };
                    finalResizedImage.onerror = (err) => {
                         console.error(`Error loading RESIZED flag image into final Image object for: ${nation.name} from ${file.name}`, err);
                         // Fallback: Assign original image if resizing fails? Or reject? Let's reject.
                         nation.flagImage = null; // Clear potentially broken image ref
                         reject(new Error(`Failed to load resized flag image data for ${file.name}`));
                    };
                    finalResizedImage.src = resizedDataUrl;

                }; // End originalFlagImage.onload

                originalFlagImage.onerror = (err) => {
                    console.error(`Error loading ORIGINAL flag image into Image object for: ${nation.name} from ${file.name}`, err);
                    // Clear flag data on error
                    nation.flag = null; nation.flagData = null; nation.flagDataType = null; nation.flagImage = null; nation.flagWidth = null; nation.flagHeight = null;
                    reject(new Error(`Failed to load original flag image data for ${file.name}`));
                };

                // Set the source for the *original* Image object to trigger loading/resizing
                if (isSvg) {
                    // Need to Base64 encode the SVG text data for use in src
                    const svgBase64 = btoa(unescape(encodeURIComponent(originalFileData)));
                    originalFlagImage.src = `data:image/svg+xml;base64,${svgBase64}`;
                } else { // PNG, JPG, GIF, WEBP etc. read as DataURL
                    originalFlagImage.src = originalFileData;
                }

            } catch (loadError) {
                console.error(`Error processing file data for ${nation.name} (${file.name}):`, loadError);
                nation.flag = null; nation.flagData = null; nation.flagDataType = null; nation.flagImage = null; nation.flagWidth = null; nation.flagHeight = null;
                reject(new Error(`Processing error for ${file.name}: ${loadError.message}`));
            }
        }; // End reader.onload

        reader.onerror = (err) => {
            console.error(`Error reading file ${file.name}:`, err);
            reject(new Error(`File read error for ${file.name}`));
        };

        // Read based on type
        if (isSvg) {
            reader.readAsText(file); // Read SVG as text
        } else { // PNG, JPG, GIF, WEBP etc.
            reader.readAsDataURL(file); // Read as data URL
        }
    });
}


// loadFlagFiles remains the same as the previous version
export async function loadFlagFiles(files) {
    if (!files || files.length === 0) return;
    if (cfg.nations.length === 0) {
        await showModal('alert', 'Info', 'No nations loaded yet. Load JSON or add nations first.');
        return;
    }

    updateStatus('Loading flags...');
    let loadedCount = 0;
    let errorCount = 0;
    let skippedNoMatchCount = 0;
    let skippedTypeCount = 0;

    // Build a map of potential matches: lowercase JSON flag name -> nation, and lowercase generated name -> nation (if no flag set)
    const nationFlagMap = new Map();
    const nationGeneratedNameMap = new Map();
    let jsonSpecifiedFlags = false;

    cfg.nations.forEach(nation => {
        if (nation.flag) {
            nationFlagMap.set(nation.flag.toLowerCase(), nation);
            jsonSpecifiedFlags = true;
        } else {
            const generated = generateFlagName(nation.name).toLowerCase();
            if (generated) {
                nationGeneratedNameMap.set(generated, nation);
            }
        }
    });

    if (!jsonSpecifiedFlags && nationGeneratedNameMap.size === 0) {
        await showModal('alert', 'Info', 'No nations require flags (none specified in JSON, none generated).');
        updateStatus('No flags needed.');
        return;
    }

    const fileLoadPromises = Array.from(files).map(file => {
        return new Promise(async (resolve) => { // Use async here for await inside
            try {
                const fileNameNoExt = file.name.split('.').slice(0, -1).join('.');
                if (!fileNameNoExt) {
                     console.warn(`Skipping file with no base name: ${file.name}`);
                     skippedNoMatchCount++;
                     resolve({ status: 'skipped_noname', filename: file.name });
                     return;
                }
                const potentialMatchNameLower = fileNameNoExt.toLowerCase();

                let matchedNation = null;

                // Prioritize matching based on the 'flag' property from JSON
                if (nationFlagMap.has(potentialMatchNameLower)) {
                    matchedNation = nationFlagMap.get(potentialMatchNameLower);
                }
                // If no JSON match, try matching based on generated name (only if nation doesn't already have a flag from JSON)
                else if (nationGeneratedNameMap.has(potentialMatchNameLower)) {
                    matchedNation = nationGeneratedNameMap.get(potentialMatchNameLower);
                }

                // If still no match, skip
                if (!matchedNation) {
                    skippedNoMatchCount++;
                    resolve({ status: 'skipped_nomatch', filename: file.name });
                    return;
                }

                 // Check file type (more specific check happens in processAndAssignFlag)
                 const fileType = file.type;
                 const isSvg = fileType === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
                 const isImage = fileType?.startsWith('image/');

                 if (!isSvg && !isImage) {
                     console.warn(`Skipping file with unsupported type: ${file.name} (Type: ${fileType || 'unknown'})`);
                     skippedTypeCount++;
                     resolve({ status: 'skipped_type', filename: file.name });
                     return;
                 }

                // Process the matched flag (which now includes resizing)
                try {
                     const result = await processAndAssignFlag(file, matchedNation);
                     resolve(result);
                } catch (processingError) {
                     console.error(`Error processing flag file ${file.name} for ${matchedNation.name}:`, processingError);
                     errorCount++;
                     resolve({ status: 'error', filename: file.name, reason: processingError.message });
                }

            } catch (err) {
                console.error(`Unexpected error setting up processing for ${file.name}:`, err);
                errorCount++;
                resolve({ status: 'error', filename: file.name, reason: 'Setup failed' });
            }
        });
    });

    // Wait for all file processing attempts
    const results = await Promise.all(fileLoadPromises);

    let nationsSuccessfullyLoaded = new Set();
    results.forEach(result => {
        // status 'loaded' means success (even if dims were 0)
        if (result.status === 'loaded' || result.status === 'loaded_zero_dims') {
            loadedCount++;
            nationsSuccessfullyLoaded.add(result.nationName);
        }
    });

    let statusMsg = `Flag loading complete. Loaded: ${loadedCount}.`;
    let isError = false;
    if (errorCount > 0) { statusMsg += ` Errors: ${errorCount}.`; isError = true; }
    if (skippedNoMatchCount > 0) statusMsg += ` Skipped (no match): ${skippedNoMatchCount}.`;
    if (skippedTypeCount > 0) statusMsg += ` Skipped (bad type): ${skippedTypeCount}.`;

    // Check for missing flags specified in JSON
    if (jsonSpecifiedFlags) {
        let missingFromJson = [];
        for (const [flagName, nation] of nationFlagMap.entries()) {
            if (!nation.flagImage) {
                 missingFromJson.push(nation.name);
            }
        }
         if (missingFromJson.length > 0) {
             statusMsg += ` Missing/failed for JSON nations: ${missingFromJson.join(', ')}.`;
         }
    }

    updateStatus(statusMsg, isError);
    if (isError || skippedNoMatchCount > 0 || skippedTypeCount > 0) {
        console.warn("Flag loading status:", statusMsg, "Check console for details.");
    }
    redrawCanvas();
    updateInfoPanel(cfg.selectedNationIndex);
    updateNationList();
}

// promptAndLoadFlags remains the same
export function promptAndLoadFlags() {
    if (cfg.isPanningAnimationActive) return;
    if (!cfg.mapImage) {
        showModal('alert', 'Error', 'Load a map image first.');
        return;
    }
    if (cfg.nations.length === 0) {
         showModal('alert', 'Info', 'Add nations or load JSON before loading flags.');
         return;
    }
    const flagInput = document.createElement('input');
    flagInput.type = 'file';
    flagInput.multiple = true;
    flagInput.accept = 'image/png, image/jpeg, image/gif, image/webp, image/svg+xml';
    flagInput.style.display = 'none';
    flagInput.addEventListener('change', (event) => {
        loadFlagFiles(event.target.files);
        document.body.removeChild(flagInput);
    });
    document.body.appendChild(flagInput);
    flagInput.click();
}

// handleJsonLoad remains the same
export async function handleJsonLoad(file) {
    if (!file) return;
    if (!cfg.mapImage) {
        await showModal('alert', 'Error', 'Load map image BEFORE loading JSON.');
        return;
    }
    if (!cfg.mapInfo || cfg.mapInfo.width === 0 || cfg.mapInfo.height === 0) {
        await showModal('alert', 'Error', 'Map dimensions not loaded correctly. Reload map image.');
        return;
    }

    updateStatus(`Loading JSON: ${file.name}...`);
    const reader = new FileReader();

    reader.onload = async (e) => {
        let needsScaling = false;
        let scaleX = 1.0;
        let scaleY = 1.0;
        let jsonWidth = 0;
        let jsonHeight = 0;
        let statusMessage = "";
        let loadedMapName = cfg.mapInfo.name;

        try {
            const loadedData = JSON.parse(e.target.result);

            if (typeof loadedData !== 'object' || loadedData === null) throw new Error("Invalid JSON: Not an object.");
            if (!loadedData.width || !loadedData.height || typeof loadedData.width !== 'number' || typeof loadedData.height !== 'number') throw new Error("Invalid JSON: Missing or invalid numeric 'width'/'height'.");
            if (!Array.isArray(loadedData.nations)) throw new Error("Invalid JSON: Missing or invalid 'nations' array.");

            jsonWidth = loadedData.width;
            jsonHeight = loadedData.height;
            loadedMapName = loadedData.name || loadedMapName;

            if (jsonWidth !== cfg.mapInfo.width || jsonHeight !== cfg.mapInfo.height) {
                const confirmMsg = `JSON dimensions (${jsonWidth}x${jsonHeight}) differ from current map (${cfg.mapInfo.width}x${cfg.mapInfo.height}).\n\nScale coordinates to fit current map? (Choosing Cancel will abort loading)`;
                const confirmScale = await showModal('confirm', 'Dimension Mismatch', confirmMsg, { confirmText: 'Scale', denyText: 'Cancel Load' });

                if (!confirmScale) {
                    throw new Error(`Load cancelled due to dimension mismatch.`);
                }
                needsScaling = true;
                scaleX = cfg.mapInfo.width / jsonWidth;
                scaleY = cfg.mapInfo.height / jsonHeight;
                console.log(`Scaling coordinates: X factor=${scaleX.toFixed(4)}, Y factor=${scaleY.toFixed(4)}`);
            }

            const validatedNations = [];
            let boundsWarnings = 0;
            for (const [index, nation] of loadedData.nations.entries()) {
                if (typeof nation !== 'object' || nation === null) throw new Error(`Invalid nation data at index ${index}: Not an object.`);
                if (!Array.isArray(nation.coordinates) || nation.coordinates.length !== 2 || typeof nation.coordinates[0] !== 'number' || typeof nation.coordinates[1] !== 'number') throw new Error(`Invalid nation coords at index ${index} (name: ${nation.name || '[Unnamed]'}).`);
                if (typeof nation.name !== 'string' || nation.name.trim() === '') throw new Error(`Invalid or empty nation name at index ${index}.`);
                if (typeof nation.strength !== 'number' || !Number.isInteger(nation.strength)) throw new Error(`Invalid strength (must be integer) at index ${index} (name: ${nation.name}).`);
                if (nation.hasOwnProperty('flag') && nation.flag !== null && typeof nation.flag !== 'string') throw new Error(`Invalid 'flag' property type (must be string or null) at index ${index} (name: ${nation.name}).`);

                const [origX, origY] = nation.coordinates;
                let finalX = origX;
                let finalY = origY;

                if (needsScaling) {
                    finalX = Math.round(origX * scaleX);
                    finalY = Math.round(origY * scaleY);
                }

                 if (origX < 0 || origX > jsonWidth || origY < 0 || origY > jsonHeight) {
                      console.warn(`Nation '${nation.name}' (index ${index}) original coords [${origX}, ${origY}] outside JSON bounds (${jsonWidth}x${jsonHeight}).`);
                     boundsWarnings++;
                 }
                 if (finalX < 0 || finalX > cfg.mapInfo.width || finalY < 0 || finalY > cfg.mapInfo.height) {
                     console.warn(`Nation '${nation.name}' (index ${index}) ${needsScaling ? 'scaled' : ''} coords [${finalX}, ${finalY}] are outside current map bounds (${cfg.mapInfo.width}x${cfg.mapInfo.height}).`);
                     boundsWarnings++;
                 }

                validatedNations.push({
                    coordinates: [finalX, finalY],
                    name: nation.name.trim(),
                    strength: nation.strength,
                    flag: nation.flag || null,
                    flagImage: null, flagData: null, flagDataType: null, flagWidth: null, flagHeight: null
                });
            }

            cfg.setNations(validatedNations);
            if (loadedData.name) {
                 cfg.setMapInfo({...cfg.mapInfo, name: loadedMapName });
            }
            cfg.setSelectedNationIndex(null); cfg.setDraggingNation(false); cfg.setIsPanning(false); cfg.setPotentialPan(false);
            closeInlineEditor();

            statusMessage = needsScaling ? `Loaded and scaled ${validatedNations.length} nations from ${file.name}. Map name: "${loadedMapName}".` : `Loaded ${validatedNations.length} nations from ${file.name}. Map name: "${loadedMapName}".`;
            if (boundsWarnings > 0) statusMessage += ` (${boundsWarnings} bounds warnings - see console)`;
            updateStatus(statusMessage);

            resetView(); updateNationList(); updateInfoPanel(null);

            const hasFlagsInJson = validatedNations.some(n => n.flag);
            if (hasFlagsInJson) {
                const loadFlagsNow = await showModal('confirm', 'Flags Found', 'The loaded JSON references nation flags.\nWould you like to select the corresponding flag image files (PNG/SVG etc.) now?', { confirmText: 'Select Files', denyText: 'Later' });
                if (loadFlagsNow) promptAndLoadFlags();
                else updateStatus(statusMessage + " Use 'Load Flags' button later if needed.");
            }

        } catch (error) {
            console.error("Error loading/parsing/validating JSON:", error);
            await showModal('alert', 'JSON Load Error', `Failed to load JSON: ${error.message}`);
            updateStatus(`Error loading JSON: ${error.message}`, true);
        }
    };

    reader.onerror = async () => {
        await showModal('alert', 'Error', 'Error reading JSON file.');
        updateStatus("Error reading JSON file.", true);
    };

    reader.readAsText(file);
}


// --- ZIP Saving ---
export async function saveProjectAsZip() {
    // Check if JSZip is loaded
    if (typeof JSZip === 'undefined') {
        await showModal('alert', 'Error', 'JSZip library not loaded. Cannot save.');
        updateStatus('Error: JSZip library not loaded.', true);
        return;
    }
    // Check for map image
    if (!cfg.mapImage || !cfg.mapInfo.fileName) {
        await showModal('alert', 'Error', 'Load and process a map image before saving.');
        return;
    }
    if (!cfg.mapInfo.width || !cfg.mapInfo.height) {
         await showModal('alert', 'Error', 'Map dimensions missing. Cannot save.');
         return;
    }
    // Warn if no nations
    if (cfg.nations.length === 0) {
        const confirmEmpty = await showModal('confirm', 'Warning', 'No nations have been added to the map.\nSave project with empty nation list?', { confirmText: 'Save Empty', denyText: 'Cancel' });
        if (!confirmEmpty) return;
    }

    // Get project/zip names
    const defaultProjectName = cfg.mapInfo.name !== "Untitled Map" ? cfg.mapInfo.name : (cfg.mapInfo.fileName ? cfg.mapInfo.fileName.split('.').slice(0, -1).join('.') : 'MyMap');
    const projectName = await showModal('prompt', 'Save Project', 'Enter project name (used for map image/json filenames inside ZIP):', { defaultValue: defaultProjectName });
    if (projectName === null) return;
    const safeProjectName = projectName.trim().replace(/[^a-z0-9_-]/gi, '_') || 'map_project';
    const defaultZipFileName = `${safeProjectName}.zip`;
    const outputZipFilename = await showModal('prompt', 'Save Project', 'Enter filename for the ZIP file:', { defaultValue: defaultZipFileName });
    if (outputZipFilename === null) return;

    updateStatus('Generating ZIP file...');

    try {
        const zip = new JSZip();
        const resourcesFolder = zip.folder("resources");
        const mapsFolder = resourcesFolder.folder("maps");
        const flagsFolder = resourcesFolder.folder("flags");

        // --- Prepare JSON Data (unchanged) ---
        const mapData = {
            name: safeProjectName, width: cfg.mapInfo.width, height: cfg.mapInfo.height,
            nations: cfg.nations.map(n => {
                const nationData = { coordinates: [Math.round(n.coordinates[0]), Math.round(n.coordinates[1])], name: n.name, strength: n.strength };
                if (n.flag) nationData.flag = n.flag;
                return nationData;
            })
        };
        let jsonString = JSON.stringify(mapData, null, 2);
        const coordRegex = /"coordinates": \[\s*(-?\d+),\s*(-?\d+)\s*\]/g;
        let finalJsonString = jsonString.replace(coordRegex, (match, p1, p2) => `"coordinates": [${p1},${p2}]`);
        mapsFolder.file(`${safeProjectName}.json`, finalJsonString);

        // --- Add Map Image (unchanged) ---
        const mapImageBase64 = getBase64FromDataUrl(cfg.mapImage.src);
        if (mapImageBase64) {
             const extension = cfg.mapInfo.fileType.startsWith('image/') ? cfg.mapInfo.fileType.split('/')[1] || 'png' : 'png';
            mapsFolder.file(`${safeProjectName}.${extension}`, mapImageBase64, { base64: true });
        } else {
            console.warn("Could not get Base64 data for map image. Map image will be missing from ZIP.");
            await showModal('alert', 'Warning', 'Could not save the map image data. It will be missing from the ZIP.');
        }

        // --- ***MODIFIED*** Add Flags (Save RESIZED representation as SVG) ---
        let flagsAddedCount = 0;
        const flagPromises = cfg.nations.map(async (nation) => {
            // Only save if flag name AND the RESIZED flagImage are present and loaded
            if (nation.flag && nation.flagImage && nation.flagImage.complete && nation.flagImage.naturalWidth > 0) {
                const flagFileName = `${nation.flag}.svg`; // Always save as .svg

                try {
                    // Get the resized dimensions and the data URL from the nation.flagImage
                    const resizedWidth = nation.flagImage.naturalWidth;
                    const resizedHeight = nation.flagImage.naturalHeight;
                    const resizedDataUrl = nation.flagImage.src; // This should be the data URL generated during resizing

                    if (resizedDataUrl && resizedDataUrl.startsWith('data:image')) {
                         // Create an SVG wrapper containing an <image> tag pointing to the resized data URL
                        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${resizedWidth}" height="${resizedHeight}" viewBox="0 0 ${resizedWidth} ${resizedHeight}">\n  <image xlink:href="${resizedDataUrl}" width="${resizedWidth}" height="${resizedHeight}" />\n</svg>`;
                        flagsFolder.file(flagFileName, svgContent);
                        flagsAddedCount++;
                    } else {
                        console.warn(`Could not save resized flag for '${nation.name}': Invalid resized data URL found.`);
                    }
                } catch(svgError) {
                     console.warn(`Error creating SVG wrapper for resized flag '${nation.name}':`, svgError);
                }

            } else if (nation.flag) {
                 // Log if flag was specified but resized image isn't ready/valid
                 console.warn(`Could not save flag for '${nation.name}': Resized image data not available or invalid.`);
            }
        });

        await Promise.all(flagPromises);
        console.log(`Added ${flagsAddedCount} flags to ZIP (as .svg, using resized representation).`);

        // --- Generate and Download ZIP (unchanged) ---
        const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        const finalZipFilename = outputZipFilename.endsWith('.zip') ? outputZipFilename : outputZipFilename + '.zip';
        a.download = finalZipFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        updateStatus(`Project saved as '${finalZipFilename}'`);

    } catch (error) {
        console.error("Error creating ZIP file:", error);
        await showModal('alert', 'ZIP Error', `Error creating ZIP file: ${error.message}`);
        updateStatus(`Error creating ZIP: ${error.message}`, true);
    }
}
// --- END OF FILE js/dataUtils.js ---