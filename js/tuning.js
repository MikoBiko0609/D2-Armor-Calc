import { STATS, TOTAL_CAP, clampAddSigned } from "./core.js";

export const countBalancedRows = (aug) =>
    aug.filter((r) => r.mode === "balanced").length;

export function augmentsToVector(aug) {
    const v = Object.fromEntries(STATS.map((k) => [k, 0]));
    for (const row of aug) {
        if (row.mode !== "general") continue;
        if (row.plus && row.plus !== "none") v[row.plus] += 5;
        if (row.minus && row.minus !== "none") v[row.minus] -= 5;
    }
    return v;
}

export function applyBalanced(totals, count) {
    if (!count) return totals;
    const out = { ...totals };
    for (let i = 0; i < count; i++) {
        const order = [...STATS].sort((a, b) => (out[a] || 0) - (out[b] || 0));
        for (let j = 0; j < 3 && j < order.length; j++) {
            const k = order[j];
            out[k] = Math.min(TOTAL_CAP, (out[k] || 0) + 1);
        }
    }
    return out;
}

export function applyBalancedWithTrace(totals, count) {
    const out = { ...totals },
        trace = [];
    for (let i = 0; i < count; i++) {
        const order = [...STATS].sort((a, b) => (out[a] || 0) - (out[b] || 0));
        const picked = [];
        for (let j = 0; j < 3 && j < order.length; j++) {
            const k = order[j];
            out[k] = Math.min(TOTAL_CAP, (out[k] || 0) + 1);
            picked.push(k);
        }
        trace.push(picked);
    }
    return { totals: out, trace };
}

export function tuningRowLabel(row) {
    if (!row) return "None";
    if (row.mode === "balanced") return "Balanced × 1";
    const p = [];
    if (row.plus && row.plus !== "none") p.push(`+5 ${row.plus}`);
    if (row.minus && row.minus !== "none") p.push(`−5 ${row.minus}`);
    return p.length ? p.join(" / ") : "None";
}

/**
 * greedy local-search: build up to `slots` general rows (+5/−5).
 * at each step, evaluate EVERY candidate (+stat, −stat) by simulating:
 * armor -> general rows (so far + candidate) -> fragments -> balanced -> mods
 * and choosing the candidate that minimizes final deficit.
 *
 * we stop early if no candidate improves the score, so rows are only added “as needed”.
 */
export function deriveAutoGeneralRows(
    startArmorTotals,
    targets,
    fragments,
    minorCap,
    majorCap,
    slots = 4,
    leastFav = "none",
) {
    const rows = [];

    // local helpers mirror solver logic (duplicated here to avoid circular imports)
    const deficitScore = (tot) => {
        let s = 0;
        for (const k of STATS) {
            const d = Math.max(0, (targets[k] || 0) - (tot[k] || 0));
            s += d * d;
        }
        return s;
    };

    const applyBalancedN = (tot, n) => {
        if (!n) return { ...tot };
        const out = { ...tot };
        for (let i = 0; i < n; i++) {
            const order = [...STATS].sort(
                (a, b) => (out[a] || 0) - (out[b] || 0),
            );
            for (let j = 0; j < 3 && j < order.length; j++) {
                const k = order[j];
                out[k] = Math.min(TOTAL_CAP, (out[k] || 0) + 1);
            }
        }
        return out;
    };

    const allocModsGreedy = (totalsIn, minors, majors) => {
        const totals = { ...totalsIn };
        const deficit = (k) =>
            Math.max(0, (targets[k] || 0) - (totals[k] || 0));

        const applyOne = (size) => {
            let pick = null,
                best = 0;
            for (const k of STATS) {
                const d = deficit(k);
                if (d > best) {
                    best = d;
                    pick = k;
                }
            }
            if (!pick) return false;
            const inc = Math.min(
                size,
                Math.max(0, TOTAL_CAP - (totals[pick] || 0)),
            );
            if (inc <= 0) return false;
            totals[pick] = (totals[pick] || 0) + inc;
            return true;
        };

        for (let i = 0; i < majors; i++) {
            if (!applyOne(10)) break;
        }
        for (let i = 0; i < minors; i++) {
            if (!applyOne(5)) break;
        }
        return totals;
    };

    // simulate pipeline for a given set of general rows
    const simulateRows = (rowsArr) => {
        const withGeneral = clampAddSigned(
            startArmorTotals,
            augmentsToVector(rowsArr),
            -TOTAL_CAP,
            TOTAL_CAP,
        );
        const withFrags = clampAddSigned(
            withGeneral,
            fragments,
            -TOTAL_CAP,
            TOTAL_CAP,
        );
        const balCount = countBalancedRows(rowsArr);
        const withBalanced = applyBalancedN(withFrags, balCount);
        return allocModsGreedy(withBalanced, minorCap, majorCap);
    };

    // current baseline score with 0 rows
    let bestSoFarTotals = simulateRows(rows);
    let bestSoFarScore = deficitScore(bestSoFarTotals);

    for (let i = 0; i < slots; i++) {
        let bestCandidate = null;
        let bestScore = bestSoFarScore;
        let bestTieSurplus = -1; // tie-breaker 1: larger surplus
        const prevMinus = rows.length ? rows[rows.length - 1].minus : null; // tie-breaker 2: sticky

        // recompute from totals after rows so far
        const currentTotals = bestSoFarTotals;

        // never +5 the least-fav; always -5 the least-fav when provided
        const basePlus = STATS.filter(
            (k) => (targets[k] || 0) > (currentTotals[k] || 0),
        );
        const plusCandidates =
            leastFav && leastFav !== "none"
                ? basePlus.filter((k) => k !== leastFav)
                : basePlus;

        if (!plusCandidates.length) break;

        for (const plus of plusCandidates) {
            // donor set: lock to leastFav if provided, else consider all others
            const restAll = STATS.filter((k) => k !== plus);
            const donorOrder =
                leastFav && leastFav !== "none" ? [leastFav] : restAll;

            for (const minus of donorOrder) {
                const candidateRows = [
                    ...rows,
                    { mode: "general", plus, minus },
                ];
                const totalsAfter = simulateRows(candidateRows);
                const score = deficitScore(totalsAfter);

                // compute surplus of donor (based on currentTotals, not totalsAfter)
                const surplusMinus = Math.max(
                    0,
                    (currentTotals[minus] || 0) - (targets[minus] || 0),
                );
                const stickyBonus = minus === prevMinus ? 1 : 0; // tiny nudge if still tied

                if (
                    score < bestScore ||
                    (score === bestScore && surplusMinus > bestTieSurplus) ||
                    (score === bestScore &&
                        surplusMinus === bestTieSurplus &&
                        stickyBonus === 1)
                ) {
                    bestScore = score;
                    bestTieSurplus = surplusMinus;
                    bestCandidate = { plus, minus };
                }
            }
        }

        if (!bestCandidate) break;

        rows.push({
            mode: "general",
            plus: bestCandidate.plus,
            minus: bestCandidate.minus,
        });
        bestSoFarTotals = simulateRows(rows);
        bestSoFarScore = bestScore;
    }

    while (rows.length < slots)
        rows.push({ mode: "general", plus: "none", minus: "none" });
    return rows;
}

/**
 * produce the augments the solver should use.
 * when Auto is OFF: pass through the user's rows.
 * when Auto is ON: compute rows using full-pipeline scoring so we can
 * swap donors reactively (fragments + mod caps are respected).
 */
/**
 * memoized wrapper. We cache by a compact key derived from inputs that
 * actually affect the result (rounded to 1s to avoid tiny slider jitters).
 */
export function effectiveAugments(
    userAugments,
    autoEnabled,
    startArmorTotals,
    targets,
    leastFav = "none",
    fragments = Object.fromEntries(STATS.map((k) => [k, 0])),
    minorCap = 0,
    majorCap = 0,
) {
    if (!autoEnabled) return userAugments;

    // build a stable cache key
    const round = (n) => Math.round(Number(n) || 0);
    const key = JSON.stringify({
        a: Object.fromEntries(
            STATS.map((k) => [k, round(startArmorTotals[k] || 0)]),
        ),
        t: Object.fromEntries(STATS.map((k) => [k, round(targets[k] || 0)])),
        f: Object.fromEntries(STATS.map((k) => [k, round(fragments[k] || 0)])),
        mi: minorCap,
        ma: majorCap,
        lf: leastFav || "none",
    });

    // simple static cache (1 entry is enough in practice between quick updates)
    effectiveAugments._lastKey ??= "";
    effectiveAugments._lastVal ??= userAugments;

    if (effectiveAugments._lastKey === key) {
        return effectiveAugments._lastVal;
    }

    const rows = deriveAutoGeneralRows(
        startArmorTotals,
        targets,
        fragments,
        minorCap,
        majorCap,
        4,
        leastFav || "none",
    );

    effectiveAugments._lastKey = key;
    effectiveAugments._lastVal = rows;
    return rows;
}
