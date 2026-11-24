// ── MICROSCOPE (darkfield) ─────────────────────────────────────────────────
// Nodes are large cells (double membrane, nucleus, organelles; cilia with
// jitter), joined by slime-mould veins along the node order. Around them float
// small organisms: cocci, rod bacteria, diatoms, spirilla, amoebae, specks.
// This is the Microorganisms specimen; Blood cells and Hyphae are in specimens.js.
// The organisms are placed without looking at the nodes (in the boundary, or
// a unit disc scaled round the nodes) and the cells push them aside, so a
// drifting node shoves them smoothly instead of making them pop.
// Used by: RENDERERS. Calls c.markEye() per nucleus for Blink (DRAW, Blink lids).

const MIC_COL = '#bfe9dc', MIC_DIM = 'rgba(191, 233, 220, 0.5)', MIC_FAINT = 'rgba(191, 233, 220, 0.22)';
const MIC_CYT = 'rgba(191, 233, 220, 0.06)';      // soft cytoplasm tone inside a cell
const MIC_TAU = Math.PI * 2;
// Layout (world units unless noted)
const MIC_CELL_R = 52;                 // cell radius at node size 1 (± 15%)
const MIC_ORG_MARGIN = 170;            // organisms spread this far past the farthest node
const MIC_ORGS_IN_BOUNDARY = 9, MIC_ORGS_FREE = 12;   // organisms per density step
const MIC_ORG_TRIES = 8;               // placement attempts per organism
const MIC_ORG_GAP = 6;                 // space between organisms
const MIC_CELL_HALO = 1.12, MIC_CELL_PAD = 4;         // organisms keep out of r × HALO + PAD
// Organism mix: [share up to, type, radius = base + size × spread]
const MIC_ORG_TYPES = [[0.24, 'coccus', 4, 4], [0.46, 'rod', 9, 9], [0.6, 'diatomC', 11, 10], [0.72, 'diatomP', 16, 12],
  [0.82, 'spiril', 16, 12], [0.9, 'amoeba', 13, 10], [Infinity, 'speck', 1.5, 2]];
// Line widths (× Stroke weight × node weight), shared by the drawing and the Blink eyes
const MIC_MEMBRANE_LW = 1.6, MIC_NUC_LW = 1.1;
const MIC_NUC_RING = 0.86;             // nucleus inner ring, × its outline

// renderMicroscope: built in stages on one shared object mc (micSetup).
// The stages draw from mc.R in the same order as before the split, so a seed
// gives the same slide. Organisms and cells also have their own streams (s0).
function renderMicroscope(c, nodes, density, sigma, weight, seed) {
  if (!nodes.length) return;
  const mc = micSetup(c, nodes, density, sigma, weight, seed);
  if (mc.MO.specimen === 'blood' || mc.MO.specimen === 'hyphae') { micSpecimen(mc, mc.MO.specimen); return; }   // specimens.js
  micCells(mc);
  micOrgPlace(mc);
  micOrgPush(mc);
  if (mc.MO.veins !== false) micVeinPairs(mc).forEach(([i, j]) => micVein(mc, mc.cells[i], mc.cells[j]));
  mc.orgs.forEach(o => { if (!o.out) micOrganism(mc, o); });
  mc.cells.forEach((k, ci) => micCell(mc, k, ci));
  c.own(-1);                                       // (also after a cell that returned early)
  c.globalAlpha = 1;
}

// Settings, the random stream, and the area: centroid and reach of the
// nodes, or the boundary
function micSetup(c, nodes, density, sigma, weight, seed) {
  const mc = { c, nodes, density, J: Math.max(0, Math.min(1, sigma / 100)), W: weight, BG: modeBg('microscope'),
    s: Math.floor(seed * 1e6) * 37 + 11, MO: S.micro || {} };
  mc.R = () => sr(mc.s++);
  c.lineCap = 'round'; c.lineJoin = 'round';
  let cx = 0, cy = 0;
  nodes.forEach(n => { cx += n.x; cy += n.y; }); cx /= nodes.length; cy /= nodes.length;
  let maxR = 60;
  nodes.forEach(n => { maxR = Math.max(maxR, Math.hypot(n.x - cx, n.y - cy)); });
  mc.cx = cx; mc.cy = cy; mc.reach = maxR + MIC_ORG_MARGIN;
  mc.RG = fillRegion();
  mc.fill = mc.RG ? mc.RG.scale(mc.reach * 0.8) : 1;
  mc.life = c.life ? g => c.life(g) : () => {};   // Life (animation) groups, see Rec.life
  return mc;
}

// ── Microscope: shape helpers ──
// Closed wobbly outline: r(θ) = r·(1 + Σ a_k sin(kθ + φ_k)), from mc.R
function micBlobFn(mc, r, amp) {
  const R = mc.R, TAU = MIC_TAU;
  const h = [2, 3, 4, 5, 7].map(k => ({ k, a: amp * (0.2 + R()) / k ** 0.7, p: R() * TAU }));
  const fn = a => r * (1 + h.reduce((t, q) => t + q.a * Math.sin(q.k * a + q.p), 0));
  fn.h = h; fn.r = r;          // Life redraws the outline from these
  return fn;
}
function micBlobPath(c, x, y, f, rot = 0, n = 64) {
  for (let i = 0; i <= n; i++) {
    const a = i / n * MIC_TAU, r = f(a);
    const px = x + Math.cos(a + rot) * r, py = y + Math.sin(a + rot) * r;
    i ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.closePath();
}
// (as a polygon: the display list and the SVG builder have no ellipse)
function micEllipse(c, x, y, rx, ry, rot) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  for (let i = 0; i <= 24; i++) { const a = i / 24 * MIC_TAU, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry; const px = x + ex * cs - ey * sn, py = y + ex * sn + ey * cs; i ? c.lineTo(px, py) : c.moveTo(px, py); }
  c.closePath();
}
function micDot(c, x, y, r) { c.moveTo(x + r, y); c.arc(x, y, r, 0, MIC_TAU); }
function micPolyline(c, pts) { pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); }

// ── Microscope: 1. cells, 2. organisms ──
// Cells on the nodes (shape decided now, drawn last)
function micCells(mc, size = 1) {
  const R = mc.R;
  mc.cells = mc.nodes.map(n => {
    const r = MIC_CELL_R * size * (n.size || 1) * (0.85 + R() * 0.3);
    return { x: n.x, y: n.y, r, w: n.w || 1, f: micBlobFn(mc, r, 0.05 + mc.J * 0.12), rot: R() * MIC_TAU, s0: Math.floor(R() * 1e6) };
  });
}

// Small organisms, placed in a fixed frame (the boundary, or a unit disc)
function micOrgPlace(mc) {
  const { RG, R, MO } = mc, orgs = mc.orgs = [];
  const N = Math.round(mc.density * (RG ? MIC_ORGS_IN_BOUNDARY : MIC_ORGS_FREE) * mc.fill * (MO.orgs !== undefined ? MO.orgs / 100 : 1));
  for (let t = 0; t < N * MIC_ORG_TRIES && orgs.length < N; t++) {
    const u = R(), v = R(), kind = R(), sz = R(), ang = R() * MIC_TAU;
    let x, y;
    if (RG) { x = RG.x0 + u * (RG.x1 - RG.x0); y = RG.y0 + v * (RG.y1 - RG.y0); if (!RG.has({ x, y })) continue; }
    else { const a = u * MIC_TAU, d = Math.sqrt(v); x = Math.cos(a) * d; y = Math.sin(a) * d; }   // unit disc
    const [, type, rBase, rSpread] = MIC_ORG_TYPES.find(o => kind < o[0]);
    const r = rBase + sz * rSpread;
    // Spacing among themselves (in the frame they were placed in)
    const k = RG ? 1 : 1 / mc.reach;
    if (orgs.some(o => Math.hypot(o.u - x, o.v - y) < (o.r + r + MIC_ORG_GAP) * k)) continue;
    orgs.push({ u: x, v: y, r, type, ang, s0: Math.floor(R() * 1e6), sz });
  }
}

// Then pushed out of every cell (and its halo) along the line from its
// centre, so a drifting cell shoves them; pushed past the boundary: left out
function micOrgPush(mc) {
  const { RG, cx, cy, reach } = mc;
  mc.orgs.forEach(o => {
    let x = RG ? o.u : cx + o.u * reach, y = RG ? o.v : cy + o.v * reach;
    for (const q of mc.cells) {
      const dx = x - q.x, dy = y - q.y, d = Math.hypot(dx, dy) || 1, need = q.r * MIC_CELL_HALO + o.r + MIC_CELL_PAD;
      if (d < need) { const p = need - d; x += dx / d * p; y += dy / d * p; }
    }
    o.x = x; o.y = y;
    o.out = !!RG && !RG.has(o);
  });
}

// ── Microscope: 3. veins (slime mould) ──
// Between the cells in node order, plus a chord (density 5+) and a closing
// vein (density 8+)
function micVeinPairs(mc) {
  const n = mc.cells.length, pairs = [];
  for (let i = 0; i + 1 < n; i++) pairs.push([i, i + 1]);
  if (n > 3 && mc.density >= 5) pairs.push([0, Math.floor(n / 2) + 1 < n ? Math.floor(n / 2) + 1 : n - 1]);
  if (n > 2 && mc.density >= 8) pairs.push([n - 1, 0]);
  return pairs;
}

// Tapered tube: thick at the ends, thinner in the middle; a soft fill
// between two outlines
function micTube(mc, pts, w0, w1) {
  const c = mc.c, L = [], Rr = [];
  pts.forEach((p, i) => {
    const t = i / (pts.length - 1), q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    let tx = q.x - o.x, ty = q.y - o.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const w = (w0 + (w1 - w0) * t) * (1 - 0.45 * Math.sin(Math.PI * t)) / 2;
    L.push({ x: p.x - ty * w, y: p.y + tx * w }); Rr.push({ x: p.x + ty * w, y: p.y - tx * w });
  });
  c.fillStyle = MIC_FAINT; c.globalAlpha = 1;
  c.beginPath(); micPolyline(c, L); for (let i = Rr.length - 1; i >= 0; i--) c.lineTo(Rr[i].x, Rr[i].y); c.closePath(); c.fill();
  c.strokeStyle = MIC_COL; c.lineWidth = mc.W * 0.7;
  c.beginPath(); micPolyline(c, L); c.stroke();
  c.beginPath(); micPolyline(c, Rr); c.stroke();
}
// Points along a cubic Bézier
function micBez(A, B, C, D, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, m = 1 - t;
    out.push({ x: m * m * m * A.x + 3 * m * m * t * B.x + 3 * m * t * t * C.x + t * t * t * D.x, y: m * m * m * A.y + 3 * m * m * t * B.y + 3 * m * t * t * C.y + t * t * t * D.y });
  }
  return out;
}

// One vein from cell A to cell B, bent at random, with side twigs
function micVein(mc, A, B) {
  const { R, J } = mc, d = Math.hypot(B.x - A.x, B.y - A.y);
  if (d < (A.r + B.r) * 0.9) return;
  const ux = (B.x - A.x) / d, uy = (B.y - A.y) / d, nx = -uy, ny = ux;
  const P0 = { x: A.x + ux * A.r * 0.8, y: A.y + uy * A.r * 0.8 }, P3 = { x: B.x - ux * B.r * 0.8, y: B.y - uy * B.r * 0.8 };
  const b1 = (R() - 0.5) * d * (0.25 + J * 0.5), b2 = (R() - 0.5) * d * (0.25 + J * 0.5);
  const P1 = { x: P0.x + ux * d * 0.3 + nx * b1, y: P0.y + uy * d * 0.3 + ny * b1 };
  const P2 = { x: P3.x - ux * d * 0.3 + nx * b2, y: P3.y - uy * d * 0.3 + ny * b2 };
  const pts = micBez(P0, P1, P2, P3, Math.max(12, Math.round(d / 8)));
  const wv = mc.W * 9 * (A.w + B.w) / 2;
  micTube(mc, pts, wv, wv * 0.9);
  micTwigs(mc, pts, Math.atan2(uy, ux), wv);
}
// Side twigs from the vein (direction a0), thinning out
function micTwigs(mc, pts, a0, wv) {
  const R = mc.R, tw = Math.round(1 + mc.density / 3);
  for (let k = 0; k < tw; k++) {
    const t = 0.2 + R() * 0.6, p = pts[Math.round(t * (pts.length - 1))], side = R() < 0.5 ? -1 : 1;
    const len = 20 + R() * 40, a = a0 + side * (0.6 + R() * 0.7);
    const E = { x: p.x + Math.cos(a) * len, y: p.y + Math.sin(a) * len };
    const M = { x: (p.x + E.x) / 2 + (R() - 0.5) * len * 0.5, y: (p.y + E.y) / 2 + (R() - 0.5) * len * 0.5 };
    micTube(mc, micBez(p, M, M, E, 10), wv * 0.45, wv * 0.12);
  }
}

// ── Microscope: 4. organisms ──
// Each one a Life group (it swims, see lifeMove), drawn from its own stream
function micOrganism(mc, o) {
  const g = { kind: o.type, x: o.x, y: o.y, r: o.r, ang: o.ang, hs: o.s0 };
  mc.life(g);
  let q = o.s0;
  const Q = () => sr(q++);
  mc.c.globalAlpha = 1;
  const draw = { speck: micSpeck, coccus: micCoccus, rod: micRod, diatomC: micDiatomC, diatomP: micDiatomP, spiril: micSpiril }[o.type] || micAmoeba;
  const am = draw(mc, o, Q);
  if (am) g.amoeba = am;
  mc.life(null);
}
function micSpeck(mc, o) { const c = mc.c; c.fillStyle = MIC_DIM; c.beginPath(); micDot(c, o.x, o.y, o.r * mc.W * 0.6 + 0.4); c.fill(); }
// Coccus: single, pair or tetrad
function micCoccus(mc, o) {
  const c = mc.c, { x, y, r, ang } = o, n = o.sz < 0.4 ? 1 : o.sz < 0.75 ? 2 : 4, rr = r * (n > 1 ? 0.7 : 1);
  c.strokeStyle = MIC_COL; c.lineWidth = mc.W * 0.9; c.beginPath();
  for (let k = 0; k < n; k++) { const a = ang + k / n * MIC_TAU; const ox = n > 1 ? Math.cos(a) * rr * 0.95 : 0, oy = n > 1 ? Math.sin(a) * rr * 0.95 : 0; micDot(c, x + ox, y + oy, rr); }
  c.stroke();
}
// Bacillus: a capsule, sometimes a short chain; flagellum on some
function micRod(mc, o, Q) {
  const c = mc.c, W = mc.W, { x, y, r, ang } = o;
  const n = Q() < 0.65 ? 1 : 2 + Math.floor(Q() * 2), h = r, w = 3 + o.sz * 2.5;
  const cs = Math.cos(ang), sn = Math.sin(ang);
  c.strokeStyle = MIC_COL; c.lineWidth = W * 0.9; c.beginPath();
  for (let k = 0; k < n; k++) {
    const off = (k - (n - 1) / 2) * (h * 2 + 3), bx = x + cs * off, by = y + sn * off;
    c.moveTo(bx + cs * (h - w) + -sn * w, by + sn * (h - w) + cs * w);
    c.arc(bx + cs * (h - w), by + sn * (h - w), w, ang + Math.PI / 2, ang - Math.PI / 2, true);
    c.lineTo(bx - cs * (h - w) + sn * w, by - sn * (h - w) - cs * w);
    c.arc(bx - cs * (h - w), by - sn * (h - w), w, ang - Math.PI / 2, ang + Math.PI / 2, true);
    c.closePath();
  }
  c.stroke();
  if (n === 1 && Q() < 0.5) {
    c.strokeStyle = MIC_DIM; c.lineWidth = W * 0.5; c.beginPath();
    const ex = x - cs * h, ey = y - sn * h; c.moveTo(ex, ey);
    for (let k = 1; k <= 12; k++) { const t = k / 12 * h * 1.4, wv = Math.sin(k * 1.3) * 3; c.lineTo(ex - cs * t - sn * wv, ey - sn * t + cs * wv); }
    c.stroke();
  }
}
// Centric diatom: rim, inner ring, radial striae
function micDiatomC(mc, o) {
  const c = mc.c, W = mc.W, { x, y, r, ang } = o;
  c.strokeStyle = MIC_COL; c.lineWidth = W; c.beginPath(); micDot(c, x, y, r); c.stroke();
  c.strokeStyle = MIC_DIM; c.lineWidth = W * 0.55; c.beginPath(); micDot(c, x, y, r * 0.78); micDot(c, x, y, r * 0.2);
  const m = Math.round(16 + r);
  for (let k = 0; k < m; k++) { const a = ang + k / m * MIC_TAU; c.moveTo(x + Math.cos(a) * r * 0.26, y + Math.sin(a) * r * 0.26); c.lineTo(x + Math.cos(a) * r * 0.74, y + Math.sin(a) * r * 0.74); }
  c.stroke();
}
// Pennate diatom: a boat shape with a raphe and transverse striae
function micDiatomP(mc, o) {
  const c = mc.c, W = mc.W, { x, y, r, ang } = o;
  const L = r, Wd = r * (0.22 + o.sz * 0.1), cs = Math.cos(ang), sn = Math.sin(ang);
  const P = (t, side) => { const w = Wd * Math.sqrt(Math.max(0, 1 - t * t)); return { x: x + cs * t * L - sn * w * side, y: y + sn * t * L + cs * w * side }; };
  c.strokeStyle = MIC_COL; c.lineWidth = W; c.beginPath();
  for (let k = 0; k <= 24; k++) { const p = P(-1 + 2 * k / 24, 1); k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }
  for (let k = 24; k >= 0; k--) { const p = P(-1 + 2 * k / 24, -1); c.lineTo(p.x, p.y); }
  c.closePath(); c.stroke();
  c.strokeStyle = MIC_DIM; c.lineWidth = W * 0.5; c.beginPath();
  c.moveTo(x - cs * L * 0.85, y - sn * L * 0.85); c.lineTo(x + cs * L * 0.85, y + sn * L * 0.85);
  const m = Math.round(L / 3);
  for (let k = 1; k < m; k++) { const t = -1 + 2 * k / m; if (Math.abs(t) < 0.12) continue; const a = P(t, 0.8), b = P(t, -0.8); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }
  c.stroke();
}
function micSpiril(mc, o) {
  const c = mc.c, { x, y, r, ang } = o;
  const L = r, cs = Math.cos(ang), sn = Math.sin(ang), turns = 2 + Math.floor(o.sz * 3), A = 3 + o.sz * 2;
  c.strokeStyle = MIC_COL; c.lineWidth = mc.W * 1.1; c.beginPath();
  for (let k = 0; k <= 40; k++) { const t = -1 + 2 * k / 40, w = Math.sin((t + 1) * Math.PI * turns) * A; const px = x + cs * t * L - sn * w, py = y + sn * t * L + cs * w; k ? c.lineTo(px, py) : c.moveTo(px, py); }
  c.stroke();
}
// Amoeba: lobed body, nucleus, a few food vacuoles. Returns what Life needs
// to redraw it with its lobes flowing.
function micAmoeba(mc, o, Q) {
  const c = mc.c, W = mc.W, BG = mc.BG, { x, y, r, ang } = o;
  const h = [2, 3, 5].map(k => ({ k, a: (0.12 + Q() * 0.2), p: Q() * MIC_TAU }));
  const f = a => r * (1 + h.reduce((t, e) => t + e.a * Math.sin(e.k * a + e.p), 0));
  c.fillStyle = BG; c.beginPath(); micBlobPath(c, x, y, f, ang, 40); c.fill();
  c.strokeStyle = MIC_COL; c.lineWidth = W * 0.9; c.stroke();
  c.strokeStyle = MIC_DIM; c.lineWidth = W * 0.6; c.beginPath(); micDot(c, x + r * 0.15, y - r * 0.1, r * 0.22); micDot(c, x - r * 0.3, y + r * 0.2, r * 0.1); c.stroke();
  return { h, bg: BG, col: MIC_COL, dim: MIC_DIM, W };
}

// ── Microscope: 5. cells on top ──
// Masked inside (no vein or organism shows through); the body is a Life
// group, the insides are drawn from the cell's own stream
function micCell(mc, k, ci) {
  mc.c.own(ci);
  let q = k.s0;
  const Q = () => sr(q++);
  micCellBody(mc, k, ci, Q);
  if (mc.MO.detail === false) return;
  const nu = micNucleus(mc, k, Q);
  if (mc.c.markEye) micEye(mc, k, nu);
  micOrganelles(mc, k, nu, Q);
  micGranules(mc, k, nu, Q);
}
// Cilia (with jitter, or Cilia on), the masking fill, the double membrane
function micCellBody(mc, k, ci, Q) {
  const { c, W, BG, MO, J } = mc, { x, y, r, f, rot } = k, w = k.w;
  const lg = { kind: 'cell', id: ci, x, y, r, rot, f, hs: k.s0, bg: BG, col: MIC_COL, dim: MIC_DIM, cyt: MIC_CYT,
    lwM: W * MIC_MEMBRANE_LW * w, lwI: W * 0.6 * w, lwC: W * 0.5 * w, cilia: null };
  mc.life(lg);
  if (!mc.noCilia && (MO.cilia === 'on' || (MO.cilia !== 'off' && J > 0.35))) lg.cilia = micCilia(mc, k, Q);
  c.globalAlpha = 1;
  c.fillStyle = BG; c.beginPath(); micBlobPath(c, x, y, f, rot); c.fill();
  c.fillStyle = MIC_CYT; c.fill();
  c.strokeStyle = MIC_COL; c.lineWidth = W * MIC_MEMBRANE_LW * w; c.stroke();
  c.strokeStyle = MIC_DIM; c.lineWidth = W * 0.6 * w; c.beginPath(); micBlobPath(c, x, y, a => f(a) * 0.9, rot); c.stroke();
  mc.life(null);
}
// Cilia round the outside; returns { len, bends } for Life
function micCilia(mc, k, Q) {
  const c = mc.c, { x, y, r, f, rot } = k;
  const m = Math.round(40 + r * 0.8), len = r * (0.1 + mc.J * 0.12), cl = { len, bends: [] };
  c.strokeStyle = MIC_DIM; c.lineWidth = mc.W * 0.5 * k.w; c.beginPath();
  for (let i = 0; i < m; i++) {
    const a = i / m * MIC_TAU, rr = f(a), bend = (Q() - 0.5) * 0.5;
    cl.bends.push(bend);
    const px = x + Math.cos(a + rot) * rr, py = y + Math.sin(a + rot) * rr;
    c.moveTo(px, py);
    c.quadraticCurveTo(px + Math.cos(a + rot + bend) * len * 0.6, py + Math.sin(a + rot + bend) * len * 0.6, px + Math.cos(a + rot + bend * 2) * len, py + Math.sin(a + rot + bend * 2) * len);
  }
  c.stroke();
  return cl;
}
// Nucleus with nucleolus, off-centre, and chromatin flecks. Its outline
// comes from mc.R (micBlobFn), as before the split. Returns its geometry.
function micNucleus(mc, k, Q) {
  const { c, W } = mc, { x, y, r } = k;
  const na = Q() * MIC_TAU, nd = r * (0.12 + Q() * 0.18), nr = r * (0.26 + Q() * 0.08);
  const nx = x + Math.cos(na) * nd, ny = y + Math.sin(na) * nd;
  const nf = micBlobFn(mc, nr, 0.05);
  c.strokeStyle = MIC_COL; c.lineWidth = W * MIC_NUC_LW * k.w; c.beginPath(); micBlobPath(c, nx, ny, nf, 0, 40); c.stroke();
  c.strokeStyle = MIC_DIM; c.lineWidth = W * 0.5; c.beginPath(); micBlobPath(c, nx, ny, a => nf(a) * MIC_NUC_RING, 0, 40); c.stroke();
  c.fillStyle = MIC_COL; c.beginPath(); micDot(c, nx + nr * 0.25 * Math.cos(na + 2), ny + nr * 0.25 * Math.sin(na + 2), nr * 0.24); c.fill();
  c.fillStyle = MIC_DIM; c.beginPath();
  const flecks = [];
  for (let i = 0; i < 6; i++) { const a = Q() * MIC_TAU, d = Math.sqrt(Q()) * nr * 0.7; micDot(c, nx + Math.cos(a) * d, ny + Math.sin(a) * d, W * 0.7); flecks.push(Math.cos(a) * d, Math.sin(a) * d); }
  c.fill();
  return { na, nr, nx, ny, nf, flecks };
}

// Blink: the nucleus is an eye. The lid covers inside the outline (the
// outline stays, as the socket); to look at the pointer the inside is
// redrawn (inner ring, flecks) with the nucleolus as a moving pupil
function micEye(mc, k, { na, nr, nx, ny, nf, flecks }) {
  const W = mc.W, lw = W * MIC_NUC_LW * k.w, poly = [], ring = [];
  let R = 0, inner = Infinity;
  for (let i = 0; i < 40; i++) {
    const a = i / 40 * MIC_TAU, rr = Math.max(1, nf(a) - lw * 0.55), ri = nf(a) * MIC_NUC_RING;   // cover: just inside the outline's stroke
    poly.push(Math.cos(a) * rr, Math.sin(a) * rr); R = Math.max(R, rr);
    ring.push(Math.cos(a) * ri, Math.sin(a) * ri); inner = Math.min(inner, ri);
  }
  const me = mc.cells.indexOf(k), cover = micEyeCover(mc, me, nx, ny, R);
  mc.c.markEye({ id: me, x: nx, y: ny, R: R + 1, poly, ring, flecks, fr: W * 0.7, cover,
    hx: nr * 0.25 * Math.cos(na + 2), hy: nr * 0.25 * Math.sin(na + 2),
    pr: nr * 0.24, reach: Math.max(0, inner - nr * 0.24 - W), lw, lw2: W * 0.5, bg: mc.BG, col: MIC_COL, dim: MIC_DIM });
}
// Cells drawn after cell `me` cover parts of it; the eye is drawn on top of
// the finished list every frame, so it must leave those parts out. Returns
// their outlines (membrane included), relative to the eye at (nx, ny).
function micEyeCover(mc, me, nx, ny, R) {
  const cells = mc.cells, cover = [];
  for (let j = me + 1; j < cells.length; j++) {
    const o = cells[j], pad = mc.W * (MIC_MEMBRANE_LW / 2) * o.w + 0.5;   // half the membrane stroke
    if (Math.hypot(o.x - nx, o.y - ny) > o.r * 1.6 + pad + R + 1) continue;
    const q = [];
    for (let i = 0; i < 64; i++) { const a = i / 64 * MIC_TAU, rr = o.f(a) + pad; q.push(o.x - nx + Math.cos(a + o.rot) * rr, o.y - ny + Math.sin(a + o.rot) * rr); }
    cover.push({ cx: o.x - nx, cy: o.y - ny, pts: q });
  }
  return cover;
}

// Organelles away from the nucleus: mitochondria (with cristae) and vacuoles
function micOrganelles(mc, k, nu, Q) {
  const { c, W } = mc, r = k.r;
  const nm = 2 + Math.floor(Q() * 3 + mc.density / 4);
  for (let i = 0; i < nm; i++) {
    const L = r * (0.1 + Q() * 0.05), H = L * 0.45, p = micPlace(k, nu, L, Q);
    if (!p) continue;
    const ra = p.a + Math.PI / 2 + (Q() - 0.5);
    c.strokeStyle = MIC_COL; c.lineWidth = W * 0.7; c.beginPath(); micEllipse(c, p.x, p.y, L, H, ra); c.stroke();
    c.strokeStyle = MIC_DIM; c.lineWidth = W * 0.45; c.beginPath();
    const cs = Math.cos(ra), sn = Math.sin(ra);
    for (let j = 0; j <= 8; j++) { const t = -0.8 + 1.6 * j / 8, wv = (j % 2 ? 1 : -1) * H * 0.6; const px = p.x + cs * t * L - sn * wv, py = p.y + sn * t * L + cs * wv; j ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.stroke();
  }
  const nv = 1 + Math.floor(Q() * 2);
  c.strokeStyle = MIC_DIM; c.lineWidth = W * 0.6;
  for (let i = 0; i < nv; i++) { const rr = r * (0.08 + Q() * 0.07), p = micPlace(k, nu, rr, Q); if (!p) continue; c.beginPath(); micDot(c, p.x, p.y, rr); c.stroke(); }
}
// A spot for an organelle of radius rr in cell k, clear of the nucleus
// (12 tries), or null
function micPlace(k, nu, rr, Q) {
  const { x, y, r } = k;
  for (let t = 0; t < 12; t++) {
    const a = Q() * MIC_TAU, d = r * (0.35 + Q() * 0.42);
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    if (Math.hypot(px - nu.nx, py - nu.ny) > nu.nr + rr + 4) return { x: px, y: py, a };
  }
  return null;
}
function micGranules(mc, k, nu, Q) {
  const c = mc.c, { x, y, r } = k;
  c.fillStyle = MIC_DIM; c.beginPath();
  const ng = Math.round(8 + mc.density * 3);
  for (let i = 0; i < ng; i++) {
    const a = Q() * MIC_TAU, d = Math.sqrt(Q()) * r * 0.82, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    if (Math.hypot(px - nu.nx, py - nu.ny) < nu.nr + 3) continue;
    micDot(c, px, py, mc.W * (0.4 + Q() * 0.5));
  }
  c.fill();
}
