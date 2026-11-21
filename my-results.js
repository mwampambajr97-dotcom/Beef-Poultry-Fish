// =====================================================
// My Results (student)
// Shows a student's own saved results in two clearly separate parts:
//   - their PRACTICE in the simulation, which the app records by itself, and
//   - the teacher's LAB CONFIRMATIONS, which only a teacher can create.
// The security rules only let a student read their own records; this page
// only ever asks for the signed-in student's own entries.
// How a result is worded comes from results-format.js, shared with the
// teacher dashboard.
// =====================================================

const {
    SESSIONS, practicalLabel, resultSummary, formatWhen, formatDay, escapeHtml, plural,
    summariseSessions, entriesFor
} = window.ResultsFormat;

const stateBox = document.getElementById('results-state');
const completionsNote = document.getElementById('completions-note');
const boardSection = document.getElementById('board-section');
const resultGrid = document.getElementById('result-grid');
const entriesSection = document.getElementById('entries-section');
const entriesCount = document.getElementById('entries-count');
const entriesFilter = document.getElementById('entries-filter');
const entriesBody = document.getElementById('entries-body');

let allReadings = [];

window.addEventListener('auth-ready', async (event) => {
    const { user, profile } = event.detail;

    if (!user) {
        showMessage('You need to log in to see your results. <a href="login.html?next=my-results.html">Log in</a>');
        return;
    }

    if (profile && profile.role === 'teacher') {
        showMessage('This page is for student accounts. Student results, and your own test activity, are on the <a href="teacher-dashboard.html">Dashboard</a>.');
        return;
    }

    // Loaded separately, so a problem with the teacher's confirmations does not
    // hide the student's own practice.
    const [readingsRes, completionsRes] = await Promise.allSettled([
        window.Auth.getMyReadings(),
        window.Auth.getMyCompletions()
    ]);

    if (readingsRes.status === 'rejected') {
        console.error(readingsRes.reason);
        showMessage('Could not load your results. Check your connection and try refreshing.');
        return;
    }

    stateBox.hidden = true;
    stateBox.innerHTML = '';

    const completionsLoaded = completionsRes.status === 'fulfilled';
    if (!completionsLoaded) console.error(completionsRes.reason);
    completionsNote.hidden = completionsLoaded;

    allReadings = readingsRes.value;
    renderBoard(summariseSessions(allReadings, completionsLoaded ? completionsRes.value : []), completionsLoaded);
    populateFilter();
    renderEntries();
});

entriesFilter.addEventListener('change', renderEntries);

// The messages here are fixed wording written in this file (never user data),
// which is why they may contain a link.
function showMessage(html) {
    stateBox.hidden = false;
    stateBox.innerHTML = `<p class="disclaimer-note">${html}</p>`;
}

function renderBoard(board, completionsLoaded) {
    resultGrid.innerHTML = board.map((s) => cardHtml(s, completionsLoaded)).join('');
    boardSection.hidden = false;
}

function cardHtml(s, completionsLoaded) {
    const body = s.started
        ? `<ul class="result-lines">${s.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>
           <p class="result-meta">Last practised: ${escapeHtml(formatDay(s.lastAt))}</p>`
        : '<p class="result-none">Nothing saved yet.</p>';

    let lab;
    if (!completionsLoaded) {
        lab = '<p class="result-lab result-lab--no">Lab: unavailable right now</p>';
    } else if (s.confirmed) {
        const c = s.confirmed;
        lab = `<p class="result-lab result-lab--yes">&#10003; Lab: confirmed${c.teacherName ? ` by ${escapeHtml(c.teacherName)}` : ''} on ${escapeHtml(formatDay(c.completedAt))}${c.note ? ` &mdash; ${escapeHtml(c.note)}` : ''}</p>`;
    } else {
        lab = '<p class="result-lab result-lab--no">Lab: not yet confirmed by your teacher</p>';
    }

    return `
        <article class="result-card" data-session="${escapeHtml(s.key)}" data-started="${s.started}">
            <header class="result-card-head">
                <h3 class="result-card-title">${escapeHtml(s.label)}</h3>
                <span class="result-chip ${s.started ? 'result-chip--on' : 'result-chip--off'}">${s.started ? 'Practised' : 'Not started'}</span>
            </header>
            ${body}
            ${lab}
            <a class="result-open" href="${escapeHtml(s.page)}">${s.started ? 'Open practical' : 'Start practical'} &rarr;</a>
        </article>
    `;
}

function populateFilter() {
    entriesFilter.innerHTML = '<option value="all">All practicals</option>'
        + SESSIONS.map((s) => `<option value="${escapeHtml(s.key)}">${escapeHtml(s.label)}</option>`).join('');
}

function renderEntries() {
    const entries = entriesFor(allReadings, entriesFilter.value);
    entriesCount.textContent = `${entries.length} ${plural(entries.length, 'entry', 'entries')}`;

    let empty = 'No entries yet. Open a practical and take a reading.';
    if (allReadings.length > 0 && entries.length === 0) empty = 'Nothing saved for this practical yet.';

    entriesBody.innerHTML = entries.length
        ? entries.map(entryRowHtml).join('')
        : `<tr><td colspan="4" class="specimen-empty">${escapeHtml(empty)}</td></tr>`;
    entriesSection.hidden = false;
}

function entryRowHtml(r) {
    // data-label is what the narrow-screen layout shows beside each value.
    return `
        <tr role="row">
            <td role="cell" data-label="Practical">${escapeHtml(practicalLabel(r.practical))}</td>
            <td role="cell" data-label="Sample ID">${escapeHtml(r.sampleId || '')}</td>
            <td role="cell" data-label="Result">${escapeHtml(resultSummary(r))}</td>
            <td role="cell" data-label="When">${escapeHtml(formatWhen(r.createdAt))}</td>
        </tr>
    `;
}
