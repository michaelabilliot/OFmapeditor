// --- START OF FILE js/main.js ---
import * as cfg from './config.js';
import * as domUtils from './domUtils.js';
import * as canvasUtils from './canvasUtils.js';
import * as mapUtils from './mapUtils.js';
import * as dataUtils from './dataUtils.js';
import * as nationUtils from './nationUtils.js';
import * as handlers from './eventHandlers.js';

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
    domUtils.populateDynamicElements();

    // 4. Assign references AGAIN to capture the DYNAMICALLY added elements
    //    This will re-assign static elements too, but crucially finds the dynamic ones now.
    cfg.assignElements();

    // 5. Check if essential DYNAMIC elements were found (optional but good practice)
    //    Add checks here for elements like cfg.saveButton, cfg.markerSizeInput etc. if needed
    if (!cfg.loadMapLabel || !cfg.saveButton || !cfg.markerSizeInput) {
         console.warn("Some dynamic UI elements might be missing. Check populateDynamicElements() and IDs.");
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

// --- Run Initialization ---
// Use DOMContentLoaded to ensure the initial HTML is parsed
document.addEventListener('DOMContentLoaded', initializeApp);

// --- END OF FILE js/main.js ---