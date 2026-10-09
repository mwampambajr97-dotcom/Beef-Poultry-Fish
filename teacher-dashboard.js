// =====================================================
// Teacher Dashboard
// Waits for auth.js to confirm who is signed in, then either
// shows real student data (if the signed-in account is a
// teacher), or a plain explanation if not. The real access
// control is enforced by Firestore's security rules — this
// script's role check is just so a student sees a clear
// message instead of a confusing permissions error.
//
// Two distinct kinds of record are shown here:
// - "Simulation activity" (readings): generated automatically
//   by the app as students practise. Proves practice happened,
//   nothing more.
// - "Real lab completions": only ever created by a teacher,
//   through the form on this page, after actually witnessing
//   a student complete the real practical. The app has no way
//   to generate these on its own.
// =====================================================

const stateBox = document.getElementById('dashboard-state');

const markCard = document.getElementById('mark-completion-card');
const completionForm = document.getElementById('completion-form');
const studentSelect = document.getElementById('completion-student');
const practicalSelect = document.getElementById('completion-practical');
const noteInput = document.getElementById('completion-note');
const completionSubmitBtn = document.getElementById('completion-submit-btn');
const completionStatus = document.getElementById('completion-status');

const completionsSection = document.getElementById('completions-section');
const completionsCount = document.getElementById('completions-count');
const completionsBody = document.getElementById('completions-body');

const summaryCard = document.getElementById('summary-card');
const summaryText = document.getElementById('summary-text');
const readingsSection = document.getElementById('readings-section');
const readingsCount = document.getElementById('readings-count');
const readingsBody = document.getElementById('readings-body');

window.addEventListener('auth-ready', async (event) => {
    const { user, profile } = event.detail;

    if (!user) {
        showMessage('You need to log in to view this page.');
        return;
    }

    if (!profile || profile.role !== 'teacher') {
        showMessage('This page is for teacher accounts only.');
        return;
    }

    const [studentsRes, completionsRes, readingsRes] = await Promise.allSettled([
        window.Auth.getAllStudents(),
        window.Auth.getAllCompletions(),
        window.Auth.getAllReadings()
    ]);

    // Simulation activity is the page's baseline. If even that can't
    // load, there is nothing useful to show.
    if (readingsRes.status === 'rejected') {
        console.error(readingsRes.reason);
        showMessage('Could not load student data. Check your connection and try refreshing.');
        return;
    }

    stateBox.hidden = true;
    stateBox.innerHTML = '';
    renderReadings(readingsRes.value);

    // Completions are loaded separately so that a problem with them
    // (for example, new security rules not yet published) doesn't take
    // the whole dashboard down with it.
    if (studentsRes.status === 'fulfilled' && completionsRes.status === 'fulfilled') {
        populateStudentSelect(studentsRes.value);
        markCard.hidden = false;
        renderCompletions(completionsRes.value);
    } else {
        console.error(studentsRes.reason || completionsRes.reason);
        document.getElementById('completions-unavailable').hidden = false;
    }
});

completionForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const option = studentSelect.selectedOptions[0];
    const studentUid = studentSelect.value;
    const studentName = option ? option.textContent : '';
    const practical = practicalSelect.value;
    const note = noteInput.value.trim();

    if (!studentUid) return;

    completionSubmitBtn.disabled = true;
    completionSubmitBtn.textContent = 'Saving\u2026';
    setCompletionStatus('', '');

    try {
        await window.Auth.markCompletion(studentUid, studentName, practical, note);
        setCompletionStatus(`Marked \u2014 ${studentName}, ${practicalLabel(practical)}.`, 'success');
        noteInput.value = '';
        studentSelect.selectedIndex = 0;

        const completions = await window.Auth.getAllCompletions();
        renderCompletions(completions);
    } catch (err) {
        console.error(err);
        setCompletionStatus('Could not save this. Check your connection and try again.', 'error');
    } finally {
        completionSubmitBtn.disabled = false;
        completionSubmitBtn.textContent = 'Mark as completed';
    }
});

function showMessage(text) {
    stateBox.innerHTML = `<p class="disclaimer-note">${escapeHtml(text)}</p>`;
}

function setCompletionStatus(text, kind) {
    completionStatus.textContent = text;
    completionStatus.className = 'checklist-submit-status' + (kind ? ` checklist-submit-status--${kind}` : '');
}

function populateStudentSelect(students) {
    const sorted = [...students].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const options = sorted.map((s) => `<option value="${escapeHtml(s.uid)}">${escapeHtml(s.name || s.email || 'Unnamed')}</option>`);
    studentSelect.innerHTML = `<option value="" disabled selected>Choose a student&hellip;</option>` + options.join('');
}

function renderCompletions(completions) {
    completionsCount.textContent = `${completions.length} completion${completions.length === 1 ? '' : 's'}`;
    completionsBody.innerHTML = completions.length
        ? completions.map(completionRowHtml).join('')
        : `<tr><td colspan="5" class="specimen-empty">No real-lab completions marked yet.</td></tr>`;
    completionsSection.hidden = false;
}

function completionRowHtml(c) {
    return `
        <tr>
            <td>${escapeHtml(c.studentName || 'Unknown')}</td>
            <td>${escapeHtml(practicalLabel(c.practical))}</td>
            <td>${escapeHtml(c.note || '')}</td>
            <td>${escapeHtml(c.teacherName || '')}</td>
            <td>${escapeHtml(formatWhen(c.completedAt))}</td>
        </tr>
    `;
}

function renderReadings(readings) {
    const studentCount = new Set(readings.map((r) => r.uid)).size;
    summaryText.textContent = readings.length === 0
        ? 'No simulation activity recorded yet.'
        : `${readings.length} simulation entr${readings.length === 1 ? 'y' : 'ies'} from ${studentCount} student${studentCount === 1 ? '' : 's'}.`;
    summaryCard.hidden = false;

    readingsCount.textContent = `${readings.length} reading${readings.length === 1 ? '' : 's'}`;
    readingsBody.innerHTML = readings.length
        ? readings.map(readingRowHtml).join('')
        : `<tr><td colspan="5" class="specimen-empty">No simulation activity yet.</td></tr>`;
    readingsSection.hidden = false;
}

function readingRowHtml(r) {
    return `
        <tr>
            <td>${escapeHtml(r.name || 'Unknown')}</td>
            <td>${escapeHtml(practicalLabel(r.practical))}</td>
            <td>${escapeHtml(r.sampleId || '')}</td>
            <td>${escapeHtml(resultSummary(r))}</td>
            <td>${escapeHtml(formatWhen(r.createdAt))}</td>
        </tr>
    `;
}

function practicalLabel(key) {
    const labels = {
        'chromameter': 'Chromameter',
        'texture-analyzer': 'Texture Analyzer',
        'sausage-making': 'Sausage Making',
        'sun-drying': 'Sun Drying',
        'orientation': 'Orientation',
        'sausage-making-checklist': 'Sausage Making (checklist)'
    };
    return labels[key] || key;
}

// Picks a short, human-readable summary depending on which
// practical the reading came from, since each stores different fields.
function resultSummary(r) {
    const d = r.data || {};
    switch (r.practical) {
        case 'chromameter':
            return `L* ${fmt(d.L)}, a* ${fmt(d.a)}, b* ${fmt(d.b)}`;
        case 'texture-analyzer':
            return `${fmt(d.peakForce)} N`;
        case 'sausage-making':
            return `${fmt(d.temp)}\u00B0C ${d.passed ? '(target reached)' : '(below target)'}`;
        case 'sun-drying':
            return `Day ${d.day}: ${fmt(d.moisture)}% moisture`;
        case 'orientation':
        case 'sausage-making-checklist':
            return `${d.confirmed} of ${d.total} confirmed`;
        default:
            return JSON.stringify(d);
    }
}

function fmt(n) {
    return typeof n === 'number' ? n.toFixed(1) : n;
}

function formatWhen(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    return date.toLocaleString();
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}
