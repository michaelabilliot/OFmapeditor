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

function loadImage(url) {
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

function svgStringToDataURL(svgString) {
    try {
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
                 <span id="fe-manualCropStatus" style="font-size: 0.85rem; color: var(--text-color); opacity: 0.7; margin-left: 1em;"></span> {/* Adjusted text color */}
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
            sourceDataUrl = svgStringToDataURL(currentOriginalFlagData);
            if (!sourceDataUrl) {
                 mainCfg.statusDiv.textContent = `Error converting SVG flag to displayable format.`;
                 console.error("Flag Editor: Failed to convert SVG string to Data URL.");
                 flagEditorResolve = null;
                 return resolve(null);
            }
        } else if (!String(sourceDataUrl).startsWith('data:image')) {
             mainCfg.statusDiv.textContent = `Error: Invalid source flag data provided.`;
             console.error("Flag Editor: Invalid source data - not SVG string or Data URL.");
             flagEditorResolve = null;
             return resolve(null);
        }

        feState.originalUrl = sourceDataUrl;

        mainCfg.flagEditorModalContainer.style.display = 'flex';

        await displayFeCurrentImage();
    });
}

async function handleFeApplyChanges() {
    if (!flagEditorResolve) return;

    if (feState.processingState === 'processing') {
        alert("Still processing, please wait...");
        return;
    }
    if (feState.processingState !== 'done') {
         showFeLoading(true, "Finalizing...");
         await displayFeCurrentImage();
         showFeLoading(false);
         if (feState.processingState !== 'done') {
             alert("Flag processing failed. Cannot apply changes. Check console for errors.");
             return;
         }
    }

    if (feState.transformedUrl) {
        const resolveFunc = flagEditorResolve;
        flagEditorResolve = null;
        resolveFunc(feState.transformedUrl);
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
     resolveFunc(null);
     closeFeModal();
}

function closeFeModal() {
    if (mainCfg.flagEditorModalContainer) {
        mainCfg.flagEditorModalContainer.style.display = 'none';
    }
    cancelFeManualCrop();
    resetFeState();
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
    invalidateFeTransformCache(false);
    displayFeCurrentImage();
}


function handleFeFinalScaleChange() {
    if (!feFinalScaleModeSelect) return;
    feFinalScaleMode = feFinalScaleModeSelect.value;
    invalidateFeTransformCache(false);
    displayFeCurrentImage();
}

function handleFeRatioChange() {
    if (!feRatioSelect) return;
    const ratio = feRatioSelect.value;
    if (ratio === '8:5') { feFinalWidth = 160; feFinalHeight = 100; }
    else if (ratio === '3:2') { feFinalWidth = 150; feFinalHeight = 100; }
    else { feFinalWidth = 100; feFinalHeight = 100; }
    invalidateFeTransformCache(true);
    displayFeCurrentImage();
}

// --- UI Updates ---
function invalidateFeTransformCache(resetManualCropData = false) {
    feState.intermediaryUrl = null;
    feState.transformedUrl = null;
    feState.transparencyCroppedUrl = null;
    feState.preprocessModeUsed = null;
    if (resetManualCropData) {
        feState.manualCropData = null;
        feState.manualCropSourceUrl = null;
    }
    if (feState.processingState === 'done' || feState.processingState === 'error' || feState.processingState === 'idle') {
        feState.processingState = 'idle';
    }
    toggleFeManualCropButton();
}

async function displayFeCurrentImage() {
    toggleFeManualCropButton();

    if (!feState.originalUrl) {
        console.error(`Flag Editor: Original URL missing.`);
        clearFePreviews();
        return;
    }

    if (feOriginalPreview) {
        feOriginalPreview.src = feState.originalUrl;
        feOriginalPreview.alt = `Original Flag`;
        feOriginalPreview.onerror = () => { feOriginalPreview.src = ''; feOriginalPreview.alt = 'Error loading original'; };
    }

    let intermediaryTitle = "Pre-processed";
    let intermediarySrc = null;
    if (feState.processingState === 'done') {
        if (feState.preprocessModeUsed === 'manual_crop' && feState.manualCropSourceUrl) {
            intermediaryTitle = "Manually Cropped Source";
            intermediarySrc = feState.manualCropSourceUrl;
        } else if (feState.preprocessModeUsed === 'old_flags' && feState.intermediaryUrl) {
            intermediaryTitle = "Frame Removed";
            intermediarySrc = feState.intermediaryUrl;
        } else if (feState.transparencyCroppedUrl && feState.transparencyCroppedUrl !== feState.originalUrl) {
            intermediaryTitle = "Transparency Cropped";
            intermediarySrc = feState.transparencyCroppedUrl;
        }
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

    if (feState.processingState === 'idle' || feState.processingState === 'error') {
        if (feTransformedPreview) {
            feTransformedPreview.src = '';
            feTransformedPreview.alt = feState.processingState === 'error' ? 'Processing Failed' : 'Processing...';
        }
        if (feState.processingState !== 'error') {
            feState.processingState = 'processing';
            showFeLoading(true, `Processing flag...`);
            try {
                await processImageTransformation(
                    fePreprocessMode, feFinalScaleMode,
                    feFinalWidth, feFinalHeight, feFrameThickness, feFixedCornerRadius
                );
                if (feState.processingState === 'done') {
                    setTimeout(() => displayFeCurrentImage(), 0);
                } else if (feState.processingState === 'error') {
                    if (feTransformedPreview) {
                         feTransformedPreview.src = '';
                         feTransformedPreview.alt = 'Processing Failed';
                    }
                     alert("Flag processing failed. Check console for details.");
                }
            } catch (error) {
                console.error(`Flag Editor: Error caught in displayFeCurrentImage:`, error);
                 if (feState.processingState !== 'done') feState.processingState = 'error';
                 if (feTransformedPreview) {
                     feTransformedPreview.src = '';
                     feTransformedPreview.alt = 'Processing Failed';
                 }
                 alert("An error occurred during flag processing. Check console for details.");
            } finally {
                 showFeLoading(false);
                 toggleFeManualCropButton();
            }
        } else {
             toggleFeManualCropButton();
        }
    } else if (feState.processingState === 'done' && feState.transformedUrl) {
        if (feTransformedPreview) {
            feTransformedPreview.src = feState.transformedUrl;
            feTransformedPreview.alt = `Standardized Flag`;
            feTransformedPreview.onerror = () => { feTransformedPreview.src = ''; feTransformedPreview.alt = 'Error loading transformed'; };
        }
    } else if (feState.processingState === 'processing') {
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
        feDefineCropBtn.disabled = feState.processingState === 'processing' || feState.processingState === 'error' || !feState.originalUrl;
        feManualCropStatus.textContent = feState.manualCropData ? '(Crop Defined)' : '(No Crop Defined)';
    } else {
         feManualCropStatus.textContent = '';
    }
}

// --- Manual Crop Functions ---
async function initFeCropper() {
    if (!feCropModal || !feCropImage) {
        console.error("Flag Editor Cropper: Modal elements missing.");
        return;
    }
    if (!feState.originalUrl) {
        console.error("Flag Editor Cropper: Original flag URL data missing.");
        return;
    }

    showFeLoading(true, "Preparing cropper...");
    let sourceForCropping = null;

    try {
        if (feState.transparencyCroppedUrl) {
             try {
                 await loadImage(feState.transparencyCroppedUrl);
                 sourceForCropping = feState.transparencyCroppedUrl;
                 console.log("Using cached transparency cropped URL for cropper.");
             } catch (loadError) {
                 console.warn("Cached transparency cropped URL failed to load, recalculating for cropper.", loadError);
                 feState.transparencyCroppedUrl = null;
             }
        }

        if (!sourceForCropping) {
             console.log("No valid cached URL, processing original for cropper source...");
            const originalImage = await loadImage(feState.originalUrl);
            const croppedImage = await cropTransparentArea(originalImage);
            sourceForCropping = croppedImage.src;
            if (!feState.transparencyCroppedUrl) {
                 feState.transparencyCroppedUrl = sourceForCropping;
            }
        }

        if (!sourceForCropping) {
            throw new Error("Could not prepare a valid image source for the cropper.");
        }

        if (feCropperInstance) {
            feCropperInstance.destroy();
            feCropperInstance = null;
        }
        feCropImage.src = '';

        feCropImage.onload = () => {
            showFeLoading(false);
            if (!feCropImage.naturalWidth || !feCropImage.naturalHeight) {
                console.error("Flag Editor Cropper: Image loaded but has zero dimensions.");
                cancelFeManualCrop();
                alert("Error: Cropper image has no dimensions.");
                return;
            }
            try {
                feCropperInstance = new Cropper(feCropImage, {
                    viewMode: 1, dragMode: 'move', background: false,
                    autoCropArea: 0.9, responsive: true, checkCrossOrigin: false,
                    ready() {
                        if (feState.manualCropData) {
                            try { feCropperInstance.setData(feState.manualCropData); }
                            catch(e) { console.warn("Could not apply previous crop data:", e); }
                        }
                    }
                });
            } catch (cropperError) {
                console.error("Failed to initialize Cropper.js:", cropperError);
                showFeLoading(false);
                alert("Failed to initialize image cropper. Check console.");
                cancelFeManualCrop();
            }
        };

        feCropImage.onerror = (errorEvent) => {
            showFeLoading(false);
            // Error shown in console by loadImage utility now
            alert("Failed to load image for cropping. Check console.");
            cancelFeManualCrop();
        };

        feCropImage.src = sourceForCropping;
        feCropModal.style.display = 'flex';

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
        const croppedCanvas = feCropperInstance.getCroppedCanvas({
             imageSmoothingEnabled: true, imageSmoothingQuality: 'high'
        });
        if (!croppedCanvas) throw new Error("Failed to get cropped canvas from Cropper.");

        feState.manualCropSourceUrl = croppedCanvas.toDataURL('image/png');
        feState.manualCropData = feCropperInstance.getData(true);

        feState.processingState = 'idle';
        feState.preprocessModeUsed = 'manual_crop';

        cancelFeManualCrop(); // Close only the inner modal

        await displayFeCurrentImage();

    } catch (error) {
         console.error("Error applying manual crop:", error);
         alert("Error applying crop. Check console.");
         cancelFeManualCrop(); // Close only the inner modal
    } finally {
         showFeLoading(false);
    }
}

function cancelFeManualCrop() {
    if (feCropperInstance) {
        try { feCropperInstance.destroy(); } catch (e) { console.warn("Error destroying cropper:", e); }
        feCropperInstance = null;
    }
    if (feCropImage) feCropImage.src = '';
    if (feCropModal) feCropModal.style.display = 'none';
}


// --- Image Processing Core ---
async function cropTransparentArea(img) {
     if (!img || img.naturalWidth === 0 || img.naturalHeight === 0) return img;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let imgData;
    try {
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (e) {
         console.warn("Canvas draw/getImageData failed. Retrying load.", e);
         try {
            const rImg = await loadImage(img.src);
            canvas.width = rImg.naturalWidth; canvas.height = rImg.naturalHeight;
            ctx.drawImage(rImg, 0, 0); imgData = ctx.getImageData(0, 0, canvas.width, canvas.height); img = rImg;
         } catch (rErr) { console.error("Transparency Crop: Image reload failed:", rErr); return img; }
    }
    const data = imgData.data; let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    const alphaThreshold = 10;
    for (let y = 0; y < canvas.height; y++) { for (let x = 0; x < canvas.width; x++) { if (data[(y * canvas.width + x) * 4 + 3] > alphaThreshold) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); } } }
    if (maxX < minX || maxY < minY) return img;
    const croppedWidth = maxX - minX + 1; const croppedHeight = maxY - minY + 1;
    if (croppedWidth === canvas.width && croppedHeight === canvas.height && minX === 0 && minY === 0) return img;
    const croppedCanvas = document.createElement('canvas'); croppedCanvas.width = croppedWidth; croppedCanvas.height = croppedHeight;
    const croppedCtx = croppedCanvas.getContext('2d'); if (!croppedCtx) { console.error("Could not get context for cropped canvas"); return img; }
    croppedCtx.drawImage(canvas, minX, minY, croppedWidth, croppedHeight, 0, 0, croppedWidth, croppedHeight);
    try { return await loadImage(croppedCanvas.toDataURL()); } catch (err) { console.error("Failed to load cropped canvas data:", err); return img; }
}

async function removeUniformFrame(img) {
     const MIN_DIMENSION = 20, CORNER_SAMPLE_SIZE = 15, OPAQUE_THRESHOLD = 200;
     const COLOR_TOLERANCE = 30, CONSISTENCY_MULTIPLIER = 2.5, CONSISTENCY_FLAT = 10; const MIN_FRAME_THICKNESS = 3;
     if (!img || img.naturalWidth < MIN_DIMENSION || img.naturalHeight < MIN_DIMENSION) return img;
     const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) { console.error("Could not get context for frame removal canvas"); return img; }
     let imgData;
    try { canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; ctx.drawImage(img, 0, 0); imgData = ctx.getImageData(0, 0, canvas.width, canvas.height); }
    catch (e) { console.warn("Frame Removal: Canvas draw/getImageData failed. Retrying load.", e); try { const rImg = await loadImage(img.src); canvas.width = rImg.naturalWidth; canvas.height = rImg.naturalHeight; ctx.drawImage(rImg, 0, 0); imgData = ctx.getImageData(0, 0, canvas.width, canvas.height); img = rImg; } catch (rErr) { console.error("Frame Removal: Image reload failed:", rErr); return img; } }
     const data = imgData.data; const w = canvas.width; const h = canvas.height; let rSum = 0, gSum = 0, bSum = 0, count = 0;
     const sampleLimitX = Math.min(CORNER_SAMPLE_SIZE, Math.floor(w / 2)); const sampleLimitY = Math.min(CORNER_SAMPLE_SIZE, Math.floor(h / 2));
     for (let y = 0; y < sampleLimitY; y++) { for (let x = 0; x < sampleLimitX; x++) { const alphaIdx = (y * w + x) * 4 + 3; if (data[alphaIdx] > OPAQUE_THRESHOLD) { const rgbIdx = alphaIdx - 3; rSum += data[rgbIdx]; gSum += data[rgbIdx + 1]; bSum += data[rgbIdx + 2]; count++; } } }
     if (count === 0) return img; const frameColor = [Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count)];
     const isFramePixel = (x, y) => { if (x < 0 || x >= w || y < 0 || y >= h) return false; const i = (y * w + x) * 4; if (data[i + 3] < OPAQUE_THRESHOLD / 2) return false; return Math.abs(data[i]-frameColor[0])<=COLOR_TOLERANCE && Math.abs(data[i+1]-frameColor[1])<=COLOR_TOLERANCE && Math.abs(data[i+2]-frameColor[2])<=COLOR_TOLERANCE; };
     let top = 0; while (top < h / 2 && isFramePixel(Math.floor(w/2), top)) top++; let bottom = h-1; while (bottom >= h / 2 && isFramePixel(Math.floor(w/2), bottom)) bottom--; let left = 0; while (left < w / 2 && isFramePixel(left, Math.floor(h/2))) left++; let right = w-1; while (right >= w / 2 && isFramePixel(right, Math.floor(h/2))) right--;
     const frameTop=top, frameBottom=h-1-bottom, frameLeft=left, frameRight=w-1-right; const minFrame = Math.min(frameTop, frameBottom, frameLeft, frameRight); const maxFrame = Math.max(frameTop, frameBottom, frameLeft, frameRight);
     if (minFrame < MIN_FRAME_THICKNESS || maxFrame > minFrame * CONSISTENCY_MULTIPLIER + CONSISTENCY_FLAT) return img;
     const cropAmount = minFrame; const newWidth = w - cropAmount*2, newHeight = h - cropAmount*2; if (newWidth <= 0 || newHeight <= 0 || (newWidth === w && newHeight === h)) return img;
     const cropCanvas = document.createElement('canvas'); cropCanvas.width = newWidth; cropCanvas.height = newHeight; const cropCtx = cropCanvas.getContext('2d'); if (!cropCtx) { console.error("Could not get context for frame crop canvas"); return img; }
     cropCtx.drawImage(canvas, cropAmount, cropAmount, newWidth, newHeight, 0, 0, newWidth, newHeight);
     try { return await loadImage(cropCanvas.toDataURL()); } catch (err) { console.error("Failed to load frame-removed canvas data:", err); return img; }
}

function feCreateRoundedRectPath(ctx, x, y, w, h, r) { if(w<2*r)r=w/2;if(h<2*r)r=h/2;ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath(); }
function feDrawRoundedImage(ctx, img, dx, dy, dw, dh, r, sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight) { if (!img || img.naturalWidth === 0 || img.naturalHeight === 0 || sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) { console.warn("Flag Editor: DrawRoundedImage invalid image/dimensions"); return; } ctx.save(); feCreateRoundedRectPath(ctx, dx, dy, dw, dh, r); ctx.clip(); try { ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh); } catch (e) { console.error("Flag Editor: drawImage Error:", e); } ctx.restore(); }

async function processImageTransformation( currentPreprocessMode, currentFinalScaleMode, currentFinalWidth, currentFinalHeight, currentFrameThickness, currentFixedCornerRadius ) {
     if (!feState.originalUrl) { const errorMsg = `Flag Editor: Invalid state - missing originalUrl for processing.`; console.error(errorMsg); feState.processingState = 'error'; throw new Error(errorMsg); }
    let sourceImg = null; let intermediaryUrl = null; let transparencyCroppedUrl = null;
    try {
        sourceImg = await loadImage(feState.originalUrl);
        if (feState.transparencyCroppedUrl) { try { sourceImg = await loadImage(feState.transparencyCroppedUrl); transparencyCroppedUrl = feState.transparencyCroppedUrl; } catch (e) { console.warn(`FE: Cached transparencyCroppedUrl failed. Recalculating.`, e); feState.transparencyCroppedUrl = null; } }
        if (!feState.transparencyCroppedUrl) { const croppedTransparent = await cropTransparentArea(sourceImg); transparencyCroppedUrl = croppedTransparent.src; feState.transparencyCroppedUrl = transparencyCroppedUrl; if (transparencyCroppedUrl !== sourceImg.src) sourceImg = croppedTransparent; }
        intermediaryUrl = transparencyCroppedUrl;
        if (currentPreprocessMode === 'manual_crop' && feState.manualCropSourceUrl) { try { sourceImg = await loadImage(feState.manualCropSourceUrl); intermediaryUrl = feState.manualCropSourceUrl; } catch (err) { console.error(`FE: Failed to load manualCropSourceUrl. Error: ${err.message}. Falling back.`); sourceImg = await loadImage(intermediaryUrl); feState.manualCropSourceUrl = null; feState.manualCropData = null; } }
        if (currentPreprocessMode === 'old_flags') { const frameRemovedImg = await removeUniformFrame(sourceImg); if (frameRemovedImg.src !== sourceImg.src) { sourceImg = frameRemovedImg; intermediaryUrl = sourceImg.src; } }
        const finalCanvas = document.createElement('canvas'); finalCanvas.width = currentFinalWidth; finalCanvas.height = currentFinalHeight; const ctx = finalCanvas.getContext('2d'); if (!ctx) throw new Error("Could not get context for final flag canvas");
        const innerFlagWidth = currentFinalWidth - currentFrameThickness * 2; const innerFlagHeight = currentFinalHeight - currentFrameThickness * 2;
        if (innerFlagWidth <= 0 || innerFlagHeight <= 0) throw new Error(`Frame thickness (${currentFrameThickness}px) too large.`);
        ctx.fillStyle = "#000000"; feCreateRoundedRectPath(ctx, 0, 0, currentFinalWidth, currentFinalHeight, currentFixedCornerRadius); ctx.fill();
        const sourceWidth = sourceImg.naturalWidth; const sourceHeight = sourceImg.naturalHeight;
        if (sourceWidth <= 0 || sourceHeight <= 0) { console.warn(`FE: Final source image has zero dimensions.`); ctx.fillStyle = "rgba(255, 0, 0, 0.2)"; ctx.fillRect(currentFrameThickness, currentFrameThickness, innerFlagWidth, innerFlagHeight); }
        else if (currentFinalScaleMode === "crop") { let sx = 0, sy = 0, sw = sourceWidth, sh = sourceHeight; const targetInnerRatio = innerFlagWidth / innerFlagHeight; const sourceRatio = sourceWidth / sourceHeight; if (sourceRatio > targetInnerRatio) { sw = sourceHeight * targetInnerRatio; sx = (sourceWidth - sw) / 2; } else if (sourceRatio < targetInnerRatio) { sh = sourceWidth / targetInnerRatio; sy = (sourceHeight - sh) / 2; } if (sw <= 0 || sh <= 0) { sx = 0; sy = 0; sw = sourceWidth; sh = sourceHeight; console.warn(`FE: Invalid crop calc.`);} feDrawRoundedImage(ctx, sourceImg, currentFrameThickness, currentFrameThickness, innerFlagWidth, innerFlagHeight, currentFixedCornerRadius, sx, sy, sw, sh); }
        else { feDrawRoundedImage(ctx, sourceImg, currentFrameThickness, currentFrameThickness, innerFlagWidth, innerFlagHeight, currentFixedCornerRadius, 0, 0, sourceWidth, sourceHeight); }
        const finalTransformedUrl = finalCanvas.toDataURL("image/png");
        feState.transformedUrl = finalTransformedUrl; feState.intermediaryUrl = intermediaryUrl; feState.processingState = 'done'; feState.preprocessModeUsed = currentPreprocessMode;
        return { transformedUrl: finalTransformedUrl, intermediaryUrl: intermediaryUrl };
    } catch (error) { console.error(`Flag Editor: CRITICAL ERROR during processing pipeline - ${error.message}`, error); feState.processingState = 'error'; feState.transformedUrl = null; throw error; }
}