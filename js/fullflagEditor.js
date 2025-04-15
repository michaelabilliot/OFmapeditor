import * as mainCfg from './config.js'; // Use main config for consistency if needed (e.g., modals)
import { standardizeFlag, svgStringToDataURL, loadImage } from './flagEditor.js'; // Import core logic
import { getCssVariable } from './domUtils.js'; // Import CSS helper if needed

// --- Module State & DOM References ---
let ffeContainer = null; // The main container div for this view
let ffeFileInput = null;
let ffeFileLabel = null;
let ffeOriginalPreview = null;
let ffeIntermediaryPanel = null;
let ffeIntermediaryPanelTitle = null;
let ffeIntermediaryPreview = null;
let ffeTransformedPreview = null;
let ffePreprocessModeSelect = null;
let ffeRatioSelect = null;
let ffeFinalScaleModeSelect = null;
let ffeSaveButton = null;
let ffeStatus = null;
// Add references for loading overlay, crop modal elements if implementing crop here too
// For now, focus on standalone standardization and saving

let ffeState = {
    originalFileName: null,
    originalDataUrl: null,
    originalWidth: null,
    originalHeight: null,
    originalDataType: null, // e.g., 'png', 'svg'
    transformedUrl: null,
    intermediaryUrl: null,
    processing: false
};

// --- Constants ---
const FFE_FRAME_THICKNESS = 5;
const FFE_CORNER_RADIUS = 8;
const FFE_DEFAULT_WIDTH = 160;
const FFE_DEFAULT_HEIGHT = 100;

/** Initialize the Full Flag Editor UI */
export function initFullFlagEditor() {
    ffeContainer = document.getElementById('full-flag-editor-view');
    if (!ffeContainer) {
        console.error("Full Flag Editor container (#full-flag-editor-view) not found!");
        return;
    }

    // Populate the container with UI elements
    ffeContainer.innerHTML = `
        <div class="ffe-controls-container">
             <h2>Full Page Flag Standardizer</h2>
             <p>Load a flag image (PNG, JPG, SVG, etc.) to standardize it.</p>
             <div class="ffe-options-panel">
                 <div class="ffe-option-group">
                    <input type="file" id="ffeFileInput" class="visually-hidden" accept="image/*">
                    <label for="ffeFileInput" id="ffeFileLabel" class="file-label-button">Load Flag Image</label>
                 </div>
                 <div class="ffe-option-group">
                     <span class="ffe-option-label">Pre-processing:</span>
                     <select id="ffePreprocessModeSelect" class="select">
                         <option value="default" selected>Default (Transparency Crop)</option>
                         <option value="old_flags">Old Flags (Frame Removal)</option>
                         <!-- <option value="manual_crop">Manual Crop</option> --> <!-- Manual Crop TBD for full page -->
                     </select>
                 </div>
                 <div class="ffe-option-group">
                     <span class="ffe-option-label">Aspect Ratio:</span>
                     <select id="ffeRatioSelect" class="select">
                         <option value="8:5" selected>8:5 (${FFE_DEFAULT_WIDTH}x${FFE_DEFAULT_HEIGHT})</option>
                         <option value="3:2">3:2 (${150}x${100})</option>
                         <option value="1:1">1:1 (${100}x${100})</option>
                     </select>
                 </div>
                 <div class="ffe-option-group">
                      <span class="ffe-option-label">Final Scaling:</span>
                      <select id="ffeFinalScaleModeSelect" class="select">
                          <option value="warp" selected>Warp (Stretch/Squash)</option>
                          <option value="crop">Auto Crop (Maintain Ratio)</option>
                      </select>
                  </div>
                  <div class="ffe-option-group">
                      <button id="ffeSaveButton" class="btn" disabled>Save Standardized Flag</button>
                  </div>
             </div>
             <div id="ffeStatus" class="ffe-status">Load an image to begin.</div>
        </div>

        <div class="ffe-previews-container">
             <div class="ffe-panel">
                 <div class="ffe-panel-title">Original</div>
                 <div class="ffe-image-preview"><img id="ffeOriginalPreview" class="ffe-preview-image" alt="Original"></div>
             </div>
             <div class="ffe-panel" id="ffeIntermediaryPanel" style="display: none;">
                 <div class="ffe-panel-title" id="ffeIntermediaryPanelTitle">Pre-processed</div>
                 <div class="ffe-image-preview"><img id="ffeIntermediaryPreview" class="ffe-preview-image" alt="Intermediary"></div>
             </div>
             <div class="ffe-panel">
                 <div class="ffe-panel-title">Standardized</div>
                 <div class="ffe-image-preview"><img id="ffeTransformedPreview" class="ffe-preview-image" alt="Standardized"></div>
             </div>
        </div>
    `;

    // Get references to the newly created elements
    ffeFileInput = ffeContainer.querySelector('#ffeFileInput');
    ffeFileLabel = ffeContainer.querySelector('#ffeFileLabel');
    ffeOriginalPreview = ffeContainer.querySelector('#ffeOriginalPreview');
    ffeIntermediaryPanel = ffeContainer.querySelector('#ffeIntermediaryPanel');
    ffeIntermediaryPanelTitle = ffeContainer.querySelector('#ffeIntermediaryPanelTitle');
    ffeIntermediaryPreview = ffeContainer.querySelector('#ffeIntermediaryPreview');
    ffeTransformedPreview = ffeContainer.querySelector('#ffeTransformedPreview');
    ffePreprocessModeSelect = ffeContainer.querySelector('#ffePreprocessModeSelect');
    ffeRatioSelect = ffeContainer.querySelector('#ffeRatioSelect');
    ffeFinalScaleModeSelect = ffeContainer.querySelector('#ffeFinalScaleModeSelect');
    ffeSaveButton = ffeContainer.querySelector('#ffeSaveButton');
    ffeStatus = ffeContainer.querySelector('#ffeStatus');

    // Add event listeners
    ffeFileInput?.addEventListener('change', handleFfeFileSelect);
    ffePreprocessModeSelect?.addEventListener('change', handleFfeOptionChange);
    ffeRatioSelect?.addEventListener('change', handleFfeOptionChange);
    ffeFinalScaleModeSelect?.addEventListener('change', handleFfeOptionChange);
    ffeSaveButton?.addEventListener('click', handleFfeSave);

    console.log("Full Flag Editor Initialized.");
}

/** Update the status message within the FFE view */
function setFfeStatus(message, isError = false) {
    if (ffeStatus) {
        ffeStatus.textContent = message;
        ffeStatus.style.color = isError ? 'var(--status-error-color, red)' : 'var(--text-color)';
    }
}

/** Handle file selection in the FFE view */
async function handleFfeFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        setFfeStatus(`Invalid file type: ${file.type || 'unknown'}. Please select an image.`, true);
        resetFfe();
        return;
    }

    setFfeStatus(`Loading ${file.name}...`);
    ffeSaveButton.disabled = true; // Disable save during load/process

    const reader = new FileReader();
    reader.onload = async (e) => {
        if (!e.target?.result) {
            setFfeStatus('Error reading file.', true);
            resetFfe();
            return;
        }
        const fileData = e.target.result; // DataURL or text for SVG
        const fileType = file.type;
        const fileName = file.name;

        let isSvg = fileType === 'image/svg+xml' || (!fileType && fileName.toLowerCase().endsWith('.svg'));
        let sourceDataUrl = fileData;
        let originalDataType = fileType?.split('/')[1] || fileName.split('.').pop()?.toLowerCase() || 'unknown';

        if (isSvg) {
            originalDataType = 'svg';
            sourceDataUrl = svgStringToDataURL(fileData); // Convert SVG text to DataURL
            if (!sourceDataUrl) {
                setFfeStatus('Error converting SVG to displayable format.', true);
                resetFfe();
                return;
            }
        }

        // Load into an image object to get dimensions
        try {
            const img = await loadImage(sourceDataUrl);
            if (!img.naturalWidth || !img.naturalHeight) {
                throw new Error("Loaded image has zero dimensions.");
            }
            // Store details in state
            ffeState.originalFileName = fileName;
            ffeState.originalDataUrl = sourceDataUrl;
            ffeState.originalWidth = img.naturalWidth;
            ffeState.originalHeight = img.naturalHeight;
            ffeState.originalDataType = originalDataType;
            ffeState.transformedUrl = null; // Clear previous results
            ffeState.intermediaryUrl = null;
            ffeState.processing = false;

            // Display original
            ffeOriginalPreview.src = ffeState.originalDataUrl;
            ffeOriginalPreview.alt = `Original: ${ffeState.originalFileName}`;
            setFfeStatus(`Processing ${ffeState.originalFileName}...`);

            // Trigger standardization
            await runFfeStandardization();

        } catch (error) {
            console.error("Error loading image for FFE:", error);
            setFfeStatus(`Error loading image: ${error.message}`, true);
            resetFfe();
        }
    };
    reader.onerror = () => {
        setFfeStatus('Error reading file.', true);
        resetFfe();
    };

    // Read file appropriately
    if (file.type === 'image/svg+xml' || (!file.type && file.name.toLowerCase().endsWith('.svg'))) {
        reader.readAsText(file);
    } else {
        reader.readAsDataURL(file);
    }
}

/** Triggered when a standardization option changes */
function handleFfeOptionChange() {
    if (ffeState.processing || !ffeState.originalDataUrl) {
        return; // Don't reprocess if already processing or no image loaded
    }
    // Clear previous results and re-run
    ffeState.transformedUrl = null;
    ffeState.intermediaryUrl = null;
    ffeSaveButton.disabled = true;
    setFfeStatus(`Reprocessing ${ffeState.originalFileName || ''}...`);
    runFfeStandardization();
}

/** Runs the standardization logic and updates previews */
async function runFfeStandardization() {
    if (!ffeState.originalDataUrl || ffeState.processing) return;

    ffeState.processing = true;
    setFfeStatus(`Standardizing...`, false);
    ffeTransformedPreview.src = ''; // Clear preview
    ffeTransformedPreview.alt = 'Processing...';
    ffeIntermediaryPanel.style.display = 'none';
    ffeIntermediaryPreview.src = '';


    try {
        const options = getCurrentFfeOptions();
        const result = await standardizeFlag(
            ffeState.originalDataUrl, // Use the already loaded DataURL
            ffeState.originalDataType, // Use determined type
            ffeState.originalWidth,
            ffeState.originalHeight,
            options
        );

        ffeState.transformedUrl = result; // It now only returns the final URL
        ffeState.intermediaryUrl = null; // We don't get this back directly anymore, maybe adapt later if needed
        ffeState.processing = false;

        // Update previews
        ffeTransformedPreview.src = ffeState.transformedUrl;
        ffeTransformedPreview.alt = 'Standardized Result';
        // We can't easily show the intermediary without more refactoring, so skip for now
        // ffeIntermediaryPanel.style.display = 'none'; // Keep hidden

        setFfeStatus(`Standardization complete for ${ffeState.originalFileName || 'image'}. Ready to save.`, false);
        ffeSaveButton.disabled = false; // Enable save

    } catch (error) {
        console.error("Error during FFE standardization:", error);
        setFfeStatus(`Error standardizing: ${error.message}`, true);
        ffeState.processing = false;
        ffeState.transformedUrl = null;
        ffeTransformedPreview.src = '';
        ffeTransformedPreview.alt = 'Processing Failed';
        ffeSaveButton.disabled = true;
    }
}

/** Gets the current standardization options from the UI */
function getCurrentFfeOptions() {
    const ratio = ffeRatioSelect?.value || '8:5';
    let width = FFE_DEFAULT_WIDTH;
    let height = FFE_DEFAULT_HEIGHT;
    if (ratio === '3:2') { width = 150; height = 100; }
    else if (ratio === '1:1') { width = 100; height = 100; }

    return {
        preprocessMode: ffePreprocessModeSelect?.value || 'default',
        finalScaleMode: ffeFinalScaleModeSelect?.value || 'warp',
        finalWidth: width,
        finalHeight: height,
        frameThickness: FFE_FRAME_THICKNESS,
        fixedCornerRadius: FFE_CORNER_RADIUS
    };
}

/** Handles saving the standardized flag */
async function handleFfeSave() {
    if (!ffeState.transformedUrl || !ffeState.originalFileName || typeof saveAs === 'undefined') {
        setFfeStatus('Cannot save. No standardized flag available or FileSaver library missing.', true);
        console.warn('Save attempt failed. URL:', !!ffeState.transformedUrl, 'Filename:', ffeState.originalFileName, 'FileSaver:', typeof saveAs);
        return;
    }

    setFfeStatus('Preparing download...');

    try {
        // Convert DataURL to Blob
        const response = await fetch(ffeState.transformedUrl);
        const blob = await response.blob();

        // Generate filename
        const baseName = ffeState.originalFileName.split('.').slice(0, -1).join('.');
        const saveFilename = `${baseName}_standardized.png`; // Always save as PNG

        // Trigger download
        saveAs(blob, saveFilename);
        setFfeStatus(`Saved as ${saveFilename}.`);

    } catch (error) {
        console.error("Error saving standardized flag:", error);
        setFfeStatus(`Error saving file: ${error.message}`, true);
    }
}

/** Resets the FFE view to its initial state */
function resetFfe() {
    ffeState = {
        originalFileName: null, originalDataUrl: null, originalWidth: null,
        originalHeight: null, originalDataType: null, transformedUrl: null,
        intermediaryUrl: null, processing: false
    };
    if (ffeOriginalPreview) { ffeOriginalPreview.src = ''; ffeOriginalPreview.alt = 'Original'; }
    if (ffeIntermediaryPanel) ffeIntermediaryPanel.style.display = 'none';
    if (ffeIntermediaryPreview) ffeIntermediaryPreview.src = '';
    if (ffeTransformedPreview) { ffeTransformedPreview.src = ''; ffeTransformedPreview.alt = 'Standardized'; }
    if (ffeSaveButton) ffeSaveButton.disabled = true;
    if (ffeFileInput) ffeFileInput.value = ''; // Clear file input
    setFfeStatus('Load an image to begin.');
}