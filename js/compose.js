// ── PAGE FORMAT ────────────────────────────────────────────────────────────
// Used by: framing, rendering (page clip), node placement, the Page controls.
const PAGE_PRESETS = {
  poker: [63, 88], bridge: [57, 89], tarot: [70, 120], bizeu: [85, 55], bizus: [89, 51],
  a6: [105, 148], a5: [148, 210], a4: [210, 297], a3: [297, 420]
};
const PAGE_WORLD = 800;    // longest page side in world units

function pageActive() { return S.page.preset !== 'none'; }

// Page size in mm (px pages convert through the export DPI)
function pageMm() {
  const P = S.page;
  const k = P.unit === 'px' ? 25.4 / E.dpi : 1;
  return { w: P.w * k, h: P.h * k, bleed: P.bleed };
}

// World-space rectangle of the page; withBleed adds the bleed margin
function pageRect(withBleed) {
  const m = pageMm();
  const k = PAGE_WORLD / Math.max(m.w, m.h);
  const b = withBleed ? m.bleed * k : 0;
  const w = m.w * k, h = m.h * k;
  return { x: -w / 2 - b, y: -h / 2 - b, w: w + 2 * b, h: h + 2 * b };
}

// ── COMPOSITION: symmetry, boundary ─────────────────────────
// Copies (symCopies, applyCopy), the design transform (xf…), the boundary
// (boundaryPoly, drawBorder) and fillRegion/regionSample: the area the
// space-filling renderers fill. Used by renderers, DRAW and the node handles.
const SYM_PHI0 = -Math.PI / 2;     // wedges start at "12 o'clock"; mirror axis is vertical

// Each copy: rotation about the origin, optional reflection, and the wedge it fills
function symCopies() {
  const n = Math.max(1, S.sym.n | 0), m = !!S.sym.mirror;
  if (n <= 1 && !m) return [{ rot: 0, mirror: false, wedge: null }];
  const out = [];
  const step = Math.PI * 2 / n;
  if (m) {
    const a = Math.PI / n;
    for (let i = 0; i < n; i++) {
      const rot = i * step;
      out.push({ rot, mirror: false, wedge: [SYM_PHI0 + rot, SYM_PHI0 + rot + a] });
      out.push({ rot, mirror: true, wedge: [SYM_PHI0 + rot - a, SYM_PHI0 + rot] });
    }
  } else {
    for (let i = 0; i < n; i++) {
      const rot = i * step;
      out.push({ rot, mirror: false, wedge: [SYM_PHI0 + rot - step / 2, SYM_PHI0 + rot + step / 2] });
    }
  }
  return out;
}

function applyCopy(c, cp) {
  if (cp.rot) c.rotate(cp.rot);
  if (cp.mirror) { c.rotate(SYM_PHI0); c.scale(1, -1); c.rotate(-SYM_PHI0); }
}

function copyPoint(cp, x, y) {
  if (cp.mirror) {
    // reflect across the line through the origin at angle SYM_PHI0
    const c2 = Math.cos(2 * SYM_PHI0), s2 = Math.sin(2 * SYM_PHI0);
    const rx = x * c2 + y * s2, ry = x * s2 - y * c2;
    x = rx; y = ry;
  }
  const cr = Math.cos(cp.rot), sn = Math.sin(cp.rot);
  return { x: x * cr - y * sn, y: x * sn + y * cr };
}

function wedgePath(c, a0, a1) {
  const R = 30000;
  c.beginPath();
  c.moveTo(0, 0);
  const steps = Math.max(2, Math.ceil((a1 - a0) / (Math.PI / 8)));
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * i / steps;
    c.lineTo(Math.cos(a) * R, Math.sin(a) * R);
  }
  c.closePath();
}

// Design transform: design space (nodes, renderers) → world (boundary,
// page, view). Scale and rotation about the design origin, then the offset
// (S.xf.x/y, world units) that positions the design.
function xfOn() { return S.xf && (S.xf.scale !== 1 || S.xf.rot !== 0 || S.xf.x !== 0 || S.xf.y !== 0); }
function dxf(p) {
  if (!xfOn()) return p;
  const a = S.xf.rot * Math.PI / 180, k = S.xf.scale, c = Math.cos(a), s = Math.sin(a);
  return { ...p, x: S.xf.x + k * (p.x * c - p.y * s), y: S.xf.y + k * (p.x * s + p.y * c) };
}
function ixf(p) {
  if (!xfOn()) return p;
  const a = -S.xf.rot * Math.PI / 180, k = 1 / S.xf.scale, c = Math.cos(a), s = Math.sin(a);
  const x = p.x - S.xf.x, y = p.y - S.xf.y;
  return { ...p, x: k * (x * c - y * s), y: k * (x * s + y * c) };
}
function applyXf(c) {
  if (!xfOn()) return;
  if (S.xf.x || S.xf.y) c.translate(S.xf.x, S.xf.y);
  c.scale(S.xf.scale, S.xf.scale);
  c.rotate(S.xf.rot * Math.PI / 180);
}

// Boundary outline in world coords (origin-centred), or null
function boundaryPoly() {
  const B = S.boundary;
  const R = B.size;
  if (B.shape === 'circle') {
    const pts = [];
    for (let i = 0; i < 128; i++) { const a = i / 128 * Math.PI * 2; pts.push({ x: Math.cos(a) * R, y: Math.sin(a) * R }); }
    return pts;
  }
  // Regular polygons, point up; Size is the circumradius (the square's is
  // a little larger so it reads the same size as the circle). The pentagon is
  // shifted down so it sits optically centred.
  const SIDES = { square: 4, pentagon: 5, hexagon: 6 };
  if (SIDES[B.shape]) {
    const n = SIDES[B.shape], r = B.shape === 'square' ? R * 1.25 : R * 1.05;
    const rot = B.shape === 'square' ? Math.PI / 4 : 0;
    const dy = n % 2 ? r * (1 - Math.cos(Math.PI / n)) / 2 : 0;
    const pts = [];
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + rot + i / n * Math.PI * 2; pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r + dy }); }
    return pts;
  }
  return null;
}

// The area the space-filling modes fill: the boundary when one is set (a
// little inside it, so the border stays clear), else null = the mode's own
// area round the nodes. Cached per boundary.
let REGION_C = { key: null, v: null };
function fillRegion() {
  const B = S.boundary;
  const key = B.shape === 'none' ? 'none' : JSON.stringify([B.shape, B.size, S.xf.scale, S.xf.rot, S.xf.x, S.xf.y]);
  if (REGION_C.key === key) return REGION_C.v;
  let v = null;
  const p = boundaryPoly();
  if (p) {
    // In design space: the design transform maps it back onto the boundary
    const pts = scalePoly(p, 0.96).map(ixf);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, area = 0;
    pts.forEach((q, i) => {
      x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
      const r = pts[(i + 1) % pts.length]; area += q.x * r.y - r.x * q.y;
    });
    area = Math.abs(area) / 2;
    v = { pts, x0, y0, x1, y1, area, w: x1 - x0,
      has: q => pip(q, pts),
      // How much bigger than a disc of radius r (clamped), to scale counts
      scale: r => Math.max(0.5, Math.min(6, area / (Math.PI * r * r))) };
  }
  REGION_C = { key, v };
  return v;
}
// A random point inside the region (rejection sampling on its box)
function regionSample(RG, rnd) {
  for (let i = 0; i < 40; i++) {
    const q = { x: RG.x0 + rnd() * (RG.x1 - RG.x0), y: RG.y0 + rnd() * (RG.y1 - RG.y0) };
    if (RG.has(q)) return q;
  }
  return { x: (RG.x0 + RG.x1) / 2, y: (RG.y0 + RG.y1) / 2 };
}

function polyPath(c, pts) {
  c.beginPath();
  c.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
  c.closePath();
}

// Distance from (px, py) to the segment (ax, ay)–(bx, by)
function segDist2(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L)) : 0;
  return Math.hypot(px - ax - vx * t, py - ay - vy * t);
}

function scalePoly(pts, k) { return pts.map(p => ({ x: p.x * k, y: p.y * k })); }

// ── Border line ──
// S.boundary.lw: own thickness in world units, null = follows Stroke weight
// (S.weight × 2.4). S.boundary.color: own colour, painted on the raw context
// so the colour scheme leaves it as chosen; null = the mode's accent through
// the scheme. In the stencil renders (cut, bounds) it is ink as always, at
// least Stroke weight thick: the cut grows lines of Stroke weight to the
// minimum cut width, so a thinner border would fall short of it.
const BORDER_LW_MIN = 0.5, BORDER_LW_MAX = 24;
function borderLw() {
  const lw = S.boundary.lw;
  return lw == null ? Math.max(BORDER_LW_MIN, S.weight * 2.4) : lw;
}
function drawBorder(c, o = {}) {
  const B = S.boundary;
  if (B.border === 'none') return;
  const stencil = o.map === STENCIL_MAP;
  if (B.color && !stencil && o.raw) c = o.raw;
  const col = B.color && !stencil ? B.color : ACCENT[S.mode] || '#ddd6c8';
  const lw = stencil ? Math.max(borderLw(), S.weight) : borderLw();
  c.save();
  c.globalAlpha = 1;
  c.shadowBlur = 0;
  if (c.setLineDash) c.setLineDash([]);
  c.strokeStyle = col;
  c.lineWidth = lw;
  c.lineJoin = 'round';
  c.lineCap = 'butt';
  const poly = boundaryPoly();
  polyPath(c, poly);
  c.stroke();
  if (B.border === 'double') {
    polyPath(c, scalePoly(poly, 1 - (lw * 3) / B.size));
    c.stroke();
  }
  c.restore();
}

// ── Outside colour ──
// S.boundary.outside: an own colour for everything outside the boundary (up
// to the page edge when the page clips), under the border line. Painted on
// the raw context, so the colour scheme leaves it as chosen. One path, a
// large square and the boundary wound the other way round, so the boundary
// is a hole under the nonzero rule on a canvas and in SVG (C2S) alike.
// Used by renderDesign, and after colour-to-alpha by the transparent PNG and
// the pure black video (outsideAfter).
const OUTSIDE_F = 1e5;                 // half the square, world units
function outsideOn() { return !!(S.boundary.outside && boundaryPoly()); }
function drawOutside(c) {
  if (!outsideOn()) return;
  const poly = boundaryPoly(), F = OUTSIDE_F;
  let area = 0;
  poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]; area += p.x * q.y - q.x * p.y; });
  const pts = area > 0 ? [...poly].reverse() : poly;     // the square below winds positive
  c.save();
  c.globalAlpha = 1;
  c.shadowBlur = 0;
  c.fillStyle = S.boundary.outside;
  c.beginPath();
  c.moveTo(-F, -F); c.lineTo(F, -F); c.lineTo(F, F); c.lineTo(-F, F);
  if (c.closePath) c.closePath();
  pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
  if (c.closePath) c.closePath();
  c.fill();
  c.restore();
}
// Paints the outside colour under what is already on canvas cv (whose
// background was made transparent), drawn with view: { scale, tx, ty }
function outsideAfter(cv, view) {
  if (!outsideOn()) return;
  const c = cv.getContext('2d');
  c.save();
  c.setTransform(view.scale, 0, 0, view.scale, view.tx, view.ty);
  c.globalCompositeOperation = 'destination-over';
  const pg = pageActive() && S.page.clip ? pageRect(true) : null;
  if (pg) { c.beginPath(); c.rect(pg.x, pg.y, pg.w, pg.h); c.clip(); }
  drawOutside(c);
  c.restore();
}

// Splits a display list at its glow mark: { glows, rest }. The glow's
// blobs (each starts with a fillStyle op) are dealt round-robin into GLOW_STEPS lists
// that share the ops before the first blob. rest starts with the state the
// glow part set (property ops and dashes), so it replays alone.
const GLOW_STEPS = 8;
function splitGlow(ops) {
  if (!ops || !(ops.glowEnd > 0)) return null;
  if (ops._split) return ops._split;
  // Each list keeps its ops' indexes in ops (-1: copied state), for animTimes
  const L = () => { const q = []; q.idx = []; return q; };
  const add = (q, i, idx) => { q.push(ops[i], ops[i + 1], ops[i + 2]); q.idx.push(idx); };
  const pre = L(), head = L(), glows = Array.from({ length: GLOW_STEPS }, L);
  let blob = -1;
  for (let i = 0; i < ops.glowEnd; i += 3) {
    if (ops[i] === 1 || ops[i + 1] === 'setLineDash') add(pre, i, -1);
    if (ops[i] === 1 && ops[i + 1] === 'fillStyle') blob++;
    add(blob < 0 ? head : glows[blob % GLOW_STEPS], i, i / 3);
  }
  const join = (a, b) => { const q = a.concat(b); q._P = { parent: ops, idx: a.idx.concat(b.idx) }; return q; };
  const tail = L();
  for (let i = ops.glowEnd; i < ops.length; i += 3) add(tail, i, i / 3);
  return (ops._split = { glows: glows.map(q => join(head, q)), rest: join(pre, tail) });
}

// ── DRAW: the composed design ──────────────────────────────────────────────
// Turns display lists into the picture: bends drifting lists (warp), caches
// static items while playing, replays every list once per symmetry copy
// (drawSymmetric), draws Blink lids on top, and renderDesign wraps it all in
// the boundary, page clip and design transform.
// Used by: renderTo (RENDERING) for screen, PNG, SVG and cut; animTick uses
// warpOffset and the item cache.

// ── Drift warp ──
// PCB, Foam and Lightning re-route when a node moves, so while drifting they
// are recorded once at the real node positions and bent with the nodes as
// they're drawn: every point moves by a blend of the nodes' offsets
// (Gaussian weights, normalised only where they add up past 1, so the
// drawing far from any node stays put). warpCtx wraps a canvas context for
// one display list: it follows the list's own transforms, warps every
// coordinate in design space and splits long straight lines so they bend.
function warpOffset(base, cur) {
  const d = base.map((n, i) => ({ x: n.x, y: n.y, dx: cur[i].x - n.x, dy: cur[i].y - n.y }));
  let nn = [];
  base.forEach((a, i) => { let m = Infinity; base.forEach((b, j) => { if (i !== j) m = Math.min(m, Math.hypot(a.x - b.x, a.y - b.y)); }); if (isFinite(m)) nn.push(m); });
  nn.sort((a, b) => a - b);
  const sg = Math.max(80, Math.min(300, 0.6 * (nn.length ? nn[nn.length >> 1] : 300))), k = 1 / (2 * sg * sg);
  // Gaussian RBF interpolation: weights solved so each node's own drawing
  // lands exactly where its drift puts it (and its handle is). A small ridge
  // keeps nodes that sit close together stable; far away the offset is 0.
  const N = d.length, A = [];
  for (let i = 0; i < N; i++) {
    A.push(d.map((b, j) => { const ex = d[i].x - b.x, ey = d[i].y - b.y; return Math.exp(-(ex * ex + ey * ey) * k) + (i === j ? 0.02 : 0); }));
    A[i].push(d[i].dx, d[i].dy);
  }
  for (let c = 0; c < N; c++) {                      // Gauss–Jordan, partial pivoting
    let p = c; for (let r = c + 1; r < N; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const piv = A[c][c] || 1e-9;
    for (let r = 0; r < N; r++) if (r !== c) { const f = A[r][c] / piv; if (f) for (let q = c; q < N + 2; q++) A[r][q] -= f * A[c][q]; }
  }
  const cw = d.map((n, i) => ({ x: n.x, y: n.y, cx: A[i][N] / (A[i][i] || 1e-9), cy: A[i][N + 1] / (A[i][i] || 1e-9) }));
  return (x, y) => {
    let ox = 0, oy = 0;
    for (const n of cw) { const ex = x - n.x, ey = y - n.y, w = Math.exp(-(ex * ex + ey * ey) * k); ox += w * n.cx; oy += w * n.cy; }
    return [ox, oy];
  };
}
// Wind (Vines): a breeze as one more warp, added to the drift warp of the
// vine layer only. Sway builds up with distance from the nearest node (0 at
// the node, full at WIND_REACH), so the plant stays rooted while tips, leaves
// and flowers move; it leans downwind (+x in design space), flutters, and a
// gust band (WIND_GUST_K) travels across. Evaluated in recording coordinates.
const WIND_AMP = 15, WIND_REACH = 150, WIND_GUST_K = 0.006;
// Shared by both profiles: flexAt(x, y) is 0 where the silk or stem is held,
// 1 where it moves freely; amp in world units, flut scales the flutter.
function windField(flexAt, amp, flut, t) {
  return (x, y) => {
    const flex = flexAt(x, y);
    if (!flex) return [0, 0];
    const gust = 0.5 + 0.5 * Math.sin(x * WIND_GUST_K - t * 0.9);
    const lean = 0.35 + 0.65 * gust;
    const fl = flut * Math.sin(t * 2.6 + x * 0.013 + y * 0.021) * (0.25 + 0.35 * gust);
    const a = amp * flex;
    return [a * (lean + fl), a * 0.4 * Math.sin(t * 1.9 + x * 0.017 - y * 0.009) * (0.4 + 0.6 * gust)];
  };
}
const smooth01 = f => { f = Math.max(0, Math.min(1, f)); return f * f * (3 - 2 * f); };
function windOffset(base, t) {
  const pts = base.map(n => [n.x, n.y]);
  return windField((x, y) => {
    let d = Infinity;
    for (const q of pts) d = Math.min(d, Math.hypot(x - q[0], y - q[1]));
    return smooth01(d / WIND_REACH);
  }, WIND_AMP, 1, t);
}
// Wind (Spiderweb): the web billows between its anchors. Held at every node
// (ramp over WEB_WIND_REACH × the web's radius) and still at and beyond the
// anchor ring round the hub (so guy lines stay taut out to their far ends);
// the sway peaks in the orb. Hub and radius as renderSpiderweb finds them
// (centroid and farthest node, without its small random hub offset).
// Amplitude WEB_WIND_K × radius, at most WEB_WIND_MAX; calmer flutter (silk
// moves as a sheet). Curves are split finely under this warp (.fine), so dew
// stays on its thread.
const WEB_WIND_K = 0.06, WEB_WIND_MAX = 26, WEB_WIND_REACH = 0.45;
function webWindOffset(base, t) {
  const pts = base.map(n => [n.x, n.y]);
  let cx = 0, cy = 0;
  pts.forEach(q => { cx += q[0]; cy += q[1]; });
  cx /= (pts.length || 1); cy /= (pts.length || 1);
  let maxR = 0;
  pts.forEach(q => { const d = Math.hypot(q[0] - cx, q[1] - cy); if (isFinite(d) && d > maxR) maxR = d; });
  maxR = Math.min(4000, Math.max(maxR, 60));
  const ring = pts.length < 3 ? maxR * 1.1 : maxR, reach = maxR * WEB_WIND_REACH;
  const w = windField((x, y) => {
    const hubF = smooth01(1 - Math.hypot(x - cx, y - cy) / ring);
    if (!hubF) return 0;
    let d = Infinity;
    for (const q of pts) d = Math.min(d, Math.hypot(x - q[0], y - q[1]));
    return hubF * (pts.length < 3 ? 1 : smooth01(d / reach));
  }, Math.min(WEB_WIND_MAX, maxR * WEB_WIND_K), 0.5, t);
  w.fine = true;
  return w;
}
// Breathing (Foam): every bubble swells and shrinks round its own centre, in
// waves that run out from the nodes (phase from the bubble's distance to the
// nearest node, BR_WAVE units per cycle of BR_PERIOD s, plus a small hashed
// offset per bubble). A warp like Wind, so the threads stay attached: a point
// inside a bubble moves with it; outside, the bubble's pull fades out between
// its rim and BR_REACH × its radius; where pulls add up past 1 they are
// normalised. Amplitude BR_AMP of the radius, more for small bubbles
// (BR_SMALL). k (0–1) fades the whole effect in and out (ANIM.brAmp).
// breathPrep caches a grid of the bubbles' reach on the list (ops._br).
const BREATHE_MODES = ['foam'];
const BR_PERIOD = 5, BR_WAVE = 320, BR_AMP = 0.08, BR_SMALL = 0.08, BR_REACH = 1.5, BR_JIT = 0.8, BR_CELL = 48, BR_FADE = 1.2;
function breathPrep(ops) {
  if (ops._br) return ops._br;
  const B = ops.bubbles.map(b => ({ ...b, R: b.r * BR_REACH,
    ph: b.d / BR_WAVE * Math.PI * 2 + (sr(Math.round(b.x * 7.31 + b.y * 13.7)) - 0.5) * 2 * BR_JIT,
    amp: BR_AMP + BR_SMALL * Math.exp(-b.r / 20) }));
  const G = new Map(), key = (i, j) => i * 100003 + j;
  B.forEach(b => {
    for (let i = Math.floor((b.x - b.R) / BR_CELL); i <= Math.floor((b.x + b.R) / BR_CELL); i++)
      for (let j = Math.floor((b.y - b.R) / BR_CELL); j <= Math.floor((b.y + b.R) / BR_CELL); j++) {
        const k = key(i, j); let L = G.get(k); if (!L) G.set(k, L = []); L.push(b);
      }
  });
  return (ops._br = { B, G, key });
}
function breathWarp(ops, t, k) {
  if (!ops || !ops.bubbles || !ops.bubbles.length || k <= 0) return null;
  const P = breathPrep(ops), w = Math.PI * 2 / BR_PERIOD;
  const e = new Map();
  P.B.forEach(b => e.set(b, k * b.amp * Math.sin(w * t - b.ph)));
  return (x, y) => {
    const L = P.G.get(P.key(Math.floor(x / BR_CELL), Math.floor(y / BR_CELL)));
    if (!L) return [0, 0];
    let ox = 0, oy = 0, sw = 0;
    for (const b of L) {
      const dx = x - b.x, dy = y - b.y, d2 = dx * dx + dy * dy;
      if (d2 >= b.R * b.R) continue;
      const d = Math.sqrt(d2), wt = d <= b.r ? 1 : 1 - smooth01((d - b.r) / (b.R - b.r)), f = wt * e.get(b);
      ox += f * dx; oy += f * dy; sw += wt;
    }
    return sw > 1 ? [ox / sw, oy / sw] : [ox, oy];
  };
}
// The list bent by a warp, recorded as a new list (no side lists): for one
// frame's replay through several symmetry copies.
function bakeWarp(ops, off) {
  const r = new Rec();
  replay(ops, warpCtx(r, off));
  return r.ops;
}
// Two warps added (either may be null)
function addWarps(a, b) {
  if (!a || !b) return a || b;
  const w = (x, y) => { const p = a(x, y), q = b(x, y); return [p[0] + q[0], p[1] + q[1]]; };
  w.fine = !!(a.fine || b.fine);
  return w;
}
function warpCtx(c, off) {
  let m = [1, 0, 0, 1, 0, 0], pen = null, start = null;
  const st = [];
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const W = (x, y) => {
    const [dx, dy] = off(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
    const det = m[0] * m[3] - m[1] * m[2] || 1;
    return [x + (m[3] * dx - m[2] * dy) / det, y + (-m[1] * dx + m[0] * dy) / det];
  };
  const scl = () => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
  const h = {
    save() { st.push(m); c.save(); }, restore() { m = st.pop() || m; c.restore(); },
    translate(x, y) { m = mul(m, [1, 0, 0, 1, x, y]); c.translate(x, y); },
    rotate(a) { const co = Math.cos(a), si = Math.sin(a); m = mul(m, [co, si, -si, co, 0, 0]); c.rotate(a); },
    scale(x, y) { m = mul(m, [x, 0, 0, y, 0, 0]); c.scale(x, y); },
    transform(a, b, cc, d, e, f) { m = mul(m, [a, b, cc, d, e, f]); c.transform(a, b, cc, d, e, f); },
    beginPath() { pen = start = null; c.beginPath(); },
    moveTo(x, y) { pen = start = [x, y]; c.moveTo(...W(x, y)); },
    lineTo(x, y) {
      if (pen) {
        const L = Math.hypot(x - pen[0], y - pen[1]) * scl(), n = Math.min(24, Math.floor(L / 24));
        for (let i = 1; i < n; i++) c.lineTo(...W(pen[0] + (x - pen[0]) * i / n, pen[1] + (y - pen[1]) * i / n));
      }
      pen = [x, y]; if (!start) start = pen;
      c.lineTo(...W(x, y));
    },
    closePath() { if (pen && start) h.lineTo(start[0], start[1]); c.closePath(); pen = start; },
    quadraticCurveTo(a, b, x, y) {
      // A fine warp splits a long curve into pieces (de Casteljau), each bent
      // on its own, so points worked out on the curve (dew) stay on it
      const n = off.fine && pen ? Math.min(8, Math.ceil((Math.hypot(a - pen[0], b - pen[1]) + Math.hypot(x - a, y - b)) * scl() / 40)) : 1;
      if (n > 1) {
        const [x0, y0] = pen, P = u => { const v = 1 - u; return [v * v * x0 + 2 * v * u * a + u * u * x, v * v * y0 + 2 * v * u * b + u * u * y]; };
        for (let i = 0; i < n; i++) {
          const u0 = i / n, u1 = (i + 1) / n, um = (u0 + u1) / 2, e = P(u1), m = P(um);
          const s0 = P(u0);
          // control point of the piece: 2·mid − (start + end)/2
          c.quadraticCurveTo(...W(2 * m[0] - (s0[0] + e[0]) / 2, 2 * m[1] - (s0[1] + e[1]) / 2), ...W(e[0], e[1]));
        }
      } else c.quadraticCurveTo(...W(a, b), ...W(x, y));
      pen = [x, y];
    },
    bezierCurveTo(a, b, d, e, x, y) { c.bezierCurveTo(...W(a, b), ...W(d, e), ...W(x, y)); pen = [x, y]; },
    arc(x, y, ...r) { c.arc(...W(x, y), ...r); pen = null; },
    ellipse(x, y, ...r) { c.ellipse(...W(x, y), ...r); pen = null; },
    arcTo(a, b, x, y, r) { c.arcTo(...W(a, b), ...W(x, y), r); pen = [x, y]; },
    rect(x, y, w, hh) { const [X, Y] = W(x + w / 2, y + hh / 2); c.rect(X - w / 2, Y - hh / 2, w, hh); pen = null; },
    fillRect(x, y, w, hh) { const [X, Y] = W(x + w / 2, y + hh / 2); c.fillRect(X - w / 2, Y - hh / 2, w, hh); },
    strokeRect(x, y, w, hh) { const [X, Y] = W(x + w / 2, y + hh / 2); c.strokeRect(X - w / 2, Y - hh / 2, w, hh); },
    fillText(t, x, y, ...r) { c.fillText(t, ...W(x, y), ...r); },
    strokeText(t, x, y, ...r) { c.strokeText(t, ...W(x, y), ...r); }
  };
  return new Proxy(c, {
    get(t, p) { if (p in h) return h[p]; const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; },
    set(t, p, v) { t[p] = v; return true; }
  });
}

// ── Item cache and fade buffers ──
// FADE_BUF: offscreen canvases for a list that is faded as one image (a
// fading live Nebula, a faint layer's lids); fadeBuffer(i, w, h) gets one.
const FADE_BUF = [];
// Static items while playing (keyframe crossfades, Flow, a finished draw-on):
// the list is rasterised once into a buffer and blitted every frame after.
// A list is cached from its second frame on, so Glitch (a new list every
// frame) never pays for a buffer. Keyed by the ops array.
let ITEM_CACHE = new Map(), ITEM_SEEN = new Set(), ITEM_SEEN_NEXT = new Set();
function itemBuffer(ops, sig) {
  const e = ITEM_CACHE.get(ops);
  if (e && e.sig === sig) return { buf: e.buf, fresh: false };
  const buf = (e && e.buf) || document.createElement('canvas');
  ITEM_CACHE.set(ops, { buf, sig });
  return { buf, fresh: true };
}
// Called once per frame: forget buffers of lists no longer drawn
function itemCacheFrame() {
  for (const k of ITEM_CACHE.keys()) if (!ITEM_SEEN_NEXT.has(k)) ITEM_CACHE.delete(k);
  ITEM_SEEN = ITEM_SEEN_NEXT; ITEM_SEEN_NEXT = new Set();
}

function fadeBuffer(i, w, h) {
  let b = FADE_BUF[i];
  if (!b) b = FADE_BUF[i] = document.createElement('canvas');
  if (b.width !== w || b.height !== h) { b.width = w; b.height = h; }
  return b;
}

// ── Symmetric replay ──
// Draws each display list (layer, then main) once per symmetry copy, clipped
// to its wedge. With rotation only (no mirror) the copies don't match at the
// wedge edges, so a glow's blobs are split into GLOW_STEPS sets, each drawn
// in the wedge widened by an even step from -1.5 to 1.5 × GD: inside a wedge
// every blob shows once, and over 3 GD round each edge the copies cross-fade.
// (Not 1/n alpha n×: the faint glow discs would round away in 8-bit colour.)
// Animation: F.items are designs (old one fading, new one drawing on).
// c: target context (screen, offscreen or C2S), already through the colour
// map. dl: { main, layer } from getDisplayList(), used when F is null.
// F: ANIM.frame while animating. o: { raw, map, gaze, plain } from
// renderDesign: the unmapped context, the colour map (map.l2: Layer 2's),
// the design-page transform (Blink gaze) and plain (leave out the overlay
// effects: cut and strokes SVG).
// Each helper below takes D, the replay's shared state (symState).
function drawSymmetric(c, dl, F = null, o = {}) {
  const D = symState(c, F, o);
  symLists(dl, F).forEach((L, li) => symDrawList(D, L, li));
}
function symState(c, F, o) {
  const copies = symCopies();
  return { c, F, copies, raw: o.raw || c, map: o.map || null, gaze: o.gaze || null, plain: !!o.plain,
    rotOnly: copies.length > 1 && !S.sym.mirror, GD: Math.min(Math.PI * 2 / copies.length / 8, 0.12) };
}
// The lists to draw, in order: [ops, alpha, prog, warp, isL2, base, F]
// (prog: draw-on progress, 1 when static; base: the layer's own strength;
// F: the animation frame of the list's layer, ANIM.frame or ANIM.frame.l2)
function symLists(dl, F) {
  const alpha = S.layer.strength / 100, lists = [];
  // Strikes: the resting discharge is dimmed, the strikes draw over it
  const strikeRest = (m, f) => f && f.sk != null && STRIKE_MODES.includes(m) ? STRIKE_REST : 1;
  // Breathing: a warp per Foam list, from its own bubbles
  const breath = (ops, m, f) => f && f.br != null && BREATHE_MODES.includes(m) ? breathWarp(ops, f.br, f.brA) : null;
  if (F) F.items.forEach(it => {
    const a2 = it.alpha2 ?? it.alpha;
    if (it.alpha <= 0.003 && a2 <= 0.003) return;
    if (it.dl.layer) lists.push([it.dl.layer, alpha * a2 * strikeRest(S.layer.mode, F.l2 || F), it.prog2 ?? it.prog, addWarps(addWarps(it.warp, it.windL), breath(it.dl.layer, S.layer.mode, F.l2 || F)), true, alpha, F.l2 || F]);
    if (it.alpha > 0.003) lists.push([it.dl.main, it.alpha * strikeRest(S.mode, F), it.prog, addWarps(addWarps(it.warp, it.windM), breath(it.dl.main, S.mode, F)), false, 1, F]);
  });
  else { if (dl.layer) lists.push([dl.layer, alpha, 1, null, true, alpha]); lists.push([dl.main, 1, 1, null, false, 1]); }
  return lists;
}
// Once per symmetry copy: clip to its wedge (widened by wid), place the copy,
// then fn(Tw), Tw the transform before the copy (only when wantTw)
function eachCopy(x, copies, fn, wid = 0, wantTw = false) {
  copies.forEach(cp => {
    x.save();
    const Tw = wantTw ? x.getTransform() : null;
    if (cp.wedge) { wedgePath(x, cp.wedge[0] - wid, cp.wedge[1] + wid); x.clip(); }
    applyCopy(x, cp);
    fn(Tw, cp);
    x.restore();
  });
}
// The colour map for one list: Layer 2 has its own (palette l2)
function listMap(D, isL2) { return isL2 && D.map && D.map.l2 ? D.map.l2 : D.map; }
function symDrawList(D, [ops, a, prog, wp, isL2, base, Fl], li) {
  if (Fl && D.F !== Fl) D = { ...D, F: Fl };         // the helpers read the list's own layer's frame
  const mode = isL2 ? S.layer.mode : S.mode, F = D.F;
  const map = listMap(D, isL2), x = map === D.map ? D.c : paletteCtx(D.raw, map);
  const raw = x.canvas;
  let lidsDone = false;
  // Ripples: a Water list is traced again every frame instead of replayed
  if (ripplesOn(F, ops)) { symDrawRipples(D, x, ops, a, prog, wp); return; }
  // Blink on a faint layer (strength < 100%): its strokes are see-through,
  // so a lid painted over a nucleus would let the nucleus show through.
  // Draw the layer and its eyes into a buffer at the layer's strength,
  // where the lids first erase what they cover, then lay the buffer on
  // the canvas (with the item's fade).
  if (F && raw && F.o.blink && ops.eyes && base < 0.995 && (prog >= 1 || F.np) && a > 0.003) {
    const off = fadeBuffer('lids' + li, raw.width, raw.height), pc = paletteCtx(clearBuffer(off, x.getTransform()), map);
    symDrawAll(D, pc, ops, base, prog, wp);
    symDrawLids(D, pc, ops, base, prog, wp, true);
    blitBuffer(x, off, Math.min(1, a / base));
    lidsDone = true;
  } else if (!symDrawCached(D, x, map, ops, a, prog, wp, isL2, base, raw)) {
    // Fading Nebula (live): drawn whole into a buffer, then faded as one
    // image. Fading each of its thousands of faint discs makes their 8-bit
    // alpha steps flicker together mid-dissolve.
    if (F && a < 0.995 && raw && mode === 'nebula') {
      const off = fadeBuffer(li, raw.width, raw.height);
      symDrawAll(D, paletteCtx(clearBuffer(off, x.getTransform()), map), ops, 1, prog, wp);
      blitBuffer(x, off, a);
    } else symDrawAll(D, x, ops, a, prog, wp);
  }
  if (!lidsDone) symDrawLids(D, x, ops, a, prog, wp);
  symDrawCurrent(D, x, ops, a, prog, wp, mode);
  symDrawTwinkles(D, x, ops, a, prog, wp, mode);
  symDrawStrikes(D, x, ops, a, prog, wp, mode);
  symDrawSun(D, x, ops, a, prog, wp, mode);
  drawPetals(x, ops, a, prog, wp, isL2, D.copies, F, D.plain);
}
// An offscreen buffer cleared, its context set to transform T
function clearBuffer(buf, T) {
  const oc = buf.getContext('2d');
  oc.setTransform(1, 0, 0, 1, 0, 0);
  oc.globalAlpha = 1;
  oc.clearRect(0, 0, buf.width, buf.height);
  oc.setTransform(T);
  return oc;
}
// Lays a buffer over x's whole canvas at alpha
function blitBuffer(x, buf, alpha) {
  x.save();
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalAlpha = alpha;
  x.drawImage(buf, 0, 0);
  x.restore();
}
// Static while playing: rasterise once (at the layer's own strength), then
// blit with the item's fade. Returns true when it drew the list.
function symDrawCached(D, x, map, ops, a, prog, wp, isL2, base, raw) {
  const F = D.F;
  if (!(F && raw && !wp && prog >= 1 && F.lw === 1 && !ANIM.exporting && !(F.rt && ops.turns) && !(F.lt != null && ops.life))) return false;
  ITEM_SEEN_NEXT.add(ops);
  // Also when fading on its first frame, so the fade looks the same
  // before and after the buffer exists (group alpha, not per stroke)
  if (!ITEM_SEEN.has(ops) && a >= 0.995) return false;
  const T = x.getTransform();
  const sig = [raw.width, raw.height, T.a, T.b, T.c, T.d, T.e, T.f, isL2, base, JSON.stringify(S.palette), S.mode, S.layer.mode].join();
  const { buf, fresh } = itemBuffer(ops, sig);
  if (fresh) {
    if (buf.width !== raw.width || buf.height !== raw.height) { buf.width = raw.width; buf.height = raw.height; }
    symDrawAll(D, paletteCtx(clearBuffer(buf, T), map), ops, base, 1, null);
  }
  blitBuffer(x, buf, Math.min(1, a / base));
  return true;
}
function symDrawAll(D, x, ops, a, prog, wp) {
  const F = D.F, copies = D.copies;
  // A bent Foam list with several copies: bend it once (bakeWarp), then
  // replay the bent copy per wedge, rather than bend every point per copy
  if (F && wp && copies.length > 1 && prog >= 1 && ops.bubbles) { ops = bakeWarp(ops, wp); wp = null; }
  const draw = (o2) => F ? replayAnim(o2, wp ? warpCtx(x, wp) : x, a, F.lw, prog, F.np, F.rt || 0, F.lt ?? null) : replay(o2, x, a);
  const sp = D.rotOnly && splitGlow(ops);
  if (!sp) { eachCopy(x, copies, () => draw(ops)); return; }
  sp.glows.forEach((g, j) => eachCopy(x, copies, () => draw(g), ((j + 0.5) / GLOW_STEPS - 0.5) * 3 * D.GD));
  eachCopy(x, copies, () => draw(sp.rest));
}
// Blink: lids over the microscope's nuclei, drawn every frame on top of the
// list (cached or not), through the same copies, palette and drift bend
// erase: the list is in its own buffer (faint layer): lids first cut out
// what they cover, see drawLid
function symDrawLids(D, x, ops, a, prog, wp, erase = false) {
  const F = D.F;
  if (!F || !F.o.blink || !ops.eyes || (prog < 1 && !F.np) || a <= 0.003) return;
  // Draw on per node: only eyes whose node is fully drawn (eye id = node index)
  const open = e => !(prog < 1 && F.np) || (F.np[e.id] ?? 1) >= 1;
  const t = ANIM.blinkTime, shut = ops.eyes.map(e => blinkAmt(t, e.id));
  // The pointer (smoothed), from design-page coordinates to the screen
  const G = ANIM.gaze && D.gaze ? D.gaze.transformPoint(new DOMPoint(ANIM.gaze.x, ANIM.gaze.y)) : null;
  if (!G && !shut.some(v => v > 0)) return;
  eachCopy(x, D.copies, (Tw, cp) => {
    // …and into this copy's own coordinates, so every copy looks at it
    const Tc = x.getTransform(), Ti = Tc.inverse();
    const look = G ? Ti.transformPoint(G) : null;
    const axisOf = lidAxis(cp, look && cp.wedge ? Ti.multiply(Tw) : null, Tw, Tc);
    const y = wp ? warpCtx(x, wp) : x;
    ops.eyes.forEach((e, i) => { if ((look || shut[i] > 0) && open(e)) drawLid(y, e, shut[i], a, look, axisOf(e), erase); });
  }, 0, true);
}
// An eye across a wedge edge is drawn half by this copy, half by the next
// (mirrored or turned) one, and the two halves would look different ways:
// its pupil moves only along the edge, where they agree (on the centre,
// across both edges, it stays put). Returns e → that axis, or null.
function lidAxis(cp, L, Tw, Tc) {
  return e => {
    if (!L) return null;
    const P = Tw.inverse().transformPoint(Tc.transformPoint(new DOMPoint(e.x, e.y)));
    let ax = null, n = 0;
    for (const an of cp.wedge) {
      const cs = Math.cos(an), sn = Math.sin(an);
      if (Math.abs(P.x * sn - P.y * cs) < e.R + e.lw && P.x * cs + P.y * sn > -e.R) {
        n++;
        const lx = L.a * cs + L.c * sn, ly = L.b * cs + L.d * sn, ll = Math.hypot(lx, ly) || 1;
        ax = { x: lx / ll, y: ly / ll, ox: L.e, oy: L.f };     // (ox, oy): the centre, on the edge line
      }
    }
    return n > 1 ? { x: 0, y: 0 } : ax;
  };
}
// Current: pulses along the lines, on top, through the same copies and bend
function symDrawCurrent(D, x, ops, a, prog, wp, mode) {
  const F = D.F;
  if (!F || F.ct == null || !CURRENT_MODES.includes(mode) || a <= 0.003 || (prog < 1 && !F.np)) return;
  const P = currentFrame(ops, F.ct, wp, prog < 1 ? F.np : null, mode, F.o);
  if (!P.length) return;
  const col = CUR_COL[mode];
  eachCopy(x, D.copies, () => P.forEach(q => drawPulse(x, q, col, Math.min(1, a), F.lw)));
}
// Twinkle: stars flicker and shooting stars cross, on top, through the same copies and bend
function symDrawTwinkles(D, x, ops, a, prog, wp, mode) {
  const F = D.F;
  if (!F || F.tt == null || !TWINKLE_MODES.includes(mode) || !ops.stars || a <= 0.003 || (prog < 1 && !F.np)) return;
  const P = twinkleFrame(ops, F.tt, wp, prog, prog < 1 ? F.np : null);
  const M = prog >= 1 && F.st != null ? shootFrame(ops, F.st, F.o) : null;
  if (!P.length && !M) return;
  const al = Math.min(1, a);
  eachCopy(x, D.copies, () => {
    P.forEach(q => drawTwinkle(x, q, al));
    if (M) drawShoot(x, M, al);
  });
}
// Strikes: this frame's bolts and crawling branches, on top, through the same copies and bend
function symDrawStrikes(D, x, ops, a, prog, wp, mode) {
  const F = D.F;
  if (!F || F.sk == null || !STRIKE_MODES.includes(mode) || !ops.light || a <= 0.001) return;
  const S2 = strikeFrame(ops, F.sk, wp, prog < 1 ? (F.np || 'none') : null, F.o);
  if (!S2.length) return;
  const al = Math.min(1, a / STRIKE_REST);
  eachCopy(x, D.copies, () => drawStrike(x, S2, al, F.lw));
}
// Sunlight: lit glass pieces redrawn brighter, on top, through the same copies and bend
function symDrawSun(D, x, ops, a, prog, wp, mode) {
  const F = D.F;
  if (!F || F.su == null || !SUN_MODES.includes(mode) || !ops.panes || a <= 0.003) return;
  const SP = sunPrep(ops), B = sunBand(F.su, SP.R);
  if (!B) return;
  const P = SP.P, n = P.length, need = new Uint8Array(n), step = new Uint8Array(n);
  eachCopy(x, D.copies, Tw => {
    // This copy's own placement in the design's space, so the band is one band across all copies
    const M = Tw.inverse().multiply(x.getTransform());
    let any = false;
    for (let i = 0; i < n; i++) {
      const p = P[i];
      need[i] = 0; step[i] = 0;
      if (prog < 1 && !opShown(ops, p.k, prog, F.np)) continue;
      const px = M.a * p.cx + M.c * p.cy + M.e, py = M.b * p.cx + M.d * p.cy + M.f;
      const u = (px * B.ux + py * B.uy - B.b) / B.W, k = Math.exp(-u * u);
      if (k >= SUN_MIN) step[i] = Math.max(1, Math.round(k * SUN_STEPS));
      if (step[i] || p.under.some(j => need[j])) { need[i] = 1; any = true; }
    }
    if (any) drawSunPanes(wp ? warpCtx(x, wp) : x, SP, need, step, a, F.lw);
  }, 0, true);
}
// The lit pieces, then heavier leads over any redrawn piece
function drawSunPanes(y, SP, need, step, a, lw) {
  const P = SP.P;
  y.globalAlpha = Math.min(1, a); y.lineJoin = 'round'; y.lineCap = 'round';
  for (let i = 0; i < P.length; i++) if (need[i]) drawPane(y, P[i], step[i], lw);
  SP.L.forEach(l => {
    if (!P.some((p, i) => need[i] && SP.hit(p.b, l.b))) return;
    y.strokeStyle = l.lead; y.lineWidth = l.lw * lw;
    y.beginPath(); l.pts.forEach((v, i) => i ? y.lineTo(v.x, v.y) : y.moveTo(v.x, v.y)); y.closePath(); y.stroke();
  });
}

// ── The whole design ──
// Draws the full composed design in world coordinates. o: { raw, map, plain }
// from renderTo (see drawSymmetric).
// o.outside: paint the colour outside the boundary (renderTo decides)
function renderDesign(c, o = {}) {
  const F = ANIM.live ? ANIM.frame : null;
  const dl = F ? null : getDisplayList();
  const poly = boundaryPoly();
  const pg = pageActive() && S.page.clip ? pageRect(true) : null;
  const gaze = c.getTransform();
  c.save();
  if (pg) { c.beginPath(); c.rect(pg.x, pg.y, pg.w, pg.h); c.clip(); }
  if (o.outside) drawOutside(o.raw || c);
  c.save();
  if (poly) { polyPath(c, poly); c.clip(); }
  if (F && F.spin) c.rotate(F.spin);
  applyXf(c);
  drawSymmetric(c, dl, F, { ...o, gaze });
  c.restore();
  if (poly) drawBorder(c, o);
  c.restore();
}
