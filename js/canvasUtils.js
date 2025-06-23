import * as cfg from './config.js';
// FIX: Import getCssVariable correctly from domUtils
import { updateZoomDisplay, updateCursor, getCssVariable } from './domUtils.js';

// --- Coordinate Transformations ---
export function getCanvasMousePos(event) {
  if (!cfg.canvas) return null;
  const rect = cfg.canvas.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) {
    return null;
  }
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

export function canvasToMapCoords(canvasX, canvasY) {
  if (cfg.zoom === 0) return { x: 0, y: 0 };
  return {
    x: canvasX / cfg.zoom + cfg.offsetX,
    y: canvasY / cfg.zoom + cfg.offsetY,
  };
}

export function mapToCanvasCoords(mapX, mapY) {
  return {
    x: (mapX - cfg.offsetX) * cfg.zoom,
    y: (mapY - cfg.offsetY) * cfg.zoom,
  };
}

// --- Hit Detection ---
export function getNationAtPos(mapPos) {
  if (!mapPos || !cfg.nations) return null;
  const hitRadiusMap = cfg.markerRadius() / cfg.zoom + 2 / cfg.zoom;
  for (let i = cfg.nations.length - 1; i >= 0; i--) {
    const nation = cfg.nations[i];
    if (
      !nation ||
      !nation.coordinates ||
      typeof nation.coordinates[0] !== 'number' ||
      typeof nation.coordinates[1] !== 'number'
    ) {
      continue;
    }
    const dx = mapPos.x - nation.coordinates[0];
    const dy = mapPos.y - nation.coordinates[1];
    const distance = Math.hypot(dx, dy);

    if (distance <= hitRadiusMap) {
      return i;
    }
  }
  return null;
}

// --- Drawing Helpers ---
function drawTextWithBackground(
  text,
  mapX,
  mapY,
  baseFontSize,
  markerRadiusMap
) {
  if (!cfg.ctx) return;
  const currentFontSize = Math.max(5, baseFontSize);
  cfg.ctx.font = `${currentFontSize}px sans-serif`;

  const textColor = getCssVariable('--marker-text-color', '#FFF');
  const textBgColor = getCssVariable('--marker-text-bg', 'rgba(0,0,0,0.7)');

  const textMetrics = cfg.ctx.measureText(text);
  const textWidth = textMetrics.width;
  const textHeight = currentFontSize;
  const padding = 3;

  const textCanvasPos = mapToCanvasCoords(mapX, mapY);
  if (!textCanvasPos) return;

  const bgX = textCanvasPos.x - textWidth / 2 - padding;
  const bgY = textCanvasPos.y + markerRadiusMap * cfg.zoom + padding;
  const bgWidth = textWidth + padding * 2;
  const bgHeight = textHeight + padding * 2;

  cfg.ctx.save();
  cfg.ctx.resetTransform();

  cfg.ctx.fillStyle = textBgColor;
  cfg.ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

  cfg.ctx.fillStyle = textColor;
  cfg.ctx.textAlign = 'center';
  cfg.ctx.textBaseline = 'middle';
  cfg.ctx.fillText(text, textCanvasPos.x, bgY + bgHeight / 2);

  cfg.ctx.restore();
}

export function drawPlaceholder() {
  if (!cfg.ctx || !cfg.canvas) return;
  const phBg = getCssVariable('--input-bg-color', '#eee');
  const phFg = getCssVariable('--text-color', '#aaa');
  const w = cfg.canvas.width;
  const h = cfg.canvas.height;

  if (w <= 0 || h <= 0) return;

  cfg.ctx.save();
  cfg.ctx.setTransform(1, 0, 0, 1, 0, 0);
  cfg.ctx.fillStyle = phBg;
  cfg.ctx.fillRect(0, 0, w, h);

  cfg.ctx.fillStyle = phFg;
  cfg.ctx.textAlign = 'center';
  cfg.ctx.textBaseline = 'middle';
  cfg.ctx.font = '16px sans-serif';
  cfg.ctx.fillText('Load a map image', w / 2, h / 2);
  cfg.ctx.restore();

  if (cfg.zoomDisplay) cfg.zoomDisplay.textContent = '100%';
}

// --- Main Drawing Function ---
export function redrawCanvas() {
  if (!cfg.ctx || !cfg.canvas) return;

  const canvasWidth = cfg.canvas.width;
  const canvasHeight = cfg.canvas.height;

  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return;
  }

  cfg.ctx.save();
  cfg.ctx.setTransform(1, 0, 0, 1, 0, 0);
  cfg.ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  if (!cfg.mapImage) {
    drawPlaceholder();
    cfg.ctx.restore();
    return;
  }

  cfg.ctx.translate(-cfg.offsetX * cfg.zoom, -cfg.offsetY * cfg.zoom);
  cfg.ctx.scale(cfg.zoom, cfg.zoom);

  cfg.ctx.imageSmoothingEnabled = false;
  try {
    if (cfg.mapImage.complete && cfg.mapImage.naturalWidth > 0) {
      cfg.ctx.drawImage(
        cfg.mapImage,
        0,
        0,
        cfg.mapInfo.width,
        cfg.mapInfo.height
      );
    } else {
      throw new Error('Map image is not ready to be drawn.');
    }
  } catch (e) {
    console.error('Error drawing map image:', e);
    cfg.ctx.restore();
    drawPlaceholder();
    return;
  }

  const currentHoverIndex =
    cfg.hoveredNationIndex !== null
      ? cfg.hoveredNationIndex
      : cfg.hoveredListIndex;
  const outlineColor = getCssVariable('--marker-outline-color', '#000');
  const baseDrawRadiusMap = cfg.markerRadius() / cfg.zoom;
  const outlineWidthMap = 1 / cfg.zoom;
  const selectionWidthMap = 3 / cfg.zoom;

  cfg.nations.forEach((nation, index) => {
    if (
      !nation ||
      !nation.coordinates ||
      typeof nation.coordinates[0] !== 'number' ||
      typeof nation.coordinates[1] !== 'number'
    ) {
      return;
    }

    const [mapX, mapY] = nation.coordinates;
    let currentDrawRadiusMap = baseDrawRadiusMap;

    if (index === currentHoverIndex && index !== cfg.selectedNationIndex) {
      currentDrawRadiusMap = (cfg.markerRadius() + 2) / cfg.zoom;
    }

    // Draw Flag
    if (
      nation.flagImage &&
      nation.flagImage.complete &&
      nation.flagImage.naturalWidth > 0
    ) {
      const flagImg = nation.flagImage;
      const flagBaseSize = cfg.flagBaseDisplaySize();
      const baseRatio = flagImg.naturalHeight / flagImg.naturalWidth;
      let displayWidthMap, displayHeightMap;

      if (flagImg.naturalWidth >= flagImg.naturalHeight) {
        displayWidthMap = flagBaseSize / cfg.zoom;
        displayHeightMap = displayWidthMap * baseRatio;
      } else {
        displayHeightMap = flagBaseSize / cfg.zoom;
        displayWidthMap = displayHeightMap / baseRatio;
      }

      const flagMapX = mapX - displayWidthMap / 2;
      const flagMapY =
        mapY - currentDrawRadiusMap - displayHeightMap - 4 / cfg.zoom;

      try {
        cfg.ctx.drawImage(
          flagImg,
          flagMapX,
          flagMapY,
          displayWidthMap,
          displayHeightMap
        );
      } catch (flagErr) {
        console.warn(`Error drawing flag for ${nation.name}:`, flagErr);
      }
    }

    // Draw Marker Shape based on Strength
    let shapeColor;
    let drawShapePath;

    const strength = nation.strength;

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
      const h = r * Math.sqrt(3);
      const yOffset = r * 0.2;
      const x1 = mapX;
      const y1 = mapY - (2 / 3) * h * 0.8 + yOffset;
      const x2 = mapX - r;
      const y2 = mapY + (1 / 3) * h * 0.8 + yOffset;
      const x3 = mapX + r;
      const y3 = mapY + (1 / 3) * h * 0.8 + yOffset;
      cfg.ctx.beginPath();
      cfg.ctx.moveTo(x1, y1);
      cfg.ctx.lineTo(x2, y2);
      cfg.ctx.lineTo(x3, y3);
      cfg.ctx.closePath();
    };

    if (strength === 1) {
      shapeColor = getCssVariable('--strength-1-color', 'rgba(0, 180, 0, 0.8)');
      drawShapePath = drawSquarePath;
    } else if (strength === 2) {
      shapeColor = getCssVariable(
        '--strength-2-color',
        'rgba(255, 215, 0, 0.8)'
      );
      drawShapePath = drawTrianglePath;
    } else if (strength >= 3) {
      shapeColor = getCssVariable('--strength-3-color', 'rgba(255, 0, 0, 0.8)');
      drawShapePath = drawCirclePath;
    } else {
      shapeColor = getCssVariable(
        '--strength-default-color',
        'rgba(128, 128, 128, 0.8)'
      );
      drawShapePath = drawCirclePath;
    }

    cfg.ctx.fillStyle = shapeColor;
    drawShapePath();
    cfg.ctx.fill();

    cfg.ctx.strokeStyle = outlineColor;
    cfg.ctx.lineWidth = outlineWidthMap;
    drawShapePath();
    cfg.ctx.stroke();

    if (index === cfg.selectedNationIndex) {
      cfg.ctx.strokeStyle = getCssVariable('--selected-border-color', 'cyan');
      cfg.ctx.lineWidth = selectionWidthMap;
      drawShapePath();
      cfg.ctx.stroke();
    }

    // Draw Nation Text
    const textStr = `${nation.name} (${strength})`;
    drawTextWithBackground(
      textStr,
      mapX,
      mapY,
      cfg.nationTextSize(),
      currentDrawRadiusMap
    );
  });

  cfg.ctx.restore();
}

// --- View Manipulation ---
export function clampOffset() {
  if (
    !cfg.mapImage ||
    !cfg.canvas ||
    cfg.mapInfo.width === 0 ||
    cfg.mapInfo.height === 0 ||
    cfg.canvas.width === 0 ||
    cfg.canvas.height === 0
  ) {
    cfg.setOffsetX(0);
    cfg.setOffsetY(0);
    return;
  }
  const mapDisplayWidth = cfg.mapInfo.width * cfg.zoom;
  const mapDisplayHeight = cfg.mapInfo.height * cfg.zoom;
  const canvasWidth = cfg.canvas.width;
  const canvasHeight = cfg.canvas.height;
  let minOffsetX, maxOffsetX;
  if (mapDisplayWidth <= canvasWidth) {
    minOffsetX = maxOffsetX = (cfg.mapInfo.width - canvasWidth / cfg.zoom) / 2;
  } else {
    const allowedBufferX = (canvasWidth * 0.5) / cfg.zoom;
    minOffsetX = -allowedBufferX;
    maxOffsetX = cfg.mapInfo.width - canvasWidth / cfg.zoom + allowedBufferX;
  }
  cfg.setOffsetX(Math.max(minOffsetX, Math.min(cfg.offsetX, maxOffsetX)));
  let minOffsetY, maxOffsetY;
  if (mapDisplayHeight <= canvasHeight) {
    minOffsetY = maxOffsetY =
      (cfg.mapInfo.height - canvasHeight / cfg.zoom) / 2;
  } else {
    const allowedBufferY = (canvasHeight * 0.5) / cfg.zoom;
    minOffsetY = -allowedBufferY;
    maxOffsetY = cfg.mapInfo.height - canvasHeight / cfg.zoom + allowedBufferY;
  }
  cfg.setOffsetY(Math.max(minOffsetY, Math.min(cfg.offsetY, maxOffsetY)));
}

export function resetView() {
  if (cfg.isPanningAnimationActive) return;
  if (
    cfg.mapImage &&
    cfg.mapInfo.width > 0 &&
    cfg.mapInfo.height > 0 &&
    cfg.canvas &&
    cfg.canvas.width > 0 &&
    cfg.canvas.height > 0
  ) {
    const hScale = cfg.canvas.width / cfg.mapInfo.width;
    const vScale = cfg.canvas.height / cfg.mapInfo.height;
    let newZoom = Math.min(hScale, vScale);
    newZoom = Math.max(cfg.minZoom, Math.min(cfg.maxZoom, newZoom));
    cfg.setZoom(newZoom);
    cfg.setOffsetX((cfg.mapInfo.width - cfg.canvas.width / cfg.zoom) / 2);
    cfg.setOffsetY((cfg.mapInfo.height - cfg.canvas.height / cfg.zoom) / 2);
  } else {
    cfg.setZoom(1.0);
    cfg.setOffsetX(0);
    cfg.setOffsetY(0);
  }
  clampOffset();
  updateZoomDisplay();
  redrawCanvas();
}

export function changeZoom(factor) {
  if (
    !cfg.mapImage ||
    cfg.isPanningAnimationActive ||
    !cfg.canvas ||
    !cfg.canvas.width ||
    !cfg.canvas.height
  )
    return;
  const newZoom = Math.max(
    cfg.minZoom,
    Math.min(cfg.maxZoom, cfg.zoom * factor)
  );
  if (newZoom === cfg.zoom) return;
  const centerCanvasX = cfg.canvas.width / 2;
  const centerCanvasY = cfg.canvas.height / 2;
  const centerMapPosBefore = canvasToMapCoords(centerCanvasX, centerCanvasY);
  if (!centerMapPosBefore) return;
  cfg.setZoom(newZoom);
  cfg.setOffsetX(centerMapPosBefore.x - centerCanvasX / cfg.zoom);
  cfg.setOffsetY(centerMapPosBefore.y - centerCanvasY / cfg.zoom);
  clampOffset();
  updateZoomDisplay();
  redrawCanvas();
  const currentMapPos = canvasToMapCoords(centerCanvasX, centerCanvasY);
  if (currentMapPos) {
    cfg.setHoveredNationIndex(getNationAtPos(currentMapPos));
    updateCursor();
  }
}

// --- Smooth Panning Animation ---
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function smoothPanTo(targetMapX, targetMapY, duration = 300) {
  if (
    cfg.isPanningAnimationActive ||
    !cfg.canvas ||
    !cfg.mapImage ||
    !cfg.canvas.width ||
    !cfg.canvas.height
  )
    return;
  cfg.setIsPanningAnimationActive(true);
  updateCursor();
  const startOffsetX = cfg.offsetX;
  const startOffsetY = cfg.offsetY;
  const targetOffsetX = targetMapX - cfg.canvas.width / 2 / cfg.zoom;
  const targetOffsetY = targetMapY - cfg.canvas.height / 2 / cfg.zoom;
  const deltaX = targetOffsetX - startOffsetX;
  const deltaY = targetOffsetY - startOffsetY;
  const startTime = performance.now();
  function step(currentTime) {
    const elapsedTime = currentTime - startTime;
    let rawProgress = Math.min(1, elapsedTime / duration);
    const easedProgress = easeOutCubic(rawProgress);
    const currentOffsetX = startOffsetX + deltaX * easedProgress;
    const currentOffsetY = startOffsetY + deltaY * easedProgress;
    cfg.setOffsetX(currentOffsetX);
    cfg.setOffsetY(currentOffsetY);
    clampOffset();
    redrawCanvas();
    if (rawProgress >= 1) {
      cfg.setIsPanningAnimationActive(false);
      updateCursor();
    } else {
      requestAnimationFrame(step);
    }
  }
  requestAnimationFrame(step);
}

// --- Initial Canvas Size ---
export function setInitialCanvasSize() {
  if (!cfg.canvas || !cfg.canvasContainer) return;
  const newWidth = Math.floor(cfg.canvasContainer.clientWidth);
  const newHeight = Math.floor(cfg.canvasContainer.clientHeight);
  if (cfg.canvas.width !== newWidth || cfg.canvas.height !== newHeight) {
    cfg.canvas.width = newWidth;
    cfg.canvas.height = newHeight;
    if (cfg.mapImage || !cfg.mapImage) {
      redrawCanvas();
    }
  }
  updateZoomDisplay();
}
