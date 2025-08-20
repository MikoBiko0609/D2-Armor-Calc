// ======= STATS / LIMITS =======
const STATS = ["health","melee","grenade","super","class","weapons"];
const SLIDER_MAX_UI = 200; // UI range
const ARMOR_CAP = 150;     // armor (pieces) cap per stat
const TOTAL_CAP = 200;     // final totals cap per stat (armor + mods + fragments + augments)
const NUM_PIECES = 5;
const FRAG_RANGE = 30;     // ±30 per stat
const FRAG_STEP  = 10;     // step size for fragment sliders
const PER_PIECE_MAX = 45;

// ======= SETS =======
const SETS = [
  { name: "Bulwark",   primary: "health",  secondary: "class"   },
  { name: "Brawler",   primary: "melee",   secondary: "health"  },
  { name: "Grenadier", primary: "grenade", secondary: "super"   },
  { name: "Paragon",   primary: "super",   secondary: "melee"   },
  { name: "Specialist",primary: "class",   secondary: "weapons" },
  { name: "Gunner",    primary: "weapons", secondary: "grenade" },
];

// ======= POINTS =======
const PTS_LEG = { primary: 30, secondary: 25, tertiary: 20, other: 5 };
const PTS_EXO = { primary: 30, secondary: 20, tertiary: 12, other: 5 };

// Build archetypes (set x tertiary) for both Legendary and Exotic
function statVector(pts, primary, secondary, tertiary){
  const v = Object.fromEntries(STATS.map(k => [k, pts.other]));
  v[primary]   = pts.primary;
  v[secondary] = pts.secondary;
  v[tertiary]  = pts.tertiary;
  return v;
}
function buildArchetypes(){
  const leg = [], exo = [];
  for (const s of SETS){
    const blocked = new Set([s.primary, s.secondary]);
    const tertOptions = STATS.filter(x => !blocked.has(x));
    for (const t of tertOptions){
      leg.push({ type:"Legendary", setName:s.name, tertiary:t, vector: statVector(PTS_LEG, s.primary, s.secondary, t) });
      exo.push({ type:"Exotic",    setName:s.name, tertiary:t, vector: statVector(PTS_EXO, s.primary, s.secondary, t) });
    }
  }
  return { leg, exo };
}
const ARCH = buildArchetypes();

// ======= UI HANDLES =======
const slidersRoot = document.getElementById("sliders");
const feasBox = document.getElementById("feasBox");
const summaryRoot = document.getElementById("summary");
const piecesRoot  = document.getElementById("pieces");
const totalsRoot  = document.getElementById("totals");
const minorModsSelect = document.getElementById("minorModsSelect");
const modsCtrlBox = document.querySelector(".modsCtrl");
const ticks = document.getElementById("ticks");
const fragTicks = document.getElementById("fragTicks");

// ======= STATE =======
const state = {
  targets: Object.fromEntries(STATS.map(k => [k, 0])),
  minorModsCap: Number(minorModsSelect?.value || 0),
  fragments: Object.fromEntries(STATS.map(k => [k, 0])),

  augments: [
    { mode:"general", plus:"none", minus:"none" },
    { mode:"general", plus:"none", minus:"none" },
    { mode:"general", plus:"none", minus:"none" },
    { mode:"general", plus:"none", minus:"none" },
  ],

  customExoticEnabled: false,
  customExotic: Object.fromEntries(STATS.map(k => [k, 0])) // sliders 0..45
};

// ======= TICK MARKS =======
function buildTickMarks(){
  if (ticks){
    ticks.innerHTML = "";
    for (let v = 0; v <= SLIDER_MAX_UI; v += 10){
      const o = document.createElement("option");
      o.value = String(v);
      ticks.appendChild(o);
    }
  }
  if (fragTicks){
    fragTicks.innerHTML = "";
    for (let v = -FRAG_RANGE; v <= FRAG_RANGE; v += FRAG_STEP){
      const o = document.createElement("option");
      o.value = String(v);
      fragTicks.appendChild(o);
    }
  }
}
function roundToStep(n, step){ return Math.round(n/step)*step; }

// ======= Tooltip + commit-on-release helpers =======
function posThumbTip(input, tip){
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const val = Number(input.value || 0);
  const pct = (max === min) ? 0 : (val - min) / (max - min);
  const w = input.clientWidth || 1;
  tip.style.left = (pct * w) + "px";
  tip.textContent = input.value;
}
function attachRangeWithTooltip(input, onCommit){
  // If not in DOM yet, try again on next tick
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

  const show = ()=>{ tip.style.display = "block"; posThumbTip(input, tip); };
  const hide = ()=>{ tip.style.display = "none"; };

  input.addEventListener("mouseenter", show);
  input.addEventListener("mouseleave", hide);
  input.addEventListener("focus", show);
  input.addEventListener("blur", hide);

  // Move tooltip while dragging; totals recompute only on release
  input.addEventListener("input", ()=> posThumbTip(input, tip));

  const commit = ()=> onCommit(input.value);
  input.addEventListener("change", commit);   // fires on release
  input.addEventListener("mouseup", commit);
  input.addEventListener("touchend", commit);
  input.addEventListener("keyup", (e)=>{ if (e.key === "Enter") commit(); });

  posThumbTip(input, tip);
}

// ======= TARGET SLIDERS =======
function makeSliderRow(statKey, value){
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
  input.step = "1";                  // ← step of 1 for main stats
  input.dataset.key = statKey;
  // If you don’t want tick marks at all, remove the datalist hookup:
  // input.setAttribute("list","ticks");  // ← comment out / remove this line

  const valWrap = document.createElement("div");
  valWrap.className = "valueWrap";
  const valInput = document.createElement("input");
  valInput.className = "valueInput";
  valInput.type = "number";
  valInput.min = "0";
  valInput.max = String(SLIDER_MAX_UI);
  valInput.step = "1";               // ← step of 1 for the number box
  valInput.value = String(value);

  const slashMax = document.createElement("div");
  slashMax.className = "valueMax";
  slashMax.textContent = `/ ${SLIDER_MAX_UI}`;

  function setTargetSafe(v){
    // clamp to 0..SLIDER_MAX_UI and round to integer (no multiples of 5)
    let n = Math.max(0, Math.min(SLIDER_MAX_UI, Math.round(Number(v) || 0)));
    state.targets[statKey] = n;
    input.value = String(n);
    valInput.value = String(n);
    render();
  }

  // Build DOM first
  row.appendChild(label);
  row.appendChild(input);
  valWrap.appendChild(valInput);
  valWrap.appendChild(slashMax);
  row.appendChild(valWrap);
  const spacer = document.createElement("div");
  row.appendChild(spacer);

  // Commit on release; tooltip while dragging
  attachRangeWithTooltip(input, (v)=> setTargetSafe(v));

  valInput.addEventListener("change", (e) => setTargetSafe(e.target.value));
  valInput.addEventListener("keydown", (e) => { if (e.key === "Enter") setTargetSafe(e.currentTarget.value); });

  return row;
}

function buildSliders(){
  slidersRoot.innerHTML = "";
  for (const k of STATS){
    slidersRoot.appendChild(makeSliderRow(k, state.targets[k]));
  }
}

// ======= ARMOR AUGMENTATION UI (+5 / -5 selectors) =======
function buildAugmentationUI(){
  let panel = document.getElementById("augPanel");
  if (!panel){
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

  for (let i = 0; i < 4; i++){
    const row = document.createElement("div");
    row.style.display = "grid";
    // mode | modeSelect | +5 label/select | -5 label/select
  row.style.gridTemplateColumns = "80px 110px 30px 110px 30px 110px"; // tighter
    row.style.gap = "10px";
    row.style.alignItems = "center";
    row.style.marginBottom = "10px";

    // Mode label + select
    const modeLabel = document.createElement("div");
    modeLabel.className = "label";
    modeLabel.textContent = `Slot ${i+1}`;

    const modeSel = document.createElement("select");
    ["general","balanced"].forEach(m=>{
      const o = document.createElement("option");
      o.value = m;
      o.textContent = (m==="general" ? "General ±5" : "Balanced");
      if (state.augments[i].mode === m) o.selected = true;
      modeSel.appendChild(o);
    });
    // inline style to match your selects
    modeSel.style.background = "#0a1324";
    modeSel.style.border = "1px solid var(--border)";
    modeSel.style.borderRadius = "6px";
    modeSel.style.color = "var(--ink)";
    modeSel.style.padding = "6px 10px";
    modeSel.addEventListener("change", (e)=>{
      state.augments[i].mode = e.target.value;
      render();
    });

    // +5
    const plusLabel = document.createElement("div");
    plusLabel.className = "label";
    plusLabel.textContent = `+5`;
    const plusSel = makeStatSelect(state.augments[i].plus, (val)=>{
      state.augments[i].plus = val; render();
    });

    // −5
    const minusLabel = document.createElement("div");
    minusLabel.className = "label";
    minusLabel.textContent = `−5`;
    const minusSel = makeStatSelect(state.augments[i].minus, (val)=>{
      state.augments[i].minus = val; render();
    });

    // Hide ±5 when Balanced
    const applyVisibility = ()=>{
      const isBal = (state.augments[i].mode === "balanced");
      plusLabel.style.display = isBal ? "none" : "block";
      plusSel.style.display   = isBal ? "none" : "block";
      minusLabel.style.display= isBal ? "none" : "block";
      minusSel.style.display  = isBal ? "none" : "block";
    };
    applyVisibility();
    modeSel.addEventListener("change", applyVisibility);

    row.appendChild(modeLabel);
    row.appendChild(modeSel);
    row.appendChild(plusLabel);
    row.appendChild(plusSel);
    row.appendChild(minusLabel);
    row.appendChild(minusSel);

    wrap.appendChild(row);
  }
}


function makeStatSelect(current, onChange){
  const sel = document.createElement("select");
  const opts = ["none", ...STATS];
  for (const v of opts){
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v === "none" ? "None" : (v[0].toUpperCase()+v.slice(1));
    if (v === current) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener("change", (e)=> onChange(e.target.value));
  sel.style.background = "#0a1324";
  sel.style.border = "1px solid var(--border)";
  sel.style.borderRadius = "6px";
  sel.style.color = "var(--ink)";
  sel.style.padding = "6px 10px";
  return sel;
}

// ======= FRAGMENT UI =======
function makeFragmentRow(statKey, value){
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
  input.step = String(FRAG_STEP);;
  input.dataset.key = statKey;
  input.setAttribute("list","fragTicks");

  const valWrap = document.createElement("div");
  valWrap.className = "valueWrap";
  const valInput = document.createElement("input");
  valInput.className = "valueInput";
  valInput.type = "number";
  valInput.min = String(-FRAG_RANGE);
  valInput.max = String(FRAG_RANGE);
  valInput.step = String(FRAG_STEP);;
  valInput.value = String(value);

  const slashMax = document.createElement("div");
  slashMax.className = "valueMax";
  slashMax.textContent = `/ ±${FRAG_RANGE}`;

  function setFragSafe(v){
    let n = roundToStep(Math.max(-FRAG_RANGE, Math.min(FRAG_RANGE, Number(v) || 0)), FRAG_STEP);
    state.fragments[statKey] = n;
    input.value = String(n);
    valInput.value = String(n);
    render();
  }

  // Build DOM first
  row.appendChild(label);
  row.appendChild(input);
  valWrap.appendChild(valInput);
  valWrap.appendChild(slashMax);
  row.appendChild(valWrap);
  const spacer = document.createElement("div");
  row.appendChild(spacer);

  // Commit on release; tooltip while dragging
  attachRangeWithTooltip(input, (v)=> setFragSafe(v));

  valInput.addEventListener("change", (e) => setFragSafe(e.target.value));
  valInput.addEventListener("keydown", (e) => { if (e.key === "Enter") setFragSafe(e.currentTarget.value); });

  return row;
}

function buildFragmentsUI(){
  let panel = document.getElementById("fragsPanel");
  if (!panel){
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
  for (const k of STATS){
    wrap.appendChild(makeFragmentRow(k, state.fragments[k]));
  }
}

// ======= CUSTOM EXOTIC (override) =======
function createCustomExoticUI(){
  let panel = document.getElementById("customExoPanel");
  if (panel) return;

  panel = document.createElement("div");
  panel.id = "customExoPanel";
  panel.className = "slot";

  const h = document.createElement("h3");
  h.textContent = "Use Specific Exotic Roll";
  panel.appendChild(h);

  const togg = document.createElement("label");
  togg.style.display = "flex";
  togg.style.alignItems = "center";
  togg.style.gap = "8px";
  togg.style.marginBottom = "8px";

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.addEventListener("change", (e)=>{
    state.customExoticEnabled = e.target.checked;
    updateCustomExoticUI();       
    render();                    
  });

  const txt = document.createElement("span");
  txt.className = "subtle";
  txt.innerHTML = "- Used for Exotic Class Items, Non-Max Statted Exotics, or old Exotics.<br>- Enter BASE stats.<br>- If applicable, include artifice slot as part of the base stats.";

  togg.appendChild(cb); togg.appendChild(txt);
  panel.appendChild(togg);

  const wrap = document.createElement("div");
  wrap.id = "customExoWrap";
  wrap.style.display = "grid";
  wrap.style.gap = "10px";
  panel.appendChild(wrap);

  const fragsPanel = document.getElementById("fragsPanel");
  fragsPanel.after(panel);

  // Build rows once
  STATS.forEach(k => {
    const row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "130px 1fr 60px";
    row.style.alignItems = "center";
    row.style.gap = "10px";

    const lab = document.createElement("div");
    lab.className = "label";
    lab.textContent = k[0].toUpperCase() + k.slice(1);

    const range = document.createElement("input");
    range.type = "range"; range.min = "0"; range.max = "45"; range.step = "1";
    range.dataset.key = k;

    const val = document.createElement("input");
    val.type = "number"; val.min = "0"; val.max = "45"; val.step = "1";
    val.className = "valueInput"; val.dataset.key = k;

    // commit-on-release for the range
    attachRangeWithTooltip(range, (v)=> {
      const n = Math.max(0, Math.min(45, Number(v)||0));
      state.customExotic[k] = n;
      range.value = String(n);
      val.value = String(n);
      render(); 
    });

    // number box commits immediately on change/Enter
    val.addEventListener("change", (e)=>{
      const n = Math.max(0, Math.min(45, Number(e.target.value)||0));
      state.customExotic[k] = n;
      range.value = String(n);
      val.value = String(n);
      render();
    });
    val.addEventListener("keydown", (e)=>{
      if (e.key === "Enter") {
        const n = Math.max(0, Math.min(45, Number(val.value)||0));
        state.customExotic[k] = n;
        range.value = String(n);
        val.value = String(n);
        render();
      }
    });

    row.appendChild(lab); row.appendChild(range); row.appendChild(val);
    wrap.appendChild(row);
  });

  updateCustomExoticUI(); 
}

// --- update each render (no rebuild) ---
function updateCustomExoticUI(){
  const panel = document.getElementById("customExoPanel");
  if (!panel) return;
  const cb = panel.querySelector('input[type="checkbox"]');
  const wrap = document.getElementById("customExoWrap");
  if (cb) cb.checked = state.customExoticEnabled;
  if (!wrap) return;

  wrap.style.display = state.customExoticEnabled ? "grid" : "none";

  // sync values from state (no new elements)
  wrap.querySelectorAll('input[type="range"]').forEach(r=>{
    const k = r.dataset.key;
    r.value = String(state.customExotic[k] ?? 0);
  });
  wrap.querySelectorAll('input[type="number"]').forEach(n=>{
    const k = n.dataset.key;
    n.value = String(state.customExotic[k] ?? 0);
  });
}


// ======= BEAM SEARCH =======
const BEAM_WIDTHS = [800, 1800, 3200];

function recommendPieces(targets, minorModsCap){
  const majorModsCap = NUM_PIECES - Math.max(0, Math.min(NUM_PIECES, minorModsCap));

  const custom = state.customExoticEnabled
    ? { enabled:true, vector: { ...state.customExotic }, setName:"Custom Exotic", tertiary:"custom" }
    : { enabled:false };

  for (const BW of BEAM_WIDTHS){
    const res = runBeam(targets, state.augments, state.fragments, minorModsCap, majorModsCap, BW, custom);
    if (res.feasible || BW === BEAM_WIDTHS[BEAM_WIDTHS.length-1]) return res;
  }
}

function runBeam(targets, augments, fragments, minorModsCap, majorModsCap, BEAM_WIDTH, custom){
  let beam = [{
    armor: zeroVec(),
    pieces: [],
    exoticsUsed: 0,
    step: 0,
    score: 0
  }];
  beam[0].score = optimisticResidual(beam[0].armor, targets, augments, fragments, minorModsCap, majorModsCap, NUM_PIECES);

  for (let step = 0; step < NUM_PIECES; step++){
    const next = [];
    for (const node of beam){
      const slotsLeft = NUM_PIECES - node.step - 1;
      const mustPlaceExotic = (node.exoticsUsed === 0 && slotsLeft === 0);

      // Legendary children
      if (!mustPlaceExotic){
        for (const arch of ARCH.leg){
          const armorAfter = clampAdd(node.armor, arch.vector, ARMOR_CAP);
          const child = {
            armor: armorAfter,
            pieces: [...node.pieces, { ...arch }],
            exoticsUsed: node.exoticsUsed,
            step: node.step + 1,
          };
          const rem = NUM_PIECES - child.step;
          child.score = optimisticResidual(child.armor, targets, augments, fragments, minorModsCap, majorModsCap, rem);
          if (child.score < Infinity) next.push(child);
        }
      }

      // Exotic children
      if (node.exoticsUsed === 0){
        if (custom?.enabled){
          const armorAfter = clampAdd(node.armor, custom.vector, ARMOR_CAP);
          const child = {
            armor: armorAfter,
            pieces: [...node.pieces, { type:"Exotic", setName: custom.setName, tertiary: custom.tertiary, vector: custom.vector }],
            exoticsUsed: 1,
            step: node.step + 1,
          };
          const rem = NUM_PIECES - child.step;
          child.score = optimisticResidual(child.armor, targets, augments, fragments, minorModsCap, majorModsCap, rem);
          if (child.score < Infinity) next.push(child);
        } else {
          for (const arch of ARCH.exo){
            const armorAfter = clampAdd(node.armor, arch.vector, ARMOR_CAP);
            const child = {
              armor: armorAfter,
              pieces: [...node.pieces, { ...arch }],
              exoticsUsed: 1,
              step: node.step + 1,
            };
            const rem = NUM_PIECES - child.step;
            child.score = optimisticResidual(child.armor, targets, augments, fragments, minorModsCap, majorModsCap, rem);
            if (child.score < Infinity) next.push(child);
          }
        }
      }
    }
    next.sort((a,b) => a.score - b.score);
    beam = next.slice(0, BEAM_WIDTH);
    if (beam.length === 0) break;
  }

  let best = null;
  let bestScore = Infinity;
  for (const node of beam){
    if (node.step !== NUM_PIECES) continue;
    if (node.exoticsUsed !== 1) continue;

    const plan = allocateModsWithAugFrags(node.armor, targets, augments, fragments, minorModsCap, majorModsCap);
    const score = deficitScore(plan.totals, targets);
    if (score < bestScore){
      const chosen = distributeModsToPieces(node.pieces, plan.mods);
      best = { pieces: chosen, totals: plan.totals };
      bestScore = score;
    }
  }

  if (!best){
    return { chosen: [], totals: zeroVec(), feasible: false };
  }
  const feasible = STATS.every(k => best.totals[k] >= targets[k]);
  return { chosen: best.pieces, totals: best.totals, feasible };
}

function optimisticResidual(currentArmor, targets, augments, fragments, minorCap, majorCap, piecesLeft){
  const optimisticArmor = { ...currentArmor };
  const added = Math.max(0, piecesLeft) * 30;
  for (const k of STATS){
    optimisticArmor[k] = Math.min(ARMOR_CAP, optimisticArmor[k] + added);
  }
  const withAug = clampAddSigned(optimisticArmor, augmentsToVector(augments), 0, TOTAL_CAP);
  const withFrags = clampAddSigned(withAug, fragments, 0, TOTAL_CAP);
  const withBalanced = applyBalanced(withFrags, countBalancedRows());

  const { totals } = allocateModsCore(withBalanced, targets, minorCap, majorCap);

  for (const k of STATS){
    if (totals[k] < targets[k]) return Infinity;
  }
  let raw = 0;
  for (const k of STATS){
    raw += Math.max(0, targets[k] - currentArmor[k]) ** 2;
  }
  return raw * 1e-6;
}


// apply armor tuning
function allocateModsWithAugFrags(armorTotals, targets, augments, fragments, minorCap, majorCap){
  const baseAug = clampAddSigned(armorTotals, augmentsToVector(augments), 0, TOTAL_CAP);
  const baseFrags = clampAddSigned(baseAug, fragments, 0, TOTAL_CAP);
  const baseBalanced = applyBalanced(baseFrags, countBalancedRows());
  return allocateModsCore(baseBalanced, targets, minorCap, majorCap);
}


function allocateModsCore(startTotals, targets, minorCap, majorCap, modSlots = NUM_PIECES){
  const totals = { ...startTotals };
  const mods = [];

  const deficit = (k) => Math.max(0, targets[k] - totals[k]);

  const applyOne = (size) => {
    if (mods.length >= modSlots) return false;
    let pick = null, bestDef = 0;
    for (const k of STATS){
      const d = deficit(k);
      if (d > bestDef){ bestDef = d; pick = k; }
    }
    if (!pick) return false;
    const inc = Math.min(size, TOTAL_CAP - totals[pick]);
    if (inc <= 0) return false;

    totals[pick] += inc;
    mods.push({
      stat: pick,
      size,
      amount: inc,
      label: size === 10 ? capitalize(pick) : `Minor ${capitalize(pick)}`
    });
    return true;
  };

  for (let i = 0; i < (NUM_PIECES - minorCap); i++){
    if (!applyOne(10)) break;
  }
  for (let i = 0; i < minorCap; i++){
    if (!applyOne(5)) break;
  }

  return { totals, mods };
}

// augments vector (+5/-5)
function augmentsToVector(aug){
  const v = Object.fromEntries(STATS.map(k => [k, 0]));
  for (const row of aug){
    if (row.mode !== "general") continue; // balanced handled separately
    if (row.plus && row.plus !== "none")  v[row.plus]  += 5;
    if (row.minus && row.minus !== "none") v[row.minus] -= 5;
  }
  return v;
}

// attach each mod to one distinct piece for display (≤1 per piece)
function distributeModsToPieces(pieces, mods){
  const out = pieces.map(p => ({ ...p }));
  let i = 0;
  for (const m of mods){
    if (i >= out.length) break;
    out[i] = { ...out[i], mod: m };
    i++;
  }
  return out;
}

// ======= HELPERS =======
function zeroVec(){ return Object.fromEntries(STATS.map(k => [k, 0])); }
function clampAdd(a, b, cap){
  const out = {};
  for (const k of STATS){
    const add = (a[k] || 0) + (b[k] || 0);
    out[k] = Math.min(cap, add);
  }
  return out;
}

function addToVec(vec, key, amt){
  vec[key] = (vec[key] || 0) + amt;
}

// add with floor and ceiling
function clampAddSigned(a, b, floor, cap){
  const out = {};
  for (const k of STATS){
    const add = (a[k] || 0) + (b[k] || 0);
    out[k] = Math.max(floor, Math.min(cap, add));
  }
  return out;
}

function deficitScore(vec, tgt){
  let s = 0;
  for (const k of STATS){
    const d = Math.max(0, (tgt[k] || 0) - (vec[k] || 0));
    s += d * d;
  }
  return s;
}

function capitalize(s){ return s[0].toUpperCase() + s.slice(1); }

function countBalancedRows(){
  return state.augments.filter(r => r.mode === "balanced").length;
}

// Build a short, human-readable tuning label for display on cards
function makeTuningLabel(){
  const parts = [];
  let balancedCount = 0;

  for (const row of state.augments){
    if (row.mode === "balanced"){
      balancedCount++;
    } else {
      const plus  = row.plus  && row.plus  !== "none" ? `+5 ${capitalize(row.plus)}`   : "";
      const minus = row.minus && row.minus !== "none" ? `−5 ${capitalize(row.minus)}`  : "";
      if (plus || minus){
        parts.push([plus, minus].filter(Boolean).join(" / "));
      }
    }
  }

  if (balancedCount > 0) parts.unshift(`Balanced × ${balancedCount}`);
  return parts.length ? parts.join(" • ") : "None";
}

function buildMainTickMarks(){
  // Make (or reuse) a datalist specifically for the main target sliders
  let dl = document.getElementById("mainTicks");
  if (!dl) {
    dl = document.createElement("datalist");
    dl.id = "mainTicks";
    document.body.appendChild(dl);
  }
  dl.innerHTML = "";
  for (let v = 0; v <= SLIDER_MAX_UI; v += 5){   // ticks every 5 (visual)
    const o = document.createElement("option");
    o.value = String(v);
    dl.appendChild(o);
  }
}


// Applies +1 to the three lowest stats, once per balanced row
function applyBalanced(totals, count){
  if (!count) return totals;
  const out = { ...totals };
  for (let i = 0; i < count; i++){
    const order = [...STATS].sort((a,b)=> (out[a]||0) - (out[b]||0));
    for (let j = 0; j < 3 && j < order.length; j++){
      const k = order[j];
      out[k] = Math.min(TOTAL_CAP, (out[k]||0) + 1);
    }
  }
  return out;
}

function buildBalancedAdds(chosenPieces){
  const armorTotals = sumArmorFromPieces(chosenPieces);
  const generalVec  = augmentsToVector(state.augments);           // only ±5 rows
  const withAug     = clampAddSigned(armorTotals, generalVec, 0, TOTAL_CAP);
  const withFrags   = clampAddSigned(withAug, state.fragments, 0, TOTAL_CAP);

  const count       = countBalancedRows();
  const sim         = applyBalancedWithTrace(withFrags, count);

  const balAdds = zeroVec();
  for (const picked of sim.trace){
    for (const stat of picked){
      balAdds[stat] = (balAdds[stat] || 0) + 1;     // +1 per hit
    }
  }
  return { balAdds, trace: sim.trace };
}

// Build a chip label for a single tuning row
function tuningLabelForRow(row){
  if (!row) return "None";
  if (row.mode === "balanced") return "Balanced × 1";
  const parts = [];
  if (row.plus  && row.plus  !== "none") parts.push(`+5 ${capitalize(row.plus)}`);
  if (row.minus && row.minus !== "none") parts.push(`−5 ${capitalize(row.minus)}`);
  return parts.length ? parts.join(" / ") : "None";
}

// Assign tuning rows round-robin across *Legendary* pieces only.
// Returns an array of labels (one string per piece index).
function assignTuningLabelsToPieces(pieces){
  const labels = Array(pieces.length).fill("None");
  const legIdxs = [];
  pieces.forEach((p, i) => { if (p.type !== "Exotic") legIdxs.push(i); });
  if (legIdxs.length === 0) return labels;

  let cursor = 0;
  for (const row of state.augments){
    const lbl = tuningLabelForRow(row);
    if (lbl === "None") continue;           // skip empty rows
    const i = legIdxs[cursor % legIdxs.length];
    labels[i] = (labels[i] === "None") ? lbl : (labels[i] + " • " + lbl);
    cursor++;
  }
  return labels;
}



// Like applyBalanced, but also returns which three stats were hit on each pass
function applyBalancedWithTrace(totals, count){
  const out = { ...totals };
  const trace = []; // e.g., [ ["super","class","weapons"], ... ]
  if (!count) return { totals: out, trace };

  for (let i = 0; i < count; i++){
    const order = [...STATS].sort((a,b)=> (out[a]||0) - (out[b]||0));
    const picked = [];
    for (let j = 0; j < 3 && j < order.length; j++){
      const k = order[j];
      out[k] = Math.min(TOTAL_CAP, (out[k]||0) + 1);
      picked.push(k);
    }
    trace.push(picked);
  }
  return { totals: out, trace };
}

// Sum armor from chosen pieces (no mods/tuning)
function sumArmorFromPieces(pieces){
  let acc = zeroVec();
  for (const p of pieces){
    acc = clampAdd(acc, p.vector || zeroVec(), ARMOR_CAP);
  }
  return acc;
}

// Build a short, human-readable tuning label for display on cards
function makeTuningLabel(){
  const parts = [];
  let balancedCount = 0;

  for (const row of state.augments){
    if (row.mode === "balanced"){
      balancedCount++;
    } else {
      const plus  = row.plus  && row.plus  !== "none" ? `+5 ${capitalize(row.plus)}`   : "";
      const minus = row.minus && row.minus !== "none" ? `−5 ${capitalize(row.minus)}`  : "";
      if (plus || minus){
        parts.push([plus, minus].filter(Boolean).join(" / "));
      }
    }
  }

  if (balancedCount > 0) parts.unshift(`Balanced × ${balancedCount}`);
  return parts.length ? parts.join(" • ") : "None";
}
// Human label for a single tuning row
function tuningRowLabel(row){
  if (!row) return "";
  if (row.mode === "balanced") return "Balanced × 1";
  const parts = [];
  if (row.plus && row.plus !== "none")  parts.push(`+5 ${capitalize(row.plus)}`);
  if (row.minus && row.minus !== "none") parts.push(`−5 ${capitalize(row.minus)}`);
  return parts.join(" / ") || "None";
}

// Build a single-line label for all tuning rows (for summary)
function makeTuningLabelAllRows(){
  const labels = [];
  for (const r of state.augments){
    if (r.mode === "balanced" || (r.plus && r.plus !== "none") || (r.minus && r.minus !== "none")){
      labels.push(tuningRowLabel(r));
    }
  }
  return labels.length ? labels.join(" • ") : "None";
}

// Assign each tuning row to ONE Legendary piece (in order).
// Returns an array same length as chosen with per-piece {adds, label}
function assignTuningToPieces(chosen){
  const perPiece = chosen.map(() => ({ adds: zeroVec(), label: "None" }));

  // indices of Legendary pieces, in display order
  const legIdxs = [];
  chosen.forEach((p, i) => { if (p.type === "Legendary") legIdxs.push(i); });

  let cursor = 0; // which Legendary gets the next tuning row

  for (const row of state.augments){
    // skip no-op rows
    const isBalanced = row.mode === "balanced";
    const hasGeneral = row.mode === "general" && (
      (row.plus && row.plus !== "none") || (row.minus && row.minus !== "none")
    );
    if (!isBalanced && !hasGeneral) continue;
    if (cursor >= legIdxs.length) break;        // no more legendaries to attach to

    const iPiece = legIdxs[cursor++];
    const piece = chosen[iPiece];
    const slot = perPiece[iPiece];

    // Start with zero vector and fill the adds for this row
    const adds = slot.adds;

    if (isBalanced){
      // compute +1 to the three lowest stats of THIS piece's base vector
      const order = [...STATS].sort((a,b)=>(piece.vector[a]||0) - (piece.vector[b]||0));
      for (let j=0; j<3 && j<order.length; j++){
        adds[order[j]] = (adds[order[j]] || 0) + 1;
      }
      slot.label = tuningRowLabel({mode:"balanced"});
    } else {
      if (row.plus && row.plus !== "none")  adds[row.plus]  = (adds[row.plus]  || 0) + 5;
      if (row.minus && row.minus !== "none") adds[row.minus] = (adds[row.minus] || 0) - 5;
      slot.label = tuningRowLabel(row);
    }
  }

  return perPiece;
}


function buildTuningSummaryCard(chosenPieces){
  const card = document.createElement("div");
  card.className = "card";

  const top = document.createElement("div");
  top.className = "top";
  const title = document.createElement("div");
  title.textContent = "Tuning Applied";
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = "applied globally before mods";
  top.appendChild(title);
  top.appendChild(badge);
  card.appendChild(top);

  // --- Reconstruct pre-balanced baseline exactly like the solver ---
  // 1) raw armor from chosen pieces
  const armorTotals = sumArmorFromPieces(chosenPieces);
  // 2) apply general ±5 rows only
  const generalVec = augmentsToVector(state.augments);
  const withAug = clampAddSigned(armorTotals, generalVec, 0, TOTAL_CAP);
  // 3) apply fragments
  const withFrags = clampAddSigned(withAug, state.fragments, 0, TOTAL_CAP);
  // 4) simulate balanced rows sequentially and capture the three stats per pass
  const balancedCount = countBalancedRows();
  const balSim = applyBalancedWithTrace(withFrags, balancedCount);

  // We need to map each "balanced" row (in the user's 4 rows) to the next entry in the trace.
  let balIdx = 0;

  // --- Per-row printout matching the user's selections ---
  state.augments.forEach((row, idx) => {
    const line = document.createElement("div");
    line.className = "modsLine";

    const label = document.createElement("span");
    label.className = "label-chip";
    label.textContent = `Slot ${idx+1}:`;
    line.appendChild(label);

    if (row.mode === "balanced"){
      // Show exactly which three stats were hit on THIS pass
      const picked = balSim.trace[balIdx] || [];
      balIdx++;

      const chip = document.createElement("span");
      chip.className = "statpill";
      if (picked.length === 3){
        chip.textContent = `Balanced → +1 ${capitalize(picked[0])}, +1 ${capitalize(picked[1])}, +1 ${capitalize(picked[2])}`;
      } else if (picked.length > 0){
        // Edge case: fewer than 3 stats available (shouldn't really happen)
        chip.textContent = `Balanced → ` + picked.map(s => `+1 ${capitalize(s)}`).join(", ");
      } else {
        chip.textContent = "Balanced (no eligible stats?)";
      }
      line.appendChild(chip);
    } else {
      // General ±5 row
      const plus = document.createElement("span");
      plus.className = "statpill";
      plus.textContent = row.plus !== "none" ? `+5 ${capitalize(row.plus)}` : "—";

      const minus = document.createElement("span");
      minus.className = "statpill";
      minus.textContent = row.minus !== "none" ? `−5 ${capitalize(row.minus)}` : "—";

      line.appendChild(plus);
      line.appendChild(minus);
    }

    card.appendChild(line);
  });

  // --- Net effect summary ---
  const totalsLine = document.createElement("div");
  totalsLine.className = "modsLine";

  const totalsLabel = document.createElement("span");
  totalsLabel.className = "label-chip";
  totalsLabel.textContent = "Net:";
  totalsLine.appendChild(totalsLabel);

  // General ±5 net
  STATS.forEach(k => {
    const v = generalVec[k] || 0;
    if (v !== 0){
      const pill = document.createElement("span");
      pill.className = "statpill";
      pill.textContent = (v > 0 ? `+${v}` : `${v}`) + ` ${capitalize(k)}`;
      totalsLine.appendChild(pill);
    }
  });

  // Balanced total count (already detailed per-row above)
  if (balancedCount > 0){
    const bal = document.createElement("span");
    bal.className = "statpill";
    bal.textContent = `Balanced × ${balancedCount}`;
    totalsLine.appendChild(bal);
  }

  card.appendChild(totalsLine);
  return card;
}


// ======= BARS / UI =======
// Bars that visualize base vs per-piece tuning+mods (no fragments)
// Blue = remaining base after penalties consume some base
// Green = positive adds from tuning/mods
// Red   = penalties from tuning/mods (drawn on top of the right end of the base)
function makeBarsWithAdjustments(baseVec, addsVec, perPieceMax = PER_PIECE_MAX){
  const wrap = document.createElement("div");
  wrap.className = "bars";

  // quick helper to style bars consistently
  const mk = (w, bg, extra={}) => {
    const d = document.createElement("div");
    d.style.width = Math.max(0, Math.min(100, w)) + "%";
    d.style.background = bg;
    d.style.borderRadius = "6px";
    d.style.height = "8px";
    Object.assign(d.style, extra);
    return d;
  };

  let totalFinal = 0;

  for (const k of STATS){
    const row = document.createElement("div"); row.className = "barRow";

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

    const base   = Math.max(0, baseVec[k] || 0);
    const adds   = Number(addsVec[k] || 0);
    const posAdd = Math.max(0, adds);
    const negAbs = Math.max(0, -adds);

    // amount of base eaten by negative tuning/mods
    const baseEaten = Math.min(base, negAbs);

    // what remains blue, what becomes red, what is green
    const blueVal  = Math.max(0, base - baseEaten);
    const redVal   = baseEaten;
    const greenVal = Math.max(0, posAdd);

    // final number to show
    const finalVal = Math.max(0, Math.min(perPieceMax, blueVal + greenVal));
    totalFinal += finalVal;

    // percentages for the track
    const bluePct  = (blueVal  / perPieceMax) * 100;
    const greenPct = (greenVal / perPieceMax) * 100;
    const redPct   = (redVal   / perPieceMax) * 100;

    // colors (match your theme)
    const BLUE  = "var(--accent, #3b82f6)";
    const GREEN = "#22c55e";
    const RED   = "#ef4444";

    // build bars: blue then green (side-by-side)
    inner.appendChild(mk(bluePct, BLUE));
    inner.appendChild(mk(greenPct, GREEN));

    // red overlay sits at the end of the blue portion
    const negBar = mk(redPct, RED, {
      position: "absolute",
      left: bluePct + "%",   // start where blue ends
      top: "0", bottom: "0",
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
  const tRow = document.createElement("div"); tRow.className = "barRow";
  const tLab = document.createElement("div"); tLab.className = "barLabel"; tLab.textContent = "Total";
  const tTrack = document.createElement("div"); tTrack.className = "track";

  const tFill = document.createElement("div");
  tFill.className = "fill";
  tFill.style.width = Math.min(100, (totalFinal/(perPieceMax*3))*100) + "%";
  tTrack.appendChild(tFill);

  const tVal = document.createElement("div"); tVal.className = "barVal"; tVal.textContent = String(totalFinal);
  tRow.appendChild(tLab); tRow.appendChild(tTrack); tRow.appendChild(tVal); wrap.appendChild(tRow);

  return wrap;
}



// ======= INPUT CHECK =======
function checkInputs(targets){
  for (const k of STATS){
    if (targets[k] < 0 || targets[k] > SLIDER_MAX_UI){
      return { ok:false, msg:`Target for ${capitalize(k)} must be between 0 and ${SLIDER_MAX_UI}.` };
    }
  }
  const minors = state.minorModsCap;
  const majors = NUM_PIECES - minors;
  return { ok:true, msg:`Stats you should probably target.` };
}

// ======= RENDER =======
function render(){
  // ensure custom exotic panel reflects latest toggle/values
  updateCustomExoticUI();

  const feas = checkInputs(state.targets);
  feasBox.textContent = feas.msg;
  feasBox.classList.toggle("bad", !feas.ok);

  summaryRoot.innerHTML = "";
  piecesRoot.innerHTML = "";
  totalsRoot.innerHTML = "";
  if (!feas.ok) return;

  const { chosen, totals, feasible } = recommendPieces(state.targets, state.minorModsCap);

  if (!feasible){
    feasBox.textContent = "No possible combination with exactly 1 Exotic and 4 Legendaries (even with augments/fragments/mods).";
    feasBox.classList.add("bad");
    return;
  }

  // Assign tuning to *Legendary* pieces (adds + label per piece)
  const perPieceTuning = assignTuningToPieces(chosen);

  // --- Summary by group ---
  const perGroup = new Map();
  chosen.forEach((c, idx) => {
    const key = `${c.setName} (${c.type})`;
    if (!perGroup.has(key)) perGroup.set(key, { total: 0, tert: new Map(), mods: new Map(), tunings: [] });
    const g = perGroup.get(key);
    g.total += 1;
    g.tert.set(c.tertiary ?? "—", (g.tert.get(c.tertiary ?? "—") || 0) + 1);

    if (c.mod){
      const label = c.mod.size === 5 ? `Minor ${capitalize(c.mod.stat)}` : `${capitalize(c.mod.stat)}`;
      g.mods.set(label, (g.mods.get(label) || 0) + 1);
    }

    // per-piece tuning label (from assignment above)
    g.tunings.push(perPieceTuning[idx]?.label || "None");
  });

  // Render Summary cards
  for (const [groupName, info] of perGroup.entries()){
    const card = document.createElement("div"); card.className = "card";

    const top = document.createElement("div"); top.className = "top";
    const title = document.createElement("div"); title.textContent = `${groupName} × ${info.total}`;
    top.appendChild(title); card.appendChild(top);

    // tertiaries
    const tline = document.createElement("div"); tline.className = "tertsLine";
    const tlabel = document.createElement("span"); tlabel.className = "label-chip"; tlabel.textContent = "Tertiaries:";
    tline.appendChild(tlabel);
    for (const [tert, n] of info.tert.entries()){
      const pill = document.createElement("span"); pill.className = "statpill";
      pill.textContent = `${capitalize(String(tert))} × ${n}`;
      tline.appendChild(pill);
    }
    card.appendChild(tline);

    // mods
    if (info.mods.size > 0){
      const mline = document.createElement("div"); mline.className = "modsLine";
      const mlabel = document.createElement("span"); mlabel.className = "label-chip"; mlabel.textContent = "Mods:";
      mline.appendChild(mlabel);
      for (const [modLabel, n] of info.mods.entries()){
        const pill = document.createElement("span"); pill.className = "statpill";
        pill.textContent = `${modLabel} × ${n}`;
        mline.appendChild(pill);
      }
      card.appendChild(mline);
    }

    // tuning chips — one per piece in this group
    const tuneLine = document.createElement("div"); tuneLine.className = "modsLine";
    const tuneLabel = document.createElement("span"); tuneLabel.className = "label-chip"; tuneLabel.textContent = "Tuning:";
    tuneLine.appendChild(tuneLabel);
    info.tunings.forEach(lbl => {
      const pill = document.createElement("span"); pill.className = "statpill";
      pill.textContent = lbl === "None" ? "—" : lbl;
      tuneLine.appendChild(pill);
    });
    card.appendChild(tuneLine);

    summaryRoot.appendChild(card);
  }

  // --- Per-piece details ---
  chosen.forEach((c, idx) => {
    const card = document.createElement("div"); card.className = "card";

    const top = document.createElement("div"); top.className = "top";
    const title = document.createElement("div"); title.textContent = `#${idx+1} — ${c.setName} (${c.type})`;
    top.appendChild(title); card.appendChild(top);

    const tertLine = document.createElement("div"); tertLine.className = "tertsLine";
    const chip = document.createElement("span"); chip.className = "label-chip";
    chip.textContent = `Tertiary: ${c.tertiary ? capitalize(c.tertiary) : "—"}`;
    tertLine.appendChild(chip); 
    card.appendChild(tertLine);

    if (c.mod){
      const modLine = document.createElement("div"); modLine.className = "modsLine";
      const mlabel = document.createElement("span"); mlabel.className = "label-chip"; mlabel.textContent = "Mod:";
      const modPill = document.createElement("span"); modPill.className = "statpill"; modPill.textContent = c.mod.label;
      modLine.appendChild(mlabel); modLine.appendChild(modPill); card.appendChild(modLine);
    }

    // Piece-specific tuning label
    const tuningLine = document.createElement("div"); tuningLine.className = "modsLine";
    const tuningLabel = document.createElement("span"); tuningLabel.className = "label-chip"; tuningLabel.textContent = "Tuning:";
    const tuningChip = document.createElement("span"); tuningChip.className = "statpill";
    tuningChip.textContent = perPieceTuning[idx]?.label || "None";
    tuningLine.appendChild(tuningLabel); tuningLine.appendChild(tuningChip);
    card.appendChild(tuningLine);

    // Build adds (tuning + mod) for the overlay visualization
    const adds = { ...perPieceTuning[idx]?.adds };     // tuning adds/penalties
    if (c.mod){                                        // add this piece's mod
      addToVec(adds, c.mod.stat, c.mod.amount);
    }

    // Visualize base vs adds using the new function
    card.appendChild(makeBarsWithAdjustments(c.vector, adds, PER_PIECE_MAX));
    piecesRoot.appendChild(card);
  });

  // --- Global Tuning Summary card
  piecesRoot.appendChild(buildTuningSummaryCard(chosen));

  // --- Totals vs Target ---
  const totalsCard = document.createElement("div"); totalsCard.className = "card";
  const top2 = document.createElement("div"); top2.className = "top";
  const title2 = document.createElement("div"); title2.textContent = "Totals Achieved";
  const minors = state.minorModsCap;
  const majors = NUM_PIECES - minors;
  const badge2 = document.createElement("span"); badge2.className = "badge";
  const customNote = state.customExoticEnabled ? " • custom exotic" : "";
  badge2.textContent = `armor cap 150 • final cap ${TOTAL_CAP} • majors ≤ ${majors} • minors ≤ ${minors} • augments + fragments applied${customNote}`;
  top2.appendChild(title2); top2.appendChild(badge2); totalsCard.appendChild(top2);

  const totalsPills = document.createElement("div"); totalsPills.className = "stats";
  for (const k of STATS){
    const pill = document.createElement("span"); pill.className = "statpill";
    pill.textContent = `${k}: ${totals[k]} / ${state.targets[k]} (≥)`;
    totalsPills.appendChild(pill);
  }
  totalsCard.appendChild(totalsPills);
  totalsRoot.appendChild(totalsCard);
}

// ======= INIT / EVENTS =======
minorModsSelect.addEventListener("change", (e)=>{
  state.minorModsCap = Math.max(0, Math.min(5, Number(e.target.value)||0));
  render();
});

buildTickMarks();
buildSliders();
buildAugmentationUI();
buildFragmentsUI();     
createCustomExoticUI();    
render();
