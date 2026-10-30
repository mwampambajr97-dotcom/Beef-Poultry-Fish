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
// Teacher activity: teachers can use the practicals too (they need to
// check that saving works), and that is saved like anyone else's. It is
// kept out of the student picture by default, though, so testing does not
// look like extra students. Who counts as a student is decided from the
// `users` collection (role 'student'), NOT from anything written on the
// reading itself, because a student can write whatever they like on their
// own reading but cannot change their own role (see firestore.rules).
// If the student list cannot be loaded, nothing is hidden: it is better to
// show too much than to hide a student's work by mistake.
//
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
const activityToggle = document.getElementById('activity-toggle');
const showNonStudent = document.getElementById('show-nonstudent');
const activityToggleText = document.getElementById('activity-toggle-text');

let allReadings = [];
let studentUids = null; // null = the student list could not be loaded

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
    allReadings = readingsRes.value;
    studentUids = studentsRes.status === 'fulfilled' ? new Set(studentsRes.value.map((s) => s.uid)) : null;
    renderReadings();

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

showNonStudent.addEventListener('change', renderReadings);

function isStudentEntry(r) {
    return studentUids === null || studentUids.has(r.uid);
}

function plural(n, one, many) {
    return n === 1 ? one : many;
}

function renderReadings() {
    const studentEntries = allReadings.filter(isStudentEntry);
    const otherEntries = allReadings.filter((r) => !isStudentEntry(r));

    // Offer the tick-box only when it would change something.
    activityToggle.hidden = otherEntries.length === 0;
    activityToggleText.textContent = `Include teacher and other non-student activity (${otherEntries.length})`;
    const include = !activityToggle.hidden && showNonStudent.checked;
    const visible = include ? allReadings : studentEntries;

    const studentCount = new Set(studentEntries.map((r) => r.uid)).size;
    const otherCount = new Set(otherEntries.map((r) => r.uid)).size;

    if (allReadings.length === 0) {
        summaryText.textContent = 'No simulation activity recorded yet.';
    } else {
        let summary = `${studentEntries.length} simulation ${plural(studentEntries.length, 'entry', 'entries')} from ${studentCount} ${plural(studentCount, 'student', 'students')}`;
        if (otherEntries.length && include) {
            summary += `, plus ${otherEntries.length} ${plural(otherEntries.length, 'entry', 'entries')} from ${otherCount} non-student ${plural(otherCount, 'account', 'accounts')}`;
        }
        summary += '.';
        if (otherEntries.length && !include) {
            summary += ` ${otherEntries.length} non-student ${plural(otherEntries.length, 'entry', 'entries')} hidden.`;
        }
        summaryText.textContent = summary;
    }
    summaryCard.hidden = false;

    readingsCount.textContent = `${visible.length} ${plural(visible.length, 'reading', 'readings')}`;
    let empty = 'No simulation activity yet.';
    if (allReadings.length > 0 && visible.length === 0) {
        empty = 'No student activity yet. Tick the box above to see teacher activity.';
    }
    readingsBody.innerHTML = visible.length
        ? visible.map(readingRowHtml).join('')
        : `<tr><td colspan="5" class="specimen-empty">${escapeHtml(empty)}</td></tr>`;
    readingsSection.hidden = false;
}

function readingRowHtml(r) {
    const tag = isStudentEntry(r) ? '' : ' <span class="non-student-tag">(non-student)</span>';
    return `
        <tr>
            <td>${escapeHtml(r.name || 'Unknown')}${tag}</td>
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
            return `L* ${fmt(d.L)}, a* ${fmt(d.a)}, b* ${fmt(d.b)}`
                + (d.side ? ` \u00B7 Side ${d.side}` : '')
                + (d.zone === 'fat' ? ' (on fat)' : d.zone === 'connective' ? ' (on connective tissue)' : '');
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
