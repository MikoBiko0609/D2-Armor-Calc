import { STATS } from "./core.js";

export const SETS = [
    { name: "Bulwark", primary: "health", secondary: "class" },
    { name: "Brawler", primary: "melee", secondary: "health" },
    { name: "Grenadier", primary: "grenade", secondary: "super" },
    { name: "Paragon", primary: "super", secondary: "melee" },
    { name: "Specialist", primary: "class", secondary: "weapons" },
    { name: "Gunner", primary: "weapons", secondary: "grenade" },
];

export const PTS_LEG = { primary: 30, secondary: 25, tertiary: 20, other: 5 };
export const PTS_EXO = { primary: 30, secondary: 20, tertiary: 12, other: 5 };

function statVector(pts, primary, secondary, tertiary) {
    const v = Object.fromEntries(STATS.map((k) => [k, pts.other]));
    v[primary] = pts.primary;
    v[secondary] = pts.secondary;
    v[tertiary] = pts.tertiary;
    return v;
}

export function buildArchetypes() {
    const leg = [],
        exo = [];
    for (const s of SETS) {
        const blocked = new Set([s.primary, s.secondary]);
        const tertOptions = STATS.filter((x) => !blocked.has(x));
        for (const t of tertOptions) {
            leg.push({
                type: "Legendary",
                setName: s.name,
                tertiary: t,
                vector: statVector(PTS_LEG, s.primary, s.secondary, t),
            });
            exo.push({
                type: "Exotic",
                setName: s.name,
                tertiary: t,
                vector: statVector(PTS_EXO, s.primary, s.secondary, t),
            });
        }
    }
    return { leg, exo };
}

export const ARCH = buildArchetypes();
