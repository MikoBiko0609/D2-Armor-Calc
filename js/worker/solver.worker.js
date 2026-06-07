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

        const {
            targets,
            augments,
            fragments,
            minorModsCap,
            custom,
            enableNewArchetypes,
        } = payload;

        const tuningSlots = custom?.enabled
            ? custom.hasTuning
                ? 5
                : 4
            : 5;

        const augForSolver = Object.assign(
            Array.isArray(augments) ? augments.slice() : [],
            augments || {},
            {
                _tuningSlots: tuningSlots,
            },
        );

        const res = recommendPieces(
            targets,
            augForSolver,
            fragments,
            minorModsCap,
            custom,
            enableNewArchetypes !== false,
        );

        let augUsedForUI = [];

        if (res?.chosen?.length) {
            const startTotals = sumArmorFromPieces(res.chosen);
            const autoEnabled = !!(augForSolver && augForSolver._autoEnabled);
            const leastFav = (augForSolver && augForSolver._leastFav) || "none";

            augUsedForUI = effectiveAugments(
                Array.isArray(augForSolver) ? augForSolver : [],
                autoEnabled,
                startTotals,
                targets,
                leastFav,
                fragments,
                minorModsCap,
                5 - Math.max(0, Math.min(5, Number(minorModsCap) || 0)),
                tuningSlots,
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