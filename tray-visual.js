// =====================================================
// Drying tray — a drawn ILLUSTRATION of meat pieces drying in the
// sun, used by the Sun Drying practical.
//
// What is real here: how much the pieces shrink and how much of the
// water has gone are WORKED OUT from the moisture figures the page
// already produces, not decorated on. Two assumptions, stated plainly:
//   1. The moisture figures are wet-basis percentages (water as a share
//      of the whole piece), which is how a moisture analyzer reports them.
//   2. Only water leaves; the dry matter stays the same.
// From those, the mass left and the water lost follow directly.
//
// What is only illustrative: the colours, and the exact amount a real
// piece shrinks. The drawing shrinks each piece as though shrinkage
// followed the mass lost, equally in every direction. Real meat varies,
// so the page says so. It is a diagram, not a photograph.
//
// Layout of this file:
//   1. Pure maths and layout (no browser needed, unit-tested)
//   2. Drawing into an <svg> element
// Everything is exposed as window.TrayVisual.
// =====================================================

(function () {
    const { labToCss, catmullRomClosed } = window.DrawUtils;

    const VIEW = { W: 320, H: 220 };
    const COLS = 3;
    const ROWS = 2;
    const EDGE_MARGIN = 10; // keep pieces this far inside the tray's edge

    // ILLUSTRATIVE colours (CIELAB): raw beef red, drying to a dark
    // brown-red. Chosen to read clearly as "fresh" and "dried"; they are
    // not measurements.
    const FRESH = { L: 42, a: 24, b: 13 };
    const DRIED = { L: 24, a: 11, b: 8 };

    // ---------- 1. The maths ----------
    const clamp01 = (x) => Math.min(1, Math.max(0, x));
    const lerp = (a, b, t) => a + (b - a) * t;

    // Share of the starting mass still there, given wet-basis moisture at
    // the start (m0) and now (m), both in percent. Dry matter is constant,
    // so (100 - m0) of every 100 g stays, and it is now (100 - m)% of the
    // lighter piece.
    function massFraction(m0, m) {
        return (100 - m0) / (100 - m);
    }

    // Equal shrinkage in all three directions: length scales with the
    // cube root of what is left.
    function linearScale(fraction) {
        return Math.cbrt(fraction);
    }

    // Share of the ORIGINAL water that has gone. Water now = fraction * m,
    // water at the start = m0.
    function waterLostFraction(m0, m) {
        return clamp01(1 - (massFraction(m0, m) * m) / m0);
    }

    function pieceColourLab(waterLost) {
        const w = clamp01(waterLost);
        return { L: lerp(FRESH.L, DRIED.L, w), a: lerp(FRESH.a, DRIED.a, w), b: lerp(FRESH.b, DRIED.b, w) };
    }

    // Everything the page needs to describe one moment of the drying.
    function describeState(m0, m) {
        const fraction = massFraction(m0, m);
        const water = waterLostFraction(m0, m);
        return {
            fraction,
            waterLost: water,
            scale: linearScale(fraction),
            massPercent: Math.round(fraction * 100),
            waterPercent: Math.round(water * 100)
        };
    }

    // ---------- 1. The layout ----------
    // The same Steak ID always lays out the same six pieces.
    function buildTray(sampleId) {
        const rand = seededRandom(hashString(`${sampleId}|tray`));
        const cellW = VIEW.W / COLS;
        const cellH = VIEW.H / ROWS;
        const pieces = [];

        for (let i = 0; i < COLS * ROWS; i++) {
            const col = i % COLS;
            const row = Math.floor(i / COLS);
            const hw = 33 + rand() * 7;
            const hh = 16 + rand() * 4;
            const cx = (col + 0.5) * cellW + (rand() - 0.5) * 8;
            const cy = (row + 0.5) * cellH + (rand() - 0.5) * 10;
            const rot = (rand() - 0.5) * 20; // degrees

            // A blunt, rounded strip, slightly irregular like a hand-cut piece.
            const pts = [];
            const N = 14;
            for (let k = 0; k < N; k++) {
                const th = (k / N) * Math.PI * 2;
                const c = Math.cos(th);
                const s = Math.sin(th);
                const jr = 1 + (rand() - 0.5) * 0.12;
                pts.push({
                    x: hw * Math.sign(c) * Math.pow(Math.abs(c), 0.5) * jr,
                    y: hh * Math.sign(s) * Math.pow(Math.abs(s), 0.5) * jr
                });
            }

            // A couple of surface creases that become more visible as it dries.
            const wrinkles = [];
            for (let k = 0; k < 2; k++) {
                const y0 = (rand() - 0.5) * hh * 1.2;
                const x1 = -hw * (0.2 + rand() * 0.4);
                wrinkles.push({ x1, y1: y0, x2: x1 + hw * (0.4 + rand() * 0.3), y2: y0 + (rand() - 0.5) * 6, bend: (rand() - 0.5) * 8 });
            }

            pieces.push({ index: i, cx, cy, rot, hw, hh, outline: catmullRomClosed(pts, 6), wrinkles });
        }
        // A piece that would poke past the tray's rim is nudged back inside.
        // (Moving it by a few units cannot make it touch a neighbour: the
        // pieces start well apart, which the tests check.)
        for (const piece of pieces) {
            const pts = placedOutline(piece, 1);
            const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
            const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
            if (minX < EDGE_MARGIN) piece.cx += EDGE_MARGIN - minX;
            else if (maxX > VIEW.W - EDGE_MARGIN) piece.cx -= maxX - (VIEW.W - EDGE_MARGIN);
            if (minY < EDGE_MARGIN) piece.cy += EDGE_MARGIN - minY;
            else if (maxY > VIEW.H - EDGE_MARGIN) piece.cy -= maxY - (VIEW.H - EDGE_MARGIN);
        }

        return { sampleId, pieces, view: VIEW };
    }

    // The outline of a piece in tray coordinates at a given size.
    function placedOutline(piece, scale = 1) {
        const a = (piece.rot * Math.PI) / 180;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        return piece.outline.map((p) => ({
            x: piece.cx + (p.x * cos - p.y * sin) * scale,
            y: piece.cy + (p.x * sin + p.y * cos) * scale
        }));
    }

    // ---------- 2. Drawing ----------
    const NS = 'http://www.w3.org/2000/svg';

    function el(tag, attrs) {
        const node = document.createElementNS(NS, tag);
        for (const key in attrs) node.setAttribute(key, attrs[key]);
        return node;
    }

    function pathData(poly) {
        return 'M' + poly.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L') + ' Z';
    }

    function renderTray(svg, tray) {
        svg.textContent = '';

        // The tray itself.
        svg.appendChild(el('rect', { width: VIEW.W, height: VIEW.H, rx: 8, fill: '#e9e6de' }));
        svg.appendChild(el('rect', { x: 5, y: 5, width: VIEW.W - 10, height: VIEW.H - 10, rx: 6, fill: 'none', stroke: 'rgba(0,0,0,0.13)', 'stroke-width': 1.5 }));

        // Dashed outlines of the Day 0 size, so the shrinking is easy to see.
        const ghosts = el('g', { fill: 'none', stroke: 'rgba(0,0,0,0.3)', 'stroke-width': 1, 'stroke-dasharray': '3 3' });
        for (const piece of tray.pieces) {
            ghosts.appendChild(el('path', { class: 'drying-ghost', 'data-index': piece.index, d: pathData(placedOutline(piece, 1)) }));
        }
        svg.appendChild(ghosts);

        // The pieces. Each is drawn around its own centre and then moved,
        // turned and scaled with a CSS transform, so a change can animate.
        for (const piece of tray.pieces) {
            const g = el('g', { class: 'drying-piece', 'data-index': piece.index });
            g.appendChild(el('path', { class: 'piece-body', d: pathData(piece.outline), stroke: 'rgba(0,0,0,0.35)', 'stroke-width': 1 }));
            const creases = el('g', { class: 'piece-wrinkles', fill: 'none', stroke: 'rgba(0,0,0,0.6)', 'stroke-width': 1, 'stroke-linecap': 'round' });
            for (const w of piece.wrinkles) {
                creases.appendChild(el('path', { d: `M${w.x1.toFixed(1)},${w.y1.toFixed(1)} Q${((w.x1 + w.x2) / 2).toFixed(1)},${(((w.y1 + w.y2) / 2) + w.bend).toFixed(1)} ${w.x2.toFixed(1)},${w.y2.toFixed(1)}` }));
            }
            g.appendChild(creases);
            svg.appendChild(g);
        }

        applyState(svg, tray, describeState(50, 50)); // fresh: full size, undried
    }

    function applyState(svg, tray, state) {
        const colour = pieceColourLab(state.waterLost);
        const fill = labToCss(colour.L, colour.a, colour.b);
        for (const piece of tray.pieces) {
            const g = svg.querySelector(`.drying-piece[data-index="${piece.index}"]`);
            if (!g) continue;
            g.style.transformOrigin = '0px 0px';
            g.style.transform = `translate(${piece.cx.toFixed(1)}px, ${piece.cy.toFixed(1)}px) rotate(${piece.rot.toFixed(2)}deg) scale(${state.scale.toFixed(4)})`;
            g.dataset.scale = state.scale.toFixed(4);
            g.querySelector('.piece-body').style.fill = fill;
            g.querySelector('.piece-wrinkles').style.opacity = (0.05 + 0.5 * state.waterLost).toFixed(3);
        }
    }

    // Show the pieces as they are at a given moisture. Returns the numbers
    // behind the picture so the page can say them in words.
    function setTrayDay(svg, tray, startMoisture, moisture) {
        const state = describeState(startMoisture, moisture);
        applyState(svg, tray, state);
        return state;
    }

    window.TrayVisual = {
        VIEW, FRESH, DRIED,
        massFraction, linearScale, waterLostFraction, pieceColourLab, describeState,
        buildTray, placedOutline, renderTray, setTrayDay
    };
})();
