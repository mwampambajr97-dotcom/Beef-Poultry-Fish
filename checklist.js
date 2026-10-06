// =====================================================
// Shared checklist logic
// Used by any page with a set of [data-checklist-item]
// checkboxes and a #checklist-count label. The optional
// #checklist-complete block is only present on some pages
// (e.g. Orientation) — guarded so this works either way.
//
// Saving: a checklist represents one completion event, not
// a series of independent readings like the instrument pages.
// So this saves ONCE, the moment it first reaches 100% — not
// on every single checkbox click, which would otherwise create
// a new database entry per click. The container element needs
// a data-save-key attribute (e.g. data-save-key="orientation")
// to say what this checklist should be labelled as when saved;
// if that attribute is missing, saving is simply skipped.
// =====================================================

const checkboxes = document.querySelectorAll('[data-checklist-item]');
const countLabel = document.getElementById('checklist-count');
const completeBlock = document.getElementById('checklist-complete');
const checklistContainer = document.getElementById('checklist');

let alreadySaved = false;

checkboxes.forEach((box) => {
    box.addEventListener('change', updateChecklistProgress);
});

function updateChecklistProgress() {
    const total = checkboxes.length;
    const checked = Array.from(checkboxes).filter((box) => box.checked).length;

    if (countLabel) {
        countLabel.textContent = `${checked} of ${total} confirmed`;
    }

    if (completeBlock) {
        completeBlock.hidden = checked !== total;
    }

    if (checked === total && !alreadySaved) {
        alreadySaved = true;
        saveCompletion(checked, total);
    }

    // If someone unchecks an item after completing it, allow a fresh
    // save next time they get back to 100% (e.g. they fixed a mistake).
    if (checked !== total) {
        alreadySaved = false;
    }
}

function saveCompletion(checked, total) {
    const saveKey = checklistContainer?.dataset.saveKey;
    if (!saveKey) return; // no key set on this page — nothing to save against

    const items = Array.from(checkboxes).map((box) => {
        const label = box.closest('label');
        return label ? label.textContent.trim() : '';
    });

    window.Auth?.saveReading(saveKey, 'checklist', { confirmed: checked, total, items });
}
