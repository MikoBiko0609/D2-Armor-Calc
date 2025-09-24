import {STATS, SLIDER_MAX_UI, FRAG_RANGE, FRAG_STEP, PER_PIECE_MAX, capitalize, roundToStep,} from "./core.js";
import { state } from "./state.js";

// DOM refs
export const slidersRoot = document.getElementById("sliders");
export const feasBox = document.getElementById("feasBox");
export const summaryRoot = document.getElementById("summary");
export const piecesRoot = document.getElementById("pieces");
export const totalsRoot = document.getElementById("totals");
export const minorModsSelect = document.getElementById("minorModsSelect");
export const modsCtrlBox = document.querySelector(".modsCtrl");
export const ticks = document.getElementById("ticks");
export const fragTicks = document.getElementById("fragTicks");

// tooltip helpers
export function posThumbTip(input, tip) {
    const min = Number(input.min || 0),
        max = Number(input.max || 100),
        val = Number(input.value || 0);
    const pct = max === min ? 0 : (val - min) / (max - min);
    const w = input.clientWidth || 1;
    tip.style.left = pct * w + "px";
    tip.textContent = input.value;
}

export function syncCustomExoticCheckboxStyle() {
    // find the tuning checkbox label 
    const tuningLabel = [...document.querySelectorAll("label")].find(
        (l) => new RegExp("Auto assume tuning", "i").test(l.textContent || "")
    );

    if (!tuningLabel) return; 

    // find the *existing* custom-exotic checkbox label without changing its layout
    const customLabel =
        // 1) if you have an id on the input, use it
        document.querySelector("#customExoticEnabled")?.closest("label") ||
        // 2) or a known wrapper created in your UI code
        document.querySelector(".custom-exotic-toggle label") ||
        // 3) or fallback: label whose text mentions "custom exotic"
        Array.from(document.querySelectorAll("label")).find((l) =>
            new RegExp("custom\\s*exotic", "i").test(l.textContent || "")

        );

    if (!customLabel) return;

    // copy classes from tuning label so styling matches exactly
    customLabel.className = tuningLabel.className;

    // if the tuning input itself carries a style class, mirror that too
    const tuningInput = tuningLabel.querySelector('input[type="checkbox"]');
    const customInput = customLabel.querySelector('input[type="checkbox"]');
    if (tuningInput && customInput) {
        customInput.className = tuningInput.className;
    }
}

export function attachRangeWithTooltip(input, onCommit) {
    if (!input.parentNode) {
        queueMicrotask(() => attachRangeWithTooltip(input, onCommit));
        return;
    }
    const wrap = document.createElement("div");
    wrap.className = "rangeWrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const tip = document.createElement("div");
    tip.className = "thumbTip";
    tip.style.display = "none";
    wrap.appendChild(tip);
    const show = () => {
        tip.style.display = "block";
        posThumbTip(input, tip);
    };
    const hide = () => {
        tip.style.display = "none";
    };
    input.addEventListener("mouseenter", show);
    input.addEventListener("mouseleave", hide);
    input.addEventListener("focus", show);
    input.addEventListener("blur", hide);
    input.addEventListener("input", () => posThumbTip(input, tip));
    const commit = () => onCommit(input.value);
    input.addEventListener("change", commit);
    input.addEventListener("mouseup", commit);
    input.addEventListener("touchend", commit);
    input.addEventListener("keyup", (e) => {
        if (e.key === "Enter") commit();
    });
    posThumbTip(input, tip);
}

// ticks
export function buildTickMarks() {
    if (ticks) {
        ticks.innerHTML = "";
        for (let v = 0; v <= SLIDER_MAX_UI; v += 10) {
            const o = document.createElement("option");
            o.value = String(v);
            ticks.appendChild(o);
        }
    }

    if (fragTicks) {
        fragTicks.innerHTML = "";
        for (let v = -FRAG_RANGE; v <= FRAG_RANGE; v += FRAG_STEP) {
            const o = document.createElement("option");
            o.value = String(v);
            fragTicks.appendChild(o);
        }
    }
}

// sliders
export function makeSliderRow(statKey, value) {
    const row = document.createElement("div");
    row.className = "row";

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = statKey[0].toUpperCase() + statKey.slice(1);

    const input = document.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = String(SLIDER_MAX_UI);
    input.value = String(value);
    input.step = "1";
    input.dataset.key = statKey;
    input.setAttribute("list", "ticks");

    const valWrap = document.createElement("div");
    valWrap.className = "valueWrap";

    const valInput = document.createElement("input");
    valInput.className = "valueInput";
    valInput.type = "number";
    valInput.min = "0";
    valInput.max = String(SLIDER_MAX_UI);
    valInput.step = "1";
    valInput.value = String(value);

    const slashMax = document.createElement("div");
    slashMax.className = "valueMax";
    slashMax.textContent = `/ ${SLIDER_MAX_UI}`;

    function setTargetSafe(v) {
        let n = Math.max(
            0,
            Math.min(SLIDER_MAX_UI, Math.round(Number(v) || 0)),
        );
        state.targets[statKey] = n;
        input.value = String(n);
        valInput.value = String(n);
        import("./ui.render.js").then((m) => m.render());
    }

    // simple debounce for keystrokes
    let t = null;
    function debouncedCommit(v) {
        if (t) clearTimeout(t);
        t = setTimeout(() => setTargetSafe(v), 120);
    }

    row.appendChild(label);
    row.appendChild(input);

    valWrap.appendChild(valInput);
    valWrap.appendChild(slashMax);
    row.appendChild(valWrap);
    row.appendChild(document.createElement("div"));

    // range: commit on release; show tooltip while dragging
    attachRangeWithTooltip(input, (v) => setTargetSafe(v));

    // number box: commit on input (debounced), Enter, blur, or change
    valInput.addEventListener("input", (e) =>
        debouncedCommit(e.currentTarget.value),
    );
    valInput.addEventListener("change", (e) => setTargetSafe(e.target.value));
    valInput.addEventListener("blur", (e) => setTargetSafe(e.target.value));
    valInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") setTargetSafe(e.currentTarget.value);
    });

    return row;
}

export function buildSliders() {
    slidersRoot.innerHTML = "";
    for (const k of STATS) {
        slidersRoot.appendChild(makeSliderRow(k, state.targets[k]));
    }
}

// fragments + augments + custom exotic builders
// ---------- FRAGMENT UI ----------
export function makeFragmentRow(statKey, value) {
    const row = document.createElement("div");
    row.className = "row";

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = statKey[0].toUpperCase() + statKey.slice(1);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(-FRAG_RANGE);
    input.max = String(FRAG_RANGE);
    input.value = String(value);
    input.step = String(FRAG_STEP);
    input.dataset.key = statKey;
    input.setAttribute("list", "fragTicks");

    const valWrap = document.createElement("div");
    valWrap.className = "valueWrap";
    const valInput = document.createElement("input");
    valInput.className = "valueInput";
    valInput.type = "number";
    valInput.min = String(-FRAG_RANGE);
    valInput.max = String(FRAG_RANGE);
    valInput.step = String(FRAG_STEP);
    valInput.value = String(value);

    const slashMax = document.createElement("div");
    slashMax.className = "valueMax";
    slashMax.textContent = `/ ±${FRAG_RANGE}`;

    function setFragSafe(v) {
        let n = roundToStep(
            Math.max(-FRAG_RANGE, Math.min(FRAG_RANGE, Number(v) || 0)),
            FRAG_STEP,
        );
        state.fragments[statKey] = n;
        input.value = String(n);
        valInput.value = String(n);
        import("./ui.render.js").then((m) => m.render());
    }

    // build DOM first
    row.appendChild(label);
    row.appendChild(input);
    valWrap.appendChild(valInput);
    valWrap.appendChild(slashMax);
    row.appendChild(valWrap);
    const spacer = document.createElement("div");
    row.appendChild(spacer);

    // commit on release; tooltip while dragging
    attachRangeWithTooltip(input, (v) => setFragSafe(v));

    valInput.addEventListener("change", (e) => setFragSafe(e.target.value));
    valInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") setFragSafe(e.currentTarget.value);
    });

    return row;
}

export function buildFragmentsUI() {
    let panel = document.getElementById("fragsPanel");
    if (!panel) {
        panel = document.createElement("div");
        panel.id = "fragsPanel";
        panel.className = "slot";
        const h = document.createElement("h3");
        h.textContent = "Fragment Augmentation Center";
        panel.appendChild(h);
        const hint = document.createElement("p");
        hint.className = "subtle";
        hint.textContent = "Adjust Fragment boost/penalties.";
        panel.appendChild(hint);

        const wrap = document.createElement("div");
        wrap.id = "fragsWrap";
        panel.appendChild(wrap);

        const augPanel = document.getElementById("augPanel");
        (augPanel || modsCtrlBox).after(panel);
    }

    const wrap = document.getElementById("fragsWrap");
    wrap.innerHTML = "";
    for (const k of STATS) {
        wrap.appendChild(makeFragmentRow(k, state.fragments[k]));
    }
}

export function makeStatSelect(current, onChange) {
    const sel = document.createElement("select");
    const opts = ["none", ...STATS];
    for (const v of opts) {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = v === "none" ? "None" : v[0].toUpperCase() + v.slice(1);
        if (v === current) o.selected = true;
        sel.appendChild(o);
    }
    sel.addEventListener("change", (e) => onChange(e.target.value));
    sel.style.background = "#0a1324";
    sel.style.border = "1px solid var(--border)";
    sel.style.borderRadius = "6px";
    sel.style.color = "var(--ink)";
    sel.style.padding = "6px 10px";
    return sel;
}

// inject pretty toggle styles once
function ensureToggleStyles() {
    if (document.getElementById("d2ac-toggle-css")) return;
    const css = document.createElement("style");
    css.id = "d2ac-toggle-css";
    css.textContent = `
  .d2ac-switch{ position:relative; display:inline-flex; align-items:center; gap:10px; cursor:pointer; }
  .d2ac-switch input{ position:absolute; opacity:0; width:0; height:0; }
  .d2ac-slider{
    width:46px; height:26px; background:#0a1324; border:1px solid var(--border);
    border-radius:999px; position:relative; transition:background .2s,border-color .2s;
    box-shadow: inset 0 0 0 2px rgba(255,255,255,0.03);
  }
  .d2ac-slider::after{
    content:""; position:absolute; top:3px; left:3px; width:20px; height:20px; border-radius:50%;
    background: var(--ink); transition:transform .2s, background .2s;
  }
  .d2ac-switch input:checked + .d2ac-slider{
    background: var(--accent, #3b82f6); border-color: transparent;
  }
  .d2ac-switch input:checked + .d2ac-slider::after{
    background:#fff; transform: translateX(20px);
  }
  `;
    document.head.appendChild(css);
}

// -------------------- ARMOR AUGMENTATION UI (+5 / -5 selectors) ------------------
export function buildAugmentationUI() {
    ensureToggleStyles();

    let panel = document.getElementById("augPanel");
    if (!panel) {
        panel = document.createElement("div");
        panel.id = "augPanel";
        panel.className = "slot";

        const h = document.createElement("h3");
        h.textContent = "Armor Augmentation";
        panel.appendChild(h);

        const hint = document.createElement("p");
        hint.className = "subtle";
        hint.textContent = "Each row can be a General ±5 or a Balanced Tuning.";
        panel.appendChild(hint);

        const wrap = document.createElement("div");
        wrap.id = "augWrap";
        panel.appendChild(wrap);

        modsCtrlBox.after(panel);
    }

    const wrap = document.getElementById("augWrap");
    wrap.innerHTML = "";

    // ---------- auto Assume controls (top row) ----------
    const autoRow = document.createElement("div");
    autoRow.style.display = "flex";
    autoRow.style.gap = "16px";
    autoRow.style.alignItems = "center";
    autoRow.style.margin = "8px 0 14px";
    autoRow.style.padding = "4px 0";

    // pretty toggle
    const toggle = document.createElement("label");
    toggle.className = "d2ac-switch";
    const autoCb = document.createElement("input");
    autoCb.type = "checkbox";
    autoCb.checked = !!state.autoAssumeMods;
    const slider = document.createElement("span");
    slider.className = "d2ac-slider";
    const toggleText = document.createElement("span");
    toggleText.textContent = "Auto assume tuning";
    toggle.appendChild(autoCb);
    toggle.appendChild(slider);
    toggle.appendChild(toggleText);

    // least-favored dropdown (enabled only when auto is ON)
    const lfWrap = document.createElement("div");
    lfWrap.style.marginLeft = "auto";
    lfWrap.style.display = "flex";
    lfWrap.style.alignItems = "center";
    lfWrap.style.gap = "8px";

    const lfLabel = document.createElement("label");
    lfLabel.className = "label";
    lfLabel.textContent = "Least Desired Stat:";

    const lfSel = document.createElement("select");
    ["none", ...STATS].forEach((opt) => {
        const o = document.createElement("option");
        o.value = opt;
        o.textContent =
            opt === "none"
                ? "No preference"
                : opt[0].toUpperCase() + opt.slice(1);
        if (opt === state.leastFavStat) o.selected = true;
        lfSel.appendChild(o);
    });
    Object.assign(lfSel.style, {
        background: "#0a1324",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        color: "var(--ink)",
        padding: "6px 10px",
    });

    lfWrap.appendChild(lfLabel);
    lfWrap.appendChild(lfSel);
    autoRow.appendChild(toggle);
    autoRow.appendChild(lfWrap);
    wrap.appendChild(autoRow);

    // ---------- manual rows ----------
    const buildOneRow = (i) => {
        const row = document.createElement("div");
        row.className = "augRow";
        row.style.display = "grid";
        row.style.gridTemplateColumns = "80px 110px 30px 110px 30px 110px";
        row.style.gap = "10px";
        row.style.alignItems = "center";
        row.style.marginBottom = "10px";

        const modeLabel = document.createElement("div");
        modeLabel.className = "label";
        modeLabel.textContent = `Slot ${i + 1}`;

        const modeSel = document.createElement("select");
        ["general", "balanced"].forEach((m) => {
            const o = document.createElement("option");
            o.value = m;
            o.textContent = m === "general" ? "General ±5" : "Balanced";
            if (state.augments[i].mode === m) o.selected = true;
            modeSel.appendChild(o);
        });
        Object.assign(modeSel.style, {
            background: "#0a1324",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            color: "var(--ink)",
            padding: "6px 10px",
        });
        modeSel.addEventListener("change", (e) => {
            state.augments[i].mode = e.target.value;
            import("./ui.render.js").then((m) => m.render());
            applyVisibility();
        });

        const plusLabel = document.createElement("div");
        plusLabel.className = "label";
        plusLabel.textContent = `+5`;

        const plusSel = makeStatSelect(state.augments[i].plus, (val) => {
            state.augments[i].plus = val;
            import("./ui.render.js").then((m) => m.render());
        });

        const minusLabel = document.createElement("div");
        minusLabel.className = "label";
        minusLabel.textContent = `−5`;

        const minusSel = makeStatSelect(state.augments[i].minus, (val) => {
            state.augments[i].minus = val;
            import("./ui.render.js").then((m) => m.render());
        });

        const applyVisibility = () => {
            const isBal = modeSel.value === "balanced";
            plusLabel.style.display = isBal ? "none" : "block";
            plusSel.style.display = isBal ? "none" : "block";
            minusLabel.style.display = isBal ? "none" : "block";
            minusSel.style.display = isBal ? "none" : "block";
        };
        applyVisibility();

        row.appendChild(modeLabel);
        row.appendChild(modeSel);
        row.appendChild(plusLabel);
        row.appendChild(plusSel);
        row.appendChild(minusLabel);
        row.appendChild(minusSel);
        wrap.appendChild(row);
    };

    for (let i = 0; i < 4; i++) buildOneRow(i);

    // ---------- enable/disable manual rows live (no rebuild) ----------
    const toggleManualRows = (disabled) => {
        const rows = wrap.querySelectorAll(".augRow");
        rows.forEach((row) => {
            // visuals + interactivity
            row.style.opacity = disabled ? "0.45" : "1";
            row.style.pointerEvents = disabled ? "none" : "auto";
            if (disabled) row.setAttribute("aria-disabled", "true");
            else row.removeAttribute("aria-disabled");

            // hard-disable all selects inside the row
            row.querySelectorAll("select").forEach((sel) => {
                sel.disabled = disabled;
                if (disabled) sel.tabIndex = -1;
                else sel.removeAttribute("tabIndex");
            });
        });

        // LF select interactivity mirrors auto toggle
        lfSel.disabled = !state.autoAssumeMods;
        lfSel.style.opacity = state.autoAssumeMods ? "1" : "0.55";
    };

    // initial sync
    toggleManualRows(!!state.autoAssumeMods);

    // toggle handler
    autoCb.addEventListener("change", (e) => {
        state.autoAssumeMods = e.target.checked;
        toggleManualRows(!!state.autoAssumeMods);
        import("./ui.render.js").then((m) => m.render());
    });

    // LF change handler
    lfSel.addEventListener("change", (e) => {
        state.leastFavStat = e.target.value;
        import("./ui.render.js").then((m) => m.render());
    });
}

// --------- CUSTOM EXOTIC (override) ----------
export function createCustomExoticUI() {
    // use the same toggle styles as the Augmentation switch
    if (typeof ensureToggleStyles === "function") ensureToggleStyles();

    let panel = document.getElementById("customExoPanel");
    if (panel) return;

    panel = document.createElement("div");
    panel.id = "customExoPanel";
    panel.className = "slot";

    const h = document.createElement("h3");
    h.textContent = "Use Specific Exotic Roll";
    panel.appendChild(h);

    // --- pretty toggle row (matches Augmentation) ---
    const toggleRow = document.createElement("div");
    toggleRow.style.display = "flex";
    toggleRow.style.alignItems = "center";
    toggleRow.style.gap = "10px";
    toggleRow.style.marginBottom = "8px";

    const toggleLabel = document.createElement("label");
    toggleLabel.className = "d2ac-switch";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!state.customExoticEnabled;

    const slider = document.createElement("span");
    slider.className = "d2ac-slider";

    const toggleText = document.createElement("span");
    toggleText.textContent = "Enable";

    toggleLabel.appendChild(cb);
    toggleLabel.appendChild(slider);
    toggleLabel.appendChild(toggleText);
    toggleRow.appendChild(toggleLabel);
    panel.appendChild(toggleRow);

    // helper text (unchanged, just not inside the label)
    const p1 = document.createElement("p");
    p1.className = "subtle";
    p1.textContent =
        "- Used for Exotic Class Items, Non-Max Statted Exotics, or old Exotics.";
    const p2 = document.createElement("p");
    p2.className = "subtle";
    p2.textContent = "- Enter BASE stats.";
    const p3 = document.createElement("p");
    p3.className = "subtle";
    p3.textContent =
        "- If applicable, include artifice slot as part of the base stats.";
    panel.appendChild(p1);
    panel.appendChild(p2);
    panel.appendChild(p3);

    // inputs wrapper
    const wrap = document.createElement("div");
    wrap.id = "customExoWrap";
    wrap.style.display = "grid";
    wrap.style.gap = "10px";
    panel.appendChild(wrap);

    const fragsPanel = document.getElementById("fragsPanel");
    fragsPanel.after(panel);

    // ensure state + zero defaults
    state.customExotic = state.customExotic || {};
    for (const k of STATS) {
        if (typeof state.customExotic[k] !== "number")
            state.customExotic[k] = 0;
    }

    // only re-solve when enabled
    const maybeRender = () => {
        if (!state.customExoticEnabled) return;
        import("./ui.render.js").then((m) => m.render());
    };

    // build rows once (respect current state values)
    STATS.forEach((k) => {
        const row = document.createElement("div");
        row.style.display = "grid";
        row.style.gridTemplateColumns = "130px 1fr 60px";
        row.style.alignItems = "center";
        row.style.gap = "10px";

        const lab = document.createElement("div");
        lab.className = "label";
        lab.textContent = k[0].toUpperCase() + k.slice(1);

        const range = document.createElement("input");
        range.type = "range";
        range.min = "0";
        range.max = "45";
        range.step = "1";
        range.dataset.key = k;
        range.value = String(state.customExotic[k]);

        const val = document.createElement("input");
        val.type = "number";
        val.min = "0";
        val.max = "45";
        val.step = "1";
        val.className = "valueInput";
        val.dataset.key = k;
        val.value = String(state.customExotic[k]);

        // commit-on-release for the range (guarded render)
        attachRangeWithTooltip(range, (v) => {
            const n = Math.max(0, Math.min(45, Number(v) || 0));
            state.customExotic[k] = n;
            range.value = String(n);
            val.value = String(n);
            maybeRender();
        });

        // number box (guarded render)
        const commitNum = (raw) => {
            const n = Math.max(0, Math.min(45, Number(raw) || 0));
            state.customExotic[k] = n;
            range.value = String(n);
            val.value = String(n);
            maybeRender();
        };
        val.addEventListener("change", (e) => commitNum(e.target.value));
        val.addEventListener("keydown", (e) => {
            if (e.key === "Enter") commitNum(val.value);
        });

        row.appendChild(lab);
        row.appendChild(range);
        row.appendChild(val);
        wrap.appendChild(row);
    });

    // toggle handler (always re-solve on toggle)
    cb.addEventListener("change", (e) => {
        state.customExoticEnabled = !!e.target.checked;
        updateCustomExoticUI(); // keep any dependent visuals in sync
        import("./ui.render.js").then((m) => m.render());
    });

    updateCustomExoticUI();
}

// --- update each render (no rebuild) ---
export function updateCustomExoticUI() {
    // reuse the same styles as the tuning switch if you have them
    if (typeof ensureToggleStyles === "function") ensureToggleStyles();

    // Find the slot by its header
    const slot = Array.from(document.querySelectorAll(".slot")).find((s) =>
        s
            .querySelector("h3")
            ?.textContent?.toLowerCase()
            .includes("specific exotic"),
    );
    if (!slot) return;

    // do NOT change existing visuals here—only ensure the toggle keeps state in sync
    const rawCb = slot.querySelector('input[type="checkbox"]');
    if (rawCb) {
        rawCb.checked = !!state.customExoticEnabled;
        // keep in sync if someone flips it outside our event
        rawCb.onchange = (e) => {
            state.customExoticEnabled = !!e.target.checked;
            import("./ui.render.js").then((m) => m.render());
        };
    }

    // One-time initialize inputs to current state without triggering renders.
    if (!slot.dataset.cxInitSliders) {
        // make sure state has zeros
        state.customExotic = state.customExotic || {};
        for (const k of STATS) {
            if (typeof state.customExotic[k] !== "number")
                state.customExotic[k] = 0;
        }

        // set values directly; do NOT dispatch events here
        slot.querySelectorAll('input[type="range"]').forEach((r) => {
            const key = r.dataset.key;
            if (key && key in state.customExotic)
                r.value = String(state.customExotic[key]);
            else r.value = "0";
        });
        slot.querySelectorAll('input[type="number"].valueInput').forEach(
            (n) => {
                const key = n.dataset.key;
                if (key && key in state.customExotic)
                    n.value = String(state.customExotic[key]);
                else n.value = "0";
            },
        );

        slot.dataset.cxInitSliders = "1";
    }
}

export function makeBarsWithAdjustments(
    baseVec,
    addsVec,
    perPieceMax = PER_PIECE_MAX,
) {
    const wrap = document.createElement("div");
    wrap.className = "bars";

    // quick helper to style bars consistently
    const mk = (w, bg, extra = {}) => {
        const d = document.createElement("div");
        d.style.width = Math.max(0, Math.min(100, w)) + "%";
        d.style.background = bg;
        d.style.borderRadius = "6px";
        d.style.height = "8px";
        Object.assign(d.style, extra);
        return d;
    };

    let totalFinal = 0;

    for (const k of STATS) {
        const row = document.createElement("div");
        row.className = "barRow";

        const lab = document.createElement("div");
        lab.className = "barLabel";
        lab.textContent = capitalize(k);

        // track
        const track = document.createElement("div");
        track.className = "track";
        track.style.position = "relative";
        track.style.overflow = "hidden";

        // inner flex for blue+green
        const inner = document.createElement("div");
        inner.style.display = "flex";
        inner.style.gap = "0px";
        inner.style.height = "8px";
        inner.style.borderRadius = "6px";
        inner.style.position = "relative";

        const base = Math.max(0, baseVec[k] || 0);
        const adds = Number(addsVec[k] || 0);
        const posAdd = Math.max(0, adds);
        const negAbs = Math.max(0, -adds);

        // amount of base eaten by negative tuning/mods
        const baseEaten = Math.min(base, negAbs);

        // what remains blue, what becomes red, what is green
        const blueVal = Math.max(0, base - baseEaten);
        const redVal = baseEaten;
        const greenVal = Math.max(0, posAdd);

        // final number to show
        const finalVal = Math.max(0, Math.min(perPieceMax, blueVal + greenVal));
        totalFinal += finalVal;

        // percentages for the track
        const bluePct = (blueVal / perPieceMax) * 100;
        const greenPct = (greenVal / perPieceMax) * 100;
        const redPct = (redVal / perPieceMax) * 100;

        // colors (match your theme)
        const BLUE = "var(--accent, #3b82f6)";
        const GREEN = "#22c55e";
        const RED = "#ef4444";

        // build bars: blue then green (side-by-side)
        inner.appendChild(mk(bluePct, BLUE));
        inner.appendChild(mk(greenPct, GREEN));

        // red overlay sits at the end of the blue portion
        const negBar = mk(redPct, RED, {
            position: "absolute",
            left: bluePct + "%", // start where blue ends
            top: "0",
            bottom: "0",
            opacity: "0.9",
        });

        track.appendChild(inner);
        track.appendChild(negBar);

        const val = document.createElement("div");
        val.className = "barVal";
        val.textContent = String(finalVal); // show final value only

        row.appendChild(lab);
        row.appendChild(track);
        row.appendChild(val);
        wrap.appendChild(row);
    }

    // total row
    const tRow = document.createElement("div");
    tRow.className = "barRow";
    const tLab = document.createElement("div");
    tLab.className = "barLabel";
    tLab.textContent = "Total";
    const tTrack = document.createElement("div");
    tTrack.className = "track";

    const tFill = document.createElement("div");
    tFill.className = "fill";
    tFill.style.width =
        Math.min(100, (totalFinal / (perPieceMax * 3)) * 100) + "%";
    tTrack.appendChild(tFill);

    const tVal = document.createElement("div");
    tVal.className = "barVal";
    tVal.textContent = String(totalFinal);
    tRow.appendChild(tLab);
    tRow.appendChild(tTrack);
    tRow.appendChild(tVal);
    wrap.appendChild(tRow);

    return wrap;
}

export function checkInputs(targets) {
    for (const k of STATS) {
        if (targets[k] < 0 || targets[k] > SLIDER_MAX_UI) {
            return {
                ok: false,
                msg: `Target for ${capitalize(k)} must be between 0 and ${SLIDER_MAX_UI}.`,
            };
        }
    }
    return { ok: true, msg: `Stats you should probably target.` };
}
