// ── ANIMATION (live only, never exported) ──────────────────────────────────
// Motions combine freely:
//  draw   lines draw themselves in (op-prefix replay), hold, fade, repeat
//  drift  nodes wander on slow Lissajous paths around where you put them;
//         the pattern is re-recorded live (renderers take ≤15 ms)
//  morph  every few seconds a new seed crossfades (and draws on, with draw)
//  spin   turns the design
//  pulse  line width and brightness breathe
//  hue    colour cycle (CSS hue-rotate on the canvas: free)
// Nothing here touches S except zoom/pan in ambient mode (restored on exit).
// Used by: draw()/renderDesign (ANIM.frame), the Animate controls, Ambient.
const ANIM = {
  playing: false, ambient: false, live: false, frame: null,
  opts: { draw: true, drift: true, glitch: false, flow: false, dewroll: true, blink: false, wind: false, bloom: false, rings: false, current: false, twinkle: false, strikes: false, life: false, sun: false, ripples: false, rpDrip: false, breathe: false, petals: false, seasons: false, morph: false, spin: false, pulse: false, hue: false, speed: 1, driftAmt: 1, glyphP: 3.5, dewSpd: 1, curSpd: 1, curRate: 1, twRate: 1, shoot: 1, skRate: 1, skSpd: 1, lfSpd: 1, sunSpd: 1, rpSpd: 1, brSpd: 1, ptRate: 1, ssSpd: 1, spSpd: 1 },
  opts2: {},                      // Layer 2's own values for the per-layer options (ANIM_L_KEYS); a key missing here follows opts (Both)
  scope: 'both',                  // which layer(s) the per-layer controls edit: 'both' | 'l1' | 'l2' (not saved)
  clk2: { tw: 0, lf: 0, sun: 0, rp: 0, br: 0 }, brAmp2: 0,   // Layer 2's effect clocks and Breathing fade (Layer 1's are the fields above)
  frozen: false, frozenKey: '',   // paused: the last frame stays on screen until the design changes
  exporting: false,               // rendering the paused frame for an export (no blit cache)
  twTime: 0,                      // Twinkle clock (animation time × twinkle rate)
  lfTime: 0,                      // Life clock (animation time × life speed)
  sunTime: 0,                     // Sunlight clock (animation time × sun speed)
  rpTime: 0,                      // Ripples clock (animation time × ripple speed), 0 at every fresh start
  spTime: 0,                      // Spin clock (animation time × spin speed)
  ssTime: 0,                      // Seasons clock (animation time × season speed; restarts at Play)
  brTime: 0, brAmp: 0,            // Breathing clock (× breath speed) and its fade in/out (0–1, BR_FADE s)
  dewTime: 0,                     // rolling dew clock (animation time × dew speed)
  blinkTime: 0,                   // blink clock: real seconds while playing (not scaled by Speed)
  pointer: null, gazeTarget: null, gaze: null,   // Blink: pointer over the canvas (fractions), in page coordinates, smoothed
  fpsN: 0, fpsAt: 0, fpsLow: 0, fpsOk: 0, tipsOff: false,   // frame rate per second; tips after 2 s under FPS_LOW
  time: 0, last: 0, raf: 0,
  keyRecAt: 0, keyMs: 0, keyMeasure: 0, keyWorst: 0,   // design-change re-records: when, their smoothed cost (ms), frames left to measure; see animTick
  cur: null, curKey: '', prev: null, fadeAt: 0, fadeDur: 1, prevKey: false, prevMorph: false, keyAt: 0, seedOff: 0, cycleAt: 0, nextMorph: 0, recAt: 0,
  snapshot: null, uiTimer: 0,
  trail: [], curBase: null, prevBase: null, recMs: 0,
  dw: []   // per-node drift weight: 0 while dragged, eases back to 1 after
  , recEMA: 0, recMode: '',   // how long a recording takes (ms, smoothed) for the current mode
  res: 1, frameEMA: 0, resAt: 0, resTry: null, resFloor: 0  // render scale while playing, smoothed real frame interval; last drop being judged; lowest scale that still helped
  , drawHeavy: false, warpSlow: 0, warpWarm: 0  // bent (warp) frames take too long to draw: drift uses keyframes
  , symKey: ''   // symmetry settings last seen by animStep: a change judges live drift afresh (driftRetry)
  , driftNote: ''   // text of the panel note that says Drift fell back to keyframes (driftNoteUpdate)
  , clock: null, hueFilter: '', hueK: 1   // fixed time (ms) while a loop video renders (animNow); Colour cycle's CSS filter for this frame and its rate factor (loop video)
};
// The animation's own clock: real time, or the frame time while a loop video
// renders, so every measured cost is 0 there and no slow-device fallback starts
function animNow() { return ANIM.clock != null ? ANIM.clock : performance.now(); }
// Drift on a jumpy mode bends every recording point by point, per symmetry
// copy, every frame. A dense design (foam at density 7, 8-fold mirrored = 16
// copies) took ~250 ms+ per frame that way, while recording it took ~35 ms, so
// the recording-based checks never noticed. When two bent frames in a row
// take over WARP_DRAW_MAX ms to draw (or one over twice that), drift switches
// to keyframes that are rasterised once and blitted (as ANIM.heavy does).
const WARP_DRAW_MAX = 45;
const WARP_WARM = 4;   // frames at the start of a run, and after a design change, left out of that measurement
// Adaptive cost (phones): a smooth mode whose recordings take over REC_SLOW ms
// is bent between recordings like the jumpy modes; over REC_HEAVY ms, drift
// takes rare keyframes instead of re-routing live (a recording blocks a frame)
const REC_SLOW = 18, REC_HEAVY = 70;
// Render scale while playing: drops when frames come slower than RES_LOW ms
// apart (fill-rate bound on HiDPI phones), comes back below RES_HIGH ms
const RES_LOW = 40, RES_HIGH = 22, RES_MIN = 0.5, RES_GAIN = 0.88;   // ms per frame: lower / raise resolution; lowest scale; a drop must cut frame time to 88% to stay
const ANIM_DRAW = 4, ANIM_HOLD = 3, ANIM_MORPH = 9, ANIM_XFADE = 1.6;
// Draw on, looping (no Morph, no Flow): per node. Each node's part draws out
// from it (NODE_DRAW s), holds, draws back into the node, rests, and again.
// The order is random: the nodes start in a shuffled order, and every phase
// of every cycle takes its own time (NODE_VAR: × min–max of the base), so the
// nodes drift apart and the sequence never settles into a round. A node only
// draws back while another node is fully drawn (holding), so the picture is
// never empty (with 2+ nodes). nodeDrawStep keeps the state (ANIM.nd).
const NODE_DRAW = 3, NODE_HOLD = 2.5, NODE_BACK = 2.5, NODE_REST = 0.5;
const NODE_VAR = { draw: [0.6, 1.5], hold: [0.2, 3], back: [0.6, 1.5], rest: [0.4, 6] };
const NODE_PH = ['draw', 'hold', 'back', 'rest'], NODE_BASE = { draw: NODE_DRAW, hold: NODE_HOLD, back: NODE_BACK, rest: NODE_REST };
const nodeDur = ph => NODE_BASE[ph] * (NODE_VAR[ph][0] + Math.random() * (NODE_VAR[ph][1] - NODE_VAR[ph][0]));
// Progress per node (0–1) at draw-on time ct. Restarts (new shuffle) when
// the loop restarts (cycleAt), the node count changes or time runs back.
function nodeDrawStep(n, ct) {
  let D = ANIM.nd;
  if (!D || D.at !== ANIM.cycleAt || D.n !== n || ct < D.ct) {
    const cyc = NODE_DRAW + NODE_HOLD + NODE_BACK + NODE_REST, st = cyc / Math.max(1, n);
    const order = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const N = new Array(n);
    // the first starts at once, the others staggered (each gap 0.5–1.5 × cycle / n)
    let w = 0;
    order.forEach((i, k) => { if (k) w += st * (0.5 + Math.random()); N[i] = { ph: 'wait', e: 0, d: w }; });
    D = ANIM.nd = { at: ANIM.cycleAt, n, ct: 0, N };
  }
  let dt = Math.max(0, ct - D.ct);
  D.ct = ct;
  const N = D.N;
  let holding = N.filter(q => q.ph === 'hold').length;
  for (let guard = 0; dt > 0 && guard < 1000; guard++) {
    // advance to the next phase end (all nodes), so long frames stay in order
    let step = dt;
    N.forEach(q => { if (!(q.ph === 'hold' && q.stuck)) step = Math.min(step, Math.max(0, q.d - q.e)); });
    step = Math.max(step, 1e-6);
    N.forEach(q => { q.e += step; });
    dt -= step;
    N.forEach(q => {
      if (q.e < q.d - 1e-9) return;
      if (q.ph === 'hold' && n > 1 && holding <= 1) { q.stuck = true; return; }   // the last one fully drawn waits
      if (q.ph === 'hold') holding--;
      q.stuck = false;
      const ph = q.ph === 'wait' ? 'draw' : NODE_PH[(NODE_PH.indexOf(q.ph) + 1) % 4];
      if (ph === 'hold') holding++;
      q.ph = ph; q.e = 0; q.d = nodeDur(ph);
    });
    // a stuck node goes as soon as another is holding again
    N.forEach(q => { if (q.stuck && holding > 1) { q.stuck = false; q.ph = 'back'; q.e = 0; q.d = nodeDur('back'); holding--; } });
    if (N.every(q => q.ph === 'hold' && q.stuck)) break;
  }
  const ease = u => u * u * (3 - 2 * u), np = new Float64Array(n);
  N.forEach((q, i) => {
    const u = Math.min(1, q.e / q.d);
    np[i] = q.ph === 'draw' ? ease(u) : q.ph === 'hold' ? 1 : q.ph === 'back' ? 1 - ease(u) : 0;
  });
  return np;
}
// Keyframe crossfade: old 1 − e, new e (straight sum). Measured on PCB/foam
// Flow: a 1.6 overlap made the brightness pulse ~11× more than this.
const XF_K = 1;
// Modes whose layout jumps when a node moves a little (PCB re-routes, foam
// re-packs): drift doesn't redraw every frame for these, it takes a new
// keyframe every DRIFT_KEY seconds and crossfades to it over DRIFT_XFADE
const DRIFT_JUMPY = ['pcb', 'foam', 'lightning', 'vine'], DRIFT_KEY = 7, DRIFT_XFADE = 3.5;
// Jumpy modes whose re-routing reads as noise rather than life (Vines: shoots,
// leaves and flowers would jump about): Drift records them once and only bends
// that recording with the nodes, so the plant sways instead of regrowing
const DRIFT_BEND = ['vine'];
const WIND_MODES = ['vine', 'spiderweb'];   // modes the Wind option bends
function driftBendOnly() {
  const js = [S.mode, S.layer && S.layer.mode].filter(m => DRIFT_JUMPY.includes(m));
  return js.length > 0 && js.every(m => DRIFT_BEND.includes(m));
}
// Slow smooth modes: a keyframe every recording-ms × SLOW_KEY_K seconds
// (a 60 ms recording → 1.8 s), within these bounds; each crossfades over the whole gap
const SLOW_KEY_K = 0.03, SLOW_KEY_MIN = 1.6, SLOW_KEY_MAX = 5;
// Drift on a jumpy mode re-routes live like dragging: a fresh recording every
// DRIFT_REC ms, bent along with the nodes in between; older recordings fade
// out over DRIFT_TRAIL s so the re-routing shimmers instead of flickering
// The interval stretches with how long a recording takes (PCB ~40 ms → ~5×/s),
// and the trail with it (~2.5 recordings deep).
const DRIFT_REC = 83, DRIFT_TRAIL = 2.5;
// Flow: jumpy modes take a keyframe every FLOW_KEY s and crossfade over the
// whole interval (always dissolving); a morph fades the new seed in over FLOW_MORPH
const FLOW_KEY = 3.2, FLOW_MORPH = 5;
// Live drift re-records come at least DRIFT_REC ms apart, stretched to
// DRIFT_REC_K × the smoothed recording time, at most DRIFT_REC_MAX ms
const DRIFT_REC_K = 5, DRIFT_REC_MAX = 400;
function driftRecGap() { return Math.max(DRIFT_REC, Math.min(DRIFT_REC_MAX, ANIM.recMs * DRIFT_REC_K)); }
const TRAIL_ALPHA = 0.55;       // older drift recordings start this faint and fade out
// Smooth modes (and Glitch, rolling dew) re-record live at most every
// LIVE_REC_MIN ms (~30×/s), or LIVE_REC_K × a recording on slower devices
const LIVE_REC_MIN = 33, LIVE_REC_K = 3;
const KEY_HOLD_K = 3;           // a design-change re-record waits this × its cost (≤ KEY_HOLD_MAX)
const DT_MAX = 0.1;             // s: longest step per frame (a stalled tab doesn't jump ahead)
const FRAME_MS = 1000 / 60;     // a normal frame, subtracted from re-record costs
const GAZE_LAG = 0.12;          // s: how far the eyes lag behind the pointer
const DRAG_EASE = 1.5;          // s: a let-go node eases back into its drift
const MORPH_SEED_STEP = 7717;   // seed step per Morph (a prime, so seeds don't repeat soon)
const DRIFT_AMP = 46;           // world units: drift swing at Drift amount 1
const DRIFT_FREQ = 1.6;         // speeds up every node's two drift sines
const PULSE_RATE = 1.6, PULSE_WIDTH = 0.9;   // rad/s; extra line width at the pulse peak
const SPIN_RATE = 0.12;         // rad/s
const HUE_RATE = 24;            // degrees/s of Colour cycle

// Where the node markers are drawn: drifting along while playing
function shownNodes() { return ((ANIM.playing || ANIM.frozen) && ANIM.hpos && ANIM.hpos.length === S.nodes.length) ? ANIM.hpos : S.nodes; }

function animNodes(t) {
  if (!ANIM.opts.drift && !ANIM.opts.glitch && !ANIM.opts.flow) return S.nodes;
  const amp = DRIFT_AMP * ANIM.opts.driftAmt;
  return S.nodes.map((n, i) => {
    const w = ANIM.dw[i] ?? 1;
    if (w <= 0) return n;
    const ws = w * w * (3 - 2 * w);
    const a = (0.23 + 0.11 * Math.sin(i * 2.1)) * DRIFT_FREQ, b = (0.19 + 0.09 * Math.cos(i * 1.7)) * DRIFT_FREQ;
    return { ...n, x: n.x + ws * amp * Math.sin(t * a + i * 1.3), y: n.y + ws * amp * Math.sin(t * b + i * 2.9 + 1) };
  });
}

// Records a design variant without touching the user's state
function animRecord(nodes, seed, t = null) {
  const keep = [S.nodes, S.seed, S.layer.seed];
  S.nodes = nodes; S.seed = seed;
  // A Layer 2 with its own seed moves on by the same step (morph)
  if (keep[2] !== undefined) S.layer.seed = (keep[2] + (seed - keep[1] + 1000000) % 1000000) % 1000000;
  const o = ANIM.opts, moving = ANIM.playing && (o.drift || o.flow || o.glitch);
  const live = {
    ...REC_STILL, dewT: t,
    bloomT: ANIM.playing && o.bloom ? ANIM.time : null,
    seasonT: ANIM.playing && o.seasons ? ANIM.ssTime / SEASON_S : null,
    glyphP: o.glyphP, glyphT: moving && o.glyphP > 0 ? ANIM.time : null,
    chaosBase: moving && nodes !== keep[0] ? keep[0] : null
  };
  const r0 = animNow();
  try { return recordDL(live); } finally {
    // Smoothed recording cost for the current mode (both layers)
    const rm = animNow() - r0, mk = S.mode + '|' + (S.layer && S.layer.mode);
    // (the first recording includes warm-up, so it counts for less)
    if (ANIM.recMode !== mk) { ANIM.recMode = mk; ANIM.recEMA = Math.min(rm, REC_HEAVY / 2); ANIM.drawHeavy = false; ANIM.warpSlow = 0; }
    else ANIM.recEMA = ANIM.recEMA * 0.7 + rm * 0.3;
    // With some hysteresis, so a mode near a threshold doesn't flip back and forth
    const e = ANIM.recEMA;
    ANIM.slow = e > REC_SLOW || (ANIM.slow && e > REC_SLOW * 0.6);
    ANIM.heavy = e > REC_HEAVY || (ANIM.heavy && e > REC_HEAVY * 0.6);
    [S.nodes, S.seed] = keep; if (keep[2] !== undefined) S.layer.seed = keep[2]; }
}

// One animation frame (requestAnimationFrame; now in ms): measures the
// device, steps the animation (animStep), then draws.
function animTick(now) {
  ANIM.raf = 0;
  if (!ANIM.playing) return;
  const gap = now - (ANIM.last || now);
  adaptRes(gap, now);
  countFps(now);
  // Cost of a design-change re-record: the slower of the two frame gaps after
  // it, less a normal frame. Most of it is the browser rasterising the new
  // recording into the item cache, which happens on the second frame (see
  // ITEM_SEEN) and which our own timers don't see.
  if (ANIM.keyMeasure > 0 && gap > 0) {
    ANIM.keyWorst = Math.max(ANIM.keyWorst, gap);
    if (--ANIM.keyMeasure === 0) {
      const cost = Math.max(0, ANIM.keyWorst - FRAME_MS);
      ANIM.keyMs = ANIM.keyMs ? ANIM.keyMs * 0.6 + cost * 0.4 : cost;
    }
  }
  const { warp, windOn, br } = animStep(now);
  canvas.style.filter = ANIM.hueFilter;
  itemCacheFrame();
  const d0 = performance.now();
  draw();
  if (ANIM.warpWarm > 0) ANIM.warpWarm--;        // the first frames of a run are slow anyway (cold caches)
  else if (warp || windOn || br != null) {
    const dm = performance.now() - d0;
    ANIM.warpSlow = dm > WARP_DRAW_MAX ? ANIM.warpSlow + (dm > WARP_DRAW_MAX * 2 ? 2 : 1) : 0;
    // Switch, and record afresh at the current drift position (the bent
    // recording would otherwise snap back to where it was recorded)
    if (ANIM.warpSlow >= 2) { ANIM.drawHeavy = true; ANIM.trail = []; ANIM.curKey = ''; }
  }
  driftNoteUpdate();
  if (!ANIM.ambient) renderNodeDOM(ANIM.hpos);
  ANIM.raf = requestAnimationFrame(animTick);
}
// Drift on a jumpy mode that has given up re-routing live (the design is too
// heavy to bend or record every frame: drawHeavy / heavy) falls back to a new
// keyframe every DRIFT_KEY s. The panel says so for as long as that lasts,
// whatever the frame rate, and says what would bring live drift back.
function driftNoteText() {
  const o = ANIM.opts;
  if (!o.drift || o.flow || o.glitch || !(ANIM.drawHeavy || ANIM.heavy)) return '';
  const modes = [S.mode, S.layer && S.layer.mode].filter(m => DRIFT_JUMPY.includes(m) && !DRIFT_BEND.includes(m));
  if (!modes.length) return '';
  const n = symCopies().length, l2 = S.layer && S.layer.mode && S.layer.mode !== 'none';
  const help = n >= 6 ? `<b>Symmetry</b> draws the design ${n} times${S.sym.mirror ? ' (Mirror doubles it)' : ''}: fewer copies is the biggest saving.`
    : l2 ? 'Turning off Layer 2 or a lower Density helps.' : 'A lower Density helps.';
  return `<b>Drift</b> can't re-route ${[...new Set(modes)].map(MODE_NAME).join(' and ')} live: this design is too heavy to redraw every frame, so it only dissolves into a new layout every ${DRIFT_KEY} s. ${help} <b>Flow</b> is the calmer choice here. <button type="button" class="an-retry" id="an-retry">Try live Drift again</button>`;
}
// Live drift is judged afresh: after a change of symmetry (it is not in the
// display-list key, so the design-change reset in animStep never sees it) and
// on the panel's button. A design that is still too heavy falls back again
// after two slow frames and the note comes back.
function driftRetry() {
  ANIM.drawHeavy = false; ANIM.warpSlow = 0; ANIM.warpWarm = Math.max(ANIM.warpWarm, WARP_WARM);
  ANIM.heavy = false; ANIM.recEMA = Math.min(ANIM.recEMA, REC_HEAVY / 2);
  ANIM.curKey = '';                              // record afresh at the current drift position
}
function driftNoteUpdate() {
  const t = driftNoteText();
  if (t === ANIM.driftNote) return;
  ANIM.driftNote = t;
  const el = document.getElementById('an-drift-note');
  el.innerHTML = t;
  el.classList.toggle('hidden', !t);
}

// The animation itself, one frame at time now (ms): moves the clocks and the
// nodes, re-records what changed and builds ANIM.frame and ANIM.hueFilter.
// Draws nothing, so the loop video (js/loop-video.js) steps it on its own
// fixed clock. Returns what animTick needs to judge the draw cost.
function animStep(now) {
  const o = ANIM.opts;
  const gap = now - (ANIM.last || now);
  const dt = Math.min(DT_MAX, gap / 1000) * o.speed;
  ANIM.last = now;
  const t = (ANIM.time += dt);
  animClocks(o, gap, dt);
  animMorph(o, t);
  const rec = animRerecord(o, t, now);
  const its = animItems(o, t, now, rec.warp);
  const wind = animWind(o, t, its.items);
  const br = animFrame(o, t, its, wind);
  return { warp: rec.warp, windOn: wind.m || wind.l, br };
}

// The effect clocks, Breathing's fade, the blink clock, the gaze, the eased
// drag weights
function animClocks(o, gap, dt) {
  ANIM.dewTime += dt * o.dewSpd;
  ANIM.twTime += dt * o.twRate;
  ANIM.lfTime += dt * o.lfSpd;
  ANIM.sunTime += dt * o.sunSpd;
  ANIM.rpTime += dt * o.rpSpd;
  ANIM.spTime += dt * o.spSpd;
  if (o.seasons) ANIM.ssTime += dt * o.ssSpd;
  ANIM.brTime += dt * o.brSpd;
  const on = o.breathe && modeOn(BREATHE_MODES, 0) && !ANIM.drawHeavy;
  ANIM.brAmp = Math.max(0, Math.min(1, ANIM.brAmp + (on ? 1 : -1) * dt / BR_FADE));
  // Layer 2's clocks run at its own speeds (the same as Layer 1's unless they differ)
  const o2 = animO2(), c2 = ANIM.clk2;
  c2.tw += dt * o2.twRate; c2.lf += dt * o2.lfSpd; c2.sun += dt * o2.sunSpd; c2.rp += dt * o2.rpSpd; c2.br += dt * o2.brSpd;
  const on2 = o2.breathe && modeOn(BREATHE_MODES, 1) && !ANIM.drawHeavy;
  ANIM.brAmp2 = Math.max(0, Math.min(1, ANIM.brAmp2 + (on2 ? 1 : -1) * dt / BR_FADE));
  if (gap > 0) ANIM.blinkTime += Math.min(DT_MAX, gap / 1000);
  // The eyes follow the pointer with a little lag (GAZE_LAG)
  if (ANIM.gazeTarget) {
    const g = ANIM.gaze, f = 1 - Math.exp(-Math.min(DT_MAX, gap / 1000) / GAZE_LAG);
    ANIM.gaze = g ? { x: g.x + (ANIM.gazeTarget.x - g.x) * f, y: g.y + (ANIM.gazeTarget.y - g.y) * f } : { ...ANIM.gazeTarget };
  }
  // A dragged node holds still under the pointer; afterwards its drift eases
  // back in over DRAG_EASE s (real time), so it doesn't jump away when let go
  if (ANIM.dw.length !== S.nodes.length) ANIM.dw = S.nodes.map(() => 1);
  ANIM.dw.forEach((w, i) => { if (S.draggingNode !== i && w < 1) ANIM.dw[i] = Math.min(1, w + dt / o.speed / DRAG_EASE); });
}

// True when the main mode or Layer 2's mode is in the list (li 0: only the
// main mode, 1: only Layer 2's)
function modeOn(list, li) {
  return (li !== 1 && list.includes(S.mode)) || (li !== 0 && list.includes(S.layer.mode));
}
// Layer 2's options: Layer 1's (ANIM.opts) with its own values over them
function animO2() { return { ...ANIM.opts, ...ANIM.opts2 }; }
// Draw on is on for at least one layer (the draw-on clock and its timing are shared)
function animAnyDraw() { return ANIM.opts.draw || animO2().draw; }

// Morph: next seed, old design fades out under the new one
// With Flow the new seed fades in softly instead (draw-on progress kept)
// With Flow a keyframe crossfade is nearly always running; a morph waits for
// it to finish (≤ FLOW_KEY s), else the half-faded keyframe drops out (pop)
function animMorph(o, t) {
  if (!o.morph || t < ANIM.nextMorph || (o.flow && ANIM.prev && t - ANIM.fadeAt < ANIM.fadeDur)) return;
  if (ANIM.cur) {
    ANIM.prev = ANIM.cur; ANIM.prevBase = ANIM.curBase; ANIM.fadeAt = t; ANIM.prevMorph = true;
    if (o.flow) { ANIM.fadeDur = FLOW_MORPH; ANIM.prevKey = true; }
    else { ANIM.fadeDur = animAnyDraw() ? ANIM_DRAW : ANIM_XFADE; ANIM.prevKey = false; }
  }
  ANIM.seedOff++;
  if (!o.flow) ANIM.cycleAt = t;
  ANIM.nextMorph = t + ANIM_MORPH;
  ANIM.curKey = '';
}

// (Re)record when the design or the drift moved: smooth modes at most
// ~30×/s, jumpy modes as slow keyframes that crossfade. Returns { warp }.
function animRerecord(o, t, now) {
  const seed = (S.seed + ANIM.seedOff * MORPH_SEED_STEP) % 1000000;
  const key = getDisplayList() && DL.key + '|' + seed;
  // Flow never redraws live: every mode takes keyframes and dissolves between
  // them (live re-layout shimmers in arcane, stained, spiderweb, nebula, and
  // constellation links pop). Rolling dew still moves on the keyframe's nodes.
  const flowKF = o.flow && !o.glitch;
  const jumpyMode = modeOn(DRIFT_JUMPY);
  const jumpy = flowKF || jumpyMode || ANIM.slow;
  // Bloom: the vine's flowers move, so the recording is redone live (its layout stays)
  const bloomLive = (o.bloom || o.seasons) && modeOn(['vine']);
  const dewT = o.dewroll && ((S.mode === 'spiderweb' && S.dew > 0) || (S.layer && S.layer.mode === 'spiderweb' && (S.layer.dew !== undefined ? S.layer.dew : S.dew) > 0)) ? ANIM.dewTime : null;
  // Drift on a jumpy mode (no Flow, no Glitch): re-routed live, bent by the warp
  // (a mode that is only slow, not jumpy, takes cheap cached keyframes instead:
  // bending its many recordings every frame costs more than it saves)
  const symKey = JSON.stringify(S.sym);
  if (ANIM.symKey !== symKey) { if (ANIM.symKey !== '') driftRetry(); ANIM.symKey = symKey; }
  const warp = jumpyMode && o.drift && !o.flow && !o.glitch && !ANIM.heavy && !ANIM.drawHeavy;
  if (!warp) ANIM.trail = [];
  // A smooth mode that is only slow on this device (nebula, microscope on a
  // phone): drift takes keyframes as often as the device allows and is always
  // dissolving into the next one, so it reads as slow movement rather than a
  // still that changes every few seconds
  const slowOnly = ANIM.slow && !jumpyMode && !flowKF && o.drift;
  const slowKey = Math.max(SLOW_KEY_MIN, Math.min(SLOW_KEY_MAX, ANIM.recEMA * SLOW_KEY_K));
  // A design change (a slider being dragged) re-records the whole design, and
  // the new recording has no cached copies yet. On a dense design that is a
  // long frame per slider step. So after one such re-record the next waits
  // KEY_HOLD_K × as long as one costs (≤ KEY_HOLD_MAX ms), keeping re-records to about
  // a quarter of the time; meanwhile the old recording keeps playing.
  // A forced re-record (curKey '') never waits.
  const hold = key !== ANIM.curKey && ANIM.curKey !== '' && ANIM.cur &&
    now - ANIM.keyRecAt < Math.min(KEY_HOLD_MAX, ANIM.keyMs * KEY_HOLD_K);
  if (hold) { /* keep the current recording this frame */ }
  else if (key !== ANIM.curKey) {
    // A real design change (not a forced re-record: curKey '' after a morph or
    // after drift gave up): the cost is judged afresh. The new recording's
    // first frames are slow anyway (nothing cached yet), so they don't count,
    // and a design that got lighter gets live drift back (drawHeavy would
    // otherwise stay on until the mode changed)
    if (ANIM.curKey !== '') { ANIM.drawHeavy = false; ANIM.warpSlow = 0; ANIM.warpWarm = Math.max(ANIM.warpWarm, WARP_WARM); }
    ANIM.curBase = animNodes(t);
    ANIM.cur = animRecord(ANIM.curBase, seed, dewT);
    ANIM.keyRecAt = now; ANIM.keyMeasure = 2; ANIM.keyWorst = 0;   // measure the next 2 frame gaps
    ANIM.curKey = key; ANIM.recAt = now; ANIM.keyAt = t; ANIM.trail = [];
    ANIM.recMs = 0;
  } else if (warp && !driftBendOnly() && now - ANIM.recAt > driftRecGap()) {
    ANIM.trail.push({ dl: ANIM.cur, base: ANIM.curBase, at: now });
    ANIM.curBase = animNodes(t);
    const r0 = animNow();
    ANIM.cur = animRecord(ANIM.curBase, seed, dewT);
    const rm = animNow() - r0;
    ANIM.recMs = ANIM.recMs ? ANIM.recMs * 0.7 + rm * 0.3 : rm;
    ANIM.recAt = animNow();
  } else if ((o.glitch || ((o.drift || o.flow) && !jumpy) || dewT !== null || bloomLive) && now - ANIM.recAt > Math.max(LIVE_REC_MIN, ANIM.recEMA * LIVE_REC_K) &&
             !(flowKF && t - ANIM.keyAt > FLOW_KEY)) {
    // (a bent-only drift re-records at its base: the warp moves it)
    ANIM.cur = animRecord(flowKF || (jumpy && !o.glitch && (!warp || driftBendOnly())) ? ANIM.curBase : animNodes(t), seed, dewT);
    ANIM.recAt = now;
  } else if (jumpy && !o.glitch && !warp && (o.flow || o.drift) &&
             (o.flow ? t - ANIM.keyAt > FLOW_KEY && !(ANIM.prev && ANIM.prevMorph)
              : slowOnly ? t - ANIM.keyAt > slowKey && !(ANIM.prev && ANIM.prevMorph)
              : !ANIM.prev && t - ANIM.keyAt > DRIFT_KEY)) {
    // Flow: a keyframe may replace a finished or keyframe crossfade, never a running morph fade
    ANIM.prev = ANIM.cur; ANIM.prevBase = ANIM.curBase; ANIM.fadeAt = t; ANIM.prevKey = true; ANIM.prevMorph = false;
    ANIM.fadeDur = o.flow ? FLOW_KEY : slowOnly ? slowKey : DRIFT_XFADE;
    ANIM.curBase = animNodes(t);
    ANIM.cur = animRecord(ANIM.curBase, seed, dewT);
    ANIM.recAt = now; ANIM.keyAt = t;
  }
  return { warp };
}

// The recordings to draw this frame, back to front: the fading previous one,
// the drift trail (bent from where each was recorded) and the current one.
// Draw on: with Morph (restarted per seed) or Flow the whole design draws in
// once; otherwise it loops per node (np: progress per node, NODE_DRAW).
// Returns { items, np, pulse }.
function animItems(o, t, now, warp) {
  const o2 = animO2();
  let prog = 1, np = null;
  if (o.draw || o2.draw) {
    const ct = t - ANIM.cycleAt;
    if (o.morph || o.flow) { const u = Math.min(1, ct / ANIM_DRAW); prog = u * u * (3 - 2 * u); }
    else {
      np = nodeDrawStep(S.nodes.length, ct);
      prog = 0;                                              // drawing (per node)
    }
  }
  const items = [];
  // One item per recording; each layer reads its own alpha and draw-on progress
  // (a layer without Draw on shows the design complete, one without Pulse does not dim)
  const mk = (dl, a1, a2, p, extra) => ({ dl, alpha: a1, alpha2: a2, prog: o.draw ? p : 1, prog2: o2.draw ? p : 1, ...extra });
  // Crossfade out the previous design (morph, or a drift keyframe). A drift
  // keyframe also fades the new one in and keeps the draw-on progress.
  let curIn = 1;
  if (ANIM.prev) {
    const f = (t - ANIM.fadeAt) / ANIM.fadeDur;
    if (f >= 1) { ANIM.prev = null; ANIM.prevMorph = false; }
    else if (ANIM.prevKey) {
      const e = f * f * (3 - 2 * f);
      curIn = Math.min(1, e * XF_K);
      const pa = Math.min(1, (1 - e) * XF_K);
      items.push(mk(ANIM.prev, pa, pa, prog));
    } else items.push(mk(ANIM.prev, 1 - f, 1 - f, 1));
  }
  const pulse = o.pulse || o2.pulse ? 0.5 + 0.5 * Math.sin(t * PULSE_RATE) : 0;
  const curA = curIn * (o.pulse ? 0.7 + 0.3 * pulse : 1);   // dims to 70% at the trough
  const curA2 = curIn * (o2.pulse ? 0.7 + 0.3 * pulse : 1);
  if (!warp) { items.push(mk(ANIM.cur, curA, curA2, prog)); return { items, np, pulse }; }
  // Older recordings dissolve away underneath, each bent from where it was recorded
  const nowN = animNodes(t);
  if (items.length) items[0].warp = warpOffset(ANIM.prevBase || S.nodes, nowN);
  const life = DRIFT_TRAIL * driftRecGap();
  ANIM.trail = ANIM.trail.filter(tr => now - tr.at < life);
  ANIM.trail.forEach(tr => {
    const f = 1 - (now - tr.at) / life;
    items.push(mk(tr.dl, curA * TRAIL_ALPHA * f * f, curA2 * TRAIL_ALPHA * f * f, prog, { warp: warpOffset(tr.base, nowN) }));
  });
  items.push(mk(ANIM.cur, curA, curA2, prog, { warp: warpOffset(ANIM.curBase, nowN) }));
  return { items, np, pulse };
}

// Wind: bends the vine and web layers of every item (each from the nodes it
// was recorded at), per layer. Returns { m, l }: whether Wind is on for the
// main design and for Layer 2.
function animWind(o, t, items) {
  const o2 = animO2(), m = !!(o.wind && modeOn(WIND_MODES, 0) && !ANIM.drawHeavy), l = !!(o2.wind && modeOn(WIND_MODES, 1) && !ANIM.drawHeavy);
  if (m || l) items.forEach(it => {
    const base = it.dl === ANIM.cur ? ANIM.curBase || S.nodes : it.dl === ANIM.prev ? ANIM.prevBase || S.nodes : (ANIM.trail.find(tr => tr.dl === it.dl) || {}).base || S.nodes;
    const memo = {}, wf = md => md === 'vine' ? (memo.v = memo.v || windOffset(base, t)) : md === 'spiderweb' ? (memo.s = memo.s || webWindOffset(base, t)) : null;
    it.windM = m ? wf(S.mode) : null;
    it.windL = l ? wf(S.layer.mode) : null;
  });
  return { m, l };
}

// One layer's frame: the shared items and the effect clocks of that layer.
// li 0: the main design (o: ANIM.opts), 1: Layer 2 (o: animO2()); clk: its
// clocks; w: whether Wind blows on it; brA: its Breathing fade.
function layerFrame(base, o, li, t, clk, w, brA) {
  const twOn = o.twinkle && modeOn(TWINKLE_MODES, li);
  return { ...base, o, lw: o.pulse ? 1 + PULSE_WIDTH * base.pulse : 1, np: o.draw ? base.np : null,
    rt: o.rings && modeOn(['arcane'], li) ? t : 0,
    ct: o.current && modeOn(CURRENT_MODES, li) ? t : null,
    tt: twOn ? clk.tw : null, st: twOn ? t : null,
    sk: o.strikes && modeOn(STRIKE_MODES, li) ? t : null,
    lt: o.life && modeOn(LIFE_MODES, li) ? clk.lf : null,
    su: o.sun && modeOn(SUN_MODES, li) ? clk.sun : null,
    rp: o.ripples && modeOn(['water'], li) ? clk.rp : null, rpDrip: o.rpDrip,
    br: brA > 0 ? clk.br : null, brA: smooth01(brA),
    pt: o.petals && modeOn(PETAL_MODES, li) ? t : null, ptWind: w,
    ys: o.seasons && modeOn(['vine']) ? ANIM.ssTime / SEASON_S : null };
}
// ANIM.frame (what replayAnim draws: the items and each effect's clock, null
// when off; ANIM.frame.l2 is Layer 2's own copy of the effect fields),
// ANIM.hueFilter and ANIM.hpos. Returns Breathing's clock.
function animFrame(o, t, { items, np, pulse }, wind) {
  const base = { items, pulse, spin: o.spin ? ANIM.spTime * SPIN_RATE : 0, np };
  const c1 = { tw: ANIM.twTime, lf: ANIM.lfTime, sun: ANIM.sunTime, rp: ANIM.rpTime, br: ANIM.brTime };
  const F = layerFrame(base, o, 0, t, c1, wind.m, ANIM.brAmp);
  F.l2 = layerFrame(base, animO2(), 1, t, ANIM.clk2, wind.l, ANIM.brAmp2);
  ANIM.frame = F;
  // sepia first so white lines take a colour too; then the hue turns
  ANIM.hueFilter = o.hue ? `sepia(0.8) saturate(3.5) hue-rotate(${(t * HUE_RATE * ANIM.hueK) % 360}deg)` : '';
  // Handles and markers follow the drifting nodes (spin is left out, as before)
  ANIM.hpos = (o.drift || o.flow || o.glitch) ? animNodes(t) : null;
  return F.br ?? F.l2.br;
}

// Frame rate: frames counted over ~1 s windows. Two windows in a row under
// FPS_LOW show tips (what costs most in this design, most helpful first);
// two at or above it hide them again. ✕ hides them until the next Animate.
const FPS_LOW = 24;
const KEY_HOLD_MAX = 250;   // ms: longest wait between re-records while the design is being changed (animTick)
function countFps(now) {
  if (!ANIM.fpsAt) { ANIM.fpsAt = now; ANIM.fpsN = 0; return; }
  ANIM.fpsN++;
  const span = now - ANIM.fpsAt;
  if (span < 1000) return;
  ANIM.fpsAt = now;
  const n = ANIM.fpsN; ANIM.fpsN = 0;
  if (span > 2500) return;                         // back from a hidden tab
  const fps = n * 1000 / span, low = fps < FPS_LOW;
  ANIM.fpsLow = low ? ANIM.fpsLow + 1 : 0;
  ANIM.fpsOk = low ? 0 : ANIM.fpsOk + 1;
  const $ = id => document.getElementById(id);
  $('an-fps-v').textContent = Math.round(fps);
  $('an-fps').classList.toggle('low', low);
  const box = $('an-tips');
  if (ANIM.tipsOff || ANIM.ambient) { box.classList.add('hidden'); return; }
  if (ANIM.fpsLow >= 2) {
    const tips = fpsTips();
    $('an-tips-list').innerHTML = tips.map(t => `<li>${t}</li>`).join('');
    box.classList.toggle('hidden', !tips.length);
  } else if (ANIM.fpsOk >= 2) box.classList.add('hidden');
}
// What slows this design down, roughly most costly first (at most 4)
function fpsTips() {
  const o = ANIM.opts, o2 = animO2(), out = [], n = symCopies().length;
  const modes = [S.mode, S.layer.mode].filter(m => m && m !== 'none');
  const jumpy = modes.some(m => DRIFT_JUMPY.includes(m) && !DRIFT_BEND.includes(m));
  if (o.glitch) out.push('<b>Glitch</b> redraws the whole design every frame: turn it off, or use Drift.');
  if (n >= 6) out.push(`<b>Symmetry</b> draws the design ${n} times${S.sym.mirror ? ' (Mirror doubles it)' : ''}: fewer copies is the biggest saving.`);
  if (o.drift && !o.flow && !o.glitch && jumpy && !ANIM.drawHeavy && !ANIM.heavy)
    out.push(`<b>Drift</b> re-routes ${modes.filter(m => DRIFT_JUMPY.includes(m) && !DRIFT_BEND.includes(m)).map(MODE_NAME).join(' and ')} live: <b>Flow</b> crossfades between still layouts instead.`);
  if (o.pulse || o2.pulse) out.push('<b>Pulse</b> changes the line width every frame, so nothing can be reused: turn it off.');
  if (o.draw || o2.draw) out.push('<b>Draw on</b> draws the design afresh every frame: always while it loops per node, until complete with Flow or Morph.');
  if (S.layer.mode && S.layer.mode !== 'none') out.push(`<b>Layer 2</b> (${MODE_NAME(S.layer.mode)}) adds a second design: turn it off or lower its density.`);
  if (S.density >= 7) out.push(`<b>Density</b> ${S.density}: one or two steps lower thins the pattern out.`);
  if (modes.includes('microscope') && S.micro && S.micro.specimen === 'organisms' && S.micro.orgs > 100) out.push('<b>Microorganisms</b> (Microscope) above 100%: fewer is lighter.');
  if (o.hue) out.push('<b>Colour cycle</b> filters the whole canvas every frame; it costs most on large screens.');
  if (!out.length) out.push('A smaller browser window has fewer pixels to fill (the resolution already drops by itself while frames are slow).');
  return out.slice(0, 4);
}

// Lowers the canvas resolution while playing when frames come in slowly, and
// raises it again when there is room. At most one step a second.
function adaptRes(gap, now) {
  if (gap <= 0 || gap > 250) return;              // first frame, or a hidden tab
  // One long frame (a keyframe being recorded) counts as at most 1.5 × RES_LOW,
  // so it can't drop the resolution on its own: each change resizes the canvas
  // and re-rasterises every cached frame, which is a long frame again
  const g = Math.min(gap, RES_LOW * 1.5);
  ANIM.frameEMA = ANIM.frameEMA ? ANIM.frameEMA * 0.9 + g * 0.1 : g;
  if (now - ANIM.resAt < 1000) return;
  // Judge the last drop: frames no faster (by RES_GAIN) means the time goes
  // elsewhere (re-recording, script), so blurring the picture buys nothing:
  // back to the resolution before it, and no lower for the rest of the run
  if (ANIM.resTry) {
    const T = ANIM.resTry; ANIM.resTry = null;
    if (ANIM.frameEMA > T.ema * RES_GAIN) { ANIM.resFloor = T.r; ANIM.res = T.r; ANIM.resAt = now; ANIM.frameEMA = T.ema; layoutCanvas(); return; }
  }
  let r = ANIM.res;
  if (ANIM.frameEMA > RES_LOW && r > Math.max(RES_MIN, ANIM.resFloor)) { ANIM.resTry = { r, ema: ANIM.frameEMA }; r = Math.max(RES_MIN, ANIM.resFloor, r * 0.8); }
  else if (ANIM.frameEMA < RES_HIGH && r < 1) r = Math.min(1, r * 1.25);
  if (r !== ANIM.res) { ANIM.res = r; ANIM.resAt = now; layoutCanvas(); }
}

// Pause keeps the last frame on screen (ANIM.frozen) and Play resumes from it.
// The frame is dropped, and the plain design shown, as soon as anything it
// was recorded from changes (an edit, Undo, a node drag, a new seed) or Stop
// is pressed. Exports and the cut use the paused frame (frozenFrame()). Colours, symmetry, zoom and design position apply to the
// paused frame like to the design.
function syncAnimButton() {
  const on = ANIM.playing, tbA = document.getElementById('tb-anim');
  tbA.setAttribute('aria-pressed', on);
  tbA.querySelector('.ti').textContent = on ? '❚❚' : '▶';
  tbA.querySelector('.tl').textContent = on ? 'Pause' : ANIM.frozen ? 'Resume' : 'Animate';
  document.getElementById('tb-anim-reset').classList.toggle('hidden', !on && !ANIM.frozen);
  document.body.classList.toggle('anim-active', on || ANIM.frozen);
  tbA.title = on ? 'Pause the animation (A)'
    : ANIM.frozen ? 'Resume the animation from where it paused (A). Editing the design shows it still again.' : 'Play the animation (A)';
}
function clearAnimFrame() {
  ANIM.frozen = false;
  ANIM.frame = null; ANIM.prev = null; ANIM.cur = null; ANIM.seedOff = 0; ANIM.hpos = null;
  ITEM_CACHE.clear(); ITEM_SEEN.clear();
  REC_MEMO.main = REC_MEMO.layer = null;
  canvas.style.filter = '';
}
// The paused frame no longer matches the design: show the design still
function dropFrozen() {
  if (!ANIM.frozen) return;
  clearAnimFrame();
  syncAnimButton();
}
// A run from the start (Play after Stop, or a loop video)
function animFresh() {
  ANIM.cycleAt = ANIM.time; ANIM.nextMorph = ANIM.time + (animAnyDraw() ? ANIM_DRAW + ANIM_HOLD : ANIM_MORPH);
  ANIM.curKey = ''; ANIM.prev = null;
  ANIM.drawHeavy = false; ANIM.warpSlow = 0;    // measured again for this run
  ANIM.brAmp = 0; ANIM.brAmp2 = 0;              // Breathing fades in from the still
  ANIM.tipsOff = false;
  ANIM.resFloor = 0; ANIM.resTry = null;        // whether lowering the resolution helps: judged afresh
  ANIM.ssTime = 0;                              // Seasons start from the design's own season
  ANIM.rpTime = 0; ANIM.clk2.rp = 0;            // Ripples start from the still's rings
}
function setPlaying(on, freeze = true) {
  // Resume where it paused, when the design is still the one it paused on
  const resume = on && ANIM.frozen && ANIM.frame && dlKey() === ANIM.frozenKey;
  if (on && !resume) clearAnimFrame();
  ANIM.frozen = false;
  ANIM.playing = on;
  document.getElementById('anim-panel').classList.toggle('hidden', !on || ANIM.ambient);
  document.getElementById('tb-anim-set').classList.toggle('hidden', !on);
  document.body.classList.toggle('playing', on);
  if (on) {
    if (CUT.on) setCutPreview(false);
    ANIM.last = 0; ANIM.frameEMA = 0;
    ANIM.fpsAt = 0; ANIM.fpsLow = 0; ANIM.fpsOk = 0;
    document.getElementById('an-fps-v').textContent = '–';
    document.getElementById('an-fps').classList.remove('low');
    document.getElementById('an-tips').classList.add('hidden');
    ANIM.driftNote = ''; ANIM.symKey = ''; { const dn = document.getElementById('an-drift-note'); dn.innerHTML = ''; dn.classList.add('hidden'); }
    ANIM.resAt = performance.now();               // let the frame average settle (≥ 1 s) before changing resolution
    ANIM.warpWarm = WARP_WARM;                    // and don't judge the bent frames by the first few
    if (!resume) animFresh();
    if (ANIM.res !== 1) layoutCanvas();
    if (!ANIM.raf) ANIM.raf = requestAnimationFrame(animTick);
  } else {
    cancelAnimationFrame(ANIM.raf);
    ANIM.raf = 0;
    if (freeze && ANIM.frame) { ANIM.frozen = true; ANIM.frozenKey = dlKey(); }
    else clearAnimFrame();
    if (ANIM.res !== 1) layoutCanvas();          // full resolution again while editing
    update();
  }
  syncAnimButton();
}

// What each mode is, and which animations suit it (shown under the mode
// picker; the suggested options are highlighted in the animation panel)
const MODE_INFO = {
  pcb: ['Circuit-board traces routed between the nodes, with pads, vias and copper pour.', ['current', 'draw', 'flow']],
  foam: ['Lace-like foam: packed bubbles that grow around the nodes.', ['breathe', 'flow', 'morph']],
  web: ['Soft, curving links between the nodes, like neurons.', ['current', 'drift', 'flow']],
  constellation: ['A star map: the nodes become stars, joined by constellation lines.', ['twinkle', 'current', 'draw']],
  chaosgate: ['Geometric symbols on the nodes, joined by schematic lines.', ['current', 'draw', 'swap']],
  arcane: ['Magic circles: rings of script, figures and sigils, overlapping by size.', ['rings', 'draw', 'swap']],
  stained: ['Leaded stained glass: cells of glass between dark lead lines.', ['sun', 'flow', 'hue']],
  spiderweb: ['An orb web or a tangle anchored on the nodes, with dew drops.', ['dewroll', 'wind', 'draw']],
  nebula: ['Glowing gas clouds and swirls around the nodes.', ['twinkle', 'flow', 'spin']],
  lightning: ['Branching Lichtenberg discharges between the nodes.', ['strikes', 'draw', 'glitch']],
  microscope: ['Microorganisms under a darkfield microscope: the nodes are large cells joined by slime-mould veins, with bacteria, diatoms and amoebae around them.', ['life', 'blink', 'drift']],
  vine: ['Climbing vines: stems wave between the nodes, shoots curl off them with leaves, buds, tendrils and flowers, and every node blooms.', ['wind', 'bloom', 'draw']],
  glass: ['Coloured cathedral glass in dark lead: a jewel mosaic, Tiffany flowers and leaves, or a rose window on every node.', ['sun', 'draw', 'drift']],
  water: ['Ripples on water: rings spread from every node and from raindrops between them, and bend, stop or cross where they meet.', ['ripples', 'draw', 'hue']]
};
// Sliders for one effect each: [key, element id, min, max]; shown only while
// their effect is on (syncAnimRelevance)
const ANIM_FX_SLIDERS = [['curSpd', 'curspd', 0.25, 3], ['curRate', 'currate', 0.25, 3], ['twRate', 'twrate', 0.25, 3],
  ['shoot', 'shoot', 0, 3], ['skRate', 'skrate', 0.25, 3], ['skSpd', 'skspd', 0.25, 3], ['lfSpd', 'lfspd', 0.25, 3], ['sunSpd', 'sunspd', 0.25, 3], ['rpSpd', 'rpspd', 0.25, 3], ['brSpd', 'brspd', 0.25, 3], ['ptRate', 'ptrate', 0.25, 3], ['ssSpd', 'ssspd', 0.25, 3], ['spSpd', 'spspd', 0.25, 4]];
const ANIM_BOOLS = ['draw', 'drift', 'glitch', 'flow', 'dewroll', 'blink', 'wind', 'bloom', 'rings', 'current', 'twinkle', 'strikes', 'life', 'sun', 'ripples', 'breathe', 'petals', 'seasons', 'morph', 'spin', 'pulse', 'hue'];
const ANIM_NAMES = { draw: 'Draw on', drift: 'Drift', glitch: 'Glitch', flow: 'Flow', dewroll: 'Rolling dew', blink: 'Blink', wind: 'Wind', bloom: 'Bloom', rings: 'Turning rings', current: 'Current', twinkle: 'Twinkle', strikes: 'Strikes', life: 'Life', sun: 'Sunlight', ripples: 'Ripples', breathe: 'Breathing', petals: 'Falling petals', seasons: 'Seasons', morph: 'Morph seeds',
  spin: 'Spin', pulse: 'Pulse', hue: 'Colour cycle', swap: 'Symbol swap (with Flow)' };
const MODE_NAME = m => { const o = document.querySelector(`#mode option[value="${m}"]`); return o ? o.textContent : m; };
// The Microscope's text depends on the specimen of the layer it is on
const MICRO_INFO = {
  organisms: MODE_INFO.microscope,
  blood: ['A blood smear under the microscope: a dense layer of drifting red blood cells and a few platelets.', ['life', 'draw', 'drift']],
  hyphae: ['Fungal hyphae under the microscope: branching, septate threads grow from the nodes and cross in layers, with soft out-of-focus threads behind.', ['life', 'draw', 'drift']]
};
const modeInfo = (m, layer) => m === 'microscope' ? MICRO_INFO[((layer === 2 ? S.layer.micro : S.micro) || {}).specimen] || MODE_INFO.microscope : MODE_INFO[m];
function syncModeInfo() {
  const m = editMode(), info = modeInfo(m, EDIT_L), el = document.getElementById('mode-info');
  el.classList.toggle('hidden', !info);
  if (info) el.innerHTML = `${info[0]} <b>Suits:</b> ${info[1].map(k => ANIM_NAMES[k]).join(', ')}.`;
  const modes = [S.mode, S.layer.mode].filter(x => MODE_INFO[x]);
  const rec = new Set([[S.mode, 1], [S.layer.mode, 2]].filter(([x]) => MODE_INFO[x]).flatMap(([x, l]) => modeInfo(x, l)[1]));
  ANIM_BOOLS.forEach(k =>
    document.getElementById('an-' + k).closest('label').classList.toggle('rec', rec.has(k)));
  document.getElementById('an-rec').textContent = 'Suggested for ' + modes.map(MODE_NAME).join(' + ') + ' (highlighted)'
    + (rec.has('swap') ? '; Symbol swap shows with Flow' : '') + '.';
}

// Animation options show only when they would do something for this design
// (hidden options keep their values)
function syncAnimRelevance() {
  const $ = id => document.getElementById(id);
  const hasL2 = !!S.layer.mode && S.layer.mode !== 'none';
  if (!hasL2 && ANIM.scope !== 'both') { ANIM.scope = 'both'; syncAnimControls(); return; }   // Layer 2 gone: back to Both, controls redrawn
  $('an-scope-row').classList.toggle('hidden', !hasL2);
  $('an-scope').value = ANIM.scope;
  $('an-scope').querySelector('[value="l1"]').textContent = 'Layer 1 · ' + MODE_NAME(S.mode);
  $('an-scope').querySelector('[value="l2"]').textContent = 'Layer 2 · ' + (hasL2 ? MODE_NAME(S.layer.mode) : '');
  $('an-scope-note').classList.toggle('hidden', ANIM.scope === 'both');
  const o = scopeView(), sc = ANIM.scope;
  const modes = sc === 'l1' ? [S.mode] : sc === 'l2' ? [S.layer.mode] : [S.mode, S.layer.mode];
  const moving = o.drift || o.flow || o.glitch;
  const layerDew = S.layer.dew !== undefined ? S.layer.dew : S.dew;
  const dew = (S.mode === 'spiderweb' && S.dew > 0) || (S.layer.mode === 'spiderweb' && layerDew > 0);
  $('an-dewroll').closest('label').classList.toggle('hidden', !dew);
  $('an-dewspd-row').classList.toggle('hidden', !dew || !o.dewroll);
  // Blink needs nuclei: only the Microorganisms specimen has them
  const eyes = (sc !== 'l2' && S.mode === 'microscope' && (S.micro || {}).specimen === 'organisms') || (sc !== 'l1' && S.layer.mode === 'microscope' && ((S.layer.micro || S.micro || {}).specimen === 'organisms'));
  $('an-blink').closest('label').classList.toggle('hidden', !eyes);
  $('an-wind').closest('label').classList.toggle('hidden', !modes.some(m => WIND_MODES.includes(m)));
  $('an-bloom').closest('label').classList.toggle('hidden', !modes.includes('vine'));
  $('an-rings').closest('label').classList.toggle('hidden', !modes.includes('arcane'));
  $('an-current').closest('label').classList.toggle('hidden', !modes.some(m => CURRENT_MODES.includes(m)));
  $('an-twinkle').closest('label').classList.toggle('hidden', !modes.some(m => TWINKLE_MODES.includes(m)));
  $('an-strikes').closest('label').classList.toggle('hidden', !modes.some(m => STRIKE_MODES.includes(m)));
  $('an-life').closest('label').classList.toggle('hidden', !modes.some(m => LIFE_MODES.includes(m)));
  $('an-sun').closest('label').classList.toggle('hidden', !modes.some(m => SUN_MODES.includes(m)));
  $('an-breathe').closest('label').classList.toggle('hidden', !modes.some(m => BREATHE_MODES.includes(m)));
  $('an-ripples').closest('label').classList.toggle('hidden', !modes.includes('water'));
  $('an-petals').closest('label').classList.toggle('hidden', !modes.some(m => PETAL_MODES.includes(m)));
  $('an-seasons').closest('label').classList.toggle('hidden', !modes.includes('vine'));
  const fxOn = { cur: o.current && modes.some(m => CURRENT_MODES.includes(m)), tw: o.twinkle && modes.some(m => TWINKLE_MODES.includes(m)),
    sk: o.strikes && modes.some(m => STRIKE_MODES.includes(m)), lf: o.life && modes.some(m => LIFE_MODES.includes(m)),
    su: o.sun && modes.some(m => SUN_MODES.includes(m)), rp: o.ripples && modes.includes('water'), br: o.breathe && modes.some(m => BREATHE_MODES.includes(m)),
    pt: o.petals && modes.some(m => PETAL_MODES.includes(m)), ss: o.seasons && modes.includes('vine'), sp: o.spin };
  [['curspd', 'cur'], ['currate', 'cur'], ['twrate', 'tw'], ['shoot', 'tw'], ['skrate', 'sk'], ['skspd', 'sk'], ['lfspd', 'lf'], ['sunspd', 'su'], ['rpspd', 'rp'], ['rpstyle', 'rp'], ['brspd', 'br'], ['ptrate', 'pt'], ['ssspd', 'ss'], ['spspd', 'sp']]
    .forEach(([id, fx]) => $('an-' + id + '-row').classList.toggle('hidden', !fxOn[fx]));
  $('an-driftamt-row').classList.toggle('hidden', !moving);
  $('an-drift').closest('label').classList.toggle('hidden', o.flow && !o.glitch);   // Flow keyframes replace live drift
  $('an-glyphp-row').classList.toggle('hidden', !moving || !modes.some(m => m === 'chaosgate' || m === 'arcane'));
  syncModeInfo();
}

function syncAnimControls() {
  syncAnimRelevance();
  const o = scopeView();
  ANIM_BOOLS.forEach(k => { const cb = document.getElementById('an-' + k); cb.checked = o[k]; cb.indeterminate = animMixed(k); });
  document.getElementById('an-speed').value = o.speed;
  document.getElementById('an-speed-v').textContent = o.speed.toFixed(2).replace(/0$/, '') + '×';
  document.getElementById('an-driftamt').value = o.driftAmt;
  document.getElementById('an-driftamt-v').textContent = o.driftAmt.toFixed(2).replace(/0$/, '') + '×';
  document.getElementById('an-glyphp').value = o.glyphP;
  document.getElementById('an-glyphp-v').textContent = o.glyphP > 0 ? o.glyphP.toFixed(1).replace(/\.0$/, '') + ' s' : 'off';
  ANIM_FX_SLIDERS.forEach(([k, id]) => {
    document.getElementById('an-' + id).value = o[k];
    document.getElementById('an-' + id + '-v').textContent = animMixed(k) ? 'mixed' : k === 'shoot' && o[k] === 0 ? 'off' : o[k].toFixed(2).replace(/0$/, '') + '×';
  });
  document.getElementById('an-rpstyle').value = o.rpDrip ? 'drip' : 'steady';
  document.getElementById('an-dewspd').value = o.dewSpd;
  document.getElementById('an-dewspd-v').textContent = o.dewSpd.toFixed(2).replace(/0$/, '') + '×';
}

// ── Ambient: your design and animation settings, full screen, no UI.
// Only zoom and pan change (to fill the screen); they're restored on exit.

// The editor's square view, scaled so it fills the shorter side of the
// screen (the canvas width always spans CC world units)
function ambientZoom() {
  const snap = ANIM.snapshot; if (!snap) return;
  const w = window.innerWidth, h = window.innerHeight, f = Math.min(w, h) / w;
  S.zoom = snap.zoom * f;
  S.pan = { x: snap.pan.x * f, y: snap.pan.y * f };
}

// A random element of a (not seeded: for Randomise only)
const pickRandom = a => a[Math.floor(Math.random() * a.length)];
// Randomise everything that makes up a design, and which animation effects
// play (2–3 of those suggested for the new design; speeds stay). Page and
// export settings stay. Weighted so most results are usable: plain settings are
// more likely than extremes.
function randomizeAnim() {
  const sug = [...new Set([[S.mode, 1], [S.layer.mode, 2]].filter(([m]) => MODE_INFO[m]).flatMap(([m, l]) => modeInfo(m, l)[1]))]
    .filter(k => ANIM_BOOLS.includes(k) && k !== 'seasons');       // Seasons stays out (see Still open)
  for (let i = sug.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [sug[i], sug[j]] = [sug[j], sug[i]]; }
  const on = new Set(sug.slice(0, 2 + Math.floor(Math.random() * 2)));
  if (on.has('flow')) on.delete('glitch');                         // Flow and Glitch exclude each other
  ANIM_BOOLS.forEach(k => { ANIM.opts[k] = on.has(k); });
  Object.keys(ANIM.opts2).forEach(k => delete ANIM.opts2[k]);     // both layers follow again
  ANIM.cycleAt = ANIM.time; ANIM.nextMorph = ANIM.time + (animAnyDraw() ? ANIM_DRAW + ANIM_HOLD : ANIM_MORPH);
  syncAnimControls();
  saveUi({ anim: animSave() });
}
function randomizeAll() {
  const chance = p => Math.random() < p;
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const d = getDesign();
  d.mode = pickRandom(MODES);
  d.density = ri(3, 9);
  d.sigma = ri(0, 95);
  d.weight = +(0.5 + Math.random() * 1.4).toFixed(1);
  d.seed = randomSeed();
  d.dew = ri(20, 90);
  d.curve = ri(20, 90);
  d.curved = chance(0.8);
  d.pcb = { pour: pickRandom([0, 20, 40, 60, 80]), meander: chance(0.7), silk: chance(0.3) };
  d.web = { ring: chance(0.8) };
  d.nebula = { glow: chance(0.85) };
  d.lightning = { glow: chance(0.85), fill: chance(0.6) };
  d.arcane = { snap: chance(0.4), wobble: chance(0.3) ? ri(2, 7) * 10 : 0, links: chance(0.85), sats: chance(0.85) };
  d.micro = { specimen: pickRandom(['organisms', 'blood', 'hyphae']), veins: chance(0.85), orgs: pickRandom([50, 100, 100, 150]), cilia: pickRandom(['auto', 'auto', 'on', 'off']), detail: chance(0.85) };
  d.chaos = { style: pickRandom(['mixed', 'pillar', 'classic']), frames: chance(0.4), links: chance(0.8) };
  d.stained = { ring: chance(0.7), ragged: chance(0.5) };
  d.vine = { leaves: pickRandom([60, 100, 100, 150]), flowers: pickRandom([30, 60, 60, 90]), leaf: pickRandom(['almond', 'almond', 'round', 'ivy', 'mixed']),
    bloom: pickRandom(['mixed', 'blossom', 'daisy', 'rose']), tendrils: chance(0.8), veins: chance(0.85) };
  d.glass = { style: pickRandom(GLASS_STYLES), set: pickRandom(['jewel', 'jewel', 'pastel', 'amber', 'sea', 'clear']), light: chance(0.9) };
  d.water = { meet: pickRandom(['wave', 'wave', 'stop', 'cross']), spacing: pickRandom([16, 20, 24, 24, 30, 36]), drops: pickRandom([0, 20, 40, 40, 70]) };
  // Colours: a third keep the mode's own, the rest a random scheme
  if (chance(0.35)) d.palette = { mode: 'original', ink: '#000000', paper: '#ffffff', glow: '#ffffff', preset: 'custom', l2: null };
  else { const p = pickRandom(PALETTES); d.palette = { mode: 'tint', paper: p.bg, ink: p.ink, glow: p.glow, preset: p.id, l2: null }; }
  // Symmetry: off half the time
  const sr2 = Math.random();
  d.sym = sr2 < 0.5 ? { n: 1, mirror: false } : sr2 < 0.65 ? { n: 1, mirror: true } : { n: pickRandom([3, 4, 5, 6, 6, 8]), mirror: chance(0.5) };
  // Boundary (none 40%), and now and then a turned or enlarged design inside it
  d.boundary = { shape: chance(0.4) ? 'none' : pickRandom(['circle', 'square', 'pentagon', 'hexagon']), size: ri(26, 42) * 10, border: pickRandom(['single', 'single', 'double', 'none']), outside: null, lw: S.boundary.lw, color: null };   // background outside and a scheme-coloured border every time; the border's thickness is kept
  d.xf = (d.boundary.shape !== 'none' || pageActive()) && chance(0.3)
    ? { scale: pickRandom([1, 1.2, 1.4, 1.6]), rot: pickRandom([0, 15, 30, 45, -15, -30]), x: 0, y: 0 } : { scale: 1, rot: 0, x: 0, y: 0 };
  // Layer 2 a quarter of the time, a different mode
  d.layer = chance(0.25)
    ? { mode: pickRandom(MODES.filter(m => m !== d.mode)), density: ri(2, 6), weight: +(0.4 + Math.random() * 0.6).toFixed(1), strength: ri(35, 75) }
    : { mode: 'none', density: 4, weight: 0.6, strength: 60 };
  applyDesign(d);
  randomizeAnim();
  // Nodes last: they fill the region the new boundary and symmetry leave
  S.nodes = varyNodeSizes(randomNodes(ri(3, 8)));
  fitNodes();
  openNode = -1;
  fitView();
  syncControls();
  renderNodeRoster();
  update();
}

function enterAmbient() {
  if (ANIM.ambient) return;
  ANIM.snapshot = { zoom: S.zoom, pan: { ...S.pan }, playing: ANIM.playing, frozen: ANIM.frozen, showNodes: S.showNodes };
  ANIM.ambient = true;
  if (CUT.on) setCutPreview(false);
  setDrawer(false);
  document.body.classList.add('ambient');
  S.showNodes = false;
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => { /* blocked in a frame: fill the window instead */ });
  layoutCanvas();
  ambientZoom();
  if (!ANIM.playing) setPlaying(true); else ANIM.curKey = '';
  ambientCursor();
}

function exitAmbient() {
  if (!ANIM.ambient) return;
  const snap = ANIM.snapshot;
  ANIM.ambient = false;
  document.body.classList.remove('ambient', 'hide-cursor');
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  S.zoom = snap.zoom; S.pan = snap.pan; S.showNodes = snap.showNodes;
  ANIM.snapshot = null;
  // Back to how it was: paused on a frame, or still
  if (!snap.playing) setPlaying(false, !!snap.frozen);
  else document.getElementById('anim-panel').classList.remove('hidden');
  layoutCanvas();
  syncControls();
  update();
}

// Hide the pointer after a moment of stillness
function ambientCursor() {
  document.body.classList.remove('hide-cursor');
  clearTimeout(ANIM.uiTimer);
  if (ANIM.ambient) ANIM.uiTimer = setTimeout(() => document.body.classList.add('hide-cursor'), 2000);
}

// Panels sit under the toolbar, which can wrap: keep --tb-h current, and
// --anim-r so the animation panel's right edge lines up with its button group
function trackToolbar() {
  const tb = document.querySelector('.toolbar'), vp = document.getElementById('viewport');
  const grp = document.getElementById('tb-anim-group');
  let h = -1;
  const setR = () => {
    const r = Math.max(12, Math.round(vp.getBoundingClientRect().right - grp.getBoundingClientRect().right));
    vp.style.setProperty('--anim-r', r + 'px');
  };
  const set = () => {
    setR();
    if (tb.offsetHeight === h) return;
    const first = h < 0;
    h = tb.offsetHeight;
    vp.style.setProperty('--tb-h', h + 'px');
    // The toolbar height decides the canvas room on a phone
    if (ANIM.ambient) return;
    layoutCanvas();
    if (!first) update();
  };
  set();
  if (window.ResizeObserver) { const ro = new ResizeObserver(set); ro.observe(tb); ro.observe(grp); }
}

// Animation settings from saved UI state or a preset; unknown keys ignored,
// missing ones keep their current value
function animConv(k, v) {
  return k === 'speed' ? clampNum(v, 0.25, 3, 1) : k === 'driftAmt' ? clampNum(v, 0.25, 2.5, 1)
    : k === 'glyphP' ? clampNum(v, 0, 10, 3.5) : k === 'dewSpd' ? clampNum(v, 0.25, 3, 1)
    : ANIM_FX_SLIDERS.some(f => f[0] === k) ? (f => clampNum(v, f[2], f[3], 1))(ANIM_FX_SLIDERS.find(f => f[0] === k)) : !!v;
}
function setAnimOpts(a) {
  if (!a || typeof a !== 'object') return;
  Object.keys(ANIM.opts).forEach(k => { if (k in a) ANIM.opts[k] = animConv(k, a[k]); });
  if (ANIM.opts.flow && ANIM.opts.glitch) ANIM.opts.glitch = false;   // they exclude each other
  // Layer 2's own values (older files have none: both layers follow)
  Object.keys(ANIM.opts2).forEach(k => delete ANIM.opts2[k]);
  const l2 = a.layer2 && typeof a.layer2 === 'object' ? a.layer2 : {};
  ANIM_L_KEYS.forEach(k => { if (k in l2) { const v = animConv(k, l2[k]); if (v !== ANIM.opts[k]) ANIM.opts2[k] = v; } });
}
// What is saved: the options plus Layer 2's own values
function animSave() { return { ...ANIM.opts, layer2: { ...ANIM.opts2 } }; }

// ── Animate scope: the per-layer controls edit Both layers, Layer 1 or Layer 2.
// Layer 2's values sit in ANIM.opts2 only where they differ from ANIM.opts.
// (Drift, Glitch, Flow, Morph, Spin, Colour cycle, Rolling dew, Bloom and
// Seasons are not per layer yet and always edit both.)
const ANIM_L_KEYS = ['draw', 'pulse', 'blink', 'wind', 'rings', 'current', 'twinkle', 'strikes', 'life', 'sun', 'ripples', 'breathe', 'petals', 'rpDrip',
  'curSpd', 'curRate', 'twRate', 'shoot', 'skRate', 'skSpd', 'lfSpd', 'sunSpd', 'rpSpd', 'brSpd', 'ptRate'];
function animSet(k, v) {
  const o = ANIM.opts, o2 = ANIM.opts2, sc = ANIM.scope;
  if (!ANIM_L_KEYS.includes(k) || sc === 'both') { o[k] = v; delete o2[k]; return; }
  if (sc === 'l2') o2[k] = v;
  else { if (!(k in o2)) o2[k] = o[k]; o[k] = v; }     // Layer 2 keeps what it had
  if (o2[k] === o[k]) delete o2[k];
}
// True when the layers differ in k and the scope is Both
function animMixed(k) { return ANIM.scope === 'both' && k in ANIM.opts2 && ANIM.opts2[k] !== ANIM.opts[k]; }
// The options as the controls show them for the scope
function scopeView() {
  const o = { ...ANIM.opts }, o2 = ANIM.opts2, sc = ANIM.scope;
  ANIM_L_KEYS.forEach(k => {
    if (sc === 'l2' && k in o2) o[k] = o2[k];
    else if (sc === 'both' && k in o2 && typeof o[k] === 'boolean') o[k] = o[k] || o2[k];
  });
  return o;
}

// A preset (Save .json, favourites) is the design plus its animation settings.
// The animation settings stay out of getDesign(), so Undo does not touch them.
function getPreset() { return { ...getDesign(), anim: animSave() }; }
function applyPresetFile(d) {
  applyDesign(d);
  if (d && d.anim) {
    setAnimOpts(d.anim);
    syncAnimControls();
    ANIM.cycleAt = ANIM.time; ANIM.nextMorph = ANIM.time + (animAnyDraw() ? ANIM_DRAW + ANIM_HOLD : ANIM_MORPH);
    saveUi({ anim: animSave() });
  }
}

function setupAnim() {
  const $ = id => document.getElementById(id);
  // Fold / unfold the settings: Settings in the toolbar (desktop) or ▾ in the sheet (phone)
  const foldPanel = () => {
    const min = $('anim-panel').classList.toggle('min');
    $('an-min').setAttribute('aria-expanded', !min);
    $('tb-anim-set').setAttribute('aria-pressed', !min);
  };
  $('an-min').addEventListener('click', foldPanel);
  $('tb-anim-set').addEventListener('click', foldPanel);
  try {
    const ui = JSON.parse(localStorage.getItem(LS_UI) || 'null') || {};
    if (ui.anim) setAnimOpts(ui.anim);
  } catch (e) { /* ignore */ }
  syncAnimControls();
  $('tb-anim').addEventListener('click', () => setPlaying(!ANIM.playing));
  // Stop: back to the still design; the next Animate starts from the beginning
  $('tb-anim-reset').addEventListener('click', () => {
    if (ANIM.playing) setPlaying(false, false);
    else if (ANIM.frozen) { dropFrozen(); update(); }
  });
  $('btn-ambient').addEventListener('click', enterAmbient);
  $('an-drift-note').addEventListener('click', e => { if (e.target.closest('#an-retry')) driftRetry(); });
  $('an-tips-x').addEventListener('click', () => { ANIM.tipsOff = true; $('an-tips').classList.add('hidden'); });
  // Blink: the eyes look at the pointer, wherever it is in the window
  window.addEventListener('pointermove', e => {
    if (!ANIM.opts.blink && !animO2().blink) return;
    const r = canvas.getBoundingClientRect();
    if (r.width && r.height) ANIM.pointer = { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height };
  }, { passive: true });
  $('ambient-exit').addEventListener('click', exitAmbient);
  ANIM_BOOLS.forEach(k => $('an-' + k).addEventListener('change', e => {
    animSet(k, e.target.checked); e.target.indeterminate = false;
    // Flow and Glitch exclude each other
    const other = { flow: 'glitch', glitch: 'flow' }[k];
    if (other && e.target.checked) { ANIM.opts[other] = false; $('an-' + other).checked = false; }
    syncAnimRelevance();
    if (k === 'morph' || k === 'draw') { ANIM.cycleAt = ANIM.time; ANIM.nextMorph = ANIM.time + (animAnyDraw() ? ANIM_DRAW + ANIM_HOLD : ANIM_MORPH); }
    saveUi({ anim: animSave() });
  }));
  $('an-scope').addEventListener('change', e => { ANIM.scope = e.target.value; syncAnimControls(); });
  $('an-rpstyle').addEventListener('change', e => {
    animSet('rpDrip', e.target.value === 'drip');
    saveUi({ anim: animSave() });
  });
  $('an-driftamt').addEventListener('input', e => {
    ANIM.opts.driftAmt = parseFloat(e.target.value);
    syncAnimControls();
    saveUi({ anim: animSave() });
  });
  ANIM_FX_SLIDERS.forEach(([k, id]) => $('an-' + id).addEventListener('input', e => {
    animSet(k, parseFloat(e.target.value));
    syncAnimControls();
    saveUi({ anim: animSave() });
  }));
  $('an-dewspd').addEventListener('input', e => {
    ANIM.opts.dewSpd = parseFloat(e.target.value);
    syncAnimControls();
    saveUi({ anim: animSave() });
  });
  $('an-glyphp').addEventListener('input', e => {
    ANIM.opts.glyphP = parseFloat(e.target.value);
    syncAnimControls();
    saveUi({ anim: animSave() });
  });
  $('an-speed').addEventListener('input', e => {
    ANIM.opts.speed = parseFloat(e.target.value);
    syncAnimControls();
    saveUi({ anim: animSave() });
  });
  ['mousemove', 'pointerdown', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { if (ANIM.ambient) ambientCursor(); }, { passive: true }));
  // Leaving browser full screen (Esc) also leaves ambient mode
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && ANIM.ambient) exitAmbient(); });
  window.addEventListener('resize', () => { if (ANIM.ambient) { layoutCanvas(); ambientZoom(); } });
}
