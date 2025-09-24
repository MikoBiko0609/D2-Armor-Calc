/* Runs the beam search + auto-tuning off the UI thread.
   Expects messages: { jobId, payload: { targets, augments, fragments, minorModsCap, custom } }
   Responds with:    { jobId, ok:true, result:{ chosen, totals, feasible, augUsedForUI } }
*/

import { recommendPieces, sumArmorFromPieces } from "../solver.js";
import { effectiveAugments } from "../tuning.js";

self.onmessage = async (e) => {
    const { jobId, payload } = e.data || {};
    try {
        if (!payload) {
            self.postMessage({ jobId, ok: false, error: "No payload" });
            return;
        }

        const { targets, augments, fragments, minorModsCap, custom } = payload;

        // call the existing solver exactly as before
        const res = recommendPieces(
            targets,
            augments, // augments array with marker props (_autoEnabled, _leastFav)
            fragments,
            minorModsCap,
            custom, // {enabled:boolean, vector?:{…}}
        );

        // compute the *same* effective rows the solver used, but for UI display
        let augUsedForUI = [];
        if (res?.chosen?.length) {
            const startTotals = sumArmorFromPieces(res.chosen); // armor only
            const autoEnabled = !!(augments && augments._autoEnabled);
            const leastFav = (augments && augments._leastFav) || "none";
            augUsedForUI = effectiveAugments(
                Array.isArray(augments) ? augments : [],
                autoEnabled,
                startTotals,
                targets,
                leastFav,
                fragments,
                minorModsCap,
                5 - Math.max(0, Math.min(5, Number(minorModsCap) || 0)), // majorCap
            );
        }

        self.postMessage({
            jobId,
            ok: true,
            result: {
                chosen: res?.chosen || [],
                totals: res?.totals || {},
                totalsRaw: res?.totalsRaw || {},
                feasible: !!res?.feasible,
                augUsedForUI,
            },
        });
    } catch (err) {
        self.postMessage({
            jobId,
            ok: false,
            error: String((err && err.message) || err),
        });
    }
};
