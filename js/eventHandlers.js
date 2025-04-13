// --- START OF FILE js/eventHandlers.js ---
import * as cfg from './config.js';
import * as domUtils from './domUtils.js';
import * as canvasUtils from './canvasUtils.js';
import * as mapUtils from './mapUtils.js';
import * as dataUtils from './dataUtils.js';
import * as nationUtils from './nationUtils.js';

// --- Map Loading Events ---
export async function handleMapLoadClick(event) {
    event.preventDefault(); // Prevent label triggering input immediately
    // Optional: Show a reminder/confirmation modal if desired
    // const userConfirmed = await domUtils.showModal('alert', 'Map Loading', 'Remember to use colorized maps!');
    // if (userConfirmed) {
         cfg.imageInput.value = ''; // Clear previous selection
         cfg.imageInput.click(); // Programmatically click the hidden input
    // }
}

export async function handleMapFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        await mapUtils.handleMapImageLoad(file);
    }
    // No need to clear event.target.value here, handleMapImageLoad should handle its state
}

// --- JSON Loading Events ---
export async function handleJsonFileSelect(event) {
     if (!cfg.mapImage) {
         await domUtils.showModal('alert', 'Error', 'Load a map image BEFORE loading JSON.');
         event.target.value = ''; // Clear input
         return;
     }
    const file = event.target.files[0];
    if (file) {
        await dataUtils.handleJsonLoad(file);
    }
     event.target.value = ''; // Clear input after processing attempt
}

// --- Canvas Interaction Events ---
export function handleCanvasMouseDown(event) {
    if (!cfg.mapImage || event.button !== 0 || cfg.currentModalResolve || cfg.isPanningAnimationActive) return;

    const canvasPos = canvasUtils.getCanvasMousePos(event);
    if (!canvasPos) return;

    const mapPos = canvasUtils.canvasToMapCoords(canvasPos.x, canvasPos.y);
    const clickedNationIndex = canvasUtils.getNationAtPos(mapPos);
    const isClickOnEditor = cfg.inlineEditPanel.contains(event.target); // Check if click is inside editor

    // Close inline editor if clicking outside it AND not clicking the nation being edited
    if (cfg.inlineEditPanel.style.display === 'block' && !isClickOnEditor && clickedNationIndex !== cfg.nationIndexBeingEdited) {
        domUtils.closeInlineEditor();
    }

    // Ignore clicks inside the editor panel itself
    if (isClickOnEditor) return;

    cfg.setMouseDownPos(canvasPos); // Store position where mouse went down

    if (clickedNationIndex !== null) {
        // Clicked on an existing nation: Start dragging
        cfg.setSelectedNationIndex(clickedNationIndex);
        cfg.setDraggingNation(true);
        cfg.setPotentialPan(false); // Not a potential pan anymore

        // Calculate offset from nation center to click point (in map coords)
        const nationCoords = cfg.nations[clickedNationIndex].coordinates;
        cfg.setDragNationOffset({
            x: mapPos.x - nationCoords[0],
            y: mapPos.y - nationCoords[1]
        });

        domUtils.updateStatus(`Dragging ${cfg.nations[clickedNationIndex].name}...`);
        domUtils.updateCursor();
        // domUtils.closeInlineEditor(); // Already closed above if needed
        domUtils.updateNationList();
        canvasUtils.redrawCanvas();
        domUtils.updateInfoPanel(clickedNationIndex);

    } else {
        // Clicked on empty space: Start potential pan
        cfg.setSelectedNationIndex(null); // Deselect any nation
        cfg.setPotentialPan(true);
        cfg.setDraggingNation(false);
        cfg.setPanStartOffset({ x: cfg.offsetX, y: cfg.offsetY }); // Store current offset

        domUtils.updateCursor();
        domUtils.updateNationList(); // Reflect deselection
        canvasUtils.redrawCanvas();
        domUtils.updateInfoPanel(null); // Clear info panel
    }
}

export function handleCanvasMouseMove(event) {
    if (!cfg.mapImage || cfg.currentModalResolve || cfg.isPanningAnimationActive) return;

    const canvasPos = canvasUtils.getCanvasMousePos(event);
    if (!canvasPos) {
        domUtils.updateCoordinateDisplay(null); // Clear coordinates if mouse leaves canvas
        return;
    }

    const mapPos = canvasUtils.canvasToMapCoords(canvasPos.x, canvasPos.y);
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
            // If hovering started during potential pan, clear it now
            if (cfg.hoveredNationIndex !== null) {
                cfg.setHoveredNationIndex(null);
                needsRedraw = true;
            }
        }
    }

    if (cfg.isPanning) {
        // Calculate offset change based on mouse movement since mousedown
        const dxCanvas = canvasPos.x - cfg.mouseDownPos.x;
        const dyCanvas = canvasPos.y - cfg.mouseDownPos.y;
        // New offset is starting offset minus scaled mouse delta
        cfg.setOffsetX(cfg.panStartOffset.x - (dxCanvas / cfg.zoom));
        cfg.setOffsetY(cfg.panStartOffset.y - (dyCanvas / cfg.zoom));

        canvasUtils.clampOffset(); // Keep map within reasonable bounds
        needsRedraw = true;
    }
    // --- Handle Dragging Nation ---
    else if (cfg.draggingNation && cfg.selectedNationIndex !== null) {
        const nation = cfg.nations[cfg.selectedNationIndex];
        if (!nation) { // Safety check if nation disappears mid-drag
            cfg.setDraggingNation(false);
            needsCursorUpdate = true;
            return;
        }
        // Update nation coordinates based on mouse position minus drag offset
        nation.coordinates[0] = mapPos.x - cfg.dragNationOffset.x;
        nation.coordinates[1] = mapPos.y - cfg.dragNationOffset.y;
        needsRedraw = true;
        // No need to update nation list while dragging, only on mouseup
    }
    // --- Handle Hovering ---
    else if (!cfg.potentialPan && !cfg.isPanning && !cfg.draggingNation) {
        // Only check hover if not panning, potentially panning, or dragging
        const currentHover = canvasUtils.getNationAtPos(mapPos);
        if (currentHover !== cfg.hoveredNationIndex) {
            cfg.setHoveredNationIndex(currentHover);
            needsCursorUpdate = true;
            needsRedraw = true; // Redraw needed to show/hide hover highlight
        }
    }

    // Update cursor if state changed
    if (needsCursorUpdate) {
        domUtils.updateCursor();
    }
    // Redraw canvas if needed
    if (needsRedraw) {
        canvasUtils.redrawCanvas();
    }
}

export async function handleCanvasMouseUp(event) {
    if (!cfg.mapImage || event.button !== 0 || cfg.currentModalResolve || cfg.isPanningAnimationActive) return;

    // --- Handle Potential Pan -> Add Nation ---
    if (cfg.potentialPan) {
        cfg.setPotentialPan(false); // Reset flag first
        domUtils.updateCursor(); // Update cursor immediately

        // Check if mouse moved significantly - if so, treat as a small pan, not add
        const canvasPos = canvasUtils.getCanvasMousePos(event);
        if (canvasPos) {
            const dx = canvasPos.x - cfg.mouseDownPos.x;
            const dy = canvasPos.y - cfg.mouseDownPos.y;
             if (Math.hypot(dx, dy) <= cfg.panThreshold) {
                  // Mouse didn't move much, treat as a click to add
                  const mapPos = canvasUtils.canvasToMapCoords(cfg.mouseDownPos.x, cfg.mouseDownPos.y); // Use mousedown pos
                  await nationUtils.handleAddNation(mapPos); // Call add nation logic
                  // State (selection etc) is handled within handleAddNation
             } else {
                 // Mouse moved too much, likely intended as a small pan.
                 // Panning state was handled in mousemove, just reset potentialPan.
                 domUtils.updateStatus("Pan finished."); // Or provide no status update
             }
        } else {
            // Could not get canvas pos on mouseup? Unlikely but handle.
            domUtils.updateStatus("Action cancelled (position error).");
        }

        // Reset potential pan related states
        cfg.setPotentialPan(false);
        cfg.setIsPanning(false); // Ensure panning is also false
        domUtils.updateCursor();
        return; // Don't process other mouseup logic
    }

    // --- Handle End of Panning ---
    if (cfg.isPanning) {
        cfg.setIsPanning(false);
        domUtils.updateCursor();
        domUtils.updateStatus("Pan finished."); // Optional status update
        // No redraw needed here, last mousemove handled it
    }

    // --- Handle End of Dragging Nation ---
    if (cfg.draggingNation) {
        cfg.setDraggingNation(false);
        domUtils.updateCursor();
        if (cfg.selectedNationIndex !== null && cfg.nations[cfg.selectedNationIndex]) {
            domUtils.updateStatus(`Placed ${cfg.nations[cfg.selectedNationIndex].name}.`);
            domUtils.updateNationList(); // Update list with new coords
            canvasUtils.redrawCanvas(); // Final redraw at new position
        } else {
            domUtils.updateStatus("Drag finished.");
        }
    }
}

export function handleCanvasMouseOut(event) {
     if (!cfg.mapImage || cfg.currentModalResolve || cfg.isPanningAnimationActive) return;

     domUtils.updateCoordinateDisplay(null); // Clear coordinate display
     let needsUpdate = false;
     let needsRedraw = false;

     // If mouse leaves canvas during potential pan, cancel it
     if (cfg.potentialPan) {
         cfg.setPotentialPan(false);
         needsUpdate = true;
     }
     // If mouse leaves canvas during panning, stop panning
     if (cfg.isPanning) {
         cfg.setIsPanning(false);
         needsUpdate = true;
         domUtils.updateStatus("Pan cancelled (mouse left canvas).");
     }
     // If mouse leaves canvas during drag, cancel drag and potentially revert?
     // For now, just stop dragging; the nation stays where it was last seen.
     if (cfg.draggingNation) {
         cfg.setDraggingNation(false);
         needsUpdate = true;
         domUtils.updateStatus("Drag cancelled (mouse left canvas).");
         // Redraw needed to remove drag cursor/styles if any
         needsRedraw = true;
         domUtils.updateNationList(); // Update list with last known coords
     }
     // If mouse leaves canvas while hovering, clear hover state
     if (cfg.hoveredNationIndex !== null) {
         cfg.setHoveredNationIndex(null);
         needsUpdate = true; // Cursor needs update
         needsRedraw = true; // Redraw needed to remove hover highlight
     }

     if (needsUpdate) {
         domUtils.updateCursor();
     }
     if (needsRedraw) {
         canvasUtils.redrawCanvas();
     }
}

export function handleCanvasContextMenu(event) {
    event.preventDefault(); // Prevent browser context menu
}

export function handleCanvasWheel(event) {
     if (!cfg.mapImage || cfg.isPanningAnimationActive) return;

     event.preventDefault(); // Prevent page scrolling

     const canvasPos = canvasUtils.getCanvasMousePos(event);
     if (!canvasPos) return; // Ignore if mouse is not over canvas

     // Calculate zoom factor based on wheel delta
     // Positive deltaY usually means scrolling down/away (zoom out)
     // Negative deltaY usually means scrolling up/towards (zoom in)
     const delta = -event.deltaY * cfg.zoomSensitivity;
     const factor = 1 + delta;

     // --- Zoom towards mouse cursor ---
     // Get map coordinates under cursor *before* zoom
     const mapPosBeforeZoom = canvasUtils.canvasToMapCoords(canvasPos.x, canvasPos.y);

     // Calculate new zoom level, clamped
     const newZoom = Math.max(cfg.minZoom, Math.min(cfg.maxZoom, cfg.zoom * factor));

     // If zoom didn't change, do nothing
     if (newZoom === cfg.zoom) return;

     // Update zoom state
     cfg.setZoom(newZoom);

     // Calculate the new offset to keep the *same map point* under the mouse cursor
     cfg.setOffsetX(mapPosBeforeZoom.x - (canvasPos.x / cfg.zoom));
     cfg.setOffsetY(mapPosBeforeZoom.y - (canvasPos.y / cfg.zoom));


     canvasUtils.clampOffset(); // Ensure offsets are valid
     domUtils.updateZoomDisplay(); // Update UI
     canvasUtils.redrawCanvas(); // Redraw with new zoom/offset

     // Update hover state based on potentially new position under cursor
     // Recalculate map position under cursor *after* zoom (should be same as mapPosBeforeZoom if math is right)
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
    const isInlineEditorInputFocused = cfg.inlineEditPanel.style.display === 'block' &&
                                       (activeElement === cfg.inlineEditName || activeElement === cfg.inlineEditStrength);

    // Ignore most keyboard shortcuts if a modal is open, a general input is focused, or during animation
    if (cfg.currentModalResolve || cfg.isPanningAnimationActive || (isInputFocused && !isInlineEditorInputFocused)) {
        // Special handling for inline editor Escape/Enter even when focused
         if (event.key === 'Escape' && isInlineEditorInputFocused) {
             event.preventDefault();
             domUtils.closeInlineEditor();
         } else if (event.key === 'Enter' && isInlineEditorInputFocused) {
             event.preventDefault();
             await nationUtils.saveInlineEdit(); // Await the save operation
         }
        return; // Ignore other keys in these states
    }

    // Handle shortcuts when canvas/body likely has focus

    // Inline Editor specific keys (already handled above if focused, but check again)
    if (isInlineEditorInputFocused) {
        if (event.key === 'Escape') {
             event.preventDefault();
             domUtils.closeInlineEditor();
        } else if (event.key === 'Enter') {
             event.preventDefault();
             await nationUtils.saveInlineEdit();
        }
        return; // Don't process general keys if inline editor had focus
    }

    // General key shortcuts
    switch (event.key) {
        case 's':
        case 'S':
            event.preventDefault();
            await dataUtils.saveProjectAsZip();
            break;
        case 'Delete':
        case 'Backspace':
            if (cfg.selectedNationIndex !== null) {
                event.preventDefault();
                // Call handleDeleteNation without event, it will use selectedNationIndex
                await nationUtils.handleDeleteNation(null);
            }
            break;
        case 'Escape':
             event.preventDefault();
             if (cfg.isSettingsVisible && cfg.settingsPanel.style.display !== 'none') {
                 // Hide settings panel
                 cfg.setIsSettingsVisible(false);
                 cfg.settingsPanel.style.display = 'none';
             } else if (cfg.inlineEditPanel.style.display === 'block') {
                  // Close inline editor (should have been caught earlier if focused, but safe fallback)
                  domUtils.closeInlineEditor();
             } else if (cfg.selectedNationIndex !== null) {
                 // Deselect nation
                 cfg.setSelectedNationIndex(null);
                 domUtils.updateStatus("Deselected.");
                 canvasUtils.redrawCanvas();
                 domUtils.updateNationList();
                 domUtils.updateInfoPanel(null);
             }
             break;
        case '+': // Numpad + or regular + (usually needs Shift)
        case '=': // Regular = (often shares key with +)
            event.preventDefault();
            canvasUtils.changeZoom(1.2); // Zoom In
            break;
        case '-': // Numpad - or regular -
        case '_': // Regular _ (usually needs Shift with -)
            event.preventDefault();
            canvasUtils.changeZoom(1 / 1.2); // Zoom Out
            break;
        case '0':
            event.preventDefault();
            canvasUtils.resetView(); // Reset Zoom and Pan
            break;
        // Add more keyboard shortcuts here if needed
    }
}

// --- Settings Panel Events ---
export function handleSettingsToggle() {
     cfg.setIsSettingsVisible(!cfg.isSettingsVisible);
     cfg.settingsPanel.style.display = cfg.isSettingsVisible ? 'block' : 'none';
}

// --- Flag Upload Events ---
export async function handleFlagUploadChange(event) {
    if (cfg.selectedNationIndex === null || cfg.selectedNationIndex < 0 || cfg.selectedNationIndex >= cfg.nations.length) {
        await domUtils.showModal('alert', 'Error', 'Select a nation before uploading a flag.');
        event.target.value = ''; // Clear input
        return;
    }
    const file = event.target.files[0];
    if (!file) return; // No file selected

    const nation = cfg.nations[cfg.selectedNationIndex];
    if (!nation) {
        console.error("Selected nation index invalid during flag upload.");
        event.target.value = '';
        return;
    }

    // Basic type check (more robust check in processAndAssignFlag)
    const fileType = file.type;
    const isSvg = fileType === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
    const isImage = fileType.startsWith('image/');

    if (!isSvg && !isImage) {
         await domUtils.showModal('alert', 'Error', 'Invalid file type. Please select PNG, SVG, JPG, GIF, or WEBP.');
         event.target.value = '';
         return;
    }


    domUtils.updateStatus(`Processing flag ${file.name} for ${nation.name}...`);
    try {
        // Use the central processing function
        await dataUtils.processAndAssignFlag(file, nation);
        domUtils.updateInfoPanel(cfg.selectedNationIndex); // Update panel to show new flag
        canvasUtils.redrawCanvas(); // Redraw map to show new flag
        domUtils.updateStatus(`Flag set for ${nation.name}.`);
    } catch (error) {
        await domUtils.showModal('alert', 'Flag Processing Error', `Could not process flag: ${error.message}`);
        domUtils.updateStatus(`Error processing flag ${file.name}: ${error.message}`, true);
        // Don't clear nation flag data here, processAndAssignFlag should handle cleanup on error
        domUtils.updateInfoPanel(cfg.selectedNationIndex); // Update panel to reflect failure
        canvasUtils.redrawCanvas();
    } finally {
        event.target.value = ''; // Clear the file input
    }
}

export async function handleFlagRemoveClick() {
     if (cfg.selectedNationIndex === null || cfg.selectedNationIndex < 0 || cfg.selectedNationIndex >= cfg.nations.length) return;

     const nation = cfg.nations[cfg.selectedNationIndex];
     if (!nation || (!nation.flag && !nation.flagImage)) {
         // No flag to remove
         return;
     }

     const confirmRemove = await domUtils.showModal('confirm', 'Remove Flag', `Remove flag from "${nation.name}"?`, { confirmText: 'Remove', denyText: 'Cancel' });

     if (confirmRemove) {
         // Clear all flag-related fields
         nation.flag = null;
         nation.flagImage = null;
         nation.flagData = null;
         nation.flagDataType = null;
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
     await nationUtils.saveInlineEdit(); // Delegate to the nation util function
}

// --- Resize Observer ---
export function handleResize() {
    // This function will be wrapped in the observer callback in main.js
     if (!cfg.canvas || !cfg.canvasContainer) return;
     cfg.canvas.width = cfg.canvasContainer.clientWidth;
     cfg.canvas.height = cfg.canvasContainer.clientHeight;
     canvasUtils.clampOffset(); // Adjust offset for new size
     canvasUtils.redrawCanvas(); // Redraw with new size
}


// --- END OF FILE js/eventHandlers.js ---