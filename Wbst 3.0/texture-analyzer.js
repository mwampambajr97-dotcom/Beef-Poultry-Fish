// =====================================================
// Texture Analyzer simulation
// Simulates a force-deflection curve for a shear test
// and reports the peak shear force per sample.
// =====================================================

// -----------------------------------------------------
// REFERENCE DATA — sourced values live here, kept
// separate from the simulation logic below.
// -----------------------------------------------------
const TEXTURE_CONFIG = {
    // Simulated peak force range (Newtons) for the curve generator.
    // Illustrative range only — not sourced from the practical
    // manual, which does not state one.
    PEAK_FORCE_RANGE: [15, 38],

    // Tenderness classification thresholds shown on each ticket.
    // IMPORTANT: the manual's own "Data and Calculations" section
    // is blank — it states no interpretation thresholds at all.
    // These bands (Tender / Average / Tough) were invented for
    // this simulation to make the result meaningful to a student,
    // NOT supplied by the manual or confirmed by the supervisor.
    //
    // Checked online: published tender/tough cut-offs turned up for BEEF
    // only (for example consumer-based beef work reports tender below
    // about 39.6 N, and Meat Standards Australia uses roughly 8 kgf and
    // 11 kgf). They depend on the blade, cooking method and species, so
    // they cannot be copied across to poultry, and no poultry-specific
    // cut-off was found. These bands therefore stay a placeholder.
    TENDERNESS_BANDS: {
        TENDER_MAX: 22,
        AVERAGE_MAX: 30
        // above AVERAGE_MAX is classified "Tough"
    }
};

const form = document.getElementById('reading-form');
const sampleIdInput = document.getElementById('sample-id');
const measureBtn = document.getElementById('measure-btn');

const curveLine = document.getElementById('curve-line');
const valPeak = document.getElementById('val-peak');
const status = document.getElementById('instrument-status');

const grid = document.getElementById('specimen-grid');
const emptyMsg = document.getElementById('specimen-empty');
const logCount = document.getElementById('log-count');

const averageBlock = document.getElementById('specimen-average');
const avgPeak = document.getElementById('avg-peak');

const readings = []; // { id, sampleId, peakForce }
let nextId = 1;

form.addEventListener('submit', (event) => {
    event.preventDefault();
    const sampleId = sampleIdInput.value.trim();

    if (!sampleId) {
        status.textContent = 'Enter a sample ID before running a test.';
        return;
    }

    measureBtn.disabled = true;
    status.textContent = 'Running test…';
    curveLine.setAttribute('points', '');

    setTimeout(() => {
        const { points, peakForce } = simulateCurve(sampleId);
        drawCurve(points);
        valPeak.textContent = `${peakForce.toFixed(1)} N`;

        const reading = { id: nextId++, sampleId, peakForce };
        readings.push(reading);
        addSpecimenTicket(reading);
        updateSummary();

        status.textContent = `Peak force reached: ${peakForce.toFixed(1)} N.`;
        measureBtn.disabled = false;
    }, 500);
});

// Builds a plausible force-vs-displacement curve:
// force rises roughly linearly, peaks (the shear point),
// then drops off as the blade passes through the sample.
const batchTrueForce = {}; // Sample ID -> true peak force, set once per ID

// Same idea as Chromameter: a given Sample ID always has the same
// underlying peak force. Re-testing the same sample gives a similar,
// not identical, result — not a totally different one each time.
function getTruePeakForce(sampleId) {
    if (batchTrueForce[sampleId] === undefined) {
        const rand = seededRandom(hashString(sampleId));
        batchTrueForce[sampleId] = rangeFromSeed(rand(), ...TEXTURE_CONFIG.PEAK_FORCE_RANGE);
    }
    return batchTrueForce[sampleId];
}

function simulateCurve(sampleId) {
    const truePeak = getTruePeakForce(sampleId);
    const peakForce = truePeak + (Math.random() - 0.5) * 2; // ±1N test-to-test variation
    const peakPosition = randomInRange(0.45, 0.6); // where along the curve the peak occurs
    const pointCount = 40;
    const points = [];

    for (let i = 0; i <= pointCount; i++) {
        const t = i / pointCount; // 0 to 1, position along the test
        let force;

        if (t <= peakPosition) {
            // Rising phase, with a little natural noise
            force = (t / peakPosition) * peakForce;
        } else {
            // Falling phase after the sample shears
            const fallT = (t - peakPosition) / (1 - peakPosition);
            force = peakForce * (1 - fallT) * 0.85;
        }

        force += (Math.random() - 0.5) * (peakForce * 0.04); // small jitter
        points.push({ x: t, y: Math.max(0, force) });
    }

    return { points, peakForce };
}

function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
}

// Converts the 0-1 normalised points into SVG coordinates and draws them
function drawCurve(points) {
    const maxForce = Math.max(...points.map(p => p.y), 1);
    const svgWidth = 300;
    const svgHeight = 120;
    const padding = 6;

    const coords = points.map(p => {
        const x = p.x * svgWidth;
        const y = svgHeight - padding - (p.y / maxForce) * (svgHeight - padding * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    curveLine.setAttribute('points', coords.join(' '));
}

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
            <span>Peak force <b>${reading.peakForce.toFixed(1)} N</b></span>
            <span class="specimen-tag" title="Illustrative only — not a confirmed lab standard">${classifyTenderness(reading.peakForce)}*</span>
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

// Rough classification purely for interpretive context in this simulation.
// Placeholder classification — see TEXTURE_CONFIG above.
// Not sourced from the manual; pending supervisor confirmation.
function classifyTenderness(peakForce) {
    if (peakForce < TEXTURE_CONFIG.TENDERNESS_BANDS.TENDER_MAX) return 'Tender';
    if (peakForce < TEXTURE_CONFIG.TENDERNESS_BANDS.AVERAGE_MAX) return 'Average';
    return 'Tough';
}

function updateSummary() {
    logCount.textContent = `${readings.length} reading${readings.length === 1 ? '' : 's'}`;

    if (readings.length === 0) {
        averageBlock.hidden = true;
        return;
    }

    const total = readings.reduce((sum, r) => sum + r.peakForce, 0);
    avgPeak.textContent = (total / readings.length).toFixed(1);
    averageBlock.hidden = false;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
