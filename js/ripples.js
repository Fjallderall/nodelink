// ── RIPPLES (Water Circles, animated) ───────────────────────────────────────
// While Ripples plays, a Water list is not replayed: its rings are traced
// again every frame from the setup the renderer marked (ops.water), with the
// crests travelling outward at RP_PERIOD s per ring (× Ripple speed) and
// fading with distance as in the still.
//   Steady  every node sends rings out all the time, all in step. The waves
//           of all steady nodes are summed once per recording (rpBase) and
//           only turned per frame: a common phase e^(-iφ) moves every crest
//           outward, so the interference pattern stays and its crests flow.
//   Drips   (Ripple style) each node drips now and then (one chance per
//           RP_DRIP_SLOT s, at a hashed moment) and sends out a burst of
//           RP_BURST rings that spreads to the node's reach and fades.
//   Rain    the Raindrops slider's drops land at hashed moments and places
//           (one per rain slot at a time), each a burst of RP_RAIN_BURST
//           rings. Bursts are added per frame over their ring of grid cells
//           only (rpBurst), so they cost little.
// Where ripples meet follows the Water option: Interference (summed waves),
// Stop (strongest source per grid point) or Cross freely (plain rings).
// Draw on: a node's rings reach as far as its draw-on progress (RP_REVEAL
// soft edge); raindrops show only where the water is drawn.
// Everything is a function of the ripple clock (ANIM.rpTime): no state from
// frame to frame, so a paused frame, its exports and the loop video agree.
// Used by: symDrawList (compose.js), animFrame (F.rp), loop video (speed nudge).
const RP_PERIOD = 1.6;          // s per ring at 1× (crest speed = spacing / RP_PERIOD)
const RP_TAPER = 0.8;           // wavelengths: waves fade in from the source over this, so rings are born small and faint
const RP_BURST = 3;             // rings in a node's drip burst
const RP_RAIN_BURST = 2;        // rings in a raindrop's burst
const RP_DRIP_SLOT = 3.2;       // s: one drip chance per node per slot
const RP_DRIP_P = 0.75;         // chance a slot has a drip
const RP_RAIN_GAP = 1.2;        // s: most a rain slot waits before its next drop (hashed 0–1 ×)
const RP_REVEAL = 1.5;          // wavelengths: soft edge of the Draw on reach
const RP_MIN_A = 0.04;          // weakest crest drawn (as the still)

// Seeded hash → [0, 1): (seed, a, b) integers
function rpHash(s, a, b) {
  let h = Math.imul(s | 0, 0x9e3779b1) ^ Math.imul(a | 0, 0x85ebca6b) ^ Math.imul(b | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// Burst envelope over its rings: u = (front − d) / length, 0–1
function rpEnv(u) { return u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u) ** 2; }
function rpTaper(d, lam) { const u = Math.min(1, d / (RP_TAPER * lam)); return u * u * (3 - 2 * u); }

// The water's sources for this frame: steady node phase, and the live bursts
// (nodes in Drips style, raindrops) { x, y, a, R, f (front), L (length), id }
function rpSources(W, t, drip) {
  const lam = W.lam, v = lam / RP_PERIOD, seed = W.seedI;
  const nodes = W.src.slice(0, W.nn), bursts = [];
  if (drip) nodes.forEach((q, i) => {
    const L = RP_BURST * lam, life = (q.R + L) / v;
    for (let m = Math.floor((t - life) / RP_DRIP_SLOT); m <= Math.floor(t / RP_DRIP_SLOT); m++) {
      if (rpHash(seed, i * 2 + 1, m) > RP_DRIP_P) continue;
      const t0 = (m + 0.8 * rpHash(seed, i * 2 + 2, m)) * RP_DRIP_SLOT, age = t - t0;
      if (age > 0 && age < life) bursts.push({ x: q.x, y: q.y, a: q.a, R: q.R, f: age * v, L, id: i, node: i });
    }
  });
  const L = RP_RAIN_BURST * lam, lifeMax = (3.5 * lam + L) / v, P = lifeMax + RP_RAIN_GAP;
  for (let k = 0; k < W.nd; k++) {
    const off = rpHash(seed, 9001, k) * P, m = Math.floor((t - off) / P), t0 = off + m * P + rpHash(seed, 9002 + k, m) * RP_RAIN_GAP;
    const R = lam * (1.2 + rpHash(seed, 9003 + k, m) * 2.3), age = t - t0;
    if (age <= 0 || age > (R + L) / v) continue;
    const p = rpDropAt(W, k, m);
    bursts.push({ x: p.x, y: p.y, a: WATER_DROP_A, R, f: age * v, L, id: W.nn + k, node: -1 });
  }
  return { nodes: drip ? [] : nodes, bursts, ph: (t / RP_PERIOD) % 1 };
}
// Where rain slot k's m-th drop lands: inside the boundary, else in the disc round the nodes
function rpDropAt(W, k, m) {
  const R = j => rpHash(W.seedI, 20000 + k * 16 + j, m), RG = W.RG;
  if (RG) {
    let x, y;
    for (let j = 0; j < 8; j++) { x = RG.x0 + R(2 * j) * (RG.x1 - RG.x0); y = RG.y0 + R(2 * j + 1) * (RG.y1 - RG.y0); if (RG.has({ x, y })) break; }
    return { x, y };
  }
  const a = R(0) * Math.PI * 2, r = W.rad * Math.sqrt(R(1));
  return { x: W.cx + Math.cos(a) * r, y: W.cy + Math.sin(a) * r };
}

// Per recording: the grid, the surface noise on it and the steady nodes'
// summed (or strongest) wave at phase 0
function rpBase(ops) {
  const W = ops.water;
  if (W._rp) return W._rp;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x, y, r) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
  W.src.slice(0, W.nn).forEach(q => grow(q.x, q.y, q.R));
  if (W.nd) { if (W.RG) { grow(W.RG.x0, W.RG.y0, 3.5 * W.lam); grow(W.RG.x1, W.RG.y1, 3.5 * W.lam); } else grow(W.cx, W.cy, W.rad + 3.5 * W.lam); }
  if (W.RG) { x0 = Math.max(x0, W.RG.x0 - 30); y0 = Math.max(y0, W.RG.y0 - 30); x1 = Math.min(x1, W.RG.x1 + 30); y1 = Math.min(y1, W.RG.y1 + 30); }
  let h = W.lam / WATER_CELL;
  if ((x1 - x0) * (y1 - y0) / (h * h) > WATER_CELLS) h = Math.sqrt((x1 - x0) * (y1 - y0) / WATER_CELLS);
  const nx = Math.max(2, Math.ceil((x1 - x0) / h) + 1), ny = Math.max(2, Math.ceil((y1 - y0) / h) + 1), N = nx * ny;
  const stop = W.o.meet === 'stop';
  const G = { x0, y0, h, nx, ny, N, stop, nz: null, re: null, im: null, own: null, best: null,
    fr: new Float32Array(N), fi: new Float32Array(N), fo: stop ? new Int16Array(N) : null, fb: stop ? new Float32Array(N) : null,
    T: rpTraceBufs(N), steady: null };
  if (W.amp) { G.nz = new Float32Array(N); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) G.nz[j * nx + i] = W.noise(x0 + i * h, y0 + j * h); }
  W._rp = G;
  return G;
}
// The steady nodes' wave at phase 0, built on first use (not needed for Drips)
function rpSteady(W, G) {
  if (G.steady) return G.steady;
  const N = G.N, re = new Float32Array(N), im = new Float32Array(N);
  const own = G.stop ? new Int16Array(N).fill(-1) : null, best = G.stop ? new Float32Array(N) : null;
  W.src.slice(0, W.nn).forEach((q, si) => rpAdd(W, G, re, im, own, best, q, si, 0, Infinity, 0));
  G.steady = { re, im, own, best };
  return G.steady;
}
// One source's waves added to the field: all of it (L = ∞: steady) or a
// burst (rings between f − L and f). Phase k·(d − off): every burst uses the
// steady nodes' phase (off = φ·spacing), so overlapping bursts of one node
// line up instead of breaking each other's rings
function rpAdd(W, G, re, im, own, best, q, si, f, L, off) {
  const { x0, y0, h, nx, ny, nz } = G, R = q.R, lam = W.lam;
  const ro = Math.min(R, L === Infinity ? R : f), ri = L === Infinity ? 0 : Math.max(0, f - L);
  if (ro <= ri) return;
  const R2 = R * R, ro2 = ro * ro, ri2 = ri * ri, LUT = WATER_LUT, kL = W.k / (Math.PI * 2) * WATER_LUT_N;
  const j0 = Math.max(0, Math.floor((q.y - ro - y0) / h)), j1 = Math.min(ny - 1, Math.ceil((q.y + ro - y0) / h));
  const span = (a, b, dy, j) => {
    const i0 = Math.max(0, Math.floor((q.x + a - x0) / h)), i1 = Math.min(nx - 1, Math.ceil((q.x + b - x0) / h));
    for (let i = i0; i <= i1; i++) {
      const dx = x0 + i * h - q.x, d2 = dx * dx + dy * dy;
      if (d2 >= ro2 || d2 < ri2) continue;
      const d = Math.sqrt(d2), id = j * nx + i;
      const t2 = d2 / R2;
      let e = (1 - t2) * (1 - t2) * q.a * rpTaper(d, lam);
      if (L !== Infinity) e *= rpEnv((f - d) / L);
      if (e <= 0) continue;
      const ph = (d - off + (nz ? nz[id] : 0)) * kL;
      const li = 2 * (((Math.round(ph) % WATER_LUT_N) + WATER_LUT_N) % WATER_LUT_N);
      if (own) {
        if (e <= best[id]) continue;
        best[id] = e; own[id] = si; re[id] = e * LUT[li]; im[id] = e * LUT[li + 1];
      } else {
        const ep = e * e * Math.sqrt(e);   // e ^ WATER_SHARP, as waterGrid
        re[id] += ep * LUT[li]; im[id] += ep * LUT[li + 1];
      }
    }
  };
  for (let j = j0; j <= j1; j++) {
    const dy = y0 + j * h - q.y, xo = Math.sqrt(Math.max(0, ro2 - dy * dy));
    if (ri > 0 && dy * dy < ri2) {   // the ring's two runs on this row
      const xi = Math.sqrt(ri2 - dy * dy);
      span(-xo, -xi + h, dy, j); span(xi - h, xo, dy, j);
    } else span(-xo, xo, dy, j);
  }
}

// The field for time t: steady nodes turned by the common phase, bursts added
function rpField(W, G, S0) {
  const { fr, fi, fo, fb, N } = G;
  if (S0.nodes.length) {
    const st = rpSteady(W, G), a = -S0.ph * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
    // re' + i·im' = (re + i·im)·e^(iA): the crests (phase 0) move outward by φ
    for (let i = 0; i < N; i++) { const r = st.re[i], m = st.im[i]; fr[i] = r * cs - m * sn; fi[i] = r * sn + m * cs; }
    if (fo) { fo.set(st.own); fb.set(st.best); }
  } else { fr.fill(0); fi.fill(0); if (fo) { fo.fill(-1); fb.fill(0); } }
  S0.bursts.forEach(b => rpAdd(W, G, fr, fi, fo, fb, b, b.id, b.f, b.L, S0.ph * W.lam));
}

// Trace buffers, kept with the grid: per grid edge (2 per corner) its
// crossing point, amplitude, re and two segment slots; per segment its ends
function rpTraceBufs(N) {
  const E = 2 * N;
  return { ex: new Float32Array(E), ey: new Float32Array(E), ea: new Float32Array(E), er: new Float32Array(E),
    stamp: new Int32Array(E), s1: new Int32Array(E), s2: new Int32Array(E), frame: 0,
    sa: new Int32Array(1024), sb: new Int32Array(1024), used: new Uint8Array(512), line: new Int32Array(1024) };
}
// Crest lines (im = 0, re > 0), as waterSegments + waterChains + waterSimplify
// but on typed arrays. Calls out(x[], y[], a[], n) per simplified line.
function rpTrace(G, sharp, out) {
  const { nx, ny, h, x0, y0, fr: re, fi: im, fo: own, T } = G;
  const st = ++T.frame, ex = T.ex, ey = T.ey, ea = T.ea, er = T.er, stamp = T.stamp, s1 = T.s1, s2 = T.s2;
  let ns = 0;
  const inv = 1 / sharp;
  const edge = (a, b, eid) => {
    if (stamp[eid] === st) return eid;
    const t = im[a] / (im[a] - im[b]), ra = re[a] + (re[b] - re[a]) * t;
    const ia = a % nx, ja = (a - ia) / nx, ib = b % nx, jb = (b - ib) / nx;
    ex[eid] = x0 + (ia + (ib - ia) * t) * h; ey[eid] = y0 + (ja + (jb - ja) * t) * h;
    er[eid] = ra; ea[eid] = Math.pow(Math.abs(ra), inv);
    stamp[eid] = st; s1[eid] = -1; s2[eid] = -1;
    return eid;
  };
  const seg = (p, q) => {
    if (er[p] + er[q] <= 0) return;   // crests only
    if (ns >= T.sa.length) { const g = n => { const z = new Int32Array(n.length * 2); z.set(n); return z; }; T.sa = g(T.sa); T.sb = g(T.sb); }
    T.sa[ns] = p; T.sb[ns] = q;
    if (s1[p] < 0) s1[p] = ns; else s2[p] = ns;
    if (s1[q] < 0) s1[q] = ns; else s2[q] = ns;
    ns++;
  };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const A = j * nx + i, B = A + 1, D = A + nx, C = D + 1;
    const sa = im[A] > 0, sb = im[B] > 0, sc = im[C] > 0, sd = im[D] > 0;
    if (sa === sb && sb === sc && sc === sd) continue;
    if (re[A] <= 0 && re[B] <= 0 && re[C] <= 0 && re[D] <= 0) continue;
    if (own && !(own[A] >= 0 && own[A] === own[B] && own[A] === own[C] && own[A] === own[D])) continue;
    let e0 = -1, e1 = -1, e2 = -1, e3 = -1, n = 0;
    const put = e => { if (n === 0) e0 = e; else if (n === 1) e1 = e; else if (n === 2) e2 = e; else e3 = e; n++; };
    if (sa !== sb) put(edge(A, B, 2 * A));
    if (sb !== sc) put(edge(B, C, 2 * B + 1));
    if (sd !== sc) put(edge(D, C, 2 * D));
    if (sa !== sd) put(edge(A, D, 2 * A + 1));
    if (n === 2) seg(e0, e1);
    else if (n === 4) {
      const ctr = (im[A] + im[B] + im[C] + im[D]) > 0;
      if (ctr === sa) { seg(e0, e1); seg(e2, e3); } else { seg(e0, e3); seg(e1, e2); }
    }
  }
  // Chain segments through shared edges, then simplify and hand out
  if (T.used.length < ns) T.used = new Uint8Array(ns * 2); else T.used.fill(0, 0, ns);
  const used = T.used, sa = T.sa, sb = T.sb;
  let line = T.line;
  const next = (e) => { const a = s1[e], b = s2[e]; return a >= 0 && !used[a] ? a : b >= 0 && !used[b] ? b : -1; };
  const walk = (buf, n, e) => {
    for (;;) {
      const g = next(e);
      if (g < 0) return { buf, n };
      used[g] = 1;
      e = sa[g] === e ? sb[g] : sa[g];
      if (n >= buf.length) { const z = new Int32Array(buf.length * 2); z.set(buf); buf = z; }
      buf[n++] = e;
    }
  };
  let back = new Int32Array(256);
  for (let k = 0; k < ns; k++) {
    if (used[k]) continue;
    used[k] = 1;
    let r = walk(back, 0, sa[k]); back = r.buf; const nb = r.n;
    if (line.length < nb + 2) line = new Int32Array((nb + 2) * 2);
    for (let m = 0; m < nb; m++) line[m] = back[nb - 1 - m];
    line[nb] = sa[k]; line[nb + 1] = sb[k];
    r = walk(line, nb + 2, sb[k]); line = r.buf;
    rpEmit(T, line, r.n, out);
  }
  T.line = line;
}
// Douglas–Peucker (as waterSimplify) on one chain of edge ids, then out()
const RP_KEEP = { k: new Uint8Array(1024), x: new Float32Array(1024), y: new Float32Array(1024), a: new Float32Array(1024), st: new Int32Array(2048) };
function rpEmit(T, line, n, out) {
  if (n < 2) return;
  const ex = T.ex, ey = T.ey, ea = T.ea, K = RP_KEEP;
  if (K.k.length < n) { K.k = new Uint8Array(n * 2); K.x = new Float32Array(n * 2); K.y = new Float32Array(n * 2); K.a = new Float32Array(n * 2); K.st = new Int32Array(n * 4); }
  const keep = K.k; keep.fill(0, 0, n); keep[0] = keep[n - 1] = 1;
  let sp = 0; K.st[sp++] = 0; K.st[sp++] = n - 1;
  while (sp) {
    const b = K.st[--sp], a = K.st[--sp];
    const Ax = ex[line[a]], Ay = ey[line[a]], dx = ex[line[b]] - Ax, dy = ey[line[b]] - Ay, L = Math.hypot(dx, dy);
    let far = -1, fd = WATER_SIMPLIFY;
    for (let i = a + 1; i < b; i++) {
      const px = ex[line[i]] - Ax, py = ey[line[i]] - Ay;
      const d = L > 1e-6 ? Math.abs(px * dy - py * dx) / L : Math.hypot(px, py);
      if (d > fd) { fd = d; far = i; }
    }
    if (far > 0) {
      keep[far] = 1;
      if (sp + 4 > K.st.length) { const z = new Int32Array(K.st.length * 2); z.set(K.st); K.st = z; }
      K.st[sp++] = a; K.st[sp++] = far; K.st[sp++] = far; K.st[sp++] = b;
    }
  }
  let m = 0;
  for (let i = 0; i < n; i++) if (keep[i]) { const e = line[i]; K.x[m] = ex[e]; K.y[m] = ey[e]; K.a[m] = ea[e]; m++; }
  out(K.x, K.y, K.a, m);
}

// Draw on: how much of the water shows at (x, y): 1 inside a node's reach ×
// its progress, fading over RP_REVEAL wavelengths
function rpReveal(W, rv) {
  if (!rv) return null;
  const N = W.src.slice(0, W.nn), e = RP_REVEAL * W.lam;
  return (x, y) => {
    let v = 0;
    for (let i = 0; i < N.length && v < 1; i++) {
      const p = rv[i]; if (p <= 0) continue;
      const q = N[i], u = (p * (q.R + e) - Math.hypot(x - q.x, y - q.y)) / e;
      if (u > 0) v = Math.max(v, Math.min(1, u));
    }
    return v * v * (3 - 2 * v);
  };
}

// One frame of ripples for a Water list: runs of points by strength bin.
// Returns { pts: Float32Array (x, y pairs), runs: [bin, i0, i1, closed] }
function rippleFrame(ops, t, drip, rv, wp) {
  const W = ops.water, G = rpBase(ops), S0 = rpSources(W, t, drip);
  const P = [], runs = [], fade = rpReveal(W, rv);
  const bin = a => Math.min(WATER_BINS - 1, Math.floor(Math.min(1, a) * WATER_BINS));
  const put = (x, y) => { if (wp) { const d = wp(x, y); P.push(x + d[0], y + d[1]); } else P.push(x, y); };
  if (W.o.meet === 'cross') rpRings(W, S0, fade, bin, put, P, runs);
  else {
    rpField(W, G, S0);
    rpTrace(G, G.stop ? 1 : W.sharp, (X, Y, A, n) => {
      if (fade) for (let i = 0; i < n; i++) A[i] *= fade(X[i], Y[i]);
      let k = 0;
      while (k < n - 1) {
        const b = bin(A[k]);
        let e = k + 1;
        while (e < n - 1 && bin(A[e]) === b) e++;
        if (b > 0 || A[k] > RP_MIN_A) {
          const i0 = P.length / 2;
          for (let m = k; m <= e; m++) put(X[m], Y[m]);
          runs.push([b, i0, P.length / 2, false]);
        }
        k = e;
      }
    });
  }
  return { pts: P, runs };
}
// Cross freely: plain rings per source (steady: every wavelength, moved out
// by the phase; bursts: the rings inside the burst)
function rpRings(W, S0, fade, bin, put, P, runs) {
  const lam = W.lam;
  const ring = (q, r, s) => {
    const b = bin(s);
    if (!(b > 0 || s > RP_MIN_A)) return;
    const n = Math.max(24, Math.ceil(r * 2 * Math.PI / 6)), i0 = P.length / 2;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const rr = r - W.noise(q.x + ca * r, q.y + sa * r);
      put(q.x + ca * rr, q.y + sa * rr);
    }
    runs.push([b, i0, P.length / 2, true]);
  };
  S0.nodes.forEach(q => {
    for (let r = S0.ph * lam; r < q.R; r += lam) {
      if (r < 0.15 * lam) continue;
      const s = waterFade(r, q.R) * q.a * rpTaper(r, lam) * (fade ? rpRingFade(fade, q, r) : 1);
      ring(q, r, s);
    }
  });
  S0.bursts.forEach(q => {
    for (let r = S0.ph * lam + Math.max(0, Math.floor((q.f - q.L) / lam)) * lam; r < Math.min(q.f, q.R); r += lam) {
      if (r < 0.15 * lam) continue;
      const s = waterFade(r, q.R) * q.a * rpTaper(r, lam) * rpEnv((q.f - r) / q.L) * (fade ? rpRingFade(fade, q, r) : 1);
      ring(q, r, s);
    }
  });
}
// A ring is one stroke: Draw on fades it by the reveal on its rim, averaged
function rpRingFade(fade, q, r) {
  let v = 0;
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; v += fade(q.x + Math.cos(a) * r, q.y + Math.sin(a) * r); }
  return v / 8;
}

// Is this list drawn as ripples this frame?
function ripplesOn(F, ops) { return !!(F && F.rp != null && ops.water); }
// Ripples for one list, on top, through the same copies and bend
// prog / F.np: Draw on (whole design, or per node)
function symDrawRipples(D, x, ops, a, prog, wp) {
  const F = D.F, W = ops.water;
  if (a <= 0.003) return;
  const rv = prog < 1 ? (F.np ? Array.from({ length: W.nn }, (_, i) => F.np[i] ?? 1) : new Array(W.nn).fill(prog)) : null;
  const R = rippleFrame(ops, F.rp, F.rpDrip, rv, wp);
  if (!R.runs.length) return;
  const P = R.pts, byBin = Array.from({ length: WATER_BINS }, () => []);
  R.runs.forEach(r => byBin[r[0]].push(r));
  eachCopy(x, D.copies, () => {
    x.strokeStyle = WATER_COL; x.lineCap = 'round'; x.lineJoin = 'round';
    byBin.forEach((rs, b) => {
      if (!rs.length) return;
      const t = (b + 0.5) / WATER_BINS;
      x.globalAlpha = (WATER_ALPHA_MIN + (1 - WATER_ALPHA_MIN) * t) * Math.min(1, a);
      x.lineWidth = W.weight * WATER_LW * (0.45 + 0.55 * t) * F.lw;
      x.beginPath();
      rs.forEach(([, i0, i1, closed]) => {
        x.moveTo(P[2 * i0], P[2 * i0 + 1]);
        for (let i = i0 + 1; i < i1; i++) x.lineTo(P[2 * i], P[2 * i + 1]);
        if (closed) x.closePath();
      });
      x.stroke();
    });
  });
  x.globalAlpha = 1;
}
