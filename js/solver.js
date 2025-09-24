import {STATS, ARMOR_CAP, TOTAL_CAP, NUM_PIECES, zeroVec, clampAdd, clampAddSigned, deficitScore, capitalize,} from "./core.js";
import { ARCH } from "./archetypes.js";
import {augmentsToVector, applyBalanced, countBalancedRows,} from "./tuning.js";
import { effectiveAugments } from "./tuning.js";

export const BEAM_WIDTHS = [800, 2000, 4000];

// optimistic +5 rows without locking donors (AUTO, no leastFav),
// but compute deficits *after* tentatively adding fragments.
function optimisticPlusOnlyRows(
    optimisticArmor,
    targets,
    slots = 4,
    fragments = zeroVec(),
) {
    const tmpAfterFrags = clampAddSigned(
        optimisticArmor,
        fragments,
        -TOTAL_CAP,
        TOTAL_CAP,
    );

    const deficits = STATS.map((k) => ({
        k,
        d: Math.max(0, (targets[k] || 0) - (tmpAfterFrags[k] || 0)),
    }))
        .sort((a, b) => b.d - a.d)
        .slice(0, slots)
        .map((x) => x.k);

    const rows = [];
    for (let i = 0; i < Math.min(slots, deficits.length); i++) {
        rows.push({ mode: "general", plus: deficits[i], minus: "none" }); // donor not locked
    }
    while (rows.length < slots)
        rows.push({ mode: "general", plus: "none", minus: "none" });
    return rows;
}

export function recommendPieces(
    targets,
    augments,
    fragments,
    minorModsCap,
    customOpt,
) {
    const majorModsCap =
        NUM_PIECES - Math.max(0, Math.min(NUM_PIECES, minorModsCap));
    const custom = customOpt?.enabled
        ? {
              enabled: true,
              vector: { ...customOpt.vector },
              setName: "Custom Exotic",
              tertiary: "custom",
          }
        : { enabled: false };

    for (const BW of BEAM_WIDTHS) {
        const res = runBeam(
            targets,
            augments,
            fragments,
            minorModsCap,
            majorModsCap,
            BW,
            custom,
        );
        if (res.feasible || BW === BEAM_WIDTHS.at(-1)) return res;
    }
}

export function runBeam(
    targets,
    augments,
    fragments,
    minorModsCap,
    majorModsCap,
    BEAM_WIDTH,
    custom,
) {
    let beam = [
        { armor: zeroVec(), pieces: [], exoticsUsed: 0, step: 0, score: 0 },
    ];
    // initial optimistic using AUTO where applicable (startTotals==current armor here: zero)
    beam[0].score = optimisticResidual(
        beam[0].armor,
        targets,
        augments,
        fragments,
        minorModsCap,
        majorModsCap,
        NUM_PIECES,
    );

    for (let step = 0; step < NUM_PIECES; step++) {
        const next = [];
        for (const node of beam) {
            const slotsLeft = NUM_PIECES - node.step - 1;
            const mustExo = node.exoticsUsed === 0 && slotsLeft === 0;

            if (!mustExo) {
                for (const arch of ARCH.leg) {
                    const armorAfter = clampAdd(
                        node.armor,
                        arch.vector,
                        ARMOR_CAP,
                    );
                    const child = {
                        armor: armorAfter,
                        pieces: [...node.pieces, { ...arch }],
                        exoticsUsed: node.exoticsUsed,
                        step: node.step + 1,
                    };
                    const rem = NUM_PIECES - child.step;
                    child.score = optimisticResidual(
                        child.armor,
                        targets,
                        augments,
                        fragments,
                        minorModsCap,
                        majorModsCap,
                        rem,
                    );
                    next.push(child);
                }
            }

            if (node.exoticsUsed === 0) {
                if (custom?.enabled) {
                    const armorAfter = clampAdd(
                        node.armor,
                        custom.vector,
                        ARMOR_CAP,
                    );
                    const child = {
                        armor: armorAfter,
                        pieces: [
                            ...node.pieces,
                            {
                                type: "Exotic",
                                setName: custom.setName,
                                tertiary: custom.tertiary,
                                vector: custom.vector,
                            },
                        ],
                        exoticsUsed: 1,
                        step: node.step + 1,
                    };
                    const rem = NUM_PIECES - child.step;
                    child.score = optimisticResidual(
                        child.armor,
                        targets,
                        augments,
                        fragments,
                        minorModsCap,
                        majorModsCap,
                        rem,
                    );
                    next.push(child);
                } else {
                    for (const arch of ARCH.exo) {
                        const armorAfter = clampAdd(
                            node.armor,
                            arch.vector,
                            ARMOR_CAP,
                        );
                        const child = {
                            armor: armorAfter,
                            pieces: [...node.pieces, { ...arch }],
                            exoticsUsed: 1,
                            step: node.step + 1,
                        };
                        const rem = NUM_PIECES - child.step;
                        child.score = optimisticResidual(
                            child.armor,
                            targets,
                            augments,
                            fragments,
                            minorModsCap,
                            majorModsCap,
                            rem,
                        );
                        next.push(child);
                    }
                }
            }
        }
        next.sort((a, b) => a.score - b.score);
        beam = next.slice(0, BEAM_WIDTH);
        if (!beam.length) break;
    }

    let best = null,
        bestScore = Infinity;
    for (const node of beam) {
        if (node.step !== NUM_PIECES || node.exoticsUsed !== 1) continue;

        // compute effective augments based on THIS node's armor totals
        // simulate the same sequence solver uses: armor -> (general ±5) -> fragments -> balanced -> mods
        // for "startTotals" we want armor ONLY (no general rows yet)
        const effAug = effectiveAugments(
            node._userAugments || augments,
            (augments && augments._autoEnabled) || false,
            node.armor,
            targets,
            (augments && augments._leastFav) || "none",
            fragments,
            minorModsCap,
            majorModsCap,
        );

        const plan = allocateModsWithAugFrags(
            node.armor,
            targets,
            effAug,
            fragments,
            minorModsCap,
            NUM_PIECES - minorModsCap,
        );
        const score = deficitScore(plan.totals, targets);
        if (score < bestScore) {
            best = {
                pieces: distributeModsToPieces(node.pieces, plan.mods),
                totals: plan.totals,
                totalsRaw: plan.totalsRaw,
            };
            bestScore = score;
        }
    }
    if (!best)
        return {
            chosen: [],
            totals: zeroVec(),
            totalsRaw: zeroVec(),
            feasible: false,
        };
    const feasible = STATS.every((k) => best.totals[k] >= targets[k]);
    return {
        chosen: best.pieces,
        totals: best.totals,
        totalsRaw: best.totalsRaw,
        feasible,
    };
}

export function optimisticResidual(
    currentArmor,
    targets,
    augments,
    fragments,
    minorCap,
    majorCap,
    piecesLeft,
) {
    // start from armor + best-case per remaining piece (30 each), before general rows
    const optimisticArmor = { ...currentArmor };
    const added = Math.max(0, piecesLeft) * 30;
    for (const k of STATS) {
        optimisticArmor[k] = Math.min(
            ARMOR_CAP,
            (optimisticArmor[k] || 0) + added,
        );
    }

    const autoEnabled = !!(augments && augments._autoEnabled);
    const leastFav = (augments && augments._leastFav) || "none";

    // choose optimistic rows: donor-agnostic +5s when AUTO & no least-fav, else exact
    const effAugRows =
        autoEnabled && (leastFav === "none" || leastFav == null)
            ? optimisticPlusOnlyRows(optimisticArmor, targets, 4, fragments)
            : effectiveAugments(
                  augments,
                  autoEnabled,
                  optimisticArmor,
                  targets,
                  leastFav,
                  fragments,
                  minorCap,
                  majorCap,
              );

    // pipeline: general -> fragments -> balanced -> greedy mods
    const withGeneral = clampAddSigned(
        optimisticArmor,
        augmentsToVector(effAugRows),
        -TOTAL_CAP,
        TOTAL_CAP,
    );
    const withFrags = clampAddSigned(
        withGeneral,
        fragments,
        -TOTAL_CAP,
        TOTAL_CAP,
    );
    const withBalanced = applyBalanced(
        withFrags,
        countBalancedRows(effAugRows),
    );
    const { totals } = allocateModsCore(
        withBalanced,
        targets,
        minorCap,
        majorCap,
    );

    // sum of remaining shortfalls is a monotone (admissible-ish) lower bound
    let missing = 0;
    for (const k of STATS) {
        missing += Math.max(0, (targets[k] || 0) - (totals[k] || 0));
    }

    // keep your tiny tie-break to stabilize sorting
    let raw = 0;
    for (const k of STATS) {
        raw += Math.max(0, (targets[k] || 0) - (currentArmor[k] || 0)) ** 2;
    }

    // smaller is better; 0 means “looks achievable”
    return missing + raw * 1e-6;
}

export function allocateModsWithAugFrags(
    armorTotals,
    targets,
    augmentsEffective,
    fragments,
    minorCap,
    majorCap,
) {
    // apply general ±5 first (only from eff augments), then fragments, then balanced, then mods
    const withGeneral = clampAddSigned(
        armorTotals,
        augmentsToVector(augmentsEffective),
        -TOTAL_CAP,
        TOTAL_CAP,
    );
    const withFrags = clampAddSigned(
        withGeneral,
        fragments,
        -TOTAL_CAP,
        TOTAL_CAP,
    );
    const withBalanced = applyBalanced(
        withFrags,
        countBalancedRows(augmentsEffective),
    );
    return allocateModsCore(withBalanced, targets, minorCap, majorCap);
}

export function allocateModsCore(
    startTotals,
    targets,
    minorCap,
    majorCap,
    modSlots = NUM_PIECES,
) {
    const totals = { ...startTotals };
    const mods = [];

    // treat negatives as 0 for PURPOSES OF DEFICIT / TARGETING
    // (In-game, stats floor to 0 at the end, so we never need to "spend"
    // mods just to bring −X up to 0.)
    const deficit = (k) => {
        const eff = Math.max(0, totals[k] || 0); // 0-floored view
        return Math.max(0, (targets[k] || 0) - eff);
    };

    const applyOne = (size) => {
        if (mods.length >= modSlots) return false;

        // pick stat with largest remaining deficit
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

        // apply increment; totals may be negative, that’s fine
        const inc = Math.min(size, TOTAL_CAP - (totals[pick] || 0));
        if (inc <= 0) return false;

        totals[pick] = (totals[pick] || 0) + inc;
        mods.push({
            stat: pick,
            size,
            amount: inc,
            label: size === 10 ? capitalize(pick) : `Minor ${capitalize(pick)}`,
        });
        return true;
    };

    for (let i = 0; i < majorCap; i++) {
        if (!applyOne(10)) break;
    }
    for (let i = 0; i < minorCap; i++) {
        if (!applyOne(5)) break;
    }

    // floor to 0 after everything.
    const totalsRaw = { ...totals }; 
    const totalsFinal = {};
    for (const k of STATS) totalsFinal[k] = Math.max(0, totals[k] || 0);

    return { totals: totalsFinal, totalsRaw, mods };
}

export function distributeModsToPieces(pieces, mods) {
    const out = pieces.map((p) => ({ ...p }));
    let i = 0;
    for (const m of mods) {
        if (i >= out.length) break;
        out[i] = { ...out[i], mod: m };
        i++;
    }
    return out;
}

export function sumArmorFromPieces(pieces) {
    let acc = zeroVec();
    for (const p of pieces) {
        acc = clampAdd(acc, p.vector || zeroVec(), ARMOR_CAP);
    }
    return acc;
}
