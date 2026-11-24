// ── WATER CIRCLES ──────────────────────────────────────────────────────────
// Ripples spreading from every node, as if a drop fell there, plus smaller
// raindrop ripples between them. Thin lines that thin and fade outward.
// Three ways for ripples to meet (S.water.meet):
//   wave   Interference: every source is a wave; the waves are summed as
//          complex numbers on a grid and the crest lines (phase 0) are traced
//          with marching squares. A lone source gives one ring per
//          wavelength; where waves meet the crests bend, merge and break off
//          along the calm lines, and fade with the summed amplitude.
//   stop   Each grid point only hears its strongest source, so rings end at
//          the line where two sources meet (cells that straddle it are left
//          out, which leaves a small gap).
//   cross  Every source draws plain rings that overlap freely (moiré).
// Density = how far the rings reach, Jitter = a wavy water surface (the same
// smooth noise bends every ring), spacing = wavelength in world units,
// drops = raindrop amount 0–100.
// Used by: RENDERERS.
const WATER_MEETS = ['wave', 'stop', 'cross'];
const WATER_COL = '#cfe8f2';
const WATER_LW = 1.8;                 // line width × Stroke weight at full strength
const WATER_ALPHA_MIN = 0.4;          // faintest line (outer rings), so they still cut
const WATER_BINS = 7;                 // strength steps a crest line is split into
const WATER_CELLS = 300000;           // grid cap: the cell grows above this
const WATER_SIMPLIFY = 0.25;          // polyline simplification tolerance (world units)
const WATER_SHARP = 2.5;              // (inlined as e * e * √e in waterGrid) wave: each wave counts with its strength to this power, so a
                                      // weaker wave bends a stronger one's rings instead of breaking them up
const WATER_CELL = 6;                 // grid cells per wavelength
const WATER_LUT_N = 4096;             // cos / sin table steps per turn
const WATER_LUT = (() => { const t = new Float32Array(WATER_LUT_N * 2); for (let i = 0; i < WATER_LUT_N; i++) { t[2 * i] = Math.cos(i / WATER_LUT_N * Math.PI * 2); t[2 * i + 1] = Math.sin(i / WATER_LUT_N * Math.PI * 2); } return t; })();
const WATER_DROP_A = 0.45;            // raindrop amplitude (a node is 1)
const WATER_DROP_MAX = 30;            // raindrops at 100%
function sanWater(v) {
  v = v || {};
  const num = (x, a, b, d) => (typeof x === 'number' && isFinite(x)) ? Math.min(b, Math.max(a, x)) : d;
  return { meet: WATER_MEETS.includes(v.meet) ? v.meet : 'wave', spacing: num(v.spacing, 10, 60, 24), drops: num(v.drops, 0, 100, 40) };
}

function renderWater(c, nodes, density, sigma, weight, seed) {
  if (!nodes.length) return;
  const w = waterSetup(nodes, density, sigma, weight, seed);
  if (c.markWater) c.markWater(w);   // Ripples (js/ripples.js) redraws the water per frame from this
  c.strokeStyle = WATER_COL;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  if (w.o.meet === 'cross') waterRings(c, w);
  else waterCrests(c, w, waterGrid(w));
  c.globalAlpha = 1;
}

// Sources (nodes, then raindrops), the surface noise and the drawing area
function waterSetup(nodes, density, sigma, weight, seed) {
  const o = sanWater(S.water);
  let s = Math.floor(seed * 1e6) * 17 + 3;
  const R = () => sr(s++);
  const lam = o.spacing, reachK = 2 + density * 1.5;
  const src = nodes.map(n => ({ x: n.x, y: n.y, a: 1, R: lam * reachK * (n.size || 1) }));
  let cx = 0, cy = 0;
  nodes.forEach(n => { cx += n.x; cy += n.y; });
  cx /= nodes.length; cy /= nodes.length;
  let spread = 0;
  nodes.forEach(n => { spread = Math.max(spread, Math.hypot(n.x - cx, n.y - cy)); });
  const RG = fillRegion();
  const nd = Math.round(o.drops / 100 * WATER_DROP_MAX * (RG ? RG.scale(spread + lam * reachK * 0.6) : 1));
  const rad = spread + lam * reachK * 0.6;
  for (let i = 0; i < nd; i++) {
    let x, y;
    if (RG) {   // inside the boundary (up to 8 tries, then the last one)
      for (let t = 0; t < 8; t++) { x = RG.x0 + R() * (RG.x1 - RG.x0); y = RG.y0 + R() * (RG.y1 - RG.y0); if (RG.has({ x, y })) break; }
    }
    else { const a = R() * Math.PI * 2, r = rad * Math.sqrt(R()); x = cx + Math.cos(a) * r; y = cy + Math.sin(a) * r; }
    src.push({ x, y, a: WATER_DROP_A, R: lam * (1.2 + R() * 2.3) });
  }
  // Surface noise: three slow waves in seeded directions, amplitude by Jitter
  const amp = sigma / 100 * lam * 0.7;
  const waves = [0, 1, 2].map(() => { const a = R() * Math.PI * 2; return { kx: Math.cos(a), ky: Math.sin(a), f: (0.6 + R() * 0.8) * 2 * Math.PI / 260, p: R() * Math.PI * 2 }; });
  const noise = amp ? (x, y) => amp / 3 * waves.reduce((t, q) => t + Math.sin((q.kx * x + q.ky * y) * q.f + q.p), 0) : () => 0;
  return { o, src, lam, k: 2 * Math.PI / lam, noise, amp, weight, RG, sharp: WATER_SHARP, nn: nodes.length, nd, cx, cy, rad, seedI: Math.floor(seed * 1e6) };
}

// Fall-off of a source's waves: 1 at the source, 0 at its reach
function waterFade(d, R) {
  if (d >= R) return 0;
  const t = d / R;
  return (1 - t * t) * (1 - t * t);
}

// Line strength t (0–1) → stroke settings
function waterPen(c, w, t) {
  c.globalAlpha = WATER_ALPHA_MIN + (1 - WATER_ALPHA_MIN) * t;
  c.lineWidth = w.weight * WATER_LW * (0.45 + 0.55 * t);
}

// cross: plain rings per source, one strength per ring
function waterRings(c, w) {
  w.src.forEach(q => {
    for (let r = w.lam; r < q.R; r += w.lam) {
      const t = waterFade(r, q.R) * q.a;
      if (t < 0.02) break;
      const n = Math.max(24, Math.ceil(r * 2 * Math.PI / 6));
      waterPen(c, w, t);
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const rr = r - w.noise(q.x + ca * r, q.y + sa * r);
        if (i) c.lineTo(q.x + ca * rr, q.y + sa * rr); else c.moveTo(q.x + ca * rr, q.y + sa * rr);
      }
      c.closePath();
      c.stroke();
    }
  });
}

// wave / stop: the summed (or strongest) wave on a grid: re, im per corner,
// and for stop the owning source per corner
function waterGrid(w) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  w.src.forEach(q => { x0 = Math.min(x0, q.x - q.R); y0 = Math.min(y0, q.y - q.R); x1 = Math.max(x1, q.x + q.R); y1 = Math.max(y1, q.y + q.R); });
  if (w.RG) { x0 = Math.max(x0, w.RG.x0 - 30); y0 = Math.max(y0, w.RG.y0 - 30); x1 = Math.min(x1, w.RG.x1 + 30); y1 = Math.min(y1, w.RG.y1 + 30); }
  let h = w.lam / WATER_CELL;
  if ((x1 - x0) * (y1 - y0) / (h * h) > WATER_CELLS) h = Math.sqrt((x1 - x0) * (y1 - y0) / WATER_CELLS);
  const nx = Math.max(2, Math.ceil((x1 - x0) / h) + 1), ny = Math.max(2, Math.ceil((y1 - y0) / h) + 1), N = nx * ny;
  const g = { x0, y0, h, nx, ny, re: new Float32Array(N), im: new Float32Array(N), own: null, best: null, sharp: w.o.meet === 'stop' ? 1 : w.sharp };
  const nz = new Float32Array(N);
  if (w.amp) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) nz[j * nx + i] = w.noise(x0 + i * h, y0 + j * h);
  const stop = w.o.meet === 'stop';
  if (stop) { g.own = new Int16Array(N).fill(-1); g.best = new Float32Array(N); }
  const LUT = WATER_LUT, kL = w.k / (Math.PI * 2) * WATER_LUT_N, dMin = w.lam * 0.3;
  w.src.forEach((q, si) => {
    const R2 = q.R * q.R, i0 = Math.max(0, Math.floor((q.x - q.R - x0) / h)), i1 = Math.min(nx - 1, Math.ceil((q.x + q.R - x0) / h));
    const j0 = Math.max(0, Math.floor((q.y - q.R - y0) / h)), j1 = Math.min(ny - 1, Math.ceil((q.y + q.R - y0) / h));
    for (let j = j0; j <= j1; j++) {
      const dy = y0 + j * h - q.y;
      for (let i = i0; i <= i1; i++) {
        const dx = x0 + i * h - q.x, d2 = dx * dx + dy * dy;
        if (d2 >= R2) continue;
        const id = j * nx + i, t2 = d2 / R2, e = (1 - t2) * (1 - t2) * q.a;   // waterFade, inline
        // Within 0.3 wavelength of a source the phase is held, so the wave is
        // never exactly zero there (that would trace a tiny ring on the node)
        const ph = (Math.max(Math.sqrt(d2), dMin) + nz[id]) * kL;
        const li = 2 * (((Math.round(ph) % WATER_LUT_N) + WATER_LUT_N) % WATER_LUT_N);
        if (stop) {
          if (e <= g.best[id]) continue;
          g.best[id] = e; g.own[id] = si;
          g.re[id] = e * LUT[li]; g.im[id] = e * LUT[li + 1];
        } else {
          const ep = e * e * Math.sqrt(e);   // e ^ WATER_SHARP (2.5)
          g.re[id] += ep * LUT[li]; g.im[id] += ep * LUT[li + 1];
        }
      }
    }
  });
  return g;
}

// Crest lines: im = 0 where re > 0, traced cell by cell (marching squares),
// chained into polylines through the grid edges they cross, simplified, then
// drawn in runs of equal strength (the amplitude |re, im| along the line)
function waterCrests(c, w, g) {
  const segs = waterSegments(g);
  waterChains(segs).forEach(line => {
    const pts = waterSimplify(line, WATER_SIMPLIFY);
    if (pts.length < 2) return;
    const bin = p => Math.min(WATER_BINS - 1, Math.floor(Math.min(1, p.a) * WATER_BINS));
    let k = 0;
    while (k < pts.length - 1) {
      const b = bin(pts[k]);
      let e = k + 1;
      while (e < pts.length - 1 && bin(pts[e]) === b) e++;
      if (b > 0 || pts[k].a > 0.04) {
        waterPen(c, w, (b + 0.5) / WATER_BINS);
        c.beginPath();
        c.moveTo(pts[k].x, pts[k].y);
        for (let m = k + 1; m <= e; m++) c.lineTo(pts[m].x, pts[m].y);
        c.stroke();
      }
      k = e;
    }
  });
}

// One segment per crossed cell (two in a saddle); each end is a grid edge id
// (2 × corner index, + 1 for the vertical edge) with its point and amplitude
function waterSegments(g) {
  const { nx, ny, re, im, own, h, x0, y0 } = g, segs = [];
  const pt = (a, b, eid) => {
    const t = im[a] / (im[a] - im[b]);
    const ra = re[a] + (re[b] - re[a]) * t;
    const xa = x0 + (a % nx) * h, ya = y0 + Math.floor(a / nx) * h;
    const xb = x0 + (b % nx) * h, yb = y0 + Math.floor(b / nx) * h;
    return { id: eid, x: xa + (xb - xa) * t, y: ya + (yb - ya) * t, re: ra, a: Math.pow(Math.abs(ra), 1 / g.sharp) };
  };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const A = j * nx + i, B = A + 1, D = A + nx, C = D + 1;
    if (own && !(own[A] >= 0 && own[A] === own[B] && own[A] === own[C] && own[A] === own[D])) continue;
    const sa = im[A] > 0, sb = im[B] > 0, sc = im[C] > 0, sd = im[D] > 0;
    if (sa === sb && sb === sc && sc === sd) continue;
    // Edges: top A–B (2A), right B–C (2B+1), bottom D–C (2D), left A–D (2A+1)
    // A crossing only on troughs (re < 0 at every corner) is never a crest
    if (re[A] <= 0 && re[B] <= 0 && re[C] <= 0 && re[D] <= 0) continue;
    const ex = [];
    if (sa !== sb) ex.push(pt(A, B, 2 * A));
    if (sb !== sc) ex.push(pt(B, C, 2 * B + 1));
    if (sd !== sc) ex.push(pt(D, C, 2 * D));
    if (sa !== sd) ex.push(pt(A, D, 2 * A + 1));
    if (ex.length === 2) segs.push([ex[0], ex[1]]);
    else if (ex.length === 4) {
      // Saddle: pair by the centre's sign
      const ctr = (im[A] + im[B] + im[C] + im[D]) > 0;
      if (ctr === sa) { segs.push([ex[0], ex[1]]); segs.push([ex[2], ex[3]]); }
      else { segs.push([ex[0], ex[3]]); segs.push([ex[1], ex[2]]); }
    }
  }
  // Crests only (re > 0): a segment is kept when its middle is on a crest
  return segs.filter(sg => sg[0].re + sg[1].re > 0);
}

// Segments sharing an edge id join into polylines
function waterChains(segs) {
  // An edge has at most two segments: edge id → its slots in a1 / a2 (-1 = none)
  const ids = new Map(), a1 = new Int32Array(segs.length * 2).fill(-1), a2 = new Int32Array(segs.length * 2).fill(-1);
  segs.forEach((sg, k) => sg.forEach(p => {
    let e = ids.get(p.id);
    if (e === undefined) { e = ids.size; ids.set(p.id, e); }
    p.e = e;
    if (a1[e] < 0) a1[e] = k; else a2[e] = k;
  }));
  const used = new Uint8Array(segs.length), lines = [];
  const walk = (line, p) => {
    for (;;) {
      const nb = a1[p.e] >= 0 && !used[a1[p.e]] ? a1[p.e] : a2[p.e] >= 0 && !used[a2[p.e]] ? a2[p.e] : -1;
      if (nb < 0) return;
      used[nb] = 1;
      const sg = segs[nb], q = sg[0].id === p.id ? sg[1] : sg[0];
      line.push(q); p = q;
    }
  };
  segs.forEach((sg, k) => {
    if (used[k]) return;
    used[k] = 1;
    const fwd = [sg[0], sg[1]];
    walk(fwd, sg[1]);
    const back = [];
    walk(back, sg[0]);
    lines.push(back.reverse().concat(fwd));
  });
  return lines;
}

// Douglas–Peucker; kept points keep their amplitude
function waterSimplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const A = pts[a], B = pts[b], dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy);
    let far = -1, fd = tol;
    for (let i = a + 1; i < b; i++) {
      // Distance to the chord; to A itself when the chord has no length (a closed ring)
      const d = L > 1e-6 ? Math.abs((pts[i].x - A.x) * dy - (pts[i].y - A.y) * dx) / L : Math.hypot(pts[i].x - A.x, pts[i].y - A.y);
      if (d > fd) { fd = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((p, i) => keep[i]);
}
