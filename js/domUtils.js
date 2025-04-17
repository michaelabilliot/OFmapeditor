// --- START OF FILE domUtils.js ---

import * as cfg from './config.js';
import { redrawCanvas, mapToCanvasCoords, smoothPanTo } from './canvasUtils.js';
import { handleDeleteNation } from './nationUtils.js';
import * as flagEditor from './flagEditor.js';

// --- Helper ---
export function getCssVariable(varName, fallback = '#000') {
    try {
        if (document.documentElement && typeof getComputedStyle === 'function') {
            const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
            return value || fallback;
        }
        return fallback;
    } catch (e) {
        console.warn(`Error getting CSS variable ${varName}:`, e);
        return fallback;
    }
}

// --- Dynamic HTML Population ---
export function populateDynamicElements() {
    // Settings Panel HTML
    if (cfg.settingsPanel) {
        cfg.settingsPanel.innerHTML = `
            <h3>Settings</h3>
            <div class="setting-item">
                <label for="markerSizeInput">Marker Screen Radius (<span id="markerSizeValue">${cfg.markerRadius()}</span>px):</label>
                <input type="range" id="markerSizeInput" min="3" max="20" value="${cfg.markerRadius()}">
            </div>
            <div class="setting-item">
                <label for="nationTextSizeInput">Text Screen Size (<span id="nationTextSizeValue">${cfg.nationTextSize()}</span>px):</label>
                <input type="range" id="nationTextSizeInput" min="8" max="24" value="${cfg.nationTextSize()}">
            </div>
             <div class="setting-item">
                <label for="flagSizeInput">Flag Screen Size (<span id="flagSizeValue">${cfg.flagBaseDisplaySize()}</span>px):</label>
                <input type="range" id="flagSizeInput" min="10" max="60" value="${cfg.flagBaseDisplaySize()}">
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
    } else { console.error("Cannot populate settings panel: #settingsPanel not found."); }

    // Controls Bar HTML - Uses Generation controls
    if (cfg.controlsDiv) {
        cfg.controlsDiv.innerHTML = `
            <div class="control-group-left">
                <div class="control-group">
                    <button id="generateMapButton" class="file-label-button" style="background-color: var(--button-primary-bg-color); color: var(--button-primary-text-color);">Generate Map</button>
                 </div>
                <details class="gen-params-details">
                    <summary>Generation Params</summary>
                    <div class="gen-params-grid">
                        <label for="paramWidth">Width:</label><input type="number" id="paramWidth" min="64" max="4096" step="64" value="${cfg.defaultGenParams.width}">
                        <label for="paramHeight">Height:</label><input type="number" id="paramHeight" min="64" max="4096" step="64" value="${cfg.defaultGenParams.height}">
                        <label for="paramSeed">Seed:</label><input type="number" id="paramSeed" value="${cfg.defaultGenParams.seed}">
                        <label for="paramNumFaults">Faults:</label><input type="number" id="paramNumFaults" min="1" max="10000" value="${cfg.defaultGenParams.numFaults}">
                        <label for="paramEnableSymmetry">Symmetry:</label><input type="checkbox" id="paramEnableSymmetry" ${cfg.defaultGenParams.enableSymmetry ? 'checked' : ''}>

                        <label for="paramSmoothingIterations">Smooth Iter:</label><input type="number" id="paramSmoothingIterations" min="0" max="10" value="${cfg.defaultGenParams.smoothing.iterations}">

                        <label for="paramNoiseSeed">Noise Seed:</label><input type="number" id="paramNoiseSeed" value="${cfg.defaultGenParams.noise.seed}">
                        <label for="paramNoiseOctaves">Noise Oct:</label><input type="number" id="paramNoiseOctaves" min="1" max="12" value="${cfg.defaultGenParams.noise.octaves}">
                        <label for="paramNoisePersistence">Noise Persist:</label><input type="number" id="paramNoisePersistence" min="0.1" max="0.9" step="0.05" value="${cfg.defaultGenParams.noise.persistence}">
                        <label for="paramNoiseLacunarity">Noise Lacun:</label><input type="number" id="paramNoiseLacunarity" min="1.1" max="4.0" step="0.1" value="${cfg.defaultGenParams.noise.lacunarity}">
                        <label for="paramNoiseScale">Noise Scale:</label><input type="number" id="paramNoiseScale" min="1" max="1000" value="${cfg.defaultGenParams.noise.scale}">
                        <label for="paramNoiseStrength">Noise Str:</label><input type="number" id="paramNoiseStrength" min="0" max="1.0" step="0.01" value="${cfg.defaultGenParams.noise.strength}">
                    </div>
                </details>
                <div class="control-group">
                    <input type="file" id="jsonLoadInput" class="visually-hidden" accept=".json,application/json">
                    <label for="jsonLoadInput" id="jsonLoadLabel" class="file-label-button" data-disabled="true">Load JSON</label>
                </div>
                <div class="control-group">
                    <button id="loadFlagsButton" disabled>Load Flags</button>
                </div>
            </div>

            <div class="control-group-right">
                 <div class="control-group">
                    <button id="saveButton" disabled>Save ZIP</button>
                 </div>
            </div>
        `;
        // Add basic styling for the details/grid (can be moved to CSS)
        const style = document.createElement('style');
        style.textContent = `
            .gen-params-details { background-color: var(--bg-color); border: 1px solid var(--border-color); border-radius: 4px; margin: 0 5px; }
            .gen-params-details summary { cursor: pointer; padding: 3px 8px; font-weight: 500; font-size: 0.9em; user-select: none; list-style: inside; }
            .gen-params-details summary:hover { background-color: var(--button-hover-bg-color); }
            .gen-params-grid { display: grid; grid-template-columns: auto 1fr; gap: 5px 10px; padding: 10px; background-color: var(--panel-bg-color); border-top: 1px solid var(--border-color); max-width: 350px; }
            .gen-params-grid label { text-align: right; font-size: 0.85em; white-space: nowrap;}
            .gen-params-grid input { max-width: 80px; padding: 2px 4px; border: 1px solid var(--input-border-color); background-color: var(--input-bg-color); color: var(--text-color); border-radius: 3px; font-size: 0.85em; }
            .gen-params-grid input[type=checkbox] { justify-self: start; }
        `;
        document.head.appendChild(style);
    } else { console.error("Cannot populate controls: #controls not found."); }

    // Instructions Panel HTML - Updated Instructions
    if (cfg.instructionsDiv) {
        cfg.instructionsDiv.innerHTML = `
            <h3>Instructions</h3>
            <p><b>Map Generation:</b></p>
            <ul>
                <li><span class="highlight">Generate Map:</span> Creates map using current parameters. <span class="highlight">This replaces the map.</span></li>
                <li><span class="highlight">Generation Params:</span> Click to expand/collapse controls for seed, size, faults, smoothing, noise.</li>
             </ul>
             <p><b>Project Data:</b></p>
            <ul>
                <li><span class="highlight">Load JSON:</span> (Optional) Load existing nation data <span class="highlight">AFTER</span> generating a map.</li>
                <li><span class="highlight">Load Flags:</span> Load flag images (<span class="highlight">PNG or SVG</span>) <span class="highlight">AFTER</span> generating map/loading JSON. Match filename (before ext) to nation's 'flag' property (from JSON) or generated name (e.g., 'my_nation'). Select ALL relevant flag files. Flags are auto-standardized.</li>
                <li><span class="highlight">Save ZIP:</span> Save project (generated map image, json, flags) as ZIP. Flags saved as SVG containing standardized PNG.</li>
            </ul>
            <p><b>Map Interaction:</b></p>
            <ul>
                <li><b>Pan:</b> Click & Drag empty space.</li>
                <li><b>Zoom:</b> Mouse Wheel or +/- keys.</li>
                <li><b>Reset View:</b> '0' key or Reset button.</li>
            </ul>
            <p><b>Nations:</b></p>
            <ul>
                <li><b>Add:</b> Click empty space.</li>
                <li><b>Select:</b> Click marker or list item.</li>
                <li><b>Move:</b> Click & Drag selected marker.</li>
                <li><b>Edit:</b> Double-Click marker (popup).</li>
                <li><b>Delete:</b> Select, then Delete/Backspace key OR '✖' in list.</li>
                <li><b>Go To (List):</b> Double-click list item to <span class="highlight">smoothly pan</span> map.</li>
                <li><b>Add/Change Flag:</b> Select nation, use 'Upload Flag' in Info Panel.</li>
                <li><b>Edit Flag Appearance:</b> Select nation with flag, use 'Flag Editor' button.</li>
                <li><b>Remove Flag:</b> Select nation, use '✖ Remove' in Info Panel.</li>
            </ul>
            <p><b>Other:</b></p>
            <ul>
                <li><b>Deselect:</b> Press Esc key.</li>
                <li><b>Save:</b> Press 'S' key (saves ZIP).</li>
                <li><b>Settings (⚙️):</b> Theme, display sizes.</li>
            </ul>
        `;
    } else { console.error("Cannot populate instructions: #instructions not found."); }
}

// --- UI Update Functions ---
export function updateStatus(message, isError = false, isProgress = false) {
    if (!cfg.statusDiv) return;
    cfg.statusDiv.textContent = message;
    cfg.statusDiv.classList.toggle('error', isError);
    cfg.statusDiv.style.fontWeight = isProgress ? 'bold' : 'normal'; // Example: bold for progress
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
    const zoomDisplaySpan = document.getElementById('zoomDisplay');
    if (zoomDisplaySpan) {
        zoomDisplaySpan.textContent = `${Math.round(cfg.zoom * 100)}%`;
    }
}

export function updateNationList() {
    if (!cfg.nationListUl || !cfg.nationListCountSpan) return;
    cfg.nationListUl.innerHTML = '';
    const count = cfg.nations.length;
    cfg.nationListCountSpan.textContent = count;

    if (count === 0) {
        const li = document.createElement('li');
        li.textContent = 'No nations added yet.';
        li.style.fontStyle = 'italic'; li.style.opacity = '0.7';
        cfg.nationListUl.appendChild(li);
    } else {
        cfg.nations.forEach((nation, index) => {
            const li = document.createElement('li');
            li.dataset.index = index;
            if (index === cfg.selectedNationIndex) li.classList.add('selected-list-item');
            const infoSpan = document.createElement('span');
            infoSpan.className = 'nation-info';
            const coordX = (nation?.coordinates?.[0] !== undefined) ? Math.round(nation.coordinates[0]) : '?';
            const coordY = (nation?.coordinates?.[1] !== undefined) ? Math.round(nation.coordinates[1]) : '?';
            infoSpan.textContent = `${index + 1}. ${nation.name} (Str: ${nation.strength}, Coords: [${coordX}, ${coordY}])`;
            infoSpan.title = infoSpan.textContent;
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-nation';
            deleteBtn.textContent = '✖'; deleteBtn.title = `Delete ${nation.name}`; deleteBtn.dataset.index = index;
            li.appendChild(infoSpan); li.appendChild(deleteBtn); cfg.nationListUl.appendChild(li);
            li.addEventListener('mouseenter', () => { if (parseInt(li.dataset.index, 10) < cfg.nations.length) { cfg.setHoveredListIndex(index); if (!cfg.isPanningAnimationActive) redrawCanvas(); } });
            li.addEventListener('mouseleave', () => { if (cfg.hoveredListIndex === index) { cfg.setHoveredListIndex(null); if (!cfg.isPanningAnimationActive) redrawCanvas(); } });
            li.addEventListener('click', (event) => { if (event.target === deleteBtn || cfg.isPanningAnimationActive) return; const targetIndex = parseInt(li.dataset.index, 10); if (isNaN(targetIndex) || targetIndex < 0 || targetIndex >= cfg.nations.length) return; cfg.setSelectedNationIndex(targetIndex); closeInlineEditor(); updateNationList(); redrawCanvas(); updateInfoPanel(targetIndex); });
            deleteBtn.addEventListener('click', handleDeleteNation);
            li.addEventListener('dblclick', (event) => { if (event.target === deleteBtn || cfg.isPanningAnimationActive) return; const targetIndex = parseInt(li.dataset.index, 10); if (isNaN(targetIndex) || targetIndex < 0 || targetIndex >= cfg.nations.length || !cfg.nations[targetIndex]?.coordinates) return; const targetNation = cfg.nations[targetIndex]; const [targetMapX, targetMapY] = targetNation.coordinates; cfg.setSelectedNationIndex(targetIndex); closeInlineEditor(); updateInfoPanel(targetIndex); updateNationList(); updateStatus(`Navigating to ${targetNation.name}...`); smoothPanTo(targetMapX, targetMapY); });
        });
    }
}

export function updateInfoPanel(nationIndex) {
    const requiredElements = [cfg.infoNameSpan, cfg.infoStrengthSpan, cfg.infoPlaceholder, cfg.infoFlagPreview, cfg.infoFlagStatus, cfg.infoFlagUploadLabel, cfg.infoFlagUploadInput, cfg.infoFlagRemoveButton, cfg.editFlagButton];
    if (requiredElements.some(el => !el)) return;
    const noNationSelected = nationIndex === null || nationIndex < 0 || nationIndex >= cfg.nations.length;
    cfg.infoFlagPreview.style.display = 'none'; cfg.infoFlagPreview.removeAttribute('src'); cfg.infoFlagPreview.alt = 'Nation Flag Preview'; cfg.infoFlagStatus.style.display = 'none'; cfg.infoFlagStatus.textContent = ''; cfg.infoFlagUploadLabel.setAttribute('data-disabled', 'true'); cfg.infoFlagUploadInput.disabled = true; cfg.infoFlagRemoveButton.disabled = true; cfg.editFlagButton.disabled = true;

    if (noNationSelected) {
        cfg.infoNameSpan.textContent = '--'; cfg.infoStrengthSpan.textContent = '--'; cfg.infoPlaceholder.style.display = 'block';
    } else {
        const nation = cfg.nations[nationIndex];
        if (nation) {
            cfg.infoNameSpan.textContent = nation.name; cfg.infoStrengthSpan.textContent = nation.strength; cfg.infoPlaceholder.style.display = 'none';
            cfg.infoFlagUploadLabel.removeAttribute('data-disabled'); cfg.infoFlagUploadInput.disabled = false;
            let flagStatusText = '';
            let hasDisplayableFlag = nation.flagImage && nation.flagImage.complete && nation.flagImage.naturalWidth > 0;
            let hasOriginalData = nation.flagData && nation.flagDataType;
            if (hasDisplayableFlag) {
                cfg.infoFlagPreview.src = nation.flagImage.src; cfg.infoFlagPreview.alt = `${nation.name} Standardized Flag Preview`; cfg.infoFlagPreview.style.display = 'block'; cfg.infoFlagRemoveButton.disabled = false; cfg.editFlagButton.disabled = !hasOriginalData;
                const originalFileName = nation.flag ? `${nation.flag}.${nation.flagDataType || '?'}` : 'Unknown Original File'; flagStatusText = `Loaded: ${originalFileName} (Standardized)`;
            } else if (nation.flag && hasOriginalData) {
                 flagStatusText = `Original: ${nation.flag}.${nation.flagDataType}. Display error.`; cfg.infoFlagRemoveButton.disabled = false; cfg.editFlagButton.disabled = false; cfg.infoFlagPreview.style.display = 'none';
             } else if (nation.flag) {
                const assumedExt = nation.flag.toLowerCase().endsWith('.svg') ? 'svg' : (nation.flag.toLowerCase().endsWith('.png') ? 'png' : '...'); flagStatusText = `Flag specified: ${nation.flag}.${assumedExt} (Needs upload)`; cfg.infoFlagRemoveButton.disabled = false; cfg.editFlagButton.disabled = true;
            }
            if (flagStatusText) { cfg.infoFlagStatus.textContent = flagStatusText; cfg.infoFlagStatus.style.display = 'block'; }
        } else {
            console.error(`Could not find nation data for valid index: ${nationIndex}`); cfg.infoNameSpan.textContent = 'Error'; cfg.infoStrengthSpan.textContent = '?'; cfg.infoPlaceholder.style.display = 'block';
        }
    }
}

export function openInlineEditor(index, mapX, mapY) {
    if (!cfg.inlineEditPanel || !cfg.inlineEditName || !cfg.inlineEditStrength || index < 0 || index >= cfg.nations.length) return;
    const nation = cfg.nations[index]; if (!nation) return;
    cfg.setNationIndexBeingEdited(index); cfg.inlineEditName.value = nation.name; cfg.inlineEditStrength.value = nation.strength;
    const canvasPos = mapToCanvasCoords(mapX, mapY); if (!canvasPos || !cfg.canvasContainer || !cfg.canvas) return;
    const panelWidth = cfg.inlineEditPanel.offsetWidth || 220; const panelHeight = cfg.inlineEditPanel.offsetHeight || 130; const containerWidth = cfg.canvasContainer.clientWidth; const containerHeight = cfg.canvasContainer.clientHeight; const markerScreenRadius = cfg.markerRadius(); const panelMargin = 15;
    let panelX = canvasPos.x + markerScreenRadius + panelMargin; let panelY = canvasPos.y + 5;
    if (panelX + panelWidth > containerWidth - 10) panelX = canvasPos.x - panelWidth - markerScreenRadius - panelMargin;
    if (panelY + panelHeight > containerHeight - 10) panelY = canvasPos.y - panelHeight - 5;
    panelX = Math.max(5, panelX); panelY = Math.max(5, panelY);
    cfg.inlineEditPanel.style.left = `${panelX}px`; cfg.inlineEditPanel.style.top = `${panelY}px`; cfg.inlineEditPanel.style.display = 'block';
    cfg.inlineEditName.focus(); cfg.inlineEditName.select();
    updateStatus(`Editing ${nation.name}... (Enter to Save, Esc to Cancel)`);
}

export function closeInlineEditor() {
    if (!cfg.inlineEditPanel) return;
    cfg.inlineEditPanel.style.display = 'none';
    cfg.setNationIndexBeingEdited(null);
}

export function applySettings() {
    if (!cfg.markerSizeInput || !cfg.nationTextSizeInput || !cfg.flagSizeInput || !cfg.darkModeToggle || !cfg.markerSizeValue || !cfg.nationTextSizeValue || !cfg.flagSizeValue) { console.warn("Cannot apply settings: Elements missing."); return; }
    const newMarkerRadius = parseInt(cfg.markerSizeInput.value, 10); const newNationTextSize = parseInt(cfg.nationTextSizeInput.value, 10); const newFlagSize = parseInt(cfg.flagSizeInput.value, 10);
    cfg.setMarkerRadius(newMarkerRadius); cfg.setNationTextSize(newNationTextSize); cfg.setFlagBaseDisplaySize(newFlagSize);
    cfg.markerSizeValue.textContent = newMarkerRadius; cfg.nationTextSizeValue.textContent = newNationTextSize; cfg.flagSizeValue.textContent = newFlagSize;
    document.body.classList.toggle('dark-mode', cfg.darkModeToggle.checked);
    redrawCanvas();
}

export function saveSettings() {
    if (!cfg.darkModeToggle || !cfg.markerSizeInput || !cfg.nationTextSizeInput || !cfg.flagSizeInput) { console.warn("Cannot save settings: Elements missing."); return; }
    try {
        localStorage.setItem('mapEditor_markerRadius', cfg.markerRadius().toString());
        localStorage.setItem('mapEditor_nationTextSize', cfg.nationTextSize().toString());
        localStorage.setItem('mapEditor_flagBaseDisplaySize', cfg.flagBaseDisplaySize().toString());
        localStorage.setItem('mapEditor_darkMode', cfg.darkModeToggle.checked.toString());
    } catch (e) { console.warn("Could not save settings to localStorage:", e); }
}

export function loadSettings() {
    if (!cfg.markerSizeInput || !cfg.darkModeToggle || !cfg.nationTextSizeInput || !cfg.flagSizeInput) { console.warn("Cannot load settings: Elements missing."); applySettings(); return; }
    try {
        const savedRadius = localStorage.getItem('mapEditor_markerRadius'); if (savedRadius !== null) { const radius = parseInt(savedRadius, 10); if (!isNaN(radius) && cfg.markerSizeInput && radius >= parseInt(cfg.markerSizeInput.min, 10) && radius <= parseInt(cfg.markerSizeInput.max, 10)) { cfg.setMarkerRadius(radius); cfg.markerSizeInput.value = String(radius); } }
        const savedTextSize = localStorage.getItem('mapEditor_nationTextSize'); if (savedTextSize !== null) { const size = parseInt(savedTextSize, 10); if (!isNaN(size) && cfg.nationTextSizeInput && size >= parseInt(cfg.nationTextSizeInput.min, 10) && size <= parseInt(cfg.nationTextSizeInput.max, 10)) { cfg.setNationTextSize(size); cfg.nationTextSizeInput.value = String(size); } }
        const savedFlagSize = localStorage.getItem('mapEditor_flagBaseDisplaySize'); if (savedFlagSize !== null) { const size = parseInt(savedFlagSize, 10); if (!isNaN(size) && cfg.flagSizeInput && size >= parseInt(cfg.flagSizeInput.min, 10) && size <= parseInt(cfg.flagSizeInput.max, 10)) { cfg.setFlagBaseDisplaySize(size); cfg.flagSizeInput.value = String(size); } }
        const savedDarkMode = localStorage.getItem('mapEditor_darkMode'); if (savedDarkMode !== null) { if (cfg.darkModeToggle) cfg.darkModeToggle.checked = (savedDarkMode === 'true'); }
    } catch (e) { console.warn("Could not load settings from localStorage:", e); }
    finally { applySettings(); }
}

export function hideModal() {
    if (!cfg.modalOverlay) return;
    cfg.modalOverlay.style.display = 'none';
    const buttons = [cfg.modalOk, cfg.modalCancel, cfg.modalConfirm, cfg.modalDeny];
    buttons.forEach(btn => { if(btn) btn.onclick = null; });
    if(cfg.modalInput) cfg.modalInput.onkeydown = null;
    if(cfg.modalDialog) cfg.modalDialog.onkeydown = null;
    const resolveFunc = cfg.currentModalResolve; cfg.setCurrentModalResolve(null);
    if (resolveFunc) { resolveFunc(null); }
}

export function showModal(type, title, message, options = {}) {
    return new Promise((resolve) => {
        const requiredModalElements = [ cfg.modalOverlay, cfg.modalDialog, cfg.modalTitle, cfg.modalMessage, cfg.modalInputContainer, cfg.modalInput, cfg.modalButtons, cfg.modalOk, cfg.modalCancel, cfg.modalConfirm, cfg.modalDeny ];
        if (requiredModalElements.some(el => !el)) { console.error("Modal elements missing."); return resolve(null); }
        if (cfg.currentModalResolve) { console.warn("Modal busy."); return resolve(null); }
        cfg.setCurrentModalResolve(resolve);
        cfg.modalTitle.textContent = title; cfg.modalMessage.textContent = message;
        cfg.modalInputContainer.style.display = 'none'; cfg.modalInput.value = options.defaultValue || ''; cfg.modalInput.type = options.inputType || 'text'; cfg.modalInput.placeholder = options.placeholder || ''; cfg.modalInput.onkeydown = null;
        cfg.modalOk.style.display = 'none'; cfg.modalCancel.style.display = 'none'; cfg.modalConfirm.style.display = 'none'; cfg.modalDeny.style.display = 'none'; cfg.modalDialog.onkeydown = null;
        let primaryButton = null;
        switch (type) {
            case 'alert': cfg.modalOk.textContent = options.okText || 'OK'; cfg.modalOk.style.display = 'inline-block'; cfg.modalOk.onclick = () => { cfg.currentModalResolve?.(true); hideModal(); }; primaryButton = cfg.modalOk; cfg.modalDialog.onkeydown = (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); cfg.modalOk.click(); } }; break;
            case 'confirm': cfg.modalConfirm.textContent = options.confirmText || 'Yes'; cfg.modalDeny.textContent = options.denyText || 'No'; cfg.modalConfirm.style.display = 'inline-block'; cfg.modalDeny.style.display = 'inline-block'; cfg.modalConfirm.onclick = () => { cfg.currentModalResolve?.(true); hideModal(); }; cfg.modalDeny.onclick = () => { cfg.currentModalResolve?.(false); hideModal(); }; primaryButton = cfg.modalConfirm; cfg.modalDialog.onkeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); cfg.modalDeny.click(); } }; break;
            case 'prompt': cfg.modalInputContainer.style.display = 'block'; cfg.modalOk.textContent = options.okText || 'OK'; cfg.modalCancel.textContent = options.cancelText || 'Cancel'; cfg.modalOk.style.display = 'inline-block'; cfg.modalCancel.style.display = 'inline-block'; cfg.modalOk.onclick = () => { cfg.currentModalResolve?.(cfg.modalInput.value); hideModal(); }; cfg.modalCancel.onclick = () => { cfg.currentModalResolve?.(null); hideModal(); }; primaryButton = cfg.modalInput; cfg.modalInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); cfg.modalOk.click(); } }; cfg.modalDialog.onkeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); cfg.modalCancel.click(); } }; break;
            default: console.error(`Unknown modal type: ${type}`); cfg.currentModalResolve?.(null); hideModal(); return;
        }
        cfg.modalOverlay.style.display = 'flex';
        if (primaryButton) { setTimeout(() => { if (document.body.contains(primaryButton)) { primaryButton.focus(); if (type === 'prompt') primaryButton.select(); } }, 0); }
    });
}

export function updateCursor() {
    if (!cfg.canvas) return;
    let cursorStyle = 'crosshair'; // Default for adding
    if (cfg.isGeneratingMap) { cursorStyle = 'wait'; } // Indicate busy state
    else if (cfg.isPanningAnimationActive) { cursorStyle = 'default'; }
    else if (cfg.isPanning) { cursorStyle = 'grabbing'; }
    else if (cfg.draggingNation) { cursorStyle = 'grabbing'; }
    else if (cfg.hoveredNationIndex !== null) { cursorStyle = 'pointer'; }
    else if (cfg.potentialPan) { cursorStyle = 'grab'; }
    if (cfg.canvas.style.cursor !== cursorStyle) { cfg.canvas.style.cursor = cursorStyle; }
}

// --- END OF FILE domUtils.js ---