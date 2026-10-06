// =====================================================
// Sun Drying simulation
// Tracks simulated moisture loss over Day 0/2/4/6.
//
// IMPORTANT DIFFERENCE from the other simulations: a real
// drying curve only ever goes down over time. If each day's
// reading were independently randomised, a batch could show
// moisture *increasing* on Day 4 — which is meaningless and
// would teach the wrong idea entirely. So this file gives
// each Steak ID a single, consistent "drying curve" the
// moment the batch starts, and every day-checkpoint reads
// a point off that same curve. Same ID -> same curve, every
// time, even across a page refresh.
// =====================================================

const DRYING_CONFIG = {
    // Starting moisture range (%) for raw beef steaks — illustrative.
    START_MOISTURE_RANGE: [70, 75],
    // How much of the "dryable" moisture is lost per 2-day interval.
    // Varies per sample so curves aren't identical, but always decays.
    DECAY_RATE_RANGE: [0.25, 0.4],
    // NOTE: the manual does not state a target final moisture value —
    // see the on-page note. Nothing here judges "done" vs "not done".
};

const startForm = document.getElementById('start-form');
const sampleIdInput = document.getElementById('sample-id');
const startBtn = document.getElementById('start-btn');
const instrument = document.getElementById('instrument');
const curveLine = document.getElementById('curve-line');
const status = document.getElementById('instrument-status');
const dayButtons = document.querySelectorAll('.day-btn');

const grid = document.getElementById('specimen-grid');
const emptyMsg = document.getElementById('specimen-empty');
const logCount = document.getElementById('log-count');
const targetNote = document.getElementById('target-note');

let currentBatch = null; // { sampleId, startMoisture, decayRate }
const recordedPoints = []; // { day, moisture }

startForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const sampleId = sampleIdInput.value.trim();
    if (!sampleId) return;

    currentBatch = createBatch(sampleId);
    recordedPoints.length = 0;

    sampleIdInput.disabled = true;
    startBtn.disabled = true;
    instrument.hidden = false;

    dayButtons.forEach((btn) => {
        btn.disabled = btn.dataset.day !== '0';
        btn.classList.remove('done');
    });

    grid.innerHTML = '';
    targetNote.hidden = true;
    updateSummary();
    status.textContent = `Batch "${sampleId}" started. Click "Day 0" below to take your first reading.`;
});

dayButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
        const day = Number(btn.dataset.day);
        const moisture = moistureOnDay(currentBatch, day);

        recordedPoints.push({ day, moisture });
        btn.disabled = true;
        btn.classList.add('done');
        enableNextDay(day);
        drawCurve();
        addCheckpointTicket(currentBatch.sampleId, day, moisture);
        updateSummary();

        status.textContent = `Day ${day}: ${moisture.toFixed(1)}% moisture.`;

        window.Auth?.saveReading('sun-drying', currentBatch.sampleId, { day, moisture });

        if (day === 6) {
            targetNote.hidden = false;
        }
    });
});

// Creates one consistent drying curve for a Steak ID.
// Same ID always produces the same seed, so the same
// "sample" behaves the same way if re-entered later.
function createBatch(sampleId) {
    const seed = hashString(sampleId);
    const rand = seededRandom(seed);

    const startMoisture = rangeFromSeed(rand(), ...DRYING_CONFIG.START_MOISTURE_RANGE);
    const decayRate = rangeFromSeed(rand(), ...DRYING_CONFIG.DECAY_RATE_RANGE);

    return { sampleId, startMoisture, decayRate };
}

// Moisture at a given day, using simple exponential decay —
// always decreasing, never independently re-randomised per day.
function moistureOnDay(batch, day) {
    return batch.startMoisture * Math.pow(1 - batch.decayRate, day / 2);
}

function enableNextDay(justCompletedDay) {
    const order = [0, 2, 4, 6];
    const nextIndex = order.indexOf(justCompletedDay) + 1;
    if (nextIndex < order.length) {
        const nextDay = order[nextIndex];
        const nextBtn = Array.from(dayButtons).find((b) => Number(b.dataset.day) === nextDay);
        if (nextBtn) nextBtn.disabled = false;
    }
}

function drawCurve() {
    if (recordedPoints.length === 0) {
        curveLine.setAttribute('points', '');
        return;
    }

    const maxMoisture = currentBatch.startMoisture;
    const svgWidth = 300;
    const svgHeight = 120;
    const padding = 6;

    const coords = recordedPoints.map((p) => {
        const x = (p.day / 6) * svgWidth;
        const y = svgHeight - padding - (p.moisture / maxMoisture) * (svgHeight - padding * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    curveLine.setAttribute('points', coords.join(' '));
}

function addCheckpointTicket(sampleId, day, moisture) {
    if (recordedPoints.length === 1) {
        emptyMsg.remove();
    }

    const ticket = document.createElement('div');
    ticket.className = 'specimen-ticket';
    ticket.innerHTML = `
        <div class="specimen-ticket-id">
            <span>${escapeHtml(sampleId)} &mdash; Day ${day}</span>
        </div>
        <div class="specimen-ticket-values">
            <span>Moisture <b>${moisture.toFixed(1)}%</b></span>
        </div>
    `;
    grid.appendChild(ticket);
}

function updateSummary() {
    logCount.textContent = `${recordedPoints.length} of 4 recorded`;
    if (recordedPoints.length === 0 && !grid.contains(emptyMsg)) {
        grid.appendChild(emptyMsg);
    }
}

// hashString, seededRandom, and rangeFromSeed now live in the shared
// seeded-random.js file, loaded before this script.

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
