// ── ARCANE CIRCLES ─────────────────────────────────────────────────────────
// Every node is a circle construct (rings, a band of script, ticks or a wave,
// an inscribed figure with vertex circles, a sigil in the middle); size = node
// size. The constructs are joined by script bands (spanning tree) and by
// triangles through the widest triples, inside a great ring with a hatched
// outer ring and small satellite circles. Everything is stroked, nothing
// filled: lines and rings stop at the circles they pass behind.
// Used by: RENDERERS. Borrows drawChaosGlyph (Chaosgate) for some glyphs.
function arcScriptGlyph(R) {
  // A small stroked glyph in the unit box [-.5,.5]²: 2–3 distinct primitives
  const P = [
    () => [[[0, -0.5], [0, 0.5]]],
    () => [[[-0.4, -0.45], [0.4, -0.45]]],
    () => [[[-0.4, 0.45], [0.4, 0.45]]],
    () => [[[-0.4, 0], [0.4, 0]]],
    () => [[[-0.4, 0.5], [0.4, -0.5]]],
    () => { const r = 0.2 + R() * 0.12, oy = (R() - 0.5) * 0.4, pts = []; for (let k = 0; k <= 10; k++) { const a = k / 10 * Math.PI * 2; pts.push([Math.cos(a) * r, oy + Math.sin(a) * r]); } return [pts]; },
    () => [[[-0.35, -0.5], [-0.35, 0.3], [0.3, 0.3]]],
    () => [[[0, -0.45], [0.42, 0.4], [-0.42, 0.4], [0, -0.45]]],
    () => [[[-0.4, -0.2], [-0.15, 0.3], [0.1, -0.2], [0.4, 0.3]]],
    () => { const pts = []; for (let k = 0; k <= 8; k++) { const a = Math.PI * (0.2 + k / 8 * 1.2); pts.push([Math.cos(a) * 0.32, -0.1 + Math.sin(a) * 0.32]); } return [pts]; }
  ];
  const n = 2 + (R() < 0.4 ? 1 : 0), used = new Set(), out = [];
  while (used.size < n) used.add(Math.floor(R() * P.length));
  used.forEach(i => out.push(...P[i]()));
  return out;
}

// Hand-drawn wobble: a context wrapper that turns lines and arcs into short
// polylines and bends every point by a smooth noise field. Most of the bend
// depends only on the position, so lines that meet still meet and circles
// close; a smaller part changes per path, so neighbouring strokes don't wave
// exactly in step (like ink lines drawn one at a time).
function wobbleCtx(c, amp, seed) {
  const sd = Math.floor(seed * 1e6);
  const ph = [0, 1, 2, 3, 4, 5, 6, 7].map(i => sr(sd * 7 + i * 13 + 1) * Math.PI * 2);
  let pk = 0;                                       // per-path phase
  const off = (x, y) => {
    const a = 0.0105, b = 0.027, q = 0.05, k = pk * 1.7;
    const dx = Math.sin(x * a + y * a * 0.6 + ph[0]) * 0.55 + Math.sin(-x * b * 0.7 + y * b + ph[1]) * 0.3 + Math.sin(x * q + y * q * 0.4 + ph[2] + k) * 0.25;
    const dy = Math.sin(y * a - x * a * 0.5 + ph[3]) * 0.55 + Math.sin(x * b + y * b * 0.8 + ph[4]) * 0.3 + Math.sin(-x * q * 0.5 + y * q + ph[5] + k) * 0.25;
    return [x + dx * amp, y + dy * amp];
  };
  const STEP = 6;
  let cx = null, cy = null, sx = 0, sy = 0;
  const lineRaw = (x, y) => {
    const L = Math.hypot(x - cx, y - cy), n = Math.max(1, Math.min(200, Math.ceil(L / STEP)));
    for (let i = 1; i <= n; i++) { const t = i / n; c.lineTo(...off(cx + (x - cx) * t, cy + (y - cy) * t)); }
    cx = x; cy = y;
  };
  const h = {
    beginPath() { pk++; cx = null; c.beginPath(); },
    moveTo(x, y) { cx = sx = x; cy = sy = y; c.moveTo(...off(x, y)); },
    lineTo(x, y) { if (cx === null) h.moveTo(x, y); else lineRaw(x, y); },
    arc(x, y, r, a0, a1, ccw) {
      const TAU = Math.PI * 2;
      let sw = a1 - a0;
      if (!ccw) sw = sw >= TAU ? TAU : ((sw % TAU) + TAU) % TAU;
      else sw = -sw >= TAU ? -TAU : -((((-sw) % TAU) + TAU) % TAU);
      const px = x + Math.cos(a0) * r, py = y + Math.sin(a0) * r;
      if (cx === null) h.moveTo(px, py); else lineRaw(px, py);
      const n = Math.max(6, Math.min(240, Math.ceil(Math.abs(sw) * r / STEP)));
      for (let i = 1; i <= n; i++) { const a = a0 + sw * i / n; c.lineTo(...off(x + Math.cos(a) * r, y + Math.sin(a) * r)); }
      cx = x + Math.cos(a0 + sw) * r; cy = y + Math.sin(a0 + sw) * r;
    },
    closePath() { if (cx !== null && (cx !== sx || cy !== sy)) lineRaw(sx, sy); c.closePath(); cx = sx; cy = sy; },
    quadraticCurveTo(a, b, x, y) { c.quadraticCurveTo(...off(a, b), ...off(x, y)); cx = x; cy = y; },
    bezierCurveTo(a, b, d, e, x, y) { c.bezierCurveTo(...off(a, b), ...off(d, e), ...off(x, y)); cx = x; cy = y; }
  };
  return new Proxy(c, {
    get(t, p) { if (p in h) return h[p]; const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; },
    set(t, p, v) { t[p] = v; return true; }
  });
}

const RING_V = 9;   // Turning rings: rim speed of a band, world units per second (× animation speed)
function renderArcane(c, nodes, density, sigma, weight, seed) {
  if (!nodes.length) return;
  const AO = S.arcane || {};
  if (AO.wobble > 0) c = wobbleCtx(c, AO.wobble / 100 * 4.5, seed);
  let s = Math.floor(seed * 1e6) * 31 + 9;
  const R = () => sr(s++);
  const TAU = Math.PI * 2;
  const COL = '#e4ddd0', COL_DIM = 'rgba(228, 221, 208, 0.55)';
  c.lineCap = 'round'; c.lineJoin = 'round';
  // Turning rings: rad/s for a band at radius r (rim speed RING_V, varied per
  // band by a hash, so no R() draws); dir +1 / -1
  const turnW = (r, dir, h) => dir * RING_V / Math.max(10, r) * (0.75 + 0.5 * sr(h));
  const W = weight, Wt = weight * 0.6;
  const stroke = (col, w) => { c.strokeStyle = col; c.lineWidth = w; };
  const circle = (x, y, r) => { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); };

  // Arcs of circle (x, y, r) outside the holes
  const ringAround = (x, y, r, holes, skip) => {
    const cuts = [];
    for (const h of holes) {
      if (h === skip) continue;
      const d = Math.hypot(h.x - x, h.y - y);
      if (d + r <= h.r) return;                                  // swallowed
      if (d >= r + h.r || d + h.r <= r || d < 1e-6) continue;
      const a0 = Math.atan2(h.y - y, h.x - x), al = Math.acos(Math.max(-1, Math.min(1, (r * r + d * d - h.r * h.r) / (2 * r * d))));
      cuts.push([a0 - al, a0 + al]);
    }
    if (!cuts.length) { circle(x, y, r); return; }
    // Normalise to [base, base + TAU) starting at the end of the first cut
    const base = cuts[0][1];
    const iv = cuts.map(([u, v]) => { let a = u - base; a = ((a % TAU) + TAU) % TAU; return [a, a + (v - u)]; }).sort((p, q) => p[0] - q[0]);
    let t = 0;
    const arc = (u, v) => { if (v - u > 1e-3) { c.moveTo(x + Math.cos(base + u) * r, y + Math.sin(base + u) * r); c.arc(x, y, r, base + u, base + v); } };
    iv.forEach(([u, v]) => { if (u > t) arc(t, Math.min(u, TAU)); t = Math.max(t, v); });
    if (t < TAU) arc(t, TAU);
  };
  // Straight segment minus the parts inside hole circles
  const segAround = (ax, ay, bx, by, holes) => {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    if (L2 < 1e-9) return;
    const cut = [];
    for (const h of holes) {
      const fx = ax - h.x, fy = ay - h.y, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - h.r * h.r, D = B * B - 4 * L2 * C;
      if (D <= 0) continue;
      const q = Math.sqrt(D), t0 = (-B - q) / (2 * L2), t1 = (-B + q) / (2 * L2);
      if (t1 > 0 && t0 < 1) cut.push([t0, t1]);
    }
    cut.sort((p, q) => p[0] - q[0]);
    let t = 0;
    const seg = (u, v) => { if (v - u > 1e-4) { c.moveTo(ax + dx * u, ay + dy * u); c.lineTo(ax + dx * v, ay + dy * v); } };
    cut.forEach(([u, v]) => { seg(t, Math.min(u, 1)); t = Math.max(t, v); });
    seg(t, 1);
  };
  const inHole = (x, y, holes) => holes.some(h => Math.hypot(x - h.x, y - h.y) < h.r);
  // One script glyph at (x, y), u along tx/ty, size w × h
  const glyphAt = (x, y, tx, ty, w, h, holes) => {
    if (holes && inHole(x, y, holes)) return;
    const nx = -ty, ny = tx;
    arcScriptGlyph(R).forEach(pl => pl.forEach(([u, v], k) => {
      const px = x + tx * u * w + nx * v * h, py = y + ty * u * w + ny * v * h;
      if (k) c.lineTo(px, py); else c.moveTo(px, py);
    }));
  };
  // Band contents between radii r0 < r1 around (x, y)
  const ringScript = (x, y, r0, r1, holes) => {
    const rm = (r0 + r1) / 2, h = (r1 - r0) * 0.62, n = Math.max(6, Math.floor(TAU * rm / (h * 1.25)));
    const a0 = R() * TAU;
    for (let k = 0; k < n; k++) {
      if (R() < 0.1) continue;                                   // word gaps
      const a = a0 + k / n * TAU;
      glyphAt(x + Math.cos(a) * rm, y + Math.sin(a) * rm, -Math.sin(a), Math.cos(a), h * 0.8, h, holes);
    }
  };
  const ringTicks = (x, y, r0, r1, step, holes) => {
    const n = Math.max(12, Math.floor(TAU * r1 / step));
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU, ca = Math.cos(a), sa = Math.sin(a);
      if (holes && inHole(x + ca * (r0 + r1) / 2, y + sa * (r0 + r1) / 2, holes)) continue;
      c.moveTo(x + ca * r0, y + sa * r0); c.lineTo(x + ca * r1, y + sa * r1);
    }
  };
  const ringWave = (x, y, r0, r1) => {
    const rm = (r0 + r1) / 2, amp = (r1 - r0) * 0.42, n = Math.max(24, Math.floor(TAU * rm / 3));
    for (let k = 0; k <= n; k++) {
      const a = k / n * TAU, rr = rm + amp * Math.sin(k * 1.9) * (0.35 + 0.65 * Math.abs(Math.sin(k * 0.21)));
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (k) c.lineTo(px, py); else c.moveTo(px, py);
    }
  };
  // Inscribed figure: polygon / star with small circles on its vertices
  const figure = (x, y, r, kind, rot) => {
    const vr = r * 0.16;
    const poly = (n, step, ph, open) => {
      const V = []; for (let k = 0; k < n; k++) { const a = ph + k / n * TAU; V.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
      const holes = open ? [] : V.map(([vx, vy]) => ({ x: vx, y: vy, r: vr }));
      for (let k = 0; k < n; k++) { const A = V[k], B = V[(k + step) % n]; segAround(A[0], A[1], B[0], B[1], holes); }
      return V;
    };
    let V = [];
    if (kind === 'tri') V = poly(3, 1, rot);
    else if (kind === 'hex') { V = poly(3, 1, rot).concat(poly(3, 1, rot + Math.PI)); }
    else if (kind === 'pent') V = poly(5, 2, rot);
    else if (kind === 'sq') { poly(4, 1, rot, true); poly(4, 1, rot + Math.PI / 4, true); }
    else if (kind === 'spokes') {
      const n = 6 + Math.floor(R() * 7);
      for (let k = 0; k < n; k++) { const a = rot + k / n * TAU; c.moveTo(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42); c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    } else if (kind === 'chords') {                              // crossing chords, like a hand-drawn star
      const n = 5 + Math.floor(R() * 5), R0 = r / 0.84;
      const hole = [{ x, y, r: r * 0.42 }];
      for (let k = 0; k < n; k++) {
        const a = R() * TAU, b = a + Math.PI * (0.55 + R() * 0.8);
        segAround(x + Math.cos(a) * R0, y + Math.sin(a) * R0, x + Math.cos(b) * R0, y + Math.sin(b) * R0, hole);
      }
    } else if (kind === 'nest') {                                // triangle in triangle
      V = poly(3, 1, rot);
      const r2 = r * 0.5;
      for (let k = 0; k < 3; k++) {
        const a = rot + Math.PI + k / 3 * TAU, b = rot + Math.PI + (k + 1) / 3 * TAU;
        c.moveTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2); c.lineTo(x + Math.cos(b) * r2, y + Math.sin(b) * r2);
      }
    }
    V.forEach(([vx, vy]) => circle(vx, vy, vr));
  };

  // 1. Layout: constructs on the nodes, centre and great ring
  // Jitter sets how much the circle sizes vary: 0 → all 66 × node size,
  // 100 → 0.5× to 1.9× (one seeded value per node)
  const J = Math.max(0, Math.min(1, sigma / 100));
  const K = nodes.map(n => ({ x: n.x, y: n.y, r: 66 * (n.size || 1) * Math.exp(J * (R() * 2 - 1) * 0.65), w: n.w || 1, gs: Math.floor(R() * 1e6) }));
  let cx = 0, cy = 0;
  K.forEach(k => { cx += k.x; cy += k.y; }); cx /= K.length; cy /= K.length;
  // Inside a boundary the rings centre on the boundary and the outer ring
  // sits just inside it (bR: distance from the centre to the nearest edge)
  const RGa = fillRegion();
  let bR = 0;
  if (RGa) {
    const P = RGa.pts;
    cx = 0; cy = 0; P.forEach(p => { cx += p.x; cy += p.y; }); cx /= P.length; cy /= P.length;
    bR = Infinity;
    P.forEach((p, i) => { const q = P[(i + 1) % P.length]; bR = Math.min(bR, segDist2(cx, cy, p.x, p.y, q.x, q.y)); });
  }
  // Snap: circles whose rims nearly meet (gap or overlap under ~35% of the
  // smaller radius) are resized until they just touch; closest pairs first,
  // and a circle only moves once. Inside a boundary a circle can also snap
  // to the inside of the outer ring. A circle lying just inside or just
  // outside the great ring (the double ring through the constructs, radius
  // Rg to Rg + 7; drawn when there are 2+ circles and Rg > 30) snaps to touch
  // it; circles the ring runs through are left alone.
  if (AO.snap && K.length > 1) {
    const lock = K.map(() => false), MINR = 14;
    const RgS = K.reduce((t, k) => t + Math.hypot(k.x - cx, k.y - cy), 0) / K.length;   // = Rg below (radii don't change it)
    const ringGap = k => { const d = Math.hypot(k.x - cx, k.y - cy); return d < RgS + 3.5 ? { g: RgS - d - k.r, r: RgS - d } : { g: d - RgS - 7 - k.r, r: d - RgS - 7 }; };
    const pairs = [];
    for (let i = 0; i < K.length; i++) for (let j = i + 1; j < K.length; j++) {
      const d = Math.hypot(K[i].x - K[j].x, K[i].y - K[j].y), g = d - K[i].r - K[j].r;
      if (Math.abs(g) < 0.35 * Math.min(K[i].r, K[j].r)) pairs.push({ i, j, g, rel: Math.abs(g) / Math.min(K[i].r, K[j].r) });
    }
    if (RGa) K.forEach((k, i) => {
      const g = (bR - 16) - Math.hypot(k.x - cx, k.y - cy) - k.r;
      if (Math.abs(g) < 0.35 * k.r) pairs.push({ i, j: -1, g, rel: Math.abs(g) / k.r });
    });
    if (RgS > 30) K.forEach((k, i) => {
      const { g } = ringGap(k);
      if (Math.abs(g) < 0.35 * k.r) pairs.push({ i, j: -2, g, rel: Math.abs(g) / k.r });
    });
    pairs.sort((a, b) => a.rel - b.rel);
    pairs.forEach(({ i, j }) => {
      const A = K[i];
      if (j === -1) { if (!lock[i]) { const r = (bR - 16) - Math.hypot(A.x - cx, A.y - cy); if (r > MINR) { A.r = r; lock[i] = true; } } return; }
      if (j === -2) { if (!lock[i]) { const { r } = ringGap(A); if (r > MINR) { A.r = r; lock[i] = true; } } return; }
      const B = K[j], d = Math.hypot(A.x - B.x, A.y - B.y), g = d - A.r - B.r;
      if (lock[i] && lock[j]) return;
      if (!lock[i] && !lock[j]) {
        const ra = A.r + g * A.r / (A.r + B.r), rb = B.r + g * B.r / (A.r + B.r);
        if (ra > MINR && rb > MINR) { A.r = ra; B.r = rb; lock[i] = lock[j] = true; }
      } else {
        const [F, fi] = lock[i] ? [B, j] : [A, i], other = lock[i] ? A : B, r = d - other.r;
        if (r > MINR) { F.r = r; lock[fi] = true; }
      }
    });
  }
  const dist = K.map(k => Math.hypot(k.x - cx, k.y - cy));
  const many = K.length > 1;
  const Rg = many ? dist.reduce((a, b) => a + b, 0) / K.length : 0;
  let outerR = 0; K.forEach((k, i) => { outerR = Math.max(outerR, dist[i] + k.r); });
  outerR += 26;
  // Boundary: the space between the design and the outer ring gets extra
  // script bands; the outer ring (with its ticks) moves out to the edge
  const fillers = [];
  if (RGa) {
    const target = bR - 16;
    if (target > outerR + 34) {
      const nb = Math.min(4, Math.floor((target - outerR) / 34));
      for (let b = 1; b <= nb; b++) fillers.push(outerR + (target - outerR) * b / (nb + 1));
    }
    outerR = Math.max(40, target);
  }
  const holes = K.map(k => ({ x: k.x, y: k.y, r: k.r }));
  // Satellites on the great ring, away from the constructs
  const sats = [];
  const nSat = many && AO.sats !== false ? Math.round(density * 0.6) : 0;
  for (let t = 0; t < nSat * 6 && sats.length < nSat; t++) {
    const a = R() * TAU, r = 12 + R() * 14, x = cx + Math.cos(a) * Rg, y = cy + Math.sin(a) * Rg;
    if (holes.concat(sats).some(h => Math.hypot(h.x - x, h.y - y) < h.r + r + 8)) continue;
    sats.push({ x, y, r, kind: Math.floor(R() * 4), gs: Math.floor(R() * 1e6) });
  }
  const allHoles = holes.concat(sats);
  // Central figure if the middle is free
  let Rin = Infinity;
  K.forEach((k, i) => { Rin = Math.min(Rin, dist[i] - k.r - 14); });
  const centre = many && Rin > 38;

  // 2. Great ring (double), hatched outer ring, central rings
  stroke(COL, W);
  c.beginPath();
  if (many && Rg > 30) { ringAround(cx, cy, Rg, allHoles); ringAround(cx, cy, Rg + 7, allHoles); }
  if (many) ringAround(cx, cy, outerR, allHoles);
  c.stroke();
  if (!many) { stroke(COL, W); c.beginPath(); circle(cx, cy, outerR); c.stroke(); }
  {
    stroke(COL_DIM, Wt); c.beginPath();
    ringTicks(cx, cy, outerR + 4, outerR + 12, 3.2, allHoles);
    c.stroke();
  }
  // Filler bands between the design and a boundary's outer ring: a ring with
  // script just inside it (alternating with plain ticks)
  fillers.forEach((r, b) => {
    stroke(COL, W); c.beginPath(); ringAround(cx, cy, r, allHoles); c.stroke();
    if (!(b % 2)) c.turn(cx, cy, turnW(r - 7, b % 4 ? 1 : -1, b * 3.1 + 0.4));
    stroke(COL_DIM, Wt); c.beginPath();
    if (b % 2) ringTicks(cx, cy, r - 10, r - 3, 4.5, allHoles);
    else ringScript(cx, cy, r - 13, r - 2, allHoles);
    c.stroke();
    if (!(b % 2)) c.turn(null);
  });
  // Corners of a polygon boundary (outside the outer ring): a small sigil each
  if (RGa && RGa.pts.length <= 12 && AO.sats !== false) {
    let s2 = Math.floor(seed * 1e6) * 17 + 3;
    RGa.pts.forEach(v => {
      const dv = Math.hypot(v.x - cx, v.y - cy), gap = dv - bR;
      if (gap < 28) return;
      const r = Math.min(26, gap * 0.4), t = (bR + dv) / 2 / dv;
      sats.push({ x: cx + (v.x - cx) * t, y: cy + (v.y - cy) * t, r, kind: Math.floor(sr(s2++) * 4), gs: Math.floor(sr(s2++) * 1e6) });
    });
  }
  if (centre) {
    const r1 = Rin, r0 = Rin * 0.86;
    const hc = Math.floor(seed * 1e6) * 0.013 + 0.7;
    stroke(COL, W); c.beginPath();
    ringAround(cx, cy, r1, allHoles); ringAround(cx, cy, r0, allHoles);
    // (same path as the rings: points take the transform when they are added)
    c.turn(cx, cy, turnW(r0, -1, hc + 1));
    figure(cx, cy, r0 * 0.92, density > 5 ? 'hex' : 'tri', -Math.PI / 2 + (R() - 0.5) * 0.6);
    c.turn(null);
    c.stroke();
    c.turn(cx, cy, turnW((r0 + r1) / 2, 1, hc + 2));
    stroke(COL_DIM, Wt); c.beginPath(); ringScript(cx, cy, r0, r1, allHoles); c.stroke();
    c.turn(null);
    if (density > 3 && Rin > 70) { c.turn(cx, cy, turnW(r0 * 0.3, 1, hc + 3)); stroke(COL, W); c.beginPath(); circle(cx, cy, r0 * 0.3); c.stroke(); glyphCycle(c, Math.floor(seed * 1e6) + 77, sd => drawChaosGlyph(c, cx, cy, r0 * 0.2, sd, W, sigma, COL)); c.turn(null); }
  }

  // 3. Links: script bands along a spanning tree, single lines for triangles
  const edges = [];
  if (many) {
    const inT = [0], left = new Set(K.map((_, i) => i).slice(1));
    while (left.size) {
      let best = null;
      inT.forEach(i => left.forEach(j => { const d = Math.hypot(K[i].x - K[j].x, K[i].y - K[j].y); if (!best || d < best.d) best = { i, j, d }; }));
      edges.push(best); inT.push(best.j); left.delete(best.j);
    }
  }
  if (AO.links !== false) edges.forEach(({ i, j }) => {
    const A = K[i], B = K[j], d = Math.hypot(B.x - A.x, B.y - A.y);
    if (d < A.r + B.r + 6) return;
    const tx = (B.x - A.x) / d, ty = (B.y - A.y) / d, nx = -ty, ny = tx, bw = 7 + R() * 5;
    stroke(COL, W); c.beginPath();
    segAround(A.x + nx * bw, A.y + ny * bw, B.x + nx * bw, B.y + ny * bw, allHoles);
    segAround(A.x - nx * bw, A.y - ny * bw, B.x - nx * bw, B.y - ny * bw, allHoles);
    c.stroke();
    stroke(COL_DIM, Wt); c.beginPath();
    const h = bw * 1.25, n = Math.floor(d / (h * 1.2));
    for (let k = 1; k < n; k++) { if (R() < 0.1) continue; const t = k / n; glyphAt(A.x + tx * d * t, A.y + ty * d * t, tx, ty, h * 0.8, h, allHoles); }
    c.stroke();
  });
  if (K.length >= 3) {
    const tris = [];
    for (let a = 0; a < K.length; a++) for (let b = a + 1; b < K.length; b++) for (let e = b + 1; e < K.length; e++) {
      const ar = Math.abs((K[b].x - K[a].x) * (K[e].y - K[a].y) - (K[e].x - K[a].x) * (K[b].y - K[a].y));
      tris.push({ v: [a, b, e], ar });
    }
    tris.sort((p, q) => q.ar - p.ar);
    const nT = Math.min(tris.length, density >= 6 && K.length >= 4 ? 2 : 1);
    const used = [];
    stroke(COL, W); c.beginPath();
    for (const T of tris) {
      if (used.length >= nT) break;
      if (used.some(U => U.v.filter(v => T.v.includes(v)).length > 1)) continue;
      used.push(T);
      for (let m = 0; m < 3; m++) { const A = K[T.v[m]], B = K[T.v[(m + 1) % 3]]; segAround(A.x, A.y, B.x, B.y, allHoles); }
    }
    c.stroke();
  }

  // 4. Constructs, bottom to top: larger circles lie under smaller ones (ties:
  // the later node on top). Where a circle on top overlaps, the one under it is
  // clipped away inside it (just outside its rim), so nothing shows through.
  // Clip shape: a keyhole, a big disc round the covering circle with that
  // circle cut out (one simple polygon, so canvas and the SVG builder agree).
  const order = K.map((_, i) => i).sort((a, b) => K[b].r - K[a].r || a - b);
  const keyhole = (C, k, gap) => {
    const rc = C.r + gap, d = Math.hypot(k.x - C.x, k.y - C.y), Rb = d + k.r + rc + 40;
    const th = d > 1e-6 ? Math.atan2(C.y - k.y, C.x - k.x) : 0, n = 72;   // slit points away from k
    c.beginPath();
    for (let m = 0; m <= n; m++) { const a = th + m / n * TAU; const px = C.x + Math.cos(a) * Rb, py = C.y + Math.sin(a) * Rb; if (m) c.lineTo(px, py); else c.moveTo(px, py); }
    for (let m = 0; m <= n; m++) { const a = th - m / n * TAU; c.lineTo(C.x + Math.cos(a) * rc, C.y + Math.sin(a) * rc); }
    c.closePath(); c.clip();
  };
  order.forEach((i, z) => {
    const k = K[i];
    // (snapped circles that only touch keep both rims whole)
    const covers = order.slice(z + 1).map(j => K[j]).filter(C => Math.hypot(C.x - k.x, C.y - k.y) < C.r + k.r + (AO.snap ? -0.5 : 3));
    if (covers.length) { c.save(); covers.forEach(C => keyhole(C, k, 2.5 * W)); }
    const keep = s; s = k.gs * 13 + 5;                         // own random stream: stable when the order changes
    c.own(i); drawConstruct(k, i % 2 ? -1 : 1); c.own(-1);
    s = keep;
    if (covers.length) c.restore();
  });
  function drawConstruct(k, dir) {
    const bw = Math.max(8, k.r * (k.r > 120 ? 0.1 : 0.14));
    const bands = k.r > 120 ? 3 : k.r > 70 ? 2 : 1;
    let r = k.r;
    stroke(COL, W * k.w); c.beginPath(); circle(k.x, k.y, r); c.stroke();
    for (let b = 0; b < bands; b++) {
      const type = Math.floor(R() * 4), r0 = r - bw;
      stroke(COL, W * k.w); c.beginPath(); circle(k.x, k.y, r0); c.stroke();
      c.turn(k.x, k.y, turnW((r0 + r) / 2, b % 2 ? -dir : dir, k.gs * 0.001 + b * 1.7));
      stroke(COL_DIM, Wt * k.w); c.beginPath();
      if (type === 0 || type === 3) ringScript(k.x, k.y, r0, r);
      else if (type === 1) ringTicks(k.x, k.y, r0 + 1.5, r - 1.5, 3.4);
      else ringWave(k.x, k.y, r0, r);
      c.stroke();
      c.turn(null);
      r = r0 - (R() < 0.5 ? 0 : bw * 0.35);
      if (r !== r0) { stroke(COL, W * k.w); c.beginPath(); circle(k.x, k.y, r); c.stroke(); }
    }
    const kinds = ['tri', 'hex', 'pent', 'sq', 'spokes', 'chords', 'nest'];
    const kind = kinds[Math.floor(R() * kinds.length)];
    c.turn(k.x, k.y, turnW(r * 0.84, bands % 2 ? -dir : dir, k.gs * 0.001 + 9.3));
    stroke(COL, W * k.w); c.beginPath();
    figure(k.x, k.y, r * 0.84, kind, -Math.PI / 2 + (R() < 0.5 ? 0 : Math.PI / (kind === 'pent' ? 5 : 3)));
    const ri = r * (kind === 'spokes' ? 0.4 : kind === 'nest' ? 0.22 : 0.36);
    circle(k.x, k.y, ri);
    c.stroke();
    glyphCycle(c, k.gs, sd => drawChaosGlyph(c, k.x, k.y, ri * 0.62, sd, W * k.w, sigma, COL));
    c.turn(null);
  }

  // 5. Satellites: small circles with an element triangle or a sigil
  sats.forEach((q, qi) => {
    c.turn(q.x, q.y, turnW(q.r * 2.5, qi % 2 ? -1 : 1, q.gs * 0.001 + 5.5));
    stroke(COL, W); c.beginPath(); circle(q.x, q.y, q.r);
    if (q.kind < 2) {
      const up = q.kind === 0 ? -1 : 1, rr = q.r * 0.62;
      c.moveTo(q.x, q.y + up * rr); c.lineTo(q.x + rr * 0.87, q.y - up * rr * 0.5); c.lineTo(q.x - rr * 0.87, q.y - up * rr * 0.5); c.closePath();
      if (R() < 0.5) { c.moveTo(q.x - rr * 0.6, q.y); c.lineTo(q.x + rr * 0.6, q.y); }
      c.stroke();
    } else if (q.kind === 2) {
      circle(q.x, q.y, q.r * 0.78); c.stroke();
      glyphCycle(c, q.gs, sd => drawChaosGlyph(c, q.x, q.y, q.r * 0.45, sd, Wt, sigma, COL));
    } else {
      c.stroke();
      glyphCycle(c, q.gs, sd => drawChaosGlyph(c, q.x, q.y, q.r * 0.6, sd, Wt, sigma, COL));
    }
    c.turn(null);
  });
}
