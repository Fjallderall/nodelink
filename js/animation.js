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
  opts: { draw: true, drift: true, glitch: false, flow: false, dewroll: true, blink: false, wind: false, bloom: false, rings: false, current: false, twinkle: false, strikes: false, life: false, sun: false, breathe: false, petals: false, seasons: false, morph: false, spin: false, pulse: false, hue: false, speed: 1, driftAmt: 1, glyphP: 3.5, dewSpd: 1, curSpd: 1, curRate: 1, twRate: 1, shoot: 1, skRate: 1, skSpd: 1, lfSpd: 1, sunSpd: 1, brSpd: 1, ptRate: 1, ssSpd: 1 },
  frozen: false, frozenKey: '',   // paused: the last frame stays on screen until the design changes
  exporting: false,               // rendering the paused frame for an export (no blit cache)
  twTime: 0,                      // Twinkle clock (animation time × twinkle rate)
  lfTime: 0,                      // Life clock (animation time × life speed)
  sunTime: 0,                     // Sunlight clock (animation time × sun speed)
  ssTime: 0,                      // Seasons clock (animation time × season speed; restarts at Play)
  brTime: 0, brAmp: 0,            // Breathing clock (× breath speed) and its fade in/out (0–1, BR_FADE s)
  dewTime: 0,                     // rolling dew clock (animation time × dew speed)
  blinkTime: 0,                   // blink clock: real seconds while playing (not scaled by Speed)
  pointer: null, gazeTarget: null, gaze: null,   // Blink: pointer over the canvas (fractions), in page coordinates, smoothed
  fpsN: 0, fpsAt: 0, fpsLow: 0, fpsOk: 0, tipsOff: false,   // frame rate per second; tips after 2 s under FPS_LOW
  time: 0, last: 0, raf: 0,
  keyRecAt: 0, keyMs: 0, keyMeasure: 0, keyWorst: 0,   // design-change re-records: when, their smoothed cost (ms), frames left to measure; see animTick
  cur: null, curKey: '', prev: null, fadeAt: 0, fadeDur: 1, prevKey: false, prevMorph: false, keyAt: 0, seedOff: 0, cycleAt: 0, nextMorph: 0, recAt: 0,
  snapshot: null, uiTimer: 0, scenes: false, sceneAt: 0,
  trail: [], curBase: null, prevBase: null, recMs: 0,
  dw: []   // per-node drift weight: 0 while dragged, eases back to 1 after
  , recEMA: 0, recMode: '',   // how long a recording takes (ms, smoothed) for the current mode
  res: 1, frameEMA: 0, resAt: 0, resTry: null, resFloor: 0  // render scale while playing, smoothed real frame interval; last drop being judged; lowest scale that still helped
  , drawHeavy: false, warpSlow: 0, warpWarm: 0  // bent (warp) frames take too long to draw: drift uses keyframes
};
// Drift on a jumpy mode bends every recording point by point, per symmetry
// copy, every frame. A dense design (foam at density 7, 8-fold mirrored = 16
// copies) took ~250 ms+ per frame that way, while recording it took ~35 ms, so
// the recording-based checks never noticed. When two bent frames in a row
// take over WARP_DRAW_MAX ms to draw (or one over twice that), drift switches
// to keyframes that are rasterised once and blitted (as ANIM.heavy does).
const WARP_DRAW_MAX = 45;
const WARP_WARM = 4;   // frames at the start of a run left out of that measurement
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
  const r0 = performance.now();
  try { return recordDL(live); } finally {
    // Smoothed recording cost for the current mode (both layers)
    const rm = performance.now() - r0, mk = S.mode + '|' + (S.layer && S.layer.mode);
    // (the first recording includes warm-up, so it counts for less)
    if (ANIM.recMode !== mk) { ANIM.recMode = mk; ANIM.recEMA = Math.min(rm, REC_HEAVY / 2); ANIM.drawHeavy = false; ANIM.warpSlow = 0; }
    else ANIM.recEMA = ANIM.recEMA * 0.7 + rm * 0.3;
    // With some hysteresis, so a mode near a threshold doesn't flip back and forth
    const e = ANIM.recEMA;
    ANIM.slow = e > REC_SLOW || (ANIM.slow && e > REC_SLOW * 0.6);
    ANIM.heavy = e > REC_HEAVY || (ANIM.heavy && e > REC_HEAVY * 0.6);
    [S.nodes, S.seed] = keep; if (keep[2] !== undefined) S.layer.seed = keep[2]; }
}

// One animation frame (requestAnimationFrame; now in ms): moves the nodes,
// re-records what changed and builds ANIM.frame, then draws.
function animTick(now) {
  ANIM.raf = 0;
  if (!ANIM.playing) return;
  const o = ANIM.opts;
  const gap = now - (ANIM.last || now);
  const dt = Math.min(DT_MAX, gap / 1000) * o.speed;
  ANIM.last = now;
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
  const t = (ANIM.time += dt);
  ANIM.dewTime += dt * o.dewSpd;
  ANIM.twTime += dt * o.twRate;
  ANIM.lfTime += dt * o.lfSpd;
  ANIM.sunTime += dt * o.sunSpd;
  if (o.seasons) ANIM.ssTime += dt * o.ssSpd;
  ANIM.brTime += dt * o.brSpd;
  {
    const on = o.breathe && (BREATHE_MODES.includes(S.mode) || BREATHE_MODES.includes(S.layer.mode)) && !ANIM.drawHeavy;
    ANIM.brAmp = Math.max(0, Math.min(1, ANIM.brAmp + (on ? 1 : -1) * dt / BR_FADE));
  }
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
  if (ANIM.scenes && t - ANIM.sceneAt > AMBIENT_SCENE / Math.max(0.5, o.speed)) ambientScene();

  // Morph: next seed, old design fades out under the new one
  // With Flow the new seed fades in softly instead (draw-on progress kept)
  // With Flow a keyframe crossfade is nearly always running; a morph waits for
  // it to finish (≤ FLOW_KEY s), else the half-faded keyframe drops out (pop)
  if (o.morph && t >= ANIM.nextMorph && !(o.flow && ANIM.prev && t - ANIM.fadeAt < ANIM.fadeDur)) {
    if (ANIM.cur) {
      ANIM.prev = ANIM.cur; ANIM.prevBase = ANIM.curBase; ANIM.fadeAt = t; ANIM.prevMorph = true;
      if (o.flow) { ANIM.fadeDur = FLOW_MORPH; ANIM.prevKey = true; }
      else { ANIM.fadeDur = o.draw ? ANIM_DRAW : ANIM_XFADE; ANIM.prevKey = false; }
    }
    ANIM.seedOff++;
    if (!o.flow) ANIM.cycleAt = t;
    ANIM.nextMorph = t + ANIM_MORPH;
    ANIM.curKey = '';
  }
  // (Re)record when the design or the drift moved: smooth modes at most
  // ~30×/s, jumpy modes as slow keyframes that crossfade
  const seed = (S.seed + ANIM.seedOff * MORPH_SEED_STEP) % 1000000;
  const key = getDisplayList() && DL.key + '|' + seed;
  // Flow never redraws live: every mode takes keyframes and dissolves between
  // them (live re-layout shimmers in arcane, stained, spiderweb, nebula, and
  // constellation links pop). Rolling dew still moves on the keyframe's nodes.
  const flowKF = o.flow && !o.glitch;
  const jumpy = flowKF || DRIFT_JUMPY.includes(S.mode) || (S.layer && DRIFT_JUMPY.includes(S.layer.mode)) || ANIM.slow;
  // Bloom: the vine's flowers move, so the recording is redone live (its layout stays)
  const bloomLive = (o.bloom || o.seasons) && (S.mode === 'vine' || S.layer.mode === 'vine');
  const dewT = o.dewroll && ((S.mode === 'spiderweb' && S.dew > 0) || (S.layer && S.layer.mode === 'spiderweb' && (S.layer.dew !== undefined ? S.layer.dew : S.dew) > 0)) ? ANIM.dewTime : null;
  // Drift on a jumpy mode (no Flow, no Glitch): re-routed live, bent by the warp
  // (a mode that is only slow, not jumpy, takes cheap cached keyframes instead:
  // bending its many recordings every frame costs more than it saves)
  const jumpyMode = DRIFT_JUMPY.includes(S.mode) || (S.layer && DRIFT_JUMPY.includes(S.layer.mode));
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
    ANIM.curBase = animNodes(t);
    ANIM.cur = animRecord(ANIM.curBase, seed, dewT);
    ANIM.keyRecAt = now; ANIM.keyMeasure = 2; ANIM.keyWorst = 0;   // measure the next 2 frame gaps
    ANIM.curKey = key; ANIM.recAt = now; ANIM.keyAt = t; ANIM.trail = [];
    ANIM.recMs = 0;
  } else if (warp && !driftBendOnly() && now - ANIM.recAt > driftRecGap()) {
    ANIM.trail.push({ dl: ANIM.cur, base: ANIM.curBase, at: now });
    ANIM.curBase = animNodes(t);
    const r0 = performance.now();
    ANIM.cur = animRecord(ANIM.curBase, seed, dewT);
    const rm = performance.now() - r0;
    ANIM.recMs = ANIM.recMs ? ANIM.recMs * 0.7 + rm * 0.3 : rm;
    ANIM.recAt = performance.now();
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

  // Draw on. With Morph (restarted per seed) or Flow the whole design draws in
  // once. Otherwise it loops per node (np: progress per node, see NODE_DRAW).
  let prog = 1, np = null;
  const alpha = 1;
  if (o.draw) {
    const ct = t - ANIM.cycleAt;
    const ease = u => u * u * (3 - 2 * u);
    if (o.morph || o.flow) prog = ease(Math.min(1, ct / ANIM_DRAW));
    else {
      np = nodeDrawStep(S.nodes.length, ct);
      prog = 0;                                              // drawing (per node)
    }
  }
  const items = [];
  // Crossfade out the previous design (morph, or a drift keyframe). A drift
  // keyframe also fades the new one in and keeps the draw-on progress.
  let curIn = 1;
  if (ANIM.prev) {
    const f = (t - ANIM.fadeAt) / ANIM.fadeDur;
    if (f >= 1) { ANIM.prev = null; ANIM.prevMorph = false; }
    else if (ANIM.prevKey) {
      const e = f * f * (3 - 2 * f);
      curIn = Math.min(1, e * XF_K);
      items.push({ dl: ANIM.prev, alpha: alpha * Math.min(1, (1 - e) * XF_K), prog });
    } else items.push({ dl: ANIM.prev, alpha: 1 - f, prog: 1 });
  }
  const pulse = o.pulse ? 0.5 + 0.5 * Math.sin(t * PULSE_RATE) : 0;
  const curA = alpha * curIn * (o.pulse ? 0.7 + 0.3 * pulse : 1);   // dims to 70% at the trough
  if (warp) {
    // Older recordings dissolve away underneath, each bent from where it was recorded
    const nowN = animNodes(t);
    if (items.length) items[0].warp = warpOffset(ANIM.prevBase || S.nodes, nowN);
    const life = DRIFT_TRAIL * driftRecGap();
    ANIM.trail = ANIM.trail.filter(tr => now - tr.at < life);
    ANIM.trail.forEach(tr => {
      const f = 1 - (now - tr.at) / life;
      items.push({ dl: tr.dl, alpha: curA * TRAIL_ALPHA * f * f, prog, warp: warpOffset(tr.base, nowN) });
    });
    items.push({ dl: ANIM.cur, alpha: curA, prog, warp: warpOffset(ANIM.curBase, nowN) });
  } else items.push({ dl: ANIM.cur, alpha: curA, prog });
  // Wind: bends the vine layer of every item (each from the nodes it was recorded at)
  const windOn = o.wind && (WIND_MODES.includes(S.mode) || WIND_MODES.includes(S.layer.mode)) && !ANIM.drawHeavy;
  if (windOn) items.forEach(it => {
    const base = it.dl === ANIM.cur ? ANIM.curBase || S.nodes : it.dl === ANIM.prev ? ANIM.prevBase || S.nodes : (ANIM.trail.find(tr => tr.dl === it.dl) || {}).base || S.nodes;
    const memo = {}, wf = m => m === 'vine' ? (memo.v = memo.v || windOffset(base, t)) : m === 'spiderweb' ? (memo.s = memo.s || webWindOffset(base, t)) : null;
    it.windM = wf(S.mode);
    it.windL = wf(S.layer.mode);
  });
  const rt = o.rings && (S.mode === 'arcane' || S.layer.mode === 'arcane') ? t : 0;
  const ct = o.current && (CURRENT_MODES.includes(S.mode) || CURRENT_MODES.includes(S.layer.mode)) ? t : null;
  const twOn = o.twinkle && (TWINKLE_MODES.includes(S.mode) || TWINKLE_MODES.includes(S.layer.mode));
  const tt = twOn ? ANIM.twTime : null, st = twOn ? t : null;
  const sk = o.strikes && (STRIKE_MODES.includes(S.mode) || STRIKE_MODES.includes(S.layer.mode)) ? t : null;
  const lt = o.life && (LIFE_MODES.includes(S.mode) || LIFE_MODES.includes(S.layer.mode)) ? ANIM.lfTime : null;
  const su = o.sun && (SUN_MODES.includes(S.mode) || SUN_MODES.includes(S.layer.mode)) ? ANIM.sunTime : null;
  const br = ANIM.brAmp > 0 ? ANIM.brTime : null, brA = smooth01(ANIM.brAmp);
  const pt = o.petals && (PETAL_MODES.includes(S.mode) || PETAL_MODES.includes(S.layer.mode)) ? t : null;
  const ys = o.seasons && (S.mode === 'vine' || S.layer.mode === 'vine') ? ANIM.ssTime / SEASON_S : null;
  ANIM.frame = { items, lw: o.pulse ? 1 + PULSE_WIDTH * pulse : 1, spin: o.spin ? t * SPIN_RATE : 0, np, rt, ct, tt, st, sk, lt, su, br, brA, pt, ptWind: windOn, ys };
  // sepia first so white lines take a colour too; then the hue turns
  canvas.style.filter = o.hue ? `sepia(0.8) saturate(3.5) hue-rotate(${(t * HUE_RATE) % 360}deg)` : '';
  // Handles and markers follow the drifting nodes (spin is left out, as before)
  ANIM.hpos = (o.drift || o.flow || o.glitch) ? animNodes(t) : null;
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
  if (!ANIM.ambient) renderNodeDOM(ANIM.hpos);
  ANIM.raf = requestAnimationFrame(animTick);
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
  const o = ANIM.opts, out = [], n = symCopies().length;
  const modes = [S.mode, S.layer.mode].filter(m => m && m !== 'none');
  const jumpy = modes.some(m => DRIFT_JUMPY.includes(m) && !DRIFT_BEND.includes(m));
  if (o.glitch) out.push('<b>Glitch</b> redraws the whole design every frame: turn it off, or use Drift.');
  if (n >= 6) out.push(`<b>Symmetry</b> draws the design ${n} times${S.sym.mirror ? ' (Mirror doubles it)' : ''}: fewer copies is the biggest saving.`);
  if (o.drift && !o.flow && !o.glitch && jumpy && !ANIM.drawHeavy && !ANIM.heavy)
    out.push(`<b>Drift</b> re-routes ${modes.filter(m => DRIFT_JUMPY.includes(m) && !DRIFT_BEND.includes(m)).map(MODE_NAME).join(' and ')} live: <b>Flow</b> crossfades between still layouts instead.`);
  if (o.pulse) out.push('<b>Pulse</b> changes the line width every frame, so nothing can be reused: turn it off.');
  if (o.draw) out.push('<b>Draw on</b> draws the design afresh every frame: always while it loops per node, until complete with Flow or Morph.');
  if (S.layer.mode && S.layer.mode !== 'none') out.push(`<b>Layer 2</b> (${MODE_NAME(S.layer.mode)}) adds a second design: turn it off or lower its density.`);
  if (S.density >= 7) out.push(`<b>Density</b> ${S.density}: one or two steps lower thins the pattern out.`);
  if (modes.includes('microscope') && S.micro && S.micro.orgs > 100) out.push('<b>Organisms</b> (Microscope) above 100%: fewer is lighter.');
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
    ANIM.resAt = performance.now();               // let the frame average settle (≥ 1 s) before changing resolution
    ANIM.warpWarm = WARP_WARM;                    // and don't judge the bent frames by the first few
    if (!resume) {
      ANIM.cycleAt = ANIM.time; ANIM.nextMorph = ANIM.time + (ANIM.opts.draw ? ANIM_DRAW + ANIM_HOLD : ANIM_MORPH);
      ANIM.curKey = ''; ANIM.prev = null;
      ANIM.drawHeavy = false; ANIM.warpSlow = 0;    // measured again for this run
      ANIM.brAmp = 0;                               // Breathing fades in from the still
      ANIM.tipsOff = false;
      ANIM.resFloor = 0; ANIM.resTry = null;        // whether lowering the resolution helps: judged afresh
      ANIM.ssTime = 0;                              // Seasons start from the design's own season
    }
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
  microscope: ['Cells under a darkfield microscope: the nodes are large cells joined by slime-mould veins, with bacteria, diatoms and amoebae around them.', ['life', 'blink', 'drift']],
  vine: ['Climbing vines: stems wave between the nodes, shoots curl off them with leaves, buds, tendrils and flowers, and every node blooms.', ['wind', 'bloom', 'draw']],
  glass: ['Coloured cathedral glass in dark lead: a jewel mosaic, Tiffany flowers and leaves, or a rose window on every node.', ['sun', 'draw', 'drift']]
};
// Sliders for one effect each: [key, element id, min, max]; shown only while
// their effect is on (syncAnimRelevance)
const ANIM_FX_SLIDERS = [['curSpd', 'curspd', 0.25, 3], ['curRate', 'currate', 0.25, 3], ['twRate', 'twrate', 0.25, 3],
  ['shoot', 'shoot', 0, 3], ['skRate', 'skrate', 0.25, 3], ['skSpd', 'skspd', 0.25, 3], ['lfSpd', 'lfspd', 0.25, 3], ['sunSpd', 'sunspd', 0.25, 3], ['brSpd', 'brspd', 0.25, 3], ['ptRate', 'ptrate', 0.25, 3], ['ssSpd', 'ssspd', 0.25, 3]];
const ANIM_BOOLS = ['draw', 'drift', 'glitch', 'flow', 'dewroll', 'blink', 'wind', 'bloom', 'rings', 'current', 'twinkle', 'strikes', 'life', 'sun', 'breathe', 'petals', 'seasons', 'morph', 'spin', 'pulse', 'hue'];
const ANIM_NAMES = { draw: 'Draw on', drift: 'Drift', glitch: 'Glitch', flow: 'Flow', dewroll: 'Rolling dew', blink: 'Blink', wind: 'Wind', bloom: 'Bloom', rings: 'Turning rings', current: 'Current', twinkle: 'Twinkle', strikes: 'Strikes', life: 'Life', sun: 'Sunlight', breathe: 'Breathing', petals: 'Falling petals', seasons: 'Seasons', morph: 'Morph seeds',
  spin: 'Spin', pulse: 'Pulse', hue: 'Colour cycle', swap: 'Symbol swap (with Flow)' };
const MODE_NAME = m => { const o = document.querySelector(`#mode option[value="${m}"]`); return o ? o.textContent : m; };
function syncModeInfo() {
  const m = editMode(), info = MODE_INFO[m], el = document.getElementById('mode-info');
  el.classList.toggle('hidden', !info);
  if (info) el.innerHTML = `${info[0]} <b>Suits:</b> ${info[1].map(k => ANIM_NAMES[k]).join(', ')}.`;
  const modes = [S.mode, S.layer.mode].filter(x => MODE_INFO[x]);
  const rec = new Set(modes.flatMap(x => MODE_INFO[x][1]));
  ANIM_BOOLS.forEach(k =>
    document.getElementById('an-' + k).closest('label').classList.toggle('rec', rec.has(k)));
  document.getElementById('an-rec').textContent = 'Suggested for ' + modes.map(MODE_NAME).join(' + ') + ' (highlighted)'
    + (rec.has('swap') ? '; Symbol swap shows with Flow' : '') + '.';
}

// Animation options show only when they would do something for this design
// (hidden options keep their values)
function syncAnimRelevance() {
  const o = ANIM.opts, $ = id => document.getElementById(id);
  const modes = [S.mode, S.layer.mode];
  const moving = o.drift || o.flow || o.glitch;
  const layerDew = S.layer.dew !== undefined ? S.layer.dew : S.dew;
  const dew = (S.mode === 'spiderweb' && S.dew > 0) || (S.layer.mode === 'spiderweb' && layerDew > 0);
  $('an-dewroll').closest('label').classList.toggle('hidden', !dew);
  $('an-dewspd-row').classList.toggle('hidden', !dew || !o.dewroll);
  $('an-blink').closest('label').classList.toggle('hidden', !modes.includes('microscope'));
  $('an-wind').closest('label').classList.toggle('hidden', !modes.some(m => WIND_MODES.includes(m)));
  $('an-bloom').closest('label').classList.toggle('hidden', !modes.includes('vine'));
  $('an-rings').closest('label').classList.toggle('hidden', !modes.includes('arcane'));
  $('an-current').closest('label').classList.toggle('hidden', !modes.some(m => CURRENT_MODES.includes(m)));
  $('an-twinkle').closest('label').classList.toggle('hidden', !modes.some(m => TWINKLE_MODES.includes(m)));
  $('an-strikes').closest('label').classList.toggle('hidden', !modes.some(m => STRIKE_MODES.includes(m)));
  $('an-life').closest('label').classList.toggle('hidden', !modes.some(m => LIFE_MODES.includes(m)));
  $('an-sun').closest('label').classList.toggle('hidden', !modes.some(m => SUN_MODES.includes(m)));
  $('an-breathe').closest('label').classList.toggle('hidden', !modes.some(m => BREATHE_MODES.includes(m)));
  $('an-petals').closest('label').classList.toggle('hidden', !modes.some(m => PETAL_MODES.includes(m)));
  $('an-seasons').closest('label').classList.toggle('hidden', !modes.includes('vine'));
  const fxOn = { cur: o.current && modes.some(m => CURRENT_MODES.includes(m)), tw: o.twinkle && modes.some(m => TWINKLE_MODES.includes(m)),
    sk: o.strikes && modes.some(m => STRIKE_MODES.includes(m)), lf: o.life && modes.some(m => LIFE_MODES.includes(m)),
    su: o.sun && modes.some(m => SUN_MODES.includes(m)), br: o.breathe && modes.some(m => BREATHE_MODES.includes(m)),
    pt: o.petals && modes.some(m => PETAL_MODES.includes(m)), ss: o.seasons && modes.includes('vine') };
  [['curspd', 'cur'], ['currate', 'cur'], ['twrate', 'tw'], ['shoot', 'tw'], ['skrate', 'sk'], ['skspd', 'sk'], ['lfspd', 'lf'], ['sunspd', 'su'], ['brspd', 'br'], ['ptrate', 'pt'], ['ssspd', 'ss']]
    .forEach(([id, fx]) => $('an-' + id + '-row').classList.toggle('hidden', !fxOn[fx]));
  $('an-driftamt-row').classList.toggle('hidden', !moving);
  $('an-drift').closest('label').classList.toggle('hidden', o.flow && !o.glitch);   // Flow keyframes replace live drift
  $('an-glyphp-row').classList.toggle('hidden', !moving || !modes.some(m => m === 'chaosgate' || m === 'arcane'));
  syncModeInfo();
}

function syncAnimControls() {
  const o = ANIM.opts;
  syncAnimRelevance();
  ANIM_BOOLS.forEach(k => { document.getElementById('an-' + k).checked = o[k]; });
  document.getElementById('an-speed').value = o.speed;
  document.getElementById('an-speed-v').textContent = o.speed.toFixed(2).replace(/0$/, '') + '×';
  document.getElementById('an-driftamt').value = o.driftAmt;
  document.getElementById('an-driftamt-v').textContent = o.driftAmt.toFixed(2).replace(/0$/, '') + '×';
  document.getElementById('an-glyphp').value = o.glyphP;
  document.getElementById('an-glyphp-v').textContent = o.glyphP > 0 ? o.glyphP.toFixed(1).replace(/\.0$/, '') + ' s' : 'off';
  ANIM_FX_SLIDERS.forEach(([k, id]) => {
    document.getElementById('an-' + id).value = o[k];
    document.getElementById('an-' + id + '-v').textContent = k === 'shoot' && o[k] === 0 ? 'off' : o[k].toFixed(2).replace(/0$/, '') + '×';
  });
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

// ── Ambient scenes: the screensaver. Random designs on a snapshot of yours,
// restored on exit with your animation options.
const AMBIENT_SCENE = 45;          // seconds per scene
// A random element of a (not seeded: for Randomise and Ambient scenes only)
const pickRandom = a => a[Math.floor(Math.random() * a.length)];
// Randomise everything that makes up a design. Page, export and animation
// settings stay. Weighted so most results are usable: plain settings are
// more likely than extremes.
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
  d.nebula = { glow: chance(0.85) };
  d.lightning = { glow: chance(0.85), fill: chance(0.6) };
  d.arcane = { snap: chance(0.4), wobble: chance(0.3) ? ri(2, 7) * 10 : 0, links: chance(0.85), sats: chance(0.85) };
  d.micro = { veins: chance(0.85), orgs: pickRandom([50, 100, 100, 150]), cilia: pickRandom(['auto', 'auto', 'on', 'off']), detail: chance(0.85) };
  d.chaos = { style: pickRandom(['mixed', 'pillar', 'classic']), frames: chance(0.4), links: chance(0.8) };
  d.stained = { ring: chance(0.7), ragged: chance(0.5) };
  d.vine = { leaves: pickRandom([60, 100, 100, 150]), flowers: pickRandom([30, 60, 60, 90]), leaf: pickRandom(['almond', 'almond', 'round', 'ivy', 'mixed']),
    bloom: pickRandom(['mixed', 'blossom', 'daisy', 'rose']), tendrils: chance(0.8), veins: chance(0.85) };
  d.glass = { style: pickRandom(GLASS_STYLES), set: pickRandom(['jewel', 'jewel', 'pastel', 'amber', 'sea', 'clear']), light: chance(0.9) };
  // Colours: a third keep the mode's own, the rest a random scheme
  if (chance(0.35)) d.palette = { mode: 'original', ink: '#000000', paper: '#ffffff', glow: '#ffffff', preset: 'custom', l2: null };
  else { const p = pickRandom(PALETTES); d.palette = { mode: 'tint', paper: p.bg, ink: p.ink, glow: p.glow, preset: p.id, l2: null }; }
  // Symmetry: off half the time
  const sr2 = Math.random();
  d.sym = sr2 < 0.5 ? { n: 1, mirror: false } : sr2 < 0.65 ? { n: 1, mirror: true } : { n: pickRandom([3, 4, 5, 6, 6, 8]), mirror: chance(0.5) };
  // Boundary (none 40%), and now and then a turned or enlarged design inside it
  d.boundary = { shape: chance(0.4) ? 'none' : pickRandom(['circle', 'square', 'pentagon', 'hexagon']), size: ri(26, 42) * 10, border: pickRandom(['single', 'single', 'double', 'none']) };
  d.xf = (d.boundary.shape !== 'none' || pageActive()) && chance(0.3)
    ? { scale: pickRandom([1, 1.2, 1.4, 1.6]), rot: pickRandom([0, 15, 30, 45, -15, -30]), x: 0, y: 0 } : { scale: 1, rot: 0, x: 0, y: 0 };
  // Layer 2 a quarter of the time, a different mode
  d.layer = chance(0.25)
    ? { mode: pickRandom(MODES.filter(m => m !== d.mode)), density: ri(2, 6), weight: +(0.4 + Math.random() * 0.6).toFixed(1), strength: ri(35, 75) }
    : { mode: 'none', density: 4, weight: 0.6, strength: 60 };
  applyDesign(d);
  // Nodes last: they fill the region the new boundary and symmetry leave
  S.nodes = randomNodes(ri(3, 8));
  fitNodes();
  openNode = -1;
  fitView();
  syncControls();
  renderNodeRoster();
  update();
}

function ambientScene(first = false) {
  if (!first) {
    S.mode = pickRandom(MODES);
    S.density = 4 + Math.floor(Math.random() * 5);
    S.sigma = Math.floor(Math.random() * 90);
    S.weight = +(0.6 + Math.random() * 1.2).toFixed(1);
    const n = pickRandom([1, 3, 4, 5, 6, 6, 7, 8, 8, 10, 12]);
    S.sym = { n, mirror: n > 1 && Math.random() < 0.6 };
    S.layer = { ...S.layer, mode: Math.random() < 0.35 ? pickRandom(MODES) : 'none' };
  }
  S.boundary = { ...S.boundary, shape: 'none' };
  S.page = { ...S.page, preset: 'none' };
  // Your colour scheme stays; flat 'own colours' become the scheme ramp,
  // which suits glowing modes better
  if (S.palette.mode === 'stencil') S.palette = { ...S.palette, mode: 'tint' };
  S.seed = randomSeed();
  if (S.layer.seed !== undefined) S.layer.seed = randomSeed();
  S.nodes = randomNodes(3 + Math.floor(Math.random() * 6));
  fitNodes();
  sceneZoom();
  ANIM.sceneAt = ANIM.time;
  ANIM.prev = null; ANIM.curKey = '';
  ANIM.cycleAt = ANIM.time;
  ANIM.nextMorph = ANIM.time + (ANIM.opts.draw ? ANIM_DRAW + ANIM_HOLD : ANIM_MORPH);
  // Fade through black between scenes (background colours differ per mode)
  canvas.style.transition = 'none'; canvas.style.opacity = '0';
  requestAnimationFrame(() => { canvas.style.transition = 'opacity 1.4s'; canvas.style.opacity = '1'; });
}

// The whole design (nodes within ~320, lines a little beyond) fits the
// shorter side of the screen
function sceneZoom() {
  const w = window.innerWidth, h = window.innerHeight;
  S.pan = { x: 0, y: 0 };
  S.zoom = (0.5 * Math.min(w, h)) / (340 * w / CC);
}

function enterAmbient() {
  if (ANIM.ambient) return;
  ANIM.snapshot = { zoom: S.zoom, pan: { ...S.pan }, playing: ANIM.playing, frozen: ANIM.frozen, showNodes: S.showNodes };
  ANIM.ambient = true; ANIM.scenes = false;
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

function enterScenes() {
  if (ANIM.ambient) return;
  ANIM.snapshot = { zoom: S.zoom, pan: { ...S.pan }, playing: ANIM.playing, showNodes: S.showNodes,
    design: getDesign(), opts: { ...ANIM.opts } };
  ANIM.ambient = true; ANIM.scenes = true;
  if (CUT.on) setCutPreview(false);
  setDrawer(false);
  document.body.classList.add('ambient');
  Object.assign(ANIM.opts, { draw: true, drift: true, glitch: false, flow: false, morph: true, spin: true, pulse: true, hue: true });
  S.showNodes = false;
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => { /* blocked in a frame: fill the window instead */ });
  layoutCanvas();
  ambientScene(true);
  if (!ANIM.playing) setPlaying(true);
  ambientCursor();
}

function exitAmbient() {
  if (!ANIM.ambient) return;
  const snap = ANIM.snapshot;
  ANIM.ambient = false;
  if (ANIM.scenes) {
    ANIM.scenes = false;
    canvas.style.transition = ''; canvas.style.opacity = '';
    applyDesign(snap.design);
    Object.assign(ANIM.opts, snap.opts);
    syncAnimControls();
  }
  document.body.classList.remove('ambient', 'hide-cursor');
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  S.zoom = snap.zoom; S.pan = snap.pan; S.showNodes = snap.showNodes;
  ANIM.snapshot = null;
  // Back to how it was: paused on a frame, or still (scenes always come back still)
  if (!snap.playing) setPlaying(false, !!snap.frozen && !snap.design);
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

// Panels sit under the toolbar, which can wrap: keep --tb-h current
function trackToolbar() {
  const tb = document.querySelector('.toolbar'), vp = document.getElementById('viewport');
  let h = -1;
  const set = () => {
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
  if (window.ResizeObserver) new ResizeObserver(set).observe(tb);
}

// Animation settings from saved UI state or a preset; unknown keys ignored,
// missing ones keep their current value
function setAnimOpts(a) {
  if (!a || typeof a !== 'object') return;
  Object.keys(ANIM.opts).forEach(k => { if (k in a) ANIM.opts[k] = k === 'speed' ? clampNum(a.speed, 0.25, 3, 1) : k === 'driftAmt' ? clampNum(a.driftAmt, 0.25, 2.5, 1)
    : k === 'glyphP' ? clampNum(a.glyphP, 0, 10, 3.5) : k === 'dewSpd' ? clampNum(a.dewSpd, 0.25, 3, 1)
    : ANIM_FX_SLIDERS.some(f => f[0] === k) ? (f => clampNum(a[k], f[2], f[3], 1))(ANIM_FX_SLIDERS.find(f => f[0] === k)) : !!a[k]; });
  if (ANIM.opts.flow && ANIM.opts.glitch) ANIM.opts.glitch = false;   // they exclude each other
}
// A preset (Save .json, favourites) is the design plus its animation settings.
// The animation settings stay out of getDesign(), so Undo does not touch them.
function getPreset() { return { ...getDesign(), anim: { ...ANIM.opts } }; }
function applyPresetFile(d) {
  applyDesign(d);
  if (d && d.anim) {
    setAnimOpts(d.anim);
    syncAnimControls();
    ANIM.cycleAt = ANIM.time; ANIM.nextMorph = ANIM.time + (ANIM.opts.draw ? ANIM_DRAW + ANIM_HOLD : ANIM_MORPH);
    saveUi({ anim: { ...ANIM.opts } });
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
  $('an-tips-x').addEventListener('click', () => { ANIM.tipsOff = true; $('an-tips').classList.add('hidden'); });
  // Blink: the eyes look at the pointer, wherever it is in the window
  window.addEventListener('pointermove', e => {
    if (!ANIM.opts.blink) return;
    const r = canvas.getBoundingClientRect();
    if (r.width && r.height) ANIM.pointer = { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height };
  }, { passive: true });
  $('btn-scenes').addEventListener('click', enterScenes);
  $('ambient-exit').addEventListener('click', exitAmbient);
  ANIM_BOOLS.forEach(k => $('an-' + k).addEventListener('change', e => {
    ANIM.opts[k] = e.target.checked;
    // Flow and Glitch exclude each other
    const other = { flow: 'glitch', glitch: 'flow' }[k];
    if (other && e.target.checked) { ANIM.opts[other] = false; $('an-' + other).checked = false; }
    syncAnimRelevance();
    if (k === 'morph' || k === 'draw') { ANIM.cycleAt = ANIM.time; ANIM.nextMorph = ANIM.time + (ANIM.opts.draw ? ANIM_DRAW + ANIM_HOLD : ANIM_MORPH); }
    saveUi({ anim: { ...ANIM.opts } });
  }));
  $('an-driftamt').addEventListener('input', e => {
    ANIM.opts.driftAmt = parseFloat(e.target.value);
    syncAnimControls();
    saveUi({ anim: { ...ANIM.opts } });
  });
  ANIM_FX_SLIDERS.forEach(([k, id]) => $('an-' + id).addEventListener('input', e => {
    ANIM.opts[k] = parseFloat(e.target.value);
    syncAnimControls();
    saveUi({ anim: { ...ANIM.opts } });
  }));
  $('an-dewspd').addEventListener('input', e => {
    ANIM.opts.dewSpd = parseFloat(e.target.value);
    syncAnimControls();
    saveUi({ anim: { ...ANIM.opts } });
  });
  $('an-glyphp').addEventListener('input', e => {
    ANIM.opts.glyphP = parseFloat(e.target.value);
    syncAnimControls();
    saveUi({ anim: { ...ANIM.opts } });
  });
  $('an-speed').addEventListener('input', e => {
    ANIM.opts.speed = parseFloat(e.target.value);
    syncAnimControls();
    saveUi({ anim: { ...ANIM.opts } });
  });
  ['mousemove', 'pointerdown', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { if (ANIM.ambient) ambientCursor(); }, { passive: true }));
  // Leaving browser full screen (Esc) also leaves ambient mode
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && ANIM.ambient) exitAmbient(); });
  window.addEventListener('resize', () => { if (ANIM.ambient) { layoutCanvas(); ANIM.scenes ? sceneZoom() : ambientZoom(); } });
}
