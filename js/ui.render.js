import {STATS, TOTAL_CAP, capitalize, addToVec, PER_PIECE_MAX, clampAddSigned, zeroVec,} from "./core.js";
import { state } from "./state.js";
import { recommendPieces, sumArmorFromPieces } from "./solver.js";
import {augmentsToVector, countBalancedRows, applyBalancedWithTrace, effectiveAugments,} from "./tuning.js";
import {feasBox, summaryRoot, piecesRoot, totalsRoot, modsCtrlBox, makeBarsWithAdjustments, checkInputs,} from "./ui.parts.js";

// cache the worker entrypoint so we don't re-import on every render.
let _solveAsync;
async function getSolveAsync() {
    if (!_solveAsync) {
        const mod = await import("./solver.client.js");
        _solveAsync = mod.solveAsync;
    }
    return _solveAsync;
}

function showSolveLoaderAfter(anchorEl) {
    hideSolveLoader();
    if (!anchorEl || !anchorEl.parentElement) return;

    const wrap = document.createElement("div");
    wrap.id = "globalSolveLoader";
    wrap.style.display = "flex";
    wrap.style.justifyContent = "center";
    wrap.style.alignItems = "center";
    wrap.style.padding = "20px 0 8px";

    const img = document.createElement("img");
    img.src = "./assets/loading.gif"; 
    img.alt = "Loading…";
    img.style.width = "120px";
    img.style.height = "auto";

    wrap.appendChild(img);
    anchorEl.parentElement.insertBefore(wrap, anchorEl.nextSibling);
}

function hideSolveLoader() {
    document.getElementById("globalSolveLoader")?.remove();
}

function ensureSlot(panel, beforeEl, id, title) {
    // create or clear an existing slot; keep only the <h3>
    let slot = document.getElementById(id);
    if (!slot) {
        slot = document.createElement("div");
        slot.className = "slot";
        slot.id = id;
        const h = document.createElement("h3");
        h.textContent = title;
        slot.appendChild(h);
        panel.insertBefore(slot, beforeEl); // keep consistent order
    } else {
        while (slot.childNodes.length > 1) slot.removeChild(slot.lastChild);
    }
    return slot;
}

// ---------- “Mods Applied” two-column card ----------
function buildModsSummaryCard(chosenPieces, effectiveAugRows) {
    const card = document.createElement("div");
    card.className = "card";

    // RIGHT side trace for Balanced rows (if any) uses *effective* rows
    const armorTotals = chosenPieces.reduce(
        (acc, p) => {
            const v = p.vector || {};
            STATS.forEach(
                (k) =>
                    (acc[k] = Math.min(TOTAL_CAP, (acc[k] || 0) + (v[k] || 0))),
            );
            return acc;
        },
        Object.fromEntries(STATS.map((k) => [k, 0])),
    );

    const generalVec = augmentsToVector(effectiveAugRows); // ±5 only
    const withAug = clampAddSigned(
        armorTotals,
        generalVec,
        -TOTAL_CAP,
        TOTAL_CAP,
    );
    const withFrags = clampAddSigned(
        withAug,
        state.fragments,
        -TOTAL_CAP,
        TOTAL_CAP,
    );

    const balancedCnt = countBalancedRows(effectiveAugRows);
    const balSim = applyBalancedWithTrace(withFrags, balancedCnt);

    // collect armor mods per piece (LEFT)
    const perPieceMods = [];
    for (const p of chosenPieces) {
        if (p.mod && p.mod.label) {
            perPieceMods.push({
                label: p.mod.label,
                stat: p.mod.stat,
                amount: p.mod.amount || 0,
            });
        } else {
            perPieceMods.push(null);
        }
    }

    // layout 40/60 with centered columns
    const cols = document.createElement("div");
    cols.style.display = "grid";
    cols.style.gridTemplateColumns = "2fr 3fr";
    cols.style.gap = "12px";
    card.appendChild(cols);

    const headerRow = document.createElement("div");
    headerRow.style.gridColumn = "1 / span 2";
    headerRow.style.display = "grid";
    headerRow.style.gridTemplateColumns = "2fr 3fr";
    headerRow.style.marginBottom = "6px";

    const leftHdr = document.createElement("div");
    leftHdr.className = "subtle";
    leftHdr.style.textAlign = "center";
    leftHdr.textContent = "Stat Mods";

    const rightHdr = document.createElement("div");
    rightHdr.className = "subtle";
    rightHdr.style.textAlign = "center";
    rightHdr.textContent = "Tuning Mods";

    headerRow.appendChild(leftHdr);
    headerRow.appendChild(rightHdr);
    cols.appendChild(headerRow);

    // LEFT column: Stat Mods (4 slots)
    // LEFT column: Stat Mods (5 slots)
    const left = document.createElement("div");
    const leftInner = document.createElement("div");
    leftInner.style.display = "flex";
    leftInner.style.flexDirection = "column";
    leftInner.style.gap = "8px";
    leftInner.style.width = "fit-content";
    leftInner.style.margin = "0 auto";

    // change 4 → 5 so we always show a fifth slot if a fifth mod exists
    for (let i = 0; i < 5; i++) {
        const line = document.createElement("div");
        line.className = "modsLine";
        line.style.justifyContent = "center";

        const label = document.createElement("span");
        label.className = "label-chip";
        label.textContent = `Slot ${i + 1}:`;
        line.appendChild(label);

        const m = perPieceMods[i]; // will be undefined/null if no 5th mod
        const pill = document.createElement("span");
        pill.className = "statpill";
        pill.textContent = m ? m.label : "—";
        line.appendChild(pill);

        leftInner.appendChild(line);
    }
    left.appendChild(leftInner);

    // RIGHT column: Tuning Mods (effective rows, 4)
    const right = document.createElement("div");
    const rightInner = document.createElement("div");
    rightInner.style.display = "flex";
    rightInner.style.flexDirection = "column";
    rightInner.style.gap = "8px";
    rightInner.style.width = "fit-content";
    rightInner.style.margin = "0 auto";

    let balIdx = 0;
    for (let i = 0; i < 4; i++) {
        const row = effectiveAugRows[i] || {
            mode: "general",
            plus: "none",
            minus: "none",
        };
        const line = document.createElement("div");
        line.className = "modsLine";
        line.style.justifyContent = "center";

        const label = document.createElement("span");
        label.className = "label-chip";
        label.textContent = `Slot ${i + 1}:`;
        line.appendChild(label);

        if (row.mode === "balanced") {
            const picked = balSim.trace[balIdx] || [];
            balIdx++;
            const chip = document.createElement("span");
            chip.className = "statpill";
            chip.textContent = picked.length
                ? `Balanced → ` +
                  picked.map((s) => `+1 ${capitalize(s)}`).join(", ")
                : "Balanced (no eligible stats?)";
            line.appendChild(chip);
        } else {
            const plus = document.createElement("span");
            plus.className = "statpill";
            plus.textContent =
                row.plus !== "none" ? `+5 ${capitalize(row.plus)}` : "—";
            const minus = document.createElement("span");
            minus.className = "statpill";
            minus.textContent =
                row.minus !== "none" ? `−5 ${capitalize(row.minus)}` : "—";
            line.appendChild(plus);
            line.appendChild(minus);
        }

        rightInner.appendChild(line);
    }
    right.appendChild(rightInner);

    cols.appendChild(left);
    cols.appendChild(right);
    return card;
}

// ---------- render ----------
export async function render() {
    // keep the custom exotic panel in sync (lazy import to avoid cycles)
    import("./ui.parts.js").then(({ updateCustomExoticUI }) => {
        if (typeof updateCustomExoticUI === "function") updateCustomExoticUI();
    });

    // clear sections every render
    summaryRoot.innerHTML = "";
    piecesRoot.innerHTML = "";
    totalsRoot?.closest(".slot")?.remove();
    // also remove top result panes if they exist
    document.getElementById("tuningSlotTop")?.remove();
    document.getElementById("totalsSlotTop")?.remove();

    // right column height lock so it doesn't jump
    const perPieceSlotForPanel = piecesRoot.parentElement; // "Per-Piece Details" slot
    const recPanel = perPieceSlotForPanel?.parentElement || null; // the whole right column panel
    if (recPanel) {
        if (!recPanel.dataset.minH) {
            const launchH = Math.ceil(recPanel.getBoundingClientRect().height);
            recPanel.dataset.minH = String(launchH);
        }
        recPanel.style.minHeight = `${recPanel.dataset.minH}px`;
    }

    // show ONE loader under "Per-Piece Details" while we solve
    if (perPieceSlotForPanel) showSolveLoaderAfter(perPieceSlotForPanel);

    // input sanity
    const feasInputs = checkInputs(state.targets);
    feasBox.textContent = feasInputs.msg;
    feasBox.classList.toggle("bad", !feasInputs.ok);
    if (!feasInputs.ok) {
        hideSolveLoader(); // don’t leave loader hanging on invalid inputs
        return;
    }

    // custom exotic passthrough (just structure for worker / fallback)
    const custom = state.customExoticEnabled
        ? { enabled: true, vector: { ...state.customExotic } }
        : { enabled: false };

    // snapshot for worker (do NOT mutate)
    const snapshot = {
        targets: { ...state.targets },
        augments: state.augments?.slice?.() ?? [],
        fragments: { ...state.fragments },
        minorModsCap: state.minorModsCap,
        custom,
        autoAssumeMods: !!state.autoAssumeMods,
        leastFavStat: state.leastFavStat || "none",
    };

    // ---------- try worker fast path ----------
    let chosen,
        totals,
        totalsRaw,
        augUsedForUI,
        feasible = false,
        ok = false;

    try {
        const solveAsync = await getSolveAsync();
        const res = await solveAsync(snapshot);
        if (res && res.ok) {
            ({ chosen, totals, totalsRaw, augUsedForUI, feasible, ok } = res);
        }
    } catch (err) {
        console.warn("[ui.render] Worker path failed, using fallback:", err);
    }

    // ---------- fallback to local solver if worker unavailable or not ok ----------
    if (!ok) {
        const augForSolver = Object.assign(snapshot.augments.slice(), {
            _autoEnabled: snapshot.autoAssumeMods,
            _leastFav: snapshot.leastFavStat,
        });

        const resLocal = recommendPieces(
            snapshot.targets,
            augForSolver,
            snapshot.fragments,
            snapshot.minorModsCap,
            snapshot.custom,
        );

        chosen = resLocal.chosen;
        totals = resLocal.totals;
        totalsRaw = resLocal.totalsRaw;
        feasible = !!resLocal.feasible;

        const armorOnlyTotals = sumArmorFromPieces(chosen);
        augUsedForUI = effectiveAugments(
            snapshot.augments,
            snapshot.autoAssumeMods,
            armorOnlyTotals,
            snapshot.targets,
            snapshot.leastFavStat,
        );

        ok = true;
    }

    // remove loader now that we have a result (feasible or not)
    hideSolveLoader();

    if (!feasible || !ok) {
        feasBox.textContent =
            "No possible combination with exactly 1 Exotic and 4 Legendaries (even with augments/fragments/mods).";
        feasBox.classList.add("bad");
        // keep panel min-height; do not render any result slots
        return;
    } else {
        feasBox.textContent = "Stats you should probably target.";
        feasBox.classList.remove("bad");
    }

    // ---------- SUMMARY (grouped; tertiaries only) ----------
    const perGroup = new Map();
    chosen.forEach((c) => {
        const key = `${c.setName} (${c.type})`;
        if (!perGroup.has(key))
            perGroup.set(key, { total: 0, tert: new Map() });
        const g = perGroup.get(key);
        g.total += 1;
        g.tert.set(c.tertiary ?? "—", (g.tert.get(c.tertiary ?? "—") || 0) + 1);
    });

    for (const [groupName, info] of perGroup.entries()) {
        const card = document.createElement("div");
        card.className = "card";

        const top = document.createElement("div");
        top.className = "top";
        const title = document.createElement("div");
        title.textContent = `${groupName} × ${info.total}`;
        top.appendChild(title);
        card.appendChild(top);

        const tline = document.createElement("div");
        tline.className = "tertsLine";
        const tlabel = document.createElement("span");
        tlabel.className = "label-chip";
        tlabel.textContent = "Tertiaries:";
        tline.appendChild(tlabel);
        for (const [tert, n] of info.tert.entries()) {
            const pill = document.createElement("span");
            pill.className = "statpill";
            pill.textContent = `${capitalize(String(tert))} × ${n}`;
            tline.appendChild(pill);
        }
        card.appendChild(tline);

        summaryRoot.appendChild(card);
    }

    // ---------- Mods Applied + Totals ABOVE per-piece ----------
    const perPieceSlot = piecesRoot.parentElement; // .slot wrapping per-piece list
    const panel = perPieceSlot.parentElement;

    // Mods Applied
    const tuningSlotTop = document.createElement("div");
    tuningSlotTop.className = "slot";
    tuningSlotTop.id = "tuningSlotTop";
    {
        const h = document.createElement("h3");
        h.textContent = "Mods Applied";
        tuningSlotTop.appendChild(h);
        tuningSlotTop.appendChild(buildModsSummaryCard(chosen, augUsedForUI));
    }
    panel.insertBefore(tuningSlotTop, perPieceSlot);

    // Totals vs Target
    const totalsSlotTop = document.createElement("div");
    totalsSlotTop.className = "slot";
    totalsSlotTop.id = "totalsSlotTop";
    {
        const h = document.createElement("h3");
        h.textContent = "Total vs Target";
        totalsSlotTop.appendChild(h);

        const totalsCard = document.createElement("div");
        totalsCard.className = "card";

        const top2 = document.createElement("div");
        top2.className = "top";
        const title2 = document.createElement("div");
        title2.textContent = "Totals Achieved";
        top2.appendChild(title2);
        totalsCard.appendChild(top2);

        const totalsPills = document.createElement("div");
        totalsPills.className = "stats";
        const targetRef = snapshot.targets;
        const showTotals = totalsRaw ?? totals;
        for (const k of STATS) {
            const pill = document.createElement("span");
            pill.className = "statpill";
            pill.textContent = `${k}: ${showTotals[k]} / ${targetRef[k]} (≥)`;
            totalsPills.appendChild(pill);
        }

        totalsCard.appendChild(totalsPills);
        totalsSlotTop.appendChild(totalsCard);
    }
    panel.insertBefore(totalsSlotTop, perPieceSlot);

    // ---------- PER-PIECE DETAILS ----------
    const perPieceTuning = (() => {
        const perPiece = chosen.map(() => ({ adds: zeroVec(), label: "None" }));
        const legIdxs = [];
        chosen.forEach((p, i) => {
            if (p.type === "Legendary") legIdxs.push(i);
        });
        if (legIdxs.length === 0) return perPiece;

        let cursor = 0;
        for (const row of augUsedForUI) {
            const isBalanced = row.mode === "balanced";
            const hasGeneral =
                row.mode === "general" &&
                ((row.plus && row.plus !== "none") ||
                    (row.minus && row.minus !== "none"));
            if (!isBalanced && !hasGeneral) continue;

            const iPiece = legIdxs[cursor % legIdxs.length];
            cursor++;

            const slot = perPiece[iPiece];
            const adds = slot.adds;

            if (isBalanced) {
                const piece = chosen[iPiece];
                const order = [...STATS].sort(
                    (a, b) => (piece.vector[a] || 0) - (piece.vector[b] || 0),
                );
                for (let j = 0; j < 3 && j < order.length; j++) {
                    const k = order[j];
                    adds[k] = (adds[k] || 0) + 1;
                }
                slot.label = "Balanced × 1";
            } else {
                if (row.plus && row.plus !== "none")
                    adds[row.plus] = (adds[row.plus] || 0) + 5;
                if (row.minus && row.minus !== "none")
                    adds[row.minus] = (adds[row.minus] || 0) - 5;
                const lbls = [];
                if (row.plus && row.plus !== "none")
                    lbls.push(`+5 ${capitalize(row.plus)}`);
                if (row.minus && row.minus !== "none")
                    lbls.push(`−5 ${capitalize(row.minus)}`);
                slot.label = lbls.length ? lbls.join(" / ") : "None";

                // remember this piece's +5 tuning stat
                slot.plus =
                    row.plus && row.plus !== "none"
                        ? row.plus.toLowerCase()
                        : null;
            }
        }
        return perPiece;
    })();

    chosen.forEach((c, idx) => {
        const card = document.createElement("div");
        card.className = "card";

        const top = document.createElement("div");
        top.className = "top";
        const title = document.createElement("div");
        title.textContent = `#${idx + 1} — ${c.setName} (${c.type})`;
        top.appendChild(title);

        import("./actions.dim.js").then(
            ({ buildDimQuery, copyToClipboard }) => {
                const btn = document.createElement("button");
                btn.className = "btn";
                btn.textContent = "Copy DIM Query";
                btn.style.marginLeft = "auto";

                btn.addEventListener("click", async () => {
                    const globalPlusList = (augUsedForUI || [])
                        .filter(
                            (r) =>
                                r &&
                                r.mode === "general" &&
                                r.plus &&
                                r.plus !== "none",
                        )
                        .map((r) => String(r.plus).toLowerCase());

                    const thisPlus = perPieceTuning[idx]?.plus || null;

                    const q = buildDimQuery(c, {
                        tuningPlus: thisPlus,
                        globalTuningPlusList: globalPlusList,
                        isCustomExoticActive: !!state.customExoticEnabled, // <-- add this
                    });

                    await copyToClipboard(q);
                    btn.textContent = "Copied!";
                    setTimeout(
                        () => (btn.textContent = "Copy DIM Query"),
                        1000,
                    );
                });

                top.appendChild(btn);
            },
        );

        card.appendChild(top);

        const tertLine = document.createElement("div");
        tertLine.className = "tertsLine";
        const chip = document.createElement("span");
        chip.className = "label-chip";
        chip.textContent = `Tertiary: ${c.tertiary ? capitalize(c.tertiary) : "—"}`;
        tertLine.appendChild(chip);
        card.appendChild(tertLine);

        const tuningLine = document.createElement("div");
        tuningLine.className = "modsLine";
        const tuningLabel = document.createElement("span");
        tuningLabel.className = "label-chip";
        tuningLabel.textContent = "Tuning:";
        const tuningChip = document.createElement("span");
        tuningChip.className = "statpill";
        tuningChip.textContent = perPieceTuning[idx]?.label || "None";
        tuningLine.appendChild(tuningLabel);
        tuningLine.appendChild(tuningChip);
        card.appendChild(tuningLine);

        const adds = { ...(perPieceTuning[idx]?.adds || zeroVec()) };
        if (c.mod) {
            addToVec(adds, c.mod.stat, c.mod.amount);
        }
        card.appendChild(
            makeBarsWithAdjustments(c.vector, adds, PER_PIECE_MAX),
        );

        piecesRoot.appendChild(card);
    });

    // if we grew taller than our original min-height, remember it
    if (recPanel) {
        const nowH = Math.ceil(recPanel.getBoundingClientRect().height);
        const prev = parseInt(recPanel.dataset.minH || "0", 10) || 0;
        if (nowH > prev) {
            recPanel.dataset.minH = String(nowH);
            recPanel.style.minHeight = `${nowH}px`;
        }
    }
}
