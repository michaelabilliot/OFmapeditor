// --- START OF FILE config.js ---

// --- DOM Elements (will be assigned in main.js) ---
export let canvas, canvasContainer, ctx;
// Added paramWaterLevel, paramSeedRandomizeButton
export let generateMapButton, paramSeed, paramWidth, paramHeight, paramNumFaults, paramSmoothingIterations, paramNoiseSeed, paramNoiseOctaves, paramNoisePersistence, paramNoiseLacunarity, paramNoiseScale, paramNoiseStrength, paramEnableSymmetry, paramWaterLevel, paramSeedRandomizeButton; // Generation UI elements
export let jsonLoadInput, jsonLoadLabel, saveButton, loadFlagsButton;
export let statusDiv, coordinateDisplay, nationListContainer, nationListUl, nationListCountSpan, settingsButton, settingsPanel;
export let closeSettingsButton, markerSizeInput, markerSizeValue, darkModeToggle, nationTextSizeInput, nationTextSizeValue, flagSizeInput, flagSizeValue;
export let inlineEditPanel, inlineEditName, inlineEditStrength, inlineEditSave, inlineEditCancel;
export let infoNameSpan, infoStrengthSpan, infoPlaceholder;
export let infoFlagPreview, infoFlagStatus, infoFlagUploadInput, infoFlagUploadLabel, infoFlagRemoveButton;
export let editFlagButton, flagEditorModalContainer;

export let modalOverlay, modalDialog, modalTitle, modalMessage, modalInputContainer, modalInput, modalButtons, modalOk, modalCancel, modalConfirm, modalDeny;
export let controlsDiv, instructionsDiv, infoPanel;
export let instrTopContainer, canvasTopContainer, infoTopContainer;

// --- State Variables ---
let _markerRadius = 8;
let _nationTextSize = 12;
let _flagBaseDisplaySize = 30;
export let nations = [];
export let mapImage = null; // Holds the *colorized* map image
export let mapInfo = { name: "Generated Map", width: 0, height: 0, fileName: "generated_map.png", fileType: "image/png" };
export let selectedNationIndex = null;
export let hoveredNationIndex = null;
export let hoveredListIndex = null;
export let isSettingsVisible = false;
export let nationIndexBeingEdited = null;
export let zoom = 1.0;
export let offsetX = 0;
export let offsetY = 0;
export const minZoom = 0.05;
export const maxZoom = 25.0;
export const zoomSensitivity = 0.0005;
export let isPanning = false;
export let draggingNation = false;
export let potentialPan = false;
export let mouseDownPos = { x: 0, y: 0 };
export let panStartOffset = { x: 0, y: 0 };
export let dragNationOffset = { x: 0, y: 0 };
export const panThreshold = 5;
export let currentModalResolve = null;
export let isPanningAnimationActive = false;
export let isGeneratingMap = false; // Flag to prevent concurrent generation

// --- Default Generation Parameters (Updated from image) ---
export const defaultGenParams = {
    seed: 12345,
    width: 2000,       // Updated
    height: 1000,      // Updated
    numFaults: 500,    // Updated
    enableSymmetry: true, // Updated (checked)
    waterLevel: 104,   // Updated
    smoothing: {
        iterations: 2, // Updated
    },
    noise: {
        seed: 54321,
        octaves: 12,   // Updated
        persistence: 0.5, // Updated
        lacunarity: 2.2, // Updated
        scale: 400,    // Updated
        strength: 0.6  // Updated
    }
};

// --- Getters ---
export const markerRadius = () => _markerRadius;
export const nationTextSize = () => _nationTextSize;
export const flagBaseDisplaySize = () => _flagBaseDisplaySize;

// --- Assign Elements ---
export function assignElements() {
    canvas = document.getElementById('mapCanvas');
    canvasContainer = document.getElementById('canvas-container');
    settingsButton = document.getElementById('settingsButton');
    settingsPanel = document.getElementById('settingsPanel');
    controlsDiv = document.getElementById('controls');
    coordinateDisplay = document.getElementById('coordinateDisplay');
    statusDiv = document.getElementById('status');
    instructionsDiv = document.getElementById('instructions');
    infoPanel = document.getElementById('info-panel');
    instrTopContainer = document.getElementById('instr-top-container');
    canvasTopContainer = document.getElementById('canvas-top-container');
    infoTopContainer = document.getElementById('info-top-container');
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
    editFlagButton = document.getElementById('editFlagButton');
    flagEditorModalContainer = document.getElementById('flagEditorModalContainer');
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
    ctx = canvas ? canvas.getContext('2d') : null;
    // Generation elements
    generateMapButton = document.getElementById('generateMapButton');
    paramSeed = document.getElementById('paramSeed');
    paramWidth = document.getElementById('paramWidth');
    paramHeight = document.getElementById('paramHeight');
    paramNumFaults = document.getElementById('paramNumFaults');
    paramEnableSymmetry = document.getElementById('paramEnableSymmetry');
    paramSmoothingIterations = document.getElementById('paramSmoothingIterations');
    paramNoiseSeed = document.getElementById('paramNoiseSeed');
    paramNoiseOctaves = document.getElementById('paramNoiseOctaves');
    paramNoisePersistence = document.getElementById('paramNoisePersistence');
    paramNoiseLacunarity = document.getElementById('paramNoiseLacunarity');
    paramNoiseScale = document.getElementById('paramNoiseScale');
    paramNoiseStrength = document.getElementById('paramNoiseStrength');
    paramWaterLevel = document.getElementById('paramWaterLevel'); // Assign water level
    paramSeedRandomizeButton = document.getElementById('paramSeedRandomizeButton'); // Assign randomize button
    // Other controls
    jsonLoadInput = document.getElementById('jsonLoadInput');
    jsonLoadLabel = document.getElementById('jsonLoadLabel');
    saveButton = document.getElementById('saveButton');
    loadFlagsButton = document.getElementById('loadFlagsButton');
    closeSettingsButton = document.getElementById('closeSettingsButton');
    markerSizeInput = document.getElementById('markerSizeInput');
    markerSizeValue = document.getElementById('markerSizeValue');
    darkModeToggle = document.getElementById('darkModeToggle');
    nationTextSizeInput = document.getElementById('nationTextSizeInput');
    nationTextSizeValue = document.getElementById('nationTextSizeValue');
    flagSizeInput = document.getElementById('flagSizeInput');
    flagSizeValue = document.getElementById('flagSizeValue');
}

// --- Setters ---
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
export function setIsGeneratingMap(state) { isGeneratingMap = state; }

// --- END OF FILE config.js ---