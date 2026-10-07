// =====================================================
// Shared checklist logic
// Used by any page with a set of [data-checklist-item]
// checkboxes, a #checklist-count label, and a
// #checklist-submit-btn / #checklist-submit-status pair.
//
// The submit button stays disabled until every item is
// checked, then the student has to actively press it —
// nothing saves silently in the background. The container
// needs a data-save-key attribute (e.g.
// data-save-key="orientation") to say what this checklist
// should be labelled as when saved.
// =====================================================

const checkboxes = document.querySelectorAll('[data-checklist-item]');
const countLabel = document.getElementById('checklist-count');
const checklistContainer = document.getElementById('checklist');
const submitBtn = document.getElementById('checklist-submit-btn');
const submitStatus = document.getElementById('checklist-submit-status');

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
        const allChecked = checked === total;
        submitBtn.disabled = !allChecked;
        // If something gets unchecked after a submit, make it resubmittable.
        if (!allChecked && submitBtn.textContent === 'Submitted \u2713') {
            submitBtn.textContent = 'Submit checklist';
        }
    }

    if (submitStatus && checked !== total) {
        submitStatus.textContent = '';
        submitStatus.className = 'checklist-submit-status';
    }
}

async function handleSubmit() {
    const saveKey = checklistContainer?.dataset.saveKey;

    // Check sign-in state up front, before attempting anything, so the
    // student gets an honest answer immediately rather than a delay.
    if (!window.Auth?.currentUser) {
        showStatus('You are not logged in, so this will not be saved. Log in, then submit again.', 'error');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting\u2026';
    showStatus('', '');

    const items = Array.from(checkboxes).map((box) => {
        const label = box.closest('label');
        return label ? label.textContent.trim() : '';
    });

    const total = checkboxes.length;
    const result = saveKey
        ? await window.Auth.saveReading(saveKey, 'checklist', { confirmed: total, total, items })
        : null;

    if (result) {
        submitBtn.textContent = 'Submitted \u2713';
        showStatus('Submitted. Your supervisor can see this was confirmed.', 'success');
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
