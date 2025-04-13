// --- START OF FILE js/domUtils.js ---
import * as cfg from './config.js';
// Import specific functions needed, including mapToCanvasCoords statically
import { redrawCanvas, mapToCanvasCoords, smoothPanTo } from './canvasUtils.js';
import { handleDeleteNation } from './nationUtils.js'; // Import only needed functions

// --- Helper ---
export function getCssVariable(varName, fallback = '#000') {
    try {
        const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        return value || fallback;
    } catch (e) {
        return fallback;
    }
}

// --- Dynamic HTML Population ---
export function populateDynamicElements() {
    // Ensure elements exist before setting innerHTML
    if (cfg.settingsPanel) {
        cfg.settingsPanel.innerHTML = `<h3>Settings</h3><div class="setting-item"><label for="markerSizeInput">Marker Screen Radius (<span id="markerSizeValue">8</span>px):</label><input type="range" id="markerSizeInput" min="3" max="20" value="8"></div><div class="setting-item"><label for="nationTextSizeInput">Text Screen Size (<span id="nationTextSizeValue">12</span>px):</label><input type="range" id="nationTextSizeInput" min="8" max="24" value="12"></div><div class="setting-item"><label for="flagSizeInput">Flag Screen Size (<span id="flagSizeValue">30</span>px):</label><input type="range" id="flagSizeInput" min="10" max="60" value="30"></div><div class="setting-item"><label for="darkModeToggle">Dark Mode:</label><label class="toggle-switch"><input type="checkbox" id="darkModeToggle"><span class="slider"></span></label></div><button id="closeSettingsButton">Close Settings</button>`;
    }
    if (cfg.controlsDiv) {
        cfg.controlsDiv.innerHTML = `<div class="control-group"><input type="file" id="mapImageInput" class="visually-hidden" accept="image/*"><label id="loadMapLabel" class="file-label-button">Load Map</label></div><div class="control-group"><input type="file" id="jsonLoadInput" class="visually-hidden" accept=".json,application/json"><label for="jsonLoadInput" id="jsonLoadLabel" class="file-label-button" data-disabled="true">Load JSON</label></div><div class="control-group"><button id="loadFlagsButton" disabled>Load Flags</button></div><div class="control-group"><button id="saveButton" disabled>Save ZIP</button></div><div id="zoomControls" class="control-group"><button id="zoomOutButton" title="Zoom Out (-)">-</button><span id="zoomDisplay">100%</span><button id="zoomInButton" title="Zoom In (+)">+</button><button id="zoomResetButton" title="Reset View (0)">Reset</button></div>`;
    }
    if (cfg.instructionsDiv) {
        cfg.instructionsDiv.innerHTML = `<h3>Instructions</h3><p><b>Loading:</b></p><ul><li><span class="highlight">Load Map:</span> Select base map image (<span class="highlight">it will be auto-colorized!</span>).</li><li><span class="highlight">Load JSON:</span> (Optional) Load existing nation data.</li><li><span class="highlight">Load Flags:</span> Load flag images (<span class="highlight">PNG or SVG</span>). You'll be prompted after loading JSON, or use the button. <span class="highlight">Select ALL relevant flag files</span> from their folder.</li><li><span class="highlight">Save ZIP:</span> Save project (map, json, flags) as ZIP. <span class="highlight">All flags are saved as SVG</span> (PNGs embedded).</li></ul><p><b>Map Interaction:</b></p><ul><li><b>Pan:</b> Click & Drag empty space.</li><li><b>Zoom:</b> Mouse Wheel or +/- keys.</li><li><b>Reset View:</b> '0' key or Reset button.</li></ul><p><b>Nations:</b></p><ul><li><b>Add:</b> Click empty space.</li><li><b>Select:</b> Click marker or list item (in Info Panel).</li><li><b>Move:</b> Click & Drag selected marker.</li><li><b>Edit:</b> Double-Click marker (popup).</li><li><b>Delete:</b> Select, then Delete/Backspace key OR '✖' in list (in Info Panel).</li><li><span class="highlight">Go To (List):</span> Double-click list item to <span class="highlight">smoothly pan</span> map.</li><li><b>Add/Change Flag:</b> Select nation, use 'Upload Flag' in Info Panel (<span class="highlight">PNG or SVG</span>).</li><li><b>Remove Flag:</b> Select nation, use '✖ Remove' in Info Panel.</li></ul><p><b>Other:</b></p><ul><li><b>Deselect:</b> Press Esc key.</li><li><b>Save:</b> Press 'S' key (saves ZIP).</li><li><b>Settings (⚙️):</b> Theme, sizes (marker, text, flag).</li></ul>`;
    }
}


// --- UI Update Functions ---
export function updateStatus(message, isError = false) {
    if (!cfg.statusDiv) return;
    cfg.statusDiv.textContent = message;
    cfg.statusDiv.classList.toggle('error', isError);
}

export function updateCoordinateDisplay(mapPos) {
    if (!cfg.coordinateDisplay) return;
    if (mapPos) {
        cfg.coordinateDisplay.textContent = `X: ${Math.round(mapPos.x)}, Y: ${Math.round(mapPos.y)}`;
    } else {
        cfg.coordinateDisplay.textContent = `X: ---, Y: ---`;
    }
}

export function updateZoomDisplay() {
    if (cfg.zoomDisplay) {
        cfg.zoomDisplay.textContent = `${Math.round(cfg.zoom * 100)}%`;
    }
}

export function updateNationList() {
    if (!cfg.nationListUl || !cfg.nationListCountSpan) return;
    cfg.nationListUl.innerHTML = '';
    const count = cfg.nations.length;
    cfg.nationListCountSpan.textContent = count;

    if (count === 0) {
        cfg.nationListUl.innerHTML = '<li>No nations added yet.</li>';
    } else {
        cfg.nations.forEach((nation, index) => {
            const li = document.createElement('li');
            li.dataset.index = index;
            if (index === cfg.selectedNationIndex) {
                li.classList.add('selected-list-item');
            }

            const infoSpan = document.createElement('span');
            infoSpan.className = 'nation-info';
            const coordX = (nation?.coordinates?.[0] !== undefined) ? Math.round(nation.coordinates[0]) : '?';
            const coordY = (nation?.coordinates?.[1] !== undefined) ? Math.round(nation.coordinates[1]) : '?';
            infoSpan.textContent = `${index + 1}. ${nation.name} (Str: ${nation.strength}, Coords: [${coordX}, ${coordY}])`;

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-nation';
            deleteBtn.textContent = '✖';
            deleteBtn.title = `Delete ${nation.name}`;
            deleteBtn.dataset.index = index;

            li.appendChild(infoSpan);
            li.appendChild(deleteBtn);
            cfg.nationListUl.appendChild(li);

            // Add event listeners directly here
            li.addEventListener('mouseenter', () => {
                cfg.setHoveredListIndex(index);
                if (!cfg.isPanningAnimationActive) redrawCanvas();
            });
            li.addEventListener('mouseleave', () => {
                if (cfg.hoveredListIndex === index) {
                    cfg.setHoveredListIndex(null);
                    if (!cfg.isPanningAnimationActive) redrawCanvas();
                }
            });
            li.addEventListener('click', (event) => {
                 if (event.target === deleteBtn || cfg.isPanningAnimationActive) return;
                 cfg.setSelectedNationIndex(index);
                 closeInlineEditor(); // Defined below
                 updateNationList(); // Recursive call - careful, but works here
                 redrawCanvas();
                 updateInfoPanel(index); // Defined below
            });
            deleteBtn.addEventListener('click', handleDeleteNation); // Assumes handleDeleteNation is imported

            li.addEventListener('dblclick', (event) => {
                if (event.target === deleteBtn || cfg.isPanningAnimationActive) return;
                 const targetIndex = parseInt(li.dataset.index, 10);
                 if (isNaN(targetIndex) || targetIndex < 0 || targetIndex >= cfg.nations.length || !cfg.nations[targetIndex]?.coordinates) return;

                 const targetNation = cfg.nations[targetIndex];
                 const [targetMapX, targetMapY] = targetNation.coordinates;

                 cfg.setSelectedNationIndex(targetIndex);
                 closeInlineEditor();
                 updateInfoPanel(targetIndex);
                 updateNationList(); // Recursive call
                 updateStatus(`Navigating to ${targetNation.name}...`);
                 smoothPanTo(targetMapX, targetMapY); // Assumes smoothPanTo is imported
            });
        });
    }
}


export function updateInfoPanel(nationIndex) {
    if (!cfg.infoNameSpan || !cfg.infoStrengthSpan || !cfg.infoPlaceholder || !cfg.infoFlagPreview || !cfg.infoFlagStatus || !cfg.infoFlagUploadLabel || !cfg.infoFlagUploadInput || !cfg.infoFlagRemoveButton) {
        // console.error("Info panel elements not ready for updateInfoPanel");
        return; // Silently return if elements aren't ready (e.g., during init)
    }
    const noNationSelected = nationIndex === null || nationIndex < 0 || nationIndex >= cfg.nations.length;

    cfg.infoFlagPreview.style.display = 'none';
    cfg.infoFlagPreview.removeAttribute('src');
    cfg.infoFlagStatus.style.display = 'none';
    cfg.infoFlagStatus.textContent = '';
    cfg.infoFlagUploadLabel.setAttribute('data-disabled', 'true');
    cfg.infoFlagUploadInput.disabled = true;
    cfg.infoFlagRemoveButton.disabled = true;

    if (noNationSelected) {
        cfg.infoNameSpan.textContent = '--';
        cfg.infoStrengthSpan.textContent = '--';
        cfg.infoPlaceholder.style.display = 'block';
    } else {
        const nation = cfg.nations[nationIndex];
        if (nation) {
            cfg.infoNameSpan.textContent = nation.name;
            cfg.infoStrengthSpan.textContent = nation.strength;
            cfg.infoPlaceholder.style.display = 'none';

            // Enable flag controls only if a nation is selected
            cfg.infoFlagUploadLabel.removeAttribute('data-disabled');
            cfg.infoFlagUploadInput.disabled = false;

            if (nation.flagImage && nation.flagImage.src) {
                cfg.infoFlagPreview.src = nation.flagImage.src;
                cfg.infoFlagPreview.style.display = 'block';
                cfg.infoFlagRemoveButton.disabled = false;
                let flagFileName = nation.flag ? `${nation.flag}.${nation.flagDataType || '?'}` : 'Unknown Flag File';
                let statusText = `Flag: ${flagFileName}`;
                if (nation.flagDataType === 'png') {
                    statusText += ' (will save as .svg)';
                }
                cfg.infoFlagStatus.textContent = statusText;
                cfg.infoFlagStatus.style.display = 'block';
            } else if (nation.flag) {
                // Flag specified in JSON but image not loaded yet
                let flagFileName = `${nation.flag}.svg`; // Assume svg for display if only name known
                cfg.infoFlagStatus.textContent = `Flag: ${flagFileName} (Needs upload/load)`;
                cfg.infoFlagStatus.style.display = 'block';
                cfg.infoFlagRemoveButton.disabled = false; // Allow removal even if not loaded
            }
            // else: no flag info at all, controls remain as initially set

        } else {
            // Should not happen if index is valid, but handle defensively
            cfg.infoNameSpan.textContent = 'Error';
            cfg.infoStrengthSpan.textContent = '?';
            cfg.infoPlaceholder.style.display = 'block';
        }
    }
}


// --- Inline Editor ---
// FIXED: Removed async and dynamic import, using static import for mapToCanvasCoords
export function openInlineEditor(index, mapX, mapY) {
    // mapToCanvasCoords is now imported statically at the top

    if (!cfg.inlineEditPanel || index < 0 || index >= cfg.nations.length) return;
    const nation = cfg.nations[index];
    if (!nation) return;

    cfg.setNationIndexBeingEdited(index);
    cfg.inlineEditName.value = nation.name;
    cfg.inlineEditStrength.value = nation.strength;

    // Use the statically imported function
    const canvasPos = mapToCanvasCoords(mapX, mapY);
    if (!canvasPos) return; // Handle case where conversion might fail

    const panelWidth = cfg.inlineEditPanel.offsetWidth || 220;
    const panelHeight = cfg.inlineEditPanel.offsetHeight || 130;
    const canvasRect = cfg.canvas?.getBoundingClientRect(); // Use optional chaining

    if (!canvasRect) return; // Cannot position if canvas rect is unavailable

    let panelX = canvasPos.x + (cfg.markerRadius + 15); // Use cfg.markerRadius
    let panelY = canvasPos.y + 5;

    // Adjust panel position if it goes off-screen
    if (cfg.canvasContainer) {
        if (panelX + panelWidth > cfg.canvasContainer.clientWidth - 10) {
            panelX = canvasPos.x - panelWidth - (cfg.markerRadius + 15);
        }
        if (panelY + panelHeight > cfg.canvasContainer.clientHeight - 10) {
            panelY = canvasPos.y - panelHeight - 5;
        }
    }
    panelX = Math.max(5, panelX);
    panelY = Math.max(5, panelY);

    cfg.inlineEditPanel.style.left = `${panelX}px`;
    cfg.inlineEditPanel.style.top = `${panelY}px`;
    cfg.inlineEditPanel.style.display = 'block';
    if (cfg.inlineEditName) {
        cfg.inlineEditName.focus();
        cfg.inlineEditName.select();
    }
    updateStatus(`Editing ${nation.name}... (Enter to Save, Esc to Cancel)`);
}

export function closeInlineEditor() {
    if (!cfg.inlineEditPanel) return;
    cfg.inlineEditPanel.style.display = 'none';
    cfg.setNationIndexBeingEdited(null);
    // Maybe call updateStatus("Editing cancelled.") or similar? Optional.
}

// --- Settings ---
export function applySettings() {
    if (!cfg.markerSizeInput || !cfg.nationTextSizeInput || !cfg.flagSizeInput || !cfg.darkModeToggle) return;

    // Update config values from inputs
    cfg.markerRadius = parseInt(cfg.markerSizeInput.value, 10);
    cfg.nationTextSize = parseInt(cfg.nationTextSizeInput.value, 10);
    cfg.flagBaseDisplaySize = parseInt(cfg.flagSizeInput.value, 10);

    // Update UI display values
    if (cfg.markerSizeValue) cfg.markerSizeValue.textContent = cfg.markerRadius;
    if (cfg.nationTextSizeValue) cfg.nationTextSizeValue.textContent = cfg.nationTextSize;
    if (cfg.flagSizeValue) cfg.flagSizeValue.textContent = cfg.flagBaseDisplaySize;

    // Apply dark mode class
    document.body.classList.toggle('dark-mode', cfg.darkModeToggle.checked);

    // Redraw canvas to reflect changes
    redrawCanvas(); // Assumes redrawCanvas is imported correctly
}

export function saveSettings() {
    if (!cfg.darkModeToggle || !cfg.markerSizeInput || !cfg.nationTextSizeInput || !cfg.flagSizeInput) return;
    try {
        localStorage.setItem('mapEditor_markerRadius', cfg.markerRadius.toString());
        localStorage.setItem('mapEditor_darkMode', cfg.darkModeToggle.checked.toString());
        localStorage.setItem('mapEditor_nationTextSize', cfg.nationTextSize.toString());
        localStorage.setItem('mapEditor_flagBaseDisplaySize', cfg.flagBaseDisplaySize.toString());
    } catch (e) {
        console.warn("Could not save settings to localStorage:", e);
    }
}

export function loadSettings() {
    if (!cfg.markerSizeInput || !cfg.darkModeToggle || !cfg.nationTextSizeInput || !cfg.flagSizeInput) return;
    try {
        const savedRadius = localStorage.getItem('mapEditor_markerRadius');
        if (savedRadius !== null) {
            const radius = parseInt(savedRadius, 10);
            if (!isNaN(radius) && radius >= parseInt(cfg.markerSizeInput.min, 10) && radius <= parseInt(cfg.markerSizeInput.max, 10)) {
                cfg.markerRadius = radius;
                cfg.markerSizeInput.value = String(cfg.markerRadius); // Set input value as string
            }
        }

        const savedDarkMode = localStorage.getItem('mapEditor_darkMode');
        if (savedDarkMode !== null) {
            cfg.darkModeToggle.checked = (savedDarkMode === 'true');
        }

        const savedTextSize = localStorage.getItem('mapEditor_nationTextSize');
        if (savedTextSize !== null) {
             const size = parseInt(savedTextSize, 10);
             if (!isNaN(size) && size >= parseInt(cfg.nationTextSizeInput.min, 10) && size <= parseInt(cfg.nationTextSizeInput.max, 10)) {
                 cfg.nationTextSize = size;
                 cfg.nationTextSizeInput.value = String(cfg.nationTextSize); // Set input value as string
             }
        }

        const savedFlagSize = localStorage.getItem('mapEditor_flagBaseDisplaySize');
         if (savedFlagSize !== null) {
             const size = parseInt(savedFlagSize, 10);
             if (!isNaN(size) && size >= parseInt(cfg.flagSizeInput.min, 10) && size <= parseInt(cfg.flagSizeInput.max, 10)) {
                 cfg.flagBaseDisplaySize = size;
                 cfg.flagSizeInput.value = String(cfg.flagBaseDisplaySize); // Set input value as string
             }
         }

    } catch (e) {
        console.warn("Could not load settings from localStorage:", e);
    } finally {
        applySettings(); // Apply loaded (or default) settings and redraw
    }
}


// --- Modals ---
export function hideModal() {
    if (cfg.modalOverlay) cfg.modalOverlay.style.display = 'none';
    // Clear handlers to prevent memory leaks and incorrect behavior
    if(cfg.modalOk) cfg.modalOk.onclick = null;
    if(cfg.modalCancel) cfg.modalCancel.onclick = null;
    if(cfg.modalConfirm) cfg.modalConfirm.onclick = null;
    if(cfg.modalDeny) cfg.modalDeny.onclick = null;
    if(cfg.modalInput) cfg.modalInput.onkeydown = null;
    if(cfg.modalDialog) cfg.modalDialog.onkeydown = null; // Clear dialog keydown too

    // Check if a promise is waiting and resolve it (usually done by button handlers)
    // if (cfg.currentModalResolve) {
    //     cfg.currentModalResolve(null); // Resolve with null if hidden externally
    // }
    cfg.setCurrentModalResolve(null); // Always clear the resolve function reference
}

export function showModal(type, title, message, options = {}) {
    return new Promise((resolve) => {
        if (!cfg.modalOverlay || !cfg.modalDialog || !cfg.modalTitle || !cfg.modalMessage || !cfg.modalInputContainer || !cfg.modalInput || !cfg.modalOk || !cfg.modalCancel || !cfg.modalConfirm || !cfg.modalDeny ) {
             console.error("Modal elements not found. Cannot show modal.");
             return resolve(null); // Indicate failure
        }
        if (cfg.currentModalResolve) {
            console.warn("Modal system busy. Cannot show new modal.");
            return resolve(null); // Indicate busy state
        }
        cfg.setCurrentModalResolve(resolve);

        cfg.modalTitle.textContent = title;
        cfg.modalMessage.textContent = message;

        cfg.modalInputContainer.style.display = 'none'; // Reset input display
        cfg.modalInput.value = ''; // Reset input value
        cfg.modalInput.type = options.inputType || 'text';
        cfg.modalInput.placeholder = options.placeholder || '';

        // Hide all buttons initially
        cfg.modalOk.style.display = 'none';
        cfg.modalCancel.style.display = 'none';
        cfg.modalConfirm.style.display = 'none';
        cfg.modalDeny.style.display = 'none';

        // Configure buttons based on type
        switch (type) {
            case 'alert':
                cfg.modalOk.textContent = options.okText || 'OK';
                cfg.modalOk.style.display = 'inline-block';
                // Use function expressions for handlers to ensure 'this' context isn't an issue
                // and to easily remove later
                cfg.modalOk.onclick = () => { hideModal(); resolve(true); };
                cfg.modalDialog.onkeydown = (e) => { if (e.key === 'Enter') cfg.modalOk.click(); }; // Handle Enter key
                cfg.modalOk.focus();
                break;
            case 'confirm':
                cfg.modalConfirm.textContent = options.confirmText || 'Yes';
                cfg.modalDeny.textContent = options.denyText || 'No';
                cfg.modalConfirm.style.display = 'inline-block';
                cfg.modalDeny.style.display = 'inline-block';
                cfg.modalConfirm.onclick = () => { hideModal(); resolve(true); };
                cfg.modalDeny.onclick = () => { hideModal(); resolve(false); };
                cfg.modalDialog.onkeydown = null; // Clear dialog keydown for confirm/deny
                cfg.modalConfirm.focus();
                break;
            case 'prompt':
                cfg.modalInputContainer.style.display = 'block';
                cfg.modalInput.value = options.defaultValue || '';
                cfg.modalOk.textContent = options.okText || 'OK';
                cfg.modalCancel.textContent = options.cancelText || 'Cancel';
                cfg.modalOk.style.display = 'inline-block';
                cfg.modalCancel.style.display = 'inline-block';
                cfg.modalOk.onclick = () => { hideModal(); resolve(cfg.modalInput.value); };
                cfg.modalCancel.onclick = () => { hideModal(); resolve(null); };
                // Handle Enter key specifically on the input for prompt
                cfg.modalInput.onkeydown = (e) => { if (e.key === 'Enter') cfg.modalOk.click(); };
                 cfg.modalDialog.onkeydown = null; // Clear dialog keydown
                cfg.modalInput.focus();
                cfg.modalInput.select();
                break;
            default:
                 console.error(`Unknown modal type: ${type}`);
                 hideModal(); // Hide if type is wrong
                 resolve(null); // Indicate error by resolving null
                 return; // Exit promise executor
        }

        cfg.modalOverlay.style.display = 'flex';
    });
}

// --- Cursor ---
export function updateCursor() {
    if (!cfg.canvas) return;
    let cursorStyle = 'crosshair'; // Default cursor

    if (cfg.isPanningAnimationActive) {
        cursorStyle = 'default';
    } else if (cfg.isPanning) {
        cursorStyle = 'grabbing';
    } else if (cfg.draggingNation) {
        cursorStyle = 'grabbing';
    } else if (cfg.hoveredNationIndex !== null) {
        cursorStyle = 'pointer'; // Pointer when hovering over a nation marker
    } else if (cfg.potentialPan) {
        cursorStyle = 'grab'; // Grab hand when potential pan starts
    }
    // else: remains 'crosshair' for adding nations

    // Only update if the style needs to change
    if (cfg.canvas.style.cursor !== cursorStyle) {
        cfg.canvas.style.cursor = cursorStyle;
    }
}


// --- END OF FILE js/domUtils.js ---