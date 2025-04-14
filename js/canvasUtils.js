// --- START OF FILE js/canvasUtils.js ---
import * as cfg from './config.js';
import { getCssVariable, updateZoomDisplay, updateCursor } from './domUtils.js';

// --- Coordinate Transformations ---
export function getCanvasMousePos(event) {
    if (!cfg.canvas) return null;
    const rect = cfg.canvas.getBoundingClientRect();
    // Check for valid dimensions to prevent errors if canvas is hidden or size is zero
    if (!rect || rect.width === 0 || rect.height === 0) { return null; }
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

export function canvasToMapCoords(canvasX, canvasY) {
    if (cfg.zoom === 0) return { x: 0, y: 0 }; // Avoid division by zero
    return {
        x: (canvasX / cfg.zoom) + cfg.offsetX,
        y: (canvasY / cfg.zoom) + cfg.offsetY
    };
}

export function mapToCanvasCoords(mapX, mapY) {
    return {
        x: (mapX - cfg.offsetX) * cfg.zoom,
        y: (mapY - cfg.offsetY) * cfg.zoom
    };
}

// --- Hit Detection ---
export function getNationAtPos(mapPos) {
    if (!mapPos || !cfg.nations) return null;
    // Calculate hit radius in map coordinates. Add a small buffer (e.g., 2px scaled).
    // Use getter cfg.markerRadius()
    const hitRadiusMap = cfg.markerRadius() / cfg.zoom + (2 / cfg.zoom);
    // Iterate backwards to prioritize nations drawn on top
    for (let i = cfg.nations.length - 1; i >= 0; i--) {
        const nation = cfg.nations[i];
        // Basic validation of nation data
        if (!nation || !nation.coordinates || typeof nation.coordinates[0] !== 'number' || typeof nation.coordinates[1] !== 'number') {
            // console.warn(`Invalid nation data at index ${i} during hit detection.`);
            continue; // Skip invalid nations
        }
        const dx = mapPos.x - nation.coordinates[0];
        const dy = mapPos.y - nation.coordinates[1];
        // Use hypot for distance calculation (potentially faster and avoids intermediate squaring)
        const distance = Math.hypot(dx, dy);

        if (distance <= hitRadiusMap) {
            return i; // Return the index of the found nation
        }
    }
    return null; // No nation found at this position
}

// --- Drawing Helpers ---
/** Draws text with a background box in screen space */
function drawTextWithBackground(text, mapX, mapY, baseFontSize, markerRadiusMap) {
    if (!cfg.ctx) return;
    // Ensure minimum visible size, scale slightly with zoom, but cap reasonably
    const currentFontSize = Math.max(5, baseFontSize); // Minimum size in screen pixels
    cfg.ctx.font = `${currentFontSize}px sans-serif`;

    // Get colors from CSS variables for theming
    const textColor = getCssVariable('--marker-text-color', '#FFF');
    const textBgColor = getCssVariable('--marker-text-bg', 'rgba(0,0,0,0.7)');

    const textMetrics = cfg.ctx.measureText(text);
    const textWidth = textMetrics.width;
    const textHeight = currentFontSize; // Approximate height
    const padding = 3; // Padding around text in screen pixels

    // Calculate position in canvas (screen) coordinates
    const textCanvasPos = mapToCanvasCoords(mapX, mapY);
    const bgX = textCanvasPos.x - textWidth / 2 - padding;
    // Position below the marker, accounting for marker radius (scaled) and padding
    const bgY = textCanvasPos.y + markerRadiusMap * cfg.zoom + padding; // Add scaled radius
    const bgWidth = textWidth + padding * 2;
    const bgHeight = textHeight + padding * 2;

    // Use save/restore with resetTransform for drawing overlays in screen space
    // This ensures text and background are not affected by map zoom/pan
    cfg.ctx.save();
    cfg.ctx.resetTransform(); // Temporarily ignore canvas zoom/pan

    // Draw background
    cfg.ctx.fillStyle = textBgColor;
    cfg.ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

    // Draw text
    cfg.ctx.fillStyle = textColor;
    cfg.ctx.textAlign = 'center';
    cfg.ctx.textBaseline = 'middle';
    cfg.ctx.fillText(text, textCanvasPos.x, bgY + bgHeight / 2);

    cfg.ctx.restore(); // Restore canvas transform state (zoom/pan)
}

export function drawPlaceholder() {
    if (!cfg.ctx || !cfg.canvas) return;
    const phBg = getCssVariable('--input-bg-color', '#eee');
    const phFg = getCssVariable('--text-color', '#aaa');
    const w = cfg.canvas.width;
    const h = cfg.canvas.height;

    cfg.ctx.save();
    cfg.ctx.setTransform(1, 0, 0, 1, 0, 0); // Ensure default transform
    cfg.ctx.fillStyle = phBg;
    cfg.ctx.fillRect(0, 0, w, h);

    cfg.ctx.fillStyle = phFg;
    cfg.ctx.textAlign = 'center';
    cfg.ctx.textBaseline = 'middle';
    cfg.ctx.font = '16px sans-serif';
    cfg.ctx.fillText('Load a map image', w / 2, h / 2);
    cfg.ctx.restore();

    if (cfg.zoomDisplay) cfg.zoomDisplay.textContent = '100%'; // Reset zoom display
}


// --- Main Drawing Function ---
export function redrawCanvas() {
    if (!cfg.ctx || !cfg.canvas) return;

    const canvasWidth = cfg.canvas.width;
    const canvasHeight = cfg.canvas.height;

    // Ensure canvas has dimensions before proceeding
    if (canvasWidth <= 0 || canvasHeight <= 0) {
        // console.warn("Canvas has zero dimensions, skipping redraw.");
        return;
    }

    cfg.ctx.save();
    cfg.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform for clearing
    cfg.ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw placeholder if no map image
    if (!cfg.mapImage) {
        drawPlaceholder();
        cfg.ctx.restore();
        return;
    }

    // Apply panning and zooming transform
    // Translate origin based on offset, then scale
    cfg.ctx.translate(-cfg.offsetX * cfg.zoom, -cfg.offsetY * cfg.zoom);
    cfg.ctx.scale(cfg.zoom, cfg.zoom);

    // --- Draw Map Background ---
    // Disable smoothing for pixelated look
    cfg.ctx.imageSmoothingEnabled = false;
    try {
        cfg.ctx.drawImage(cfg.mapImage, 0, 0, cfg.mapInfo.width, cfg.mapInfo.height);
    } catch (e) {
        console.error("Error drawing map image:", e);
        // Attempt to draw placeholder on error
        cfg.ctx.restore(); // Restore before drawing placeholder
        drawPlaceholder();
        // Placeholder restores itself, so just return
        return; // Stop further drawing
    }

    // --- Draw Nations ---
    const currentHoverIndex = (cfg.hoveredNationIndex !== null) ? cfg.hoveredNationIndex : cfg.hoveredListIndex;
    const outlineColor = getCssVariable('--marker-outline-color', '#000');
    // Use getter cfg.markerRadius()
    const baseDrawRadiusMap = cfg.markerRadius() / cfg.zoom; // Base marker radius in map coordinates
    const outlineWidthMap = 1 / cfg.zoom; // Outline width in map coordinates
    const selectionWidthMap = 3 / cfg.zoom; // Selection outline width in map coords

    cfg.nations.forEach((nation, index) => {
        if (!nation || !nation.coordinates || typeof nation.coordinates[0] !== 'number' || typeof nation.coordinates[1] !== 'number') {
            // console.warn(`Skipping drawing invalid nation at index ${index}`);
            return; // Skip rendering invalid nations
        }

        const [mapX, mapY] = nation.coordinates;
        let currentDrawRadiusMap = baseDrawRadiusMap;

        // Slightly enlarge hovered marker (if not selected)
        if (index === currentHoverIndex && index !== cfg.selectedNationIndex) {
             // Enlarge slightly in map coords - use getter cfg.markerRadius()
            currentDrawRadiusMap = (cfg.markerRadius() + 2) / cfg.zoom;
        }

        // --- Draw Flag ---
        // Check if flagImage exists, is loaded, and has dimensions
        if (nation.flagImage && nation.flagImage.complete && nation.flagImage.naturalWidth > 0) {
             const flagImg = nation.flagImage;
             // Calculate display size based on configured base size and aspect ratio
             // Use getter cfg.flagBaseDisplaySize()
             const flagBaseSize = cfg.flagBaseDisplaySize();
             const baseRatio = flagImg.naturalHeight / flagImg.naturalWidth;
             let displayWidthMap, displayHeightMap;

             // Determine dominant dimension for scaling
             if (flagImg.naturalWidth >= flagImg.naturalHeight) {
                 displayWidthMap = flagBaseSize / cfg.zoom; // Base size scaled
                 displayHeightMap = displayWidthMap * baseRatio;
             } else {
                 displayHeightMap = flagBaseSize / cfg.zoom; // Base size scaled
                 displayWidthMap = displayHeightMap / baseRatio;
             }

             // Position flag above the marker's top edge
             const flagMapX = mapX - displayWidthMap / 2; // Center horizontally
             // Position above marker top edge, plus a small gap (e.g., 4px scaled)
             const flagMapY = mapY - currentDrawRadiusMap - displayHeightMap - (4 / cfg.zoom);

             try {
                 cfg.ctx.drawImage(flagImg, flagMapX, flagMapY, displayWidthMap, displayHeightMap);
             } catch (flagErr) {
                 console.warn(`Error drawing flag for ${nation.name}:`, flagErr);
                 // Don't draw a broken image placeholder, just skip
             }
        }


        // --- Draw Marker Shape based on Strength ---
        let shapeColor;
        let drawShapePath; // Function to draw the path for fill and stroke

        const strength = nation.strength;

        // Define path drawing functions (closures capturing mapX, mapY, currentDrawRadiusMap)
        const drawCirclePath = () => {
            cfg.ctx.beginPath();
            cfg.ctx.arc(mapX, mapY, currentDrawRadiusMap, 0, Math.PI * 2);
        };
        const drawSquarePath = () => {
             const r = currentDrawRadiusMap;
             cfg.ctx.beginPath();
             // Draw centered square
             cfg.ctx.rect(mapX - r, mapY - r, r * 2, r * 2);
        };
         const drawTrianglePath = () => {
            // Equilateral triangle pointing up, centered on mapX, mapY
            const r = currentDrawRadiusMap;
            const h = r * Math.sqrt(3); // Height of equilateral triangle
            const yOffset = r * 0.2; // Small offset to roughly center vertically
            const x1 = mapX;                 const y1 = mapY - (2/3 * h * 0.8) + yOffset; // Top point (adjust vertical centering)
            const x2 = mapX - r;             const y2 = mapY + (1/3 * h * 0.8) + yOffset; // Bottom-left
            const x3 = mapX + r;             const y3 = mapY + (1/3 * h * 0.8) + yOffset; // Bottom-right
            cfg.ctx.beginPath();
            cfg.ctx.moveTo(x1, y1);
            cfg.ctx.lineTo(x2, y2);
            cfg.ctx.lineTo(x3, y3);
            cfg.ctx.closePath();
        };

        // Assign color and path based on strength
        if (strength === 1) {
            shapeColor = getCssVariable('--strength-1-color', 'rgba(0, 180, 0, 0.8)');
            drawShapePath = drawSquarePath;
        } else if (strength === 2) {
            shapeColor = getCssVariable('--strength-2-color', 'rgba(255, 215, 0, 0.8)');
             drawShapePath = drawTrianglePath;
        } else if (strength >= 3) {
            shapeColor = getCssVariable('--strength-3-color', 'rgba(255, 0, 0, 0.8)');
            drawShapePath = drawCirclePath; // Default to circle for high strength
        } else { // Strength 0 or undefined/null
            shapeColor = getCssVariable('--strength-default-color', 'rgba(128, 128, 128, 0.8)');
            drawShapePath = drawCirclePath; // Default to circle
        }

        // Fill the shape
        cfg.ctx.fillStyle = shapeColor;
        drawShapePath();
        cfg.ctx.fill();

        // Stroke the shape (outline)
        cfg.ctx.strokeStyle = outlineColor;
        cfg.ctx.lineWidth = outlineWidthMap;
        drawShapePath(); // Redraw path for stroke (necessary after fill)
        cfg.ctx.stroke();

        // Draw selection highlight if selected
        if (index === cfg.selectedNationIndex) {
            cfg.ctx.strokeStyle = getCssVariable('--selected-border-color', 'cyan');
            cfg.ctx.lineWidth = selectionWidthMap;
            drawShapePath(); // Redraw path for selection stroke
            cfg.ctx.stroke();
        }

        // --- Draw Nation Text ---
        // Text is drawn in screen space via drawTextWithBackground
        const textStr = `${nation.name} (${strength})`;
        // Use getter cfg.nationTextSize()
        drawTextWithBackground(textStr, mapX, mapY, cfg.nationTextSize(), currentDrawRadiusMap);
    });

    // Restore the context state (cleans up transform, styles, etc.)
    cfg.ctx.restore();
}


// --- View Manipulation ---
export function clampOffset() {
    if (!cfg.mapImage || !cfg.canvas || cfg.mapInfo.width === 0 || cfg.mapInfo.height === 0 || cfg.canvas.width === 0 || cfg.canvas.height === 0) {
        cfg.setOffsetX(0);
        cfg.setOffsetY(0);
        return;
    }

    const mapDisplayWidth = cfg.mapInfo.width * cfg.zoom;
    const mapDisplayHeight = cfg.mapInfo.height * cfg.zoom;
    const canvasWidth = cfg.canvas.width;
    const canvasHeight = cfg.canvas.height;

    // Clamp X offset
    let minOffsetX, maxOffsetX;
    if (mapDisplayWidth <= canvasWidth) {
        // Center map if it's smaller than canvas width
        minOffsetX = maxOffsetX = (cfg.mapInfo.width - canvasWidth / cfg.zoom) / 2;
    } else {
        // Allow panning, but prevent excessive blank space beyond map edges
        // Allow panning slightly beyond edge (e.g., 50% of canvas width, scaled)
        const allowedBufferX = (canvasWidth * 0.5) / cfg.zoom;
        minOffsetX = -allowedBufferX; // Allow left edge to move buffer distance past canvas left
        maxOffsetX = cfg.mapInfo.width - (canvasWidth / cfg.zoom) + allowedBufferX; // Allow right edge to move buffer distance past canvas right
    }
     cfg.setOffsetX(Math.max(minOffsetX, Math.min(cfg.offsetX, maxOffsetX)));


    // Clamp Y offset
    let minOffsetY, maxOffsetY;
    if (mapDisplayHeight <= canvasHeight) {
        // Center map vertically if smaller than canvas height
        minOffsetY = maxOffsetY = (cfg.mapInfo.height - canvasHeight / cfg.zoom) / 2;
    } else {
        // Allow panning vertically with buffer
        const allowedBufferY = (canvasHeight * 0.5) / cfg.zoom;
        minOffsetY = -allowedBufferY;
        maxOffsetY = cfg.mapInfo.height - (canvasHeight / cfg.zoom) + allowedBufferY;
    }
    cfg.setOffsetY(Math.max(minOffsetY, Math.min(cfg.offsetY, maxOffsetY)));
}


export function resetView() {
    if (cfg.isPanningAnimationActive) return; // Don't reset during animation

    if (cfg.mapImage && cfg.mapInfo.width > 0 && cfg.mapInfo.height > 0 && cfg.canvas && cfg.canvas.width > 0 && cfg.canvas.height > 0) {
        // Calculate zoom to fit map within canvas bounds, preserving aspect ratio
        const hScale = cfg.canvas.width / cfg.mapInfo.width;
        const vScale = cfg.canvas.height / cfg.mapInfo.height;
        let newZoom = Math.min(hScale, vScale); // Fit entire map using the smaller scale factor

        // Clamp zoom within limits
        newZoom = Math.max(cfg.minZoom, Math.min(cfg.maxZoom, newZoom));
        cfg.setZoom(newZoom);

        // Center the map based on the new zoom
        cfg.setOffsetX((cfg.mapInfo.width - cfg.canvas.width / cfg.zoom) / 2);
        cfg.setOffsetY((cfg.mapInfo.height - cfg.canvas.height / cfg.zoom) / 2);

    } else {
        // Default view if no map or canvas dimensions
        cfg.setZoom(1.0);
        cfg.setOffsetX(0);
        cfg.setOffsetY(0);
    }

    // clampOffset(); // clampOffset is implicitly called by changeZoom/pan, but good practice to ensure validity here if needed.
    // Instead of calling clampOffset directly, we rely on the fact that the calculated offsets should already be centered.
    updateZoomDisplay();
    redrawCanvas();
}

export function changeZoom(factor) {
    if (!cfg.mapImage || cfg.isPanningAnimationActive || !cfg.canvas) return;

    const newZoom = Math.max(cfg.minZoom, Math.min(cfg.maxZoom, cfg.zoom * factor));
    if (newZoom === cfg.zoom) return; // No change

    // Zoom towards the center of the canvas view
    const centerCanvasX = cfg.canvas.width / 2;
    const centerCanvasY = cfg.canvas.height / 2;

    // Get map coordinates under the canvas center *before* zoom
    const centerMapPosBefore = canvasToMapCoords(centerCanvasX, centerCanvasY);

    // Update zoom first
    cfg.setZoom(newZoom);

    // Calculate the new offset to keep the *same map point* under the canvas center
    cfg.setOffsetX(centerMapPosBefore.x - (centerCanvasX / cfg.zoom));
    cfg.setOffsetY(centerMapPosBefore.y - (centerCanvasY / cfg.zoom));

    clampOffset(); // Ensure offsets are valid after zoom calculation
    updateZoomDisplay();
    redrawCanvas();

    // Update hover state after zoom, as the mouse might be over a different element now
    // Re-calculate map position under cursor (should be same as centerMapPosBefore if math is right)
    const currentMapPos = canvasToMapCoords(centerCanvasX, centerCanvasY);
    if (currentMapPos) {
        cfg.setHoveredNationIndex(getNationAtPos(currentMapPos));
        updateCursor(); // Update cursor based on new hover state
    }
}


// --- Smooth Panning Animation ---
function easeOutCubic(t) { // t goes from 0 to 1
    return 1 - Math.pow(1 - t, 3);
}

export function smoothPanTo(targetMapX, targetMapY, duration = 300) {
    if (cfg.isPanningAnimationActive || !cfg.canvas || !cfg.mapImage) return; // Prevent concurrent animations or animating without map/canvas

    cfg.setIsPanningAnimationActive(true);
    updateCursor(); // Show default cursor during animation

    const startOffsetX = cfg.offsetX;
    const startOffsetY = cfg.offsetY;

    // Calculate target offset required to center the target map coordinates in the canvas view
    const targetOffsetX = targetMapX - (cfg.canvas.width / 2 / cfg.zoom);
    const targetOffsetY = targetMapY - (cfg.canvas.height / 2 / cfg.zoom);

    const deltaX = targetOffsetX - startOffsetX;
    const deltaY = targetOffsetY - startOffsetY;

    const startTime = performance.now();

    function step(currentTime) {
        const elapsedTime = currentTime - startTime;
        // Ensure progress doesn't exceed 1
        let rawProgress = Math.min(1, elapsedTime / duration);

        // Apply easing function
        const easedProgress = easeOutCubic(rawProgress);

        // Calculate intermediate offset
        const currentOffsetX = startOffsetX + deltaX * easedProgress;
        const currentOffsetY = startOffsetY + deltaY * easedProgress;

        cfg.setOffsetX(currentOffsetX);
        cfg.setOffsetY(currentOffsetY);

        clampOffset(); // Clamp during animation steps to prevent wild values
        redrawCanvas(); // Redraw the frame

        // Check if animation is finished
        if (rawProgress >= 1) {
            cfg.setIsPanningAnimationActive(false);
            updateCursor(); // Restore appropriate cursor
            // Final clamp and redraw might be needed if clamping adjusted the final step
            clampOffset();
            redrawCanvas();
        } else {
            // Request the next frame if not finished
            requestAnimationFrame(step);
        }
    }

    // Start the animation loop
    requestAnimationFrame(step);
}

// --- Initial Canvas Size ---
export function setInitialCanvasSize() {
    if (!cfg.canvas || !cfg.canvasContainer) return;
    // Use integer values for canvas dimensions to avoid potential sub-pixel issues
    cfg.canvas.width = Math.floor(cfg.canvasContainer.clientWidth);
    cfg.canvas.height = Math.floor(cfg.canvasContainer.clientHeight);
    // Don't call resetView here, main.js handles initial drawing/view setup after map load
    updateZoomDisplay(); // Update display even if view isn't reset yet
}

// --- END OF FILE js/canvasUtils.js ---