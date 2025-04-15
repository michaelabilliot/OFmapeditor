import * as mainCfg from './config.js'; // Use alias to avoid collision

// --- Module-specific State & DOM References ---
let flagEditorResolve = null; // Stores the resolve function for the openFlagEditor promise
let currentOriginalFlagData = null; // Stores the original DataURL/SVG string being edited
let currentOriginalFlagType = null; // 'svg', 'png', 'jpeg', etc.
let currentOriginalWidth = null;
let currentOriginalHeight = null;

// Define references - these will be assigned in initFlagEditor
let feOriginalPreview, feIntermediaryPanel, feIntermediaryPanelTitle, feIntermediaryPreview, feTransformedPreview;
let fePreprocessModeSelect, feRatioSelect, feFinalScaleModeSelect;
let feManualCropControls, feDefineCropBtn, feManualCropStatus;
let feLoadingOverlay, feLoadingText;
let feCropModal, feCropImageContainer, feCropImage, feApplyCropBtn, feCancelCropBtn;
let feApplyButton, feCancelButton; // Main Apply/Cancel for the editor modal

let feCropperInstance = null; // Cropper for the inner crop modal
let feState = {
    originalUrl: null,
    transparencyCroppedUrl: null,
    manualCropSourceUrl: null,
    intermediaryUrl: null,
    transformedUrl: null,
    manualCropData: null,
    preprocessModeUsed: null,
    processingState: 'idle', // 'idle', 'processing', 'error', 'done'
};
let fePreprocessMode = 'default'; // 'default', 'old_flags', 'manual_crop'
let feFinalScaleMode = 'warp'; // 'warp' or 'crop'
let feFinalWidth = 160; // Adjusted Default
let feFinalHeight = 100;// Adjusted Default

// --- Constants ---
const feFrameThickness = 5; // Adjusted Default
const feFixedCornerRadius = 8;

// --- Utility Functions (Adapted from OP-F-S) ---
function showFeLoading(show, text = "Processing...") {
    if (!feLoadingOverlay || !feLoadingText) return;
    feLoadingText.textContent = text;
    feLoadingOverlay.style.display = show ? 'flex' : 'none';
}

// --- FIX: Added 'export' keyword ---
export function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => {
            console.error(`Flag Editor: Failed to load image: ${url ? url.substring(0, 100) : 'undefined'}...`, err);
            reject(new Error(`Flag Editor: Failed to load image URL`));
        };
        img.crossOrigin = "anonymous";
        img.src = url;
    });
}
// --- End Fix ---

// Exported as requested before
export function svgStringToDataURL(svgString) {
    try {
        // Ensure UTF-8 characters are handled correctly before base64 encoding
        const svgBase64 = btoa(unescape(encodeURIComponent(svgString)));
        return `data:image/svg+xml;base64,${svgBase64}`;
    } catch (e) {
        console.error("Flag Editor: Error encoding SVG string:", e);
        return null;
    }
}


function resetFeState() {
    feState = {
        originalUrl: null,
        transparencyCroppedUrl: null,
        manualCropSourceUrl: null,
        intermediaryUrl: null,
        transformedUrl: null,
        manualCropData: null,
        preprocessModeUsed: null,
        processingState: 'idle',
    };
    fePreprocessMode = 'default';
    feFinalScaleMode = 'warp';
    feFinalWidth = 160; // Reset to new default
    feFinalHeight = 100;// Reset to new default

    // Reset UI elements to defaults
    if (fePreprocessModeSelect) fePreprocessModeSelect.value = 'default';
    if (feRatioSelect) feRatioSelect.value = '8:5'; // Match new default dims
    if (feFinalScaleModeSelect) feFinalScaleModeSelect.value = 'warp';
    if (feManualCropStatus) feManualCropStatus.textContent = '';
    clearFePreviews();
    toggleFeManualCropButton();
    showFeLoading(false);
    cancelFeManualCrop();
}

function clearFePreviews() {
    if (feOriginalPreview) { feOriginalPreview.src = ''; feOriginalPreview.alt = 'Original Flag'; }
    if (feIntermediaryPanel) feIntermediaryPanel.style.display = 'none';
    if (feIntermediaryPreview) feIntermediaryPreview.src = '';
    if (feTransformedPreview) { feTransformedPreview.src = ''; feTransformedPreview.alt = 'Standardized Flag'; }
}

// --- Initialization ---
export function initFlagEditor() {
    if (!mainCfg.flagEditorModalContainer) {
        console.error("Flag Editor container element (#flagEditorModalContainer) not found in main HTML.");
        return;
    }

    const modalContent = document.createElement('div');
    modalContent.id = 'flagEditorModalContent';
    modalContent.style.boxSizing = 'border-box';
    modalContent.innerHTML = `
        <h1>Flag Standardizer</h1>
        <p class="fe-subheading">
            Adjust pre-processing, aspect ratio, and scaling for the selected flag.
        </p>

        <!-- Options Panel -->
        <div class="options-panel">
            <div class="option-group">
                <span class="option-label">Pre-processing:</span>
                <select id="fe-preprocessModeSelect" class="select">
                    <option value="default" selected>Default (Transparency Crop)</option>
                    <option value="old_flags">Old Flags (Frame Removal)</option>
                    <option value="manual_crop">Manual Crop</option>
                </select>
            </div>
            <div class="option-group">
                <span class="option-label">Aspect Ratio:</span>
                <select id="fe-ratioSelect" class="select">
                    <option value="8:5" selected>8:5 (160x100)</option>
                    <option value="3:2">3:2 (150x100)</option>
                    <option value="1:1">1:1 (100x100)</option>
                </select>
            </div>
            <div class="option-group">
                 <span class="option-label">Final Scaling:</span>
                 <select id="fe-finalScaleModeSelect" class="select">
                     <option value="warp" selected>Warp (Stretch/Squash)</option>
                     <option value="crop">Auto Crop (Maintain Ratio)</option>
                 </select>
             </div>
        </div>

        <!-- Image Previews -->
        <div class="images-container">
             <div class="split-view">
                <div class="panel">
                    <div class="panel-title">Original</div>
                    <div class="image-preview"><img id="fe-originalPreview" class="preview-image" alt="Original Flag Image"></div>
                </div>
                <div class="panel" id="fe-intermediaryPanel" style="display: none;">
                    <div class="panel-title" id="fe-intermediaryPanelTitle">Pre-processed</div>
                    <div class="image-preview"><img id="fe-intermediaryPreview" class="preview-image" alt="Image after pre-processing"></div>
                </div>
                <div class="panel">
                    <div class="panel-title">Standardized</div>
                    <div class="image-preview"><img id="fe-transformedPreview" class="preview-image" alt="Final Standardized Image"></div>
                </div>
            </div>

            <!-- Manual Crop Button Area -->
            <div class="manual-crop-controls" id="fe-manualCropControls" style="display: none;">
                <button class="btn btn-secondary" id="fe-defineCropBtn">
                     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="margin-right: 0.5em;">
                         <path fill-rule="evenodd" d="M1 8a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13A.5.5 0 0 1 1 8"/>
                         <path fill-rule="evenodd" d="M8 1a.5.5 0 0 1 .5.5v13a.5.5 0 0 1-1 0v-13A.5.5 0 0 1 8 1"/>
                    </svg>
                    Define Crop Area
                </button>
                 <span id="fe-manualCropStatus" style="font-size: 0.85rem; color: var(--text-color); opacity: 0.7; margin-left: 1em;"></span>
            </div>
        </div>

        <!-- Final Action Buttons -->
        <div class="final-actions">
             <button class="btn btn-secondary" id="fe-cancelButton">Cancel</button>
             <button class="btn" id="fe-applyButton">Apply Changes</button>
        </div>

        <!-- Loading Overlay -->
        <div class="loading-overlay" id="fe-loadingOverlay">
            <div class="spinner"></div>
            <div class="loading-text" id="fe-loadingText">Processing...</div>
        </div>

        <!-- Inner Crop Modal Structure -->
        <div id="fe-cropModalInner">
             <div class="crop-modal-content">
                <div class="crop-image-container" id="fe-cropImageContainer">
                    <img id="fe-cropImage" alt="Image to crop">
                </div>
                <div class="crop-modal-actions">
                    <button class="btn btn-secondary" id="fe-cancelCropBtn">Cancel</button>
                    <button class="btn" id="fe-applyCropBtn">Apply Crop</button>
                </div>
            </div>
        </div>
    `;

    mainCfg.flagEditorModalContainer.innerHTML = '';
    mainCfg.flagEditorModalContainer.appendChild(modalContent);

    // Assign DOM References
    const m = mainCfg.flagEditorModalContainer;
    feOriginalPreview = m.querySelector('#fe-originalPreview');
    feIntermediaryPanel = m.querySelector('#fe-intermediaryPanel');
    feIntermediaryPanelTitle = m.querySelector('#fe-intermediaryPanelTitle');
    feIntermediaryPreview = m.querySelector('#fe-intermediaryPreview');
    feTransformedPreview = m.querySelector('#fe-transformedPreview');
    fePreprocessModeSelect = m.querySelector('#fe-preprocessModeSelect');
    feRatioSelect = m.querySelector('#fe-ratioSelect');
    feFinalScaleModeSelect = m.querySelector('#fe-finalScaleModeSelect');
    feManualCropControls = m.querySelector('#fe-manualCropControls');
    feDefineCropBtn = m.querySelector('#fe-defineCropBtn');
    feManualCropStatus = m.querySelector('#fe-manualCropStatus');
    feLoadingOverlay = m.querySelector('#fe-loadingOverlay');
    feLoadingText = m.querySelector('#fe-loadingText');
    feCropModal = m.querySelector('#fe-cropModalInner');
    feCropImageContainer = m.querySelector('#fe-cropImageContainer');
    feCropImage = m.querySelector('#fe-cropImage');
    feApplyCropBtn = m.querySelector('#fe-applyCropBtn');
    feCancelCropBtn = m.querySelector('#fe-cancelCropBtn');
    feApplyButton = m.querySelector('#fe-applyButton');
    feCancelButton = m.querySelector('#fe-cancelButton');

    // Setup Event Listeners
    fePreprocessModeSelect?.addEventListener('change', handleFePreprocessChange);
    feRatioSelect?.addEventListener('change', handleFeRatioChange);
    feFinalScaleModeSelect?.addEventListener('change', handleFeFinalScaleChange);
    feDefineCropBtn?.addEventListener('click', initFeCropper);
    feApplyCropBtn?.addEventListener('click', applyFeManualCrop);
    feCancelCropBtn?.addEventListener('click', cancelFeManualCrop);
    feCropModal?.addEventListener('click', (e) => { if (e.target === feCropModal) cancelFeManualCrop(); });
    feApplyButton?.addEventListener('click', handleFeApplyChanges);
    feCancelButton?.addEventListener('click', handleFeCancel);
    mainCfg.flagEditorModalContainer.addEventListener('click', (e) => {
        if (e.target === mainCfg.flagEditorModalContainer) {
            handleFeCancel();
        }
    });

    console.log("Flag Editor UI Initialized.");
}

// --- Opening/Closing the Editor ---
export function openFlagEditor(originalFlagData, originalFlagType, originalWidth, originalHeight) {
    return new Promise(async (resolve) => {
        if (!mainCfg.flagEditorModalContainer || !originalFlagData || !originalFlagType) {
            console.error("Flag Editor cannot open: Container or flag data missing.");
            return resolve(null);
        }
        if (flagEditorResolve) {
            console.warn("Flag Editor is already open.");
            return resolve(null);
        }
        flagEditorResolve = resolve;

        currentOriginalFlagData = originalFlagData;
        currentOriginalFlagType = originalFlagType.toLowerCase();
        currentOriginalWidth = originalWidth;
        currentOriginalHeight = originalHeight;

        resetFeState();

        let sourceDataUrl = currentOriginalFlagData;
        if (currentOriginalFlagType === 'svg' && typeof currentOriginalFlagData === 'string') {
            sourceDataUrl = svgStringToDataURL(currentOriginalFlagData); // Uses exported function now
            if (!sourceDataUrl) {
                 // Attempt to update status via main config if available
                 if(mainCfg.statusDiv) mainCfg.statusDiv.textContent = `Error converting SVG flag to displayable format.`;
                 console.error("Flag Editor: Failed to convert SVG string to Data URL.");
                 flagEditorResolve = null;
                 return resolve(null);
            }
        } else if (!String(sourceDataUrl).startsWith('data:image')) {
             if(mainCfg.statusDiv) mainCfg.statusDiv.textContent = `Error: Invalid source flag data provided.`;
             console.error("Flag Editor: Invalid source data - not SVG string or Data URL.");
             flagEditorResolve = null;
             return resolve(null);
        }

        feState.originalUrl = sourceDataUrl;

        mainCfg.flagEditorModalContainer.style.display = 'flex';

        await displayFeCurrentImage(); // Trigger initial processing and display
    });
}

async function handleFeApplyChanges() {
    if (!flagEditorResolve) return;

    if (feState.processingState === 'processing') {
        alert("Still processing, please wait...");
        return;
    }
    // Ensure processing is done before applying
    if (feState.processingState !== 'done') {
         showFeLoading(true, "Finalizing...");
         await displayFeCurrentImage(); // Re-run processing if needed
         showFeLoading(false);
         if (feState.processingState !== 'done') {
             alert("Flag processing failed. Cannot apply changes. Check console for errors.");
             return;
         }
    }

    if (feState.transformedUrl) {
        const resolveFunc = flagEditorResolve;
        flagEditorResolve = null;
        resolveFunc(feState.transformedUrl); // Resolve with the final DataURL
        closeFeModal();
    } else {
        console.error("Flag Editor: Processing done, but no transformed URL available.");
        alert("An error occurred: Standardized flag data is missing.");
    }
}

function handleFeCancel() {
     if (!flagEditorResolve) return;
     const resolveFunc = flagEditorResolve;
     flagEditorResolve = null;
     resolveFunc(null); // Resolve with null indicating cancellation
     closeFeModal();
}

function closeFeModal() {
    if (mainCfg.flagEditorModalContainer) {
        mainCfg.flagEditorModalContainer.style.display = 'none';
    }
    cancelFeManualCrop(); // Ensure inner cropper is destroyed
    resetFeState();
    // Clear references to the flag being edited
    currentOriginalFlagData = null;
    currentOriginalFlagType = null;
    currentOriginalWidth = null;
    currentOriginalHeight = null;
}


// --- Event Handlers for Editor Controls ---
function handleFePreprocessChange() {
    if (!fePreprocessModeSelect) return;
    fePreprocessMode = fePreprocessModeSelect.value;
    toggleFeManualCropButton();
    invalidateFeTransformCache(false); // Invalidate cache, but keep crop data if exists
    displayFeCurrentImage(); // Trigger reprocessing
}


function handleFeFinalScaleChange() {
    if (!feFinalScaleModeSelect) return;
    feFinalScaleMode = feFinalScaleModeSelect.value;
    invalidateFeTransformCache(false); // Invalidate cache, but keep crop data if exists
    displayFeCurrentImage(); // Trigger reprocessing
}

function handleFeRatioChange() {
    if (!feRatioSelect) return;
    const ratio = feRatioSelect.value;
    if (ratio === '8:5') { feFinalWidth = 160; feFinalHeight = 100; }
    else if (ratio === '3:2') { feFinalWidth = 150; feFinalHeight = 100; }
    else { feFinalWidth = 100; feFinalHeight = 100; } // Assuming 1:1
    invalidateFeTransformCache(true); // Reset manual crop if ratio changes fundamentally
    displayFeCurrentImage(); // Trigger reprocessing
}

// --- UI Updates ---
function invalidateFeTransformCache(resetManualCropData = false) {
    // Clear downstream cached results
    feState.intermediaryUrl = null;
    feState.transformedUrl = null;
    feState.transparencyCroppedUrl = null; // Always recalculate transparency crop if needed
    feState.preprocessModeUsed = null;
    // Conditionally reset manual crop data
    if (resetManualCropData) {
        feState.manualCropData = null;
        feState.manualCropSourceUrl = null;
    }
    // Reset processing state only if it was finished or errored
    if (feState.processingState === 'done' || feState.processingState === 'error' || feState.processingState === 'idle') {
        feState.processingState = 'idle';
    }
    toggleFeManualCropButton(); // Update button state based on changes
}

async function displayFeCurrentImage() {
    toggleFeManualCropButton();

    if (!feState.originalUrl) {
        console.error(`Flag Editor: Original URL missing.`);
        clearFePreviews();
        return;
    }

    // Display original image (always available)
    if (feOriginalPreview) {
        feOriginalPreview.src = feState.originalUrl;
        feOriginalPreview.alt = `Original Flag`;
        feOriginalPreview.onerror = () => { feOriginalPreview.src = ''; feOriginalPreview.alt = 'Error loading original'; };
    }

    // Clear previews initially
    if (feIntermediaryPanel) feIntermediaryPanel.style.display = 'none';
    if (feIntermediaryPreview) feIntermediaryPreview.src = '';
    if (feTransformedPreview) { feTransformedPreview.src = ''; feTransformedPreview.alt = 'Processing...'; }

    // Trigger processing if needed
    if (feState.processingState === 'idle') {
        feState.processingState = 'processing';
        showFeLoading(true, `Processing flag...`);
        try {
            // Call the *internal* processing function using modal state
            await processImageTransformation();
            // If successful, processingState becomes 'done', call again to display results
            if (feState.processingState === 'done') {
                setTimeout(() => displayFeCurrentImage(), 0); // Defer display update
            }
        } catch (error) {
            console.error(`Flag Editor: Error caught during processing:`, error);
             if (feState.processingState !== 'done') feState.processingState = 'error'; // Mark as error if not already done
             if (feTransformedPreview) {
                 feTransformedPreview.src = '';
                 feTransformedPreview.alt = 'Processing Failed';
             }
             alert("An error occurred during flag processing. Check console for details.");
        } finally {
             showFeLoading(false);
             toggleFeManualCropButton(); // Update button state after processing attempt
        }
    } else if (feState.processingState === 'done') {
        // --- Display Intermediary Image ---
        let intermediaryTitle = "Pre-processed";
        let intermediarySrc = null;
        if (feState.preprocessModeUsed === 'manual_crop' && feState.manualCropSourceUrl) {
            intermediaryTitle = "Manually Cropped Source";
            intermediarySrc = feState.manualCropSourceUrl;
        } else if (feState.preprocessModeUsed === 'old_flags' && feState.intermediaryUrl && feState.intermediaryUrl !== feState.originalUrl) {
             intermediaryTitle = "Frame Removed";
             intermediarySrc = feState.intermediaryUrl;
        } else if (feState.transparencyCroppedUrl && feState.transparencyCroppedUrl !== feState.originalUrl) {
             intermediaryTitle = "Transparency Cropped";
             intermediarySrc = feState.transparencyCroppedUrl;
        }
        if (intermediarySrc && feIntermediaryPanel && feIntermediaryPanelTitle && feIntermediaryPreview) {
             feIntermediaryPanelTitle.textContent = intermediaryTitle;
             feIntermediaryPreview.src = intermediarySrc;
             feIntermediaryPreview.alt = intermediaryTitle + ` Flag`;
             feIntermediaryPreview.onerror = () => { feIntermediaryPreview.src = ''; feIntermediaryPreview.alt = 'Error loading intermediary'; feIntermediaryPanel.style.display = 'none'; };
             feIntermediaryPanel.style.display = 'flex';
        } else if (feIntermediaryPanel) {
             feIntermediaryPanel.style.display = 'none';
             if (feIntermediaryPreview) feIntermediaryPreview.src = '';
        }

        // --- Display Transformed Image ---
        if (feState.transformedUrl && feTransformedPreview) {
            feTransformedPreview.src = feState.transformedUrl;
            feTransformedPreview.alt = `Standardized Flag`;
            feTransformedPreview.onerror = () => { feTransformedPreview.src = ''; feTransformedPreview.alt = 'Error loading transformed'; };
        }
    } else if (feState.processingState === 'error') {
        if (feTransformedPreview) {
            feTransformedPreview.src = '';
            feTransformedPreview.alt = 'Processing Failed';
        }
    } else if (feState.processingState === 'processing') {
        // Already showing loading state
        if (feTransformedPreview) {
            feTransformedPreview.src = '';
            feTransformedPreview.alt = 'Processing...';
        }
    }
}


function toggleFeManualCropButton() {
    if (!feManualCropControls || !feDefineCropBtn || !feManualCropStatus) return;
    const showButton = fePreprocessMode === 'manual_crop';
    feManualCropControls.style.display = showButton ? 'block' : 'none';
    if (showButton) {
        // Disable button if currently processing, errored, or no original image loaded
        feDefineCropBtn.disabled = feState.processingState === 'processing' || feState.processingState === 'error' || !feState.originalUrl;
        // Update status text based on whether crop data exists
        feManualCropStatus.textContent = feState.manualCropData ? '(Crop Defined)' : '(No Crop Defined)';
    } else {
         feManualCropStatus.textContent = ''; // Clear status text if not in manual crop mode
    }
}

// --- Manual Crop Functions ---
async function initFeCropper() {
    if (!feCropModal || !feCropImage || !window.Cropper) { // Check if Cropper lib is loaded
        console.error("Flag Editor Cropper: Modal elements or Cropper.js library missing.");
        alert("Cannot initialize cropper. Library might be missing.");
        return;
    }
    if (!feState.originalUrl) {
        console.error("Flag Editor Cropper: Original flag URL data missing.");
        return;
    }

    showFeLoading(true, "Preparing cropper...");
    let sourceForCropping = null;

    try {
        // Determine the best source: ManualCropSource > TransparencyCropped > Original
        if (feState.manualCropSourceUrl) { // If we have a previous manual crop result
             sourceForCropping = feState.manualCropSourceUrl;
             console.log("Using cached manual crop result for cropper.");
        } else if (feState.transparencyCroppedUrl) { // If we have a transparency crop result
             sourceForCropping = feState.transparencyCroppedUrl;
             console.log("Using cached transparency cropped URL for cropper.");
        } else { // Fallback to original (after ensuring transparency crop is attempted)
             console.log("No cached URL, processing original for cropper source...");
             const originalImage = await loadImage(feState.originalUrl);
             const croppedImage = await cropTransparentArea(originalImage);
             sourceForCropping = croppedImage.src;
             feState.transparencyCroppedUrl = sourceForCropping; // Cache the result
        }


        if (!sourceForCropping) {
            throw new Error("Could not prepare a valid image source for the cropper.");
        }

        // Destroy previous instance if exists
        if (feCropperInstance) {
            try { feCropperInstance.destroy(); } catch(e) { console.warn("Error destroying previous cropper instance:", e); }
            feCropperInstance = null;
        }
        feCropImage.src = ''; // Clear previous image

        // Load the determined source into the cropper image element
        feCropImage.onload = () => {
            showFeLoading(false);
            if (!feCropImage.naturalWidth || !feCropImage.naturalHeight) {
                console.error("Flag Editor Cropper: Image loaded but has zero dimensions.");
                cancelFeManualCrop();
                alert("Error: Cropper image has no dimensions.");
                return;
            }
            // Initialize Cropper
            try {
                feCropperInstance = new Cropper(feCropImage, {
                    viewMode: 1, // Restrict crop box to canvas
                    dragMode: 'move', // Allow moving the image behind the crop box
                    background: false, // Don't show grid background
                    autoCropArea: 0.9, // Initial crop box size
                    responsive: true, // Resize cropper with window
                    checkCrossOrigin: false, // Handled by loading image first
                    ready() { // Use ready event to apply previous crop data
                        if (feState.manualCropData) {
                            try {
                                feCropperInstance.setData(feState.manualCropData);
                            } catch(e) {
                                console.warn("Could not apply previous crop data (might be invalid for current image size):", e);
                                // Optionally reset crop box if data fails
                                // feCropperInstance.reset();
                            }
                        }
                    }
                });
                 feCropModal.style.display = 'flex'; // Show modal AFTER cropper is ready
            } catch (cropperError) {
                console.error("Failed to initialize Cropper.js:", cropperError);
                showFeLoading(false);
                alert("Failed to initialize image cropper. Check console.");
                cancelFeManualCrop(); // Clean up
            }
        };

        feCropImage.onerror = (errorEvent) => {
            showFeLoading(false);
            alert("Failed to load image for cropping. Check console.");
            cancelFeManualCrop();
        };

        feCropImage.src = sourceForCropping; // Set src to trigger onload/onerror

    } catch (error) {
        showFeLoading(false);
        console.error("Error preparing cropper source:", error);
        alert(`Error preparing image for cropping: ${error.message}`);
        cancelFeManualCrop();
    }
}


async function applyFeManualCrop() {
    if (!feCropperInstance) return;

    showFeLoading(true, "Applying crop...");
    try {
        // Get cropped data as a canvas element
        const croppedCanvas = feCropperInstance.getCroppedCanvas({
             imageSmoothingEnabled: true,
             imageSmoothingQuality: 'high'
        });
        if (!croppedCanvas) throw new Error("Failed to get cropped canvas from Cropper.");

        // Store the result as a DataURL and the crop parameters
        feState.manualCropSourceUrl = croppedCanvas.toDataURL('image/png');
        feState.manualCropData = feCropperInstance.getData(true); // Get rounded crop data

        // Invalidate downstream caches and reset processing state
        feState.intermediaryUrl = feState.manualCropSourceUrl; // The result of manual crop is the new intermediary
        feState.transformedUrl = null; // Final transform needs recalculation
        feState.processingState = 'idle';
        feState.preprocessModeUsed = 'manual_crop'; // Record that manual crop was used

        cancelFeManualCrop(); // Close the inner crop modal

        await displayFeCurrentImage(); // Update main previews, trigger final transform

    } catch (error) {
         console.error("Error applying manual crop:", error);
         alert("Error applying crop. Check console.");
         // Don't close modal on error, let user retry or cancel
    } finally {
         showFeLoading(false);
    }
}

function cancelFeManualCrop() {
    if (feCropperInstance) {
        try { feCropperInstance.destroy(); } catch (e) { console.warn("Error destroying cropper:", e); }
        feCropperInstance = null;
    }
    if (feCropImage) feCropImage.src = ''; // Clear image source
    if (feCropModal) feCropModal.style.display = 'none'; // Hide modal
}


// --- Image Processing Core ---
async function cropTransparentArea(img) {
     // Safety check for image validity
     if (!img || img.naturalWidth === 0 || img.naturalHeight === 0) {
         console.warn("Transparency Crop: Invalid image input.");
         return img; // Return original if invalid
     }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
         console.error("Transparency Crop: Failed to get 2D context.");
         return img; // Cannot proceed without context
    }
    let imgData;
    // Try drawing and getting data, retry loading if it fails (e.g., tainted canvas)
    try {
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (e) {
         console.warn("Transparency Crop: Initial draw/getImageData failed. Retrying load...", e);
         try {
            const rImg = await loadImage(img.src); // Reload the image
            canvas.width = rImg.naturalWidth; canvas.height = rImg.naturalHeight;
            ctx.drawImage(rImg, 0, 0); imgData = ctx.getImageData(0, 0, canvas.width, canvas.height); img = rImg; // Update img ref
         } catch (rErr) { console.error("Transparency Crop: Image reload failed:", rErr); return img; } // Return original on reload failure
    }
    const data = imgData.data; let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    const alphaThreshold = 10; // Pixels with alpha > 10 are considered non-transparent
    // Find the bounds of non-transparent pixels
    for (let y = 0; y < canvas.height; y++) { for (let x = 0; x < canvas.width; x++) { if (data[(y * canvas.width + x) * 4 + 3] > alphaThreshold) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); } } }
    // If no non-transparent pixels found, or if bounds are invalid, return original
    if (maxX < minX || maxY < minY) {
        console.log("Transparency Crop: No non-transparent pixels found.");
        return img;
    }
    const croppedWidth = maxX - minX + 1; const croppedHeight = maxY - minY + 1;
    // If the image is already perfectly cropped, return original
    if (croppedWidth === canvas.width && croppedHeight === canvas.height && minX === 0 && minY === 0) {
        console.log("Transparency Crop: Image already cropped.");
        return img;
    }
    // Create a new canvas for the cropped result
    const croppedCanvas = document.createElement('canvas'); croppedCanvas.width = croppedWidth; croppedCanvas.height = croppedHeight;
    const croppedCtx = croppedCanvas.getContext('2d'); if (!croppedCtx) { console.error("Transparency Crop: Could not get context for cropped canvas"); return img; }
    // Draw the cropped portion of the original canvas onto the new canvas
    croppedCtx.drawImage(canvas, minX, minY, croppedWidth, croppedHeight, 0, 0, croppedWidth, croppedHeight);
    // Load the cropped canvas content back into an Image object
    try {
         const loadedCroppedImage = await loadImage(croppedCanvas.toDataURL());
         console.log(`Transparency Crop: Cropped from ${canvas.width}x${canvas.height} to ${croppedWidth}x${croppedHeight}`);
         return loadedCroppedImage;
    } catch (err) { console.error("Transparency Crop: Failed to load cropped canvas data:", err); return img; } // Return original on final load error
}

async function removeUniformFrame(img) {
     // Constants for frame detection logic
     const MIN_DIMENSION = 20, CORNER_SAMPLE_SIZE = 15, OPAQUE_THRESHOLD = 200;
     const COLOR_TOLERANCE = 30, CONSISTENCY_MULTIPLIER = 2.5, CONSISTENCY_FLAT = 10; const MIN_FRAME_THICKNESS = 3;
     // Basic validation
     if (!img || img.naturalWidth < MIN_DIMENSION || img.naturalHeight < MIN_DIMENSION) return img;
     const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) { console.error("Frame Removal: Could not get context"); return img; }
     let imgData;
    // Draw image and get pixel data, with retry on failure
    try { canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; ctx.drawImage(img, 0, 0); imgData = ctx.getImageData(0, 0, canvas.width, canvas.height); }
    catch (e) { console.warn("Frame Removal: Initial draw/getImageData failed. Retrying load...", e); try { const rImg = await loadImage(img.src); canvas.width = rImg.naturalWidth; canvas.height = rImg.naturalHeight; ctx.drawImage(rImg, 0, 0); imgData = ctx.getImageData(0, 0, canvas.width, canvas.height); img = rImg; } catch (rErr) { console.error("Frame Removal: Image reload failed:", rErr); return img; } }
     const data = imgData.data; const w = canvas.width; const h = canvas.height; let rSum = 0, gSum = 0, bSum = 0, count = 0;
     // Sample top-left corner color
     const sampleLimitX = Math.min(CORNER_SAMPLE_SIZE, Math.floor(w / 2)); const sampleLimitY = Math.min(CORNER_SAMPLE_SIZE, Math.floor(h / 2));
     for (let y = 0; y < sampleLimitY; y++) { for (let x = 0; x < sampleLimitX; x++) { const alphaIdx = (y * w + x) * 4 + 3; if (data[alphaIdx] > OPAQUE_THRESHOLD) { const rgbIdx = alphaIdx - 3; rSum += data[rgbIdx]; gSum += data[rgbIdx + 1]; bSum += data[rgbIdx + 2]; count++; } } }
     if (count === 0) return img; // No opaque pixels found in corner
     const frameColor = [Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count)]; // Average color
     // Helper to check if a pixel matches the frame color
     const isFramePixel = (x, y) => { if (x < 0 || x >= w || y < 0 || y >= h) return false; const i = (y * w + x) * 4; if (data[i + 3] < OPAQUE_THRESHOLD / 2) return false; return Math.abs(data[i]-frameColor[0])<=COLOR_TOLERANCE && Math.abs(data[i+1]-frameColor[1])<=COLOR_TOLERANCE && Math.abs(data[i+2]-frameColor[2])<=COLOR_TOLERANCE; };
     // Detect frame thickness on all four sides
     let top = 0; while (top < h / 2 && isFramePixel(Math.floor(w/2), top)) top++; let bottom = h-1; while (bottom >= h / 2 && isFramePixel(Math.floor(w/2), bottom)) bottom--; let left = 0; while (left < w / 2 && isFramePixel(left, Math.floor(h/2))) left++; let right = w-1; while (right >= w / 2 && isFramePixel(right, Math.floor(h/2))) right--;
     const frameTop=top, frameBottom=h-1-bottom, frameLeft=left, frameRight=w-1-right; const minFrame = Math.min(frameTop, frameBottom, frameLeft, frameRight); const maxFrame = Math.max(frameTop, frameBottom, frameLeft, frameRight);
     // Check if frame thickness is consistent and meets minimum requirements
     if (minFrame < MIN_FRAME_THICKNESS || maxFrame > minFrame * CONSISTENCY_MULTIPLIER + CONSISTENCY_FLAT) {
        console.log(`Frame Removal: Skipping (Min: ${minFrame}, Max: ${maxFrame}, ReqMin: ${MIN_FRAME_THICKNESS})`);
        return img; // Frame inconsistent or too thin
     }
     // Calculate crop amount and new dimensions
     const cropAmount = minFrame; const newWidth = w - cropAmount*2, newHeight = h - cropAmount*2; if (newWidth <= 0 || newHeight <= 0 || (newWidth === w && newHeight === h)) return img; // No change or invalid dimensions
     // Create cropped canvas
     const cropCanvas = document.createElement('canvas'); cropCanvas.width = newWidth; cropCanvas.height = newHeight; const cropCtx = cropCanvas.getContext('2d'); if (!cropCtx) { console.error("Frame Removal: Could not get context for crop canvas"); return img; }
     cropCtx.drawImage(canvas, cropAmount, cropAmount, newWidth, newHeight, 0, 0, newWidth, newHeight); // Draw cropped area
     // Load result back into an Image object
     try {
         const loadedCroppedImage = await loadImage(cropCanvas.toDataURL());
         console.log(`Frame Removal: Removed frame of approx ${cropAmount}px. New size: ${newWidth}x${newHeight}`);
         return loadedCroppedImage;
    } catch (err) { console.error("Frame Removal: Failed to load frame-removed canvas data:", err); return img; }
}

// Helper function to draw a rounded rectangle path
function feCreateRoundedRectPath(ctx, x, y, w, h, r) { if(w<2*r)r=w/2;if(h<2*r)r=h/2;ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath(); }

// Helper function to draw an image clipped to a rounded rectangle
function feDrawRoundedImage(ctx, img, dx, dy, dw, dh, r, sx = 0, sy = 0, sw = img?.naturalWidth || dw, sh = img?.naturalHeight || dh) {
    // Basic validation
    if (!img || img.naturalWidth === 0 || img.naturalHeight === 0 || sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) {
        console.warn("Flag Editor: DrawRoundedImage called with invalid image or dimensions.");
        // Optionally draw a placeholder/error indicator
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.fillRect(dx, dy, dw, dh);
        return;
    }
    ctx.save(); // Save current drawing state
    feCreateRoundedRectPath(ctx, dx, dy, dw, dh, r); // Create the clipping path
    ctx.clip(); // Apply the clipping path
    try {
        // Draw the (potentially cropped) source image onto the destination canvas
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    } catch (e) {
        console.error("Flag Editor: drawImage Error within feDrawRoundedImage:", e);
        // Optionally draw an error indicator within the clipped area
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.fillRect(dx, dy, dw, dh);
    }
    ctx.restore(); // Restore drawing state (remove clipping path)
}


// --- Internal processing pipeline called by both manual editor and automatic standardization ---
/**
 * Performs the full flag standardization pipeline based on provided options.
 * @param {Image} initialSourceImg - The initial Image object to process (e.g., original loaded flag).
 * @param {object} options - Processing parameters { preprocessMode, finalScaleMode, finalWidth, finalHeight, frameThickness, fixedCornerRadius }.
 * @param {object | null} manualCropDetails - Optional: Contains { sourceUrl: string, data: object } if manual crop was applied.
 * @returns {Promise<{transformedUrl: string, intermediaryUrl: string | null}>} URLs of the final and intermediary images.
 * @throws {Error} If critical processing steps fail.
 */
async function _performStandardizationPipeline(initialSourceImg, options, manualCropDetails = null) {
    let sourceImg = initialSourceImg;
    let intermediaryUrl = initialSourceImg.src; // Start with the initial source as intermediary
    let transparencyCroppedUrl = null;

    // --- 1. Transparency Crop (almost always applied first) ---
    try {
         const croppedTransparent = await cropTransparentArea(sourceImg);
         transparencyCroppedUrl = croppedTransparent.src; // Store the result URL
         if (transparencyCroppedUrl !== sourceImg.src) {
             sourceImg = croppedTransparent; // Update source if changed
             intermediaryUrl = transparencyCroppedUrl; // Update intermediary if changed
         }
     } catch (error) {
         console.warn("Transparency Crop step failed, continuing with previous source.", error);
     }


    // --- 2. Pre-processing based on mode ---
    if (options.preprocessMode === 'manual_crop' && manualCropDetails?.sourceUrl) {
        try {
            // Load the pre-cropped image data provided from the manual crop step
            sourceImg = await loadImage(manualCropDetails.sourceUrl);
            intermediaryUrl = manualCropDetails.sourceUrl; // This IS the intermediary result
            console.log("Using manually cropped image as source for final transform.");
        } catch (err) {
            console.error(`FE Pipeline: Failed to load manualCropSourceUrl. Error: ${err.message}. Falling back.`);
            // Fallback to the transparency-cropped version if manual crop fails to load
            sourceImg = await loadImage(transparencyCroppedUrl || initialSourceImg.src);
            intermediaryUrl = sourceImg.src;
        }
    } else if (options.preprocessMode === 'old_flags') {
        try {
            const frameRemovedImg = await removeUniformFrame(sourceImg);
            if (frameRemovedImg.src !== sourceImg.src) {
                sourceImg = frameRemovedImg; // Update source if frame removed
                intermediaryUrl = sourceImg.src; // Update intermediary URL
                 console.log("Applied 'old_flags' frame removal.");
            } else {
                 console.log("'old_flags' mode selected, but no frame detected/removed.");
            }
        } catch (error) {
            console.warn("'old_flags' frame removal step failed, continuing with previous source.", error);
        }
    } else {
        // 'default' mode uses the transparency-cropped image directly
        if (transparencyCroppedUrl && transparencyCroppedUrl !== initialSourceImg.src) {
            console.log("Using transparency-cropped image as source for final transform.");
        } else {
             console.log("Using original (or failed transparency crop) image as source for final transform.");
        }
    }


    // --- 3. Final Scaling and Drawing ---
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = options.finalWidth;
    finalCanvas.height = options.finalHeight;
    const ctx = finalCanvas.getContext('2d');
    if (!ctx) throw new Error("Could not get context for final flag canvas");

    // Calculate dimensions for the inner flag area (inside the frame)
    const innerFlagWidth = options.finalWidth - options.frameThickness * 2;
    const innerFlagHeight = options.finalHeight - options.frameThickness * 2;
    if (innerFlagWidth <= 0 || innerFlagHeight <= 0) throw new Error(`Frame thickness (${options.frameThickness}px) too large for final dimensions.`);

    // Draw the background frame (e.g., black)
    ctx.fillStyle = "#000000"; // Frame color
    feCreateRoundedRectPath(ctx, 0, 0, options.finalWidth, options.finalHeight, options.fixedCornerRadius);
    ctx.fill();

    // Get source image dimensions for scaling calculations
    const sourceWidth = sourceImg.naturalWidth;
    const sourceHeight = sourceImg.naturalHeight;

    if (sourceWidth <= 0 || sourceHeight <= 0) {
        console.warn(`FE Pipeline: Final source image has zero dimensions.`);
        // Draw placeholder in inner area if source is invalid
        ctx.fillStyle = "rgba(255, 0, 0, 0.2)";
        ctx.fillRect(options.frameThickness, options.frameThickness, innerFlagWidth, innerFlagHeight);
    } else if (options.finalScaleMode === "crop") {
        // --- Auto Crop Scaling ---
        let sx = 0, sy = 0, sw = sourceWidth, sh = sourceHeight;
        const targetInnerRatio = innerFlagWidth / innerFlagHeight;
        const sourceRatio = sourceWidth / sourceHeight;

        if (sourceRatio > targetInnerRatio) {
            // Source is wider than target aspect ratio, crop sides
            sw = sourceHeight * targetInnerRatio;
            sx = (sourceWidth - sw) / 2;
        } else if (sourceRatio < targetInnerRatio) {
            // Source is taller than target aspect ratio, crop top/bottom
            sh = sourceWidth / targetInnerRatio;
            sy = (sourceHeight - sh) / 2;
        }
        // Ensure calculated source width/height are valid
        if (sw <= 0 || sh <= 0) {
             sx = 0; sy = 0; sw = sourceWidth; sh = sourceHeight; // Fallback to using full source
             console.warn(`FE Pipeline: Invalid crop calculation resulted in zero dimension. Using full source.`);
        }
        // Draw the cropped source into the rounded inner area
        // Adjust radius slightly for inner drawing
        let innerRadius = Math.max(0, options.fixedCornerRadius - options.frameThickness);
        feDrawRoundedImage(ctx, sourceImg, options.frameThickness, options.frameThickness, innerFlagWidth, innerFlagHeight, innerRadius, sx, sy, sw, sh);
    } else {
        // --- Warp (Stretch/Squash) Scaling ---
        // Draw the entire source image warped into the rounded inner area
        // Adjust radius slightly for inner drawing
        let innerRadius = Math.max(0, options.fixedCornerRadius - options.frameThickness);
        feDrawRoundedImage(ctx, sourceImg, options.frameThickness, options.frameThickness, innerFlagWidth, innerFlagHeight, innerRadius, 0, 0, sourceWidth, sourceHeight);
    }

    // --- 4. Get Final Data URL ---
    const finalTransformedUrl = finalCanvas.toDataURL("image/png");

    return { transformedUrl: finalTransformedUrl, intermediaryUrl: intermediaryUrl };
}

// --- Image Processing function called by the MANUAL EDITOR UI ---
async function processImageTransformation() {
     // This function is called by the manual editor UI interactions
     if (!feState.originalUrl) {
         const errorMsg = `Flag Editor (Manual): Invalid state - missing originalUrl.`;
         console.error(errorMsg);
         feState.processingState = 'error';
         throw new Error(errorMsg);
     }

     let initialImage;
     try {
         initialImage = await loadImage(feState.originalUrl); // Start with the original
     } catch (error) {
          console.error(`Flag Editor (Manual): Failed to load initial image ${feState.originalUrl}`, error);
          feState.processingState = 'error';
          throw error;
     }

     // Prepare options based on current UI selections
     const options = {
         preprocessMode: fePreprocessMode,
         finalScaleMode: feFinalScaleMode,
         finalWidth: feFinalWidth,
         finalHeight: feFinalHeight,
         frameThickness: feFrameThickness,
         fixedCornerRadius: feFixedCornerRadius
     };

     // Prepare manual crop details if applicable
     const manualCropDetails = (fePreprocessMode === 'manual_crop' && feState.manualCropSourceUrl && feState.manualCropData)
         ? { sourceUrl: feState.manualCropSourceUrl, data: feState.manualCropData }
         : null;

     try {
         // Call the core pipeline function
         const result = await _performStandardizationPipeline(initialImage, options, manualCropDetails);

         // Update the internal state of the manual editor
         feState.transformedUrl = result.transformedUrl;
         feState.intermediaryUrl = result.intermediaryUrl; // Store the actual intermediary used
         // Update transparencyCroppedUrl if the intermediary result is different and likely the transparency crop
         if (result.intermediaryUrl && result.intermediaryUrl !== feState.originalUrl && feState.preprocessModeUsed !== 'manual_crop' && feState.preprocessModeUsed !== 'old_flags') {
             feState.transparencyCroppedUrl = result.intermediaryUrl;
         }
         feState.processingState = 'done';
         feState.preprocessModeUsed = fePreprocessMode; // Record mode used for this result

     } catch (error) {
         console.error(`Flag Editor (Manual): CRITICAL ERROR during processing pipeline - ${error.message}`, error);
         feState.processingState = 'error';
         feState.transformedUrl = null; // Clear result on error
         throw error; // Re-throw to be caught by the caller (displayFeCurrentImage)
     }
 }

// --- Exported function for AUTOMATIC standardization ---
/**
 * Standardizes a flag image based on provided data and options, independent of the modal UI.
 * @param {string} sourceData - The original flag data (DataURL or SVG string).
 * @param {string} sourceType - The original flag type ('svg', 'png', 'jpeg', etc.).
 * @param {number} sourceWidth - Original width of the flag.
 * @param {number} sourceHeight - Original height of the flag.
 * @param {object} options - Processing parameters { preprocessMode, finalScaleMode, finalWidth, finalHeight, frameThickness, fixedCornerRadius }.
 * @returns {Promise<string>} A Promise resolving with the Data URL (PNG) of the standardized flag.
 * @throws {Error} If loading or processing fails critically.
 */
export async function standardizeFlag(sourceData, sourceType, sourceWidth, sourceHeight, options) {
    let initialImageUrl = sourceData;

    // Convert SVG string to DataURL if necessary
    if (sourceType === 'svg' && typeof sourceData === 'string' && !sourceData.startsWith('data:image/svg+xml')) {
        initialImageUrl = svgStringToDataURL(sourceData); // Use exported function
        if (!initialImageUrl) {
            throw new Error("Failed to convert SVG string to Data URL for standardization.");
        }
    } else if (!String(initialImageUrl).startsWith('data:image')) {
         throw new Error("Invalid sourceData provided for standardization: Must be SVG string or Data URL.");
    }

    let initialImage;
    try {
        // Load the initial image (DataURL) into an Image object
        initialImage = await loadImage(initialImageUrl); // Use exported function
        if (!initialImage.naturalWidth || !initialImage.naturalHeight) {
             // Use provided dimensions if natural dimensions fail (e.g., SVG issues)
             console.warn(`StandardizeFlag: Loaded image has zero dimensions. Using provided ${sourceWidth}x${sourceHeight}`);
             // We can't directly set naturalWidth/Height, but pipeline should handle 0 dims
        }
    } catch (error) {
        console.error(`StandardizeFlag: Failed to load initial image from DataURL: ${initialImageUrl.substring(0,100)}...`, error);
        throw new Error(`Failed to load flag image for standardization: ${error.message}`);
    }

    try {
        // Call the core pipeline function with the loaded image and options
        // No manual crop details are passed for automatic standardization
        const result = await _performStandardizationPipeline(initialImage, options, null);
        return result.transformedUrl; // Return only the final standardized URL
    } catch (error) {
        console.error(`StandardizeFlag: Error during processing pipeline - ${error.message}`, error);
        // Re-throw the error to be handled by the caller (e.g., processAndAssignFlag)
        throw new Error(`Flag standardization failed: ${error.message}`);
    }
}