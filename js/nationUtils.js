// --- START OF FILE js/nationUtils.js ---
import * as cfg from './config.js';
import { showModal, updateStatus, updateNationList, updateInfoPanel, closeInlineEditor } from './domUtils.js';
import { redrawCanvas } from './canvasUtils.js';

// --- Helper ---
/**
 * Generates a sanitized, lowercase, underscore-separated string suitable for use
 * as a base filename for flags, derived from the nation name.
 * @param {string} nationName - The name of the nation.
 * @returns {string} A sanitized string (e.g., "My Nation!" becomes "my_nation"). Returns 'unknown_flag' if name is empty.
 */
export function generateFlagName(nationName) {
    if (!nationName || typeof nationName !== 'string' || nationName.trim() === '') {
        return 'unknown_flag';
    }
    // Convert to lowercase, replace whitespace with underscores, remove invalid chars, trim underscores
    return nationName
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_') // Replace sequences of whitespace with a single underscore
        .replace(/[^a-z0-9_]/g, '') // Remove characters other than lowercase letters, numbers, underscore
        .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
}


// --- CRUD Operations ---

/** Handles the process of adding a new nation via user prompts */
export async function handleAddNation(mapPos) {
    if (!mapPos) {
        console.error("handleAddNation called without map position.");
        return;
    }

    // 1. Get Nation Name
    const nameInput = await showModal('prompt', 'Add Nation', 'Enter Nation Name:', { placeholder: 'E.g., Kingdom of Example' });
    // User cancelled or entered empty name
    if (nameInput === null || nameInput.trim() === "") {
        updateStatus("Add nation cancelled.");
        // Ensure no lingering selection from the click that triggered add
        if (cfg.selectedNationIndex !== null) {
            cfg.setSelectedNationIndex(null);
            redrawCanvas();
            updateNationList();
            updateInfoPanel(null);
        }
        return;
    }
    const trimmedName = nameInput.trim();

    // 2. Get Nation Strength (with validation loop)
    let strength = null;
    while (strength === null) {
        const strengthInput = await showModal('prompt', 'Add Nation', `Enter Strength for "${trimmedName}":`, { defaultValue: '1', inputType: 'number' });

        // User cancelled strength input
        if (strengthInput === null) {
            updateStatus(`Add nation '${trimmedName}' cancelled (strength input).`);
            if (cfg.selectedNationIndex !== null) cfg.setSelectedNationIndex(null); // Clear selection if any
            redrawCanvas(); updateNationList(); updateInfoPanel(null);
            return;
        }

        const parsedStrength = parseInt(strengthInput, 10);
        // Validate: Must be an integer, and the input string must strictly match the parsed number
        if (!isNaN(parsedStrength) && Number.isInteger(parsedStrength) && String(parsedStrength) === strengthInput.trim()) {
            strength = parsedStrength; // Valid strength obtained
        } else {
            await showModal('alert', 'Invalid Input', 'Strength must be a valid whole number (e.g., 0, 1, 5, -2).');
            // Loop continues to re-prompt for strength
        }
    }

    // 3. Create and Add the New Nation Object
    const newNation = {
        coordinates: [mapPos.x, mapPos.y],
        name: trimmedName,
        strength: strength,
        // Initialize flag fields to null - flag name is not set automatically on add
        flag: null,          // Base name for flag file (e.g., 'kingdom_of_example')
        flagImage: null,     // The HTMLImageElement used for drawing (usually a resized bitmap)
        flagData: null,      // Original flag data (SVG text or raster DataURL)
        flagDataType: null,  // Original type ('svg', 'png', 'jpeg', etc.)
        flagWidth: null,     // Original width
        flagHeight: null     // Original height
    };
    cfg.nations.push(newNation);

    // 4. Update State and UI
    const newIndex = cfg.nations.length - 1;
    cfg.setSelectedNationIndex(newIndex); // Select the newly added nation

    updateStatus(`Added nation: "${trimmedName}".`);
    updateNationList(); // Update list to include the new nation
    redrawCanvas(); // Redraw map to show the new nation marker
    updateInfoPanel(newIndex); // Show info panel for the new nation
}

/** Handles deleting a nation, confirming with the user first */
export async function handleDeleteNation(event) {
    // Determine index to delete based on event source or current selection
    let indexToDelete = -1;
    let source = 'unknown';

    if (event && event.target && event.target.dataset.index !== undefined) {
         // Called from list delete button '✖'
         indexToDelete = parseInt(event.target.dataset.index, 10);
         source = 'list_button';
    } else if (cfg.selectedNationIndex !== null) {
         // Called from keypress (Delete/Backspace) or potentially other UI trigger
         indexToDelete = cfg.selectedNationIndex;
         source = 'selection';
    }

    // Validate the index
    if (isNaN(indexToDelete) || indexToDelete < 0 || indexToDelete >= cfg.nations.length) {
        console.warn(`Invalid index for deletion attempt. Index: ${indexToDelete}, Source: ${source}`);
        if (source === 'selection') {
             await showModal('alert', 'Delete Error', 'No nation selected to delete.');
        }
        return;
    }

    // Get nation name for confirmation dialog (handle potential missing data)
    const nationName = cfg.nations[indexToDelete]?.name || `Nation at index ${indexToDelete}`;

    // Confirm deletion with the user
    const confirmDelete = await showModal('confirm', 'Delete Nation', `Are you sure you want to delete "${nationName}"? This cannot be undone.`, { confirmText: 'Delete Permanently', denyText: 'Cancel' });

    if (confirmDelete) {
        const deletedName = cfg.nations[indexToDelete]?.name || "Unknown"; // Get name before splicing
        cfg.nations.splice(indexToDelete, 1); // Remove the nation from the array

        // --- Update selection and editing state ---
        const oldSelectedIndex = cfg.selectedNationIndex;
        const oldEditIndex = cfg.nationIndexBeingEdited;

        // If the deleted item was being edited, close the editor
        if (oldEditIndex === indexToDelete) {
            closeInlineEditor(); // This also sets nationIndexBeingEdited to null
        } else if (oldEditIndex !== null && oldEditIndex > indexToDelete) {
            // Adjust edit index if it was after the deleted one
            cfg.setNationIndexBeingEdited(oldEditIndex - 1);
        }

        // If the deleted item was selected, clear selection and info panel
        if (oldSelectedIndex === indexToDelete) {
            cfg.setSelectedNationIndex(null);
            updateInfoPanel(null);
        } else if (oldSelectedIndex !== null && oldSelectedIndex > indexToDelete) {
            // Adjust selection index if it was after the deleted one
            cfg.setSelectedNationIndex(oldSelectedIndex - 1);
        }

        // --- Update UI ---
        updateStatus(`Deleted "${deletedName}".`);
        updateNationList(); // Rebuild list with updated indices
        redrawCanvas(); // Redraw map without the deleted nation
        updateInfoPanel(cfg.selectedNationIndex); // Update info panel based on final selection state
    }
    // else: User cancelled deletion, do nothing
}

/** Saves changes made in the inline editor popup */
export async function saveInlineEdit() {
    const editIndex = cfg.nationIndexBeingEdited; // Use the state variable

    // Validate edit index and corresponding nation data
    if (editIndex === null || editIndex < 0 || editIndex >= cfg.nations.length) {
        console.warn("Attempted to save inline edit with invalid index:", editIndex);
        closeInlineEditor(); // Close editor as state is inconsistent
        return;
    }
    const nation = cfg.nations[editIndex];
    if (!nation) {
         console.error("Nation data missing for index being edited:", editIndex);
         closeInlineEditor();
         return;
    }
    // Check if editor input elements exist
    if (!cfg.inlineEditName || !cfg.inlineEditStrength) {
         console.error("Inline editor input elements not found.");
         closeInlineEditor();
         return;
    }

    // --- Get and Validate Inputs ---
    const newName = cfg.inlineEditName.value.trim();
    const newStrengthStr = cfg.inlineEditStrength.value.trim(); // Trim strength input too
    const newStrength = parseInt(newStrengthStr, 10);

    if (!newName) {
        await showModal('alert', 'Validation Error', 'Nation name cannot be empty.');
        cfg.inlineEditName.focus(); // Keep focus on the problematic field
        cfg.inlineEditName.select();
        return; // Stop saving
    }
    // Validate strength (integer, strict match)
    if (isNaN(newStrength) || !Number.isInteger(newStrength) || String(newStrength) !== newStrengthStr) {
        await showModal('alert', 'Validation Error', 'Strength must be a valid whole number (e.g., 0, 1, 5, -2).');
        cfg.inlineEditStrength.focus();
        cfg.inlineEditStrength.select();
        return; // Stop saving
    }

    // --- Apply Changes ---
    const oldName = nation.name;
    const nameChanged = oldName !== newName;
    const strengthChanged = nation.strength !== newStrength;

    // Only proceed if something actually changed
    if (!nameChanged && !strengthChanged) {
        updateStatus("No changes detected.");
        closeInlineEditor();
        return;
    }

    nation.name = newName;
    nation.strength = newStrength;

    // --- Handle Flag Name Update (if name changed and flag exists) ---
    if (nameChanged && nation.flag) { // Only update if a flag name was already associated
        const oldFlagName = nation.flag;
        const newFlagName = generateFlagName(newName); // Generate new base name

        if (newFlagName && newFlagName !== oldFlagName) {
             nation.flag = newFlagName; // Update the base name reference
             console.log(`Nation name changed (index ${editIndex}). Updated flag base name from '${oldFlagName}' to '${newFlagName}'. Flag data/image remain associated.`);
             // Update info panel immediately if this nation is selected, to show the new expected flag name
             if (cfg.selectedNationIndex === editIndex) {
                 updateInfoPanel(editIndex);
             }
        } else if (!newFlagName) {
             console.warn(`Could not generate a valid flag name for new nation name '${newName}'. Keeping old flag name '${oldFlagName}'.`);
        }
    }

    // --- Update UI ---
    updateStatus(`Updated nation: "${newName}".`);
    closeInlineEditor(); // Close panel on successful save
    updateNationList(); // Update list display (name/strength)
    redrawCanvas(); // Redraw map (marker shape might change due to strength, text updates)
    // Update info panel based on potentially changed selection or flag name
    if (cfg.selectedNationIndex === editIndex) {
        updateInfoPanel(editIndex);
    }
}


// --- END OF FILE js/nationUtils.js ---