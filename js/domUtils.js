import * as cfg from './config.js';
// Import specific functions needed, including mapToCanvasCoords statically
import { redrawCanvas, mapToCanvasCoords, smoothPanTo } from './canvasUtils.js';
// Import only needed functions
import { handleDeleteNation } from './nationUtils.js';
// NEW: Import flagEditor functions (assuming it exports necessary functions)
import * as flagEditor from './flagEditor.js'; // Import if needed here, e.g., for showing/hiding modal

// --- Helper ---
/** Safely gets a CSS variable value with a fallback */
export function getCssVariable(varName, fallback = '#000') {
    try {
        // Ensure document.documentElement exists and has getComputedStyle
        if (document.documentElement && typeof getComputedStyle === 'function') {
            const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
            return value || fallback;
        }
        return fallback; // Cannot get style
    } catch (e) {
        console.warn(`Error getting CSS variable ${varName}:`, e);
        return fallback;
    }
}

// --- Dynamic HTML Population ---
// Uses template literals for cleaner multiline HTML
export function populateDynamicElements() {
    // Settings Panel HTML
    if (cfg.settingsPanel) {
        cfg.settingsPanel.innerHTML = `
            <h3>Settings</h3>
            <div class="setting-item">
                <label for="markerSizeInput">Marker Screen Radius (<span id="markerSizeValue">8</span>px):</label>
                <input type="range" id="markerSizeInput" min="3" max="20" value="8">
            </div>
            <div class="setting-item">
                <label for="nationTextSizeInput">Text Screen Size (<span id="nationTextSizeValue">12</span>px):</label>
                <input type="range" id="nationTextSizeInput" min="8" max="24" value="12">
            </div>
             <div class="setting-item">
                <label for="flagSizeInput">Flag Screen Size (<span id="flagSizeValue">30</span>px):</label>
                <input type="range" id="flagSizeInput" min="10" max="60" value="30">
            </div>
            <div class="setting-item">
                <label for="darkModeToggle">Dark Mode:</label>
                <label class="toggle-switch">
                    <input type="checkbox" id="darkModeToggle">
                    <span class="slider"></span>
                </label>
            </div>
            <button id="closeSettingsButton">Close Settings</button>
        `;
    } else {
        console.error("Cannot populate settings panel: #settingsPanel not found.");
    }

    // Controls Bar HTML
    if (cfg.controlsDiv) {
        // *** MODIFIED: Grouped buttons for better flex alignment ***
        cfg.controlsDiv.innerHTML = `
            <div class="control-group-left"> <!-- Group for left-aligned buttons -->
                <div class="control-group">
                    <input type="file" id="mapImageInput" class="visually-hidden" accept="image/*">
                    <label for="mapImageInput" id="loadMapLabel" class="file-label-button">Load Map</label>
                </div>
                <div class="control-group">
                    <input type="file" id="jsonLoadInput" class="visually-hidden" accept=".json,application/json">
                    <label for="jsonLoadInput" id="jsonLoadLabel" class="file-label-button" data-disabled="true">Load JSON</label>
                </div>
                <div class="control-group">
                    <button id="loadFlagsButton" disabled>Load Flags</button>
                </div>
            </div>

            <div class="control-group-right"> <!-- Group for right-aligned (or center) buttons -->
                 <div class="control-group">
                    <button id="saveButton" disabled>Save ZIP</button>
                 </div>
            </div>
        `;
        // *** END MODIFICATIONS ***
    } else {
         console.error("Cannot populate controls: #controls not found.");
    }

    // Instructions Panel HTML
    if (cfg.instructionsDiv) {
        cfg.instructionsDiv.innerHTML = `
            <h3>Instructions</h3>
            <p><b>Loading:</b></p>
            <ul>
                <li><span class="highlight">Load Map:</span> Select base map image (<span class="highlight">will be auto-colorized!</span>).</li>
                <li><span class="highlight">Load JSON:</span> (Optional) Load existing nation data.</li>
                <li><span class="highlight">Load Flags:</span> Load flag images (<span class="highlight">PNG or SVG</span>). Match filename (before extension) to nation's 'flag' property in JSON, or generated name (e.g., 'my_nation'). <span class="highlight">Select ALL relevant flag files</span>. Flags are auto-standardized on load.</li>
                <li><span class="highlight">Save ZIP:</span> Save project (map, json, flags) as ZIP. <span class="highlight">All flags are saved as SVG files containing the standardized PNG appearance</span>.</li>
            </ul>
            <p><b>Map Interaction:</b></p>
            <ul>
                <li><b>Pan:</b> Click & Drag empty space.</li>
                <li><b>Zoom:</b> Mouse Wheel or +/- keys (controls now above Nation Info).</li>
                <li><b>Reset View:</b> '0' key or Reset button (controls now above Nation Info).</li>
            </ul>
            <p><b>Nations:</b></p>
            <ul>
                <li><b>Add:</b> Click empty space.</li>
                <li><b>Select:</b> Click marker or list item.</li>
                <li><b>Move:</b> Click & Drag selected marker.</li>
                <li><b>Edit:</b> Double-Click marker (popup).</li>
                <li><b>Delete:</b> Select, then Delete/Backspace key OR '✖' in list.</li>
                <li><span class="highlight">Go To (List):</span> Double-click list item to <span class="highlight">smoothly pan</span> map.</li>
                <li><b>Add/Change Flag:</b> Select nation, use 'Upload Flag' in Info Panel (<span class="highlight">PNG or SVG</span>).</li>
                <li><span class="highlight">Edit Flag Appearance:</span> Select nation with flag, use 'Flag Editor' button to refine standardization.</li>
                <li><b>Remove Flag:</b> Select nation, use '✖ Remove' in Info Panel.</li>
            </ul>
            <p><b>Other:</b></p>
            <ul>
                <li><b>Deselect:</b> Press Esc key.</li>
                <li><b>Save:</b> Press 'S' key (saves ZIP).</li>
                <li><b>Settings (⚙️):</b> Theme, sizes (marker, text, flag). Starts closed.</li>
            </ul>
        `;
    } else {
         console.error("Cannot populate instructions: #instructions not found.");
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
    // Now targets the span in its new location
    const zoomDisplaySpan = document.getElementById('zoomDisplay');
    if (zoomDisplaySpan) {
        zoomDisplaySpan.textContent = `${Math.round(cfg.zoom * 100)}%`;
    }
}

export function updateNationList() {
    if (!cfg.nationListUl || !cfg.nationListCountSpan) return;

    // Clear existing list items
    cfg.nationListUl.innerHTML = '';
    const count = cfg.nations.length;
    cfg.nationListCountSpan.textContent = count;

    if (count === 0) {
        const li = document.createElement('li');
        li.textContent = 'No nations added yet.';
        li.style.fontStyle = 'italic'; // Style the placeholder text
        li.style.opacity = '0.7';
        cfg.nationListUl.appendChild(li);
    } else {
        cfg.nations.forEach((nation, index) => {
            const li = document.createElement('li');
            li.dataset.index = index; // Store the original index
            if (index === cfg.selectedNationIndex) {
                li.classList.add('selected-list-item');
            }

            // Create elements for info and button
            const infoSpan = document.createElement('span');
            infoSpan.className = 'nation-info';
            // Ensure coordinates exist before trying to access them
            const coordX = (nation?.coordinates?.[0] !== undefined) ? Math.round(nation.coordinates[0]) : '?';
            const coordY = (nation?.coordinates?.[1] !== undefined) ? Math.round(nation.coordinates[1]) : '?';
            infoSpan.textContent = `${index + 1}. ${nation.name} (Str: ${nation.strength}, Coords: [${coordX}, ${coordY}])`;
            infoSpan.title = infoSpan.textContent; // Add title for overflow

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-nation';
            deleteBtn.textContent = '✖';
            deleteBtn.title = `Delete ${nation.name}`;
            deleteBtn.dataset.index = index; // Store index on button too for click handler

            li.appendChild(infoSpan);
            li.appendChild(deleteBtn);
            cfg.nationListUl.appendChild(li);

            // --- Add event listeners directly to this list item ---
            li.addEventListener('mouseenter', () => {
                // Check if the index is still valid (nation might have been deleted)
                if (parseInt(li.dataset.index, 10) < cfg.nations.length) {
                    cfg.setHoveredListIndex(index);
                    // Only redraw if not currently animating (prevents jitter)
                    if (!cfg.isPanningAnimationActive) redrawCanvas();
                }
            });
            li.addEventListener('mouseleave', () => {
                // Check if this was the index being hovered before clearing
                if (cfg.hoveredListIndex === index) {
                    cfg.setHoveredListIndex(null);
                    if (!cfg.isPanningAnimationActive) redrawCanvas();
                }
            });

            // Single click listener on the LI (excluding the button)
            li.addEventListener('click', (event) => {
                 // Ignore clicks on the delete button itself or during animation
                 if (event.target === deleteBtn || cfg.isPanningAnimationActive) return;

                 // Check if the index is still valid
                 const targetIndex = parseInt(li.dataset.index, 10);
                 if (isNaN(targetIndex) || targetIndex < 0 || targetIndex >= cfg.nations.length) return;

                 cfg.setSelectedNationIndex(targetIndex);
                 closeInlineEditor(); // Close editor if open
                 updateNationList(); // Update list to show new selection
                 redrawCanvas(); // Update canvas selection highlight
                 updateInfoPanel(targetIndex); // Update info panel
            });

            // Delete button listener
            deleteBtn.addEventListener('click', handleDeleteNation); // Pass the event object

            // Double click listener on the LI (excluding the button) for panning
            li.addEventListener('dblclick', (event) => {
                if (event.target === deleteBtn || cfg.isPanningAnimationActive) return;

                const targetIndex = parseInt(li.dataset.index, 10);
                if (isNaN(targetIndex) || targetIndex < 0 || targetIndex >= cfg.nations.length || !cfg.nations[targetIndex]?.coordinates) return;

                const targetNation = cfg.nations[targetIndex];
                const [targetMapX, targetMapY] = targetNation.coordinates;

                // Select the nation on double click as well
                cfg.setSelectedNationIndex(targetIndex);
                closeInlineEditor();
                updateInfoPanel(targetIndex);
                updateNationList(); // Update list selection
                updateStatus(`Navigating to ${targetNation.name}...`);
                smoothPanTo(targetMapX, targetMapY); // Initiate smooth pan
            });
        });
    }
}


export function updateInfoPanel(nationIndex) {
    const requiredElements = [
        cfg.infoNameSpan, cfg.infoStrengthSpan, cfg.infoPlaceholder,
        cfg.infoFlagPreview, cfg.infoFlagStatus, cfg.infoFlagUploadLabel,
        cfg.infoFlagUploadInput, cfg.infoFlagRemoveButton,
        cfg.editFlagButton
    ];
    if (requiredElements.some(el => !el)) { return; }

    const noNationSelected = nationIndex === null || nationIndex < 0 || nationIndex >= cfg.nations.length;

    // Reset Flag UI State
    cfg.infoFlagPreview.style.display = 'none';
    cfg.infoFlagPreview.removeAttribute('src');
    cfg.infoFlagPreview.alt = 'Nation Flag Preview';
    cfg.infoFlagStatus.style.display = 'none';
    cfg.infoFlagStatus.textContent = '';
    cfg.infoFlagUploadLabel.setAttribute('data-disabled', 'true');
    cfg.infoFlagUploadInput.disabled = true;
    cfg.infoFlagRemoveButton.disabled = true;
    cfg.editFlagButton.disabled = true;


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

            // Enable flag upload controls
            cfg.infoFlagUploadLabel.removeAttribute('data-disabled');
            cfg.infoFlagUploadInput.disabled = false;

            // Update Flag Section
            let flagStatusText = '';
            // Check if flagImage exists and is loaded (this is the standardized one now)
            let hasDisplayableFlag = nation.flagImage && nation.flagImage.complete && nation.flagImage.naturalWidth > 0;
            // Check if *original* data exists (needed for editing)
            let hasOriginalData = nation.flagData && nation.flagDataType;

            if (hasDisplayableFlag) {
                cfg.infoFlagPreview.src = nation.flagImage.src;
                cfg.infoFlagPreview.alt = `${nation.name} Standardized Flag Preview`;
                cfg.infoFlagPreview.style.display = 'block';
                cfg.infoFlagRemoveButton.disabled = false; // Can remove if a flag exists
                cfg.editFlagButton.disabled = !hasOriginalData; // Enable editor ONLY if original data exists

                const originalFileName = nation.flag ? `${nation.flag}.${nation.flagDataType || '?'}` : 'Unknown Original File';
                flagStatusText = `Loaded: ${originalFileName} (Standardized)`;

            } else if (nation.flag && hasOriginalData) {
                 // Original data exists, but standardized image failed to load/process
                 flagStatusText = `Original: ${nation.flag}.${nation.flagDataType}. Display error.`;
                 cfg.infoFlagRemoveButton.disabled = false;
                 cfg.editFlagButton.disabled = false; // Can still try to edit from original data
                 cfg.infoFlagPreview.style.display = 'none'; // Hide broken preview
             } else if (nation.flag) {
                 // Only flag name specified (e.g. from JSON), but no data/image loaded yet
                const assumedExt = nation.flag.toLowerCase().endsWith('.svg') ? 'svg' : (nation.flag.toLowerCase().endsWith('.png') ? 'png' : '...');
                flagStatusText = `Flag specified: ${nation.flag}.${assumedExt} (Needs image load/upload)`;
                cfg.infoFlagRemoveButton.disabled = false; // Allow removing the reference
                cfg.editFlagButton.disabled = true; // Cannot edit without data
            }

            if (flagStatusText) {
                 cfg.infoFlagStatus.textContent = flagStatusText;
                 cfg.infoFlagStatus.style.display = 'block';
            }
        } else {
            console.error(`Could not find nation data for valid index: ${nationIndex}`);
            cfg.infoNameSpan.textContent = 'Error';
            cfg.infoStrengthSpan.textContent = '?';
            cfg.infoPlaceholder.style.display = 'block';
        }
    }
}


// --- Inline Editor ---
export function openInlineEditor(index, mapX, mapY) {
    if (!cfg.inlineEditPanel || !cfg.inlineEditName || !cfg.inlineEditStrength || index < 0 || index >= cfg.nations.length) return;
    const nation = cfg.nations[index];
    if (!nation) return;

    cfg.setNationIndexBeingEdited(index);
    cfg.inlineEditName.value = nation.name;
    cfg.inlineEditStrength.value = nation.strength;

    const canvasPos = mapToCanvasCoords(mapX, mapY);
    if (!canvasPos || !cfg.canvasContainer || !cfg.canvas) return;

    const panelWidth = cfg.inlineEditPanel.offsetWidth || 220;
    const panelHeight = cfg.inlineEditPanel.offsetHeight || 130;
    const containerWidth = cfg.canvasContainer.clientWidth;
    const containerHeight = cfg.canvasContainer.clientHeight;
    const markerScreenRadius = cfg.markerRadius();
    const panelMargin = 15;

    let panelX = canvasPos.x + markerScreenRadius + panelMargin;
    let panelY = canvasPos.y + 5;
    if (panelX + panelWidth > containerWidth - 10) { panelX = canvasPos.x - panelWidth - markerScreenRadius - panelMargin; }
    if (panelY + panelHeight > containerHeight - 10) { panelY = canvasPos.y - panelHeight - 5; }
    panelX = Math.max(5, panelX); panelY = Math.max(5, panelY);

    cfg.inlineEditPanel.style.left = `${panelX}px`;
    cfg.inlineEditPanel.style.top = `${panelY}px`;
    cfg.inlineEditPanel.style.display = 'block';

    cfg.inlineEditName.focus();
    cfg.inlineEditName.select();

    updateStatus(`Editing ${nation.name}... (Enter to Save, Esc to Cancel)`);
}

export function closeInlineEditor() {
    if (!cfg.inlineEditPanel) return;
    cfg.inlineEditPanel.style.display = 'none';
    cfg.setNationIndexBeingEdited(null);
}

// --- Settings ---
export function applySettings() {
    if (!cfg.markerSizeInput || !cfg.nationTextSizeInput || !cfg.flagSizeInput || !cfg.darkModeToggle || !cfg.markerSizeValue || !cfg.nationTextSizeValue || !cfg.flagSizeValue) {
         console.warn("Cannot apply settings: One or more settings elements not found."); return;
    }
    const newMarkerRadius = parseInt(cfg.markerSizeInput.value, 10);
    const newNationTextSize = parseInt(cfg.nationTextSizeInput.value, 10);
    const newFlagSize = parseInt(cfg.flagSizeInput.value, 10);
    cfg.setMarkerRadius(newMarkerRadius); cfg.setNationTextSize(newNationTextSize); cfg.setFlagBaseDisplaySize(newFlagSize);
    cfg.markerSizeValue.textContent = newMarkerRadius; cfg.nationTextSizeValue.textContent = newNationTextSize; cfg.flagSizeValue.textContent = newFlagSize;
    document.body.classList.toggle('dark-mode', cfg.darkModeToggle.checked);
    redrawCanvas();
}

export function saveSettings() {
    if (!cfg.darkModeToggle || !cfg.markerSizeInput || !cfg.nationTextSizeInput || !cfg.flagSizeInput) {
         console.warn("Cannot save settings: One or more settings elements not found."); return;
    }
    try {
        localStorage.setItem('mapEditor_markerRadius', cfg.markerRadius().toString());
        localStorage.setItem('mapEditor_nationTextSize', cfg.nationTextSize().toString());
        localStorage.setItem('mapEditor_flagBaseDisplaySize', cfg.flagBaseDisplaySize().toString());
        localStorage.setItem('mapEditor_darkMode', cfg.darkModeToggle.checked.toString());
    } catch (e) { console.warn("Could not save settings to localStorage:", e); }
}

export function loadSettings() {
    if (!cfg.markerSizeInput || !cfg.darkModeToggle || !cfg.nationTextSizeInput || !cfg.flagSizeInput) {
        console.warn("Cannot load settings: One or more settings elements not found."); applySettings(); return;
    }
    try {
        const savedRadius = localStorage.getItem('mapEditor_markerRadius');
        if (savedRadius !== null) { const radius = parseInt(savedRadius, 10); if (!isNaN(radius) && cfg.markerSizeInput && radius >= parseInt(cfg.markerSizeInput.min, 10) && radius <= parseInt(cfg.markerSizeInput.max, 10)) { cfg.setMarkerRadius(radius); cfg.markerSizeInput.value = String(radius); } }
        const savedTextSize = localStorage.getItem('mapEditor_nationTextSize');
        if (savedTextSize !== null) { const size = parseInt(savedTextSize, 10); if (!isNaN(size) && cfg.nationTextSizeInput && size >= parseInt(cfg.nationTextSizeInput.min, 10) && size <= parseInt(cfg.nationTextSizeInput.max, 10)) { cfg.setNationTextSize(size); cfg.nationTextSizeInput.value = String(size); } }
        const savedFlagSize = localStorage.getItem('mapEditor_flagBaseDisplaySize');
         if (savedFlagSize !== null) { const size = parseInt(savedFlagSize, 10); if (!isNaN(size) && cfg.flagSizeInput && size >= parseInt(cfg.flagSizeInput.min, 10) && size <= parseInt(cfg.flagSizeInput.max, 10)) { cfg.setFlagBaseDisplaySize(size); cfg.flagSizeInput.value = String(size); } }
        const savedDarkMode = localStorage.getItem('mapEditor_darkMode');
        if (savedDarkMode !== null) { if (cfg.darkModeToggle) cfg.darkModeToggle.checked = (savedDarkMode === 'true'); }
    } catch (e) { console.warn("Could not load settings from localStorage:", e);
    } finally { applySettings(); }
}


// --- Modals ---
export function hideModal() {
    if (!cfg.modalOverlay) return;
    cfg.modalOverlay.style.display = 'none';
    const buttons = [cfg.modalOk, cfg.modalCancel, cfg.modalConfirm, cfg.modalDeny];
    buttons.forEach(btn => { if(btn) btn.onclick = null; });
    if(cfg.modalInput) cfg.modalInput.onkeydown = null;
    if(cfg.modalDialog) cfg.modalDialog.onkeydown = null;
    const resolveFunc = cfg.currentModalResolve;
    cfg.setCurrentModalResolve(null);
    if (resolveFunc) { resolveFunc(null); }
}

export function showModal(type, title, message, options = {}) {
    return new Promise((resolve) => {
        const requiredModalElements = [ cfg.modalOverlay, cfg.modalDialog, cfg.modalTitle, cfg.modalMessage, cfg.modalInputContainer, cfg.modalInput, cfg.modalButtons, cfg.modalOk, cfg.modalCancel, cfg.modalConfirm, cfg.modalDeny ];
        if (requiredModalElements.some(el => !el)) { console.error("Modal elements not found. Cannot show modal."); return resolve(null); }
        if (cfg.currentModalResolve) { console.warn("Modal system busy. Cannot show new modal until previous one is closed."); return resolve(null); }
        cfg.setCurrentModalResolve(resolve);

        cfg.modalTitle.textContent = title; cfg.modalMessage.textContent = message;
        cfg.modalInputContainer.style.display = 'none'; cfg.modalInput.value = options.defaultValue || ''; cfg.modalInput.type = options.inputType || 'text'; cfg.modalInput.placeholder = options.placeholder || ''; cfg.modalInput.onkeydown = null;
        cfg.modalOk.style.display = 'none'; cfg.modalCancel.style.display = 'none'; cfg.modalConfirm.style.display = 'none'; cfg.modalDeny.style.display = 'none'; cfg.modalDialog.onkeydown = null;
        let primaryButton = null;

        switch (type) {
            case 'alert':
                cfg.modalOk.textContent = options.okText || 'OK'; cfg.modalOk.style.display = 'inline-block'; cfg.modalOk.onclick = () => { cfg.currentModalResolve?.(true); hideModal(); }; primaryButton = cfg.modalOk;
                cfg.modalDialog.onkeydown = (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); cfg.modalOk.click(); } }; break;
            case 'confirm':
                cfg.modalConfirm.textContent = options.confirmText || 'Yes'; cfg.modalDeny.textContent = options.denyText || 'No'; cfg.modalConfirm.style.display = 'inline-block'; cfg.modalDeny.style.display = 'inline-block';
                cfg.modalConfirm.onclick = () => { cfg.currentModalResolve?.(true); hideModal(); }; cfg.modalDeny.onclick = () => { cfg.currentModalResolve?.(false); hideModal(); }; primaryButton = cfg.modalConfirm;
                cfg.modalDialog.onkeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); cfg.modalDeny.click(); } }; break;
            case 'prompt':
                cfg.modalInputContainer.style.display = 'block'; cfg.modalOk.textContent = options.okText || 'OK'; cfg.modalCancel.textContent = options.cancelText || 'Cancel'; cfg.modalOk.style.display = 'inline-block'; cfg.modalCancel.style.display = 'inline-block';
                cfg.modalOk.onclick = () => { cfg.currentModalResolve?.(cfg.modalInput.value); hideModal(); }; cfg.modalCancel.onclick = () => { cfg.currentModalResolve?.(null); hideModal(); }; primaryButton = cfg.modalInput;
                cfg.modalInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); cfg.modalOk.click(); } };
                cfg.modalDialog.onkeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); cfg.modalCancel.click(); } }; break;
            default: console.error(`Unknown modal type: ${type}`); cfg.currentModalResolve?.(null); hideModal(); return;
        }
        cfg.modalOverlay.style.display = 'flex';
        if (primaryButton) { setTimeout(() => { if (document.body.contains(primaryButton)) { primaryButton.focus(); if (type === 'prompt') primaryButton.select(); } }, 0); }
    });
}

// --- Cursor ---
export function updateCursor() {
    if (!cfg.canvas) return;
    let cursorStyle = 'crosshair';
    if (cfg.isPanningAnimationActive) { cursorStyle = 'default'; }
    else if (cfg.isPanning) { cursorStyle = 'grabbing'; }
    else if (cfg.draggingNation) { cursorStyle = 'grabbing'; }
    else if (cfg.hoveredNationIndex !== null) { cursorStyle = 'pointer'; }
    else if (cfg.potentialPan) { cursorStyle = 'grab'; }
    if (cfg.canvas.style.cursor !== cursorStyle) { cfg.canvas.style.cursor = cursorStyle; }
}