// constants
export const STATS = [
    "health",
    "melee",
    "grenade",
    "super",
    "class",
    "weapons",
];

export const SLIDER_MAX_UI = 200;
export const ARMOR_CAP = 150;
export const TOTAL_CAP = 200;
export const NUM_PIECES = 5;
export const FRAG_RANGE = 30;
export const FRAG_STEP = 10;
export const PER_PIECE_MAX = 45;

// tiny helpers 
export const zeroVec = () => Object.fromEntries(STATS.map((k) => [k, 0]));

export function clampAdd(a, b, cap) {
    const out = {};
    for (const k of STATS) {
        out[k] = Math.min(cap, (a[k] || 0) + (b[k] || 0));
    }
    return out;
}

export function clampAddSigned(a, b, floor, cap) {
    const out = {};
    for (const k of STATS) {
        const v = (a[k] || 0) + (b[k] || 0);
        out[k] = Math.max(floor, Math.min(cap, v));
    }
    return out;
}

export function addToVec(vec, key, amt) {
    vec[key] = (vec[key] || 0) + amt;
}

export function deficitScore(vec, tgt) {
    let s = 0;
    for (const k of STATS) {
        const d = Math.max(0, (tgt[k] || 0) - (vec[k] || 0));
        s += d * d;
    }
    return s;
}

export const capitalize = (s) => s[0].toUpperCase() + s.slice(1);
export const roundToStep = (n, step) => Math.round(n / step) * step;
