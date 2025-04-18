// --- START OF FILE eventHandlers.js ---

import * as cfg from './config.js';
import * as domUtils from './domUtils.js';
import * as canvasUtils from './canvasUtils.js';
import * as mapUtils from './mapUtils.js';
import * as dataUtils from './dataUtils.js';
import * as nationUtils from './nationUtils.js';
import { openFlagEditor } from './flagEditor.js';

// --- Map Generation Event ---
// This button now OPENS the preview panel
export function handleGenerateMapClick() {
    if (cfg.isGeneratingMap || cfg.isGeneratePreviewVisible) { // Prevent opening if already open or generating
        console.warn("Generator busy or preview already visible.");
        return;
    }
    domUtils.showGeneratePreviewPanel();
}

// --- JSON Loading Events ---
export async function handleJsonFileSelect(event) {
     if (!cfg.mapImage) { await domUtils.showModal('alert', 'Error', 'Generate map BEFORE loading JSON.'); event.target.value = ''; return; }
    const file = event.target.files?.[0]; if (file) await dataUtils.handleJsonLoad(file);
     event.target.value = '';
}

// --- Canvas Interaction Events ---
export function handleCanvasMouseDown(event) { if (cfg.isGeneratingMap || cfg.isGeneratePreviewVisible || event.button !== 0 || cfg.currentModalResolve || cfg.isPanningAnimationActive || !cfg.mapImage || !cfg.inlineEditPanel || !cfg.canvas) return; cfg.canvas.focus(); const cp = canvasUtils.getCanvasMousePos(event); if (!cp) return; const mp = canvasUtils.canvasToMapCoords(cp.x, cp.y); if (!mp) return; const cni = canvasUtils.getNationAtPos(mp); const iCOE = cfg.inlineEditPanel.style.display === 'block' && cfg.inlineEditPanel.contains(event.target); if (cfg.inlineEditPanel.style.display === 'block' && !iCOE && cni !== cfg.nationIndexBeingEdited) { domUtils.closeInlineEditor(); } if (iCOE) return; cfg.setMouseDownPos(cp); if (cni !== null) { if (cfg.selectedNationIndex !== cni) { cfg.setSelectedNationIndex(cni); domUtils.updateNationList(); domUtils.updateInfoPanel(cni); canvasUtils.redrawCanvas(); } cfg.setDraggingNation(true); cfg.setPotentialPan(false); const nc = cfg.nations[cni].coordinates; cfg.setDragNationOffset({ x: mp.x - nc[0], y: mp.y - nc[1] }); domUtils.updateStatus(`Dragging ${cfg.nations[cni].name}...`); domUtils.updateCursor(); } else { if (cfg.selectedNationIndex !== null) { cfg.setSelectedNationIndex(null); domUtils.updateNationList(); domUtils.updateInfoPanel(null); canvasUtils.redrawCanvas(); } cfg.setPotentialPan(true); cfg.setDraggingNation(false); cfg.setPanStartOffset({ x: cfg.offsetX, y: cfg.offsetY }); domUtils.updateCursor(); } }
export function handleCanvasMouseMove(event) { if (cfg.isGeneratingMap || cfg.isGeneratePreviewVisible || cfg.currentModalResolve || cfg.isPanningAnimationActive || !cfg.mapImage) return; const cp = canvasUtils.getCanvasMousePos(event); if (!cp) { domUtils.updateCoordinateDisplay(null); return; } const mp = canvasUtils.canvasToMapCoords(cp.x, cp.y); if (!mp) return; domUtils.updateCoordinateDisplay(mp); let nR = false; let nCU = false; if (cfg.potentialPan) { const dx = cp.x - cfg.mouseDownPos.x; const dy = cp.y - cfg.mouseDownPos.y; if (Math.hypot(dx, dy) > cfg.panThreshold) { cfg.setIsPanning(true); cfg.setPotentialPan(false); nCU = true; if (cfg.hoveredNationIndex !== null) { cfg.setHoveredNationIndex(null); nR = true; } domUtils.updateStatus("Panning map..."); } } if (cfg.isPanning) { const dx = cp.x - cfg.mouseDownPos.x; const dy = cp.y - cfg.mouseDownPos.y; cfg.setOffsetX(cfg.panStartOffset.x - (dx / cfg.zoom)); cfg.setOffsetY(cfg.panStartOffset.y - (dy / cfg.zoom)); canvasUtils.clampOffset(); nR = true; } else if (cfg.draggingNation && cfg.selectedNationIndex !== null) { const n = cfg.nations[cfg.selectedNationIndex]; if (!n) { cfg.setDraggingNation(false); nCU = true; domUtils.updateStatus("Drag cancelled."); return; } n.coordinates[0] = mp.x - cfg.dragNationOffset.x; n.coordinates[1] = mp.y - cfg.dragNationOffset.y; nR = true; } else if (!cfg.potentialPan && !cfg.isPanning && !cfg.draggingNation) { const ch = canvasUtils.getNationAtPos(mp); if (ch !== cfg.hoveredNationIndex) { cfg.setHoveredNationIndex(ch); nCU = true; nR = true; } } if (nCU) domUtils.updateCursor(); if (nR) canvasUtils.redrawCanvas(); }
export async function handleCanvasMouseUp(event) { if (cfg.isGeneratingMap || cfg.isGeneratePreviewVisible || event.button !== 0 || cfg.currentModalResolve || cfg.isPanningAnimationActive || !cfg.mapImage) return; if (cfg.potentialPan) { cfg.setPotentialPan(false); const cp = canvasUtils.getCanvasMousePos(event); if (cp) { const dx = cp.x - cfg.mouseDownPos.x; const dy = cp.y - cfg.mouseDownPos.y; if (Math.hypot(dx, dy) <= cfg.panThreshold) { const mpA = canvasUtils.canvasToMapCoords(cfg.mouseDownPos.x, cfg.mouseDownPos.y); if (mpA) await nationUtils.handleAddNation(mpA); else domUtils.updateStatus("Add failed.", true); } else domUtils.updateStatus("Pan finished."); } else domUtils.updateStatus("Action cancelled."); cfg.setIsPanning(false); domUtils.updateCursor(); return; } if (cfg.isPanning) { cfg.setIsPanning(false); domUtils.updateCursor(); domUtils.updateStatus("Pan finished."); } if (cfg.draggingNation) { cfg.setDraggingNation(false); domUtils.updateCursor(); if (cfg.selectedNationIndex !== null && cfg.nations[cfg.selectedNationIndex]) domUtils.updateStatus(`Placed ${cfg.nations[cfg.selectedNationIndex].name}.`); else domUtils.updateStatus("Drag finished."); domUtils.updateNationList(); canvasUtils.redrawCanvas(); } }
export function handleCanvasMouseOut(event) { if (cfg.isGeneratingMap || cfg.isGeneratePreviewVisible || cfg.currentModalResolve || cfg.isPanningAnimationActive) return; domUtils.updateCoordinateDisplay(null); let nCU = false; let nR = false; let s = null; if (cfg.potentialPan) { cfg.setPotentialPan(false); nCU = true; } if (cfg.isPanning) { cfg.setIsPanning(false); nCU = true; s = "Pan cancelled."; } if (cfg.draggingNation) { const nN = cfg.nations[cfg.selectedNationIndex]?.name || "nation"; cfg.setDraggingNation(false); nCU = true; s = `Drag of ${nN} cancelled.`; nR = true; domUtils.updateNationList(); } if (cfg.hoveredNationIndex !== null) { cfg.setHoveredNationIndex(null); nCU = true; nR = true; } if (nCU) domUtils.updateCursor(); if (nR) canvasUtils.redrawCanvas(); if (s) domUtils.updateStatus(s); }
export function handleCanvasContextMenu(event) { event.preventDefault(); }
export function handleCanvasWheel(event) { if (cfg.isGeneratingMap || cfg.isGeneratePreviewVisible || !cfg.mapImage || cfg.isPanningAnimationActive || !cfg.canvas) return; event.preventDefault(); const cp = canvasUtils.getCanvasMousePos(event); if (!cp) return; const d = Math.max(-1, Math.min(1, (-event.deltaY))); const f = 1 + d * (cfg.zoomSensitivity * 100); const mpB = canvasUtils.canvasToMapCoords(cp.x, cp.y); if (!mpB) return; const nZ = Math.max(cfg.minZoom, Math.min(cfg.maxZoom, cfg.zoom * f)); if (nZ === cfg.zoom) return; cfg.setZoom(nZ); cfg.setOffsetX(mpB.x - (cp.x / cfg.zoom)); cfg.setOffsetY(mpB.y - (cp.y / cfg.zoom)); canvasUtils.clampOffset(); domUtils.updateZoomDisplay(); canvasUtils.redrawCanvas(); const cMp = canvasUtils.canvasToMapCoords(cp.x, cp.y); if (cMp) { cfg.setHoveredNationIndex(canvasUtils.getNationAtPos(cMp)); domUtils.updateCursor(); } }

// --- Keyboard Events ---
export async function handleDocumentKeyDown(event) { if (cfg.isGeneratingMap || cfg.isGeneratePreviewVisible) return; const ae = document.activeElement; const iF = ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable; const iEI = cfg.inlineEditPanel?.style.display === 'block' && (ae === cfg.inlineEditName || ae === cfg.inlineEditStrength); if (iEI) { if (event.key === 'Escape') { event.preventDefault(); domUtils.closeInlineEditor(); return; } else if (event.key === 'Enter') { event.preventDefault(); await nationUtils.saveInlineEdit(); return; } return; } const iFO = cfg.flagEditorModalContainer?.style.display === 'flex'; if (cfg.currentModalResolve || cfg.isPanningAnimationActive || iF || iFO) return; if (ae !== document.body && ae !== cfg.canvas && ae !== null) return; switch (event.key) { case 's': case 'S': if (!event.ctrlKey && !event.metaKey) { event.preventDefault(); if (cfg.saveButton && !cfg.saveButton.disabled) await dataUtils.saveProjectAsZip(); else domUtils.updateStatus("Save unavailable."); } break; case 'Delete': case 'Backspace': if (cfg.selectedNationIndex !== null) { event.preventDefault(); await nationUtils.handleDeleteNation(null); } break; case 'Escape': event.preventDefault(); if (cfg.isSettingsVisible && cfg.settingsPanel?.style.display !== 'none') handleSettingsToggle(); else if (cfg.selectedNationIndex !== null) { cfg.setSelectedNationIndex(null); domUtils.updateStatus("Nation deselected."); canvasUtils.redrawCanvas(); domUtils.updateNationList(); domUtils.updateInfoPanel(null); } break; case '+': case '=': event.preventDefault(); canvasUtils.changeZoom(1.25); break; case '-': event.preventDefault(); canvasUtils.changeZoom(1 / 1.25); break; case '0': event.preventDefault(); canvasUtils.resetView(); break; } }

// --- Settings Panel Events ---
export function handleSettingsToggle() { if (!cfg.settingsPanel) return; cfg.setIsSettingsVisible(!cfg.isSettingsVisible); cfg.settingsPanel.style.display = cfg.isSettingsVisible ? 'block' : 'none'; }

// --- Flag Upload Events ---
export async function handleFlagUploadChange(event) { const f = event.target.files?.[0]; if (!f) return; if (cfg.selectedNationIndex === null || cfg.selectedNationIndex < 0 || cfg.selectedNationIndex >= cfg.nations.length) { await domUtils.showModal('alert', 'Error', 'Select nation first.'); event.target.value = ''; return; } const n = cfg.nations[cfg.selectedNationIndex]; if (!n) { event.target.value = ''; return; } const fe = f.name.split('.').pop()?.toLowerCase(); const fm = f.type; const isS = fm === 'image/svg+xml' || (!fm && fe === 'svg'); let isR = fm?.startsWith('image/') && !isS; if (!fm && !isS && ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fe)) isR = true; if (!isS && !isR) { await domUtils.showModal('alert', 'Error', 'Invalid file type.'); event.target.value = ''; return; } domUtils.updateStatus(`Processing flag ${f.name}...`); try { await dataUtils.processAndAssignFlag(f, n); domUtils.updateInfoPanel(cfg.selectedNationIndex); canvasUtils.redrawCanvas(); domUtils.updateStatus(`Flag set for ${n.name}.`); } catch (e) { const m = e instanceof Error ? e.message : "Unknown error."; await domUtils.showModal('alert', 'Flag Error', `Could not process: ${m}`); domUtils.updateStatus(`Error processing flag: ${m}`, true); domUtils.updateInfoPanel(cfg.selectedNationIndex); canvasUtils.redrawCanvas(); } finally { event.target.value = ''; } }
export async function handleFlagRemoveClick() { if (cfg.selectedNationIndex === null || cfg.selectedNationIndex < 0 || cfg.selectedNationIndex >= cfg.nations.length) return; const n = cfg.nations[cfg.selectedNationIndex]; if (!n || (!n.flag && !n.flagImage && !n.flagData)) { domUtils.updateStatus("No flag to remove."); return; } const c = await domUtils.showModal('confirm', 'Remove Flag', `Remove flag from "${n.name}"?`, { confirmText: 'Remove', denyText: 'Cancel' }); if (c) { n.flag = null; n.flagImage = null; n.flagData = null; n.flagDataType = null; n.flagWidth = null; n.flagHeight = null; domUtils.updateStatus(`Flag removed from ${n.name}.`); domUtils.updateInfoPanel(cfg.selectedNationIndex); canvasUtils.redrawCanvas(); } }

// --- Inline Editor Events ---
export function handleInlineEditCancel() { domUtils.closeInlineEditor(); }
export async function handleInlineEditSave() { await nationUtils.saveInlineEdit(); }

// --- Resize Observer Callback ---
export function handleResize() { if (!cfg.canvas || !cfg.canvasContainer) return; canvasUtils.setInitialCanvasSize(); canvasUtils.clampOffset(); canvasUtils.redrawCanvas(); }

// --- Flag Editor Button Event ---
export async function handleFlagEditorClick() { if (cfg.selectedNationIndex === null || cfg.selectedNationIndex < 0 || cfg.selectedNationIndex >= cfg.nations.length) return; const n = cfg.nations[cfg.selectedNationIndex]; if (!n) return; if (!n.flagData || !n.flagDataType || !n.flagWidth || !n.flagHeight) { await domUtils.showModal('alert', 'Cannot Edit Flag', 'No original flag data.'); return; } domUtils.updateStatus(`Opening flag editor for ${n.name}...`); try { const stdUrl = await openFlagEditor(n.flagData, n.flagDataType, n.flagWidth, n.flagHeight); if (stdUrl) { domUtils.updateStatus(`Applying edited flag for ${n.name}...`); const img = new Image(); img.onload = () => { n.flagImage = img; domUtils.updateStatus(`Edited flag applied.`); domUtils.updateInfoPanel(cfg.selectedNationIndex); canvasUtils.redrawCanvas(); }; img.onerror = async () => { await domUtils.showModal('alert', 'Error', 'Failed to apply.'); domUtils.updateStatus(`Error applying flag.`, true); domUtils.updateInfoPanel(cfg.selectedNationIndex); }; img.src = stdUrl; } else { domUtils.updateStatus(`Flag editing cancelled.`); } } catch (e) { await domUtils.showModal('alert', 'Flag Editor Error', `Error: ${e.message}`); domUtils.updateStatus(`Editor error: ${e.message}`, true); } }

// --- Preview Panel Event Handlers ---
export function setupPreviewPanelListeners() {
    const inputs = [ cfg.previewSeed, cfg.previewWidth, cfg.previewHeight, cfg.previewNumFaults, cfg.previewEnableSymmetry, cfg.previewSmoothingIterations, cfg.previewNoiseSeed, cfg.previewNoiseOctaves, cfg.previewNoisePersistence, cfg.previewNoiseLacunarity, cfg.previewNoiseScale, cfg.previewNoiseStrength, cfg.previewWaterLevel ];
    inputs.forEach(input => {
        if (input) {
            const eventType = (input.type === 'range' || input.type === 'checkbox') ? 'input' : 'change';
            input.addEventListener(eventType, () => {
                 const valueDisplayId = input.id + 'Value'; const valueDisplay = document.getElementById(valueDisplayId);
                 if (valueDisplay && input.type === 'range') {
                      if (input.step && input.step.includes('.')) valueDisplay.textContent = parseFloat(input.value).toFixed(input.step.split('.')[1].length);
                      else valueDisplay.textContent = input.value;
                 }
                 mapUtils.triggerMapPreviewGeneration(); // Debounced update
            });
             if(input.type === 'number') input.addEventListener('change', () => mapUtils.triggerMapPreviewGeneration());
        }
    });
    cfg.previewGenerateFinalButton?.addEventListener('click', mapUtils.triggerFinalMapGeneration);
    cfg.previewCancelButton?.addEventListener('click', domUtils.hideGeneratePreviewPanel);

    // Add listener for the new Randomize Seed button in the *main controls*
    cfg.randomizeSeedButton?.addEventListener('click', () => {
        if (cfg.paramSeed) {
             cfg.paramSeed.value = Math.floor(Math.random() * 900000) + 100000; // Random 6-digit number
        }
    });
}

// --- END OF FILE eventHandlers.js ---