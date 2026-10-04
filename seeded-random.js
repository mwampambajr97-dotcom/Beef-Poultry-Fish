// =====================================================
// Shared seeded random utilities
// Used by every simulated practical so that the same
// Sample/Batch/Steak ID always produces the same
// underlying "true" value — individual readings then
// scatter narrowly around it, the way a real instrument
// would on a real, consistent physical sample.
//
// Originally written for Sun Drying's multi-day curve;
// pulled out here so Chromameter, Texture Analyzer, and
// Sausage Making can use the same approach.
// =====================================================

// Turns any string (a Sample ID) into a plain number.
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0; // keep it a 32-bit integer
    }
    return hash;
}

// A small, standard seeded generator (mulberry32). Given the
// same seed, calling the returned function repeatedly always
// produces the same sequence of numbers between 0 and 1.
function seededRandom(seed) {
    let t = seed;
    return function () {
        t |= 0;
        t = (t + 0x6D2B79F5) | 0;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

function rangeFromSeed(randomValue, min, max) {
    return min + randomValue * (max - min);
}
