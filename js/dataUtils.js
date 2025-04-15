import * as cfg from './config.js';
import { updateStatus, showModal, updateNationList, updateInfoPanel, closeInlineEditor } from './domUtils.js';
import { redrawCanvas, resetView } from './canvasUtils.js';
import { generateFlagName } from './nationUtils.js'; // Need this helper
// Import standardizeFlag and the necessary svgStringToDataURL helper
import { standardizeFlag, svgStringToDataURL } from './flagEditor.js';

// --- Helper ---
function getBase64FromDataUrl(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:')) return null;
    // Handles different media types and potential parameters (like ;base64)
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex === -1) return null;
    return dataUrl.substring(commaIndex + 1);
}


// --- Flag Handling ---
/**
 * Processes a flag file (SVG or raster), creating a standardized bitmap version
 * for efficient canvas drawing, while storing the original data for saving/editing.
 * Handles resizing and stores metadata.
 *
 * @param {File} file - The flag file object.
 * @param {object} nation - The nation object to assign the flag to.
 * @returns {Promise<object>} Promise resolving with status info.
 */
export async function processAndAssignFlag(file, nation) {
    return new Promise((resolve, reject) => {
        if (!file || !nation) { return reject(new Error("Invalid arguments for processAndAssignFlag")); }

        // Determine file type more robustly
        const fileExt = file.name.split('.').pop()?.toLowerCase();
        let fileMimeType = file.type;
        let isSvg = fileMimeType === 'image/svg+xml' || (!fileMimeType && fileExt === 'svg');
        let isRasterImage = fileMimeType?.startsWith('image/') && !isSvg;

        // If MIME type unknown, infer common raster types from extension
        if (!fileMimeType && !isSvg && ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExt)) {
             isRasterImage = true;
             if (fileExt === 'jpg') fileMimeType = 'image/jpeg';
             else fileMimeType = `image/${fileExt}`;
        }

        if (!isSvg && !isRasterImage) {
            console.warn(`File ${file.name} has unsupported type: ${fileMimeType || fileExt || 'Unknown'}. Skipping.`);
            return reject(new Error(`Unsupported file type for ${file.name}: ${fileMimeType || 'Unknown'}`));
        }

        const reader = new FileReader();
        const flagName = generateFlagName(nation.name); // Use imported helper

        reader.onload = (e) => {
            try {
                const originalFileData = e.target.result; // DataURL for raster, text for SVG
                if (!originalFileData) {
                     throw new Error("FileReader failed to read file data.");
                }

                // --- 1. Store essential original data ---
                nation.flag = flagName; // Assign the generated name (used for saving/reference)
                nation.flagData = originalFileData; // Store ORIGINAL raw data
                nation.flagDataType = isSvg ? 'svg' : (fileMimeType?.split('/')[1] || fileExt || 'png'); // Store original type ('png', 'jpeg', 'svg', etc.)

                // --- 2. Create an Image object from the original data to get dimensions ---
                const originalFlagImage = new Image();

                originalFlagImage.onload = async () => { // Make this handler async
                    // Store original dimensions (crucial for saving and standardization)
                    nation.flagWidth = originalFlagImage.naturalWidth;
                    nation.flagHeight = originalFlagImage.naturalHeight;

                    if (nation.flagWidth === 0 || nation.flagHeight === 0) {
                        console.warn(`Loaded flag for ${nation.name} but natural dimensions are zero. Check file: ${file.name}`);
                        // Cannot standardize or use effectively, clear drawing image but keep original data
                        nation.flagImage = null;
                        return resolve({ status: 'loaded_zero_dims', filename: file.name, nationName: nation.name });
                    }

                    // --- 3. Perform Automatic Standardization using FlagEditor logic ---
                    try {
                        const defaultOptions = {
                            preprocessMode: 'default', // Default transparency crop
                            finalScaleMode: 'warp',    // Default stretch/squash
                            finalWidth: 160,           // Default dimensions
                            finalHeight: 100,
                            frameThickness: 5,         // Default frame
                            fixedCornerRadius: 8       // Default rounding
                        };
                        // Call the exported standardization function
                        const standardizedDataUrl = await standardizeFlag(
                            nation.flagData,       // Pass the original data
                            nation.flagDataType,   // Pass the original type
                            nation.flagWidth,      // Pass original dimensions
                            nation.flagHeight,
                            defaultOptions         // Use default settings
                        );

                        // --- 4. Load standardized result into the final Image object for display ---
                        const finalStandardizedImage = new Image();
                        finalStandardizedImage.onload = () => {
                            // Assign the STANDARDIZED image to be used for drawing
                            nation.flagImage = finalStandardizedImage;
                            console.log(`Flag automatically standardized for drawing: ${nation.name} (${flagName}.${nation.flagDataType}) | Original: ${nation.flagWidth}x${nation.flagHeight}`);
                            // Resolve the main promise once the standardized image is loaded
                            resolve({ status: 'loaded_standardized', filename: file.name, nationName: nation.name });
                        };
                        finalStandardizedImage.onerror = (err) => {
                             console.error(`Error loading STANDARDIZED flag bitmap into final Image object for: ${nation.name} from ${file.name}`, err);
                             nation.flagImage = null; // Clear potentially broken image ref
                             reject(new Error(`Failed to load standardized flag bitmap data for ${file.name}`));
                        };
                        finalStandardizedImage.src = standardizedDataUrl; // Trigger loading

                    } catch (standardizationError) {
                        console.error(`Automatic flag standardization failed for ${nation.name} (${file.name}):`, standardizationError);
                        // Standardization failed, clear the display image but keep original data
                        nation.flagImage = null;
                        // Reject the promise as processing failed
                        reject(new Error(`Standardization failed for ${file.name}: ${standardizationError.message}`));
                    }
                }; // End originalFlagImage.onload (async)

                originalFlagImage.onerror = (err) => {
                    console.error(`Error loading ORIGINAL flag image into Image object for: ${nation.name} from ${file.name}`, err);
                    // Clear all flag data on initial load error, as we can't proceed
                    nation.flag = null; nation.flagData = null; nation.flagDataType = null; nation.flagImage = null; nation.flagWidth = null; nation.flagHeight = null;
                    reject(new Error(`Failed to load original flag image data for ${file.name}`));
                };

                // --- Set the source for the *original* Image object to trigger loading ---
                if (isSvg) {
                    try {
                        const svgDataUrl = svgStringToDataURL(originalFileData); // Use imported function
                        if (!svgDataUrl) throw new Error("Generated SVG Data URL is null.");
                        originalFlagImage.src = svgDataUrl;
                    } catch(svgError) {
                         console.error(`Error preparing SVG for initial load ${nation.name}:`, svgError);
                         reject(new Error(`Failed to prepare SVG data for ${file.name}: ${svgError.message}`));
                    }
                } else { // PNG, JPG, GIF, WEBP etc. (already read as DataURL)
                    originalFlagImage.src = originalFileData;
                }

            } catch (loadError) {
                console.error(`Error processing file data for ${nation.name} (${file.name}):`, loadError);
                 // Clear all flag data on processing error
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
            reader.readAsDataURL(file); // Read raster images as data URL
        }
    });
}


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
    let nationsSuccessfullyLoaded = new Set(); // Track nations getting a flag loaded

    // Build maps for efficient lookup
    const nationFlagMap = new Map(); // Stores nation based on 'flag' property from JSON
    const nationGeneratedNameMap = new Map(); // Stores nation based on generated name if 'flag' is null/missing
    let jsonSpecifiedFlags = false; // Did the JSON contain any 'flag' properties?

    cfg.nations.forEach(nation => {
        if (nation.flag && typeof nation.flag === 'string') {
            nationFlagMap.set(nation.flag.toLowerCase(), nation);
            jsonSpecifiedFlags = true;
        }
        // Always add to generated name map, allowing files matching generated name to load even if JSON had a specific name
        const generated = generateFlagName(nation.name).toLowerCase();
        if (generated) {
            nationGeneratedNameMap.set(generated, nation);
        }
    });

    if (!jsonSpecifiedFlags && nationGeneratedNameMap.size === 0) {
        await showModal('alert', 'Info', 'No nations require flags (none specified in JSON, none could be generated).');
        updateStatus('No flags needed.');
        return;
    }

    // Process each file concurrently
    const fileLoadPromises = Array.from(files).map(file => {
        return (async () => { // Use an async IIFE to handle awaits within the map
            try {
                const fileNameNoExt = file.name.split('.').slice(0, -1).join('.');
                if (!fileNameNoExt) {
                     console.warn(`Skipping file with no base name: ${file.name}`);
                     return { status: 'skipped_noname', filename: file.name };
                }
                const potentialMatchNameLower = fileNameNoExt.toLowerCase();

                let matchedNation = null;

                // Prioritize matching the specific 'flag' name from JSON if it exists
                if (nationFlagMap.has(potentialMatchNameLower)) {
                    matchedNation = nationFlagMap.get(potentialMatchNameLower);
                } else if (nationGeneratedNameMap.has(potentialMatchNameLower)) {
                    // Fallback to matching the generated name
                    matchedNation = nationGeneratedNameMap.get(potentialMatchNameLower);
                     if (matchedNation.flag && matchedNation.flag.toLowerCase() !== potentialMatchNameLower) {
                         console.log(`Flag file '${file.name}' matches generated name for '${matchedNation.name}', but JSON specified '${matchedNation.flag}'. Using this file anyway.`);
                     }
                }

                if (!matchedNation) {
                    // Only count as skipped if it didn't match either map
                    if (!nationFlagMap.has(potentialMatchNameLower) && !nationGeneratedNameMap.has(potentialMatchNameLower)) {
                        skippedNoMatchCount++;
                    }
                    return { status: 'skipped_nomatch', filename: file.name };
                }

                 // Basic type check before calling processAndAssignFlag
                 const fileExt = file.name.split('.').pop()?.toLowerCase();
                 const fileMimeType = file.type;
                 const isSvg = fileMimeType === 'image/svg+xml' || (!fileMimeType && fileExt === 'svg');
                 let isRasterImage = fileMimeType?.startsWith('image/') && !isSvg;
                 if (!fileMimeType && !isSvg && ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExt)) {
                     isRasterImage = true;
                 }

                 if (!isSvg && !isRasterImage) {
                     console.warn(`Skipping file with unsupported type: ${file.name} (Type: ${fileMimeType || fileExt || 'unknown'})`);
                     skippedTypeCount++;
                     return { status: 'skipped_type', filename: file.name };
                 }

                 // Attempt to process the flag
                 try {
                     const result = await processAndAssignFlag(file, matchedNation);
                      // Track success based on new status
                     if (result.status === 'loaded_standardized' || result.status === 'loaded_zero_dims') {
                         nationsSuccessfullyLoaded.add(matchedNation.name);
                     }
                     return result;
                 } catch (processingError) {
                     console.error(`Error processing flag file ${file.name} for ${matchedNation.name}:`, processingError);
                     errorCount++;
                     return { status: 'error', filename: file.name, nationName: matchedNation.name, reason: processingError.message };
                 }

            } catch (err) {
                // Catch unexpected errors during the setup for a single file
                console.error(`Unexpected error setting up processing for ${file.name}:`, err);
                errorCount++;
                return { status: 'error', filename: file.name, reason: 'Setup failed' };
            }
        })(); // Immediately invoke the async function
    });

    // Wait for all file processing attempts to complete
    const results = await Promise.all(fileLoadPromises);

    // Aggregate results (already tracked within the loop now)
    loadedCount = nationsSuccessfullyLoaded.size;

    // --- Generate Status Message ---
    let statusParts = [`Flag loading complete. Loaded: ${loadedCount}.`];
    let isError = false;
    if (errorCount > 0) { statusParts.push(`Errors: ${errorCount}.`); isError = true; }
    if (skippedNoMatchCount > 0) statusParts.push(`Skipped (no match): ${skippedNoMatchCount}.`);
    if (skippedTypeCount > 0) statusParts.push(`Skipped (bad type): ${skippedTypeCount}.`);

    // Check for missing flags specified in JSON
    if (jsonSpecifiedFlags) {
        let missingFromJson = [];
        for (const [flagName, nation] of nationFlagMap.entries()) {
            // Check if a flag was *expected* but not *successfully loaded* for this nation
            if (!nationsSuccessfullyLoaded.has(nation.name)) {
                 // Add only if it wasn't successfully loaded OR if flagImage is still null (e.g., zero dim load or processing error)
                 if (!nation.flagImage) {
                     missingFromJson.push(nation.name);
                 }
            }
        }
        if (missingFromJson.length > 0) {
             statusParts.push(`Missing/failed for JSON specified flags: ${missingFromJson.join(', ')}.`);
             isError = true; // Consider missing specified flags an error state
        }
    }

    const statusMsg = statusParts.join(' ');
    updateStatus(statusMsg, isError);
    if (isError || skippedNoMatchCount > 0 || skippedTypeCount > 0) {
        console.warn("Flag loading status:", statusMsg, "Check console for details.");
    }

    // Update UI
    redrawCanvas();
    updateInfoPanel(cfg.selectedNationIndex); // Update info panel potentially showing new flags
    updateNationList(); // List doesn't show flags, but good practice
}

// --- UI Triggers ---
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
    // Create a temporary file input
    const flagInput = document.createElement('input');
    flagInput.type = 'file';
    flagInput.multiple = true;
    // Accept common image types and SVG
    flagInput.accept = 'image/png, image/jpeg, image/gif, image/webp, image/svg+xml, .png, .jpg, .jpeg, .gif, .webp, .svg';
    flagInput.style.display = 'none'; // Hide it

    // Define the change handler using an arrow function to maintain context
    const changeHandler = (event) => {
        if (event.target.files && event.target.files.length > 0) {
            loadFlagFiles(event.target.files);
        }
        // Clean up: remove the input and the listener
        document.body.removeChild(flagInput);
        // No need to remove listener explicitly if element is removed
    };

    flagInput.addEventListener('change', changeHandler);

    // Append, click, and let the handler manage removal
    document.body.appendChild(flagInput);
    flagInput.click();
}

export async function handleJsonLoad(file) {
    if (!file) return;
    if (!cfg.mapImage) {
        await showModal('alert', 'Error', 'Load map image BEFORE loading JSON data.');
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
        let loadedMapName = cfg.mapInfo.name; // Start with current map name as default

        try {
            const loadedData = JSON.parse(e.target.result);

            // --- Basic JSON Structure Validation ---
            if (typeof loadedData !== 'object' || loadedData === null) throw new Error("Invalid JSON: Not an object.");
            if (!loadedData.width || !loadedData.height || typeof loadedData.width !== 'number' || typeof loadedData.height !== 'number' || loadedData.width <= 0 || loadedData.height <= 0) throw new Error("Invalid JSON: Missing or invalid numeric 'width'/'height' > 0.");
            if (!Array.isArray(loadedData.nations)) throw new Error("Invalid JSON: Missing or invalid 'nations' array.");

            jsonWidth = loadedData.width;
            jsonHeight = loadedData.height;
            // Use map name from JSON if provided, otherwise keep the current map name
            loadedMapName = loadedData.name || loadedMapName;

            // --- Dimension Check and Scaling Confirmation ---
            if (jsonWidth !== cfg.mapInfo.width || jsonHeight !== cfg.mapInfo.height) {
                const confirmMsg = `JSON dimensions (${jsonWidth}x${jsonHeight}) differ from current map (${cfg.mapInfo.width}x${cfg.mapInfo.height}).\n\nScale coordinates to fit current map? (Choosing Cancel will abort loading)`;
                const confirmScale = await showModal('confirm', 'Dimension Mismatch', confirmMsg, { confirmText: 'Scale', denyText: 'Cancel Load' });

                if (!confirmScale) { // User chose Cancel Load
                    throw new Error(`Load cancelled due to dimension mismatch.`);
                }
                needsScaling = true;
                scaleX = cfg.mapInfo.width / jsonWidth;
                scaleY = cfg.mapInfo.height / jsonHeight;
                console.log(`Scaling coordinates: X factor=${scaleX.toFixed(4)}, Y factor=${scaleY.toFixed(4)}`);
            }

            // --- Nation Data Validation and Processing ---
            const validatedNations = [];
            let boundsWarnings = 0;
            for (const [index, nation] of loadedData.nations.entries()) {
                // Validate individual nation structure and types
                const nationIdentifier = `Nation '${nation?.name || '[Unnamed]'}' (index ${index})`;
                if (typeof nation !== 'object' || nation === null) throw new Error(`Invalid data for ${nationIdentifier}: Not an object.`);
                if (!Array.isArray(nation.coordinates) || nation.coordinates.length !== 2 || typeof nation.coordinates[0] !== 'number' || typeof nation.coordinates[1] !== 'number') throw new Error(`Invalid coords for ${nationIdentifier}.`);
                if (typeof nation.name !== 'string' || nation.name.trim() === '') throw new Error(`Invalid or empty name for ${nationIdentifier}.`);
                if (typeof nation.strength !== 'number' || !Number.isInteger(nation.strength)) throw new Error(`Invalid strength (must be integer) for ${nationIdentifier}.`);
                // Allow flag to be missing, null, or a non-empty string
                if (nation.hasOwnProperty('flag') && nation.flag !== null && (typeof nation.flag !== 'string' || nation.flag.trim() === '')) throw new Error(`Invalid 'flag' property (must be non-empty string or null) for ${nationIdentifier}.`);

                const [origX, origY] = nation.coordinates;
                let finalX = origX;
                let finalY = origY;

                if (needsScaling) {
                    finalX = Math.round(origX * scaleX);
                    finalY = Math.round(origY * scaleY);
                }

                 // Check original coordinates against JSON bounds
                 if (origX < 0 || origX > jsonWidth || origY < 0 || origY > jsonHeight) {
                      console.warn(`${nationIdentifier} original coords [${origX}, ${origY}] outside JSON bounds (${jsonWidth}x${jsonHeight}).`);
                     boundsWarnings++;
                 }
                 // Check final coordinates against current map bounds
                 if (finalX < 0 || finalX > cfg.mapInfo.width || finalY < 0 || finalY > cfg.mapInfo.height) {
                     console.warn(`${nationIdentifier} ${needsScaling ? 'scaled' : ''} coords [${finalX}, ${finalY}] are outside current map bounds (${cfg.mapInfo.width}x${cfg.mapInfo.height}).`);
                     boundsWarnings++;
                 }

                // Add the validated (and potentially scaled) nation
                validatedNations.push({
                    coordinates: [finalX, finalY],
                    name: nation.name.trim(),
                    strength: nation.strength,
                    flag: nation.flag?.trim() || null, // Store trimmed flag name or null
                    // Initialize runtime flag properties to null - these will be populated by loadFlagFiles
                    flagImage: null, flagData: null, flagDataType: null, flagWidth: null, flagHeight: null
                });
            }

            // --- Update Application State ---
            cfg.setNations(validatedNations);
            // Update map name only if it was present in the JSON
            if (loadedData.name) {
                 cfg.setMapInfo({...cfg.mapInfo, name: loadedMapName });
            }
            // Reset interaction states
            cfg.setSelectedNationIndex(null);
            cfg.setDraggingNation(false);
            cfg.setIsPanning(false);
            cfg.setPotentialPan(false);
            closeInlineEditor(); // Ensure editor is closed

            // --- Final Status and UI Updates ---
            statusMessage = needsScaling ? `Loaded and scaled ${validatedNations.length} nations from ${file.name}. Map name: "${loadedMapName}".` : `Loaded ${validatedNations.length} nations from ${file.name}. Map name: "${loadedMapName}".`;
            if (boundsWarnings > 0) statusMessage += ` (${boundsWarnings} bounds warnings - see console)`;
            updateStatus(statusMessage);

            resetView(); // Fit view to map potentially
            updateNationList();
            updateInfoPanel(null); // Clear info panel

            // --- Prompt for Flag Loading if Necessary ---
            const hasFlagsInJson = validatedNations.some(n => n.flag);
            if (hasFlagsInJson) {
                const loadFlagsNow = await showModal('confirm', 'Flags Found', 'The loaded JSON references nation flags.\nWould you like to select the corresponding flag image files (PNG/SVG etc.) now?', { confirmText: 'Select Files', denyText: 'Later' });
                if (loadFlagsNow) {
                    promptAndLoadFlags(); // Trigger the flag loading dialog
                } else {
                    updateStatus(statusMessage + " Use 'Load Flags' button later if needed.");
                }
            }

        } catch (error) {
            console.error("Error loading/parsing/validating JSON:", error);
            const errorMsg = error instanceof Error ? error.message : "Unknown error parsing JSON.";
            await showModal('alert', 'JSON Load Error', `Failed to load JSON: ${errorMsg}`);
            updateStatus(`Error loading JSON: ${errorMsg}`, true);
            // Optionally reset state here if load fails partially? Current logic keeps old state.
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
    // --- Pre-checks ---
    if (typeof JSZip === 'undefined') {
        await showModal('alert', 'Error', 'JSZip library not loaded. Cannot save.'); return;
    }
    if (!cfg.mapImage || !cfg.mapInfo.fileName) {
        await showModal('alert', 'Error', 'Load and process a map image before saving.'); return;
    }
    if (!cfg.mapInfo.width || !cfg.mapInfo.height) {
        await showModal('alert', 'Error', 'Map dimensions missing. Reload map image.'); return;
    }
    if (cfg.nations.length === 0) {
        const confirmEmpty = await showModal('confirm', 'Warning', 'No nations have been added. Save project with just the map image?', { confirmText: 'Save Map Only', denyText: 'Cancel' });
        if (!confirmEmpty) return;
    }

    // --- Get Project Name ---
    const defaultProjectName = cfg.mapInfo.name !== "Untitled Map"
        ? cfg.mapInfo.name
        : (cfg.mapInfo.fileName ? cfg.mapInfo.fileName.split('.').slice(0, -1).join('.') : 'MyMapProject');
    const projectNameInput = await showModal('prompt', 'Save Project', 'Enter project name (used for map image/json filenames):', { defaultValue: defaultProjectName });
    if (projectNameInput === null) return; // User cancelled
    const safeProjectName = projectNameInput.trim().replace(/[^a-z0-9_-]/gi, '_') || 'map_project'; // Sanitize name

    // --- Get ZIP Filename ---
    const defaultZipFileName = `${safeProjectName}.zip`;
    const outputZipFilenameInput = await showModal('prompt', 'Save Project', 'Enter filename for the ZIP file:', { defaultValue: defaultZipFileName });
    if (outputZipFilenameInput === null) return; // User cancelled
    // Ensure filename ends with .zip
    const finalZipFilename = outputZipFilenameInput.trim().endsWith('.zip')
        ? outputZipFilenameInput.trim()
        : `${outputZipFilenameInput.trim()}.zip`;
    if (!finalZipFilename || finalZipFilename === ".zip") {
         await showModal('alert', 'Error', 'Invalid ZIP filename provided.'); return;
    }


    updateStatus('Generating ZIP file...');

    try {
        const zip = new JSZip();
        // Use project name for the main folder inside the zip
        const projectFolder = zip.folder(safeProjectName);
        if (!projectFolder) throw new Error("Could not create project folder in ZIP."); // Check if folder creation worked
        const flagsFolder = projectFolder.folder("flags");
        if (!flagsFolder) throw new Error("Could not create flags folder in ZIP.");

        // --- 1. Prepare and Add JSON Data ---
        const mapData = {
            name: safeProjectName, // Use the sanitized project name here too
            width: cfg.mapInfo.width,
            height: cfg.mapInfo.height,
            nations: cfg.nations.map(n => {
                // Create plain data object for JSON, excluding runtime properties
                const nationData = {
                    coordinates: [Math.round(n.coordinates[0]), Math.round(n.coordinates[1])],
                    name: n.name,
                    strength: n.strength
                };
                // Only include the 'flag' property if it's set (non-null, non-empty string)
                // This 'flag' property links the nation to its corresponding flag file in the flags folder.
                if (n.flag) {
                    nationData.flag = n.flag;
                }
                return nationData;
            })
        };
        // Stringify with pretty print, then compact coordinates array for readability
        let jsonString = JSON.stringify(mapData, null, 2);
        const coordRegex = /"coordinates": \[\s*(-?\d+),\s*(-?\d+)\s*\]/g;
        let finalJsonString = jsonString.replace(coordRegex, (match, p1, p2) => `"coordinates": [${p1}, ${p2}]`); // Add space back
        projectFolder.file(`${safeProjectName}.json`, finalJsonString);

        // --- 2. Prepare and Add Map Image ---
        // Save the colorized map image currently in use
        const mapImageBase64 = getBase64FromDataUrl(cfg.mapImage.src);
        if (mapImageBase64) {
             // Determine extension from original map file type or default to png
             const extension = cfg.mapInfo.fileType?.startsWith('image/')
                ? (cfg.mapInfo.fileType.split('/')[1] || 'png')
                : 'png';
            projectFolder.file(`${safeProjectName}.${extension}`, mapImageBase64, { base64: true });
        } else {
            console.warn("Could not get Base64 data for the current map image.");
            await showModal('alert', 'Warning', 'Could not include the map image data in the ZIP.');
        }

        // --- 3. Prepare and Add Flags (Save STANDARDIZED/EDITED Data) ---
        let flagsAddedCount = 0;
        let flagSaveErrors = 0;
        const flagPromises = cfg.nations.map(async (nation) => {
            // Check for flag name AND the processed flagImage (which holds the standardized data)
            if (nation.flag && nation.flagImage && nation.flagImage.complete && nation.flagImage.naturalWidth > 0) {
                // Always save the file with the .svg extension, embedding the standardized PNG data
                const flagFileName = `${nation.flag}.svg`;

                try {
                    // Get the standardized PNG data URL from the image element
                    const standardizedDataUrl = nation.flagImage.src;
                    // Get the dimensions of the standardized image
                    const standardizedWidth = nation.flagImage.naturalWidth;
                    const standardizedHeight = nation.flagImage.naturalHeight;

                    if (standardizedDataUrl && standardizedDataUrl.startsWith('data:image') && standardizedWidth > 0 && standardizedHeight > 0) {
                        // Create the SVG wrapper using the standardized image dimensions and its Data URL
                        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${standardizedWidth}" height="${standardizedHeight}" viewBox="0 0 ${standardizedWidth} ${standardizedHeight}">\n  <image xlink:href="${standardizedDataUrl}" width="${standardizedWidth}" height="${standardizedHeight}" />\n</svg>`;
                        flagsFolder.file(flagFileName, svgContent);
                        flagsAddedCount++;
                    } else {
                        console.warn(`Could not get valid standardized data/dimensions for flag '${nation.name}' (file: ${flagFileName}). Skipping save.`);
                        flagSaveErrors++;
                    }
                } catch(saveError) {
                    console.error(`Error preparing standardized flag '${nation.name}' (file: ${flagFileName}) for saving:`, saveError);
                    flagSaveErrors++;
                }

            } else if (nation.flag) {
                 // Log if flag name exists but the flagImage (standardized version) is missing or invalid
                 console.warn(`Could not save flag for '${nation.name}' (specified as '${nation.flag}'): Standardized flag image data not available or invalid.`);
                 flagSaveErrors++; // Count this as an error/skipped flag
            }
        });

        // Wait for all flag processing to finish
        await Promise.all(flagPromises);
        console.log(`Attempted to save standardized flags. Added: ${flagsAddedCount}, Errors/Skipped: ${flagSaveErrors}.`);

        // --- 4. Generate and Download ZIP ---
        const zipBlob = await zip.generateAsync(
            { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
            (metadata) => { // Optional: Progress callback
                updateStatus(`Generating ZIP: ${metadata.percent.toFixed(0)}%`);
            }
        );

        // Use FileSaver.js if available (more robust), otherwise fallback to URL method
        if (typeof saveAs === 'function') {
            saveAs(zipBlob, finalZipFilename);
        } else {
            console.warn("FileSaver.js not found. Using fallback download method.");
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = finalZipFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        let finalStatus = `Project saved as '${finalZipFilename}'.`;
        if (flagSaveErrors > 0) finalStatus += ` (${flagSaveErrors} flag save error(s) - see console).`;
        updateStatus(finalStatus);

    } catch (error) {
        console.error("Error creating ZIP file:", error);
        const errorMsg = error instanceof Error ? error.message : "Unknown error creating ZIP.";
        await showModal('alert', 'ZIP Error', `Error creating ZIP file: ${errorMsg}`);
        updateStatus(`Error creating ZIP: ${errorMsg}`, true);
    }
}