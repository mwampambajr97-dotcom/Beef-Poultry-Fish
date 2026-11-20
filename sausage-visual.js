// =====================================================
// Sausage Making — two ILLUSTRATIONS:
//   1. The process line: the manual's stages as small equipment
//      drawings, lighting up as the matching checklist items are ticked.
//   2. The smokehouse chart: temperature against time, with the
//      manual's three smoking stages, the 68°C target, and the
//      inside of the sausage warming up.
//
// What comes straight from the manual: the order of the stages, the
// smokehouse schedule (60°C for 1 hour, 71°C for one more hour, then
// 82°C for two hours) and the 68°C internal target.
//
// What is only a MODEL: the curve for the inside of the sausage. It
// uses the simplest idea there is: the inside warms toward whatever the
// smokehouse air is, at a rate that depends on how thick the sausage is.
// The rate is chosen so the curve finishes at this batch's reading, which
// is what makes the picture agree with the number. The starting
// temperature of the meat is also an assumption. Real sausages warm at
// different rates, and the page says so.
//
// Layout of this file:
//   1. The model and the stage list (pure, no browser needed, unit-tested)
//   2. Drawing the process line
//   3. Drawing the chart and playing the curve
// Everything is exposed as window.SausageVisual.
// =====================================================

(function () {
    // ---------- 1. The model ----------
    const HOURS = 4;        // 1 h + 1 h + 2 h
    const TARGET = 68;      // the manual's internal-temperature target, °C
    const START_CORE = 4;   // ASSUMPTION: the meat starts cold (the manual says keep it as cold as possible)

    // The manual's smoking schedule, step 7.
    const SCHEDULE = [
        { from: 0, to: 1, temp: 60 },
        { from: 1, to: 2, temp: 71 },
        { from: 2, to: 4, temp: 82 }
    ];

    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

    function airTemp(t) {
        for (const seg of SCHEDULE) if (t <= seg.to) return seg.temp;
        return SCHEDULE[SCHEDULE.length - 1].temp;
    }

    // Temperature of the inside after t hours, for a sausage that takes
    // `tau` hours to close about 63% of the gap to the air temperature.
    function coreAt(tau, t) {
        let core = START_CORE;
        for (const seg of SCHEDULE) {
            if (t <= seg.from) break;
            const dt = Math.min(t, seg.to) - seg.from;
            core = seg.temp - (seg.temp - core) * Math.exp(-dt / tau);
        }
        return core;
    }

    // Finds the warming rate that makes the curve end at `finalTemp`.
    // A slower rate (bigger tau) always means a cooler finish, so a simple
    // halving search finds it.
    function solveTau(finalTemp) {
        let lo = 0.05;
        let hi = 60;
        for (let i = 0; i < 80; i++) {
            const mid = (lo + hi) / 2;
            if (coreAt(mid, HOURS) > finalTemp) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
    }

    // The whole curve for a batch whose final reading is `finalTemp`, and the
    // moment the inside reaches the 68°C target (null if it never does).
    function coreCurve(finalTemp) {
        const tau = solveTau(finalTemp);
        const points = [];
        for (let i = 0; i <= 80; i++) {
            const t = (i / 80) * HOURS;
            points.push({ t, T: coreAt(tau, t) });
        }
        let crossing = null;
        if (coreAt(tau, HOURS) >= TARGET) {
            let lo = 0;
            let hi = HOURS;
            for (let i = 0; i < 80; i++) {
                const mid = (lo + hi) / 2;
                if (coreAt(tau, mid) >= TARGET) hi = mid; else lo = mid;
            }
            crossing = (lo + hi) / 2;
        }
        return { tau, points, final: coreAt(tau, HOURS), crossing };
    }

    // ---------- 1. The stages ----------
    // `items` are the positions (from 0) of the checklist items that make a
    // stage count as done. The checklist follows the manual's seven steps, and
    // steps 2 and 3 (wash and load, then grind) share one picture.
    const STATIONS = [
        { id: 'chill',   label: ['Keep', 'cold'],      items: [0] },
        { id: 'grind',   label: ['Wash &', 'grind'],   items: [1, 2] },
        { id: 'mix',     label: ['Slurry', '& mix'],   items: [3] },
        { id: 'regrind', label: ['Grind', 'again'],    items: [4] },
        { id: 'stuff',   label: ['Stuff', 'casings'],  items: [5] },
        { id: 'smoke',   label: ['Smoke', '& cool'],   items: [6] }
    ];

    // Which stages are done, and which is next, given the ticked items.
    function stationStates(flags) {
        const states = STATIONS.map((s) => ({ id: s.id, done: s.items.every((k) => !!flags[k]), current: false }));
        const next = states.find((s) => !s.done);
        if (next) next.current = true;
        return states;
    }

    function progressText(flags) {
        const done = stationStates(flags).filter((s) => s.done).length;
        return `${done} of ${STATIONS.length} stages done`;
    }

    // ---------- 2. The process line ----------
    const NS = 'http://www.w3.org/2000/svg';
    function el(tag, attrs) {
        const node = document.createElementNS(NS, tag);
        for (const key in attrs) node.setAttribute(key, attrs[key]);
        return node;
    }

    const FLOW = { W: 320, H: 100, iconY: 42 };

    // Small equipment drawings, each centred on (0, 0). Colours come from the
    // page's stylesheet, so the "done" and "next" looks are set in one place.
    function drawIcon(g, id) {
        const add = (tag, attrs, cls = 'flow-icon') => g.appendChild(el(tag, { class: cls, ...attrs }));
        const body = 'flow-icon flow-fill';
        if (id === 'chill') {                               // a snowflake
            for (const a of [0, 60, 120]) {
                const r = (a * Math.PI) / 180;
                add('line', { x1: (-15 * Math.cos(r)).toFixed(1), y1: (-15 * Math.sin(r)).toFixed(1), x2: (15 * Math.cos(r)).toFixed(1), y2: (15 * Math.sin(r)).toFixed(1) });
            }
            add('circle', { r: 4 });
        } else if (id === 'grind' || id === 'regrind') {    // a grinder
            add('path', { d: 'M-10,-15 L10,-15 L5,-5 L-5,-5 Z' }, body);
            add('rect', { x: -13, y: -5, width: 26, height: 13, rx: 2 }, body);
            add('rect', { x: 13, y: -2, width: 5, height: 7 });
            add('line', { x1: -13, y1: 2, x2: -18, y2: 2 });
            add('circle', { cx: -18, cy: 2, r: 2 });
            if (id === 'regrind') add('path', { d: 'M-12,-20 Q0,-30 12,-20 M8,-24 L12,-20 L6,-19' });  // round again
        } else if (id === 'mix') {                          // a bowl being stirred
            add('path', { d: 'M-15,-3 Q-15,13 0,13 Q15,13 15,-3 Z' }, body);
            add('line', { x1: -15, y1: -3, x2: 15, y2: -3 });
            add('line', { x1: 5, y1: -17, x2: -3, y2: 7 });
            add('path', { d: 'M-9,4 Q-5,0 -1,4 Q3,8 7,4' });
        } else if (id === 'stuff') {                        // a stuffer filling a casing
            add('rect', { x: -17, y: -9, width: 23, height: 17, rx: 3 }, body);
            add('path', { d: 'M6,-4 L13,-4 L13,4 L6,4' });
            add('path', { d: 'M13,0 Q23,0 23,10', 'stroke-linecap': 'round' }, 'flow-icon flow-icon--thick');
            add('line', { x1: -17, y1: 0, x2: -22, y2: 0 });
        } else if (id === 'smoke') {                        // a smokehouse with smoke
            add('rect', { x: -15, y: -6, width: 30, height: 21, rx: 2 }, body);
            add('path', { d: 'M-17,-6 L0,-16 L17,-6' });
            add('rect', { x: -4, y: 3, width: 8, height: 12 });
            add('path', { d: 'M-5,-20 Q-9,-24 -5,-28 Q-1,-32 -5,-35 M5,-20 Q1,-24 5,-28 Q9,-32 5,-35' });
        }
    }

    function renderFlow(svg) {
        svg.textContent = '';
        const slot = FLOW.W / STATIONS.length;

        // Arrows between the stages.
        for (let i = 0; i < STATIONS.length - 1; i++) {
            const x = (i + 1) * slot;
            svg.appendChild(el('path', { class: 'flow-arrow', d: `M${(x - 9).toFixed(1)},${FLOW.iconY} L${(x + 9).toFixed(1)},${FLOW.iconY} M${(x + 5).toFixed(1)},${FLOW.iconY - 4} L${(x + 9).toFixed(1)},${FLOW.iconY} L${(x + 5).toFixed(1)},${FLOW.iconY + 4}` }));
        }

        STATIONS.forEach((station, i) => {
            const cx = (i + 0.5) * slot;
            const g = el('g', { class: 'flow-station', 'data-station': station.id, 'data-state': 'pending' });

            const icon = el('g', { transform: `translate(${cx.toFixed(1)} ${FLOW.iconY})` });
            drawIcon(icon, station.id);
            g.appendChild(icon);

            // A tick in the corner once the stage is done.
            const badge = el('g', { class: 'flow-badge', transform: `translate(${(cx + 17).toFixed(1)} ${FLOW.iconY - 18})` });
            badge.appendChild(el('circle', { r: 7 }));
            badge.appendChild(el('path', { d: 'M-3.2,0.2 L-0.8,2.8 L3.4,-2.6' }));
            g.appendChild(badge);

            station.label.forEach((line, k) => {
                const t = el('text', { class: 'flow-label', x: cx.toFixed(1), y: 79 + k * 12, 'text-anchor': 'middle' });
                t.textContent = line;
                g.appendChild(t);
            });
            svg.appendChild(g);
        });
        setFlowProgress(svg, []);
    }

    // Shows which stages are done, and which is next.
    function setFlowProgress(svg, flags) {
        const states = stationStates(flags);
        for (const s of states) {
            const g = svg.querySelector(`.flow-station[data-station="${s.id}"]`);
            if (g) g.setAttribute('data-state', s.done ? 'done' : s.current ? 'current' : 'pending');
        }
        svg.setAttribute('aria-label', `The sausage-making stages in order. ${progressText(flags)}.`);
        return states;
    }

    // ---------- 3. The chart ----------
    const CH = { W: 320, H: 190, left: 34, right: 10, top: 18, bottom: 30, yMax: 90 };
    const plotW = CH.W - CH.left - CH.right;
    const plotH = CH.H - CH.top - CH.bottom;
    const xOf = (t) => CH.left + (t / HOURS) * plotW;
    const yOf = (T) => CH.top + plotH - (T / CH.yMax) * plotH;

    const AMBER = '#d9a066';
    const TEAL = '#5cc2ae';
    const MUTED = '#7d8b98';

    // A thin outline in the panel's own colour around a label, so a line passing
    // behind it (the target line, the curve) does not run through the letters.
    const HALO = { stroke: '#14202b', 'stroke-width': 3.5, 'paint-order': 'stroke', 'stroke-linejoin': 'round' };

    function renderChart(svg) {
        svg.textContent = '';
        const text = (str, attrs) => { const t = el('text', { fill: MUTED, 'font-size': 9, 'font-family': 'IBM Plex Mono, monospace', ...attrs }); t.textContent = str; return t; };

        // Grid and axes.
        for (const T of [0, 20, 40, 60, 80]) {
            svg.appendChild(el('line', { x1: CH.left, x2: CH.W - CH.right, y1: yOf(T).toFixed(1), y2: yOf(T).toFixed(1), stroke: '#22313d', 'stroke-width': 1 }));
            svg.appendChild(text(String(T), { x: CH.left - 6, y: (yOf(T) + 3).toFixed(1), 'text-anchor': 'end' }));
        }
        for (let h = 0; h <= HOURS; h++) {
            svg.appendChild(text(`${h}h`, { x: xOf(h).toFixed(1), y: CH.H - 16, 'text-anchor': 'middle' }));
        }
        svg.appendChild(text('°C', { x: 6, y: 12 }));
        svg.appendChild(text('hours in the smokehouse', { x: (CH.left + plotW / 2).toFixed(1), y: CH.H - 4, 'text-anchor': 'middle' }));

        // The target.
        svg.appendChild(el('line', { x1: CH.left, x2: CH.W - CH.right, y1: yOf(TARGET).toFixed(1), y2: yOf(TARGET).toFixed(1), stroke: '#e07a4d', 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }));
        svg.appendChild(text(`target ${TARGET}°C`, { x: CH.left + 4, y: (yOf(TARGET) - 4).toFixed(1), fill: '#e07a4d' }));

        // The smokehouse schedule, as steps.
        let d = `M${xOf(0).toFixed(1)},${yOf(SCHEDULE[0].temp).toFixed(1)}`;
        SCHEDULE.forEach((seg, i) => {
            if (i > 0) d += ` L${xOf(seg.from).toFixed(1)},${yOf(seg.temp).toFixed(1)}`;
            d += ` L${xOf(seg.to).toFixed(1)},${yOf(seg.temp).toFixed(1)}`;
        });
        svg.appendChild(el('path', { d, fill: 'none', stroke: AMBER, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
        SCHEDULE.forEach((seg, i) => {
            const mid = (seg.from + seg.to) / 2;
            // the lowest step's label sits below its line: above it, it would sit only a few
            // pixels under the target label. (Below, the curve is still far lower, so it is clear.)
            svg.appendChild(text(`${seg.temp}°C`, { x: xOf(mid).toFixed(1), y: (yOf(seg.temp) + (i === 0 ? 12 : -5)).toFixed(1), 'text-anchor': 'middle', fill: AMBER }));
        });

        // Key.
        svg.appendChild(text('smokehouse', { x: CH.left, y: 10, fill: AMBER }));
        svg.appendChild(text('inside the sausage', { x: CH.left + 74, y: 10, fill: TEAL }));

        // Parts filled in as the test runs.
        svg.appendChild(el('polyline', { id: 'chart-core', points: '', fill: 'none', stroke: TEAL, 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
        svg.appendChild(el('line', { id: 'chart-cross', x1: 0, x2: 0, y1: 0, y2: 0, stroke: TEAL, 'stroke-width': 1, 'stroke-dasharray': '2 3', visibility: 'hidden' }));
        svg.appendChild(text('', { id: 'chart-cross-label', fill: TEAL, visibility: 'hidden', ...HALO }));
        svg.appendChild(el('circle', { id: 'chart-dot', r: 3.5, cx: 0, cy: 0, fill: '#f2f3f1', stroke: TEAL, 'stroke-width': 1.5, visibility: 'hidden' }));
        svg.appendChild(text('', { id: 'chart-reading-label', fill: '#f2f3f1', 'font-size': 10, 'text-anchor': 'end', visibility: 'hidden', ...HALO }));
    }

    function resetChart(svg) {
        svg.querySelector('#chart-core').setAttribute('points', '');
        for (const id of ['chart-cross', 'chart-cross-label', 'chart-dot', 'chart-reading-label']) svg.querySelector('#' + id).setAttribute('visibility', 'hidden');
    }

    // The inside's temperature curve, drawn as far as `upTo` hours.
    function drawCore(svg, curve, upTo) {
        const tip = clamp(upTo, 0, HOURS);
        const pts = curve.points.filter((p) => p.t <= tip);
        // Add the exact tip only if it falls between two stored points; at the very
        // end it IS the last stored point, and adding it again would repeat it.
        if (pts.length === 0 || pts[pts.length - 1].t < tip - 1e-9) pts.push({ t: tip, T: coreAt(curve.tau, tip) });
        svg.querySelector('#chart-core').setAttribute('points', pts.map((p) => `${xOf(p.t).toFixed(1)},${yOf(p.T).toFixed(1)}`).join(' '));
        const last = pts[pts.length - 1];
        const dot = svg.querySelector('#chart-dot');
        dot.setAttribute('cx', xOf(last.t).toFixed(1));
        dot.setAttribute('cy', yOf(last.T).toFixed(1));
        dot.setAttribute('visibility', 'visible');
        return last;
    }

    // The finished picture: the whole curve, the reading, and when (if ever)
    // the inside reached the target.
    function finishChart(svg, curve, reading) {
        drawCore(svg, curve, HOURS);
        svg.querySelector('#chart-dot').setAttribute('visibility', 'hidden');

        const label = svg.querySelector('#chart-reading-label');
        label.textContent = `${reading.toFixed(1)}°C`;
        label.setAttribute('x', (xOf(HOURS) - 6).toFixed(1));
        // Above the dot when there is room under the top (82°C) step; below it for
        // high readings, where the label would otherwise sit on that step.
        const above = reading < 70;
        label.setAttribute('y', (yOf(reading) + (above ? -8 : 19)).toFixed(1));
        label.setAttribute('visibility', 'visible');
        const dot = svg.querySelector('#chart-dot');
        dot.setAttribute('cx', xOf(HOURS).toFixed(1));
        dot.setAttribute('cy', yOf(reading).toFixed(1));
        dot.setAttribute('visibility', 'visible');

        const cross = svg.querySelector('#chart-cross');
        const crossLabel = svg.querySelector('#chart-cross-label');
        if (curve.crossing !== null) {
            const x = xOf(curve.crossing);
            cross.setAttribute('x1', x.toFixed(1)); cross.setAttribute('x2', x.toFixed(1));
            cross.setAttribute('y1', yOf(TARGET).toFixed(1)); cross.setAttribute('y2', yOf(0).toFixed(1));
            cross.setAttribute('visibility', 'visible');
            crossLabel.textContent = `${TARGET}°C at ${curve.crossing.toFixed(1)} h`;
            const right = curve.crossing > 2.4;
            crossLabel.setAttribute('x', (x + (right ? -4 : 4)).toFixed(1));
            crossLabel.setAttribute('y', (yOf(0) - 5).toFixed(1));
            crossLabel.setAttribute('text-anchor', right ? 'end' : 'start');
            crossLabel.setAttribute('visibility', 'visible');
        } else {
            cross.setAttribute('visibility', 'hidden');
            crossLabel.setAttribute('visibility', 'hidden');
        }
    }

    function prefersReducedMotion() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    const PLAY_MS = 1500;

    // Draws the inside warming up over the three smoking stages, then calls
    // onDone. With "reduce motion" on, it jumps straight to the finished chart.
    function playChart(options) {
        const { svg, curve, reading, onFrame, onDone } = options;
        resetChart(svg);
        const finish = () => { finishChart(svg, curve, reading); if (onDone) onDone(); };

        if (options.reducedMotion !== undefined ? options.reducedMotion : prefersReducedMotion()) {
            finish();
            return { cancel() {} };
        }

        let start = null;
        let handle = null;
        let cancelled = false;
        function frame(now) {
            if (cancelled) return;
            if (start === null) start = now;
            const p = clamp((now - start) / PLAY_MS, 0, 1);
            if (p >= 1) { finish(); return; }
            const tip = drawCore(svg, curve, p * HOURS);
            if (onFrame) onFrame({ t: tip.t, T: tip.T });
            handle = requestAnimationFrame(frame);
        }
        handle = requestAnimationFrame(frame);
        return { cancel() { cancelled = true; if (handle !== null) cancelAnimationFrame(handle); } };
    }

    window.SausageVisual = {
        HOURS, TARGET, START_CORE, SCHEDULE, STATIONS, FLOW, CH, PLAY_MS,
        airTemp, coreAt, solveTau, coreCurve, stationStates, progressText,
        renderFlow, setFlowProgress, renderChart, resetChart, drawCore, finishChart, playChart
    };
})();
