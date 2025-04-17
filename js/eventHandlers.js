// --- START OF FILE eventHandlers.js ---

import * as cfg from './config.js';
import * as domUtils from './domUtils.js';
import * as canvasUtils from './canvasUtils.js';
import * as mapUtils from './mapUtils.js';
import * as dataUtils from './dataUtils.js';
import * as nationUtils from './nationUtils.js';
import { openFlagEditor } from './flagEditor.js';

// --- Map Generation Event ---
export async function handleGenerateMapClick() {
    if (cfg.isGeneratingMap) {
        domUtils.showModal('alert', 'Busy', 'Map generation is already in progress.');
        return;
    }
    if (cfg.mapImage) {
         const confirm = await domUtils.showModal('confirm', 'Generate New Map?', 'Generating a new map will clear the current map and nations. Continue?');
         if (!confirm) { domUtils.updateStatus("Map generation cancelled."); return; }
    }
    await mapUtils.triggerMapGeneration(); // This now handles the flag internally
}

// --- JSON Loading Events ---
export async function handleJsonFileSelect(event) {
     if (!cfg.mapImage) { // Check if map exists before loading JSON
         await domUtils.showModal('alert', 'Error', 'Generate or load a map image BEFORE loading JSON data.');
         event.target.value = ''; return;
     }
    const file = event.target.files?.[0];
    if (file) { await dataUtils.handleJsonLoad(file); }
     event.target.value = '';
}

// --- Canvas Interaction Events ---
export function handleCanvasMouseDown(event) {
    if (cfg.isGeneratingMap || event.button !== 0 || cfg.currentModalResolve || cfg.isPanningAnimationActive || !cfg.mapImage || !cfg.inlineEditPanel || !cfg.canvas) return;
    cfg.canvas.focus();
    const canvasPos = canvasUtils.getCanvasMousePos(event); if (!canvasPos) return;
    const mapPos = canvasUtils.canvasToMapCoords(canvasPos.x, canvasPos.y); if (!mapPos) return;
    const clickedNationIndex = canvasUtils.getNationAtPos(mapPos);
    const isClickOnEditor = cfg.inlineEditPanel.style.display === 'block' && cfg.inlineEditPanel.contains(event.target);
    if (cfg.inlineEditPanel.style.display === 'block' && !isClickOnEditor && clickedNationIndex !== cfg.nationIndexBeingEdited) { domUtils.closeInlineEditor(); }
    if (isClickOnEditor) return;
    cfg.setMouseDownPos(canvasPos);
    if (clickedNationIndex !== null) {
        if (cfg.selectedNationIndex !== clickedNationIndex) { cfg.setSelectedNationIndex(clickedNationIndex); domUtils.updateNationList(); domUtils.updateInfoPanel(clickedNationIndex); canvasUtils.redrawCanvas(); }
        cfg.setDraggingNation(true); cfg.setPotentialPan(false);
        const nationCoords = cfg.nations[clickedNationIndex].coordinates;
        cfg.setDragNationOffset({ x: mapPos.x - nationCoords[0], y: mapPos.y - nationCoords[1] });
        domUtils.updateStatus(`Dragging ${cfg.nations[clickedNationIndex].name}...`); domUtils.updateCursor();
    } else {
        if (cfg.selectedNationIndex !== null) { cfg.setSelectedNationIndex(null); domUtils.updateNationList(); domUtils.updateInfoPanel(null); canvasUtils.redrawCanvas(); }
        cfg.setPotentialPan(true); cfg.setDraggingNation(false); cfg.setPanStartOffset({ x: cfg.offsetX, y: cfg.offsetY }); domUtils.updateCursor();
    }
}

export function handleCanvasMouseMove(event) {
    if (cfg.isGeneratingMap || cfg.currentModalResolve || cfg.isPanningAnimationActive || !cfg.mapImage) return;
    const canvasPos = canvasUtils.getCanvasMousePos(event); if (!canvasPos) { domUtils.updateCoordinateDisplay(null); return; }
    const mapPos = canvasUtils.canvasToMapCoords(canvasPos.x, canvasPos.y); if (!mapPos) return;
    domUtils.updateCoordinateDisplay(mapPos);
    let needsRedraw = false; let needsCursorUpdate = false;
    if (cfg.potentialPan) {
        const dx = canvasPos.x - cfg.mouseDownPos.x; const dy = canvasPos.y - cfg.mouseDownPos.y;
        if (Math.hypot(dx, dy) > cfg.panThreshold) { cfg.setIsPanning(true); cfg.setPotentialPan(false); needsCursorUpdate = true; if (cfg.hoveredNationIndex !== null) { cfg.setHoveredNationIndex(null); needsRedraw = true; } domUtils.updateStatus("Panning map..."); }
    }
    if (cfg.isPanning) {
        const dxCanvas = canvasPos.x - cfg.mouseDownPos.x; const dyCanvas = canvasPos.y - cfg.mouseDownPos.y;
        cfg.setOffsetX(cfg.panStartOffset.x - (dxCanvas / cfg.zoom)); cfg.setOffsetY(cfg.panStartOffset.y - (dyCanvas / cfg.zoom));
        canvasUtils.clampOffset(); needsRedraw = true;
    } else if (cfg.draggingNation && cfg.selectedNationIndex !== null) {
        const nation = cfg.nations[cfg.selectedNationIndex]; if (!nation) { cfg.setDraggingNation(false); needsCursorUpdate = true; domUtils.updateStatus("Drag cancelled (nation data lost)."); return; }
        nation.coordinates[0] = mapPos.x - cfg.dragNationOffset.x; nation.coordinates[1] = mapPos.y - cfg.dragNationOffset.y;
        needsRedraw = true;
    } else if (!cfg.potentialPan && !cfg.isPanning && !cfg.draggingNation) {
        const currentHover = canvasUtils.getNationAtPos(mapPos); if (currentHover !== cfg.hoveredNationIndex) { cfg.setHoveredNationIndex(currentHover); needsCursorUpdate = true; needsRedraw = true; }
    }
    if (needsCursorUpdate) { domUtils.updateCursor(); } if (needsRedraw) { canvasUtils.redrawCanvas(); }
}

export async function handleCanvasMouseUp(event) {
    if (cfg.isGeneratingMap || event.button !== 0 || cfg.currentModalResolve || cfg.isPanningAnimationActive || !cfg.mapImage) return;
    if (cfg.potentialPan) {
        cfg.setPotentialPan(false); const canvasPos = canvasUtils.getCanvasMousePos(event);
        if (canvasPos) {
            const dx = canvasPos.x - cfg.mouseDownPos.x; const dy = canvasPos.y - cfg.mouseDownPos.y;
             if (Math.hypot(dx, dy) <= cfg.panThreshold) {
                  const mapPosAdd = canvasUtils.canvasToMapCoords(cfg.mouseDownPos.x, cfg.mouseDownPos.y);
                  if (mapPosAdd) { await nationUtils.handleAddNation(mapPosAdd); }
                  else { domUtils.updateStatus("Could not determine map position for adding.", true); }
             } else { domUtils.updateStatus("Pan finished."); }
        } else { domUtils.updateStatus("Action cancelled (position error)."); }
        cfg.setIsPanning(false); domUtils.updateCursor(); return;
    }
    if (cfg.isPanning) { cfg.setIsPanning(false); domUtils.updateCursor(); domUtils.updateStatus("Pan finished."); }
    if (cfg.draggingNation) {
        cfg.setDraggingNation(false); domUtils.updateCursor();
        if (cfg.selectedNationIndex !== null && cfg.nations[cfg.selectedNationIndex]) { const nation = cfg.nations[cfg.selectedNationIndex]; domUtils.updateStatus(`Placed ${nation.name}.`); domUtils.updateNationList(); canvasUtils.redrawCanvas(); }
        else { domUtils.updateStatus("Drag finished."); }
    }
}

export function handleCanvasMouseOut(event) {
     if (cfg.isGeneratingMap || cfg.currentModalResolve || cfg.isPanningAnimationActive) return;
     domUtils.updateCoordinateDisplay(null); let needsCursorUpdate = false; let needsRedraw = false; let statusUpdate = null;
     if (cfg.potentialPan) { cfg.setPotentialPan(false); needsCursorUpdate = true; }
     if (cfg.isPanning) { cfg.setIsPanning(false); needsCursorUpdate = true; statusUpdate = "Pan cancelled (mouse left canvas)."; }
     if (cfg.draggingNation) { const nationName = cfg.nations[cfg.selectedNationIndex]?.name || "nation"; cfg.setDraggingNation(false); needsCursorUpdate = true; statusUpdate = `Drag of ${nationName} cancelled (mouse left canvas).`; needsRedraw = true; domUtils.updateNationList(); }
     if (cfg.hoveredNationIndex !== null) { cfg.setHoveredNationIndex(null); needsCursorUpdate = true; needsRedraw = true; }
     if (needsCursorUpdate) domUtils.updateCursor(); if (needsRedraw) canvasUtils.redrawCanvas(); if (statusUpdate) domUtils.updateStatus(statusUpdate);
}

export function handleCanvasContextMenu(event) { event.preventDefault(); }
export function handleCanvasWheel(event) {
    if (cfg.isGeneratingMap || !cfg.mapImage || cfg.isPanningAnimationActive || !cfg.canvas) return;
    event.preventDefault(); const canvasPos = canvasUtils.getCanvasMousePos(event); if (!canvasPos) return;
    const delta = Math.max(-1, Math.min(1, (-event.deltaY || -event.detail || event.wheelDelta))); const factor = 1 + delta * (cfg.zoomSensitivity * 100); const mapPosBeforeZoom = canvasUtils.canvasToMapCoords(canvasPos.x, canvasPos.y); if (!mapPosBeforeZoom) return; const newZoom = Math.max(cfg.minZoom, Math.min(cfg.maxZoom, cfg.zoom * factor)); if (newZoom === cfg.zoom) return; cfg.setZoom(newZoom); cfg.setOffsetX(mapPosBeforeZoom.x - (canvasPos.x / cfg.zoom)); cfg.setOffsetY(mapPosBeforeZoom.y - (canvasPos.y / cfg.zoom)); canvasUtils.clampOffset(); domUtils.updateZoomDisplay(); canvasUtils.redrawCanvas(); const currentMapPos = canvasUtils.canvasToMapCoords(canvasPos.x, canvasPos.y); if (currentMapPos) { cfg.setHoveredNationIndex(canvasUtils.getNationAtPos(currentMapPos)); domUtils.updateCursor(); }
}

// --- Keyboard Events ---
export async function handleDocumentKeyDown(event) {
    if (cfg.isGeneratingMap) return;
    const activeElement = document.activeElement; const isInputFocused = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable; const isInlineEditorInputFocused = cfg.inlineEditPanel?.style.display === 'block' && (activeElement === cfg.inlineEditName || activeElement === cfg.inlineEditStrength);
    if (isInlineEditorInputFocused) { if (event.key === 'Escape') { event.preventDefault(); domUtils.closeInlineEditor(); return; } else if (event.key === 'Enter') { event.preventDefault(); await nationUtils.saveInlineEdit(); return; } return; }
    const isFlagEditorOpen = cfg.flagEditorModalContainer?.style.display === 'flex';
    if (cfg.currentModalResolve || cfg.isPanningAnimationActive || isInputFocused || isFlagEditorOpen) return;
    if (activeElement !== document.body && activeElement !== cfg.canvas && activeElement !== null) return;
    switch (event.key) {
        case 's': case 'S': if (!event.ctrlKey && !event.metaKey) { event.preventDefault(); if (cfg.saveButton && !cfg.saveButton.disabled) { await dataUtils.saveProjectAsZip(); } else { domUtils.updateStatus("Save unavailable (generate map first)."); } } break;
        case 'Delete': case 'Backspace': if (cfg.selectedNationIndex !== null) { event.preventDefault(); await nationUtils.handleDeleteNation(null); } break;
        case 'Escape': event.preventDefault(); if (cfg.isSettingsVisible && cfg.settingsPanel?.style.display !== 'none') { handleSettingsToggle(); } else if (cfg.selectedNationIndex !== null) { cfg.setSelectedNationIndex(null); domUtils.updateStatus("Nation deselected."); canvasUtils.redrawCanvas(); domUtils.updateNationList(); domUtils.updateInfoPanel(null); } break;
        case '+': case '=': event.preventDefault(); canvasUtils.changeZoom(1.25); break;
        case '-': event.preventDefault(); canvasUtils.changeZoom(1 / 1.25); break;
        case '0': event.preventDefault(); canvasUtils.resetView(); break;
    }
}

// --- Settings Panel Events ---
export function handleSettingsToggle() { if (!cfg.settingsPanel) return; cfg.setIsSettingsVisible(!cfg.isSettingsVisible); cfg.settingsPanel.style.display = cfg.isSettingsVisible ? 'block' : 'none'; }

// --- Flag Upload Events ---
export async function handleFlagUploadChange(event) { const file = event.target.files?.[0]; if (!file) return; if (cfg.selectedNationIndex === null || cfg.selectedNationIndex < 0 || cfg.selectedNationIndex >= cfg.nations.length) { await domUtils.showModal('alert', 'Error', 'Select a nation before uploading a flag.'); event.target.value = ''; return; } const nation = cfg.nations[cfg.selectedNationIndex]; if (!nation) { console.error("Selected nation index invalid during flag upload."); event.target.value = ''; return; } const fileExt = file.name.split('.').pop()?.toLowerCase(); const fileMimeType = file.type; const isSvg = fileMimeType === 'image/svg+xml' || (!fileMimeType && fileExt === 'svg'); let isRasterImage = fileMimeType?.startsWith('image/') && !isSvg; if (!fileMimeType && !isSvg && ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExt)) { isRasterImage = true; } if (!isSvg && !isRasterImage) { await domUtils.showModal('alert', 'Error', 'Invalid file type. Please select PNG, SVG, JPG, GIF, or WEBP.'); event.target.value = ''; return; } domUtils.updateStatus(`Processing & Standardizing flag ${file.name} for ${nation.name}...`); try { await dataUtils.processAndAssignFlag(file, nation); domUtils.updateInfoPanel(cfg.selectedNationIndex); canvasUtils.redrawCanvas(); domUtils.updateStatus(`Flag set & standardized for ${nation.name}.`); } catch (error) { const errorMsg = error instanceof Error ? error.message : "Unknown flag processing error."; await domUtils.showModal('alert', 'Flag Processing Error', `Could not process flag: ${errorMsg}`); domUtils.updateStatus(`Error processing flag ${file.name}: ${errorMsg}`, true); domUtils.updateInfoPanel(cfg.selectedNationIndex); canvasUtils.redrawCanvas(); } finally { event.target.value = ''; } }
export async function handleFlagRemoveClick() { if (cfg.selectedNationIndex === null || cfg.selectedNationIndex < 0 || cfg.selectedNationIndex >= cfg.nations.length) return; const nation = cfg.nations[cfg.selectedNationIndex]; if (!nation || (!nation.flag && !nation.flagImage && !nation.flagData)) { domUtils.updateStatus("No flag to remove for selected nation."); return; } const confirmRemove = await domUtils.showModal('confirm', 'Remove Flag', `Remove flag from "${nation.name}"?`, { confirmText: 'Remove', denyText: 'Cancel' }); if (confirmRemove) { nation.flag = null; nation.flagImage = null; nation.flagData = null; nation.flagDataType = null; nation.flagWidth = null; nation.flagHeight = null; domUtils.updateStatus(`Flag removed from ${nation.name}.`); domUtils.updateInfoPanel(cfg.selectedNationIndex); canvasUtils.redrawCanvas(); } }

// --- Inline Editor Events ---
export function handleInlineEditCancel() { domUtils.closeInlineEditor(); }
export async function handleInlineEditSave() { await nationUtils.saveInlineEdit(); }

// --- Resize Observer Callback ---
export function handleResize() { if (!cfg.canvas || !cfg.canvasContainer) return; canvasUtils.setInitialCanvasSize(); canvasUtils.clampOffset(); canvasUtils.redrawCanvas(); }

// --- Flag Editor Button Event ---
export async function handleFlagEditorClick() { if (cfg.selectedNationIndex === null || cfg.selectedNationIndex < 0 || cfg.selectedNationIndex >= cfg.nations.length) return; const nation = cfg.nations[cfg.selectedNationIndex]; if (!nation) return; if (!nation.flagData || !nation.flagDataType || !nation.flagWidth || !nation.flagHeight) { await domUtils.showModal('alert', 'Cannot Edit Flag', 'No original flag data found.'); return; } domUtils.updateStatus(`Opening flag editor for ${nation.name}...`); try { const manuallyStandardizedDataUrl = await openFlagEditor(nation.flagData, nation.flagDataType, nation.flagWidth, nation.flagHeight); if (manuallyStandardizedDataUrl) { domUtils.updateStatus(`Applying manually edited flag for ${nation.name}...`); const manuallyEditedImage = new Image(); manuallyEditedImage.onload = () => { nation.flagImage = manuallyEditedImage; domUtils.updateStatus(`Manually edited flag applied for ${nation.name}.`); domUtils.updateInfoPanel(cfg.selectedNationIndex); canvasUtils.redrawCanvas(); }; manuallyEditedImage.onerror = async () => { console.error(`Failed to load manually edited flag Data URL for ${nation.name}.`); await domUtils.showModal('alert', 'Error', 'Failed to apply the edited flag.'); domUtils.updateStatus(`Error applying edited flag for ${nation.name}.`, true); domUtils.updateInfoPanel(cfg.selectedNationIndex); }; manuallyEditedImage.src = manuallyStandardizedDataUrl; } else { domUtils.updateStatus(`Flag editing cancelled for ${nation.name}.`); } } catch (error) { console.error("Error during flag editor process:", error); await domUtils.showModal('alert', 'Flag Editor Error', `An error occurred: ${error.message}`); domUtils.updateStatus(`Error opening/using flag editor: ${error.message}`, true); } }

// --- END OF FILE eventHandlers.js ---