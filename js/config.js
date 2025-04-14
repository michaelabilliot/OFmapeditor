// --- START OF FILE js/config.js ---

// --- DOM Elements (will be assigned in main.js) ---
export let canvas, canvasContainer, ctx;
export let imageInput, loadMapLabel, jsonLoadInput, jsonLoadLabel, saveButton, loadFlagsButton, zoomInButton, zoomOutButton, zoomResetButton, zoomDisplay;
export let statusDiv, coordinateDisplay, nationListContainer, nationListUl, nationListCountSpan, settingsButton, settingsPanel;
export let closeSettingsButton, markerSizeInput, markerSizeValue, darkModeToggle, nationTextSizeInput, nationTextSizeValue, flagSizeInput, flagSizeValue;
export let inlineEditPanel, inlineEditName, inlineEditStrength, inlineEditSave, inlineEditCancel;
export let infoNameSpan, infoStrengthSpan, infoPlaceholder;
export let infoFlagPreview, infoFlagStatus, infoFlagUploadInput, infoFlagUploadLabel, infoFlagRemoveButton;
export let modalOverlay, modalDialog, modalTitle, modalMessage, modalInputContainer, modalInput, modalButtons, modalOk, modalCancel, modalConfirm, modalDeny;
export let controlsDiv, instructionsDiv, infoPanel; // Added infoPanel here for export clarity
export let topInfoDiv; // Added for layout reference

// --- State Variables ---
let _markerRadius = 8;
let _nationTextSize = 12;
let _flagBaseDisplaySize = 30;
export let nations = []; // { coordinates: [x, y], name: "", strength: 0, flag: "base_name" | null, flagImage: Image | null, flagData: string | null, flagDataType: 'svg' | 'png' | 'jpeg' | 'gif' | 'webp' | null, flagWidth: number | null, flagHeight: number | null }
export let mapImage = null; // Holds the *colorized* map image
export let mapInfo = { name: "Untitled Map", width: 0, height: 0, fileName: "", fileType: "image/png" };
export let selectedNationIndex = null;
export let hoveredNationIndex = null;
export let hoveredListIndex = null;
export let isSettingsVisible = true;
export let nationIndexBeingEdited = null;
export let zoom = 1.0;
export let offsetX = 0;
export let offsetY = 0;
export const minZoom = 0.05;
export const maxZoom = 25.0;
// --- ADJUSTED ZOOM SENSITIVITY ---
export const zoomSensitivity = 0.0005; // Reduced from 0.001 to make zoom slower
// ---------------------------------
export let isPanning = false;
export let draggingNation = false;
export let potentialPan = false;
export let mouseDownPos = { x: 0, y: 0 };
export let panStartOffset = { x: 0, y: 0 };
export let dragNationOffset = { x: 0, y: 0 };
export const panThreshold = 5;
export let currentModalResolve = null;
export let isPanningAnimationActive = false;

// --- Getters for state variables that need setters ---
export const markerRadius = () => _markerRadius;
export const nationTextSize = () => _nationTextSize;
export const flagBaseDisplaySize = () => _flagBaseDisplaySize;

// --- Function to assign elements after DOM load ---
export function assignElements() {
    // Assign static layout containers first
    canvas = document.getElementById('mapCanvas');
    canvasContainer = document.getElementById('canvas-container');
    settingsButton = document.getElementById('settingsButton');
    settingsPanel = document.getElementById('settingsPanel');
    controlsDiv = document.getElementById('controls');
    coordinateDisplay = document.getElementById('coordinateDisplay');
    statusDiv = document.getElementById('status');
    instructionsDiv = document.getElementById('instructions');
    infoPanel = document.getElementById('info-panel');
    topInfoDiv = document.getElementById('top-info'); // Assign top-info container

    // Assign interactive elements that exist in base HTML
    inlineEditPanel = document.getElementById('inlineEditPanel');
    inlineEditName = document.getElementById('inlineEditName');
    inlineEditStrength = document.getElementById('inlineEditStrength');
    inlineEditSave = document.getElementById('inlineEditSave');
    inlineEditCancel = document.getElementById('inlineEditCancel');
    infoNameSpan = document.getElementById('info-name');
    infoStrengthSpan = document.getElementById('info-strength');
    infoPlaceholder = document.getElementById('info-placeholder');
    infoFlagPreview = document.getElementById('info-flag-preview');
    infoFlagStatus = document.getElementById('info-flag-status');
    infoFlagUploadInput = document.getElementById('info-flag-upload-input');
    infoFlagUploadLabel = document.getElementById('info-flag-upload-label');
    infoFlagRemoveButton = document.getElementById('info-flag-remove-button');
    nationListContainer = document.getElementById('nationListContainer');
    nationListUl = document.getElementById('nationList');
    nationListCountSpan = document.getElementById('nationListCount');
    modalOverlay = document.getElementById('modal-overlay');
    modalDialog = document.getElementById('modal-dialog');
    modalTitle = document.getElementById('modal-title');
    modalMessage = document.getElementById('modal-message');
    modalInputContainer = document.getElementById('modal-input-container');
    modalInput = document.getElementById('modal-input');
    modalButtons = document.getElementById('modal-buttons');
    modalOk = document.getElementById('modal-ok');
    modalCancel = document.getElementById('modal-cancel');
    modalConfirm = document.getElementById('modal-confirm');
    modalDeny = document.getElementById('modal-deny');

    // Get canvas context if canvas exists
    ctx = canvas ? canvas.getContext('2d') : null;

    // Assign elements dynamically added by populateDynamicElements
    // These might be null on the first call in main.js
    imageInput = document.getElementById('mapImageInput');
    loadMapLabel = document.getElementById('loadMapLabel');
    jsonLoadInput = document.getElementById('jsonLoadInput');
    jsonLoadLabel = document.getElementById('jsonLoadLabel');
    saveButton = document.getElementById('saveButton');
    loadFlagsButton = document.getElementById('loadFlagsButton');
    zoomInButton = document.getElementById('zoomInButton');
    zoomOutButton = document.getElementById('zoomOutButton');
    zoomResetButton = document.getElementById('zoomResetButton');
    zoomDisplay = document.getElementById('zoomDisplay');
    closeSettingsButton = document.getElementById('closeSettingsButton');
    markerSizeInput = document.getElementById('markerSizeInput');
    markerSizeValue = document.getElementById('markerSizeValue');
    darkModeToggle = document.getElementById('darkModeToggle');
    nationTextSizeInput = document.getElementById('nationTextSizeInput');
    nationTextSizeValue = document.getElementById('nationTextSizeValue');
    flagSizeInput = document.getElementById('flagSizeInput');
    flagSizeValue = document.getElementById('flagSizeValue');
}

// --- State Modifiers (Setters) ---
export function setMarkerRadius(value) { _markerRadius = value; }
export function setNationTextSize(value) { _nationTextSize = value; }
export function setFlagBaseDisplaySize(value) { _flagBaseDisplaySize = value; }
export function setNations(newNations) { nations = newNations; }
export function setMapImage(newMapImage) { mapImage = newMapImage; }
export function setMapInfo(newMapInfo) { mapInfo = newMapInfo; }
export function setSelectedNationIndex(index) { selectedNationIndex = index; }
export function setHoveredNationIndex(index) { hoveredNationIndex = index; }
export function setHoveredListIndex(index) { hoveredListIndex = index; }
export function setNationIndexBeingEdited(index) { nationIndexBeingEdited = index; }
export function setZoom(newZoom) { zoom = newZoom; }
export function setOffsetX(newOffsetX) { offsetX = newOffsetX; }
export function setOffsetY(newOffsetY) { offsetY = newOffsetY; }
export function setIsPanning(state) { isPanning = state; }
export function setDraggingNation(state) { draggingNation = state; }
export function setPotentialPan(state) { potentialPan = state; }
export function setMouseDownPos(pos) { mouseDownPos = pos; }
export function setPanStartOffset(offset) { panStartOffset = offset; }
export function setDragNationOffset(offset) { dragNationOffset = offset; }
export function setCurrentModalResolve(resolveFn) { currentModalResolve = resolveFn; }
export function setIsPanningAnimationActive(state) { isPanningAnimationActive = state; }
export function setIsSettingsVisible(state) { isSettingsVisible = state; }

// --- END OF FILE js/config.js ---