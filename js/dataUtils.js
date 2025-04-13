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
export async function processAndAssignFlag(file, nation) {
    // ... (Keep the exact processAndAssignFlag function from the original script) ...
     return new Promise((resolve, reject) => {
         if (!file || !nation) { return reject(new Error("Invalid arguments for processAndAssignFlag")); }
         // Tolerate missing type by trying extension? For now, require type.
         if (!file.type && !(file.name.toLowerCase().endsWith('.svg') || file.name.toLowerCase().endsWith('.png'))) {
             console.warn(`File ${file.name} is missing type and doesn't end with .svg/.png. Cannot determine type.`);
             return reject(new Error(`Cannot determine file type for ${file.name}`));
         }
         const reader = new FileReader();
         const flagName = generateFlagName(nation.name); // Use imported helper
         const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
         const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png'); // Check PNG explicitly

         reader.onload = (e) => {
             try {
                 const fileData = e.target.result;
                 nation.flag = flagName; // Assign the generated name
                 nation.flagData = fileData; // Store raw data (text for SVG, dataURL for PNG)
                 nation.flagDataType = isSvg ? 'svg' : (isPng ? 'png' : null); // Store type explicitly
                 nation.flagImage = new Image();
                 nation.flagWidth = null; // Reset dimensions
                 nation.flagHeight = null;

                 nation.flagImage.onload = () => {
                     nation.flagWidth = nation.flagImage.naturalWidth;
                     nation.flagHeight = nation.flagImage.naturalHeight;
                     if ((isSvg || isPng) && (nation.flagWidth === 0 || nation.flagHeight === 0)) {
                         console.warn(`Loaded ${nation.flagDataType} flag for ${nation.name} but natural dimensions are zero. Check file: ${file.name}`);
                     }
                     console.log(`Flag loaded for ${nation.name}: ${flagName}.${nation.flagDataType} (${nation.flagWidth}x${nation.flagHeight})`);
                     resolve({ status: 'loaded', filename: file.name, nationName: nation.name });
                 };
                 nation.flagImage.onerror = (err) => {
                     console.error(`Error loading ${nation.flagDataType || 'unknown type'} flag image into Image object for: ${nation.name} from ${file.name}`, err);
                     // Clear flag data on error
                     nation.flag = null; nation.flagData = null; nation.flagDataType = null; nation.flagImage = null; nation.flagWidth = null; nation.flagHeight = null;
                     reject(new Error(`Failed to load flag image data for ${file.name}`));
                 };

                 // Set the source for the Image object
                 if (isSvg) {
                     // Need to Base64 encode the SVG text data for use in src
                     const svgBase64 = btoa(unescape(encodeURIComponent(fileData)));
                     nation.flagImage.src = `data:image/svg+xml;base64,${svgBase64}`;
                 } else if (isPng) {
                     nation.flagImage.src = fileData; // fileData is already a dataURL from readAsDataURL
                 } else {
                     // Should not happen if type check passed, but safety first
                     console.error("Inconsistent flag type during processing.");
                     reject(new Error(`Inconsistent type for ${file.name}`));
                 }

             } catch (loadError) {
                 console.error(`Error processing file data for ${nation.name} (${file.name}):`, loadError);
                 nation.flag = null; nation.flagData = null; nation.flagDataType = null; nation.flagImage = null; nation.flagWidth = null; nation.flagHeight = null;
                 reject(new Error(`Processing error for ${file.name}: ${loadError.message}`));
             }
         };

         reader.onerror = (err) => {
             console.error(`Error reading file ${file.name}:`, err);
             reject(new Error(`File read error for ${file.name}`));
         };

         // Read based on type
         if (isSvg) {
             reader.readAsText(file); // Read SVG as text
         } else if (isPng) {
             reader.readAsDataURL(file); // Read PNG as data URL
         } else {
             // This case should ideally be caught earlier
             reject(new Error(`Unsupported file type for processing: ${file.type || file.name}`));
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
                    // console.log(`Matched flag file ${file.name} to nation ${matchedNation.name} via JSON 'flag' property.`);
                }
                // If no JSON match, try matching based on generated name (only if nation doesn't already have a flag from JSON)
                else if (nationGeneratedNameMap.has(potentialMatchNameLower)) {
                    matchedNation = nationGeneratedNameMap.get(potentialMatchNameLower);
                     // console.log(`Matched flag file ${file.name} to nation ${matchedNation.name} by generated name.`);
                }

                // If still no match, skip
                if (!matchedNation) {
                    skippedNoMatchCount++;
                    resolve({ status: 'skipped_nomatch', filename: file.name });
                    return;
                }

                // Check file type (allow known image types or SVG)
                 const fileType = file.type;
                 const isSvg = fileType === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
                 const isPng = fileType === 'image/png' || file.name.toLowerCase().endsWith('.png');
                 // Add more types if needed (jpeg, gif, webp)
                 const isOtherImage = ['image/jpeg', 'image/gif', 'image/webp'].includes(fileType) ||
                                     /\.(jpe?g|gif|webp)$/i.test(file.name); // Basic extension check as fallback

                 if (!(isSvg || isPng || isOtherImage)) {
                     console.warn(`Skipping file with unsupported type: ${file.name} (Type: ${fileType || 'unknown'})`);
                     skippedTypeCount++;
                     resolve({ status: 'skipped_type', filename: file.name });
                     return;
                 }
                 // For now, we primarily handle SVG and PNG internally for saving, but can load others.
                 // We'll treat JPEG/GIF/WEBP like PNG for loading (readAsDataURL) but won't convert to SVG on save yet.
                 // Modify processAndAssignFlag if explicit handling of other types is needed.

                // Process the matched flag
                try {
                     const result = await processAndAssignFlag(file, matchedNation);
                     resolve(result); // Forward the result from processAndAssignFlag
                } catch (processingError) {
                     console.error(`Error processing flag file ${file.name} for ${matchedNation.name}:`, processingError);
                     errorCount++;
                     resolve({ status: 'error', filename: file.name, reason: processingError.message }); // Resolve with error status
                }

            } catch (err) {
                console.error(`Unexpected error setting up processing for ${file.name}:`, err);
                errorCount++;
                resolve({ status: 'error', filename: file.name, reason: 'Setup failed' }); // Resolve with error status
            }
        });
    });

    // Wait for all file processing attempts
    const results = await Promise.all(fileLoadPromises);

    let nationsSuccessfullyLoaded = new Set();
    results.forEach(result => {
        if (result.status === 'loaded') {
            loadedCount++;
            nationsSuccessfullyLoaded.add(result.nationName);
        }
        // Errors are counted within the promises now
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
            // Check if a nation that *should* have a flag (from JSON) didn't get one loaded
            // This check is a bit complex if generated names could also match.
            // Let's check if the nation object itself had its flagImage set successfully.
            if (!nation.flagImage) {
                // It was specified in JSON but wasn't loaded (either no file matched or processing failed)
                 missingFromJson.push(nation.name); // Report nation name might be clearer
            }
        }
         if (missingFromJson.length > 0) {
             statusMsg += ` Missing/failed for JSON nations: ${missingFromJson.join(', ')}.`;
             // isError = true; // Optionally mark as error if JSON flags are missing
         }
    }

    updateStatus(statusMsg, isError);
    if (isError || skippedNoMatchCount > 0 || skippedTypeCount > 0) {
        console.warn("Flag loading status:", statusMsg, "Check console for details.");
    }
    redrawCanvas();
    updateInfoPanel(cfg.selectedNationIndex); // Update panel to show newly loaded flags
    updateNationList(); // Nation list doesn't show flags, but good practice
}

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
    // Accept common image types + SVG
    flagInput.accept = 'image/png, image/jpeg, image/gif, image/webp, image/svg+xml';
    flagInput.style.display = 'none';

    flagInput.addEventListener('change', (event) => {
        loadFlagFiles(event.target.files); // Pass selected files to handler
        document.body.removeChild(flagInput); // Clean up the input element
    });

    document.body.appendChild(flagInput);
    flagInput.click(); // Open the file selection dialog
}

// --- JSON Handling ---
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
        let loadedMapName = cfg.mapInfo.name; // Default to current name

        try {
            const loadedData = JSON.parse(e.target.result);

            // --- Basic JSON Structure Validation ---
            if (typeof loadedData !== 'object' || loadedData === null) throw new Error("Invalid JSON: Not an object.");
            if (!loadedData.width || !loadedData.height || typeof loadedData.width !== 'number' || typeof loadedData.height !== 'number') throw new Error("Invalid JSON: Missing or invalid numeric 'width'/'height'.");
            if (!Array.isArray(loadedData.nations)) throw new Error("Invalid JSON: Missing or invalid 'nations' array.");

            jsonWidth = loadedData.width;
            jsonHeight = loadedData.height;
            loadedMapName = loadedData.name || loadedMapName; // Use name from JSON if provided

            // --- Dimension Check & Scaling ---
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

            // --- Process Nations ---
            const validatedNations = [];
            let boundsWarnings = 0;
            for (const [index, nation] of loadedData.nations.entries()) {
                // Validate individual nation structure
                if (typeof nation !== 'object' || nation === null) throw new Error(`Invalid nation data at index ${index}: Not an object.`);
                if (!Array.isArray(nation.coordinates) || nation.coordinates.length !== 2 || typeof nation.coordinates[0] !== 'number' || typeof nation.coordinates[1] !== 'number') throw new Error(`Invalid nation coords at index ${index} (name: ${nation.name || '[Unnamed]'}).`);
                if (typeof nation.name !== 'string' || nation.name.trim() === '') throw new Error(`Invalid or empty nation name at index ${index}.`);
                if (typeof nation.strength !== 'number' || !Number.isInteger(nation.strength)) throw new Error(`Invalid strength (must be integer) at index ${index} (name: ${nation.name}).`);
                // Validate optional flag property: must be string or null/absent
                if (nation.hasOwnProperty('flag') && nation.flag !== null && typeof nation.flag !== 'string') throw new Error(`Invalid 'flag' property type (must be string or null) at index ${index} (name: ${nation.name}).`);

                const [origX, origY] = nation.coordinates;
                let finalX = origX;
                let finalY = origY;

                // Apply scaling if needed
                if (needsScaling) {
                    finalX = Math.round(origX * scaleX);
                    finalY = Math.round(origY * scaleY);
                }

                 // Check bounds (optional, but helpful)
                 if (origX < 0 || origX > jsonWidth || origY < 0 || origY > jsonHeight) {
                      console.warn(`Nation '${nation.name}' (index ${index}) original coords [${origX}, ${origY}] outside JSON bounds (${jsonWidth}x${jsonHeight}).`);
                     boundsWarnings++;
                 }
                 // Check final coords against map bounds AFTER scaling
                 if (finalX < 0 || finalX > cfg.mapInfo.width || finalY < 0 || finalY > cfg.mapInfo.height) {
                     console.warn(`Nation '${nation.name}' (index ${index}) ${needsScaling ? 'scaled' : ''} coords [${finalX}, ${finalY}] are outside current map bounds (${cfg.mapInfo.width}x${cfg.mapInfo.height}).`);
                     boundsWarnings++;
                 }


                // Add the processed nation data
                validatedNations.push({
                    coordinates: [finalX, finalY],
                    name: nation.name.trim(), // Trim whitespace from name
                    strength: nation.strength,
                    flag: nation.flag || null, // Ensure flag is null if missing or empty string
                    // Reset flag image data, needs to be loaded separately
                    flagImage: null,
                    flagData: null,
                    flagDataType: null,
                    flagWidth: null,
                    flagHeight: null
                });
            }

            // --- Update Application State ---
            cfg.setNations(validatedNations);
            // Update map name from JSON only if it was provided
            if (loadedData.name) {
                 cfg.setMapInfo({...cfg.mapInfo, name: loadedMapName });
            }
            cfg.setSelectedNationIndex(null);
            cfg.setDraggingNation(false);
            cfg.setIsPanning(false);
            cfg.setPotentialPan(false);
            closeInlineEditor(); // Needs import

            statusMessage = needsScaling
                ? `Loaded and scaled ${validatedNations.length} nations from ${file.name}. Map name: "${loadedMapName}".`
                : `Loaded ${validatedNations.length} nations from ${file.name}. Map name: "${loadedMapName}".`;
            if (boundsWarnings > 0) {
                statusMessage += ` (${boundsWarnings} bounds warnings - see console)`;
            }
            updateStatus(statusMessage);

            // Update UI
            resetView(); // Reset view to potentially show all loaded nations
            updateNationList();
            updateInfoPanel(null);

            // --- Prompt for Flag Loading ---
            const hasFlagsInJson = validatedNations.some(n => n.flag);
            if (hasFlagsInJson) {
                const loadFlagsNow = await showModal('confirm', 'Flags Found', 'The loaded JSON references nation flags.\nWould you like to select the corresponding flag image files (PNG/SVG etc.) now?', { confirmText: 'Select Files', denyText: 'Later' });
                if (loadFlagsNow) {
                    promptAndLoadFlags(); // Call the function to open file dialog
                } else {
                    updateStatus(statusMessage + " Use 'Load Flags' button later if needed.");
                }
            }

        } catch (error) {
            console.error("Error loading/parsing/validating JSON:", error);
            await showModal('alert', 'JSON Load Error', `Failed to load JSON: ${error.message}`);
            updateStatus(`Error loading JSON: ${error.message}`, true);
            // Do not change current nations/map state on error
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
    // Check if JSZip is loaded (it should be from index.html)
    if (typeof JSZip === 'undefined') {
        await showModal('alert', 'Error', 'JSZip library not loaded. Cannot save.');
        updateStatus('Error: JSZip library not loaded.', true);
        return;
    }

    if (!cfg.mapImage || !cfg.mapInfo.fileName) {
        await showModal('alert', 'Error', 'Load and process a map image before saving.');
        return;
    }
    if (!cfg.mapInfo.width || !cfg.mapInfo.height) {
         await showModal('alert', 'Error', 'Map dimensions missing. Cannot save.');
         return;
    }


    if (cfg.nations.length === 0) {
        const confirmEmpty = await showModal('confirm', 'Warning', 'No nations have been added to the map.\nSave project with empty nation list?', { confirmText: 'Save Empty', denyText: 'Cancel' });
        if (!confirmEmpty) return; // User cancelled
    }

    // Suggest a project name based on map name or file name
    const defaultProjectName = cfg.mapInfo.name !== "Untitled Map"
        ? cfg.mapInfo.name
        : (cfg.mapInfo.fileName ? cfg.mapInfo.fileName.split('.').slice(0, -1).join('.') : 'MyMap');

    const projectName = await showModal('prompt', 'Save Project', 'Enter project name (used for map image/json filenames inside ZIP):', { defaultValue: defaultProjectName });
    if (projectName === null) return; // User cancelled prompt

    // Sanitize project name for use in filenames
    const safeProjectName = projectName.trim().replace(/[^a-z0-9_-]/gi, '_') || 'map_project';

    // Suggest ZIP filename
    const defaultZipFileName = `${safeProjectName}.zip`;
    const outputZipFilename = await showModal('prompt', 'Save Project', 'Enter filename for the ZIP file:', { defaultValue: defaultZipFileName });
    if (outputZipFilename === null) return; // User cancelled prompt

    updateStatus('Generating ZIP file...');

    try {
        const zip = new JSZip();
        const resourcesFolder = zip.folder("resources");
        const mapsFolder = resourcesFolder.folder("maps");
        const flagsFolder = resourcesFolder.folder("flags"); // Standard flags folder

        // --- Prepare JSON Data ---
        const mapData = {
            name: safeProjectName, // Use the sanitized project name here
            width: cfg.mapInfo.width,
            height: cfg.mapInfo.height,
            nations: cfg.nations.map(n => {
                const nationData = {
                    coordinates: [Math.round(n.coordinates[0]), Math.round(n.coordinates[1])], // Round coordinates
                    name: n.name,
                    strength: n.strength
                };
                // Only include 'flag' property if it's set (not null/undefined)
                if (n.flag) {
                    nationData.flag = n.flag;
                }
                return nationData;
            })
        };

        // Convert to JSON string with readable formatting, ensuring no extra spaces in coordinates array
        let jsonString = JSON.stringify(mapData, null, 2);
        const coordRegex = /"coordinates": \[\s*(-?\d+),\s*(-?\d+)\s*\]/g;
        let finalJsonString = jsonString.replace(coordRegex, (match, p1, p2) => `"coordinates": [${p1},${p2}]`); // Remove spaces

        mapsFolder.file(`${safeProjectName}.json`, finalJsonString);

        // --- Add Map Image ---
        // The cfg.mapImage *is* the colorized one
        const mapImageBase64 = getBase64FromDataUrl(cfg.mapImage.src);
        if (mapImageBase64) {
             // Determine extension based on original file type if possible, else default
             const extension = cfg.mapInfo.fileType.startsWith('image/')
                              ? cfg.mapInfo.fileType.split('/')[1] || 'png'
                              : 'png';
            mapsFolder.file(`${safeProjectName}.${extension}`, mapImageBase64, { base64: true });
        } else {
            console.warn("Could not get Base64 data for map image. Map image will be missing from ZIP.");
            await showModal('alert', 'Warning', 'Could not save the map image data. It will be missing from the ZIP.');
        }

        // --- Add Flags (Save as SVG) ---
        let flagsAddedCount = 0;
        const flagPromises = cfg.nations.map(async (nation) => {
            // Only save if flag name, data, and type are present
            if (nation.flag && nation.flagData && nation.flagDataType) {
                const flagFileName = `${nation.flag}.svg`; // Always save as .svg

                if (nation.flagDataType === 'svg') {
                    // Save SVG data directly
                    flagsFolder.file(flagFileName, nation.flagData);
                    flagsAddedCount++;
                } else if (nation.flagDataType === 'png') {
                    // Wrap PNG in an SVG
                    if (nation.flagWidth && nation.flagHeight && nation.flagData.startsWith('data:image')) {
                        // nation.flagData should be the base64 data URL for PNG
                        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${nation.flagWidth}" height="${nation.flagHeight}" viewBox="0 0 ${nation.flagWidth} ${nation.flagHeight}">\n  <image xlink:href="${nation.flagData}" width="${nation.flagWidth}" height="${nation.flagHeight}" />\n</svg>`;
                        flagsFolder.file(flagFileName, svgContent);
                        flagsAddedCount++;
                    } else {
                        console.warn(`Could not create SVG wrapper for PNG flag '${nation.name}': Missing dimensions or invalid data URL.`);
                    }
                } else {
                     // Handle other types if needed (e.g., convert JPG/WEBP to PNG first, then wrap)
                     // For now, just log a warning if we have data but don't know how to save it as SVG.
                     console.warn(`Cannot save flag type '${nation.flagDataType}' for nation '${nation.name}' as SVG currently.`);
                }
            }
        });

        await Promise.all(flagPromises); // Wait for all flag file operations
        console.log(`Added ${flagsAddedCount} flags to ZIP (as .svg).`);

        // --- Generate and Download ZIP ---
        const zipBlob = await zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: {
                level: 6 // Balance between speed and compression
            }
        });

        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        // Ensure filename ends with .zip
        const finalZipFilename = outputZipFilename.endsWith('.zip') ? outputZipFilename : outputZipFilename + '.zip';
        a.download = finalZipFilename;
        document.body.appendChild(a);
        a.click(); // Trigger download
        document.body.removeChild(a); // Clean up link
        URL.revokeObjectURL(url); // Release object URL

        updateStatus(`Project saved as '${finalZipFilename}'`);

    } catch (error) {
        console.error("Error creating ZIP file:", error);
        await showModal('alert', 'ZIP Error', `Error creating ZIP file: ${error.message}`);
        updateStatus(`Error creating ZIP: ${error.message}`, true);
    }
}


// --- END OF FILE js/dataUtils.js ---