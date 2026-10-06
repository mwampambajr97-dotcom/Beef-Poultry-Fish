// =====================================================
// Teacher Dashboard
// Waits for auth.js to confirm who is signed in, then either
// shows real student data (if the signed-in account is a
// teacher), or a plain explanation if not. The real access
// control is enforced by Firestore's security rules — this
// script's role check is just so a student sees a clear
// message instead of a confusing permissions error.
// =====================================================

const stateBox = document.getElementById('dashboard-state');
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

    try {
        const readings = await window.Auth.getAllReadings();
        renderDashboard(readings);
    } catch (err) {
        console.error(err);
        showMessage('Could not load student data. Check your connection and try refreshing.');
    }
});

function showMessage(text) {
    stateBox.innerHTML = `<p class="disclaimer-note">${escapeHtml(text)}</p>`;
}

function renderDashboard(readings) {
    stateBox.hidden = true;
    stateBox.innerHTML = '';

    const studentCount = new Set(readings.map((r) => r.uid)).size;
    summaryText.textContent = readings.length === 0
        ? 'No readings have been recorded yet.'
        : `${readings.length} reading${readings.length === 1 ? '' : 's'} from ${studentCount} student${studentCount === 1 ? '' : 's'}.`;
    summaryCard.hidden = false;

    readingsCount.textContent = `${readings.length} reading${readings.length === 1 ? '' : 's'}`;
    readingsBody.innerHTML = readings.map(rowHtml).join('');
    readingsSection.hidden = false;
}

function rowHtml(r) {
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
        'sun-drying': 'Sun Drying'
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
