import * as cfg from './config.js';
import * as domUtils from './domUtils.js';
import * as canvasUtils from './canvasUtils.js';
import * as mapUtils from './mapUtils.js';
import * as dataUtils from './dataUtils.js';
import * as nationUtils from './nationUtils.js';
// NEW: Import flagEditor functions (assuming openFlagEditor exists)
import { openFlagEditor } from './flagEditor.js';

// --- Map Loading Events ---
export async function handleMapLoadClick(event) {
    // --- ADDED preventDefault ---
    event.preventDefault(); // Prevent the label's default action of triggering the input
    // --------------------------

    if (!cfg.imageInput) {
        console.error("Map image input element not found!");
        domUtils.showModal('alert', 'Error', 'Cannot find map image input element. Check HTML ID.');
        return;
    }
    // Optional: Confirm overwrite if a map is already loaded?
    // if (cfg.mapImage) {
    //     const confirm = await domUtils.showModal('confirm', 'Load New Map?', 'Loading a new map will clear current nations. Continue?');
    //     if (!confirm) return;
    // }

    cfg.imageInput.value = ''; // Clear previous selection to ensure 'change' event fires even if same file is chosen
    cfg.imageInput.click(); // Programmatically click the hidden input
}

export async function handleMapFileSelect(event) {
    const file = event.target.files?.[0]; // Use optional chaining
    if (file) {
        // Process the selected file
        await mapUtils.handleMapImageLoad(file);
    }
    // No need to clear value here again, handleMapLoadClick already does it before click()
}

// --- JSON Loading Events ---
export async function handleJsonFileSelect(event) {
     if (!cfg.mapImage) {
         await domUtils.showModal('alert', 'Error', 'Load a map image BEFORE loading JSON data.');
         event.target.value = ''; // Clear input
         return;
     }
    const file = event.target.files?.[0];
    if (file) {
        await dataUtils.handleJsonLoad(file);
    }
     // Clear input value after attempting load, regardless of success/failure
     event.target.value = '';
}

// --- Canvas Interaction Events ---
export function handleCanvasMouseDown(event) {
    // Ignore if not left click, modal is open, animating, or essential elements missing
    if (event.button !== 0 || cfg.currentModalResolve || cfg.isPanningAnimationActive || !cfg.mapImage || !cfg.inlineEditPanel || !cfg.canvas) return;

    // Focus the canvas when interacting with it (allows keyboard events like Delete)
    cfg.canvas.focus();

    const canvasPos = canvasUtils.getCanvasMousePos(event);
    if (!canvasPos) return;

    const mapPos = canvasUtils.canvasToMapCoords(canvasPos.x, canvasPos.y);
    if (!mapPos) return; // Check if mapPos is valid

    const clickedNationIndex = canvasUtils.getNationAtPos(mapPos);
    const isClickOnEditor = cfg.inlineEditPanel.style.display === 'block' && cfg.inlineEditPanel.contains(event.target);

    // Close inline editor if clicking outside it AND not clicking the nation being edited
    if (cfg.inlineEditPanel.style.display === 'block' && !isClickOnEditor && clickedNationIndex !== cfg.nationIndexBeingEdited) {
        domUtils.closeInlineEditor();
    }

    // Ignore clicks originating inside the editor panel itself
    if (isClickOnEditor) return;

    cfg.setMouseDownPos(canvasPos); // Store position where mouse went down

    if (clickedNationIndex !== null) {
        // --- Clicked on an existing nation: Initiate potential drag ---
        if (cfg.selectedNationIndex !== clickedNationIndex) {
            cfg.setSelectedNationIndex(clickedNationIndex);
            domUtils.updateNationList(); // Update list selection highlight
            domUtils.updateInfoPanel(clickedNationIndex);
            canvasUtils.redrawCanvas(); // Redraw for selection highlight change
        }
        cfg.setDraggingNation(true);
        cfg.setPotentialPan(false); // Not a potential pan

        // Calculate offset from nation center to click point (in map coords)
        const nationCoords = cfg.nations[clickedNationIndex].coordinates;
        cfg.setDragNationOffset({
            x: mapPos.x - nationCoords[0],
            y: mapPos.y - nationCoords[1]
        });

        domUtils.updateStatus(`Dragging ${cfg.nations[clickedNationIndex].name}...`);
        domUtils.updateCursor();

    } else {
        // --- Clicked on empty space: Initiate potential pan ---
        // Deselect only if a nation *was* selected
        if (cfg.selectedNationIndex !== null) {
            cfg.setSelectedNationIndex(null);
            domUtils.updateNationList();
            domUtils.updateInfoPanel(null); // Clear info panel
            canvasUtils.redrawCanvas(); // Redraw to remove selection highlight
        }
        cfg.setPotentialPan(true);
        cfg.setDraggingNation(false);
        cfg.setPanStartOffset({ x: cfg.offsetX, y: cfg.offsetY }); // Store current offset for panning calc

        domUtils.updateCursor();
    }
}

export function handleCanvasMouseMove(event) {
    // Ignore if modal is open, animating, or no map
    if (cfg.currentModalResolve || cfg.isPanningAnimationActive || !cfg.mapImage) return;

    const canvasPos = canvasUtils.getCanvasMousePos(event);
    if (!canvasPos) {
        domUtils.updateCoordinateDisplay(null); // Clear coordinates if mouse leaves canvas
        return;
    }

    const mapPos = canvasUtils.canvasToMapCoords(canvasPos.x, canvasPos.y);
    if (!mapPos) return;
    domUtils.updateCoordinateDisplay(mapPos); // Update coordinates display

    let needsRedraw = false;
    let needsCursorUpdate = false;

    // --- Handle Panning ---
    if (cfg.potentialPan) {
        // Check if mouse moved enough to transition from potential pan to actual panning
        const dx = canvasPos.x - cfg.mouseDownPos.x;
        const dy = canvasPos.y - cfg.mouseDownPos.y;
        if (Math.hypot(dx, dy) > cfg.panThreshold) {
            cfg.setIsPanning(true);
            cfg.setPotentialPan(false); // It's panning now
            needsCursorUpdate = true;
            // If hovering started during potential pan, clear it now as we are panning
            if (cfg.hoveredNationIndex !== null) {
                cfg.setHoveredNationIndex(null);
                needsRedraw = true;
            }
             domUtils.updateStatus("Panning map..."); // Indicate panning started
        }
    }

    if (cfg.isPanning) {
        // Calculate offset change based on mouse movement since mousedown
        const dxCanvas = canvasPos.x - cfg.mouseDownPos.x;
        const dyCanvas = canvasPos.y - cfg.mouseDownPos.y;
        // New offset is starting offset minus scaled mouse delta
        cfg.setOffsetX(cfg.panStartOffset.x - (dxCanvas / cfg.zoom));
        cfg.setOffsetY(cfg.panStartOffset.y - (dyCanvas / cfg.zoom));

        canvasUtils.clampOffset(); // Keep map within reasonable bounds during pan
        needsRedraw = true;
    }
    // --- Handle Dragging Nation ---
    else if (cfg.draggingNation && cfg.selectedNationIndex !== null) {
        const nation = cfg.nations[cfg.selectedNationIndex];
        if (!nation) { // Safety check if nation disappears mid-drag
            cfg.setDraggingNation(false);
            needsCursorUpdate = true;
            domUtils.updateStatus("Drag cancelled (nation data lost).");
            return;
        }
        // Update nation coordinates based on current mouse map position minus the initial drag offset
        nation.coordinates[0] = mapPos.x - cfg.dragNationOffset.x;
        nation.coordinates[1] = mapPos.y - cfg.dragNationOffset.y;
        needsRedraw = true;
    }
    // --- Handle Hovering (only if not panning, potentially panning, or dragging) ---
    else if (!cfg.potentialPan && !cfg.isPanning && !cfg.draggingNation) {
        const currentHover = canvasUtils.getNationAtPos(mapPos);
        if (currentHover !== cfg.hoveredNationIndex) {
            cfg.setHoveredNationIndex(currentHover);
            needsCursorUpdate = true;
            needsRedraw = true; // Redraw needed to show/hide hover highlight
        }
    }

    // Update cursor and redraw canvas if needed
    if (needsCursorUpdate) {
        domUtils.updateCursor();
    }
    if (needsRedraw) {
        canvasUtils.redrawCanvas();
    }
}

export async function handleCanvasMouseUp(event) {
    // Ignore if not left click, modal is open, animating, or no map
    if (event.button !== 0 || cfg.currentModalResolve || cfg.isPanningAnimationActive || !cfg.mapImage) return;

    // --- Handle Potential Pan -> Add Nation OR Finalize Short Pan ---
    if (cfg.potentialPan) {
        cfg.setPotentialPan(false); // Reset flag first

        // Check if mouse moved significantly - if not, treat as a click to add
        const canvasPos = canvasUtils.getCanvasMousePos(event);
        if (canvasPos) {
            const dx = canvasPos.x - cfg.mouseDownPos.x;
            const dy = canvasPos.y - cfg.mouseDownPos.y;
             if (Math.hypot(dx, dy) <= cfg.panThreshold) {
                  // Mouse didn't move much: Treat as click to ADD nation
                  // Use mousedown position for accuracy where the click *started*
                  const mapPosAdd = canvasUtils.canvasToMapCoords(cfg.mouseDownPos.x, cfg.mouseDownPos.y);
                  if (mapPosAdd) {
                      // Call add nation logic (awaits user input via modals)
                      await nationUtils.handleAddNation(mapPosAdd);
                  } else {
                       domUtils.updateStatus("Could not determine map position for adding.", true);
                  }
             } else {
                 // Mouse moved beyond threshold: Treat as a completed short pan
                 // Panning state was handled in mousemove, offset is already updated.
                 domUtils.updateStatus("Pan finished.");
             }
        } else {
            // Could not get canvas pos on mouseup? Unlikely but handle.
            domUtils.updateStatus("Action cancelled (position error).");
        }

        // Reset potential pan related states regardless of outcome
        cfg.setIsPanning(false); // Ensure panning is also false if it was a short pan
        domUtils.updateCursor();
        return; // Exit, action determined (add or short pan)
    }

    // --- Handle End of Actual Panning ---
    if (cfg.isPanning) {
        cfg.setIsPanning(false);
        domUtils.updateCursor();
        domUtils.updateStatus("Pan finished.");
    }

    // --- Handle End of Dragging Nation ---
    if (cfg.draggingNation) {
        cfg.setDraggingNation(false);
        domUtils.updateCursor();
        if (cfg.selectedNationIndex !== null && cfg.nations[cfg.selectedNationIndex]) {
            const nation = cfg.nations[cfg.selectedNationIndex];
            domUtils.updateStatus(`Placed ${nation.name}.`);
            domUtils.updateNationList(); // Update list with final coordinates
            canvasUtils.redrawCanvas(); // Final redraw at new position
        } else {
            domUtils.updateStatus("Drag finished."); // Fallback status
        }
    }
}

export function handleCanvasMouseOut(event) {
     // Ignore if modal is open or animating
     if (cfg.currentModalResolve || cfg.isPanningAnimationActive) return;

     domUtils.updateCoordinateDisplay(null); // Clear coordinate display

     let needsCursorUpdate = false;
     let needsRedraw = false;
     let statusUpdate = null;

     // If mouse leaves canvas during potential pan, cancel it silently
     if (cfg.potentialPan) {
         cfg.setPotentialPan(false);
         needsCursorUpdate = true;
     }
     // If mouse leaves canvas during panning, stop panning and update status
     if (cfg.isPanning) {
         cfg.setIsPanning(false);
         needsCursorUpdate = true;
         statusUpdate = "Pan cancelled (mouse left canvas).";
     }
     // If mouse leaves canvas during drag, stop dragging. Nation stays where it was last seen.
     if (cfg.draggingNation) {
         const nationName = cfg.nations[cfg.selectedNationIndex]?.name || "nation";
         cfg.setDraggingNation(false);
         needsCursorUpdate = true;
         statusUpdate = `Drag of ${nationName} cancelled (mouse left canvas).`;
         needsRedraw = true;
         domUtils.updateNationList(); // Update list with last known coords
     }
     // If mouse leaves canvas while hovering, clear hover state
     if (cfg.hoveredNationIndex !== null) {
         cfg.setHoveredNationIndex(null);
         needsCursorUpdate = true;
         needsRedraw = true;
     }

     if (needsCursorUpdate) {
         domUtils.updateCursor();
     }
     if (needsRedraw) {
         canvasUtils.redrawCanvas();
     }
     if (statusUpdate) {
         domUtils.updateStatus(statusUpdate);
     }
}

export function handleCanvasContextMenu(event) {
    event.preventDefault(); // Prevent browser context menu on the canvas
}

export function handleCanvasWheel(event) {
     if (!cfg.mapImage || cfg.isPanningAnimationActive || !cfg.canvas) return;

     event.preventDefault(); // Prevent page scrolling

     const canvasPos = canvasUtils.getCanvasMousePos(event);
     if (!canvasPos) return; // Ignore if mouse is not over canvas

     // Determine zoom factor based on wheel delta
     // Normalize deltaY across browsers (usually +/- 100, but can vary)
     const delta = Math.max(-1, Math.min(1, (-event.deltaY || -event.detail || event.wheelDelta)));
     // Use the configured sensitivity
     const factor = 1 + delta * (cfg.zoomSensitivity * 100); // Sensitivity applied here

     // --- Zoom towards mouse cursor ---
     // Get map coordinates under cursor *before* zoom
     const mapPosBeforeZoom = canvasUtils.canvasToMapCoords(canvasPos.x, canvasPos.y);
     if (!mapPosBeforeZoom) return;

     // Calculate new zoom level, clamped
     const newZoom = Math.max(cfg.minZoom, Math.min(cfg.maxZoom, cfg.zoom * factor));

     // If zoom didn't change (e.g., at boundaries), do nothing
     if (newZoom === cfg.zoom) return;

     // Update zoom state
     cfg.setZoom(newZoom);

     // Calculate the new offset to keep the *same map point* under the mouse cursor
     cfg.setOffsetX(mapPosBeforeZoom.x - (canvasPos.x / cfg.zoom));
     cfg.setOffsetY(mapPosBeforeZoom.y - (canvasPos.y / cfg.zoom));

     // Apply changes
     canvasUtils.clampOffset(); // Ensure offsets are valid
     domUtils.updateZoomDisplay(); // Update UI
     canvasUtils.redrawCanvas(); // Redraw with new zoom/offset

     // Update hover state based on potentially new position under cursor after zoom
     const currentMapPos = canvasUtils.canvasToMapCoords(canvasPos.x, canvasPos.y);
     if (currentMapPos) {
         cfg.setHoveredNationIndex(canvasUtils.getNationAtPos(currentMapPos));
         domUtils.updateCursor(); // Update cursor based on hover state
     }
}

// --- Keyboard Events ---
export async function handleDocumentKeyDown(event) {
    const activeElement = document.activeElement;
    const isInputFocused = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable;
    // Specifically check if the focused element is one of the inline editor inputs
    const isInlineEditorInputFocused = cfg.inlineEditPanel?.style.display === 'block' &&
                                       (activeElement === cfg.inlineEditName || activeElement === cfg.inlineEditStrength);

    // --- Always handle Escape/Enter for Inline Editor if it's focused ---
    if (isInlineEditorInputFocused) {
        if (event.key === 'Escape') {
             event.preventDefault();
             domUtils.closeInlineEditor();
             return; // Handled
         } else if (event.key === 'Enter') {
             event.preventDefault();
             await nationUtils.saveInlineEdit(); // Await the save operation
             return; // Handled
         }
         // Allow other keys (like text input) if inline editor is focused
         return;
    }

    // --- Ignore most other shortcuts if a modal is open, a general input is focused, or animating ---
    // Check if FLAG EDITOR MODAL is open (adapt ID if needed)
    const isFlagEditorOpen = cfg.flagEditorModalContainer?.style.display === 'flex'; // Check container visibility

    if (cfg.currentModalResolve || cfg.isPanningAnimationActive || isInputFocused || isFlagEditorOpen) {
         // NEW: Added check for isFlagEditorOpen
        return; // Ignore other keys in these states
    }

    // --- General keyboard shortcuts (no modal, no animation, no input focus, no flag editor) ---
    // Check if focus is on the body or canvas (or nothing specific) before acting
     if (activeElement !== document.body && activeElement !== cfg.canvas && activeElement !== null) {
         return; // Don't steal keys if focus is elsewhere unexpectedly
     }


    switch (event.key) {
        case 's':
        case 'S':
            if (!event.ctrlKey && !event.metaKey) { // Avoid conflict with browser save
                event.preventDefault();
                if (cfg.saveButton && !cfg.saveButton.disabled) { // Check if save is enabled
                    await dataUtils.saveProjectAsZip();
                } else {
                    domUtils.updateStatus("Save unavailable (load map/add nations first).");
                }
            }
            break;
        case 'Delete':
        case 'Backspace':
            // Delete selected nation if one is selected
            if (cfg.selectedNationIndex !== null) {
                event.preventDefault();
                // Call handleDeleteNation without event, it will use selectedNationIndex
                await nationUtils.handleDeleteNation(null); // Pass null as event
            }
            break;
        case 'Escape':
             event.preventDefault();
             if (cfg.isSettingsVisible && cfg.settingsPanel?.style.display !== 'none') {
                 // Hide settings panel if visible
                 handleSettingsToggle(); // Use the toggle handler
             } else if (cfg.selectedNationIndex !== null) {
                 // Deselect nation if one is selected and settings aren't open
                 cfg.setSelectedNationIndex(null);
                 domUtils.updateStatus("Nation deselected.");
                 canvasUtils.redrawCanvas();
                 domUtils.updateNationList();
                 domUtils.updateInfoPanel(null);
             }
             // Inline editor Escape is handled earlier when focused
             break;
        case '+': // Numpad + or regular + (might need Shift)
        case '=': // Regular = (often shares key with +)
            event.preventDefault();
            canvasUtils.changeZoom(1.25); // Zoom In (Adjust factor as needed)
            break;
        case '-': // Numpad - or regular -
            event.preventDefault();
            canvasUtils.changeZoom(1 / 1.25); // Zoom Out (Adjust factor as needed)
            break;
        case '0': // Numpad 0 or regular 0
            event.preventDefault();
            canvasUtils.resetView(); // Reset Zoom and Pan
            break;
    }
}

// --- Settings Panel Events ---
export function handleSettingsToggle() {
    if (!cfg.settingsPanel) return;
     cfg.setIsSettingsVisible(!cfg.isSettingsVisible);
     cfg.settingsPanel.style.display = cfg.isSettingsVisible ? 'block' : 'none';
}

// --- Flag Upload Events ---
export async function handleFlagUploadChange(event) {
    const file = event.target.files?.[0];
    if (!file) return; // No file selected

    // Ensure a nation is selected
    if (cfg.selectedNationIndex === null || cfg.selectedNationIndex < 0 || cfg.selectedNationIndex >= cfg.nations.length) {
        await domUtils.showModal('alert', 'Error', 'Select a nation before uploading a flag.');
        event.target.value = ''; // Clear input
        return;
    }

    const nation = cfg.nations[cfg.selectedNationIndex];
    if (!nation) {
        console.error("Selected nation index invalid during flag upload.");
        event.target.value = '';
        return;
    }

    // Basic type check (more robust check happens in processAndAssignFlag)
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const fileMimeType = file.type;
    const isSvg = fileMimeType === 'image/svg+xml' || (!fileMimeType && fileExt === 'svg');
    let isRasterImage = fileMimeType?.startsWith('image/') && !isSvg;
     if (!fileMimeType && !isSvg && ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExt)) {
         isRasterImage = true;
     }

    if (!isSvg && !isRasterImage) {
         await domUtils.showModal('alert', 'Error', 'Invalid file type. Please select PNG, SVG, JPG, GIF, or WEBP.');
         event.target.value = '';
         return;
    }

    // Proceed with processing
    domUtils.updateStatus(`Processing flag ${file.name} for ${nation.name}...`);
    try {
        // Use the central processing function
        await dataUtils.processAndAssignFlag(file, nation);
        // Update UI to show the newly processed flag
        domUtils.updateInfoPanel(cfg.selectedNationIndex);
        canvasUtils.redrawCanvas();
        domUtils.updateStatus(`Flag set for ${nation.name}.`);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown flag processing error.";
        await domUtils.showModal('alert', 'Flag Processing Error', `Could not process flag: ${errorMsg}`);
        domUtils.updateStatus(`Error processing flag ${file.name}: ${errorMsg}`, true);
        // Update UI to reflect failure (e.g., remove preview if it failed)
        domUtils.updateInfoPanel(cfg.selectedNationIndex);
        canvasUtils.redrawCanvas(); // Redraw in case visual state needs reset
    } finally {
        // Clear the file input regardless of success or failure
        event.target.value = '';
    }
}

export async function handleFlagRemoveClick() {
     if (cfg.selectedNationIndex === null || cfg.selectedNationIndex < 0 || cfg.selectedNationIndex >= cfg.nations.length) return;

     const nation = cfg.nations[cfg.selectedNationIndex];
     // Check if there's actually a flag (by name or image) to remove
     if (!nation || (!nation.flag && !nation.flagImage && !nation.flagData)) { // Check flagData too
         domUtils.updateStatus("No flag to remove for selected nation.");
         return;
     }

     const confirmRemove = await domUtils.showModal('confirm', 'Remove Flag', `Remove flag from "${nation.name}"?`, { confirmText: 'Remove', denyText: 'Cancel' });

     if (confirmRemove) {
         // Clear all flag-related fields on the nation object
         nation.flag = null;
         nation.flagImage = null; // The rendered image object
         nation.flagData = null; // The original data (text or dataURL)
         nation.flagDataType = null; // 'svg', 'png', etc.
         nation.flagWidth = null;
         nation.flagHeight = null;

         domUtils.updateStatus(`Flag removed from ${nation.name}.`);
         domUtils.updateInfoPanel(cfg.selectedNationIndex); // Update panel display
         canvasUtils.redrawCanvas(); // Remove flag from map view
     }
}

// --- Inline Editor Events ---
export function handleInlineEditCancel() {
     domUtils.closeInlineEditor();
}

export async function handleInlineEditSave() {
     // Delegate saving logic (including validation) to nationUtils
     await nationUtils.saveInlineEdit();
}

// --- Resize Observer Callback ---
export function handleResize() {
     if (!cfg.canvas || !cfg.canvasContainer) return;

     // Update canvas dimensions based on its container
     canvasUtils.setInitialCanvasSize(); // Re-calculates size based on container

     // Adjust offset/view if needed (clampOffset is often sufficient)
     canvasUtils.clampOffset(); // Ensure offset is valid for new size

     // Redraw the canvas with the new size (setInitialCanvasSize might already redraw)
     canvasUtils.redrawCanvas();
}

// --- NEW: Flag Editor Button Event ---
export async function handleFlagEditorClick() {
    if (cfg.selectedNationIndex === null || cfg.selectedNationIndex < 0 || cfg.selectedNationIndex >= cfg.nations.length) {
         console.warn("Flag Editor button clicked, but no nation selected.");
         return;
    }
    const nation = cfg.nations[cfg.selectedNationIndex];
    if (!nation) {
         console.error("Selected nation index invalid during Flag Editor click.");
         return;
    }

    // Check if flag data exists to edit
    if (!nation.flagData || !nation.flagDataType) {
        await domUtils.showModal('alert', 'Cannot Edit Flag', 'No original flag data found for the selected nation. Upload a flag first.');
        return;
    }

    domUtils.updateStatus(`Opening flag editor for ${nation.name}...`);

    try {
        // Call the function from flagEditor.js, passing necessary data
        const standardizedFlagDataUrl = await openFlagEditor(
            nation.flagData,
            nation.flagDataType,
            nation.flagWidth,
            nation.flagHeight
        );

        if (standardizedFlagDataUrl) {
            // Standardized flag data (Data URL) returned from the editor
            domUtils.updateStatus(`Applying standardized flag for ${nation.name}...`);

            // Create a new Image object from the standardized data URL
            const newFlagImage = new Image();
            newFlagImage.onload = () => {
                 // Update the nation's flagImage (used for drawing)
                 nation.flagImage = newFlagImage;
                 // NOTE: We do NOT overwrite nation.flagData, nation.flagDataType,
                 // nation.flagWidth, nation.flagHeight here. Those store the ORIGINAL
                 // uploaded/loaded flag details for saving purposes.
                 // The editor only affects the display version (nation.flagImage).

                 domUtils.updateStatus(`Standardized flag applied for ${nation.name}.`);
                 domUtils.updateInfoPanel(cfg.selectedNationIndex); // Update preview in info panel
                 canvasUtils.redrawCanvas(); // Update map display
            };
            newFlagImage.onerror = async () => {
                console.error(`Failed to load the standardized flag Data URL into an Image object for ${nation.name}.`);
                 await domUtils.showModal('alert', 'Error', 'Failed to apply the edited flag.');
                 domUtils.updateStatus(`Error applying standardized flag for ${nation.name}.`, true);
                 // Revert UI? Maybe just leave the old preview. Info panel will update.
                 domUtils.updateInfoPanel(cfg.selectedNationIndex);
            };
            newFlagImage.src = standardizedFlagDataUrl;

        } else {
            // Editor was cancelled or returned null
            domUtils.updateStatus(`Flag editing cancelled for ${nation.name}.`);
        }

    } catch (error) {
         console.error("Error during flag editor process:", error);
         await domUtils.showModal('alert', 'Flag Editor Error', `An error occurred: ${error.message}`);
         domUtils.updateStatus(`Error opening/using flag editor: ${error.message}`, true);
    }
}