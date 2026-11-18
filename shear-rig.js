// =====================================================
// Shear test rig — a drawn ILLUSTRATION of a blade cutting through
// a strip of cooked meat, used by the Texture Analyzer practical.
//
// What is real here: the blade's position is tied to the same number
// as the force curve's horizontal axis (how far the blade has travelled
// through the sample), and the sample presses in and splits at the
// moment the curve peaks. The picture shows the curve happening; it does
// not change any value. The peak force, the saved reading and the ticket
// all come from the simulation exactly as before.
//
// What is only illustrative: the colours and shapes, and the exact
// amount the sample dents. The page says so.
//
// The manual has the sample cut parallel to the muscle fibres and then
// sheared across them, so the fibres are drawn running along the strip
// and the blade comes down across them.
//
// Layout of this file:
//   1. Pure maths and geometry (no browser needed, unit-tested)
//   2. Drawing into an <svg> element
//   3. The animation, which respects "reduce motion"
// Everything is exposed as window.ShearRig.
// =====================================================

(function () {
    const { labToCss } = window.DrawUtils;

    const VIEW = { W: 320, H: 170 };
    const CX = VIEW.W / 2; // the blade's centre line

    const SAMPLE = { x: 60, y: 92, w: 200, h: 50 };    // the strip, seen from the side
    const BLADE = { halfWidth: 7, length: 56 };
    const CLEAR_TOP = 26;     // before contact, the blade tip hovers this far above the sample
    const CLEAR_BOTTOM = 10;  // at the end, the tip is this far below the sample's underside
    const DENT_MAX = 9;       // deepest the surface presses in, at peak force
    const DENT_SPREAD = 24;   // how wide that dent is
    const GAP_MAX = 5;        // how far the two halves part after the split
    const FIBRES = 5;

    // Timing of the animation. The first part is the blade coming down to
    // touch the sample (no force yet); the rest is the test itself, and it
    // is the test part that lines up with the force curve.
    const APPROACH_MS = 500;
    const TEST_MS = 2100;

    // ILLUSTRATIVE colour for cooked meat (CIELAB), not a measurement.
    const SAMPLE_LAB = { L: 78, a: 3, b: 14 };

    // ---------- 1. Maths ----------
    const clamp01 = (x) => Math.min(1, Math.max(0, x));
    const smooth = (x) => x * x * (3 - 2 * x);

    // Where the blade tip is, as the test runs from t = 0 (touching the top)
    // to t = 1 (just through the bottom).
    function bladeTipY(t) {
        return SAMPLE.y + clamp01(t) * (SAMPLE.h + CLEAR_BOTTOM);
    }

    // Before contact: a goes 0 -> 1 as the blade comes down to touch.
    function approachTipY(a) {
        return SAMPLE.y - CLEAR_TOP * (1 - clamp01(a));
    }

    // The force at any moment, read off the curve's points by straight-line
    // interpolation between neighbours. t runs 0 to 1 like the curve's x.
    function forceAt(points, t) {
        const x = clamp01(t);
        if (x <= points[0].x) return points[0].y;
        for (let i = 1; i < points.length; i++) {
            if (x <= points[i].x) {
                const p = points[i - 1];
                const q = points[i];
                const span = q.x - p.x;
                return span === 0 ? q.y : p.y + ((q.y - p.y) * (x - p.x)) / span;
            }
        }
        return points[points.length - 1].y;
    }

    // The surface presses in as force builds, then springs back as the
    // sample fails at the peak.
    function dentDepth(t, force, peakForce, peakPosition) {
        const ratio = clamp01(force / peakForce);
        const relax = 1 - clamp01((t - peakPosition) / 0.06);
        return DENT_MAX * ratio * relax;
    }

    // Nothing is cut until the peak; then the two halves part.
    function gapWidth(t, peakPosition) {
        return GAP_MAX * smooth(clamp01((t - peakPosition) / 0.12));
    }

    function samplePaths(dent, gap) {
        const x0 = SAMPLE.x;
        const x1 = SAMPLE.x + SAMPLE.w;
        const y0 = SAMPLE.y;
        const yb = SAMPLE.y + SAMPLE.h;
        const top = (x) => y0 + dent * Math.exp(-Math.pow((x - CX) / DENT_SPREAD, 2));
        const region = (xa, xb) => {
            const pts = [];
            for (let x = xa; x < xb; x += 4) pts.push([x, top(x)]);
            pts.push([xb, top(xb)]);
            return 'M' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L')
                + ` L${xb.toFixed(1)},${yb} L${xa.toFixed(1)},${yb} Z`;
        };
        return { whole: region(x0, x1), left: region(x0, CX - gap / 2), right: region(CX + gap / 2, x1) };
    }

    // Fibre lines run along the strip, and are broken where the cut is.
    function fibrePaths(gap) {
        const x0 = SAMPLE.x + 6;
        const x1 = SAMPLE.x + SAMPLE.w - 6;
        const out = [];
        for (let k = 0; k < FIBRES; k++) {
            const y = SAMPLE.y + 11 + k * ((SAMPLE.h - 19) / (FIBRES - 1));
            out.push(gap >= 0.05
                ? `M${x0},${y.toFixed(1)} L${(CX - gap / 2 - 1).toFixed(1)},${y.toFixed(1)} M${(CX + gap / 2 + 1).toFixed(1)},${y.toFixed(1)} L${x1},${y.toFixed(1)}`
                : `M${x0},${y.toFixed(1)} L${x1},${y.toFixed(1)}`);
        }
        return out;
    }

    // Everything needed to draw one moment of the test.
    function rigGeometry(state) {
        const { t, force, peakForce, peakPosition } = state;
        const dent = dentDepth(t, force, peakForce, peakPosition);
        const gap = gapWidth(t, peakPosition);
        return {
            tipY: bladeTipY(t), dent, gap, split: gap >= 0.05,
            paths: samplePaths(dent, gap), fibres: fibrePaths(gap)
        };
    }

    // ---------- 2. Drawing ----------
    const NS = 'http://www.w3.org/2000/svg';

    function el(tag, attrs) {
        const node = document.createElementNS(NS, tag);
        for (const key in attrs) node.setAttribute(key, attrs[key]);
        return node;
    }

    function bladePath(tipY) {
        const top = tipY - BLADE.length;
        const w = BLADE.halfWidth;
        return `M${CX - w},${top} L${CX + w},${top} L${CX + w},${tipY - 7} L${CX},${tipY} L${CX - w},${tipY - 7} Z`;
    }

    function renderRig(svg) {
        svg.textContent = '';
        const fill = labToCss(SAMPLE_LAB.L, SAMPLE_LAB.a, SAMPLE_LAB.b);
        const edge = labToCss(SAMPLE_LAB.L - 22, SAMPLE_LAB.a + 2, SAMPLE_LAB.b);
        const plateY = SAMPLE.y + SAMPLE.h;

        // The platform, with a slot for the blade to pass into.
        const plate = el('g', { fill: '#4a5663', stroke: '#2c353f', 'stroke-width': 1 });
        plate.appendChild(el('rect', { x: 36, y: plateY, width: CX - 12 - 36, height: 14, rx: 2 }));
        plate.appendChild(el('rect', { x: CX + 12, y: plateY, width: 284 - (CX + 12), height: 14, rx: 2 }));
        svg.appendChild(plate);

        // The strip: one piece until it splits into two.
        const body = { fill, stroke: edge, 'stroke-width': 2, 'stroke-linejoin': 'round' };
        svg.appendChild(el('path', { ...body, id: 'rig-whole' }));
        svg.appendChild(el('path', { ...body, id: 'rig-left' }));
        svg.appendChild(el('path', { ...body, id: 'rig-right' }));

        const fibres = el('g', { id: 'rig-fibres', fill: 'none', stroke: edge, 'stroke-opacity': '0.55', 'stroke-width': 1, 'stroke-linecap': 'round' });
        for (let k = 0; k < FIBRES; k++) fibres.appendChild(el('path', {}));
        svg.appendChild(fibres);

        // The blade, drawn last so it sits in front.
        const blade = el('g', { id: 'rig-blade' });
        blade.appendChild(el('path', { id: 'rig-blade-shape', fill: '#cfd6dd', stroke: '#8a96a3', 'stroke-width': 1 }));
        svg.appendChild(blade);

        // Two small labels.
        // Kept well inside the drawing area: a label whose baseline sits on the
        // edge is cut in half by the picture's boundary.
        const label = { fill: '#7d8b98', 'font-size': 10, 'font-family': 'IBM Plex Mono, monospace' };
        const t1 = el('text', { ...label, x: CX + 14, y: 22 }); t1.textContent = 'blade';
        const t2 = el('text', { ...label, x: SAMPLE.x, y: SAMPLE.y + SAMPLE.h + 22 }); t2.textContent = 'sample: fibres run along the strip';
        svg.appendChild(t1); svg.appendChild(t2);

        setApproach(svg, 0);
    }

    function paint(svg, geo) {
        svg.querySelector('#rig-blade-shape').setAttribute('d', bladePath(geo.tipY));
        const whole = svg.querySelector('#rig-whole');
        const left = svg.querySelector('#rig-left');
        const right = svg.querySelector('#rig-right');
        whole.setAttribute('d', geo.paths.whole);
        left.setAttribute('d', geo.paths.left);
        right.setAttribute('d', geo.paths.right);
        whole.style.display = geo.split ? 'none' : '';
        left.style.display = geo.split ? '' : 'none';
        right.style.display = geo.split ? '' : 'none';
        svg.querySelectorAll('#rig-fibres path').forEach((p, i) => p.setAttribute('d', geo.fibres[i]));
        const blade = svg.querySelector('#rig-blade');
        blade.dataset.tipY = geo.tipY.toFixed(2);
        blade.dataset.dent = geo.dent.toFixed(2);
        blade.dataset.gap = geo.gap.toFixed(2);
        blade.dataset.split = String(geo.split);
    }

    // The blade hovering and coming down to touch the sample: no force yet.
    function setApproach(svg, a) {
        paint(svg, { tipY: approachTipY(a), dent: 0, gap: 0, split: false, paths: samplePaths(0, 0), fibres: fibrePaths(0) });
    }

    // One moment of the test itself.
    function setTest(svg, state) {
        paint(svg, rigGeometry(state));
    }

    // ---------- 3. Animation ----------
    function prefersReducedMotion() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    // Plays the whole test. onFrame({ phase, t, force }) is called as it goes
    // so the page can draw the curve in step; onDone() is called once at the end.
    // With "reduce motion" on, it jumps straight to the finished test.
    function play(options) {
        const { svg, points, peakForce, peakPosition, onFrame, onDone } = options;
        const finish = () => {
            setTest(svg, { t: 1, force: forceAt(points, 1), peakForce, peakPosition });
            if (onFrame) onFrame({ phase: 'test', t: 1, force: forceAt(points, 1) });
            if (onDone) onDone();
        };

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
            const elapsed = now - start;

            if (elapsed < APPROACH_MS) {
                setApproach(svg, elapsed / APPROACH_MS);
                if (onFrame) onFrame({ phase: 'approach', t: 0, force: 0 });
                handle = requestAnimationFrame(frame);
                return;
            }

            const t = clamp01((elapsed - APPROACH_MS) / TEST_MS);
            if (t >= 1) {
                finish();
                return;
            }
            const force = forceAt(points, t);
            setTest(svg, { t, force, peakForce, peakPosition });
            if (onFrame) onFrame({ phase: 'test', t, force });
            handle = requestAnimationFrame(frame);
        }

        handle = requestAnimationFrame(frame);
        return { cancel() { cancelled = true; if (handle !== null) cancelAnimationFrame(handle); } };
    }

    window.ShearRig = {
        VIEW, SAMPLE, APPROACH_MS, TEST_MS, DENT_MAX, GAP_MAX, CLEAR_TOP, CLEAR_BOTTOM,
        bladeTipY, approachTipY, forceAt, dentDepth, gapWidth, samplePaths, fibrePaths, rigGeometry,
        renderRig, setApproach, setTest, play
    };
})();
