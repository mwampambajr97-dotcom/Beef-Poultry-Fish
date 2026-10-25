// =====================================================
// Fillet surface — a drawn ILLUSTRATION of the cut face of a
// poultry fillet, used by the Chromameter practical.
//
// What it is: a diagram the student can place the measuring head
// on. The fillet's colour is drawn from the sample's L*, a*, b*
// values, and each side (A, B, C) has its own seeded layout of fat
// and connective tissue, so the same Sample ID and side always
// look the same.
//
// What it is NOT: a photograph, or a realistic render of meat.
// Real colour on a real fillet depends on lighting, the instrument
// and the screen it is viewed on, and the page says so.
//
// Layout of this file:
//   1. Pure geometry and maths (no browser needed, unit-tested)
//   2. Drawing into an <svg> element
//   3. Mouse / touch / keyboard interaction
// Everything is exposed as window.FilletSurface.
// =====================================================

(function () {
    const SURFACE_VIEW = { W: 320, H: 220 };
    const HEAD_RADIUS = 12; // drawn size of the measuring head

    // ILLUSTRATIVE — these are NOT from the practical manual or from
    // published data. Their DIRECTION is well established (fat and
    // connective tissue are lighter, and fat is yellower, than the
    // muscle around them); the SIZES below are chosen so the effect is
    // clearly visible in a simulation, and nothing more. Treat them like
    // the tenderness bands in the Texture Analyzer: a teaching device.
    const SURFACE_EFFECTS = {
        FAT:        { dL: [8, 12],  da: [-2.0, -1.0], db: [2.5, 4.5] },
        CONNECTIVE: { dL: [10, 14], da: [-1.5, -0.5], db: [0.5, 2.0] },
        // Natural drift in L* across a single cut face (thicker/thinner
        // regions): at most about this much from one edge to the other.
        GRADIENT_L: 1.2
    };

    // ---------- 1. Colour: CIELAB (D65) -> sRGB ----------
    // A proper conversion, so the swatch and the fillet show what the
    // numbers actually describe rather than a rough guess.
    function labToRgb(L, a, b) {
        const e = 216 / 24389;
        const k = 24389 / 27;
        const fy = (L + 16) / 116;
        const fx = fy + a / 500;
        const fz = fy - b / 200;
        const xr = fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k;
        const yr = L > k * e ? fy ** 3 : L / k;
        const zr = fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k;

        const X = xr * 0.95047;
        const Y = yr;
        const Z = zr * 1.08883;

        const lin = [
            3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
            -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z,
            0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z
        ];
        return lin.map((u) => {
            const c = Math.min(1, Math.max(0, u));
            const g = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
            return Math.round(g * 255);
        });
    }

    function labToCss(L, a, b) {
        const [r, g, bl] = labToRgb(L, a, b);
        return `rgb(${r}, ${g}, ${bl})`;
    }

    // ---------- 1. Geometry helpers ----------
    function catmullRomClosed(pts, segs) {
        const n = pts.length;
        const out = [];
        for (let i = 0; i < n; i++) {
            const p0 = pts[(i - 1 + n) % n];
            const p1 = pts[i];
            const p2 = pts[(i + 1) % n];
            const p3 = pts[(i + 2) % n];
            for (let s = 0; s < segs; s++) {
                const t = s / segs;
                const t2 = t * t;
                const t3 = t2 * t;
                out.push({
                    x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
                    y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
                });
            }
        }
        return out;
    }

    function pointInPolygon(poly, x, y) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
            if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    }

    function distToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
        const orient = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
        const o1 = orient(ax, ay, bx, by, cx, cy), o2 = orient(ax, ay, bx, by, dx, dy);
        const o3 = orient(cx, cy, dx, dy, ax, ay), o4 = orient(cx, cy, dx, dy, bx, by);
        return o1 * o2 < 0 && o3 * o4 < 0;
    }

    // Shortest distance between two line segments.
    function distSegmentToSegment(a, b) {
        if (segmentsCross(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2)) return 0;
        return Math.min(
            distToSegment(a.x1, a.y1, b.x1, b.y1, b.x2, b.y2),
            distToSegment(a.x2, a.y2, b.x1, b.y1, b.x2, b.y2),
            distToSegment(b.x1, b.y1, a.x1, a.y1, a.x2, a.y2),
            distToSegment(b.x2, b.y2, a.x1, a.y1, a.x2, a.y2)
        );
    }

    function distToPolygon(poly, x, y) {
        let best = Infinity;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            best = Math.min(best, distToSegment(x, y, poly[j].x, poly[j].y, poly[i].x, poly[i].y));
        }
        return best;
    }

    function pathData(poly) {
        return 'M' + poly.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L') + ' Z';
    }

    // ---------- 1. Patches (fat and connective tissue) ----------
    // A patch "hits" a point when the measuring head's centre is within
    // the patch shape grown by half the head radius — i.e. the head is at
    // least about half on it. Fat is drawn as an irregular blob but
    // detected as a circle slightly smaller than the blob's smallest
    // extent, so anything flagged as "on fat" is visibly on the blob.
    // Clear space between the drawn edges of two patches (negative = overlap).
    function patchGap(p, q) {
        const radius = (k) => (k.kind === 'fat' ? k.r * 1.12 : k.hw);
        if (p.kind === 'fat' && q.kind === 'fat') {
            return Math.hypot(p.cx - q.cx, p.cy - q.cy) - radius(p) - radius(q);
        }
        if (p.kind === 'connective' && q.kind === 'connective') {
            return distSegmentToSegment(p, q) - radius(p) - radius(q);
        }
        const fat = p.kind === 'fat' ? p : q;
        const strip = p.kind === 'fat' ? q : p;
        return distToSegment(fat.cx, fat.cy, strip.x1, strip.y1, strip.x2, strip.y2) - radius(fat) - radius(strip);
    }

    function patchCentre(p) {
        return p.kind === 'fat' ? { x: p.cx, y: p.cy } : { x: (p.x1 + p.x2) / 2, y: (p.y1 + p.y2) / 2 };
    }

    function patchHit(p, x, y, extra = 0) {
        const reach = HEAD_RADIUS * 0.5 + extra;
        if (p.kind === 'fat') {
            return Math.hypot(x - p.cx, y - p.cy) <= p.r * 0.88 + reach;
        }
        return distToSegment(x, y, p.x1, p.y1, p.x2, p.y2) <= p.hw + reach;
    }

    function range(rand, [lo, hi]) {
        return lo + rand() * (hi - lo);
    }

    // The same Sample ID and side always produce the same fillet.
    function buildSurface(sampleId, side) {
        const rand = seededRandom(hashString(`${sampleId}|${side}`));
        const cx = SURFACE_VIEW.W / 2;
        const cy = SURFACE_VIEW.H / 2;
        const rx = 126 + rand() * 12;
        const ry = 72 + rand() * 10;

        // A rounded, slightly tapered shape, with a little natural irregularity.
        const base = [];
        const N = 12;
        for (let i = 0; i < N; i++) {
            const th = (i / N) * Math.PI * 2;
            const taper = 1 - 0.28 * Math.cos(th); // narrower toward the right
            const jr = 1 + (rand() - 0.5) * 0.14;
            base.push({ x: cx + rx * Math.cos(th) * jr, y: cy + ry * Math.sin(th) * taper * jr });
        }

        const surface = {
            sampleId, side, cx, cy, rx, ry,
            outline: catmullRomClosed(base, 10),
            gx: (rand() - 0.5) * 2 * SURFACE_EFFECTS.GRADIENT_L,
            gy: (rand() - 0.5) * 2 * SURFACE_EFFECTS.GRADIENT_L,
            patches: []
        };

        function randomSpot() {
            return {
                x: cx + (rand() - 0.5) * 2 * rx * 0.85,
                y: cy + (rand() - 0.5) * 2 * ry * 0.8
            };
        }

        function fits(p) {
            const pts = p.kind === 'fat'
                ? [{ x: p.cx, y: p.cy }]
                : [{ x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 }, patchCentre(p)];
            const margin = p.kind === 'fat' ? p.r * 1.12 + 3 : p.hw + 3;
            for (const q of pts) {
                if (!pointInPolygon(surface.outline, q.x, q.y)) return false;
                if (distToPolygon(surface.outline, q.x, q.y) < margin) return false;
            }
            // Keep the default head position (the centre) clear, so a student
            // who just presses the button without placing the head is on muscle.
            if (patchHit(p, cx, cy, HEAD_RADIUS)) return false;
            // Keep patches visibly apart: a clear gap between their drawn edges,
            // so none overlap and it is always obvious which one the head is on.
            return surface.patches.every((o) => patchGap(p, o) >= 8);
        }

        function tryAdd(make) {
            for (let attempt = 0; attempt < 80; attempt++) {
                const p = make();
                if (fits(p)) {
                    surface.patches.push(p);
                    return true;
                }
            }
            return false;
        }

        function makeFat() {
            const spot = randomSpot();
            const r = 14 + rand() * 8;
            const blobPts = [];
            const M = 10;
            for (let i = 0; i < M; i++) {
                const th = (i / M) * Math.PI * 2;
                const rr = r * (0.88 + rand() * 0.24);
                blobPts.push({ x: spot.x + rr * Math.cos(th), y: spot.y + rr * Math.sin(th) });
            }
            return {
                kind: 'fat', cx: spot.x, cy: spot.y, r,
                blob: catmullRomClosed(blobPts, 6),
                dL: range(rand, SURFACE_EFFECTS.FAT.dL),
                da: range(rand, SURFACE_EFFECTS.FAT.da),
                db: range(rand, SURFACE_EFFECTS.FAT.db)
            };
        }

        function makeConnective() {
            const spot = randomSpot();
            const angle = (rand() - 0.5) * 0.9;
            const half = (50 + rand() * 30) / 2;
            return {
                kind: 'connective',
                x1: spot.x - Math.cos(angle) * half, y1: spot.y - Math.sin(angle) * half,
                x2: spot.x + Math.cos(angle) * half, y2: spot.y + Math.sin(angle) * half,
                hw: 3.5 + rand() * 1.5,
                dL: range(rand, SURFACE_EFFECTS.CONNECTIVE.dL),
                da: range(rand, SURFACE_EFFECTS.CONNECTIVE.da),
                db: range(rand, SURFACE_EFFECTS.CONNECTIVE.db)
            };
        }

        const nFat = 1 + (rand() < 0.5 ? 1 : 0);
        const nConn = 1 + (rand() < 0.5 ? 1 : 0);
        for (let i = 0; i < nFat; i++) tryAdd(makeFat);
        for (let i = 0; i < nConn; i++) tryAdd(makeConnective);

        return surface;
    }

    function insideOutline(surface, x, y) {
        return pointInPolygon(surface.outline, x, y);
    }

    function patchAt(surface, x, y) {
        return surface.patches.find((p) => patchHit(p, x, y)) || null;
    }

    function zoneAt(surface, x, y) {
        const p = patchAt(surface, x, y);
        return p ? p.kind : 'muscle';
    }

    // The reading the instrument would give with its head at (x, y),
    // before the small random instrument noise the page adds on top.
    function measureAt(surface, trueValue, x, y) {
        const p = patchAt(surface, x, y);
        let L = trueValue.L + surface.gx * ((x - surface.cx) / surface.rx) + surface.gy * ((y - surface.cy) / surface.ry);
        let a = trueValue.a;
        let b = trueValue.b;
        if (p) {
            L += p.dL;
            a += p.da;
            b += p.db;
        }
        return { L, a, b, zone: p ? p.kind : 'muscle' };
    }

    // ---------- 2. Drawing ----------
    const NS = 'http://www.w3.org/2000/svg';

    function el(tag, attrs) {
        const node = document.createElementNS(NS, tag);
        for (const key in attrs) node.setAttribute(key, attrs[key]);
        return node;
    }

    function renderSurface(svg, surface, trueValue, marker) {
        svg.textContent = '';
        const { L, a, b } = trueValue;
        const outlineD = pathData(surface.outline);

        const defs = el('defs', {});
        const clip = el('clipPath', { id: 'fillet-clip' });
        clip.appendChild(el('path', { d: outlineD }));
        defs.appendChild(clip);
        const shade = el('radialGradient', { id: 'fillet-shade', cx: '45%', cy: '40%', r: '65%' });
        // Kept faint on purpose: the fill is meant to be the sample's own colour,
        // and strong shading would quietly change it.
        shade.appendChild(el('stop', { offset: '35%', 'stop-color': '#ffffff', 'stop-opacity': '0.04' }));
        shade.appendChild(el('stop', { offset: '100%', 'stop-color': '#000000', 'stop-opacity': '0.06' }));
        defs.appendChild(shade);
        svg.appendChild(defs);

        // The board it sits on, and a soft shadow so it reads as an object.
        svg.appendChild(el('rect', { width: SURFACE_VIEW.W, height: SURFACE_VIEW.H, rx: 8, fill: '#e9e6de' }));
        svg.appendChild(el('path', { d: outlineD, transform: 'translate(3 5)', fill: 'rgba(0,0,0,0.13)' }));

        // Muscle, in the sample's own colour.
        svg.appendChild(el('path', { d: outlineD, fill: labToCss(L, a, b) }));

        // Muscle fibres running along the fillet.
        const fibres = el('g', { 'clip-path': 'url(#fillet-clip)', fill: 'none', stroke: labToCss(L - 5, a, b), 'stroke-opacity': '0.4', 'stroke-width': '1' });
        const count = 14;
        for (let k = 0; k < count; k++) {
            const v = ((k + 0.5) / count) * 2 - 1;
            const y0 = surface.cy + v * surface.ry * 0.95;
            const y1 = surface.cy + v * surface.ry * 0.55;
            const bend = v * 6;
            fibres.appendChild(el('path', {
                d: `M${(surface.cx - surface.rx).toFixed(1)},${y0.toFixed(1)} Q${surface.cx.toFixed(1)},${(y0 + bend).toFixed(1)} ${(surface.cx + surface.rx).toFixed(1)},${y1.toFixed(1)}`
            }));
        }
        svg.appendChild(fibres);

        // Fat and connective tissue, each in the colour its own readings imply.
        for (const p of surface.patches) {
            const colour = labToCss(L + p.dL, a + p.da, b + p.db);
            const c = patchCentre(p);
            const common = { class: 'surface-patch', 'data-kind': p.kind, 'data-cx': c.x.toFixed(1), 'data-cy': c.y.toFixed(1) };
            if (p.kind === 'fat') {
                svg.appendChild(el('path', {
                    ...common, 'data-r': p.r.toFixed(1), d: pathData(p.blob),
                    fill: colour, stroke: 'rgba(255,255,255,0.55)', 'stroke-width': '1'
                }));
            } else {
                svg.appendChild(el('line', {
                    ...common, x1: p.x1.toFixed(1), y1: p.y1.toFixed(1), x2: p.x2.toFixed(1), y2: p.y2.toFixed(1),
                    stroke: colour, 'stroke-width': (p.hw * 2).toFixed(1), 'stroke-linecap': 'round'
                }));
            }
        }

        // Soft volume shading and an outline over everything.
        svg.appendChild(el('path', { d: outlineD, fill: 'url(#fillet-shade)' }));
        svg.appendChild(el('path', { d: outlineD, fill: 'none', stroke: 'rgba(0,0,0,0.22)', 'stroke-width': '1.2' }));

        // The measuring head. Dark and light rings so it shows on any colour.
        const head = el('g', { id: 'head-marker', transform: `translate(${marker.x.toFixed(1)} ${marker.y.toFixed(1)})`, 'pointer-events': 'none' });
        head.appendChild(el('circle', { r: HEAD_RADIUS, fill: 'none', stroke: '#14202b', 'stroke-width': '3.2' }));
        head.appendChild(el('circle', { r: HEAD_RADIUS, fill: 'none', stroke: '#ffffff', 'stroke-width': '1.5' }));
        head.appendChild(el('circle', { r: 2.2, fill: '#ffffff', stroke: '#14202b', 'stroke-width': '1' }));
        svg.appendChild(head);
    }

    function moveMarker(svg, x, y) {
        const head = svg.querySelector('#head-marker');
        if (head) head.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    }

    // ---------- 3. Interaction ----------
    function clientToSvg(svg, clientX, clientY) {
        const pt = svg.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        const m = svg.getScreenCTM();
        return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
    }

    // handlers: getSurface(), getMarker(), onPlace(x, y), onReject(), onMeasure()
    function attachInteraction(svg, handlers) {
        // The focus ring exists for people using the keyboard. After a mouse
        // or touch interaction it is just visual noise, so it is hidden then
        // and comes back as soon as a key is pressed.
        svg.addEventListener('pointerdown', () => svg.classList.add('using-pointer'));
        svg.addEventListener('keydown', () => svg.classList.remove('using-pointer'));

        svg.addEventListener('pointerdown', (event) => {
            const surface = handlers.getSurface();
            if (!surface) return;
            const p = clientToSvg(svg, event.clientX, event.clientY);
            if (insideOutline(surface, p.x, p.y)) {
                handlers.onPlace(p.x, p.y);
            } else {
                handlers.onReject();
            }
        });

        svg.addEventListener('keydown', (event) => {
            const surface = handlers.getSurface();
            if (!surface) return;
            const step = event.shiftKey ? 2 : 8;
            const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };

            if (moves[event.key]) {
                event.preventDefault();
                const m = handlers.getMarker();
                const nx = m.x + moves[event.key][0];
                const ny = m.y + moves[event.key][1];
                if (insideOutline(surface, nx, ny)) handlers.onPlace(nx, ny);
                else handlers.onReject();
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handlers.onMeasure();
            }
        });
    }

    window.FilletSurface = {
        SURFACE_VIEW, HEAD_RADIUS, SURFACE_EFFECTS,
        labToRgb, labToCss,
        buildSurface, insideOutline, patchAt, zoneAt, measureAt, patchGap,
        renderSurface, moveMarker, attachInteraction
    };
})();
