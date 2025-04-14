// --- START OF FILE js/main.js ---
import * as cfg from './config.js';
import * as domUtils from './domUtils.js';
import * as canvasUtils from './canvasUtils.js';
import * as mapUtils from './mapUtils.js';
import * as dataUtils from './dataUtils.js';
import * as nationUtils from './nationUtils.js';
import * as handlers from './eventHandlers.js';

// --- Map Generator Imports ---
import { generateMap } from './map-generator/mapGenerator.js';
import * as mapGenConfig from './map-generator/mapGenConfig.js'; // Import config for generator defaults

function initializeApp() {
    console.log("Initializing OpenFront Map Editor...");

    // 1. Assign references to STATIC DOM elements first (containers etc.)
    //    This MUST find #controls, #instructions, #settingsPanel etc.
    cfg.assignElements();

    // 2. Check if essential STATIC elements were found
    if (!cfg.canvas || !cfg.ctx || !cfg.statusDiv || !cfg.settingsPanel || !cfg.controlsDiv || !cfg.instructionsDiv) {
        console.error("Essential static DOM elements (canvas, status, panels, controls, instructions) not found! Check HTML IDs. Aborting initialization.");
        // Display a user-friendly message if possible
        const bodyContent = document.body ? document.body.innerHTML : '';
         if (document.body) {
             document.body.innerHTML = `<h1>Error: Could not initialize editor.</h1><p>Essential container elements (like #controls, #instructions, #settingsPanel) are missing in the HTML or could not be found by the script.</p><p>Please check the browser's developer console (F12) for more specific errors.</p><hr><pre>${bodyContent}</pre>`; // Show original body for debugging
         }
        return; // Stop execution
    } else {
        console.log("Essential static containers found.");
    }

    // 3. Populate dynamic HTML content (controls, instructions, settings)
    //    This relies on cfg.controlsDiv, cfg.instructionsDiv etc. being valid references.
    console.log("Populating dynamic elements...");
    domUtils.populateDynamicElements(); // <<< CRITICAL STEP

    // 4. Assign references AGAIN to capture the DYNAMICALLY added elements
    //    This finds buttons etc. INSIDE the populated innerHTML.
    console.log("Re-assigning elements to find dynamic content...");
    cfg.assignElements();

    // 5. Check if essential DYNAMIC elements were found
     // Check a few key dynamic elements that *should* exist now
     const essentialDynamicIds = ['loadMapLabel', 'saveButton', 'markerSizeInput', 'generateMapButton', 'closeSettingsButton', 'darkModeToggle'];
     let missingDynamic = false;
     essentialDynamicIds.forEach(id => {
         // Use the cfg object to check if the variable is assigned
         let elementFound = false;
          for (const key in cfg) {
              if (key.toLowerCase().includes(id.toLowerCase()) && cfg[key]) {
                  elementFound = true;
                  break;
              }
          }
          // Check common element properties directly too
         if (!elementFound && !document.getElementById(id)) {
             console.warn(`Essential dynamic UI element with expected ID '${id}' might be missing or wasn't assigned in config.js.`);
             missingDynamic = true;
         }
     });
     if (missingDynamic) {
         console.error("One or more essential dynamic UI elements were not found after population. Event listeners might fail. Check populateDynamicElements() and HTML IDs.");
         // Consider showing an error to the user or aborting if critical features won't work
         // domUtils.showModal('alert', 'Initialization Error', 'Failed to create essential UI components. Some features may not work.');
     } else {
         console.log("Essential dynamic elements checked.");
     }


    // 6. Load settings (theme, sizes) and apply them
    //    This requires the settings input elements to be assigned now.
    console.log("Loading and applying settings...");
    domUtils.loadSettings(); // Includes applySettings

    // 7. Setup all event listeners
    //    This requires all button/input elements to be assigned.
    console.log("Setting up event listeners...");
    setupEventListeners();

    // 8. Set initial UI states
    console.log("Setting initial UI states...");
    if(cfg.settingsPanel) cfg.settingsPanel.style.display = cfg.isSettingsVisible ? 'block' : 'none';
    domUtils.updateNationList();
    domUtils.updateInfoPanel(null);
    canvasUtils.setInitialCanvasSize(); // Set initial canvas size based on container
    canvasUtils.drawPlaceholder(); // Draw initial placeholder or empty state
    domUtils.updateCursor(); // Set initial cursor

    // 9. Setup Resize Observer
    if (cfg.canvasContainer) {
        console.log("Setting up Resize Observer...");
        const resizeObserver = new ResizeObserver(entries => {
            // We might get multiple entries, handle the container resize
            for (let entry of entries) {
                if (entry.target === cfg.canvasContainer) {
                    // Add a debounce or throttle here if resize events fire too rapidly
                    handlers.handleResize(); // Call the handler function
                }
            }
        });
        resizeObserver.observe(cfg.canvasContainer);
    } else {
        console.error("Canvas container not found, cannot set up resize observer.");
    }


    console.log("Map Editor Initialized Successfully.");
     domUtils.updateStatus("Load a map image or generate a new map to begin."); // Update initial status
}

function setupEventListeners() {
    // Settings Panel
    cfg.settingsButton?.addEventListener('click', handlers.handleSettingsToggle);
    cfg.closeSettingsButton?.addEventListener('click', handlers.handleSettingsToggle); // Same handler
    cfg.markerSizeInput?.addEventListener('input', domUtils.applySettings);
    cfg.markerSizeInput?.addEventListener('change', domUtils.saveSettings);
    cfg.nationTextSizeInput?.addEventListener('input', domUtils.applySettings);
    cfg.nationTextSizeInput?.addEventListener('change', domUtils.saveSettings);
    cfg.flagSizeInput?.addEventListener('input', domUtils.applySettings);
    cfg.flagSizeInput?.addEventListener('change', domUtils.saveSettings);
    cfg.darkModeToggle?.addEventListener('change', () => { domUtils.applySettings(); domUtils.saveSettings(); });

    // Top Controls
    cfg.loadMapLabel?.addEventListener('click', handlers.handleMapLoadClick);
    cfg.imageInput?.addEventListener('change', handlers.handleMapFileSelect);
    cfg.jsonLoadInput?.addEventListener('change', handlers.handleJsonFileSelect); // Listener on input, triggered by label click
    cfg.loadFlagsButton?.addEventListener('click', dataUtils.promptAndLoadFlags);
    cfg.saveButton?.addEventListener('click', dataUtils.saveProjectAsZip);
    cfg.generateMapButton?.addEventListener('click', handleGenerateMapClick); // Listener added

    // Zoom Controls
    cfg.zoomInButton?.addEventListener('click', () => canvasUtils.changeZoom(1.25));
    cfg.zoomOutButton?.addEventListener('click', () => canvasUtils.changeZoom(1 / 1.25));
    cfg.zoomResetButton?.addEventListener('click', canvasUtils.resetView);

    // Canvas Interaction
    cfg.canvas?.addEventListener('mousedown', handlers.handleCanvasMouseDown);
    cfg.canvas?.addEventListener('mousemove', handlers.handleCanvasMouseMove);
    cfg.canvas?.addEventListener('mouseup', handlers.handleCanvasMouseUp);
    cfg.canvas?.addEventListener('mouseout', handlers.handleCanvasMouseOut);
    cfg.canvas?.addEventListener('wheel', handlers.handleCanvasWheel, { passive: false }); // Need passive: false for preventDefault
    cfg.canvas?.addEventListener('contextmenu', handlers.handleCanvasContextMenu);
    // Double-click for inline edit
    cfg.canvas?.addEventListener('dblclick', (event) => {
         if (!cfg.mapImage || event.button !== 0 || cfg.isPanning || cfg.draggingNation || cfg.currentModalResolve || cfg.isPanningAnimationActive || !cfg.inlineEditPanel) return;
         // Check if click is inside inline editor
         if (cfg.inlineEditPanel && cfg.inlineEditPanel.style.display === 'block' && cfg.inlineEditPanel.contains(event.target)) return;

         const canvasPos = canvasUtils.getCanvasMousePos(event);
         if (!canvasPos) return;
         const mapPos = canvasUtils.canvasToMapCoords(canvasPos.x, canvasPos.y);
         const clickedNationIndex = canvasUtils.getNationAtPos(mapPos);
         if (clickedNationIndex !== null) {
             event.preventDefault(); // Prevent text selection etc.
             cfg.setSelectedNationIndex(clickedNationIndex);
             domUtils.openInlineEditor(clickedNationIndex, cfg.nations[clickedNationIndex].coordinates[0], cfg.nations[clickedNationIndex].coordinates[1]);
             canvasUtils.redrawCanvas(); // Update selection highlight
             domUtils.updateNationList();
             domUtils.updateInfoPanel(clickedNationIndex);
         }
    });


    // Inline Editor Buttons
    cfg.inlineEditSave?.addEventListener('click', handlers.handleInlineEditSave);
    cfg.inlineEditCancel?.addEventListener('click', handlers.handleInlineEditCancel);

    // Info Panel Flag Controls
    cfg.infoFlagUploadInput?.addEventListener('change', handlers.handleFlagUploadChange);
    cfg.infoFlagRemoveButton?.addEventListener('click', handlers.handleFlagRemoveClick);

    // Global Keyboard Listener
    document.addEventListener('keydown', handlers.handleDocumentKeyDown);

    // Note: Nation list item listeners (hover, click, dblclick, delete) are added dynamically in domUtils.updateNationList()
    console.log("Event listeners setup complete.");
}


// --- Map Generation Handler ---
async function handleGenerateMapClick() {
    // Prevent generation if busy
    if (cfg.isPanning || cfg.draggingNation || cfg.currentModalResolve || cfg.isPanningAnimationActive) {
        domUtils.showModal('alert', 'Busy', 'Please finish the current action (panning, dragging, modal) before generating a new map.');
        return;
    }

    // Confirm overwriting
    const confirmGenerate = await domUtils.showModal(
        'confirm',
        'Generate New Map?',
        'This will replace the current map and clear all nations.\nAre you sure?', // Added line break for clarity
        { confirmText: 'Generate', denyText: 'Cancel' }
    );

    if (!confirmGenerate) {
        domUtils.updateStatus("Map generation cancelled.");
        return;
    }

    // --- Start Generation ---
    // Disable relevant buttons
    const buttonsToDisable = [cfg.generateMapButton, cfg.saveButton, cfg.loadFlagsButton];
    const labelsToDisable = [cfg.loadMapLabel, cfg.jsonLoadLabel]; // Assuming these are labels acting as buttons

    buttonsToDisable.forEach(btn => { if (btn) btn.disabled = true; });
    labelsToDisable.forEach(lbl => { if (lbl) lbl.setAttribute('data-disabled', 'true'); });

    domUtils.updateStatus("Generating map... (This may take some time)");
    console.log("Map generation started...");

    try {
        // Define the progress handler function
        const progressHandler = (progressData) => {
             let statusText = `Generating: ${progressData.phase || '...'}`;
             if (progressData.currentStep && progressData.totalSteps) {
                 const percent = Math.round((progressData.currentStep / progressData.totalSteps) * 100);
                 statusText += ` (${percent}%)`;
             } else if (progressData.status) {
                 statusText += ` - ${progressData.status}`;
             }
             domUtils.updateStatus(statusText);
             // console.log("Generation Progress:", progressData); // Optional detailed log
        };

        // --- Call the main generator function ---
        // Pass empty config to use defaults from mapGenConfig.js
        // Pass the progress handler
        const generatedMapDataUrl = await generateMap({}, progressHandler);

        if (generatedMapDataUrl) {
            console.log("Map generation successful, integrating result...");
            // --- Integrate the generated map into the editor ---
            const finalMapImage = new Image();

            // Define onload behavior *before* setting src
            finalMapImage.onload = () => {
                console.log("Generated map image loaded into Image object.");
                cfg.setMapImage(finalMapImage);

                // Set MapInfo using dimensions from mapGenConfig
                cfg.setMapInfo({
                    name: `Generated Map (${mapGenConfig.GRID_WIDTH}x${mapGenConfig.GRID_HEIGHT})`,
                    width: mapGenConfig.GRID_WIDTH,
                    height: mapGenConfig.GRID_HEIGHT,
                    fileName: "generated_map.png", // Placeholder filename
                    fileType: "image/png"           // Output type from generator
                });

                // Reset editor state completely for the new map
                cfg.setNations([]);
                cfg.setSelectedNationIndex(null);
                cfg.setHoveredNationIndex(null);
                cfg.setHoveredListIndex(null);
                cfg.setDraggingNation(false);
                cfg.setIsPanning(false);
                cfg.setPotentialPan(false);
                domUtils.closeInlineEditor();

                // Adjust canvas and view
                canvasUtils.setInitialCanvasSize(); // Ensure canvas fits if size changed
                canvasUtils.resetView();            // Fit the new map & redraw

                // Update UI elements
                // Enable buttons that make sense with a map loaded
                if (cfg.saveButton) cfg.saveButton.disabled = false;
                if (cfg.loadFlagsButton) cfg.loadFlagsButton.disabled = false;
                if (cfg.jsonLoadLabel) cfg.jsonLoadLabel.removeAttribute('data-disabled');

                domUtils.updateStatus(`Generated new ${mapGenConfig.GRID_WIDTH}x${mapGenConfig.GRID_HEIGHT} map.`);
                domUtils.updateNationList(); // Clear the nation list display
                domUtils.updateInfoPanel(null); // Clear the info panel
                domUtils.updateCursor();        // Reset cursor
            };

            // Define onerror behavior
            finalMapImage.onerror = async () => {
                console.error("Failed to load the generated map image data URL into an Image object.");
                await domUtils.showModal('alert', 'Error', 'Failed to display the generated map image.');
                domUtils.updateStatus("Error displaying generated map.", true);
                // Attempt to clean up state? Maybe reset to placeholder
                 cfg.setMapImage(null);
                 cfg.setMapInfo({ name: "Untitled Map", width: 0, height: 0, fileName: "", fileType: "image/png" });
                 if(cfg.jsonLoadLabel) cfg.jsonLoadLabel.setAttribute('data-disabled', 'true');
                 if(cfg.saveButton) cfg.saveButton.disabled = true;
                 if(cfg.loadFlagsButton) cfg.loadFlagsButton.disabled = true;
                 cfg.setNations([]);
                 canvasUtils.resetView(); // Will draw placeholder
                 domUtils.updateNationList();
                 domUtils.updateInfoPanel(null);
            };

            // Set the src to trigger loading
            finalMapImage.src = generatedMapDataUrl;

        } else {
            // Handle case where generateMap resolves but with no data
            throw new Error("Map generation process completed but returned no image data.");
        }

    } catch (error) {
        console.error("Map Generation Failed:", error);
        await domUtils.showModal('alert', 'Generation Error', `Tool not developed yet :C: ${error.message}`);
        domUtils.updateStatus(`Map generation failed: ${error.message}`, true);
        // Ensure state reflects failure - potentially reset map image etc. if needed
        // The 'finally' block will handle re-enabling basic controls.
    } finally {
        console.log("Map generation process finished (success or failure). Re-enabling controls.");
        // --- Re-enable controls ---
        // Always allow generating or loading a new map
        if (cfg.generateMapButton) cfg.generateMapButton.disabled = false;
        if (cfg.loadMapLabel) cfg.loadMapLabel.removeAttribute('data-disabled');

        // Only enable JSON/Flags/Save if a map actually exists now
        if (cfg.mapImage) {
            if (cfg.jsonLoadLabel) cfg.jsonLoadLabel.removeAttribute('data-disabled');
            if (cfg.loadFlagsButton) cfg.loadFlagsButton.disabled = false;
            if (cfg.saveButton) cfg.saveButton.disabled = false;
        } else {
             if (cfg.jsonLoadLabel) cfg.jsonLoadLabel.setAttribute('data-disabled', 'true');
             if (cfg.loadFlagsButton) cfg.loadFlagsButton.disabled = true;
             if (cfg.saveButton) cfg.saveButton.disabled = true;
        }
    }
}


// --- Run Initialization ---
// Use DOMContentLoaded to ensure the initial HTML is parsed
document.addEventListener('DOMContentLoaded', initializeApp);

// --- END OF FILE js/main.js ---