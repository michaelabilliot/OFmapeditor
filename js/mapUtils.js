import * as cfg from './config.js';
import {
  updateStatus,
  showModal,
  updateNationList,
  updateInfoPanel,
  closeInlineEditor,
  toggleColorizerControls,
} from './domUtils.js';
import {
  redrawCanvas,
  resetView,
  setInitialCanvasSize,
} from './canvasUtils.js';

// A helper for linear interpolation of colors
function lerpColor(colorA, colorB, amount) {
  const a = { r: colorA.r, g: colorA.g, b: colorA.b };
  const b = { r: colorB.r, g: colorB.g, b: colorB.b };
  const result = {
    r: Math.round(a.r + (b.r - a.r) * amount),
    g: Math.round(a.g + (b.g - a.g) * amount),
    b: Math.round(a.b + (b.b - a.b) * amount),
  };
  return result;
}

/**
 * Colorizes a loaded map image based on specific blue channel values and slider thresholds.
 *
 * @param {HTMLImageElement} sourceImage - The fully loaded source image.
 * @param {string} imageType - The original MIME type (e.g., 'image/png').
 * @param {object} thresholds - An object with { low, mid, high } values from sliders.
 * @returns {Promise<string>} A Promise resolving with the Data URL of the colorized image.
 */
export async function colorizeLoadedMap(sourceImage, imageType, thresholds) {
  return new Promise((resolve, reject) => {
    if (
      !sourceImage ||
      !sourceImage.complete ||
      sourceImage.naturalWidth === 0
    ) {
      return reject(
        new Error('Invalid source image provided for colorization.')
      );
    }
    if (!thresholds) {
      return reject(new Error('Colorization thresholds not provided.'));
    }
    updateStatus('Colorizing map...'); // Update status

    const width = sourceImage.naturalWidth;
    const height = sourceImage.naturalHeight;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return reject(new Error('Could not get 2D context for colorization.'));
    }

    try {
      ctx.drawImage(sourceImage, 0, 0);
      let imageData;
      try {
        imageData = ctx.getImageData(0, 0, width, height);
      } catch (imageDataError) {
        console.error('Failed to get image data from canvas:', imageDataError);
        return reject(
          new Error('Could not read pixel data from the map image.')
        );
      }

      const data = imageData.data;

      // --- Define Color Palette ---
      const waterColor = { r: 0, g: 0, b: 106 };
      const plainsColor = { r: 190, g: 220, b: 140 };
      const highlandsColor = { r: 210, g: 200, b: 160 }; // A mid-tier color
      const mountainsColor = { r: 230, g: 230, b: 180 }; // A high-tier color
      const peakColor = { r: 245, g: 245, b: 200 };

      // --- Get thresholds from sliders ---
      const lowThreshold = thresholds.low;
      const midThreshold = thresholds.mid;
      const highThreshold = thresholds.high;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        let newR, newG, newB;

        // --- Apply Robust Color Logic ---
        // Water is pure black, very transparent, or a specific blue range (legacy). NOT affected by sliders.
        if (
          a < 20 ||
          (r === 0 && g === 0 && b === 0) ||
          (b >= 104 && b <= 108)
        ) {
          newR = waterColor.r;
          newG = waterColor.g;
          newB = waterColor.b;
        } else {
          // Terrain coloring is based on the blue channel value (grayscale intensity)
          const intensity = b;
          let finalColor;

          if (intensity <= lowThreshold) {
            finalColor = plainsColor;
          } else if (intensity <= midThreshold) {
            const amount =
              (intensity - lowThreshold) / (midThreshold - lowThreshold);
            finalColor = lerpColor(plainsColor, highlandsColor, amount);
          } else if (intensity <= highThreshold) {
            const amount =
              (intensity - midThreshold) / (highThreshold - midThreshold);
            finalColor = lerpColor(highlandsColor, mountainsColor, amount);
          } else {
            // intensity > highThreshold
            const amount = Math.min(
              1,
              (intensity - highThreshold) / (255 - highThreshold)
            ); // Clamp amount
            finalColor = lerpColor(mountainsColor, peakColor, amount);
          }
          newR = finalColor.r;
          newG = finalColor.g;
          newB = finalColor.b;
        }

        data[i] = newR;
        data[i + 1] = newG;
        data[i + 2] = newB;
        data[i + 3] = 255;
      }

      ctx.putImageData(imageData, 0, 0);

      const validImageType = imageType?.startsWith('image/')
        ? imageType
        : 'image/png';
      let dataUrl;
      try {
        dataUrl = canvas.toDataURL(validImageType);
      } catch (dataUrlError) {
        console.error('Failed to generate Data URL from canvas:', dataUrlError);
        return reject(
          new Error(
            'Could not convert the processed map to a displayable format.'
          )
        );
      }

      updateStatus('Map colorization complete. Adjust sliders or confirm.');
      resolve(dataUrl);
    } catch (error) {
      console.error('Unexpected error during map colorization:', error);
      updateStatus('Error during map colorization.', true);
      reject(error);
    }
  });
}

/** Handles loading and setting up the map image for colorization */
export async function handleMapImageLoad(file) {
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    await showModal(
      'alert',
      'Invalid File Type',
      `Selected file (${file.name}) does not appear to be an image.`
    );
    updateStatus('Invalid map file type.', true);
    return;
  }

  updateStatus(`Loading map image: ${file.name}...`);
  const reader = new FileReader();

  reader.onload = async (e) => {
    if (!e.target?.result) {
      await showModal(
        'alert',
        'File Read Error',
        'Could not read the selected image file.'
      );
      updateStatus('Error reading map file.', true);
      return;
    }

    const tempImage = new Image();
    tempImage.onload = async () => {
      if (tempImage.naturalWidth === 0 || tempImage.naturalHeight === 0) {
        await showModal(
          'alert',
          'Image Load Error',
          `The image file (${file.name}) loaded but has invalid dimensions (0x0).`
        );
        updateStatus('Error: Map image has zero dimensions.', true);
        return;
      }

      // --- THIS IS THE NEW PART 1: Initial Setup ---
      // Store the original, un-colorized image. This is crucial for re-colorizing.
      cfg.setOriginalMapImage(tempImage);

      // Store original file info in the global state immediately.
      // This will be used when the user confirms the colorization.
      cfg.setMapInfo({
        name: file.name.split('.').slice(0, -1).join('.') || 'Untitled Map',
        width: tempImage.naturalWidth,
        height: tempImage.naturalHeight,
        fileName: file.name,
        fileType: file.type,
      });

      // Perform an initial colorization with default slider values.
      try {
        const defaultThresholds = {
          low: parseInt(cfg.lowRangeSlider.value, 10),
          mid: parseInt(cfg.midRangeSlider.value, 10),
          high: parseInt(cfg.highRangeSlider.value, 10),
        };
        const colorizedDataUrl = await colorizeLoadedMap(
          cfg.originalMapImage,
          file.type,
          defaultThresholds
        );

        // Create a temporary image for the initial display.
        // This will be replaced as the user moves the sliders.
        const displayImage = new Image();
        displayImage.onload = () => {
          cfg.setMapImage(displayImage); // Set the global map image for drawing.
          setInitialCanvasSize(); // Set canvas size based on container.
          resetView(); // Fit the new map preview in the view.
          redrawCanvas(); // Draw the initial colorized map.

          // Show the colorizer controls to the user.
          showModal(
            'alert',
            'Adjust Colors',
            'The map has been colorized. Use the sliders at the top to adjust the terrain zones, then click "Confirm Colors" to start editing. WARNING: MAPS THAT ARE BIG *WILL* LAG. '
          );
          toggleColorizerControls(true);
        };
        displayImage.onerror = () => {
          throw new Error('Failed to load the initial colorized map data.');
        };
        displayImage.src = colorizedDataUrl;
      } catch (error) {
        console.error('Error during initial map colorization:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'An unknown error occurred.';
        await showModal(
          'alert',
          'Map Processing Error',
          `Failed to colorize the map: ${errorMessage}`
        );
        updateStatus(`Error processing map image: ${errorMessage}`, true);
        cfg.setOriginalMapImage(null); // Clear on error
      }
    };
    tempImage.onerror = async () => {
      await showModal(
        'alert',
        'Image Load Error',
        `Error loading the selected image file (${file.name}).`
      );
      updateStatus('Error loading initial map image.', true);
    };
    tempImage.src = e.target.result.toString();
  };
  reader.onerror = async () => {
    await showModal(
      'alert',
      'File Read Error',
      'An error occurred while trying to read the selected map file.'
    );
    updateStatus('Error reading map file.', true);
  };
  reader.readAsDataURL(file);
}

/** Finalizes the map loading process after colorization is confirmed. */
export function finalizeMapLoad() {
  if (!cfg.mapImage || !cfg.mapInfo) {
    updateStatus('Cannot finalize map, essential data is missing.', true);
    return;
  }
  // --- This is the logic that used to be deep inside handleMapImageLoad ---

  // --- Reset editor state for the new map ---
  cfg.setNations([]); // Clear existing nations
  cfg.setSelectedNationIndex(null);
  cfg.setDraggingNation(false);
  cfg.setIsPanning(false);
  cfg.setPotentialPan(false);
  if (cfg.nationIndexBeingEdited !== null) closeInlineEditor(); // Ensure editor is closed

  // Canvas size and view are already set from the preview, but we can re-clamp.
  resetView(); // Reset zoom/pan to fit the new map

  // --- Update UI element states ---
  if (cfg.jsonLoadLabel) cfg.jsonLoadLabel.removeAttribute('data-disabled'); // Enable JSON load
  if (cfg.saveButton) cfg.saveButton.disabled = false; // Enable Save
  if (cfg.loadFlagsButton) cfg.loadFlagsButton.disabled = false; // Enable Load Flags
  if (cfg.jsonLoadInput) cfg.jsonLoadInput.value = ''; // Clear file input selection

  updateStatus(
    `Map ready: ${cfg.mapInfo.fileName} (${cfg.mapInfo.width}x${cfg.mapInfo.height}).`
  );
  updateNationList(); // Update list (will show empty)
  updateInfoPanel(null); // Clear info panel
  redrawCanvas(); // Final redraw

  // Hide the colorizer controls
  toggleColorizerControls(false);
}
