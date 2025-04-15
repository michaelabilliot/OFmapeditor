import * as cfg from './config.js';
import * as domUtils from './domUtils.js';
import * as canvasUtils from './canvasUtils.js';
import * as mapUtils from './mapUtils.js';
import * as dataUtils from './dataUtils.js';
import * as nationUtils from './nationUtils.js';
import * as handlers from './eventHandlers.js';
// NEW: Import flagEditor module (assuming initFlagEditor function exists)
import { initFlagEditor } from './flagEditor.js';

/** Initializes the application: assigns elements, loads settings, sets up listeners */
function initializeApp() {
    console.log("Initializing OpenFront Map Editor...");

    // 1. Assign references to STATIC DOM elements first (containers, canvas, etc.)
    cfg.assignElements();

    // 2. Check if essential STATIC elements were found (needed for population)
    if (!cfg.canvas || !cfg.ctx || !cfg.statusDiv || !cfg.settingsPanel || !cfg.controlsDiv || !cfg.instructionsDiv || !cfg.canvasContainer || !cfg.infoPanel || !cfg.topInfoDiv || !cfg.flagEditorModalContainer ) { // Added check for flag editor container
        console.error("Essential static DOM elements not found! Aborting initialization. Check HTML structure and IDs.", {
             canvas: !!cfg.canvas, ctx: !!cfg.ctx, statusDiv: !!cfg.statusDiv, settingsPanel: !!cfg.settingsPanel,
             controlsDiv: !!cfg.controlsDiv, instructionsDiv: !!cfg.instructionsDiv, canvasContainer: !!cfg.canvasContainer,
             infoPanel: !!cfg.infoPanel, topInfoDiv: !!cfg.topInfoDiv, flagEditorModalContainer: !!cfg.flagEditorModalContainer
         });
        // Provide a user-friendly error message in the body
        document.body.innerHTML = `<div style="padding: 20px; text-align: center;">
            <h1>Initialization Error</h1>
            <p>Could not start the map editor because some essential HTML elements are missing.</p>
            <p>Please ensure the HTML file is correct and includes elements with IDs like 'mapCanvas', 'controls', 'settingsPanel', 'info-panel', 'top-info', 'flagEditorModalContainer' etc.</p>
            <p>Check the browser console (F12) for more details.</p>
            </div>`;
        return; // Stop initialization
    }

    // 3. Populate dynamic HTML content (controls, instructions, settings)
    domUtils.populateDynamicElements();
    // NEW: Initialize the Flag Editor modal structure
    initFlagEditor(); // Call initialization function from flagEditor.js

    // 4. Assign references AGAIN to capture the DYNAMICALLY added elements
    cfg.assignElements();

    // 5. Check if essential DYNAMIC elements were found (optional but good practice)
    if (!cfg.loadMapLabel || !cfg.saveButton || !cfg.markerSizeInput || !cfg.zoomInButton || !cfg.editFlagButton) { // Added check for editFlagButton
         console.warn("Some dynamic UI elements might be missing after population. Check populateDynamicElements() and resulting HTML IDs.");
         // Decide if this is critical enough to abort or just warn
    }


    // 6. Load settings (theme, sizes) from localStorage and apply them
    domUtils.loadSettings(); // This also calls applySettings inside

    // 7. Setup all event listeners for user interaction
    setupEventListeners();

    // 8. Set initial UI states
    cfg.settingsPanel.style.display = cfg.isSettingsVisible ? 'block' : 'none';
    domUtils.updateNationList(); // Show initial empty list state
    domUtils.updateInfoPanel(null); // Show initial empty info panel state
    canvasUtils.setInitialCanvasSize(); // Set initial canvas size based on container
    canvasUtils.drawPlaceholder(); // Draw initial placeholder ("Load a map...")
    domUtils.updateCursor(); // Set initial canvas cursor
    domUtils.updateZoomDisplay(); // Set initial zoom display

    // 9. Setup Resize Observer to handle window/container resizing
    if (cfg.canvasContainer) {
        // Use ResizeObserver for efficient monitoring of container size changes
        const resizeObserver = new ResizeObserver(entries => {
            // Use requestAnimationFrame to sync resize handling with browser rendering
            window.requestAnimationFrame(() => {
                 for (let entry of entries) {
                    if (entry.target === cfg.canvasContainer) {
                        handlers.handleResize(); // Call the handler function
                    }
                 }
            });
        });
        resizeObserver.observe(cfg.canvasContainer);
    } else {
        // This case should have been caught by the check in step 2
        console.error("Canvas container not found, cannot set up resize observer.");
    }


    console.log("Map Editor Initialized Successfully.");
}

/** Attaches all necessary event listeners to DOM elements */
function setupEventListeners() {
    // Check element existence before adding listener (belt-and-suspenders)

    // Settings Panel
    cfg.settingsButton?.addEventListener('click', handlers.handleSettingsToggle);
    cfg.closeSettingsButton?.addEventListener('click', handlers.handleSettingsToggle);
    cfg.markerSizeInput?.addEventListener('input', domUtils.applySettings); // Apply visually on input
    cfg.markerSizeInput?.addEventListener('change', domUtils.saveSettings); // Save on change (release)
    cfg.nationTextSizeInput?.addEventListener('input', domUtils.applySettings);
    cfg.nationTextSizeInput?.addEventListener('change', domUtils.saveSettings);
    cfg.flagSizeInput?.addEventListener('input', domUtils.applySettings);
    cfg.flagSizeInput?.addEventListener('change', domUtils.saveSettings);
    cfg.darkModeToggle?.addEventListener('change', () => { domUtils.applySettings(); domUtils.saveSettings(); });

    // Top Controls
    // Use click on the label for map load
    cfg.loadMapLabel?.addEventListener('click', handlers.handleMapLoadClick);
    // Listener is on the hidden input, triggered by the label click or direct interaction
    cfg.imageInput?.addEventListener('change', handlers.handleMapFileSelect);
    // Use click on the label for JSON load (which triggers the input)
    // Listener is on the hidden input
    cfg.jsonLoadInput?.addEventListener('change', handlers.handleJsonFileSelect);
    cfg.loadFlagsButton?.addEventListener('click', dataUtils.promptAndLoadFlags);
    cfg.saveButton?.addEventListener('click', dataUtils.saveProjectAsZip);

    // Zoom Controls
    cfg.zoomInButton?.addEventListener('click', () => canvasUtils.changeZoom(1.25));
    cfg.zoomOutButton?.addEventListener('click', () => canvasUtils.changeZoom(1 / 1.25));
    cfg.zoomResetButton?.addEventListener('click', canvasUtils.resetView);

    // Canvas Interaction
    if (cfg.canvas) {
        cfg.canvas.addEventListener('mousedown', handlers.handleCanvasMouseDown);
        cfg.canvas.addEventListener('mousemove', handlers.handleCanvasMouseMove);
        // Use window mouseup/out to catch events even if cursor leaves canvas mid-drag/pan
        window.addEventListener('mouseup', handlers.handleCanvasMouseUp); // Changed from canvas to window
        cfg.canvas.addEventListener('mouseout', handlers.handleCanvasMouseOut); // Keep mouseout on canvas
        // Use passive: false for wheel event to allow preventDefault() to stop page scroll
        cfg.canvas.addEventListener('wheel', handlers.handleCanvasWheel, { passive: false });
        cfg.canvas.addEventListener('contextmenu', handlers.handleCanvasContextMenu);

        // Double-click listener on canvas for inline edit
        cfg.canvas.addEventListener('dblclick', (event) => {
             // Ignore if not left click, map not loaded, interacting, modal open, animating, or editor panel missing
             if (event.button !== 0 || !cfg.mapImage || cfg.isPanning || cfg.draggingNation || cfg.currentModalResolve || cfg.isPanningAnimationActive || !cfg.inlineEditPanel) return;

             const canvasPos = canvasUtils.getCanvasMousePos(event);
             if (!canvasPos) return;
             const mapPos = canvasUtils.canvasToMapCoords(canvasPos.x, canvasPos.y);
             if (!mapPos) return;

             const clickedNationIndex = canvasUtils.getNationAtPos(mapPos);

             // Check if click was on a nation AND not inside the editor panel (if it's already open)
             if (clickedNationIndex !== null && !cfg.inlineEditPanel.contains(event.target)) {
                 event.preventDefault(); // Prevent text selection etc.
                 const nation = cfg.nations[clickedNationIndex];
                 if (nation && nation.coordinates) {
                    // Select the nation
                    cfg.setSelectedNationIndex(clickedNationIndex);
                    // Open the editor at the nation's location
                    domUtils.openInlineEditor(clickedNationIndex, nation.coordinates[0], nation.coordinates[1]);
                    // Update UI
                    canvasUtils.redrawCanvas(); // Update selection highlight
                    domUtils.updateNationList();
                    domUtils.updateInfoPanel(clickedNationIndex);
                 }
             }
        });
    } else {
        console.error("Canvas element not found, cannot add interaction listeners.");
    }


    // Inline Editor Buttons
    cfg.inlineEditSave?.addEventListener('click', handlers.handleInlineEditSave);
    cfg.inlineEditCancel?.addEventListener('click', handlers.handleInlineEditCancel);

    // Info Panel Flag Controls
    // Listener on the hidden input, triggered by label click
    cfg.infoFlagUploadInput?.addEventListener('change', handlers.handleFlagUploadChange);
    cfg.infoFlagRemoveButton?.addEventListener('click', handlers.handleFlagRemoveClick);
    // NEW: Listener for Flag Editor Button
    cfg.editFlagButton?.addEventListener('click', handlers.handleFlagEditorClick);


    // Global Keyboard Listener (attached to document)
    document.addEventListener('keydown', handlers.handleDocumentKeyDown);

    // Note: Nation list item listeners (hover, click, dblclick, delete)
    // are added dynamically in domUtils.updateNationList() when the list is rebuilt.
}

// --- Run Initialization ---
// Use DOMContentLoaded to ensure the initial HTML is parsed before trying to find elements
document.addEventListener('DOMContentLoaded', initializeApp);

// --- END OF FILE js/main.js ---