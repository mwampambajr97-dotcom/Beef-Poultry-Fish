// =====================================================
// Shared drawing helpers, used by more than one illustration:
//   - labToRgb / labToCss : CIELAB (D65) -> sRGB colour conversion
//   - catmullRomClosed    : turns a few points into a smooth closed outline
// Kept in one place so a correction here fixes every picture at once,
// rather than living as two copies that drift apart.
// =====================================================

(function () {
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


    window.DrawUtils = { labToRgb, labToCss, catmullRomClosed };
})();
