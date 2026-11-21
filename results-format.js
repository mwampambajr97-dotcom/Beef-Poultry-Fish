// =====================================================
// Shared wording for saved results, used by BOTH the teacher dashboard
// and the student's My Results page, so that "how a result is described
// in words" lives in one place and the two pages can never drift apart.
//
// It also holds the logic behind the student's progress board: for each
// practical, how much of what the manual asks for has been practised.
// Those numbers come from the manual's own requirements:
//   - Chromameter:      at least 2 readings on each of 3 sides (taken on muscle)
//   - Texture Analyzer: at least 3 tests per sample
//   - Sun Drying:       all four checkpoints (Day 0, 2, 4, 6) for a batch
// Nothing here decides whether a student has "passed". The progress board
// only reports what was practised; whether the real practical was completed
// is something only a teacher can confirm (a separate record).
//
// Layout of this file:
//   1. Wording (no browser needed, unit-tested)
//   2. The progress summaries (pure, unit-tested)
// Everything is exposed as window.ResultsFormat.
// =====================================================

(function () {
    // ---------- 1. Wording ----------
    const LABELS = {
        'chromameter': 'Chromameter',
        'texture-analyzer': 'Texture Analyzer',
        'sausage-making': 'Sausage Making',
        'sun-drying': 'Sun Drying',
        'orientation': 'Orientation',
        'sausage-making-checklist': 'Sausage Making (checklist)'
    };

    function practicalLabel(key) {
        return LABELS[key] || key;
    }

    function fmt(n) {
        return typeof n === 'number' ? n.toFixed(1) : n;
    }

    // A short, human-readable summary, depending on which practical the
    // reading came from, since each stores different fields.
    function resultSummary(r) {
        const d = r.data || {};
        switch (r.practical) {
            case 'chromameter':
                return `L* ${fmt(d.L)}, a* ${fmt(d.a)}, b* ${fmt(d.b)}`
                    + (d.side ? ` \u00B7 Side ${d.side}` : '')
                    + (d.zone === 'fat' ? ' (on fat)' : d.zone === 'connective' ? ' (on connective tissue)' : '');
            case 'texture-analyzer':
                return `${fmt(d.peakForce)} N`;
            case 'sausage-making':
                return `${fmt(d.temp)}\u00B0C ${d.passed ? '(target reached)' : '(below target)'}`;
            case 'sun-drying':
                return `Day ${d.day}: ${fmt(d.moisture)}% moisture`;
            case 'orientation':
            case 'sausage-making-checklist':
                return `${d.confirmed} of ${d.total} confirmed`;
            default:
                return JSON.stringify(d);
        }
    }

    function formatWhen(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleString();
    }

    function formatDay(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleDateString();
    }

    // Escapes text for safe use inside HTML, including inside quoted
    // attribute values. (Anything a student types, such as a sample ID,
    // must never be able to become markup.)
    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function plural(n, one, many) {
        return n === 1 ? one : many;
    }

    // ---------- 2. The progress board ----------
    const SESSIONS = [
        { key: 'orientation',      label: 'Orientation',      page: 'orientation.html',      readingKeys: ['orientation'] },
        { key: 'chromameter',      label: 'Chromameter',      page: 'chromameter.html',      readingKeys: ['chromameter'] },
        { key: 'texture-analyzer', label: 'Texture Analyzer', page: 'texture-analyzer.html', readingKeys: ['texture-analyzer'] },
        { key: 'sausage-making',   label: 'Sausage Making',   page: 'sausage-making.html',   readingKeys: ['sausage-making', 'sausage-making-checklist'] },
        { key: 'sun-drying',       label: 'Sun Drying',       page: 'sun-drying.html',       readingKeys: ['sun-drying'] }
    ];

    const CHROMA_SIDES = ['A', 'B', 'C'];
    const CHROMA_PER_SIDE = 2;
    const TEXTURE_MIN_PER_SAMPLE = 3;
    const SUN_DAYS = [0, 2, 4, 6];

    const uniqueCount = (items, pick) => new Set(items.map(pick)).size;
    const newest = (items, field) => items.reduce((best, x) => (x[field] && (!best || x[field] > best) ? x[field] : best), null);

    // Newest first. Dates are ISO text, which sorts correctly as plain text.
    function sortNewestFirst(items, field) {
        return [...items].sort((a, b) => (b[field] || '').localeCompare(a[field] || ''));
    }

    // Chromameter: how many samples have the manual's coverage, counting only
    // readings taken on muscle. Readings saved before sides were tracked have no
    // side or zone, so they cannot be counted either way and are left out.
    function chromameterCoverage(readings) {
        const bySample = {};
        let offMuscle = 0;
        let withSideInfo = 0;
        for (const r of readings) {
            const d = r.data || {};
            if (!d.side || !d.zone) continue;
            withSideInfo++;
            if (d.zone !== 'muscle') { offMuscle++; continue; }
            const s = (bySample[r.sampleId] = bySample[r.sampleId] || {});
            s[d.side] = (s[d.side] || 0) + 1;
        }
        const samples = new Set(readings.filter((r) => r.data && r.data.side && r.data.zone).map((r) => r.sampleId));
        const covered = [...samples].filter((id) => CHROMA_SIDES.every((side) => ((bySample[id] || {})[side] || 0) >= CHROMA_PER_SIDE)).length;
        return { samples: samples.size, covered, offMuscle, withSideInfo };
    }

    // Summary lines for one practical, from this student's saved entries.
    function summariseSession(session, allReadings) {
        const mine = allReadings.filter((r) => session.readingKeys.includes(r.practical));
        const lines = [];

        if (session.key === 'orientation') {
            if (mine.length) {
                const best = mine.reduce((b, r) => ((r.data && r.data.confirmed) > ((b.data && b.data.confirmed) || -1) ? r : b), mine[0]);
                lines.push(`Most safety items confirmed: ${best.data.confirmed} of ${best.data.total}`);
            }
        } else if (session.key === 'chromameter') {
            if (mine.length) {
                const samples = uniqueCount(mine, (r) => r.sampleId);
                lines.push(`${mine.length} ${plural(mine.length, 'reading', 'readings')} on ${samples} ${plural(samples, 'sample', 'samples')}`);
                const c = chromameterCoverage(mine);
                if (c.samples > 0) {
                    lines.push(`Fully covered (${CHROMA_PER_SIDE} readings on muscle from each of ${CHROMA_SIDES.length} sides): ${c.covered} of ${c.samples} ${plural(c.samples, 'sample', 'samples')}`);
                }
                if (c.offMuscle > 0) {
                    lines.push(`${c.offMuscle} ${plural(c.offMuscle, 'reading', 'readings')} landed on fat or connective tissue, which the manual says to avoid`);
                }
            }
        } else if (session.key === 'texture-analyzer') {
            if (mine.length) {
                const per = {};
                mine.forEach((r) => { per[r.sampleId] = (per[r.sampleId] || 0) + 1; });
                const samples = Object.keys(per).length;
                const enough = Object.values(per).filter((n) => n >= TEXTURE_MIN_PER_SAMPLE).length;
                lines.push(`${mine.length} ${plural(mine.length, 'test', 'tests')} on ${samples} ${plural(samples, 'sample', 'samples')}`);
                lines.push(`Samples with at least ${TEXTURE_MIN_PER_SAMPLE} tests: ${enough} of ${samples}`);
            }
        } else if (session.key === 'sausage-making') {
            const checks = mine.filter((r) => r.practical === 'sausage-making');
            const lists = mine.filter((r) => r.practical === 'sausage-making-checklist');
            if (checks.length) {
                const reached = checks.filter((r) => r.data && r.data.passed).length;
                lines.push(`${checks.length} temperature ${plural(checks.length, 'check', 'checks')}: ${reached} reached the 68\u00B0C target`);
            }
            if (lists.length) {
                const best = lists.reduce((b, r) => ((r.data && r.data.confirmed) > ((b.data && b.data.confirmed) || -1) ? r : b), lists[0]);
                lines.push(`Most checklist steps confirmed: ${best.data.confirmed} of ${best.data.total}`);
            }
        } else if (session.key === 'sun-drying') {
            if (mine.length) {
                const days = {};
                mine.forEach((r) => { (days[r.sampleId] = days[r.sampleId] || new Set()).add(r.data && r.data.day); });
                const batches = Object.keys(days).length;
                const whole = Object.values(days).filter((set) => SUN_DAYS.every((d) => set.has(d))).length;
                lines.push(`${mine.length} ${plural(mine.length, 'checkpoint', 'checkpoints')} on ${batches} ${plural(batches, 'batch', 'batches')}`);
                lines.push(`Batches with all four days recorded (Day ${SUN_DAYS.join(', ')}): ${whole} of ${batches}`);
            }
        }

        return { count: mine.length, lastAt: newest(mine, 'createdAt'), lines };
    }

    // The whole board: one entry per practical, with the teacher's lab
    // confirmation (the most recent one) alongside the student's own practice.
    function summariseSessions(readings, completions) {
        return SESSIONS.map((session) => {
            const s = summariseSession(session, readings);
            const confirmations = sortNewestFirst(completions.filter((c) => c.practical === session.key), 'completedAt');
            return {
                key: session.key, label: session.label, page: session.page,
                count: s.count, lastAt: s.lastAt, lines: s.lines,
                started: s.count > 0,
                confirmed: confirmations[0] || null
            };
        });
    }

    // Entries for one practical (or all of them), newest first.
    function entriesFor(readings, sessionKey) {
        const session = SESSIONS.find((s) => s.key === sessionKey);
        const chosen = session ? readings.filter((r) => session.readingKeys.includes(r.practical)) : readings;
        return sortNewestFirst(chosen, 'createdAt');
    }

    window.ResultsFormat = {
        SESSIONS, CHROMA_SIDES, CHROMA_PER_SIDE, TEXTURE_MIN_PER_SAMPLE, SUN_DAYS,
        practicalLabel, resultSummary, formatWhen, formatDay, escapeHtml, plural,
        sortNewestFirst, chromameterCoverage, summariseSession, summariseSessions, entriesFor
    };
})();
