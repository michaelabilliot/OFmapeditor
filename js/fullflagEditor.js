import * as mainCfg from './config.js'; // Main config for potential access (e.g., FileSaver)
import { standardizeFlag, svgStringToDataURL, loadImage } from './flagEditor.js'; // Core logic
import { getCssVariable } from './domUtils.js'; // CSS helper

// --- Module State & DOM References ---
let ffeContainer = null;
let ffeControlsContainer = null;
let ffeListPanel = null;
let ffePreviewPanel = null;
let ffeDetailOriginalPreview = null;
let ffeDetailStandardizedPreview = null;
let ffeDetailOriginalTitle = null;
let ffeDetailStandardizedTitle = null;

let ffeTableBody = null;
// *** FIX: Added ffeListContainer declaration (already here, just confirming) ***
let ffeListContainer = null;
let ffeFileInput = null;
let ffeFileLabel = null;
let ffePreprocessModeSelect = null;
let ffeRatioSelect = null;
let ffeFinalScaleModeSelect = null;
let ffeStandardizeSelectedBtn = null;
let ffeSaveSelectedBtn = null;
let ffeSaveAllBtn = null;
let ffeRemoveSelectedBtn = null;
let ffeSelectAllCheckbox = null;
let ffeStatus = null;

// State for the flags being processed in this view
let processedFlags = []; // Array of flag objects: { id, file, original..., standardizedUrl, status, isSelected, ... }
let flagIdCounter = 0;
let selectedFlagId = null;

// Constants for Standardization Options
const FFE_OPTIONS = {
    FRAME_THICKNESS: 5,
    CORNER_RADIUS: 8,
    RATIOS: {
        // Corrected Ratios & Added more
        "1:1": { width: 100, height: 100 },
        "5:4": { width: 125, height: 100 },
        "4:3": { width: 133, height: 100 }, // Approx
        "3:2": { width: 150, height: 100 },
        "8:5": { width: 160, height: 100 }, // Correct
        "5:3": { width: 167, height: 100 }, // Approx
        "16:9": { width: 178, height: 100 }, // Approx
        "2:1": { width: 200, height: 100 },
        "3:1": { width: 300, height: 100 },
        // Portrait ratios (approximate height based on width=100)
        "4:5": { width: 100, height: 125 },
        "3:4": { width: 100, height: 133 },
        "2:3": { width: 100, height: 150 },
        "5:8": { width: 100, height: 160 },
        "3:5": { width: 100, height: 167 },
        "9:16": { width: 100, height: 178 },
        "1:2": { width: 100, height: 200 },
        "1:3": { width: 100, height: 300 },
    },
    DEFAULT_RATIO: "8:5", // Default selection
    DEFAULT_PREPROCESS: "default",
    DEFAULT_SCALE: "warp"
};

/** Initialize the Full Flag Editor UI and Bind Events */
export function initFullFlagEditor() {
    ffeContainer = document.getElementById('full-flag-editor-view');
    if (!ffeContainer) {
        console.error("Full Flag Editor container (#full-flag-editor-view) not found!");
        return;
    }

    // Populate the container with UI elements (using the new structure)
    ffeContainer.innerHTML = `
        <div class="ffe-controls-container">
            <h2>Flag Processing Workbench</h2>
            <p>Upload flags, apply standardization settings, and save the results as SVG files.</p>
            <div class="ffe-options-panel">
                 <div class="ffe-option-group ffe-upload-group">
                    <input type="file" id="ffeFileInput" class="visually-hidden" accept="image/*" multiple>
                    <label for="ffeFileInput" id="ffeFileLabel" class="file-label-button ffe-upload-btn">Upload Flags</label>
                 </div>
                 <div class="ffe-option-group ffe-settings-group">
                     <span class="ffe-option-label">Global Pre-processing:</span>
                     <select id="ffePreprocessModeSelect" class="select">
                         <option value="default" ${FFE_OPTIONS.DEFAULT_PREPROCESS === 'default' ? 'selected' : ''}>Default (Transparency Crop)</option>
                         <option value="old_flags" ${FFE_OPTIONS.DEFAULT_PREPROCESS === 'old_flags' ? 'selected' : ''}>Old Flags (Frame Removal)</option>
                         <!-- Manual Crop might be added later as per-flag action -->
                     </select>
                     <span class="ffe-option-label">Global Aspect Ratio:</span>
                     <select id="ffeRatioSelect" class="select">
                         ${Object.entries(FFE_OPTIONS.RATIOS).map(([key, value]) =>
                             `<option value="${key}" ${key === FFE_OPTIONS.DEFAULT_RATIO ? 'selected' : ''}>${key} (${value.width}x${value.height})</option>`
                         ).join('')}
                     </select>
                      <span class="ffe-option-label">Global Scaling:</span>
                      <select id="ffeFinalScaleModeSelect" class="select">
                          <option value="warp" ${FFE_OPTIONS.DEFAULT_SCALE === 'warp' ? 'selected' : ''}>Warp</option>
                          <option value="crop" ${FFE_OPTIONS.DEFAULT_SCALE === 'crop' ? 'selected' : ''}>Auto Crop</option>
                      </select>
                  </div>
             </div>
             <div class="ffe-batch-actions">
                 <button id="ffeStandardizeSelectedBtn" class="btn btn-secondary" disabled>Apply Global Settings to Selected</button>
                 <button id="ffeSaveSelectedBtn" class="btn" disabled>Save Selected as SVGs</button>
                 <button id="ffeSaveAllBtn" class="btn" disabled>Save All Ready as SVGs</button>
                 <button id="ffeRemoveSelectedBtn" class="btn btn-danger" disabled>Remove Selected</button>
             </div>
            <div id="ffeStatus" class="ffe-status">Upload flag images to begin.</div>
        </div>

        <div class="ffe-main-content">
             <div class="ffe-list-panel">
                <div class="ffe-flag-list-container">
                    <table class="ffe-flag-table">
                        <thead>
                            <tr>
                                <th><input type="checkbox" id="ffeSelectAllCheckbox" title="Select/Deselect All"></th>
                                <th>Preview</th>
                                <th>Original Filename</th>
                                <th>Status</th>
                                <th>Dims</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="ffeTableBody">
                            <!-- Rows added dynamically -->
                        </tbody>
                    </table>
                 </div>
             </div>
             <div class="ffe-preview-panel">
                 <div class="ffe-preview-area">
                     <div class="ffe-preview-title" id="ffeDetailOriginalTitle">Original</div>
                     <div class="ffe-image-preview ffe-detail-preview">
                         <img id="ffeDetailOriginalPreview" class="ffe-detail-preview-img" alt="Original Preview">
                     </div>
                 </div>
                 <div class="ffe-preview-area">
                     <div class="ffe-preview-title" id="ffeDetailStandardizedTitle">Standardized</div>
                     <div class="ffe-image-preview ffe-detail-preview">
                         <img id="ffeDetailStandardizedPreview" class="ffe-detail-preview-img" alt="Standardized Preview">
                     </div>
                 </div>
             </div>
        </div>
    `;

    // Assign references
    ffeControlsContainer = ffeContainer.querySelector('.ffe-controls-container');
    ffeListPanel = ffeContainer.querySelector('.ffe-list-panel');
    ffePreviewPanel = ffeContainer.querySelector('.ffe-preview-panel');
    ffeDetailOriginalPreview = ffeContainer.querySelector('#ffeDetailOriginalPreview');
    ffeDetailStandardizedPreview = ffeContainer.querySelector('#ffeDetailStandardizedPreview');
    ffeDetailOriginalTitle = ffeContainer.querySelector('#ffeDetailOriginalTitle');
    ffeDetailStandardizedTitle = ffeContainer.querySelector('#ffeDetailStandardizedTitle');
    // *** FIX: Assign the ffeListContainer variable ***
    ffeListContainer = ffeContainer.querySelector('.ffe-flag-list-container');
    // *** END FIX ***
    ffeTableBody = ffeContainer.querySelector('#ffeTableBody');
    ffeFileInput = ffeContainer.querySelector('#ffeFileInput');
    ffeFileLabel = ffeContainer.querySelector('#ffeFileLabel');
    ffePreprocessModeSelect = ffeContainer.querySelector('#ffePreprocessModeSelect');
    ffeRatioSelect = ffeContainer.querySelector('#ffeRatioSelect');
    ffeFinalScaleModeSelect = ffeContainer.querySelector('#ffeFinalScaleModeSelect');
    ffeStandardizeSelectedBtn = ffeContainer.querySelector('#ffeStandardizeSelectedBtn');
    ffeSaveSelectedBtn = ffeContainer.querySelector('#ffeSaveSelectedBtn');
    ffeSaveAllBtn = ffeContainer.querySelector('#ffeSaveAllBtn');
    ffeRemoveSelectedBtn = ffeContainer.querySelector('#ffeRemoveSelectedBtn');
    ffeSelectAllCheckbox = ffeContainer.querySelector('#ffeSelectAllCheckbox');
    ffeStatus = ffeContainer.querySelector('#ffeStatus');

    // Add event listeners
    ffeFileInput?.addEventListener('change', handleFfeFileSelect);
    ffeStandardizeSelectedBtn?.addEventListener('click', handleFfeStandardizeSelected);
    ffeSaveSelectedBtn?.addEventListener('click', handleFfeSaveSelected);
    ffeSaveAllBtn?.addEventListener('click', handleFfeSaveAll);
    ffeRemoveSelectedBtn?.addEventListener('click', handleFfeRemoveSelected);
    ffeSelectAllCheckbox?.addEventListener('change', handleFfeSelectAllToggle);
    // Use event delegation for row-specific controls and selection
    ffeTableBody?.addEventListener('change', handleFfeRowChange); // For checkboxes
    ffeTableBody?.addEventListener('click', handleFfeRowClick); // For buttons AND row selection


    console.log("Full Flag Editor Initialized.");
    renderFlagList(); // Render empty state initially
    updateDetailPreviews(); // Clear detail previews initially
}

/** Update the overall status message */
function setFfeStatus(message, isError = false) {
    if (!ffeStatus) return;
    ffeStatus.textContent = message;
    ffeStatus.style.color = isError ? 'var(--status-error-color, red)' : 'var(--text-color)';
    ffeStatus.style.fontWeight = isError ? 'bold' : 'normal';
}

/** Handle file selection */
async function handleFfeFileSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setFfeStatus(`Loading ${files.length} file(s)...`);
    let addedCount = 0;
    let errorCount = 0;

    const processPromises = Array.from(files).map(file => (async () => {
        if (!file.type.startsWith('image/')) {
            console.warn(`Skipping non-image file: ${file.name}`);
            errorCount++;
            return; // Skip this file
        }

        const flagId = `ffe-flag-${flagIdCounter++}`;
        const flagState = {
            id: flagId,
            file: file,
            originalFileName: file.name,
            originalDataUrl: null,
            originalWidth: null,
            originalHeight: null,
            originalDataType: file.type?.split('/')[1] || file.name.split('.').pop()?.toLowerCase() || 'unknown',
            standardizedUrl: null,
            intermediaryUrl: null,
            status: 'loading', // Initial status
            errorMessage: null,
            isSelected: false
        };
        processedFlags.push(flagState);
        renderFlagList(); // Add placeholder row immediately

        try {
            const reader = new FileReader();
            const data = await new Promise((resolve, reject) => {
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = (e) => reject(new Error(`FileReader error for ${file.name}`));
                if (flagState.originalDataType === 'svg') {
                    reader.readAsText(file);
                } else {
                    reader.readAsDataURL(file);
                }
            });

            let sourceDataUrl = data;
            if (flagState.originalDataType === 'svg') {
                sourceDataUrl = svgStringToDataURL(data);
                if (!sourceDataUrl) throw new Error("SVG conversion failed.");
            }
            flagState.originalDataUrl = sourceDataUrl;

            const img = await loadImage(sourceDataUrl);
            if (!img.naturalWidth || !img.naturalHeight) throw new Error("Image has zero dimensions.");
            flagState.originalWidth = img.naturalWidth;
            flagState.originalHeight = img.naturalHeight;

            flagState.status = 'standardizing';
            renderFlagList(); // Update status before async call

            // Automatically standardize with current global settings
            const options = getCurrentFfeOptions();
            flagState.standardizedUrl = await standardizeFlag(
                flagState.originalDataUrl,
                flagState.originalDataType,
                flagState.originalWidth,
                flagState.originalHeight,
                options
            );
            flagState.status = 'ready';
            addedCount++;

        } catch (error) {
            console.error(`Error processing ${file.name}:`, error);
            flagState.status = 'error';
            flagState.errorMessage = error.message;
            errorCount++;
        } finally {
            renderFlagList(); // Update final status/preview
        }
    })());

    await Promise.all(processPromises);

    // Update overall status
    let finalStatus = `Processed ${files.length} file(s). Added: ${addedCount}.`;
    if (errorCount > 0) {
        finalStatus += ` Errors: ${errorCount}.`;
    }
    setFfeStatus(finalStatus, errorCount > 0);
    ffeFileInput.value = ''; // Clear file input
    updateBatchActionButtons();
    checkSelectAllState(); // Update select-all checkbox
    updateDetailPreviews(); // Clear previews if nothing is selected anymore
}

/** Renders the entire flag list table based on `processedFlags` array */
function renderFlagList() {
    if (!ffeTableBody) return;

    ffeTableBody.innerHTML = ''; // Clear existing rows

    if (processedFlags.length === 0) {
        ffeTableBody.innerHTML = `<tr><td colspan="6" class="ffe-empty-list-msg">No flags uploaded yet.</td></tr>`;
        updateBatchActionButtons();
        updateDetailPreviews(); // Clear previews when list is empty
        return;
    }

    processedFlags.forEach(flag => {
        const row = ffeTableBody.insertRow();
        row.dataset.flagId = flag.id; // Store ID on row
        row.classList.add('ffe-flag-row'); // Add class for styling/selection
        if (flag.id === selectedFlagId) {
            row.classList.add('selected-row'); // Highlight selected row
        }

        // 1. Checkbox
        const cellSelect = row.insertCell();
        cellSelect.classList.add('ffe-cell-select');
        cellSelect.innerHTML = `<input type="checkbox" class="ffe-row-checkbox" data-flag-id="${flag.id}" ${flag.isSelected ? 'checked' : ''}>`;

        // 2. Preview
        const cellPreview = row.insertCell();
        cellPreview.classList.add('ffe-cell-preview');
        const previewUrl = flag.standardizedUrl || flag.originalDataUrl; // Show standardized if available
        if (previewUrl && flag.status !== 'error') {
            cellPreview.innerHTML = `<img src="${previewUrl}" alt="Preview" class="ffe-list-preview-img" loading="lazy">`;
        } else if (flag.status === 'error') {
             cellPreview.innerHTML = `<span class="ffe-preview-error" title="${flag.errorMessage || ''}">⚠️</span>`;
        } else {
            cellPreview.innerHTML = `<span class="ffe-preview-placeholder">${flag.status}...</span>`;
        }

        // 3. Filename
        const cellFilename = row.insertCell();
        cellFilename.classList.add('ffe-cell-filename');
        cellFilename.textContent = flag.originalFileName || '---';
        cellFilename.title = flag.originalFileName || '';

        // 4. Status
        const cellStatus = row.insertCell();
        cellStatus.classList.add('ffe-cell-status');
        if (flag.status === 'error') {
            cellStatus.innerHTML = `<span class="ffe-status-error" title="${flag.errorMessage || 'Unknown error'}">Error</span>`;
        } else if (flag.status === 'ready') {
            cellStatus.innerHTML = `<span class="ffe-status-ready">Ready</span>`;
        } else {
            cellStatus.innerHTML = `<span class="ffe-status-processing">${flag.status}...</span>`;
        }

        // 5. Dimensions
        const cellDims = row.insertCell();
        cellDims.classList.add('ffe-cell-dims');
        let dimsText = '---';
        if (flag.originalWidth && flag.originalHeight) {
            dimsText = `${flag.originalWidth}x${flag.originalHeight}`;
            if (flag.standardizedUrl && flag.status === 'ready') {
                 // Get standardized dims from options used (approx)
                 const stdOptions = getCurrentFfeOptions(); // Or store options used with flag state
                 dimsText += ` <span class="ffe-dim-arrow">→</span> ${stdOptions.finalWidth}x${stdOptions.finalHeight}`;
            }
        }
        cellDims.innerHTML = dimsText; // Use innerHTML to render arrow span

        // 6. Actions
        const cellActions = row.insertCell();
        cellActions.classList.add('ffe-cell-actions');
        cellActions.innerHTML = `
            <button class="ffe-action-btn ffe-restandardize-btn" title="Re-apply Global Settings" data-flag-id="${flag.id}" ${flag.originalDataUrl && (flag.status === 'error' || flag.status === 'ready') ? '' : 'disabled'}>🔄</button>
            <button class="ffe-action-btn ffe-save-svg-btn" title="Save this SVG" data-flag-id="${flag.id}" ${flag.status === 'ready' ? '' : 'disabled'}>💾</button>
            <button class="ffe-action-btn ffe-remove-btn" title="Remove" data-flag-id="${flag.id}">🗑️</button>
        `; // Using simple icons for now
    });

    updateBatchActionButtons();
}

/** Updates the detail preview panels on the right */
function updateDetailPreviews() {
    if (!ffePreviewPanel || !ffeDetailOriginalPreview || !ffeDetailStandardizedPreview || !ffeDetailOriginalTitle || !ffeDetailStandardizedTitle) return;

    const flag = processedFlags.find(f => f.id === selectedFlagId);

    if (flag) {
        ffePreviewPanel.style.visibility = 'visible'; // Show the panel

        // Update Original Preview
        ffeDetailOriginalPreview.src = flag.originalDataUrl || '';
        ffeDetailOriginalPreview.alt = flag.originalFileName ? `Original: ${flag.originalFileName}` : 'Original';
        ffeDetailOriginalTitle.textContent = flag.originalFileName ? `Original (${flag.originalWidth}x${flag.originalHeight})` : 'Original';


        // Update Standardized Preview
        if (flag.standardizedUrl && flag.status === 'ready') {
            const opts = getCurrentFfeOptions(); // Approx dims for title
            ffeDetailStandardizedPreview.src = flag.standardizedUrl;
            ffeDetailStandardizedPreview.alt = `Standardized: ${flag.originalFileName}`;
             ffeDetailStandardizedTitle.textContent = `Standardized (${opts.finalWidth}x${opts.finalHeight})`;
        } else if (flag.status === 'error') {
            ffeDetailStandardizedPreview.src = '';
            ffeDetailStandardizedPreview.alt = 'Standardization Failed';
            ffeDetailStandardizedTitle.textContent = 'Standardized (Error)';
        } else { // loading, standardizing, or other states
            ffeDetailStandardizedPreview.src = '';
            ffeDetailStandardizedPreview.alt = flag.status === 'loading' ? 'Loading...' : 'Processing...';
            ffeDetailStandardizedTitle.textContent = 'Standardized';
        }
    } else {
        // No flag selected, hide or clear previews
        ffePreviewPanel.style.visibility = 'hidden'; // Hide the panel
        // Optionally clear src attributes as well
        // ffeDetailOriginalPreview.src = '';
        // ffeDetailStandardizedPreview.src = '';
        // ffeDetailOriginalTitle.textContent = 'Original';
        // ffeDetailStandardizedTitle.textContent = 'Standardized';
    }
}


/** Gets the current global standardization options from the UI */
function getCurrentFfeOptions() {
    const ratio = ffeRatioSelect?.value || FFE_OPTIONS.DEFAULT_RATIO;
    const dims = FFE_OPTIONS.RATIOS[ratio] || FFE_OPTIONS.RATIOS[FFE_OPTIONS.DEFAULT_RATIO];

    return {
        preprocessMode: ffePreprocessModeSelect?.value || FFE_OPTIONS.DEFAULT_PREPROCESS,
        finalScaleMode: ffeFinalScaleModeSelect?.value || FFE_OPTIONS.DEFAULT_SCALE,
        finalWidth: dims.width,
        finalHeight: dims.height,
        frameThickness: FFE_OPTIONS.FRAME_THICKNESS,
        fixedCornerRadius: FFE_OPTIONS.CORNER_RADIUS
    };
}

/** Handles clicks within the table body (delegation for actions AND row selection) */
function handleFfeRowClick(event) {
    const target = event.target;
    const row = target.closest('tr.ffe-flag-row'); // Find the parent row
    if (!row) return; // Click wasn't within a flag row

    const flagId = row.dataset.flagId;
    if (!flagId) return;

    // Check if an action button was clicked within the row
    if (target.classList.contains('ffe-restandardize-btn')) {
        runSingleFfeStandardization(flagId);
    } else if (target.classList.contains('ffe-save-svg-btn')) {
        handleFfeSaveSingle(flagId);
    } else if (target.classList.contains('ffe-remove-btn')) {
        handleFfeRemoveSingle(flagId);
    } else if (!target.classList.contains('ffe-row-checkbox')) {
        // Click was on the row itself (but not checkbox or button) -> Select the row
        selectedFlagId = flagId;
        renderFlagList(); // Re-render to update highlighting
        updateDetailPreviews(); // Update the detail view
    }
    // If click was on checkbox, handleFfeRowChange will handle selection state
}

/** Handles checkbox changes within the table body (delegation) */
function handleFfeRowChange(event) {
    const target = event.target;
    if (target.classList.contains('ffe-row-checkbox')) {
        const flagId = target.dataset.flagId;
        const flag = processedFlags.find(f => f.id === flagId);
        if (flag) {
            flag.isSelected = target.checked;
            updateBatchActionButtons();
            checkSelectAllState();
        }
    }
}

/** Handles the 'Select All' checkbox toggle */
function handleFfeSelectAllToggle(event) {
    const isChecked = event.target.checked;
    processedFlags.forEach(flag => flag.isSelected = isChecked);
    renderFlagList(); // Re-render to update all checkboxes
    updateBatchActionButtons();
}

/** Updates the state of the 'Select All' checkbox based on row selections */
function checkSelectAllState() {
    if (!ffeSelectAllCheckbox) return;
    const totalFlags = processedFlags.length;
    const selectedCount = processedFlags.filter(flag => flag.isSelected).length;

    if (totalFlags === 0) {
        ffeSelectAllCheckbox.checked = false;
        ffeSelectAllCheckbox.indeterminate = false;
    } else if (selectedCount === totalFlags) {
        ffeSelectAllCheckbox.checked = true;
        ffeSelectAllCheckbox.indeterminate = false;
    } else if (selectedCount > 0) {
        ffeSelectAllCheckbox.checked = false;
        ffeSelectAllCheckbox.indeterminate = true;
    } else {
        ffeSelectAllCheckbox.checked = false;
        ffeSelectAllCheckbox.indeterminate = false;
    }
}


/** Updates the enabled/disabled state of batch action buttons */
function updateBatchActionButtons() {
    const selectedCount = processedFlags.filter(flag => flag.isSelected).length;
    const readyCount = processedFlags.filter(flag => flag.status === 'ready').length;
    const selectedReadyCount = processedFlags.filter(flag => flag.isSelected && flag.status === 'ready').length;
    const anyLoadOrStd = processedFlags.some(f => f.isSelected && (f.status === 'loading' || f.status === 'standardizing'));


    // Disable standardize if any selected are currently loading/standardizing
    if (ffeStandardizeSelectedBtn) ffeStandardizeSelectedBtn.disabled = selectedCount === 0 || anyLoadOrStd;
    if (ffeSaveSelectedBtn) ffeSaveSelectedBtn.disabled = selectedReadyCount === 0;
    if (ffeSaveAllBtn) ffeSaveAllBtn.disabled = readyCount === 0;
    if (ffeRemoveSelectedBtn) ffeRemoveSelectedBtn.disabled = selectedCount === 0;
}

/** Run standardization for a single flag (triggered by row button) */
async function runSingleFfeStandardization(flagId) {
    const flag = processedFlags.find(f => f.id === flagId);
    if (!flag || flag.status === 'loading' || flag.status === 'standardizing' || !flag.originalDataUrl) return;

    flag.status = 'standardizing';
    flag.errorMessage = null;
    flag.standardizedUrl = null; // Clear previous result
    renderFlagList(); // Update row UI to show 'standardizing'
    if (flag.id === selectedFlagId) updateDetailPreviews(); // Update detail if selected

    try {
        const options = getCurrentFfeOptions();
        flag.standardizedUrl = await standardizeFlag(
            flag.originalDataUrl,
            flag.originalDataType,
            flag.originalWidth,
            flag.originalHeight,
            options
        );
        flag.status = 'ready';
        setFfeStatus(`Re-standardized ${flag.originalFileName}.`);
    } catch (error) {
        console.error(`Error re-standardizing ${flag.originalFileName}:`, error);
        flag.status = 'error';
        flag.errorMessage = error.message;
        setFfeStatus(`Error re-standardizing ${flag.originalFileName}.`, true);
    } finally {
        renderFlagList(); // Update row UI with result/error
        if (flag.id === selectedFlagId) updateDetailPreviews(); // Update detail if selected
        updateBatchActionButtons(); // Re-check buttons
    }
}

/** Handle "Apply Global Settings to Selected" */
async function handleFfeStandardizeSelected() {
    const selectedFlags = processedFlags.filter(f => f.isSelected);
    if (selectedFlags.length === 0) return;

    setFfeStatus(`Standardizing ${selectedFlags.length} selected flag(s)...`);
    const options = getCurrentFfeOptions(); // Get options once
    updateBatchActionButtons(); // Disable buttons during processing

    const promises = selectedFlags.map(flag => (async () => {
        if (flag.status === 'loading' || flag.status === 'standardizing' || !flag.originalDataUrl) return;

        flag.status = 'standardizing';
        flag.errorMessage = null;
        flag.standardizedUrl = null;
        renderFlagList(); // Update UI immediately
        if (flag.id === selectedFlagId) updateDetailPreviews();

        try {
            flag.standardizedUrl = await standardizeFlag(
                flag.originalDataUrl, flag.originalDataType,
                flag.originalWidth, flag.originalHeight, options
            );
            flag.status = 'ready';
        } catch (error) {
            console.error(`Error standardizing selected ${flag.originalFileName}:`, error);
            flag.status = 'error';
            flag.errorMessage = error.message;
        } finally {
            renderFlagList(); // Update row UI
             if (flag.id === selectedFlagId) updateDetailPreviews(); // Update detail if selected
        }
    })());

    await Promise.all(promises);
    setFfeStatus(`Finished applying settings to ${selectedFlags.length} flag(s). Check list for errors.`);
    updateBatchActionButtons(); // Re-check button states
}

/** Handle Removing a single flag */
function handleFfeRemoveSingle(flagId) {
    processedFlags = processedFlags.filter(f => f.id !== flagId);
    if (selectedFlagId === flagId) {
        selectedFlagId = null; // Clear selection if removed
    }
    renderFlagList();
    updateDetailPreviews(); // Update previews (will clear if selected was removed)
    setFfeStatus('Flag removed.');
    checkSelectAllState();
}

/** Handle "Remove Selected" */
function handleFfeRemoveSelected() {
    const initialCount = processedFlags.length;
    processedFlags = processedFlags.filter(f => {
        if (f.isSelected && f.id === selectedFlagId) {
            selectedFlagId = null; // Clear selection if removed
        }
        return !f.isSelected;
    });
    const removedCount = initialCount - processedFlags.length;
    renderFlagList();
    updateDetailPreviews(); // Update previews (will clear if selected was removed)
    setFfeStatus(`Removed ${removedCount} selected flag(s).`);
    checkSelectAllState(); // Update select all checkbox state
}


/** Generic Save Function (used by single, selected, all) */
async function saveFlagsAsZip(flagsToSave, zipFilename = 'standardized_flags.zip') {
    const readyFlags = flagsToSave.filter(f => f.status === 'ready' && f.standardizedUrl);
    if (readyFlags.length === 0) {
        setFfeStatus("No selected flags are ready to save.", true);
        return;
    }
    if (typeof JSZip === 'undefined' || typeof saveAs === 'undefined') {
        setFfeStatus("Save libraries (JSZip, FileSaver) not loaded.", true);
        console.error("JSZip or FileSaver not available.");
        return;
    }

    setFfeStatus(`Creating ${zipFilename}...`);

    try {
        const zip = new JSZip();
        let addedCount = 0;
        let errorCount = 0; // Track errors during SVG creation/adding

        // Use Promise.all to handle potential async operations if needed later
        await Promise.all(readyFlags.map(async (flag) => {
            try {
                const baseName = flag.originalFileName.split('.').slice(0, -1).join('.') || flag.id;
                const svgFilename = `${baseName}.svg`;

                // Get standardized image dimensions
                let stdWidth = flag.originalWidth; // Fallback
                let stdHeight = flag.originalHeight;
                 try {
                     // Try loading the standardized image to get its *actual* dimensions
                     const stdImg = await loadImage(flag.standardizedUrl);
                     stdWidth = stdImg.naturalWidth || stdWidth;
                     stdHeight = stdImg.naturalHeight || stdHeight;
                 } catch (loadErr) {
                     console.warn(`Could not load standardized image ${flag.originalFileName} to get exact dimensions, using defaults/approximations. Error:`, loadErr);
                      // Use dimensions from options as approximation if load fails
                      const currentOpts = getCurrentFfeOptions();
                      stdWidth = currentOpts.finalWidth;
                      stdHeight = currentOpts.finalHeight;
                 }


                // Create SVG wrapper
                 const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${stdWidth}" height="${stdHeight}" viewBox="0 0 ${stdWidth} ${stdHeight}">\n  <image xlink:href="${flag.standardizedUrl}" width="${stdWidth}" height="${stdHeight}" />\n</svg>`;
                 zip.file(svgFilename, svgContent);
                 addedCount++;
            } catch (e) {
                console.error(`Error preparing ${flag.originalFileName} for zip:`, e);
                errorCount++;
            }
        }));

        if (addedCount === 0) {
             setFfeStatus("No flags could be prepared for saving (check console for errors).", true);
             return;
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        saveAs(zipBlob, zipFilename);
        setFfeStatus(`Saved ${addedCount} flags to ${zipFilename}.` + (errorCount > 0 ? ` Errors: ${errorCount}.` : ''), errorCount > 0);

    } catch (error) {
        console.error("Error creating ZIP file:", error);
        setFfeStatus(`Error creating ZIP: ${error.message}`, true);
    }
}

/** Handle "Save Selected as SVGs" */
function handleFfeSaveSelected() {
    const selectedFlags = processedFlags.filter(f => f.isSelected);
    saveFlagsAsZip(selectedFlags, 'selected_flags.zip');
}

/** Handle "Save All Ready as SVGs" */
function handleFfeSaveAll() {
    const allReadyFlags = processedFlags.filter(f => f.status === 'ready');
    saveFlagsAsZip(allReadyFlags, 'all_ready_flags.zip');
}

/** Handle saving a single flag */
async function handleFfeSaveSingle(flagId) {
     const flag = processedFlags.find(f => f.id === flagId);
     if (flag && flag.status === 'ready' && flag.standardizedUrl && typeof saveAs !== 'undefined') {
         try {
            setFfeStatus(`Saving ${flag.originalFileName}...`);
            const baseName = flag.originalFileName.split('.').slice(0, -1).join('.') || flag.id;
            const svgFilename = `${baseName}.svg`;

             // Get standardized image dimensions
             let stdWidth = flag.originalWidth; // Fallback
             let stdHeight = flag.originalHeight;
             try {
                 const stdImg = await loadImage(flag.standardizedUrl);
                 stdWidth = stdImg.naturalWidth || stdWidth;
                 stdHeight = stdImg.naturalHeight || stdHeight;
             } catch (loadErr) {
                 console.warn(`Could not load standardized image ${flag.originalFileName} to get exact dimensions for single save. Error:`, loadErr);
                  const currentOpts = getCurrentFfeOptions();
                  stdWidth = currentOpts.finalWidth;
                  stdHeight = currentOpts.finalHeight;
             }

            // Create SVG wrapper using standardized data URL
            const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${stdWidth}" height="${stdHeight}" viewBox="0 0 ${stdWidth} ${stdHeight}">\n  <image xlink:href="${flag.standardizedUrl}" width="${stdWidth}" height="${stdHeight}" />\n</svg>`;
            const blob = new Blob([svgContent], {type: "image/svg+xml;charset=utf-8"});
            saveAs(blob, svgFilename);
            setFfeStatus(`Saved ${svgFilename}.`);
         } catch(error) {
             console.error(`Error saving single flag ${flag.originalFileName}:`, error);
             setFfeStatus(`Error saving ${flag.originalFileName}: ${error.message}`, true);
         }
     } else if (!flag || flag.status !== 'ready') {
         setFfeStatus('Flag is not ready to save.', true);
     } else {
         setFfeStatus('FileSaver library not available.', true);
     }
}