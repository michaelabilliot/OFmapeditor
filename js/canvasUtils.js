// --- START OF FILE js/canvasUtils.js ---
import * as cfg from './config.js';
import { getCssVariable, updateZoomDisplay, updateCursor } from './domUtils.js';

// --- Coordinate Transformations ---
export function getCanvasMousePos(event) {
    if (!cfg.canvas) return null;
    const rect = cfg.canvas.getBoundingClientRect();
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
    const hitRadiusMap = cfg.markerRadius / cfg.zoom + (2 / cfg.zoom);
    // Iterate backwards to prioritize nations drawn on top
    for (let i = cfg.nations.length - 1; i >= 0; i--) {
        const nation = cfg.nations[i];
        // Basic validation of nation data
        if (!nation || !nation.coordinates || typeof nation.coordinates[0] !== 'number' || typeof nation.coordinates[1] !== 'number') {
            continue; // Skip invalid nations
        }
        const dx = mapPos.x - nation.coordinates[0];
        const dy = mapPos.y - nation.coordinates[1];
        const distance = Math.hypot(dx, dy); // Faster than sqrt(dx*dx + dy*dy)

        if (distance <= hitRadiusMap) {
            return i; // Return the index of the found nation
        }
    }
    return null; // No nation found at this position
}

// --- Drawing Helpers ---
function drawTextWithBackground(text, mapX, mapY, baseFontSize, markerRadiusMap) {
    if (!cfg.ctx) return;
    const currentFontSize = Math.max(5, baseFontSize); // Ensure minimum visible size
    cfg.ctx.font = `${currentFontSize}px sans-serif`;

    const textColor = getCssVariable('--marker-text-color', '#FFF');
    const textBgColor = getCssVariable('--marker-text-bg', 'rgba(0,0,0,0.7)');

    const textMetrics = cfg.ctx.measureText(text);
    const textWidth = textMetrics.width;
    const textHeight = currentFontSize; // Approximate height
    const padding = 3; // Padding around text

    // Calculate background position in canvas coordinates
    const textCanvasPos = mapToCanvasCoords(mapX, mapY);
    const bgX = textCanvasPos.x - textWidth / 2 - padding;
    // Position below the marker, accounting for marker radius (scaled) and padding
    const bgY = textCanvasPos.y + markerRadiusMap * cfg.zoom + padding;
    const bgWidth = textWidth + padding * 2;
    const bgHeight = textHeight + padding * 2;

    // Use save/restore with resetTransform for drawing overlays in screen space
    cfg.ctx.save();
    cfg.ctx.resetTransform(); // Temporarily ignore canvas zoom/pan for screen-space drawing

    // Draw background
    cfg.ctx.fillStyle = textBgColor;
    cfg.ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

    // Draw text
    cfg.ctx.fillStyle = textColor;
    cfg.ctx.textAlign = 'center';
    cfg.ctx.textBaseline = 'middle';
    cfg.ctx.fillText(text, textCanvasPos.x, bgY + bgHeight / 2);

    cfg.ctx.restore(); // Restore canvas transform state
}

export function drawPlaceholder() {
    if (!cfg.ctx || !cfg.canvas) return;
    const phBg = getCssVariable('--input-bg-color', '#eee');
    const phFg = getCssVariable('--text-color', '#aaa'); // Use text color for contrast
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
        console.warn("Canvas has zero dimensions, skipping redraw.");
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
    cfg.ctx.translate(-cfg.offsetX * cfg.zoom, -cfg.offsetY * cfg.zoom);
    cfg.ctx.scale(cfg.zoom, cfg.zoom);

    // --- Draw Map Background ---
    // Disable smoothing for pixelated look if desired
    cfg.ctx.imageSmoothingEnabled = false; // Keep crisp pixels
    try {
        cfg.ctx.drawImage(cfg.mapImage, 0, 0, cfg.mapInfo.width, cfg.mapInfo.height);
    } catch (e) {
        console.error("Error drawing map image:", e);
        // Attempt to draw placeholder on error
        cfg.ctx.restore(); // Restore before drawing placeholder
        drawPlaceholder();
        // No need to restore again as drawPlaceholder does it
        return; // Stop further drawing
    }

    // --- Draw Nations ---
    const currentHoverIndex = (cfg.hoveredNationIndex !== null) ? cfg.hoveredNationIndex : cfg.hoveredListIndex;
    const outlineColor = getCssVariable('--marker-outline-color', '#000');
    const drawRadiusMap = cfg.markerRadius / cfg.zoom; // Marker radius in map coordinates
    const outlineWidthMap = 1 / cfg.zoom; // Outline width in map coordinates
    const selectionWidthMap = 3 / cfg.zoom; // Selection outline width in map coords

    cfg.nations.forEach((nation, index) => {
        if (!nation || !nation.coordinates || typeof nation.coordinates[0] !== 'number' || typeof nation.coordinates[1] !== 'number') {
            // console.warn(`Skipping drawing invalid nation at index ${index}`);
            return; // Skip rendering invalid nations
        }

        const [mapX, mapY] = nation.coordinates;
        let currentDrawRadiusMap = drawRadiusMap;

        // Slightly enlarge hovered marker (if not selected)
        if (index === currentHoverIndex && index !== cfg.selectedNationIndex) {
            currentDrawRadiusMap = (cfg.markerRadius + 2) / cfg.zoom; // Enlarge slightly in map coords
        }

        // --- Draw Flag ---
        if (nation.flagImage && nation.flagImage.complete && nation.flagImage.naturalWidth > 0) {
             const flagImg = nation.flagImage;
             // Calculate display size based on configured base size and aspect ratio
             const baseRatio = flagImg.naturalHeight / flagImg.naturalWidth;
             let displayWidthMap, displayHeightMap;

             if (flagImg.naturalWidth >= flagImg.naturalHeight) {
                 displayWidthMap = cfg.flagBaseDisplaySize / cfg.zoom; // Base size scaled
                 displayHeightMap = displayWidthMap * baseRatio;
             } else {
                 displayHeightMap = cfg.flagBaseDisplaySize / cfg.zoom; // Base size scaled
                 displayWidthMap = displayHeightMap / baseRatio;
             }

             // Position flag above the marker
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

        // Define path drawing functions
        const drawCirclePath = () => {
            cfg.ctx.beginPath();
            cfg.ctx.arc(mapX, mapY, currentDrawRadiusMap, 0, Math.PI * 2);
        };
        const drawSquarePath = () => {
             const r = currentDrawRadiusMap;
             cfg.ctx.beginPath();
             cfg.ctx.rect(mapX - r, mapY - r, r * 2, r * 2);
        };
         const drawTrianglePath = () => {
            const r = currentDrawRadiusMap;
            const x1 = mapX;
            const y1 = mapY - r; // Top point
            const x2 = mapX - r * Math.sqrt(3) / 2; // Bottom-left
            const y2 = mapY + r / 2;
            const x3 = mapX + r * Math.sqrt(3) / 2; // Bottom-right
            const y3 = mapY + r / 2;
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
        drawShapePath(); // Redraw path for stroke
        cfg.ctx.stroke();

        // Draw selection highlight if selected
        if (index === cfg.selectedNationIndex) {
            cfg.ctx.strokeStyle = getCssVariable('--selected-border-color', 'cyan');
            cfg.ctx.lineWidth = selectionWidthMap;
            drawShapePath(); // Redraw path for selection stroke
            cfg.ctx.stroke();
        }

        // --- Draw Nation Text ---
        // Draw text below the marker
        const textStr = `${nation.name} (${strength})`;
        drawTextWithBackground(textStr, mapX, mapY, cfg.nationTextSize, currentDrawRadiusMap);
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

    // Clamp X offset
    if (mapDisplayWidth <= cfg.canvas.width) {
        // Center map if it's smaller than canvas
        cfg.setOffsetX((cfg.mapInfo.width - cfg.canvas.width / cfg.zoom) / 2);
    } else {
        // Allow panning, but prevent excessive blank space
        const maxOffsetX = cfg.mapInfo.width - cfg.canvas.width / cfg.zoom;
        // Allow panning slightly beyond edge (e.g., half canvas width)
        const allowedBufferX = (cfg.canvas.width / 2) / cfg.zoom;
        cfg.setOffsetX(Math.max(-allowedBufferX, Math.min(cfg.offsetX, maxOffsetX + allowedBufferX)));
    }

    // Clamp Y offset
    if (mapDisplayHeight <= cfg.canvas.height) {
        // Center map vertically
        cfg.setOffsetY((cfg.mapInfo.height - cfg.canvas.height / cfg.zoom) / 2);
    } else {
        // Allow panning, prevent excessive blank space
        const maxOffsetY = cfg.mapInfo.height - cfg.canvas.height / cfg.zoom;
        const allowedBufferY = (cfg.canvas.height / 2) / cfg.zoom;
        cfg.setOffsetY(Math.max(-allowedBufferY, Math.min(cfg.offsetY, maxOffsetY + allowedBufferY)));
    }
}

export function resetView() {
    if (cfg.isPanningAnimationActive) return; // Don't reset during animation

    if (cfg.mapImage && cfg.mapInfo.width > 0 && cfg.mapInfo.height > 0 && cfg.canvas && cfg.canvas.width > 0 && cfg.canvas.height > 0) {
        // Calculate zoom to fit map within canvas bounds
        const hScale = cfg.canvas.width / cfg.mapInfo.width;
        const vScale = cfg.canvas.height / cfg.mapInfo.height;
        let newZoom = Math.min(hScale, vScale); // Fit entire map

        // Clamp zoom within limits
        newZoom = Math.max(cfg.minZoom, Math.min(cfg.maxZoom, newZoom));
        cfg.setZoom(newZoom);

        // Center the map
        cfg.setOffsetX((cfg.mapInfo.width - cfg.canvas.width / cfg.zoom) / 2);
        cfg.setOffsetY((cfg.mapInfo.height - cfg.canvas.height / cfg.zoom) / 2);

    } else {
        // Default view if no map or canvas dimensions
        cfg.setZoom(1.0);
        cfg.setOffsetX(0);
        cfg.setOffsetY(0);
    }

    clampOffset(); // Ensure offsets are valid after reset
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

    clampOffset();
    updateZoomDisplay();
    redrawCanvas();

    // Update hover state after zoom, as the mouse might be over a different element now
    const currentMapPos = canvasToMapCoords(centerCanvasX, centerCanvasY); // Re-calculate (though should be same)
    if (currentMapPos) {
        cfg.setHoveredNationIndex(getNationAtPos(currentMapPos));
        updateCursor();
    }
}


// --- Smooth Panning Animation ---
function easeOutCubic(t) { // t goes from 0 to 1
    return 1 - Math.pow(1 - t, 3);
}

export function smoothPanTo(targetMapX, targetMapY, duration = 300) {
    if (cfg.isPanningAnimationActive || !cfg.canvas) return; // Prevent concurrent animations

    cfg.setIsPanningAnimationActive(true);
    updateCursor(); // Show default cursor during animation

    const startOffsetX = cfg.offsetX;
    const startOffsetY = cfg.offsetY;

    // Calculate target offset to center the target map coordinates
    const targetOffsetX = targetMapX - (cfg.canvas.width / 2 / cfg.zoom);
    const targetOffsetY = targetMapY - (cfg.canvas.height / 2 / cfg.zoom);

    const deltaX = targetOffsetX - startOffsetX;
    const deltaY = targetOffsetY - startOffsetY;

    const startTime = performance.now();

    function step(currentTime) {
        const elapsedTime = currentTime - startTime;
        let rawProgress = elapsedTime / duration;

        if (rawProgress >= 1) {
            // Animation finished
            cfg.setOffsetX(targetOffsetX);
            cfg.setOffsetY(targetOffsetY);
            clampOffset();
            redrawCanvas();
            cfg.setIsPanningAnimationActive(false);
            updateCursor(); // Restore appropriate cursor
            return; // End the animation loop
        }

        // Apply easing function
        const easedProgress = easeOutCubic(rawProgress);

        // Update offset based on eased progress
        cfg.setOffsetX(startOffsetX + deltaX * easedProgress);
        cfg.setOffsetY(startOffsetY + deltaY * easedProgress);

        clampOffset(); // Clamp during animation steps
        redrawCanvas(); // Redraw the frame

        // Request the next frame
        requestAnimationFrame(step);
    }

    // Start the animation loop
    requestAnimationFrame(step);
}

// --- Initial Canvas Size ---
export function setInitialCanvasSize() {
    if (!cfg.canvas || !cfg.canvasContainer) return;
    cfg.canvas.width = cfg.canvasContainer.clientWidth;
    cfg.canvas.height = cfg.canvasContainer.clientHeight;
    // Don't call resetView here, main.js should handle initial drawing/view setup
    updateZoomDisplay(); // Update display even if view isn't reset yet
}


// --- END OF FILE js/canvasUtils.js ---