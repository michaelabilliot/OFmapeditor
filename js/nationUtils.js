// --- START OF FILE js/nationUtils.js ---
import * as cfg from './config.js';
import { showModal, updateStatus, updateNationList, updateInfoPanel, closeInlineEditor } from './domUtils.js';
import { redrawCanvas } from './canvasUtils.js';

// --- Helper ---
export function generateFlagName(nationName) {
    if (!nationName) return 'unknown_flag';
    // Convert to lowercase, replace spaces with underscores, remove invalid chars, trim underscores
    return nationName
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_') // Replace spaces/whitespace with single underscore
        .replace(/[^a-z0-9_]/g, '') // Remove characters other than letters, numbers, underscore
        .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
}


// --- CRUD Operations ---
export async function handleAddNation(mapPos) {
    if (!mapPos) return;

    const name = await showModal('prompt', 'Add Nation', 'Enter Nation Name:', { placeholder: 'E.g., Kingdom of Example' });
    if (name === null || name.trim() === "") {
        updateStatus("Add nation cancelled.");
        cfg.setSelectedNationIndex(null);
        updateNationList();
        redrawCanvas();
        updateInfoPanel(null);
        return; // Cancelled or empty name
    }

    const trimmedName = name.trim();
    let strength = null;

    // Loop until valid strength or cancel
    while (strength === null) {
        const strengthInput = await showModal('prompt', 'Add Nation', `Enter Strength for "${trimmedName}":`, { defaultValue: '1', inputType: 'number' });

        if (strengthInput === null) {
            updateStatus("Add nation cancelled (strength input).");
             cfg.setSelectedNationIndex(null);
             updateNationList();
             redrawCanvas();
             updateInfoPanel(null);
            return; // User cancelled strength input
        }

        const parsedStrength = parseInt(strengthInput, 10);
        // Validate if it's an integer and the input string matches the parsed number
        if (!isNaN(parsedStrength) && Number.isInteger(parsedStrength) && String(parsedStrength) === strengthInput) {
            strength = parsedStrength; // Valid strength entered
        } else {
            await showModal('alert', 'Invalid Input', 'Strength must be a valid whole number (e.g., 0, 1, 5).');
            // Loop continues
        }
    }

    // Add the new nation
    const newNation = {
        coordinates: [mapPos.x, mapPos.y],
        name: trimmedName,
        strength: strength,
        // Initialize flag fields to null
        flag: null, // Initially no flag name specified
        flagImage: null,
        flagData: null,
        flagDataType: null,
        flagWidth: null,
        flagHeight: null
    };
    cfg.nations.push(newNation);

    // Select the newly added nation
    const newIndex = cfg.nations.length - 1;
    cfg.setSelectedNationIndex(newIndex);

    updateStatus(`Added nation: "${trimmedName}".`);
    updateNationList();
    redrawCanvas();
    updateInfoPanel(newIndex); // Show info for the new nation
}


export async function handleDeleteNation(event) {
    // Can be called from list button (event provided) or keypress (no event)
    let indexToDelete = -1;

    if (event && event.target && event.target.dataset.index) {
         // Called from list delete button
         indexToDelete = parseInt(event.target.dataset.index, 10);
    } else if (cfg.selectedNationIndex !== null) {
         // Called from keypress (Delete/Backspace)
         indexToDelete = cfg.selectedNationIndex;
    }


    if (isNaN(indexToDelete) || indexToDelete < 0 || indexToDelete >= cfg.nations.length) {
        console.warn("Invalid index for deletion:", indexToDelete);
        return;
    }

    const nationName = cfg.nations[indexToDelete]?.name || `Nation at index ${indexToDelete}`; // Handle potential missing nation

    const confirmDelete = await showModal('confirm', 'Delete Nation', `Are you sure you want to delete "${nationName}"?`, { confirmText: 'Delete', denyText: 'Cancel' });

    if (confirmDelete) {
        const deletedName = cfg.nations[indexToDelete]?.name || "Unknown"; // Get name before splicing
        cfg.nations.splice(indexToDelete, 1); // Remove the nation

        // Update selection and editing state
        if (cfg.selectedNationIndex === indexToDelete) {
            cfg.setSelectedNationIndex(null);
            closeInlineEditor();
            updateInfoPanel(null);
        } else if (cfg.selectedNationIndex !== null && cfg.selectedNationIndex > indexToDelete) {
            // Adjust selection index if it was after the deleted one
            cfg.setSelectedNationIndex(cfg.selectedNationIndex - 1);
            // updateInfoPanel(cfg.selectedNationIndex); // Update panel if selection changed
        }

        // Adjust inline edit index if necessary
         if (cfg.nationIndexBeingEdited === indexToDelete) {
             closeInlineEditor(); // Close editor if the edited item was deleted
         } else if (cfg.nationIndexBeingEdited !== null && cfg.nationIndexBeingEdited > indexToDelete) {
             cfg.setNationIndexBeingEdited(cfg.nationIndexBeingEdited - 1);
         }


        updateStatus(`Deleted "${deletedName}".`);
        updateNationList();
        redrawCanvas();
         // Update info panel based on potentially changed selection
         updateInfoPanel(cfg.selectedNationIndex);
    }
    // else: User cancelled deletion
}


export async function saveInlineEdit() {
    const editIndex = cfg.nationIndexBeingEdited; // Use the state variable

    if (editIndex === null || editIndex < 0 || editIndex >= cfg.nations.length) {
        console.warn("Attempted to save inline edit with invalid index:", editIndex);
        closeInlineEditor();
        return;
    }

    const nation = cfg.nations[editIndex];
    if (!nation) {
         console.error("Nation data missing for index being edited:", editIndex);
         closeInlineEditor();
         return;
    }


    const newName = cfg.inlineEditName.value.trim();
    const newStrengthStr = cfg.inlineEditStrength.value;
    const newStrength = parseInt(newStrengthStr, 10);

    // --- Validation ---
    if (!newName) {
        await showModal('alert', 'Validation Error', 'Nation name cannot be empty.');
        cfg.inlineEditName.focus(); // Keep focus on the problematic field
        return; // Stop saving
    }
    if (isNaN(newStrength) || !Number.isInteger(newStrength) || String(newStrength) !== newStrengthStr) {
        await showModal('alert', 'Validation Error', 'Strength must be a valid whole number.');
        cfg.inlineEditStrength.focus();
        return; // Stop saving
    }

    // --- Apply Changes ---
    const oldName = nation.name;
    let nameChanged = oldName !== newName;

    nation.name = newName;
    nation.strength = newStrength;

    // If name changed, update the 'flag' base name (but keep existing flagData/Image)
    if (nameChanged && nation.flag) { // Only update if a flag was already associated
        const oldFlagName = nation.flag;
        const newFlagName = generateFlagName(newName);
        if (newFlagName !== oldFlagName) {
             nation.flag = newFlagName;
             console.log(`Nation name changed for index ${editIndex}. Updated flag base name from '${oldFlagName}' to: '${newFlagName}'. Flag data remains.`);
             // Update info panel immediately if this nation is selected
             if (cfg.selectedNationIndex === editIndex) {
                 updateInfoPanel(editIndex);
             }
        }
    }

    updateStatus(`Updated nation: "${newName}".`);
    closeInlineEditor(); // Close panel on successful save
    updateNationList(); // Update list display
    redrawCanvas(); // Redraw map with new name/strength/flagname
    updateInfoPanel(editIndex); // Refresh info panel for the edited nation
}


// --- END OF FILE js/nationUtils.js ---