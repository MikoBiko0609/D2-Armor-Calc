import { STATS } from "./core.js";

export const state = {
    targets: Object.fromEntries(STATS.map((k) => [k, 0])),
    minorModsCap: 0,
    fragments: Object.fromEntries(STATS.map((k) => [k, 0])),
    augments: [
        { mode: "general", plus: "none", minus: "none" },
        { mode: "general", plus: "none", minus: "none" },
        { mode: "general", plus: "none", minus: "none" },
        { mode: "general", plus: "none", minus: "none" },
    ],
    customExoticEnabled: false,
    customExotic: Object.fromEntries(STATS.map((k) => [k, 0])),
    autoAssumeMods: true,
    leastFavStat: "none",
};

export const setMinorModsCap = (n) =>
    (state.minorModsCap = Math.max(0, Math.min(5, Number(n) || 0)));
