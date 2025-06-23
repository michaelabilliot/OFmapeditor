import * as cfg from './config.js';
import * as domUtils from './domUtils.js';
import * as canvasUtils from './canvasUtils.js';
import * as mapUtils from './mapUtils.js';
import * as dataUtils from './dataUtils.js';
import * as nationUtils from './nationUtils.js';
import * as handlers from './eventHandlers.js';
import { initFlagEditor } from './flagEditor.js';
// *** ADDED: Import Full Flag Editor initialization ***
import { initFullFlagEditor } from './fullflagEditor.js';

// *** ADDED: View switching elements ***
let mapEditorView = null;
let fullFlagEditorView = null;
let navMapEditorTab = null;
let navFlagEditorTab = null;

/** Initializes the application: assigns elements, loads settings, sets up listeners */
function initializeApp() {
  console.log('Initializing OpenFront Map Editor...');

  // 1. Assign references to STATIC DOM elements first
  cfg.assignElements();
  // *** ADDED: Assign view containers and nav tabs ***
  mapEditorView = document.getElementById('map-editor-view');
  fullFlagEditorView = document.getElementById('full-flag-editor-view');
  navMapEditorTab = document.getElementById('nav-map-editor');
  navFlagEditorTab = document.getElementById('nav-flag-editor');

  // 2. Check if essential STATIC elements were found
  if (
    !cfg.canvas ||
    !cfg.ctx ||
    !cfg.statusDiv ||
    !cfg.settingsPanel ||
    !cfg.controlsDiv ||
    !cfg.instructionsDiv ||
    !cfg.canvasContainer ||
    !cfg.infoPanel ||
    !cfg.instrTopContainer ||
    !cfg.canvasTopContainer ||
    !cfg.infoTopContainer ||
    !cfg.flagEditorModalContainer ||
    !mapEditorView ||
    !fullFlagEditorView ||
    !navMapEditorTab ||
    !navFlagEditorTab
  ) {
    // Added checks
    console.error(
      'Essential static DOM elements not found! Aborting initialization. Check HTML structure and IDs.',
      {
        canvas: !!cfg.canvas,
        ctx: !!cfg.ctx,
        statusDiv: !!cfg.statusDiv,
        settingsPanel: !!cfg.settingsPanel,
        controlsDiv: !!cfg.controlsDiv,
        instructionsDiv: !!cfg.instructionsDiv,
        canvasContainer: !!cfg.canvasContainer,
        infoPanel: !!cfg.infoPanel,
        instrTopContainer: !!cfg.instrTopContainer,
        canvasTopContainer: !!cfg.canvasTopContainer,
        infoTopContainer: !!cfg.infoTopContainer,
        flagEditorModalContainer: !!cfg.flagEditorModalContainer,
        mapEditorView: !!mapEditorView,
        fullFlagEditorView: !!fullFlagEditorView,
        navMapEditorTab: !!navMapEditorTab,
        navFlagEditorTab: !!navFlagEditorTab,
      }
    );
    document.body.innerHTML = `<div style="padding: 20px; text-align: center;"><h1>Initialization Error</h1><p>Could not start the map editor because some essential HTML elements are missing.</p><p>Check the browser console (F12) for more details.</p></div>`;
    return; // Stop initialization
  }

  // 3. Populate dynamic HTML content (controls, instructions, settings)
  domUtils.populateDynamicElements();
  initFlagEditor(); // Initialize the Flag Editor MODAL structure
  // *** ADDED: Initialize Full Flag Editor UI ***
  initFullFlagEditor();

  // 4. Assign references AGAIN to capture the DYNAMICALLY added elements
  cfg.assignElements();

  // 5. Check if essential DYNAMIC elements were found
  if (
    !cfg.loadMapLabel ||
    !cfg.saveButton ||
    !cfg.markerSizeInput ||
    !cfg.editFlagButton
  ) {
    console.warn(
      'Some dynamic UI elements might be missing after population. Check populateDynamicElements() and resulting HTML IDs.'
    );
  }

  // 6. Load settings (theme, sizes) from localStorage and apply them
  domUtils.loadSettings();

  // 7. Setup all event listeners for user interaction
  setupEventListeners(); // Includes nav listeners now

  // 8. Set initial UI states
  cfg.settingsPanel.style.display = cfg.isSettingsVisible ? 'block' : 'none';
  domUtils.updateNationList();
  domUtils.updateInfoPanel(null);
  canvasUtils.setInitialCanvasSize();
  canvasUtils.drawPlaceholder();
  domUtils.updateCursor();
  domUtils.updateZoomDisplay();
  // *** ADDED: Set initial view to Map Editor ***
  showView('map');

  // 9. Setup Resize Observer
  if (cfg.canvasContainer) {
    const resizeObserver = new ResizeObserver((entries) => {
      window.requestAnimationFrame(() => {
        for (let entry of entries) {
          if (entry.target === cfg.canvasContainer) {
            handlers.handleResize();
          }
        }
      });
    });
    resizeObserver.observe(cfg.canvasContainer);
  } else {
    console.error('Canvas container not found, cannot set up resize observer.');
  }

  console.log('Map Editor Initialized Successfully.');
}

// *** ADDED: Function to switch between main views ***
function showView(viewName) {
  if (
    !mapEditorView ||
    !fullFlagEditorView ||
    !navMapEditorTab ||
    !navFlagEditorTab
  )
    return;

  if (viewName === 'map') {
    mapEditorView.style.display = 'grid'; // Use grid for map editor
    fullFlagEditorView.style.display = 'none';
    navMapEditorTab.classList.add('active');
    navMapEditorTab.setAttribute('aria-current', 'page');
    navFlagEditorTab.classList.remove('active');
    navFlagEditorTab.removeAttribute('aria-current');
    // Optional: Recalculate canvas size if needed when switching back
    if (cfg.canvasContainer) {
      handlers.handleResize();
    }
  } else if (viewName === 'flag') {
    mapEditorView.style.display = 'none';
    fullFlagEditorView.style.display = 'flex'; // Use flex for flag editor
    navMapEditorTab.classList.remove('active');
    navMapEditorTab.removeAttribute('aria-current');
    navFlagEditorTab.classList.add('active');
    navFlagEditorTab.setAttribute('aria-current', 'page');
  }
}

/** Attaches all necessary event listeners to DOM elements */
function setupEventListeners() {
  // Settings Panel
  cfg.settingsButton?.addEventListener('click', handlers.handleSettingsToggle);
  cfg.closeSettingsButton?.addEventListener(
    'click',
    handlers.handleSettingsToggle
  );
  cfg.markerSizeInput?.addEventListener('input', domUtils.applySettings);
  cfg.markerSizeInput?.addEventListener('change', domUtils.saveSettings);
  cfg.nationTextSizeInput?.addEventListener('input', domUtils.applySettings);
  cfg.nationTextSizeInput?.addEventListener('change', domUtils.saveSettings);
  cfg.flagSizeInput?.addEventListener('input', domUtils.applySettings);
  cfg.flagSizeInput?.addEventListener('change', domUtils.saveSettings);
  cfg.darkModeToggle?.addEventListener('change', () => {
    domUtils.applySettings();
    domUtils.saveSettings();
  });

  // Top Controls (Dynamically Added)
  cfg.loadMapLabel?.addEventListener('click', handlers.handleMapLoadClick);
  cfg.imageInput?.addEventListener('change', handlers.handleMapFileSelect);
  cfg.jsonLoadInput?.addEventListener('change', handlers.handleJsonFileSelect);
  cfg.loadFlagsButton?.addEventListener('click', dataUtils.promptAndLoadFlags);
  cfg.saveButton?.addEventListener('click', dataUtils.saveProjectAsZip);

  // Static Zoom Controls
  document
    .getElementById('zoomInButton')
    ?.addEventListener('click', () => canvasUtils.changeZoom(1.25));
  document
    .getElementById('zoomOutButton')
    ?.addEventListener('click', () => canvasUtils.changeZoom(1 / 1.25));
  document
    .getElementById('zoomResetButton')
    ?.addEventListener('click', canvasUtils.resetView);

  // Canvas Interaction
  if (cfg.canvas) {
    cfg.canvas.addEventListener('mousedown', handlers.handleCanvasMouseDown);
    cfg.canvas.addEventListener('mousemove', handlers.handleCanvasMouseMove);
    window.addEventListener('mouseup', handlers.handleCanvasMouseUp);
    cfg.canvas.addEventListener('mouseout', handlers.handleCanvasMouseOut);
    cfg.canvas.addEventListener('wheel', handlers.handleCanvasWheel, {
      passive: false,
    });
    cfg.canvas.addEventListener(
      'contextmenu',
      handlers.handleCanvasContextMenu
    );
    cfg.canvas.addEventListener('dblclick', (event) => {
      if (
        event.button !== 0 ||
        !cfg.mapImage ||
        cfg.isPanning ||
        cfg.draggingNation ||
        cfg.currentModalResolve ||
        cfg.isPanningAnimationActive ||
        !cfg.inlineEditPanel
      )
        return;
      const canvasPos = canvasUtils.getCanvasMousePos(event);
      if (!canvasPos) return;
      const mapPos = canvasUtils.canvasToMapCoords(canvasPos.x, canvasPos.y);
      if (!mapPos) return;
      const clickedNationIndex = canvasUtils.getNationAtPos(mapPos);
      if (
        clickedNationIndex !== null &&
        !cfg.inlineEditPanel.contains(event.target)
      ) {
        event.preventDefault();
        const nation = cfg.nations[clickedNationIndex];
        if (nation && nation.coordinates) {
          cfg.setSelectedNationIndex(clickedNationIndex);
          domUtils.openInlineEditor(
            clickedNationIndex,
            nation.coordinates[0],
            nation.coordinates[1]
          );
          canvasUtils.redrawCanvas();
          domUtils.updateNationList();
          domUtils.updateInfoPanel(clickedNationIndex);
        }
      }
    });
  } else {
    console.error(
      'Canvas element not found, cannot add interaction listeners.'
    );
  }

  // Inline Editor Buttons
  cfg.inlineEditSave?.addEventListener('click', handlers.handleInlineEditSave);
  cfg.inlineEditCancel?.addEventListener(
    'click',
    handlers.handleInlineEditCancel
  );

  // Info Panel Flag Controls
  cfg.infoFlagUploadInput?.addEventListener(
    'change',
    handlers.handleFlagUploadChange
  );
  cfg.infoFlagRemoveButton?.addEventListener(
    'click',
    handlers.handleFlagRemoveClick
  );
  cfg.editFlagButton?.addEventListener('click', handlers.handleFlagEditorClick); // Modal editor button

  // --- NEW: Colorizer Control Listeners ---
  cfg.lowRangeSlider?.addEventListener(
    'input',
    handlers.handleColorizerSliderChange
  );
  cfg.midRangeSlider?.addEventListener(
    'input',
    handlers.handleColorizerSliderChange
  );
  cfg.highRangeSlider?.addEventListener(
    'input',
    handlers.handleColorizerSliderChange
  );
  cfg.confirmColorizeBtn?.addEventListener(
    'click',
    handlers.handleConfirmColorizeClick
  );

  // Global Keyboard Listener
  document.addEventListener('keydown', handlers.handleDocumentKeyDown);

  // *** ADDED: Navigation Tab Listeners ***
  navMapEditorTab?.addEventListener('click', () => showView('map'));
  navFlagEditorTab?.addEventListener('click', () => showView('flag'));
}

// --- Run Initialization ---
document.addEventListener('DOMContentLoaded', initializeApp);
