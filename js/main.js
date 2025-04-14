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
    cfg.assignElements();

    // 2. Check if essential STATIC elements were found
    if (!cfg.canvas || !cfg.ctx || !cfg.statusDiv || !cfg.settingsPanel || !cfg.controlsDiv || !cfg.instructionsDiv) {
        console.error("Essential static DOM elements not found! Aborting initialization.");
        document.body.innerHTML = "<h1>Error: Could not initialize editor. Essential container elements missing. Check HTML IDs.</h1>";
        return;
    }

    // 3. Populate dynamic HTML content (controls, instructions, settings)
    //    This requires the container elements (cfg.settingsPanel etc.) to be assigned already.
    domUtils.populateDynamicElements(); // Make sure this ADDS to #controls or modifies it carefully if the Generate button is static HTML

    // 4. Assign references AGAIN to capture the DYNAMICALLY added elements AND statically added ones like GenerateMapButton
    //    This will re-assign static elements too, but crucially finds the dynamic ones now.
    cfg.assignElements();

    // 5. Check if essential DYNAMIC elements were found (optional but good practice)
    if (!cfg.loadMapLabel || !cfg.saveButton || !cfg.markerSizeInput || !cfg.generateMapButton) { // Added check for generateMapButton
         console.warn("Some dynamic or essential UI elements might be missing. Check populateDynamicElements(), HTML IDs, and config.js.");
         // Decide if this is critical enough to abort
    }

    // 6. Load settings (theme, sizes) and apply them
    //    This requires the settings input elements to be assigned now.
    domUtils.loadSettings();

    // 7. Setup all event listeners
    //    This requires all button/input elements to be assigned.
    setupEventListeners();

    // 8. Set initial UI states
    cfg.settingsPanel.style.display = cfg.isSettingsVisible ? 'block' : 'none';
    domUtils.updateNationList();
    domUtils.updateInfoPanel(null);
    canvasUtils.setInitialCanvasSize(); // Set initial canvas size based on container
    canvasUtils.drawPlaceholder(); // Draw initial placeholder or empty state
    domUtils.updateCursor(); // Set initial cursor

    // 9. Setup Resize Observer
    if (cfg.canvasContainer) {
        const resizeObserver = new ResizeObserver(entries => {
            // We might get multiple entries, handle the container resize
            for (let entry of entries) {
                if (entry.target === cfg.canvasContainer) {
                    handlers.handleResize(); // Call the handler function
                }
            }
        });
        resizeObserver.observe(cfg.canvasContainer);
    } else {
        console.error("Canvas container not found, cannot set up resize observer.");
    }


    console.log("Map Editor Initialized Successfully.");
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
    cfg.generateMapButton?.addEventListener('click', handleGenerateMapClick); // <<<--- ADDED LISTENER

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
         const canvasPos = canvasUtils.getCanvasMousePos(event);
         if (!canvasPos) return;
         const mapPos = canvasUtils.canvasToMapCoords(canvasPos.x, canvasPos.y);
         const clickedNationIndex = canvasUtils.getNationAtPos(mapPos);
         if (clickedNationIndex !== null && !cfg.inlineEditPanel.contains(event.target)) {
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
}


// --- Map Generation Handler --- <<<--- NEW FUNCTION
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
        'This will replace the current map and clear all nations. Are you sure?',
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
        await domUtils.showModal('alert', 'Generation Error', `Failed to generate map: ${error.message}`);
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