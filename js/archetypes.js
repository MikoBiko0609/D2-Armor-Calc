import { STATS } from "./core.js";

export const CORE_SETS = [
    { name: "Bulwark", primary: "health", secondary: "class" },
    { name: "Brawler", primary: "melee", secondary: "health" },
    { name: "Grenadier", primary: "grenade", secondary: "super" },
    { name: "Paragon", primary: "super", secondary: "melee" },
    { name: "Specialist", primary: "class", secondary: "weapons" },
    { name: "Gunner", primary: "weapons", secondary: "grenade" },
];

export const NEW_SETS = [
    { name: "Siegebreaker", primary: "health", secondary: "grenade" },
    { name: "Skirmisher", primary: "melee", secondary: "weapons" },
    { name: "Demolitionist", primary: "grenade", secondary: "class" },
    { name: "Colossus", primary: "super", secondary: "health" },
    { name: "Reaver", primary: "class", secondary: "melee" },
    { name: "Powerhouse	", primary: "weapons", secondary: "super" },
];

export const PTS_LEG = { primary: 30, secondary: 25, tertiary: 20, other: 5 };
export const PTS_EXO = { primary: 30, secondary: 25, tertiary: 20, other: 5 };

function statVector(pts, primary, secondary, tertiary) {
    const v = Object.fromEntries(STATS.map((k) => [k, pts.other]));
    v[primary] = pts.primary;
    v[secondary] = pts.secondary;
    v[tertiary] = pts.tertiary;
    return v;
}

export function buildArchetypes(enableNewArchetypes = true) {
    const sets = enableNewArchetypes
        ? [...CORE_SETS, ...NEW_SETS]
        : CORE_SETS;

    const leg = [];
    const exo = [];

    for (const s of sets) {
        const blocked = new Set([s.primary, s.secondary]);
        const tertOptions = STATS.filter((x) => !blocked.has(x));

        for (const t of tertOptions) {
            leg.push({
                type: "Legendary",
                setName: s.name.trim(),
                tertiary: t,
                vector: statVector(PTS_LEG, s.primary, s.secondary, t),
            });

            exo.push({
                type: "Exotic",
                setName: s.name.trim(),
                tertiary: t,
                vector: statVector(PTS_EXO, s.primary, s.secondary, t),
            });
        }
    }

    return { leg, exo };
}

export const ARCH = buildArchetypes(true);