// =====================================================
// Shared checklist logic
// Used by any page with a set of [data-checklist-item]
// checkboxes, a #checklist-count label, and a
// #checklist-submit-btn / #checklist-submit-status pair.
//
// Submission does not require every item to be checked —
// a student who was only shown some of the items (a rushed
// orientation, a session that ran out of time) should still
// be able to record exactly how many, rather than having
// nothing recorded at all until everything is confirmed.
// The saved count always reflects reality (e.g. "4 of 7"),
// never silently rounded up.
//
// The container needs a data-save-key attribute (e.g.
// data-save-key="orientation") to say what this checklist
// should be labelled as when saved.
// =====================================================

const checkboxes = document.querySelectorAll('[data-checklist-item]');
const countLabel = document.getElementById('checklist-count');
const checklistContainer = document.getElementById('checklist');
const submitBtn = document.getElementById('checklist-submit-btn');
const submitStatus = document.getElementById('checklist-submit-status');

let submitted = false;

checkboxes.forEach((box) => {
    box.addEventListener('change', updateChecklistProgress);
});

if (submitBtn) {
    submitBtn.addEventListener('click', handleSubmit);
}

function updateChecklistProgress() {
    const total = checkboxes.length;
    const checked = Array.from(checkboxes).filter((box) => box.checked).length;

    if (countLabel) {
        countLabel.textContent = `${checked} of ${total} confirmed`;
    }

    if (submitBtn) {
        submitBtn.disabled = checked === 0;
        // Any change after a submit means the record is now out of
        // date — let them submit again to update it.
        if (submitted) {
            submitted = false;
            submitBtn.textContent = 'Submit checklist';
        }
    }

    if (submitStatus) {
        showStatus('', '');
    }
}

async function handleSubmit() {
    const saveKey = checklistContainer?.dataset.saveKey;
    const total = checkboxes.length;
    const checked = Array.from(checkboxes).filter((box) => box.checked).length;

    // Check sign-in state up front, before attempting anything, so the
    // student gets an honest answer immediately rather than a delay.
    if (!window.Auth?.currentUser) {
        showStatus('You are not logged in, so this will not be saved. Log in, then submit again.', 'error');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting\u2026';
    showStatus('', '');

    const items = Array.from(checkboxes).map((box) => ({
        label: box.closest('label') ? box.closest('label').textContent.trim() : '',
        confirmed: box.checked
    }));

    const result = saveKey
        ? await window.Auth.saveReading(saveKey, 'checklist', { confirmed: checked, total, items })
        : null;

    if (result) {
        submitted = true;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submitted \u2713';
        showStatus(
            checked === total
                ? 'Submitted \u2014 all items confirmed. Your supervisor can see this.'
                : `Submitted \u2014 ${checked} of ${total} confirmed. Your supervisor can see this.`,
            'success'
        );
    } else {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit checklist';
        showStatus('Could not save \u2014 check your connection and try again.', 'error');
    }
}

function showStatus(text, kind) {
    if (!submitStatus) return;
    submitStatus.textContent = text;
    submitStatus.className = 'checklist-submit-status' + (kind ? ` checklist-submit-status--${kind}` : '');
}
