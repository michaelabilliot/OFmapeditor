// --- START OF FILE js/domUtils.js ---
import * as cfg from './config.js';
// Import specific functions needed, including mapToCanvasCoords statically
import { redrawCanvas, mapToCanvasCoords, smoothPanTo } from './canvasUtils.js';
// Import only needed functions
import { handleDeleteNation } from './nationUtils.js';

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
        cfg.controlsDiv.innerHTML = `
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
            <div class="control-group">
                <button id="saveButton" disabled>Save ZIP</button>
            </div>
            <div id="zoomControls" class="control-group">
                <button id="zoomOutButton" title="Zoom Out (-)">-</button>
                <span id="zoomDisplay">100%</span>
                <button id="zoomInButton" title="Zoom In (+)">+</button>
                <button id="zoomResetButton" title="Reset View (0)">Reset</button>
            </div>
        `;
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
                <li><span class="highlight">Load Flags:</span> Load flag images (<span class="highlight">PNG or SVG</span>). Match filename (before extension) to nation's 'flag' property in JSON, or generated name (e.g., 'my_nation'). <span class="highlight">Select ALL relevant flag files</span>.</li>
                <li><span class="highlight">Save ZIP:</span> Save project (map, json, flags) as ZIP. <span class="highlight">All flags are saved as SVG files</span> (original SVGs saved directly, PNGs/rasters embedded in SVG).</li>
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
                <li><span class="highlight">Go To (List):</span> Double-click list item to <span class="highlight">smoothly pan</span> map.</li>
                <li><b>Add/Change Flag:</b> Select nation, use 'Upload Flag' in Info Panel (<span class="highlight">PNG or SVG</span>).</li>
                <li><b>Remove Flag:</b> Select nation, use '✖ Remove' in Info Panel.</li>
            </ul>
            <p><b>Other:</b></p>
            <ul>
                <li><b>Deselect:</b> Press Esc key.</li>
                <li><b>Save:</b> Press 'S' key (saves ZIP).</li>
                <li><b>Settings (⚙️):</b> Theme, sizes (marker, text, flag).</li>
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
    if (cfg.zoomDisplay) {
        cfg.zoomDisplay.textContent = `${Math.round(cfg.zoom * 100)}%`;
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
        cfg.nationListUl.appendChild(li);
    } else {
        // Sort nations alphabetically for the list display? Optional.
        // const sortedNations = [...cfg.nations].sort((a, b) => a.name.localeCompare(b.name));
        // sortedNations.forEach((nation, displayIndex) => {
        // const originalIndex = cfg.nations.findIndex(n => n === nation); // Need original index for actions

        // Sticking to original order for now:
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
    // Check if all required info panel elements exist
    const requiredElements = [
        cfg.infoNameSpan, cfg.infoStrengthSpan, cfg.infoPlaceholder,
        cfg.infoFlagPreview, cfg.infoFlagStatus, cfg.infoFlagUploadLabel,
        cfg.infoFlagUploadInput, cfg.infoFlagRemoveButton
    ];
    if (requiredElements.some(el => !el)) {
        // console.warn("Info panel elements not ready for updateInfoPanel");
        return; // Silently return if elements aren't ready (e.g., during init)
    }

    const noNationSelected = nationIndex === null || nationIndex < 0 || nationIndex >= cfg.nations.length;

    // --- Reset Flag UI State ---
    cfg.infoFlagPreview.style.display = 'none';
    cfg.infoFlagPreview.removeAttribute('src'); // Clear src to prevent showing old image briefly
    cfg.infoFlagPreview.alt = 'Nation Flag Preview'; // Reset alt text
    cfg.infoFlagStatus.style.display = 'none';
    cfg.infoFlagStatus.textContent = '';
    // Disable flag controls by default
    cfg.infoFlagUploadLabel.setAttribute('data-disabled', 'true');
    cfg.infoFlagUploadInput.disabled = true;
    cfg.infoFlagRemoveButton.disabled = true;


    if (noNationSelected) {
        // --- No Nation Selected ---
        cfg.infoNameSpan.textContent = '--';
        cfg.infoStrengthSpan.textContent = '--';
        cfg.infoPlaceholder.style.display = 'block'; // Show placeholder text
    } else {
        // --- Nation Selected ---
        const nation = cfg.nations[nationIndex];
        if (nation) {
            cfg.infoNameSpan.textContent = nation.name;
            cfg.infoStrengthSpan.textContent = nation.strength;
            cfg.infoPlaceholder.style.display = 'none'; // Hide placeholder

            // Enable flag upload controls
            cfg.infoFlagUploadLabel.removeAttribute('data-disabled');
            cfg.infoFlagUploadInput.disabled = false;

            // --- Update Flag Section Based on Nation Data ---
            let flagStatusText = '';
            if (nation.flagImage && nation.flagImage.src) {
                // Flag image is loaded and ready for display (this is the resized bitmap)
                cfg.infoFlagPreview.src = nation.flagImage.src;
                cfg.infoFlagPreview.alt = `${nation.name} Flag Preview`;
                cfg.infoFlagPreview.style.display = 'block';
                cfg.infoFlagRemoveButton.disabled = false; // Enable remove button

                // Construct status message including original type and save format hint
                const flagFileName = nation.flag ? `${nation.flag}.${nation.flagDataType || '?'}` : 'Unknown Flag File';
                flagStatusText = `Loaded: ${flagFileName}`;
                if (nation.flagDataType && nation.flagDataType !== 'svg') {
                    flagStatusText += ' (will save as .svg)';
                } else if (!nation.flagDataType) {
                    flagStatusText += ' (Type unknown, will attempt SVG save)';
                }

            } else if (nation.flag && nation.flagData && nation.flagDataType) {
                 // Flag data exists (original), but image object isn't loaded/ready (e.g., zero dims, load error)
                 flagStatusText = `Flag data present for ${nation.flag}.${nation.flagDataType}, but preview unavailable.`;
                 cfg.infoFlagRemoveButton.disabled = false; // Allow removal even if preview failed

             } else if (nation.flag) {
                // Flag name specified (e.g., from JSON), but no data loaded yet
                const assumedExt = nation.flag.toLowerCase().endsWith('.svg') ? 'svg' : (nation.flag.toLowerCase().endsWith('.png') ? 'png' : '...'); // Basic guess
                flagStatusText = `Flag specified: ${nation.flag}.${assumedExt} (Needs image load/upload)`;
                cfg.infoFlagRemoveButton.disabled = false; // Allow removal even if not loaded
            }
            // else: no flag info at all, controls remain disabled, no status text needed

            // Display status text if generated
            if (flagStatusText) {
                 cfg.infoFlagStatus.textContent = flagStatusText;
                 cfg.infoFlagStatus.style.display = 'block';
            }

        } else {
            // Should not happen if index is valid, but handle defensively
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

    // Set state and populate inputs
    cfg.setNationIndexBeingEdited(index);
    cfg.inlineEditName.value = nation.name;
    cfg.inlineEditStrength.value = nation.strength;

    // --- Calculate Panel Position ---
    // Convert map coordinates to canvas (screen) coordinates
    const canvasPos = mapToCanvasCoords(mapX, mapY);
    if (!canvasPos || !cfg.canvasContainer || !cfg.canvas) return; // Need canvas and container for positioning

    const panelWidth = cfg.inlineEditPanel.offsetWidth || 220; // Use default if offsetWidth is 0
    const panelHeight = cfg.inlineEditPanel.offsetHeight || 130;
    const containerWidth = cfg.canvasContainer.clientWidth;
    const containerHeight = cfg.canvasContainer.clientHeight;
    const markerScreenRadius = cfg.markerRadius(); // Use getter
    const panelMargin = 15; // Space from marker

    // Default position: right and slightly below marker center
    let panelX = canvasPos.x + markerScreenRadius + panelMargin;
    let panelY = canvasPos.y + 5;

    // Adjust if panel goes off-screen right
    if (panelX + panelWidth > containerWidth - 10) { // 10px buffer from edge
        panelX = canvasPos.x - panelWidth - markerScreenRadius - panelMargin; // Position left
    }
    // Adjust if panel goes off-screen bottom
    if (panelY + panelHeight > containerHeight - 10) {
        panelY = canvasPos.y - panelHeight - 5; // Position above
    }

    // Ensure panel stays within bounds (minimum 5px from edge)
    panelX = Math.max(5, panelX);
    panelY = Math.max(5, panelY);

    // Apply position and display
    cfg.inlineEditPanel.style.left = `${panelX}px`;
    cfg.inlineEditPanel.style.top = `${panelY}px`;
    cfg.inlineEditPanel.style.display = 'block';

    // Focus and select the name input for quick editing
    cfg.inlineEditName.focus();
    cfg.inlineEditName.select();

    updateStatus(`Editing ${nation.name}... (Enter to Save, Esc to Cancel)`);
}

export function closeInlineEditor() {
    if (!cfg.inlineEditPanel) return;
    // Only change status if the editor was actually open
    if (cfg.inlineEditPanel.style.display === 'block' && cfg.nationIndexBeingEdited !== null) {
        const nationName = cfg.nations[cfg.nationIndexBeingEdited]?.name || 'nation';
        // updateStatus(`Finished editing ${nationName}.`); // Optional: Indicate finished/cancelled
    }
    cfg.inlineEditPanel.style.display = 'none';
    cfg.setNationIndexBeingEdited(null); // Clear the index being edited

    // Optional: Refocus the canvas after closing editor?
    // cfg.canvas?.focus();
}

// --- Settings ---
export function applySettings() {
    // Check if elements exist before accessing value property
    if (!cfg.markerSizeInput || !cfg.nationTextSizeInput || !cfg.flagSizeInput || !cfg.darkModeToggle || !cfg.markerSizeValue || !cfg.nationTextSizeValue || !cfg.flagSizeValue) {
         console.warn("Cannot apply settings: One or more settings elements not found.");
         return;
    }

    // Update config values from inputs USING SETTERS
    const newMarkerRadius = parseInt(cfg.markerSizeInput.value, 10);
    const newNationTextSize = parseInt(cfg.nationTextSizeInput.value, 10);
    const newFlagSize = parseInt(cfg.flagSizeInput.value, 10);

    // Add validation if necessary (e.g., ensure values are within expected range)
    // if (isNaN(newMarkerRadius) || ...) return;

    cfg.setMarkerRadius(newMarkerRadius);
    cfg.setNationTextSize(newNationTextSize);
    cfg.setFlagBaseDisplaySize(newFlagSize);

    // Update UI display values
    cfg.markerSizeValue.textContent = newMarkerRadius;
    cfg.nationTextSizeValue.textContent = newNationTextSize;
    cfg.flagSizeValue.textContent = newFlagSize;

    // Apply dark mode class to body
    document.body.classList.toggle('dark-mode', cfg.darkModeToggle.checked);

    // Redraw canvas immediately to reflect changes
    redrawCanvas();
}

export function saveSettings() {
    // Check if elements exist before accessing value/checked properties
    if (!cfg.darkModeToggle || !cfg.markerSizeInput || !cfg.nationTextSizeInput || !cfg.flagSizeInput) {
         console.warn("Cannot save settings: One or more settings elements not found.");
         return;
    }
    try {
        // Use getters to retrieve current config values before saving
        localStorage.setItem('mapEditor_markerRadius', cfg.markerRadius().toString());
        localStorage.setItem('mapEditor_nationTextSize', cfg.nationTextSize().toString());
        localStorage.setItem('mapEditor_flagBaseDisplaySize', cfg.flagBaseDisplaySize().toString());
        localStorage.setItem('mapEditor_darkMode', cfg.darkModeToggle.checked.toString());
    } catch (e) {
        console.warn("Could not save settings to localStorage:", e);
        // Optionally inform the user?
        // showModal('alert', 'Warning', 'Could not save settings. LocalStorage might be disabled or full.');
    }
}

export function loadSettings() {
    // Check if elements exist before attempting to set their values
    if (!cfg.markerSizeInput || !cfg.darkModeToggle || !cfg.nationTextSizeInput || !cfg.flagSizeInput) {
        console.warn("Cannot load settings: One or more settings elements not found.");
        // Still try to apply defaults
        applySettings();
        return;
    }
    try {
        const savedRadius = localStorage.getItem('mapEditor_markerRadius');
        if (savedRadius !== null) {
            const radius = parseInt(savedRadius, 10);
            // Validate loaded value against input constraints
            if (!isNaN(radius) && radius >= parseInt(cfg.markerSizeInput.min, 10) && radius <= parseInt(cfg.markerSizeInput.max, 10)) {
                cfg.setMarkerRadius(radius); // Use SETTER
                cfg.markerSizeInput.value = String(radius);
            }
        }

        const savedTextSize = localStorage.getItem('mapEditor_nationTextSize');
        if (savedTextSize !== null) {
             const size = parseInt(savedTextSize, 10);
             if (!isNaN(size) && size >= parseInt(cfg.nationTextSizeInput.min, 10) && size <= parseInt(cfg.nationTextSizeInput.max, 10)) {
                 cfg.setNationTextSize(size); // Use SETTER
                 cfg.nationTextSizeInput.value = String(size);
             }
        }

        const savedFlagSize = localStorage.getItem('mapEditor_flagBaseDisplaySize');
         if (savedFlagSize !== null) {
             const size = parseInt(savedFlagSize, 10);
             if (!isNaN(size) && size >= parseInt(cfg.flagSizeInput.min, 10) && size <= parseInt(cfg.flagSizeInput.max, 10)) {
                 cfg.setFlagBaseDisplaySize(size); // Use SETTER
                 cfg.flagSizeInput.value = String(size);
             }
         }

        const savedDarkMode = localStorage.getItem('mapEditor_darkMode');
        if (savedDarkMode !== null) {
            cfg.darkModeToggle.checked = (savedDarkMode === 'true');
        }

    } catch (e) {
        console.warn("Could not load settings from localStorage:", e);
    } finally {
        // Apply settings AFTER loading attempts (uses loaded values or defaults)
        // This ensures dark mode class and UI value displays are correct
        applySettings();
    }
}


// --- Modals ---
/** Hides the currently displayed modal and cleans up */
export function hideModal() {
    if (!cfg.modalOverlay) return;
    cfg.modalOverlay.style.display = 'none';

    // --- Crucial: Detach event listeners to prevent memory leaks ---
    // Use removeEventListener if listeners were added with it, or nullify onclick
    const buttons = [cfg.modalOk, cfg.modalCancel, cfg.modalConfirm, cfg.modalDeny];
    buttons.forEach(btn => { if(btn) btn.onclick = null; });

    if(cfg.modalInput) cfg.modalInput.onkeydown = null;
    if(cfg.modalDialog) cfg.modalDialog.onkeydown = null; // Clear dialog keydown too

    // Resolve the promise if it's still pending (e.g., closed via Esc outside buttons)
    // Check currentModalResolve BEFORE setting it to null
    const resolveFunc = cfg.currentModalResolve;
    cfg.setCurrentModalResolve(null); // Clear the resolve function reference *immediately*

    if (resolveFunc) {
        resolveFunc(null); // Resolve with null to indicate external closure or cancel
    }
}

/**
 * Shows a modal dialog of a specific type.
 * @param {'alert'|'confirm'|'prompt'} type - The type of modal.
 * @param {string} title - The title of the modal.
 * @param {string} message - The main message content.
 * @param {object} [options={}] - Optional parameters (okText, cancelText, confirmText, denyText, defaultValue, inputType, placeholder).
 * @returns {Promise<boolean|string|null>} - alert: true | confirm: true/false | prompt: string/null
 */
export function showModal(type, title, message, options = {}) {
    return new Promise((resolve) => {
        // Ensure all modal elements are available
        const requiredModalElements = [
            cfg.modalOverlay, cfg.modalDialog, cfg.modalTitle, cfg.modalMessage,
            cfg.modalInputContainer, cfg.modalInput, cfg.modalButtons,
            cfg.modalOk, cfg.modalCancel, cfg.modalConfirm, cfg.modalDeny
        ];
        if (requiredModalElements.some(el => !el)) {
             console.error("Modal elements not found. Cannot show modal.");
             return resolve(null); // Indicate failure
        }

        // Prevent multiple modals opening simultaneously
        if (cfg.currentModalResolve) {
            console.warn("Modal system busy. Cannot show new modal until previous one is closed.");
            // Option 1: Fail the new modal
            return resolve(null);
            // Option 2: Close the old one first? (Risky if user interaction is pending)
            // hideModal();
        }
        cfg.setCurrentModalResolve(resolve); // Store the resolve function for this modal instance

        // --- Configure Modal Content ---
        cfg.modalTitle.textContent = title;
        // Use innerHTML for message if you need line breaks via <br> or \n in message string
        // cfg.modalMessage.innerHTML = message.replace(/\n/g, '<br>');
        cfg.modalMessage.textContent = message; // Safer default

        cfg.modalInputContainer.style.display = 'none'; // Reset input display
        cfg.modalInput.value = options.defaultValue || ''; // Reset input value
        cfg.modalInput.type = options.inputType || 'text';
        cfg.modalInput.placeholder = options.placeholder || '';
        cfg.modalInput.onkeydown = null; // Clear previous input keydown listener


        // Hide all buttons initially
        cfg.modalOk.style.display = 'none';
        cfg.modalCancel.style.display = 'none';
        cfg.modalConfirm.style.display = 'none';
        cfg.modalDeny.style.display = 'none';
        cfg.modalDialog.onkeydown = null; // Clear previous dialog keydown listener

        // --- Configure Buttons and Actions based on Type ---
        let primaryButton = null; // Track which button should get initial focus

        switch (type) {
            case 'alert':
                cfg.modalOk.textContent = options.okText || 'OK';
                cfg.modalOk.style.display = 'inline-block';
                cfg.modalOk.onclick = () => { hideModal(); /* resolve already cleared */ }; // Resolve happens in hideModal now
                primaryButton = cfg.modalOk;
                // Handle Enter/Escape key for the whole dialog in alert mode
                cfg.modalDialog.onkeydown = (e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') {
                        e.preventDefault();
                        cfg.modalOk.click(); // Trigger the OK button's action
                    }
                };
                break;

            case 'confirm':
                cfg.modalConfirm.textContent = options.confirmText || 'Yes';
                cfg.modalDeny.textContent = options.denyText || 'No';
                cfg.modalConfirm.style.display = 'inline-block';
                cfg.modalDeny.style.display = 'inline-block';
                // Resolve directly within the button handlers *before* calling hideModal
                cfg.modalConfirm.onclick = () => { cfg.currentModalResolve?.(true); hideModal(); };
                cfg.modalDeny.onclick = () => { cfg.currentModalResolve?.(false); hideModal(); };
                 primaryButton = cfg.modalConfirm;
                 // Handle Escape key for Deny/Cancel behaviour
                 cfg.modalDialog.onkeydown = (e) => {
                     if (e.key === 'Escape') {
                         e.preventDefault();
                         cfg.modalDeny.click();
                     }
                 };
                break;

            case 'prompt':
                cfg.modalInputContainer.style.display = 'block';
                cfg.modalOk.textContent = options.okText || 'OK';
                cfg.modalCancel.textContent = options.cancelText || 'Cancel';
                cfg.modalOk.style.display = 'inline-block';
                cfg.modalCancel.style.display = 'inline-block';
                // Resolve directly within the button handlers *before* calling hideModal
                cfg.modalOk.onclick = () => { cfg.currentModalResolve?.(cfg.modalInput.value); hideModal(); };
                cfg.modalCancel.onclick = () => { cfg.currentModalResolve?.(null); hideModal(); };
                 primaryButton = cfg.modalOk; // Or maybe modalInput?
                // Handle Enter key specifically on the input, Escape on the dialog
                cfg.modalInput.onkeydown = (e) => {
                     if (e.key === 'Enter') {
                         e.preventDefault();
                         cfg.modalOk.click(); // Trigger OK action
                     }
                 };
                 cfg.modalDialog.onkeydown = (e) => {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        cfg.modalCancel.click(); // Trigger Cancel action
                    }
                };
                // Focus the input field for prompt
                 setTimeout(() => { // Use setTimeout to ensure focus works after display change
                    cfg.modalInput.focus();
                    cfg.modalInput.select();
                 }, 0);
                break;

            default:
                 console.error(`Unknown modal type: ${type}`);
                 // Resolve the promise with null to indicate error and hide
                 cfg.currentModalResolve?.(null);
                 hideModal();
                 return; // Exit promise executor
        }

        // Display the modal
        cfg.modalOverlay.style.display = 'flex';

        // Set focus to the primary button or input (use timeout for reliability)
        if (primaryButton && type !== 'prompt') { // Prompt focuses input field instead
             setTimeout(() => primaryButton.focus(), 0);
        }
    });
}

// --- Cursor ---
export function updateCursor() {
    if (!cfg.canvas) return;
    let cursorStyle = 'crosshair'; // Default: ready to add nation

    if (cfg.isPanningAnimationActive) {
        cursorStyle = 'default'; // Normal cursor during animation
    } else if (cfg.isPanning) {
        cursorStyle = 'grabbing'; // Hand closed while panning
    } else if (cfg.draggingNation) {
        cursorStyle = 'grabbing'; // Hand closed while dragging
    } else if (cfg.hoveredNationIndex !== null) {
        cursorStyle = 'pointer'; // Pointer finger when hovering over a clickable nation
    } else if (cfg.potentialPan) {
        cursorStyle = 'grab'; // Hand open when mousedown starts, potential pan/drag
    }
    // If none of the above, it remains 'crosshair'

    // Only update the style if it has actually changed
    if (cfg.canvas.style.cursor !== cursorStyle) {
        cfg.canvas.style.cursor = cursorStyle;
    }
}


// --- END OF FILE js/domUtils.js ---