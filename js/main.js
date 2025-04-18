// --- START OF FILE main.js ---

import * as cfg from './config.js';
import * as domUtils from './domUtils.js';
import * as canvasUtils from './canvasUtils.js';
// mapUtils is used by eventHandlers
import * as dataUtils from './dataUtils.js';
// nationUtils is used by eventHandlers
import * as handlers from './eventHandlers.js';
import { initFlagEditor } from './flagEditor.js';
import { initFullFlagEditor } from './fullflagEditor.js';

let mapEditorView = null;
let fullFlagEditorView = null;
let navMapEditorTab = null;
let navFlagEditorTab = null;

function initializeApp() {
    console.log("Initializing OpenFront Map Editor...");

    // 1. Assign static elements
    cfg.assignElements();
    mapEditorView = document.getElementById('map-editor-view');
    fullFlagEditorView = document.getElementById('full-flag-editor-view');
    navMapEditorTab = document.getElementById('nav-map-editor');
    navFlagEditorTab = document.getElementById('nav-flag-editor');

    // 2. Check essential static elements
    if (!cfg.canvas || !cfg.ctx || !cfg.statusDiv || !cfg.settingsPanel || !cfg.controlsDiv || !cfg.instructionsDiv || !cfg.canvasContainer || !cfg.infoPanel || !cfg.instrTopContainer || !cfg.canvasTopContainer || !cfg.infoTopContainer || !cfg.flagEditorModalContainer || !mapEditorView || !fullFlagEditorView || !navMapEditorTab || !navFlagEditorTab) {
        console.error("Essential static DOM elements not found! Aborting initialization.");
        document.body.innerHTML = `<div style="padding: 20px; text-align: center;"><h1>Initialization Error</h1><p>Could not start the map editor.</p></div>`;
        return;
    }

    // 3. Populate dynamic HTML
    domUtils.populateDynamicElements();
    initFlagEditor();
    initFullFlagEditor();

    // 4. Assign dynamic elements AGAIN
    cfg.assignElements();

    // 5. Check essential dynamic elements
    if (!cfg.generateMapButton || !cfg.saveButton || !cfg.markerSizeInput || !cfg.editFlagButton || !cfg.paramSeedRandomizeButton || !cfg.paramWaterLevel) { // Added checks
         console.warn("Some dynamic UI elements might be missing after population.");
    }

    // 6. Load settings
    domUtils.loadSettings();

    // 7. Setup event listeners
    setupEventListeners();

    // 8. Initial UI state
    cfg.settingsPanel.style.display = cfg.isSettingsVisible ? 'block' : 'none';
    domUtils.updateNationList();
    domUtils.updateInfoPanel(null);
    canvasUtils.setInitialCanvasSize();
    canvasUtils.drawPlaceholder();
    domUtils.updateCursor();
    domUtils.updateZoomDisplay();
    showView('map');

    // 9. Setup Resize Observer
    if (cfg.canvasContainer) {
        const resizeObserver = new ResizeObserver(entries => {
            window.requestAnimationFrame(() => {
                 for (let entry of entries) { if (entry.target === cfg.canvasContainer) handlers.handleResize(); }
            });
        });
        resizeObserver.observe(cfg.canvasContainer);
    } else { console.error("Canvas container not found, cannot set up resize observer."); }

    console.log("Map Editor Initialized Successfully.");
}

function showView(viewName) {
    if (!mapEditorView || !fullFlagEditorView || !navMapEditorTab || !navFlagEditorTab) return;
    if (viewName === 'map') {
        mapEditorView.style.display = 'grid'; fullFlagEditorView.style.display = 'none';
        navMapEditorTab.classList.add('active'); navMapEditorTab.setAttribute('aria-current', 'page');
        navFlagEditorTab.classList.remove('active'); navFlagEditorTab.removeAttribute('aria-current');
        if (cfg.canvasContainer) handlers.handleResize(); // Recalc canvas size
    } else if (viewName === 'flag') {
        mapEditorView.style.display = 'none'; fullFlagEditorView.style.display = 'flex';
        navMapEditorTab.classList.remove('active'); navMapEditorTab.removeAttribute('aria-current');
        navFlagEditorTab.classList.add('active'); navFlagEditorTab.setAttribute('aria-current', 'page');
    }
}

function setupEventListeners() {
    // Settings Panel
    cfg.settingsButton?.addEventListener('click', handlers.handleSettingsToggle);
    cfg.closeSettingsButton?.addEventListener('click', handlers.handleSettingsToggle);
    cfg.markerSizeInput?.addEventListener('input', domUtils.applySettings);
    cfg.markerSizeInput?.addEventListener('change', domUtils.saveSettings);
    cfg.nationTextSizeInput?.addEventListener('input', domUtils.applySettings);
    cfg.nationTextSizeInput?.addEventListener('change', domUtils.saveSettings);
    cfg.flagSizeInput?.addEventListener('input', domUtils.applySettings);
    cfg.flagSizeInput?.addEventListener('change', domUtils.saveSettings);
    cfg.darkModeToggle?.addEventListener('change', () => { domUtils.applySettings(); domUtils.saveSettings(); });

    // Top Controls
    cfg.generateMapButton?.addEventListener('click', handlers.handleGenerateMapClick);
    cfg.jsonLoadInput?.addEventListener('change', handlers.handleJsonFileSelect);
    cfg.loadFlagsButton?.addEventListener('click', dataUtils.promptAndLoadFlags);
    cfg.saveButton?.addEventListener('click', dataUtils.saveProjectAsZip);
    // Add listener for Randomize Seed button
    cfg.paramSeedRandomizeButton?.addEventListener('click', () => {
        if (cfg.paramSeed) {
            // Generate a reasonably large positive integer seed
            cfg.paramSeed.value = Math.floor(Math.random() * 2147483647); // Max 32-bit signed int value
        }
    });


    // Static Zoom Controls
    document.getElementById('zoomInButton')?.addEventListener('click', () => canvasUtils.changeZoom(1.25));
    document.getElementById('zoomOutButton')?.addEventListener('click', () => canvasUtils.changeZoom(1 / 1.25));
    document.getElementById('zoomResetButton')?.addEventListener('click', canvasUtils.resetView);

    // Canvas Interaction
    if (cfg.canvas) {
        cfg.canvas.addEventListener('mousedown', handlers.handleCanvasMouseDown);
        cfg.canvas.addEventListener('mousemove', handlers.handleCanvasMouseMove);
        window.addEventListener('mouseup', handlers.handleCanvasMouseUp); // Use window for mouseup
        cfg.canvas.addEventListener('mouseout', handlers.handleCanvasMouseOut);
        cfg.canvas.addEventListener('wheel', handlers.handleCanvasWheel, { passive: false });
        cfg.canvas.addEventListener('contextmenu', handlers.handleCanvasContextMenu);
        cfg.canvas.addEventListener('dblclick', (event) => { // Handle double click for inline edit
             if (event.button !== 0 || cfg.isGeneratingMap || !cfg.mapImage || cfg.isPanning || cfg.draggingNation || cfg.currentModalResolve || cfg.isPanningAnimationActive || !cfg.inlineEditPanel) return;
             const canvasPos = canvasUtils.getCanvasMousePos(event); if (!canvasPos) return;
             const mapPos = canvasUtils.canvasToMapCoords(canvasPos.x, canvasPos.y); if (!mapPos) return;
             const clickedNationIndex = canvasUtils.getNationAtPos(mapPos);
             if (clickedNationIndex !== null && !cfg.inlineEditPanel.contains(event.target)) {
                 event.preventDefault(); const nation = cfg.nations[clickedNationIndex];
                 if (nation && nation.coordinates) { cfg.setSelectedNationIndex(clickedNationIndex); domUtils.openInlineEditor(clickedNationIndex, nation.coordinates[0], nation.coordinates[1]); canvasUtils.redrawCanvas(); domUtils.updateNationList(); domUtils.updateInfoPanel(clickedNationIndex); }
             }
        });
    } else { console.error("Canvas element not found, cannot add interaction listeners."); }

    // Inline Editor Buttons
    cfg.inlineEditSave?.addEventListener('click', handlers.handleInlineEditSave);
    cfg.inlineEditCancel?.addEventListener('click', handlers.handleInlineEditCancel);

    // Info Panel Flag Controls
    cfg.infoFlagUploadInput?.addEventListener('change', handlers.handleFlagUploadChange);
    cfg.infoFlagRemoveButton?.addEventListener('click', handlers.handleFlagRemoveClick);
    cfg.editFlagButton?.addEventListener('click', handlers.handleFlagEditorClick);

    // Global Keyboard Listener
    document.addEventListener('keydown', handlers.handleDocumentKeyDown);

    // Navigation Tab Listeners
    navMapEditorTab?.addEventListener('click', () => showView('map'));
    navFlagEditorTab?.addEventListener('click', () => showView('flag'));
}

document.addEventListener('DOMContentLoaded', initializeApp);

// --- END OF FILE main.js ---