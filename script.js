// ======= STATS / LIMITS =======
const STATS = ["health","melee","grenade","super","class","weapons"];
const SLIDER_MAX_UI = 200; // UI range
const ARMOR_CAP = 150;     // armor (pieces) cap per stat
const TOTAL_CAP = 200;     // final totals cap per stat (armor + mods + fragments + augments)
const NUM_PIECES = 5;
const FRAG_RANGE = 30;     // ±30 per stat

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
    { plus: "none", minus: "none" },
    { plus: "none", minus: "none" },
    { plus: "none", minus: "none" },
    { plus: "none", minus: "none" },
  ],
  customExoticEnabled: false,
  customExotic: Object.fromEntries(STATS.map(k => [k, 0])) // sliders 0..45
};

// ======= TICK MARKS =======
function buildTickMarks(){
  if (ticks){
    ticks.innerHTML = "";
    for (let v = 0; v <= SLIDER_MAX_UI; v += 5){
      const o = document.createElement("option");
      o.value = String(v);
      ticks.appendChild(o);
    }
  }
  if (fragTicks){
    fragTicks.innerHTML = "";
    for (let v = -FRAG_RANGE; v <= FRAG_RANGE; v += 5){
      const o = document.createElement("option");
      o.value = String(v);
      fragTicks.appendChild(o);
    }
  }
}
function round5(n){ return Math.round(n/5)*5; }

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
  input.step = "5";
  input.dataset.key = statKey;
  input.setAttribute("list","ticks");

  const valWrap = document.createElement("div");
  valWrap.className = "valueWrap";
  const valInput = document.createElement("input");
  valInput.className = "valueInput";
  valInput.type = "number";
  valInput.min = "0";
  valInput.max = String(SLIDER_MAX_UI);
  valInput.step = "5";
  valInput.value = String(value);

  const slashMax = document.createElement("div");
  slashMax.className = "valueMax";
  slashMax.textContent = `/ ${SLIDER_MAX_UI}`;

  function setTargetSafe(v){
    let n = round5(Math.max(0, Math.min(SLIDER_MAX_UI, Number(v) || 0)));
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

  // Only commit when released; show tooltip while dragging
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
    hint.textContent = "Optional T5 Tuning Mod.";
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
    row.style.gridTemplateColumns = "90px 1fr 90px 1fr";
    row.style.gap = "10px";
    row.style.alignItems = "center";
    row.style.marginBottom = "10px";

    const plusLabel = document.createElement("div");
    plusLabel.className = "label";
    plusLabel.textContent = `Row ${i+1} +5`;
    const plusSel = makeStatSelect(state.augments[i].plus, (val)=>{
      state.augments[i].plus = val; render();
    });

    const minusLabel = document.createElement("div");
    minusLabel.className = "label";
    minusLabel.textContent = `Row ${i+1} −5`;
    const minusSel = makeStatSelect(state.augments[i].minus, (val)=>{
      state.augments[i].minus = val; render();
    });

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
  input.step = "5";
  input.dataset.key = statKey;
  input.setAttribute("list","fragTicks");

  const valWrap = document.createElement("div");
  valWrap.className = "valueWrap";
  const valInput = document.createElement("input");
  valInput.className = "valueInput";
  valInput.type = "number";
  valInput.min = String(-FRAG_RANGE);
  valInput.max = String(FRAG_RANGE);
  valInput.step = "5";
  valInput.value = String(value);

  const slashMax = document.createElement("div");
  slashMax.className = "valueMax";
  slashMax.textContent = `/ ±${FRAG_RANGE}`;

  function setFragSafe(v){
    let n = round5(Math.max(-FRAG_RANGE, Math.min(FRAG_RANGE, Number(v) || 0)));
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

  buildCustomExoticUI(); // mount the override UI right after fragments
}

// ======= CUSTOM EXOTIC (override) =======
function buildCustomExoticUI(){
  let panel = document.getElementById("customExoPanel");
  if (!panel){
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
    cb.checked = state.customExoticEnabled;
    cb.addEventListener("change", (e)=>{
      state.customExoticEnabled = e.target.checked;
      render(); // show/hide sliders immediately
    });

    const txt = document.createElement("span");
    txt.className = "subtle";
    txt.textContent = "Used for Exotic Class Items or old Exotics.";

    togg.appendChild(cb); togg.appendChild(txt);
    panel.appendChild(togg);

    const wrap = document.createElement("div");
    wrap.id = "customExoWrap";
    panel.appendChild(wrap);

    const fragsPanel = document.getElementById("fragsPanel");
    fragsPanel.after(panel);
  }

  const wrap = document.getElementById("customExoWrap");
  wrap.innerHTML = "";
  wrap.style.display = state.customExoticEnabled ? "grid" : "none";
  wrap.style.gap = "10px";

  if (state.customExoticEnabled){
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
      range.type = "range";
      range.min = "0";
      range.max = "45";
      range.step = "1";
      range.value = String(state.customExotic?.[k] ?? 0);

      const val = document.createElement("input");
      val.type = "number";
      val.min = "0";
      val.max = "45";
      val.step = "1";
      val.className = "valueInput";
      val.value = String(state.customExotic?.[k] ?? 0);

      function setVal(n){
        const v = Math.max(0, Math.min(45, Number(n) || 0));
        state.customExotic[k] = v;
        range.value = String(v);
        val.value = String(v);
        render();
      }

      // Build DOM first
      row.appendChild(lab);
      row.appendChild(range);
      row.appendChild(val);

      // Commit on release + tooltip
      attachRangeWithTooltip(range, (v)=> setVal(v));

      wrap.appendChild(row);
    });
  }
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
  const withAug = clampAddSigned(optimisticArmor, augmentsToVector(state.augments), 0, TOTAL_CAP);
  const withFrags = clampAddSigned(withAug, state.fragments, 0, TOTAL_CAP);
  const { totals } = allocateModsCore(withFrags, targets, minorCap, majorCap);

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
  const base = clampAddSigned(baseAug, fragments, 0, TOTAL_CAP);
  return allocateModsCore(base, targets, minorCap, majorCap);
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

// ======= BARS / UI =======
function makeBars(vec, perPieceMax=40){
  const wrap = document.createElement("div");
  wrap.className = "bars";
  let total = 0;
  for (const k of STATS){
    const row = document.createElement("div"); row.className = "barRow";
    const lab = document.createElement("div"); lab.className = "barLabel"; lab.textContent = capitalize(k);
    const track = document.createElement("div"); track.className = "track";
    const fill = document.createElement("div"); fill.className = "fill";
    const v = vec[k] || 0;
    const pct = Math.max(0, Math.min(100, (v / perPieceMax) * 100));
    fill.style.width = pct + "%";
    track.appendChild(fill);
    const val = document.createElement("div"); val.className = "barVal"; val.textContent = `+${v}`;
    row.appendChild(lab); row.appendChild(track); row.appendChild(val); wrap.appendChild(row);
    total += v;
  }
  const tRow = document.createElement("div"); tRow.className = "barRow";
  const tLab = document.createElement("div"); tLab.className = "barLabel"; tLab.textContent = "Total";
  const tTrack = document.createElement("div"); tTrack.className = "track";
  const tFill = document.createElement("div"); tFill.className = "fill";
  tFill.style.width = Math.min(100, (total/(perPieceMax*3))*100) + "%";
  tTrack.appendChild(tFill);
  const tVal = document.createElement("div"); tVal.className = "barVal"; tVal.textContent = total.toString();
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
  buildCustomExoticUI();

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

  // --- Summary ---
  const perGroup = new Map();
  for (const c of chosen){
    const key = `${c.setName} (${c.type})`;
    if (!perGroup.has(key)) perGroup.set(key, { total: 0, tert: new Map(), mods: new Map() });
    const g = perGroup.get(key);
    g.total += 1;
    g.tert.set(c.tertiary ?? "—", (g.tert.get(c.tertiary ?? "—") || 0) + 1);
    if (c.mod){
      const label = c.mod.size === 5 ? `Minor ${capitalize(c.mod.stat)}` : `${capitalize(c.mod.stat)}`;
      g.mods.set(label, (g.mods.get(label) || 0) + 1);
    }
  }

  for (const [groupName, info] of perGroup.entries()){
    const card = document.createElement("div"); card.className = "card";

    const top = document.createElement("div"); top.className = "top";
    const title = document.createElement("div"); title.textContent = `${groupName} × ${info.total}`;
    top.appendChild(title); card.appendChild(top);

    const tline = document.createElement("div"); tline.className = "tertsLine";
    const tlabel = document.createElement("span"); tlabel.className = "label-chip"; tlabel.textContent = "Tertiaries:";
    tline.appendChild(tlabel);
    for (const [tert, n] of info.tert.entries()){
      const pill = document.createElement("span"); pill.className = "statpill";
      pill.textContent = `${capitalize(String(tert))} × ${n}`;
      tline.appendChild(pill);
    }
    card.appendChild(tline);

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
    tertLine.appendChild(chip); card.appendChild(tertLine);

    if (c.mod){
      const modLine = document.createElement("div"); modLine.className = "modsLine";
      const mlabel = document.createElement("span"); mlabel.className = "label-chip"; mlabel.textContent = "Mod:";
      const modPill = document.createElement("span"); modPill.className = "statpill"; modPill.textContent = c.mod.label;
      modLine.appendChild(mlabel); modLine.appendChild(modPill); card.appendChild(modLine);
    }

    const dispVec = c.mod ? clampAdd(c.vector, { [c.mod.stat]: c.mod.amount }, TOTAL_CAP) : c.vector;
    card.appendChild(makeBars(dispVec, 40));
    piecesRoot.appendChild(card);
  });

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
render();
