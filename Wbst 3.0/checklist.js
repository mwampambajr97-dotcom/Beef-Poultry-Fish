// =====================================================
// Shared checklist logic
// Used by any page with a set of [data-checklist-item]
// checkboxes and a #checklist-count label. The optional
// #checklist-complete block is only present on some pages
// (e.g. Orientation) — guarded so this works either way.
// =====================================================

const checkboxes = document.querySelectorAll('[data-checklist-item]');
const countLabel = document.getElementById('checklist-count');
const completeBlock = document.getElementById('checklist-complete');

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
}
