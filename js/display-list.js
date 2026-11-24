// ── DISPLAY LIST (record once, replay for symmetry copies / wrap / pan) ────
// Rec records a renderer's calls; replay plays them onto any context.
// Every renderer is function(c, nodes, density 1–10, sigma = jitter 0–100,
// weight = stroke width, seed in [0, 1)) and draws only through c.
// Used by: renderDesign (getDisplayList), animRecord (recordDL), dlKey by draw().
const REC_METHODS = ['save', 'restore', 'translate', 'scale', 'rotate', 'beginPath', 'moveTo', 'lineTo',
  'closePath', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'rect', 'roundRect', 'fillRect', 'fill', 'stroke',
  'setLineDash', 'clip', 'fillText', 'strokeText'];
const REC_PROPS = ['lineWidth', 'strokeStyle', 'fillStyle', 'globalAlpha', 'lineCap', 'lineJoin',
  'shadowBlur', 'shadowColor', 'font', 'textAlign', 'textBaseline'];

class Rec {
  constructor() { this.ops = []; this._s = {}; }
}
REC_METHODS.forEach(m => { Rec.prototype[m] = function (...a) { this.ops.push(0, m, a); }; });
REC_PROPS.forEach(p => Object.defineProperty(Rec.prototype, p, {
  get() { return this._s[p]; },
  set(v) { this._s[p] = v; this.ops.push(1, p, v); }
}));

// Renderers mark where their glow ends (nebula), so the glow can be drawn
// apart: soft-edged across rotational symmetry wedges
Rec.prototype.markGlowEnd = function () { this.ops.glowEnd = this.ops.length; };
// Microscope marks its nuclei as eyes (Blink): a side list on the ops, drawn over per frame
Rec.prototype.markEye = function (e) { (this.ops.eyes || (this.ops.eyes = [])).push(e); };
// Constellation and Nebula mark their stars (Twinkle): a side list ops.stars of
// { x, y, r, col, kind, sp, dim, k }, k = the op index of the star's first path
// op (for Draw on). Call right after beginPath. No R() draws.
// Lightning marks its bolts and branches (Strikes): ops.light = { bolts: [{ pts,
// w, id, a, b }], branches: [{ pts, w, id, pid, depth }] }; pid < 0 = grown off
// node -1 - pid. No R() draws.
Rec.prototype.markBolts = function (L) { this.ops.light = L; };
Rec.prototype.markStar = function (st) { st.k = this.ops.length / 3; (this.ops.stars || (this.ops.stars = [])).push(st); };
// Cathedral Glass and Stained Glass mark their pieces (Sunlight): ops.panes of
// { pts, col, lw, lead, light } (Cathedral: redrawn brighter) or { pts, glow, lw,
// lead } (leaded: a warm glow, then the lead again); k = the op index of the
// piece's first path op (for Draw on). Heavier leads drawn over the pieces
// (rose tracery, the window's came): ops.leads of { pts, lw, lead }. No R() draws.
Rec.prototype.markPane = function (p) { p.k = this.ops.length / 3; (this.ops.panes || (this.ops.panes = [])).push(p); };
// Foam marks its bubbles (Breathing): ops.bubbles of { x, y, r, d }, d = the
// distance from the bubble's centre to the nearest node. No R() draws.
Rec.prototype.markBubbles = function (B) { this.ops.bubbles = B; };
// Vines mark their flowers (Falling petals): ops.petals of { x, y, r, col, bg,
// big, g }, g = the flower's grow group (Draw on: petals only from an open
// flower). Call right after grow(). No R() draws.
Rec.prototype.markPetal = function (p) { const G = this.ops.grow; p.g = G && G.length ? G[G.length - 1] : null; (this.ops.petals || (this.ops.petals = [])).push(p); };
// Vines with Seasons playing mark every leaf (Falling leaves): ops.leafFall of
// { x, y, a, L, shape, tf, y0, col, bg, g }: its centre, angle and length,
// when in the year it falls (tf), the list's season at Play (y0) and its
// autumn colour; g = its grow group, if drawn (null once fallen).
Rec.prototype.markLeaf = function (l) { (this.ops.leafFall || (this.ops.leafFall = [])).push(l); };
Rec.prototype.markLead = function (l) { (this.ops.leads || (this.ops.leads = [])).push(l); };
// Renderers mark what belongs to a node (Arcane constructs, Microscope cells,
// Chaosgate main glyphs): own(i) until own(-1). A side list of (op index,
// node) pairs; Fit nodes reads it (ownedHulls) to keep that part inside.
Rec.prototype.own = function (i) { (this.ops.own || (this.ops.own = [])).push(this.ops.length, i); };
// Turning rings (Arcane): turn(x, y, w) … turn(null) marks ops that rotate
// round (x, y) at w rad/s while Turning rings plays (replayAnim, F.rt). A side
// list of { i0, i1, x, y, w } (op indexes, in recording order, not nested);
// the ops themselves are unchanged, so stills and exports are not affected.
Rec.prototype.turn = function (x, y, w) {
  const L = this.ops.turns || (this.ops.turns = []);
  if (x === null) { if (L.length && L[L.length - 1].i1 < 0) L[L.length - 1].i1 = this.ops.length; }
  else L.push({ i0: this.ops.length, i1: -1, x, y, w });
};

// Life (Microscope): life(g) … life(null) marks a group of ops: an organism
// that swims, or a cell whose membrane wobbles and cilia beat. A side list
// ops.life of g + { i0, i1 } (op indexes, in recording order, not nested);
// replayAnim moves the group (lifeMove) and/or redraws it (lifeDraw) while
// Life plays, so stills and exports are not affected. No R() draws.
Rec.prototype.life = function (g) {
  const L = this.ops.life || (this.ops.life = []);
  if (g === null) { if (L.length && L[L.length - 1].i1 < 0) L[L.length - 1].i1 = this.ops.length; }
  else { g.i0 = this.ops.length; g.i1 = -1; L.push(g); }
};

// Growing in stages (Vines, Draw on): grow(g) … grow(null) marks a leaf, bud
// or flower: g = { x, y, kind: 'leaf' | 'bud' | 'flower' }, (x, y) where it
// grows from. A side list ops.grow of g + { i0, i1 } (op indexes, not nested);
// replayAnim scales the group up round (x, y) while it unfolds or opens, so
// stills and exports are not affected. No R() draws.
Rec.prototype.grow = function (g) {
  const L = this.ops.grow || (this.ops.grow = []);
  if (g === null) { if (L.length && L[L.length - 1].i1 < 0) L[L.length - 1].i1 = this.ops.length; }
  else { g.i0 = this.ops.length; g.i1 = -1; L.push(g); }
};

// What a recording may read besides S, passed explicitly to every renderer as
// c.live (read through liveOf(c)): the live animation inputs (null in stills
// and exports) and, for a PCB Layer 2 over a PCB main, the main board's copper.
//   dewT: animation time for rolling dew (Spiderweb)   bloomT: time for Bloom,
//   seasonT: years gone by for Seasons (Vines)   glyphT / glyphP: time and
//   period for Symbol swap, chaosBase: the real node positions while drifting
//   (Arcane, Chaosgate)   obst: PCB obstacles (renderPCB.lastObst of the main)
const REC_STILL = Object.freeze({ dewT: null, bloomT: null, seasonT: null, glyphT: null, glyphP: 3.5, chaosBase: null, obst: null });
function liveOf(c) { return (c && c.live) || REC_STILL; }
function record(fn, live = REC_STILL) {
  const r = new Rec();
  r.live = live;
  r.globalAlpha = 1;
  r.shadowBlur = 0;
  r.setLineDash([]);
  r.lineWidth = 1;
  fn(r);
  r.ops.rn = S.nodes.map(n => ({ x: n.x, y: n.y }));   // the nodes it was recorded at (Current)
  return r.ops;
}

function replay(ops, c, alphaMul = 1) {
  for (let i = 0; i < ops.length; i += 3) {
    if (ops[i] === 0) {
      c[ops[i + 1]](...ops[i + 2]);
    } else {
      let v = ops[i + 2];
      if (alphaMul !== 1 && ops[i + 1] === 'globalAlpha') v *= alphaMul;
      c[ops[i + 1]] = v;
    }
  }
}

const RENDERERS = {
  pcb: renderPCB, foam: renderFoam, web: renderWeb, constellation: renderConstellation,
  chaosgate: renderChaosgate, arcane: renderArcane, stained: renderStained, spiderweb: renderSpiderweb, nebula: renderNebula,
  lightning: renderLightning, microscope: renderMicroscope, vine: renderVine, glass: renderGlass
};
const MODES = Object.keys(RENDERERS);

function renderMode(c, mode, density, weight, sd) {
  c.strokeStyle = '#ddd6c8';
  c.lineCap = 'round';
  c.lineJoin = 'round';
  if (mode === 'web') drawManifold(c, S.nodes, S.sigma, weight);
  RENDERERS[mode](c, S.nodes, density, S.sigma, weight, sd);
}

const DL = { key: null, main: null, layer: null };

// Everything the recorded display list depends on (palette, symmetry, the
// design transform and the page are applied when drawing, so they are not in it)
function dlKey() {
  const nodeKey = S.nodes.map(n => [n.x, n.y, n.size, n.w]);
  return JSON.stringify([S.mode, S.density, S.sigma, S.weight, S.seed, S.dew, S.curved, S.curve, S.pcb, S.nebula, S.lightning, S.chaos, S.stained, S.arcane, S.micro, S.vine, S.glass, S.layer, S.boundary, nodeKey]);
}
function getDisplayList() {
  const key = dlKey();
  if (key !== DL.key) {
    DL.key = key;
    Object.assign(DL, recordDL());
  }
  return DL;
}

// Records main + layer for the current S (no caching). live: see REC_STILL.
// PCB on PCB: the layer is routed round the main board's copper (live.obst)
// While playing, a layer whose inputs did not change since the last recording
// keeps that recording (REC_MEMO): live re-records for one layer (Bloom on
// Vines, Rolling dew, Symbol swap) then leave the other alone, so its item
// cache and Draw on times survive. A layer's inputs: everything in dlKey()
// plus the live inputs its mode reads (recTimeKey).
const REC_MEMO = { main: null, layer: null };
function recTimeKey(mode, L) {
  return mode === 'vine' ? [L.bloomT, L.seasonT] : mode === 'spiderweb' ? [L.dewT]
    : mode === 'arcane' || mode === 'chaosgate' ? [L.glyphT, L.glyphP, L.chaosBase ? L.chaosBase.map(n => [n.x, n.y]) : null] : [];
}
function recMemo(slot, mode, live, fn) {
  if (!ANIM.playing) { REC_MEMO[slot] = null; return fn(); }
  const base = dlKey(), key = base + JSON.stringify(recTimeKey(mode, live)), m = REC_MEMO[slot];
  if (m && m.key === key) return m.ops;
  const ops = fn();
  // Same design, only a live input moved (Bloom: petal lengths): when the ops
  // line up one for one, keep the Draw on times instead of working them out
  // again every frame (a stroke cut at the pen tip may use the old end points)
  if (m && m.base === base && m.ops.length === ops.length && (m.ops._A || m.ops._AN) && sameOps(m.ops, ops)) {
    if (m.ops._A) ops._A = m.ops._A;
    if (m.ops._AN) ops._AN = m.ops._AN;
  }
  REC_MEMO[slot] = { key, base, ops };
  return ops;
}
function sameOps(a, b) {
  for (let i = 0; i < a.length; i += 3) if (a[i] !== b[i] || a[i + 1] !== b[i + 1]) return false;
  return true;
}
function recordDL(live = REC_STILL) {
  const main = recMemo('main', S.mode, live, () => record(r => renderMode(r, S.mode, S.density, S.weight, seedF()), live));
  if (S.layer.mode === 'none' || !RENDERERS[S.layer.mode]) return { main, layer: null };
  const liveL = S.mode === 'pcb' && S.layer.mode === 'pcb' ? { ...live, obst: renderPCB.lastObst } : live;
  return { main, layer: recMemo('layer', S.layer.mode, liveL, () => withLayerOpts(() => record(r => renderMode(r, S.layer.mode, S.layer.density, S.layer.weight, layerSeed() / 1000000), liveL))) };
}

// ── Draw-on timing ──
// Every op of a display list gets a time, so the design draws on outward from
// the nodes along its own lines: a subpath starts at its distance from the
// nearest node and runs on at 0.6 × its length (world units, through the
// recorded translate/rotate/scale). kind per op:
//   0 state (always runs)   1 stroke-path op (drawn up to the time; the op
//   being drawn is cut at the pen tip)   2 op of a filled path (the whole
//   path appears at once, at its earliest subpath start)   3 op of a clip
//   path (always drawn)   4 fillRect / text (appears at its time)
//   5 paint: stroke / fill / clip (always runs; an empty path paints nothing)
// Cached on the array (lists made by splitGlow borrow their parent's times).
// Each op also records its node (nid: nearest node to its subpath start), so
// Draw on can run per node: animTimesNode paces every node's ops 0–1 on their own.
// Used by: drawSymmetric (replayAnim) while an item is drawing on.
function arcSweep(a0, a1, ccw) {
  const T = Math.PI * 2, d = ccw ? a0 - a1 : a1 - a0;
  return d >= T ? T : ((d % T) + T) % T;
}
function animTimes(ops) {
  if (ops._A) return ops._A;
  if (ops._P) return (ops._A = animTimesSplit(ops._P));
  const n = ops.length / 3;
  const { pid, pFill, pClip, p } = animPathIds(ops, n);
  const A = animTimesWalk(ops, n, pid, pFill, pClip, p);
  // Pacing: the raw times are kept, the paced ones run 0–1
  const { kind, ts, te, pathT } = A;
  A.raw = { ts: ts.slice(), te: te.slice(), pathT: pathT.slice() };
  const keys = [];
  for (let k = 0; k < n; k++) if (kind[k] === 1 || kind[k] === 4) keys.push(te[k]); else if (kind[k] === 2) keys.push(ts[k]);
  const warp = animPace(keys, A.max);
  for (let k = 0; k < n; k++) { ts[k] = warp(ts[k]); te[k] = warp(te[k]); }
  for (let q = 0; q < pathT.length; q++) pathT[q] = warp(pathT[q]);
  A.max = 1;
  return (ops._A = A);
}

// A list split off another (splitGlow): pick the parent's times (-1 = state op)
function animTimesSplit(sp) {
  const P = animTimes(sp.parent), idx = sp.idx, n = idx.length;
  const A = { kind: new Uint8Array(n), ts: new Float64Array(n), te: new Float64Array(n), sx: new Float64Array(n), sy: new Float64Array(n),
    ex: new Float64Array(n), ey: new Float64Array(n), pid: new Int32Array(n), nid: new Int32Array(n), pathT: P.pathT, pathNid: P.pathNid, max: P.max };
  idx.forEach((j, k) => {
    if (j < 0) return;
    A.kind[k] = P.kind[j]; A.ts[k] = P.ts[j]; A.te[k] = P.te[j]; A.sx[k] = P.sx[j]; A.sy[k] = P.sy[j];
    A.ex[k] = P.ex[j]; A.ey[k] = P.ey[j]; A.pid[k] = P.pid[j]; A.nid[k] = P.nid[j];
  });
  return A;
}

// Path ids per op (pid; a beginPath starts the next) and which paths get
// filled (pFill) or clipped (pClip); p = the last id
function animPathIds(ops, n) {
  const pid = new Int32Array(n), pFill = [], pClip = [];
  let p = 0;
  for (let k = 0; k < n; k++) {
    const m = ops[k * 3 + 1];
    if (ops[k * 3] === 0) {
      if (m === 'beginPath') p++;
      else if (m === 'fill') pFill[p] = 1;
      else if (m === 'clip') pClip[p] = 1;
    }
    pid[k] = p;
  }
  return { pid, pFill, pClip, p };
}

// A canvas transform op on the matrix M (with the save stack): returns the
// new matrix, or null when m is not a transform op
function animTimesMatrix(M, stack, m, a) {
  switch (m) {
    case 'save': stack.push(M.slice()); return M;
    case 'restore': return stack.pop() || M;
    case 'translate': M[4] += M[0] * a[0] + M[2] * a[1]; M[5] += M[1] * a[0] + M[3] * a[1]; return M;
    case 'scale': M[0] *= a[0]; M[1] *= a[0]; M[2] *= a[1]; M[3] *= a[1]; return M;
    case 'rotate': {
      const co = Math.cos(a[0]), si = Math.sin(a[0]), [m0, m1, m2, m3] = M;
      M[0] = m0 * co + m2 * si; M[1] = m1 * co + m3 * si; M[2] = m2 * co - m0 * si; M[3] = m3 * co - m1 * si;
      return M;
    }
  }
  return null;
}

// The pen walk: every op's kind, raw start and end times (world distance
// from the nearest node, then along the path), local ends, and nodes
function animTimesWalk(ops, n, pid, pFill, pClip, p) {
  const kind = new Uint8Array(n), ts = new Float64Array(n), te = new Float64Array(n);
  const sx = new Float64Array(n), sy = new Float64Array(n), ex = new Float64Array(n), ey = new Float64Array(n);
  const pathT = new Float64Array(p + 1).fill(Infinity), pathNid = new Int32Array(p + 1);
  const nid = new Int32Array(n);
  const nodes = S.nodes;
  // Distance to the nearest node; nearI = that node, curN = the subpath's node
  let nearI = 0, curN = 0;
  const near = (x, y) => {
    let d = nodes.length ? Infinity : 0;
    nodes.forEach((q, i) => { const e = Math.hypot(x - q.x, y - q.y); if (e < d) { d = e; nearI = i; } });
    return d;
  };
  let M = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const tp = (x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
  const scl = () => Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2]));
  // Pen: local current point (cx, cy), its world position (wx, wy), the time
  // there (t), and the subpath start (local)
  let has = false, cx = 0, cy = 0, wx = 0, wy = 0, t = 0, s0x = 0, s0y = 0, max = 0;
  const start = (x, y) => { has = true; cx = s0x = x; cy = s0y = y; [wx, wy] = tp(x, y); t = near(wx, wy); curN = nearI; };
  const to = (x, y, len) => { cx = x; cy = y; [wx, wy] = tp(x, y); t += 0.6 * len; };
  const wl = (x, y) => { const [X, Y] = tp(x, y); return Math.hypot(X - wx, Y - wy); };
  for (let k = 0; k < n; k++) {
    const m = ops[k * 3 + 1], a = ops[k * 3 + 2];
    if (ops[k * 3] === 1) continue;                     // property: kind 0
    let path = true;
    sx[k] = cx; sy[k] = cy;
    const M2 = animTimesMatrix(M, stack, m, a);
    if (M2) { M = M2; continue; }
    switch (m) {
      case 'beginPath': has = false; path = false; break;
      case 'setLineDash': path = false; break;
      case 'stroke': case 'fill': case 'clip': kind[k] = 5; path = false; break;
      case 'fillRect': case 'fillText': case 'strokeText': {
        const [X, Y] = tp(a[m === 'fillRect' ? 0 : 1], a[m === 'fillRect' ? 1 : 2]);
        kind[k] = 4; ts[k] = te[k] = near(X, Y); nid[k] = nearI; max = Math.max(max, te[k]); path = false; break;
      }
      case 'moveTo': case 'rect': case 'roundRect': start(a[0], a[1]); ts[k] = t; break;
      case 'lineTo':
        if (!has) { start(a[0], a[1]); ts[k] = t; break; }
        ts[k] = t; to(a[0], a[1], wl(a[0], a[1])); break;
      case 'quadraticCurveTo': case 'bezierCurveTo': {
        const q = m === 'quadraticCurveTo' ? [a[0], a[1], a[2], a[3]] : [a[0], a[1], a[2], a[3], a[4], a[5]];
        const X = q[q.length - 2], Y = q[q.length - 1];
        if (!has) start(q[0], q[1]);
        // Length ≈ mean of the chord and the control polygon
        let poly = 0, px = cx, py = cy;
        const [W0, V0] = [wx, wy];
        for (let j = 0; j < q.length; j += 2) { const [A1, B1] = tp(q[j], q[j + 1]), [A0, B0] = tp(px, py); poly += Math.hypot(A1 - A0, B1 - B0); px = q[j]; py = q[j + 1]; }
        const [XE, YE] = tp(X, Y);
        sx[k] = cx; sy[k] = cy; ts[k] = t;
        to(X, Y, (poly + Math.hypot(XE - W0, YE - V0)) / 2);
        break;
      }
      case 'arc': {
        const [x, y, r, a0, a1, ccw] = a, sw = arcSweep(a0, a1, !!ccw);
        const bx = x + r * Math.cos(a0), by = y + r * Math.sin(a0);
        if (!has) start(bx, by); else to(bx, by, wl(bx, by));
        sx[k] = bx; sy[k] = by; ts[k] = t;
        const e = a0 + (ccw ? -sw : sw);
        to(x + r * Math.cos(e), y + r * Math.sin(e), r * sw * scl());
        break;
      }
      case 'closePath':
        ts[k] = t; ex[k] = s0x; ey[k] = s0y;
        if (has) to(s0x, s0y, wl(s0x, s0y));
        cx = s0x; cy = s0y;
        break;
      default: path = false;
    }
    if (!path) continue;
    te[k] = t; nid[k] = curN;
    if (m !== 'closePath') { ex[k] = cx; ey[k] = cy; }
    const P = pid[k];
    kind[k] = pClip[P] ? 3 : pFill[P] ? 2 : 1;
    if (kind[k] === 2 && ts[k] < pathT[P]) { pathT[P] = ts[k]; pathNid[P] = curN; }
    if (kind[k] !== 3) max = Math.max(max, kind[k] === 2 ? ts[k] : te[k]);
  }
  return { kind, ts, te, sx, sy, ex, ey, pid, nid, pathT, pathNid, max };
}

// Pacing: half geometric time, half rank (the share of ops due by then), so
// a few very long lines (an outer ring) can't rush everything else through.
// keys: the times ops are due (sorted here); max: the latest. Returns time → 0–1.
function animPace(keys, max) {
  keys.sort((x, y) => x - y);
  const N = keys.length;
  return x => {
    if (!isFinite(x) || N < 2 || !(max > 0)) return isFinite(x) ? 0 : x;
    let lo = 0, hi = N - 1;
    if (x <= keys[0]) return 0.5 * x / max;
    if (x >= keys[hi]) return 0.5 * x / max + 0.5;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (keys[mid] <= x) lo = mid; else hi = mid; }
    const f = keys[hi] > keys[lo] ? (x - keys[lo]) / (keys[hi] - keys[lo]) : 0;
    return 0.5 * x / max + 0.5 * (lo + f) / (N - 1);
  };
}

// The same ops paced per node: each node's own ops run 0–1, so with Draw on
// per node a node's part is complete at its own progress 1 (see animTick).
function animTimesNode(ops) {
  if (ops._AN) return ops._AN;
  const A = animTimes(ops);
  if (ops._P) {
    const P = animTimesNode(ops._P.parent), idx = ops._P.idx, n = idx.length;
    const ts = new Float64Array(n), te = new Float64Array(n);
    idx.forEach((j, k) => { if (j >= 0) { ts[k] = P.ts[j]; te[k] = P.te[j]; } });
    return (ops._AN = { ...A, ts, te, pathT: P.pathT });
  }
  const { kind, nid, pathNid, raw } = A, n = kind.length;
  const keys = [], max = [];
  for (let k = 0; k < n; k++) {
    const v = kind[k] === 1 || kind[k] === 4 ? raw.te[k] : kind[k] === 2 ? raw.ts[k] : null;
    if (v === null) continue;
    const i = nid[k];
    (keys[i] || (keys[i] = [])).push(v);
    max[i] = Math.max(max[i] || 0, v);
  }
  const warps = keys.map((q, i) => q && animPace(q, max[i]));
  const w = (i, x) => warps[i] ? warps[i](x) : (isFinite(x) ? 0 : x);
  const ts = new Float64Array(n), te = new Float64Array(n), pathT = new Float64Array(raw.pathT.length);
  for (let k = 0; k < n; k++) { ts[k] = w(nid[k], raw.ts[k]); te[k] = w(nid[k], raw.te[k]); }
  for (let q = 0; q < pathT.length; q++) pathT[q] = w(pathNid[q], raw.pathT[q]);
  return (ops._AN = { ...A, ts, te, pathT });
}

// Draws the start of op m, a fraction u of the way along (the pen tip)
function partialOp(c, m, a, u, sx, sy, ex, ey) {
  const L = (p, q) => p + (q - p) * u;
  if (m === 'lineTo') c.lineTo(L(sx, a[0]), L(sy, a[1]));
  else if (m === 'closePath') c.lineTo(L(sx, ex), L(sy, ey));
  else if (m === 'quadraticCurveTo') {
    const ax = L(sx, a[0]), ay = L(sy, a[1]), bx = L(a[0], a[2]), by = L(a[1], a[3]);
    c.quadraticCurveTo(ax, ay, ax + (bx - ax) * u, ay + (by - ay) * u);
  } else if (m === 'bezierCurveTo') {
    const p1x = L(sx, a[0]), p1y = L(sy, a[1]), mx = L(a[0], a[2]), my = L(a[1], a[3]), p3x = L(a[2], a[4]), p3y = L(a[3], a[5]);
    const q1x = p1x + (mx - p1x) * u, q1y = p1y + (my - p1y) * u, q2x = mx + (p3x - mx) * u, q2y = my + (p3y - my) * u;
    c.bezierCurveTo(p1x, p1y, q1x, q1y, q1x + (q2x - q1x) * u, q1y + (q2y - q1y) * u);
  } else if (m === 'arc') {
    const [x, y, r, a0, a1, ccw] = a, sw = arcSweep(a0, a1, !!ccw);
    c.arc(x, y, r, a0, a0 + (ccw ? -sw : sw) * u, !!ccw);
  }
}

// Growing in stages (Vines): while a list with grow groups draws on, its
// stems and tendrils (everything outside the groups) are drawn by
// GROW_STEM of the progress; a leaf unfolds from its base GROW_LEAF_DELAY after
// the stem reaches it, over GROW_LEAF; buds and flowers open from GROW_BLOOM_AT
// (or GROW_TIP_DELAY after their tip is reached, if later) over GROW_BLOOM.
// Drawing back runs the same stages backwards. A group's time and node come
// from its first path op (animTimes / animTimesNode).
const GROW_STEM = 0.6, GROW_LEAF = 0.2, GROW_LEAF_DELAY = 0.03, GROW_BLOOM = 0.3, GROW_BLOOM_AT = 0.5, GROW_TIP_DELAY = 0.1;
const GROW_TWIST = { leaf: 0.45, bud: 0.3, flower: 0.8 };
function growAmt(ops, g, A, np, tau0) {
  if (g._k0 === undefined) {
    g._k0 = -1;
    for (let q = g.i0; q < g.i1; q += 3) {
      const m = ops[q + 1];
      if (ops[q] === 0 && (m === 'moveTo' || m === 'lineTo' || m === 'arc' || m === 'quadraticCurveTo' || m === 'bezierCurveTo' || m === 'rect')) { g._k0 = q / 3; break; }
    }
  }
  const k = g._k0;
  if (k < 0) return 1;
  const filled = A.kind[k] === 2;
  const tg = Math.min(1, filled ? A.pathT[A.pid[k]] : A.ts[k]);
  const node = filled ? A.pathNid[A.pid[k]] : A.nid[k];
  const tau = np ? (np[node] ?? 1) : tau0;
  const leaf = g.kind === 'leaf';
  const start = leaf ? tg * GROW_STEM + GROW_LEAF_DELAY : Math.max(GROW_BLOOM_AT, tg * GROW_STEM + GROW_TIP_DELAY);
  return Math.max(0, Math.min(1, (tau - start) / (leaf ? GROW_LEAF : GROW_BLOOM)));
}
// Scale (eased, at least 2%) and twist for a group at growth u
function growXf(g, u) {
  const e = 1 - Math.pow(1 - u, 3);
  return { s: Math.max(0.02, e), a: (1 - e) * (GROW_TWIST[g.kind] || 0) };
}
function growBy(c, g, X, back) {
  c.translate(g.x, g.y);
  if (!back) { c.rotate(X.a); c.scale(X.s, X.s); } else { c.scale(1 / X.s, 1 / X.s); c.rotate(-X.a); }
  c.translate(-g.x, -g.y);
}

// Replay with animation controls: alpha and line-width multipliers, and the
// draw-on progress 0–1 (see animTimes). np: progress per node (Draw on per
// node), used instead of prog while prog < 1. State ops always run, so saves
// and transforms stay balanced at any progress.
function replayAnim(ops, c, alphaMul, lwMul, prog = 1, np = null, rt = 0, lt = null) {
  const A = prog < 1 ? (np ? animTimesNode(ops) : animTimes(ops)) : null, tau0 = A ? prog * A.max : Infinity;
  let tau = tau0;
  // Turning rings: rotate round the group's centre from i0 until i1
  const TL = rt && ops.turns ? ops.turns : null;
  let tj = 0, tOn = null;
  const turnBy = (T, a) => { c.translate(T.x, T.y); c.rotate(a); c.translate(-T.x, -T.y); };
  // Life: move the group (organisms swim), redraw it live (wobble, beat, lobes)
  const LL = lt != null && ops.life ? ops.life : null;
  let lj = 0, lOn = null, lMv = null;
  const moveBy = (g, M, back) => {
    if (!back) { c.translate(g.x + M.dx, g.y + M.dy); c.rotate(M.da); c.translate(-g.x, -g.y); }
    else { c.translate(g.x, g.y); c.rotate(-M.da); c.translate(-g.x - M.dx, -g.y - M.dy); }
  };
  // Growing in stages (Vines): only while drawing on
  const GR = A && ops.grow ? ops.grow : null;
  let gj = 0, gOn = null, gX = null;
  const setProp = (m, v) => {
    if (m === 'globalAlpha') v *= alphaMul;
    else if (m === 'lineWidth') v *= lwMul;
    c[m] = v;
  };
  for (let i = 0, k = 0; i < ops.length; i += 3, k++) {
    if (GR) {
      if (gOn && i >= gOn.i1) { if (gX) growBy(c, gOn, gX, true); gOn = gX = null; }
      let skip = false;
      while (!gOn && gj < GR.length && i >= GR[gj].i0) {
        const g = GR[gj++];
        if (g.i1 < 0) g.i1 = ops.length;
        if (g.i1 <= i) continue;
        const u = growAmt(ops, g, A, np, tau0);
        if (u <= 0) {
          // not grown yet: only its state ops (the next ops may rely on them)
          for (let q = i; q < g.i1; q += 3) if (ops[q] === 1) setProp(ops[q + 1], ops[q + 2]);
          i = g.i1 - 3; k = g.i1 / 3 - 1; skip = true; break;
        }
        gOn = g;
        gX = u < 1 ? growXf(g, u) : null;
        if (gX) growBy(c, g, gX, false);
      }
      if (skip) continue;
    }
    if (TL) {
      if (tOn && i >= tOn.i1) { turnBy(tOn, -tOn.w * rt); tOn = null; }
      if (!tOn && tj < TL.length && i >= TL[tj].i0) { tOn = TL[tj++]; if (tOn.i1 < 0) tOn.i1 = ops.length; turnBy(tOn, tOn.w * rt); }
    }
    if (LL) {
      if (lOn && i >= lOn.i1) { if (lMv) moveBy(lOn, lMv, true); lOn = lMv = null; }
      let skip = false;
      while (!lOn && lj < LL.length && i >= LL[lj].i0) {
        const g = LL[lj++];
        if (g.i1 < 0) g.i1 = ops.length;
        if (g.i1 <= i) continue;
        lOn = g;
        lMv = lifeMove(g, lt);
        if (lMv) moveBy(g, lMv, false);
        // Redrawn live once it is fully drawn in (Draw on); until then, the recorded ops
        if ((g.kind === 'cell' || g.amoeba) && (!A || lifeShown(ops, g, prog, np))) {
          lifeDraw(c, g, lt, alphaMul, lwMul);
          i = g.i1 - 3; k = g.i1 / 3 - 1; skip = true;
        }
      }
      if (skip) continue;
    }
    const m = ops[i + 1];
    if (ops[i] === 1) { setProp(m, ops[i + 2]); continue; }
    if (A && !gOn) {
      const kd = A.kind[k];
      if (np) tau = np[kd === 2 ? A.pathNid[A.pid[k]] : A.nid[k]] ?? 1;
      const tk = GR ? tau / GROW_STEM : tau;        // Growing in stages: stems and tendrils first
      if (kd === 1 || kd === 4) {
        if (A.te[k] > tk) {
          if (kd === 1 && A.ts[k] < tk && A.te[k] > A.ts[k]) partialOp(c, m, ops[i + 2], (tk - A.ts[k]) / (A.te[k] - A.ts[k]), A.sx[k], A.sy[k], A.ex[k], A.ey[k]);
          continue;
        }
      } else if (kd === 2 && A.pathT[A.pid[k]] > tk) continue;
    }
    c[m](...ops[i + 2]);
  }
  if (tOn) turnBy(tOn, -tOn.w * rt);
  if (lOn && lMv) moveBy(lOn, lMv, true);
  if (gOn && gX) growBy(c, gOn, gX, true);
}
