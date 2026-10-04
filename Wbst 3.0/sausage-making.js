// =====================================================
// Sausage Making — internal temperature check
// Simulates a final internal-temperature reading and
// checks it against the manual's stated target of 68°C.
// This threshold IS sourced from the manual, unlike the
// texture-analyzer tenderness bands (see that file's notes).
// =====================================================

const TEMP_CONFIG = {
    // Simulated reading range — wide enough to plausibly land
    // above or below target, so both outcomes are demonstrable.
    SIMULATED_RANGE: [62, 76],
    // Sourced directly from the practical manual, Procedure step 7.
    TARGET_INTERNAL_TEMP: 68
};

const form = document.getElementById('reading-form');
const sampleIdInput = document.getElementById('sample-id');
const measureBtn = document.getElementById('measure-btn');

const valTemp = document.getElementById('val-temp');
const status = document.getElementById('instrument-status');

const grid = document.getElementById('specimen-grid');
const emptyMsg = document.getElementById('specimen-empty');
const logCount = document.getElementById('log-count');

const averageBlock = document.getElementById('specimen-average');
const avgTemp = document.getElementById('avg-temp');

const readings = []; // { id, sampleId, temp }
let nextId = 1;

const batchTrueTemp = {}; // Batch ID -> true internal temp, set once per ID

// Same batch checked twice should read close to the same temperature —
// it's the same physical batch, not a fresh random outcome each click.
function getTrueTemp(sampleId) {
    if (batchTrueTemp[sampleId] === undefined) {
        const rand = seededRandom(hashString(sampleId));
        batchTrueTemp[sampleId] = rangeFromSeed(rand(), ...TEMP_CONFIG.SIMULATED_RANGE);
    }
    return batchTrueTemp[sampleId];
}

form.addEventListener('submit', (event) => {
    event.preventDefault();
    const sampleId = sampleIdInput.value.trim();

    if (!sampleId) {
        status.textContent = 'Enter a batch ID before checking temperature.';
        return;
    }

    measureBtn.disabled = true;
    status.textContent = 'Checking…';

    setTimeout(() => {
        const trueTemp = getTrueTemp(sampleId);
        const temp = trueTemp + (Math.random() - 0.5) * 0.6; // small thermometer-reading noise
        valTemp.textContent = `${temp.toFixed(1)}\u00B0C`;

        const passed = temp >= TEMP_CONFIG.TARGET_INTERNAL_TEMP;
        const reading = { id: nextId++, sampleId, temp, passed };
        readings.push(reading);
        addSpecimenTicket(reading);
        updateSummary();

        status.textContent = passed
            ? `Target reached (\u226568\u00B0C). Batch complete.`
            : `Below target (68\u00B0C) \u2014 continue smoking.`;
        measureBtn.disabled = false;
    }, 500);
});

function addSpecimenTicket(reading) {
    if (readings.length === 1) {
        emptyMsg.remove();
    }

    const ticket = document.createElement('div');
    ticket.className = 'specimen-ticket';
    ticket.dataset.id = reading.id;
    ticket.innerHTML = `
        <div class="specimen-ticket-id">
            <span>${escapeHtml(reading.sampleId)}</span>
            <button type="button" class="specimen-remove" aria-label="Remove this reading">&times;</button>
        </div>
        <div class="specimen-ticket-values">
            <span>Internal temp <b>${reading.temp.toFixed(1)}&deg;C</b></span>
            <span class="specimen-tag">${reading.passed ? 'Target reached' : 'Below target'}</span>
        </div>
    `;

    ticket.querySelector('.specimen-remove').addEventListener('click', () => {
        const index = readings.findIndex(r => r.id === reading.id);
        if (index > -1) readings.splice(index, 1);
        ticket.remove();
        updateSummary();

        if (readings.length === 0) {
            grid.appendChild(emptyMsg);
        }
    });

    grid.appendChild(ticket);
}

function updateSummary() {
    logCount.textContent = `${readings.length} batch${readings.length === 1 ? '' : 'es'}`;

    if (readings.length === 0) {
        averageBlock.hidden = true;
        return;
    }

    const total = readings.reduce((sum, r) => sum + r.temp, 0);
    avgTemp.textContent = (total / readings.length).toFixed(1);
    averageBlock.hidden = false;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
