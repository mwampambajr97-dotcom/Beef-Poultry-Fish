// =====================================================
// Chromameter simulation
// Simulates realistic L*, a*, b* readings for a raw
// poultry fillet and logs each as a specimen ticket.
// =====================================================

// -----------------------------------------------------
// REFERENCE DATA — sourced values live here, kept
// separate from the simulation logic below.
// -----------------------------------------------------
const COLOR_CONFIG = {
    // Simulated reading ranges for raw broiler breast fillet.
    // Chosen to sit inside what published broiler-breast studies
    // report (L* varies a lot by genetics and hours after slaughter,
    // roughly 43-62 across studies; a* is close to zero, about 0-2;
    // b* is roughly 4-7). L* is deliberately wide enough that a shared
    // set of Sample IDs will include mostly normal fillets plus some
    // pale and some dark ones, which gives students something to compare.
    L_RANGE: [42, 56],
    A_RANGE: [-1.5, 2],
    B_RANGE: [4, 7],

    // ILLUSTRATIVE published reference for lightness — NOT a TBS or EU limit.
    // One study (Kralik et al., "Quality indicators of broiler breast meat in
    // relation to colour") classed fillets as dark/DFD (L* < 44), normal
    // (44-53) and pale/PSE-like (> 53). Other studies use different cut-offs
    // (for example > 49, > 53 or > 58) depending on instrument, muscle and
    // time after slaughter, so treat this as one example, not a rule.
    LIGHTNESS_REFERENCE: {
        DARK_BELOW: 44,
        PALE_ABOVE: 53
    },

    // TBS / EU comparison standards.
    // The practical manual asks students to "compare results with
    // standard (TBS, EU)" but gives no numbers. Checked online: the public
    // TBS draft chicken-meat standard describes colour only qualitatively
    // ("uniform natural colours", discoloration graded none / a few) and
    // has no instrumental L*a*b* limits; the EU poultrymeat marketing
    // standards cover labelling, water content and definitions, and no
    // L*a*b* limits turned up in what was found. So these stay null
    // unless the supervisor supplies specific values.
    TBS_STANDARD: null,
    EU_STANDARD: null
};

const form = document.getElementById('reading-form');
const sampleIdInput = document.getElementById('sample-id');
const measureBtn = document.getElementById('measure-btn');

const chip = document.getElementById('instrument-chip');
const valL = document.getElementById('val-L');
const valA = document.getElementById('val-a');
const valB = document.getElementById('val-b');
const status = document.getElementById('instrument-status');

const grid = document.getElementById('specimen-grid');
const emptyMsg = document.getElementById('specimen-empty');
const logCount = document.getElementById('log-count');

const averageBlock = document.getElementById('specimen-average');
const referenceNote = document.getElementById('reference-note');
const avgL = document.getElementById('avg-L');
const avgA = document.getElementById('avg-a');
const avgB = document.getElementById('avg-b');

const readings = []; // { id, sampleId, L, a, b }
let nextId = 1;

form.addEventListener('submit', (event) => {
    event.preventDefault();
    const sampleId = sampleIdInput.value.trim();

    if (!sampleId) {
        status.textContent = 'Enter a sample ID before taking a reading.';
        return;
    }

    measureBtn.disabled = true;
    status.textContent = 'Measuring…';

    // Small delay simulates the instrument taking a real reading
    setTimeout(() => {
        const reading = simulateReading(sampleId);
        readings.push(reading);
        showOnInstrument(reading);
        addSpecimenTicket(reading);
        updateSummary();
        status.textContent = 'Reading complete.';
        measureBtn.disabled = false;
    }, 450);
});

// Raw poultry breast fillet — see COLOR_CONFIG above for sourcing
const batchTrueValues = {}; // Sample ID -> { L, a, b } true value, set once per ID

// Every Sample ID gets one consistent "true" value the first time it's
// measured (seeded from the ID itself, via seeded-random.js). Repeated
// readings on the same ID scatter narrowly around that true value, the
// way a real instrument would on a real, unchanging sample — rather
// than each click being a fresh, unrelated random number.
function getTrueValue(sampleId) {
    if (!batchTrueValues[sampleId]) {
        const rand = seededRandom(hashString(sampleId));
        batchTrueValues[sampleId] = {
            L: rangeFromSeed(rand(), ...COLOR_CONFIG.L_RANGE),
            a: rangeFromSeed(rand(), ...COLOR_CONFIG.A_RANGE),
            b: rangeFromSeed(rand(), ...COLOR_CONFIG.B_RANGE)
        };
    }
    return batchTrueValues[sampleId];
}

function simulateReading(sampleId) {
    const trueValue = getTrueValue(sampleId);
    return {
        id: nextId++,
        sampleId,
        L: jitter(trueValue.L, 1),
        a: jitter(trueValue.a, 0.5),
        b: jitter(trueValue.b, 0.5)
    };
}

// Small instrument-noise-like variation around a fixed true value.
function jitter(trueValue, spread) {
    return Math.round((trueValue + (Math.random() - 0.5) * spread * 2) * 10) / 10;
}

function showOnInstrument(reading) {
    valL.textContent = reading.L.toFixed(1);
    valA.textContent = reading.a.toFixed(1);
    valB.textContent = reading.b.toFixed(1);
    chip.style.backgroundColor = approximateColor(reading.L, reading.a, reading.b);
}

// Simplified visual approximation of Lab -> RGB, not a true colorimetric conversion
function approximateColor(L, a, b) {
    const r = clamp(2.55 * L + 1.4 * a);
    const g = clamp(2.55 * L - 0.5 * a - 0.3 * b);
    const bl = clamp(2.55 * L - 1.1 * b);
    return `rgb(${r}, ${g}, ${bl})`;
}

function clamp(value) {
    return Math.min(255, Math.max(0, Math.round(value)));
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
            <span>L* <b>${reading.L.toFixed(1)}</b></span>
            <span>a* <b>${reading.a.toFixed(1)}</b></span>
            <span>b* <b>${reading.b.toFixed(1)}</b></span>
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
    logCount.textContent = `${readings.length} reading${readings.length === 1 ? '' : 's'}`;

    if (readings.length === 0) {
        averageBlock.hidden = true;
        referenceNote.hidden = true;
        return;
    }

    const totals = readings.reduce((acc, r) => ({
        L: acc.L + r.L,
        a: acc.a + r.a,
        b: acc.b + r.b
    }), { L: 0, a: 0, b: 0 });

    const n = readings.length;
    const meanL = totals.L / n;
    avgL.textContent = meanL.toFixed(1);
    avgA.textContent = (totals.a / n).toFixed(1);
    avgB.textContent = (totals.b / n).toFixed(1);
    averageBlock.hidden = false;

    referenceNote.textContent = describeLightness(meanL, n);
    referenceNote.hidden = false;
}

// Compares the average L* with the illustrative published example in
// COLOR_CONFIG. Deliberately worded as "one example", not as a standard.
function describeLightness(meanL, count) {
    const ref = COLOR_CONFIG.LIGHTNESS_REFERENCE;
    const countNote = count < 3
        ? ` This is based on ${count} reading${count === 1 ? '' : 's'}; the practical asks for at least three.`
        : '';

    let verdict;
    if (meanL < ref.DARK_BELOW) {
        verdict = `below the "normal" band of ${ref.DARK_BELOW}\u2013${ref.PALE_ABOVE}, on the dark side (that study called this DFD-like meat).`;
    } else if (meanL > ref.PALE_ABOVE) {
        verdict = `above the "normal" band of ${ref.DARK_BELOW}\u2013${ref.PALE_ABOVE}, on the pale side (that study called this PSE-like meat).`;
    } else {
        verdict = `inside the "normal" band of ${ref.DARK_BELOW}\u2013${ref.PALE_ABOVE}.`;
    }

    return `Illustrative check, not a TBS or EU limit: in one published study of broiler breast fillets, your average L* of ${meanL.toFixed(1)} is ${verdict} Other studies use different cut-offs.${countNote}`;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
