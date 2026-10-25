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

const sideSelect = document.getElementById('side-select');
const surfaceEmpty = document.getElementById('surface-empty');
const surfaceStage = document.getElementById('surface-stage');
const filletSvg = document.getElementById('fillet-svg');
const coverageBox = document.getElementById('coverage');
const coverageList = document.getElementById('coverage-list');
const coverageNote = document.getElementById('coverage-note');

// One place for every message under the instrument. `warn` shows it in a
// warmer colour so an important message does not blend into the panel.
function setStatus(text, warn = false) {
    status.textContent = text;
    status.classList.toggle('instrument-status--warn', warn);
}

const readings = []; // { id, sampleId, side, zone, L, a, b }
let nextId = 1;

// What the manual asks for: readings from at least three different sides,
// at least two on each. (Steps 1, 4 and 6 of the procedure are worded a
// little loosely, so this is one reading of them, pending the supervisor.)
const SIDES = Array.from(sideSelect.options).map((o) => o.value);
const READINGS_PER_SIDE = 2;

let surface = null;           // the fillet currently drawn
let marker = { x: 0, y: 0 };  // where the measuring head is
let redrawTimer = null;

form.addEventListener('submit', (event) => {
    event.preventDefault();
    const sampleId = sampleIdInput.value.trim();

    if (!sampleId) {
        setStatus('Enter a sample ID before taking a reading.');
        return;
    }

    // The drawing redraws a moment after typing stops. If someone presses
    // the button before that, make sure it matches the ID they entered.
    if (!surface || surface.sampleId !== sampleId || surface.side !== sideSelect.value) {
        refreshSurface();
    }

    // Fix the placement now, so moving the head during the short
    // "measuring" delay cannot change what gets measured.
    const placement = { surface, side: sideSelect.value, x: marker.x, y: marker.y };

    measureBtn.disabled = true;
    setStatus('Measuring…');

    // Small delay simulates the instrument taking a real reading
    setTimeout(() => {
        const reading = simulateReading(sampleId, placement);
        readings.push(reading);
        showOnInstrument(reading);
        addSpecimenTicket(reading);
        updateSummary();
        updateCoverage();
        setStatus(readingMessage(reading), reading.zone !== 'muscle');
        measureBtn.disabled = false;

        // Saves only if signed in; does nothing otherwise (see auth.js).
        window.Auth?.saveReading('chromameter', sampleId, {
            L: reading.L, a: reading.a, b: reading.b,
            side: reading.side, zone: reading.zone
        });
    }, 450);
});

// ---------- The fillet drawing ----------

function refreshSurface() {
    clearTimeout(redrawTimer);
    const sampleId = sampleIdInput.value.trim();

    if (!sampleId) {
        surface = null;
        surfaceStage.hidden = true;
        surfaceEmpty.hidden = false;
        updateCoverage();
        return;
    }

    surface = FilletSurface.buildSurface(sampleId, sideSelect.value);
    marker = { x: surface.cx, y: surface.cy };
    FilletSurface.renderSurface(filletSvg, surface, getTrueValue(sampleId), marker);
    surfaceStage.hidden = false;
    surfaceEmpty.hidden = true;
    updateCoverage();

    if (!measureBtn.disabled) {
        setStatus(`Side ${sideSelect.value}: click the fillet to place the measuring head, then press Take reading.`);
    }
}

// Redraw shortly after typing stops, so the fillet does not flicker
// through a different shape on every keystroke.
sampleIdInput.addEventListener('input', () => {
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(refreshSurface, 250);
});
sideSelect.addEventListener('change', refreshSurface);

FilletSurface.attachInteraction(filletSvg, {
    getSurface: () => surface,
    getMarker: () => marker,
    onPlace: (x, y) => {
        marker = { x, y };
        FilletSurface.moveMarker(filletSvg, x, y);
        if (!measureBtn.disabled) {
            setStatus(`Head placed on Side ${sideSelect.value}. Press Take reading.`);
        }
    },
    onReject: () => {
        if (!measureBtn.disabled) setStatus('Place the head on the fillet itself.', true);
    },
    onMeasure: () => form.requestSubmit()
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

function simulateReading(sampleId, placement) {
    const measured = FilletSurface.measureAt(placement.surface, getTrueValue(sampleId), placement.x, placement.y);
    return {
        id: nextId++,
        sampleId,
        side: placement.side,
        zone: measured.zone,
        L: jitter(measured.L, 1),
        a: jitter(measured.a, 0.5),
        b: jitter(measured.b, 0.5)
    };
}

// What the student is told after each reading. Landing on fat or
// connective tissue is explained straight away, with the manual's reason.
function readingMessage(reading) {
    if (reading.zone === 'fat') {
        return `Reading complete, but the head was on fat, so L* reads high. The manual says to avoid fat and connective tissue: remove this reading and retake it on muscle.`;
    }
    if (reading.zone === 'connective') {
        return `Reading complete, but the head was on connective tissue, so L* reads high. The manual says to avoid fat and connective tissue: remove this reading and retake it on muscle.`;
    }
    return `Reading complete (Side ${reading.side}).`;
}

// Small instrument-noise-like variation around a fixed true value.
function jitter(trueValue, spread) {
    return Math.round((trueValue + (Math.random() - 0.5) * spread * 2) * 10) / 10;
}

function showOnInstrument(reading) {
    valL.textContent = reading.L.toFixed(1);
    valA.textContent = reading.a.toFixed(1);
    valB.textContent = reading.b.toFixed(1);
    chip.style.backgroundColor = FilletSurface.labToCss(reading.L, reading.a, reading.b);
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
            <span class="specimen-tag${reading.zone === 'muscle' ? '' : ' specimen-tag--warn'}">${escapeHtml(zoneLabel(reading))}</span>
        </div>
    `;

    ticket.querySelector('.specimen-remove').addEventListener('click', () => {
        const index = readings.findIndex(r => r.id === reading.id);
        if (index > -1) readings.splice(index, 1);
        ticket.remove();
        updateSummary();
        updateCoverage();

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

    const offMuscle = readings.filter((r) => r.zone !== 'muscle').length;
    referenceNote.textContent = describeLightness(meanL, n, offMuscle);
    referenceNote.hidden = false;
}

// Compares the average L* with the illustrative published example in
// COLOR_CONFIG. Deliberately worded as "one example", not as a standard.
function describeLightness(meanL, count, offMuscle = 0) {
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

    const offNote = offMuscle > 0
        ? ` ${offMuscle} of your readings landed on fat or connective tissue, which the manual says to avoid, so they push this average up. Remove them and retake on muscle for a fairer average.`
        : '';

    return `Illustrative check, not a TBS or EU limit: in one published study of broiler breast fillets, your average L* of ${meanL.toFixed(1)} is ${verdict} Other studies use different cut-offs.${countNote}${offNote}`;
}

function zoneLabel(reading) {
    const where = { muscle: '', fat: ' \u00B7 on fat', connective: ' \u00B7 on connective tissue' };
    return `Side ${reading.side}${where[reading.zone] || ''}`;
}

// How far through the manual's "two readings on each of three sides" this
// sample is. Only readings on muscle count, since the manual says to avoid
// fat and connective tissue. This informs the student; it never blocks them.
function updateCoverage() {
    const sampleId = sampleIdInput.value.trim();
    if (!sampleId) {
        coverageBox.hidden = true;
        return;
    }

    const counts = {};
    SIDES.forEach((side) => { counts[side] = 0; });
    readings.forEach((r) => {
        if (r.sampleId === sampleId && r.zone === 'muscle' && counts[r.side] !== undefined) counts[r.side]++;
    });

    const sidesDone = SIDES.filter((side) => counts[side] >= READINGS_PER_SIDE).length;
    coverageList.innerHTML = SIDES.map((side) => {
        const done = counts[side] >= READINGS_PER_SIDE;
        return `<li class="coverage-item${done ? ' coverage-item--done' : ''}">Side ${side} <b>${Math.min(counts[side], READINGS_PER_SIDE)} / ${READINGS_PER_SIDE}</b>${done ? ' \u2713' : ''}</li>`;
    }).join('');

    coverageNote.textContent = sidesDone === SIDES.length
        ? `Coverage complete: at least ${READINGS_PER_SIDE} readings on muscle from each of the ${SIDES.length} sides.`
        : `The practical asks for at least ${READINGS_PER_SIDE} readings from each of ${SIDES.length} sides. ${sidesDone} of ${SIDES.length} sides done. Readings on fat or connective tissue do not count.`;
    coverageBox.hidden = false;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
