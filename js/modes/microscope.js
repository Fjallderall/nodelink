// ── MICROSCOPE (darkfield) ─────────────────────────────────────────────────
// Nodes are large cells (double membrane, nucleus, organelles; cilia with
// jitter), joined by slime-mould veins along the node order. Around them float
// small organisms: cocci, rod bacteria, diatoms, spirilla, amoebae, specks.
// The organisms are placed without looking at the nodes (in the boundary, or
// a unit disc scaled round the nodes) and the cells push them aside, so a
// drifting node shoves them smoothly instead of making them pop.
// Used by: RENDERERS. Calls c.markEye() per nucleus for Blink (DRAW, Blink lids).
function renderMicroscope(c, nodes, density, sigma, weight, seed) {
  if (!nodes.length) return;
  let s = Math.floor(seed * 1e6) * 37 + 11;
  const R = () => sr(s++);
  const TAU = Math.PI * 2, J = Math.max(0, Math.min(1, sigma / 100));
  const COL = '#bfe9dc', DIM = 'rgba(191, 233, 220, 0.5)', FAINT = 'rgba(191, 233, 220, 0.22)', BG = modeBg('microscope');
  c.lineCap = 'round'; c.lineJoin = 'round';
  const W = weight;
  // Layout (world units unless noted)
  const CELL_R = 52;                 // cell radius at node size 1 (± 15%)
  const ORG_MARGIN = 170;            // organisms spread this far past the farthest node
  const ORGS_IN_BOUNDARY = 9, ORGS_FREE = 12;   // organisms per density step
  const ORG_TRIES = 8;               // placement attempts per organism
  const ORG_GAP = 6;                 // space between organisms
  const CELL_HALO = 1.12, CELL_PAD = 4;         // organisms keep out of r × HALO + PAD
  // Organism mix: [share up to, type, radius = base + size × spread]
  const ORG_TYPES = [[0.24, 'coccus', 4, 4], [0.46, 'rod', 9, 9], [0.6, 'diatomC', 11, 10], [0.72, 'diatomP', 16, 12],
    [0.82, 'spiril', 16, 12], [0.9, 'amoeba', 13, 10], [Infinity, 'speck', 1.5, 2]];
  // Line widths (× Stroke weight × node weight), shared by the drawing and the Blink eyes
  const MEMBRANE_LW = 1.6, NUC_LW = 1.1;
  const NUC_RING = 0.86;             // nucleus inner ring, × its outline
  // Closed wobbly outline: r(θ) = r·(1 + Σ a_k sin(kθ + φ_k))
  const blobFn = (r, amp) => {
    const h = [2, 3, 4, 5, 7].map(k => ({ k, a: amp * (0.2 + R()) / k ** 0.7, p: R() * TAU }));
    const fn = a => r * (1 + h.reduce((t, q) => t + q.a * Math.sin(q.k * a + q.p), 0));
    fn.h = h; fn.r = r;          // Life redraws the outline from these
    return fn;
  };
  const blobPath = (x, y, f, rot = 0, n = 64) => {
    for (let i = 0; i <= n; i++) {
      const a = i / n * TAU, r = f(a);
      const px = x + Math.cos(a + rot) * r, py = y + Math.sin(a + rot) * r;
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.closePath();
  };
  // (as a polygon: the display list and the SVG builder have no ellipse)
  const ellipse = (x, y, rx, ry, rot) => {
    const cs = Math.cos(rot), sn = Math.sin(rot);
    for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry; const px = x + ex * cs - ey * sn, py = y + ex * sn + ey * cs; i ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.closePath();
  };
  const dot = (x, y, r) => { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); };

  // Area: centroid and reach of the nodes, or the boundary
  let cx = 0, cy = 0;
  nodes.forEach(n => { cx += n.x; cy += n.y; }); cx /= nodes.length; cy /= nodes.length;
  let maxR = 60;
  nodes.forEach(n => { maxR = Math.max(maxR, Math.hypot(n.x - cx, n.y - cy)); });
  const reach = maxR + ORG_MARGIN;
  const RG = fillRegion();
  const fill = RG ? RG.scale(reach * 0.8) : 1;
  const MO = S.micro || {};
  const life = c.life ? g => c.life(g) : () => {};   // Life (animation) groups, see Rec.life

  // 1. Cells on the nodes (shape decided now, drawn last)
  const cells = nodes.map(n => {
    const r = CELL_R * (n.size || 1) * (0.85 + R() * 0.3);
    return { x: n.x, y: n.y, r, w: n.w || 1, f: blobFn(r, 0.05 + J * 0.12), rot: R() * TAU, s0: Math.floor(R() * 1e6) };
  });

  // 2. Small organisms, placed in a fixed frame, then pushed out of the cells
  const N = Math.round(density * (RG ? ORGS_IN_BOUNDARY : ORGS_FREE) * fill * (MO.orgs !== undefined ? MO.orgs / 100 : 1));
  const orgs = [];
  for (let t = 0; t < N * ORG_TRIES && orgs.length < N; t++) {
    const u = R(), v = R(), kind = R(), sz = R(), ang = R() * TAU;
    let x, y;
    if (RG) { x = RG.x0 + u * (RG.x1 - RG.x0); y = RG.y0 + v * (RG.y1 - RG.y0); if (!RG.has({ x, y })) continue; }
    else { const a = u * TAU, d = Math.sqrt(v); x = Math.cos(a) * d; y = Math.sin(a) * d; }   // unit disc
    const [, type, rBase, rSpread] = ORG_TYPES.find(o => kind < o[0]);
    const r = rBase + sz * rSpread;
    // Spacing among themselves (in the frame they were placed in)
    const k = RG ? 1 : 1 / reach;
    if (orgs.some(o => Math.hypot(o.u - x, o.v - y) < (o.r + r + ORG_GAP) * k)) continue;
    orgs.push({ u: x, v: y, r, type, ang, s0: Math.floor(R() * 1e6), sz });
  }
  orgs.forEach(o => {
    let x = RG ? o.u : cx + o.u * reach, y = RG ? o.v : cy + o.v * reach;
    // Pushed out of every cell (and its halo) along the line from its centre
    for (const q of cells) {
      const dx = x - q.x, dy = y - q.y, d = Math.hypot(dx, dy) || 1, need = q.r * CELL_HALO + o.r + CELL_PAD;
      if (d < need) { const p = need - d; x += dx / d * p; y += dy / d * p; }
    }
    o.x = x; o.y = y;
    o.out = !!RG && !RG.has(o);                    // pushed out past the boundary: left out
  });

  // 3. Veins (slime mould) between the cells, in node order, plus a chord
  const pairs = [];
  for (let i = 0; i + 1 < cells.length; i++) pairs.push([i, i + 1]);
  if (cells.length > 3 && density >= 5) pairs.push([0, Math.floor(cells.length / 2) + 1 < cells.length ? Math.floor(cells.length / 2) + 1 : cells.length - 1]);
  if (cells.length > 2 && density >= 8) pairs.push([cells.length - 1, 0]);
  const tube = (pts, w0, w1) => {
    // Tapered tube: thick at the ends, thinner in the middle; a soft fill
    // between two outlines
    const L = [], Rr = [];
    pts.forEach((p, i) => {
      const t = i / (pts.length - 1), q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
      let tx = q.x - o.x, ty = q.y - o.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const w = (w0 + (w1 - w0) * t) * (1 - 0.45 * Math.sin(Math.PI * t)) / 2;
      L.push({ x: p.x - ty * w, y: p.y + tx * w }); Rr.push({ x: p.x + ty * w, y: p.y - tx * w });
    });
    c.fillStyle = FAINT; c.globalAlpha = 1;
    c.beginPath(); L.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); for (let i = Rr.length - 1; i >= 0; i--) c.lineTo(Rr[i].x, Rr[i].y); c.closePath(); c.fill();
    c.strokeStyle = COL; c.lineWidth = W * 0.7;
    c.beginPath(); L.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke();
    c.beginPath(); Rr.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke();
  };
  const bez = (A, B, C, D, n) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, m = 1 - t;
      out.push({ x: m * m * m * A.x + 3 * m * m * t * B.x + 3 * m * t * t * C.x + t * t * t * D.x, y: m * m * m * A.y + 3 * m * m * t * B.y + 3 * m * t * t * C.y + t * t * t * D.y });
    }
    return out;
  };
  if (MO.veins !== false) pairs.forEach(([i, j]) => {
    const A = cells[i], B = cells[j], d = Math.hypot(B.x - A.x, B.y - A.y);
    if (d < (A.r + B.r) * 0.9) return;
    const ux = (B.x - A.x) / d, uy = (B.y - A.y) / d, nx = -uy, ny = ux;
    const P0 = { x: A.x + ux * A.r * 0.8, y: A.y + uy * A.r * 0.8 }, P3 = { x: B.x - ux * B.r * 0.8, y: B.y - uy * B.r * 0.8 };
    const b1 = (R() - 0.5) * d * (0.25 + J * 0.5), b2 = (R() - 0.5) * d * (0.25 + J * 0.5);
    const P1 = { x: P0.x + ux * d * 0.3 + nx * b1, y: P0.y + uy * d * 0.3 + ny * b1 };
    const P2 = { x: P3.x - ux * d * 0.3 + nx * b2, y: P3.y - uy * d * 0.3 + ny * b2 };
    const pts = bez(P0, P1, P2, P3, Math.max(12, Math.round(d / 8)));
    const wv = W * 9 * (A.w + B.w) / 2;
    tube(pts, wv, wv * 0.9);
    // Side twigs from the vein, thinning out
    const tw = Math.round(1 + density / 3);
    for (let k = 0; k < tw; k++) {
      const t = 0.2 + R() * 0.6, p = pts[Math.round(t * (pts.length - 1))], side = R() < 0.5 ? -1 : 1;
      const len = 20 + R() * 40, a = Math.atan2(uy, ux) + side * (0.6 + R() * 0.7);
      const E = { x: p.x + Math.cos(a) * len, y: p.y + Math.sin(a) * len };
      const M = { x: (p.x + E.x) / 2 + (R() - 0.5) * len * 0.5, y: (p.y + E.y) / 2 + (R() - 0.5) * len * 0.5 };
      const tp = bez(p, M, M, E, 10);
      tube(tp, wv * 0.45, wv * 0.12);
    }
  });

  // 4. Organisms (each one a Life group: it swims, see lifeMove)
  const drawOrg = o => {
    let q = o.s0;
    const Q = () => sr(q++);
    const { x, y, r, ang } = o;
    c.globalAlpha = 1;
    if (o.type === 'speck') { c.fillStyle = DIM; c.beginPath(); dot(x, y, r * W * 0.6 + 0.4); c.fill(); return; }
    if (o.type === 'coccus') {
      // Single, pair or tetrad
      const n = o.sz < 0.4 ? 1 : o.sz < 0.75 ? 2 : 4, rr = r * (n > 1 ? 0.7 : 1);
      c.strokeStyle = COL; c.lineWidth = W * 0.9; c.beginPath();
      for (let k = 0; k < n; k++) { const a = ang + k / n * TAU; const ox = n > 1 ? Math.cos(a) * rr * 0.95 : 0, oy = n > 1 ? Math.sin(a) * rr * 0.95 : 0; dot(x + ox, y + oy, rr); }
      c.stroke();
      return;
    }
    if (o.type === 'rod') {
      // Bacillus: a capsule, sometimes a short chain; flagellum on some
      const n = Q() < 0.65 ? 1 : 2 + Math.floor(Q() * 2), h = r, w = 3 + o.sz * 2.5;
      const cs = Math.cos(ang), sn = Math.sin(ang);
      c.strokeStyle = COL; c.lineWidth = W * 0.9; c.beginPath();
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
        c.strokeStyle = DIM; c.lineWidth = W * 0.5; c.beginPath();
        const ex = x - cs * h, ey = y - sn * h; c.moveTo(ex, ey);
        for (let k = 1; k <= 12; k++) { const t = k / 12 * h * 1.4, wv = Math.sin(k * 1.3) * 3; c.lineTo(ex - cs * t - sn * wv, ey - sn * t + cs * wv); }
        c.stroke();
      }
      return;
    }
    if (o.type === 'diatomC') {
      // Centric diatom: rim, inner ring, radial striae
      c.strokeStyle = COL; c.lineWidth = W; c.beginPath(); dot(x, y, r); c.stroke();
      c.strokeStyle = DIM; c.lineWidth = W * 0.55; c.beginPath(); dot(x, y, r * 0.78); dot(x, y, r * 0.2);
      const m = Math.round(16 + r);
      for (let k = 0; k < m; k++) { const a = ang + k / m * TAU; c.moveTo(x + Math.cos(a) * r * 0.26, y + Math.sin(a) * r * 0.26); c.lineTo(x + Math.cos(a) * r * 0.74, y + Math.sin(a) * r * 0.74); }
      c.stroke();
      return;
    }
    if (o.type === 'diatomP') {
      // Pennate diatom: a boat shape with a raphe and transverse striae
      const L = r, Wd = r * (0.22 + o.sz * 0.1), cs = Math.cos(ang), sn = Math.sin(ang);
      const P = (t, side) => { const w = Wd * Math.sqrt(Math.max(0, 1 - t * t)); return { x: x + cs * t * L - sn * w * side, y: y + sn * t * L + cs * w * side }; };
      c.strokeStyle = COL; c.lineWidth = W; c.beginPath();
      for (let k = 0; k <= 24; k++) { const p = P(-1 + 2 * k / 24, 1); k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }
      for (let k = 24; k >= 0; k--) { const p = P(-1 + 2 * k / 24, -1); c.lineTo(p.x, p.y); }
      c.closePath(); c.stroke();
      c.strokeStyle = DIM; c.lineWidth = W * 0.5; c.beginPath();
      c.moveTo(x - cs * L * 0.85, y - sn * L * 0.85); c.lineTo(x + cs * L * 0.85, y + sn * L * 0.85);
      const m = Math.round(L / 3);
      for (let k = 1; k < m; k++) { const t = -1 + 2 * k / m; if (Math.abs(t) < 0.12) continue; const a = P(t, 0.8), b = P(t, -0.8); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }
      c.stroke();
      return;
    }
    if (o.type === 'spiril') {
      const L = r, cs = Math.cos(ang), sn = Math.sin(ang), turns = 2 + Math.floor(o.sz * 3), A = 3 + o.sz * 2;
      c.strokeStyle = COL; c.lineWidth = W * 1.1; c.beginPath();
      for (let k = 0; k <= 40; k++) { const t = -1 + 2 * k / 40, w = Math.sin((t + 1) * Math.PI * turns) * A; const px = x + cs * t * L - sn * w, py = y + sn * t * L + cs * w; k ? c.lineTo(px, py) : c.moveTo(px, py); }
      c.stroke();
      return;
    }
    // Amoeba: lobed body, nucleus, a few food vacuoles
    const h = [2, 3, 5].map(k => ({ k, a: (0.12 + Q() * 0.2), p: Q() * TAU }));
    const f = a => r * (1 + h.reduce((t, e) => t + e.a * Math.sin(e.k * a + e.p), 0));
    c.fillStyle = BG; c.beginPath(); blobPath(x, y, f, ang, 40); c.fill();
    c.strokeStyle = COL; c.lineWidth = W * 0.9; c.stroke();
    c.strokeStyle = DIM; c.lineWidth = W * 0.6; c.beginPath(); dot(x + r * 0.15, y - r * 0.1, r * 0.22); dot(x - r * 0.3, y + r * 0.2, r * 0.1); c.stroke();
    return { h, bg: BG, col: COL, dim: DIM, W };   // Life redraws the amoeba with its lobes flowing
  };
  orgs.forEach(o => {
    if (o.out) return;
    const g = { kind: o.type, x: o.x, y: o.y, r: o.r, ang: o.ang, hs: o.s0 };
    life(g);
    const am = drawOrg(o);
    if (am) g.amoeba = am;
    life(null);
  });

  // 5. Cells on top: masked inside (no vein or organism shows through)
  cells.forEach((k, ci) => {
    c.own(ci);
    let q = k.s0;
    const Q = () => sr(q++);
    const { x, y, r, f, rot } = k, w = k.w;
    const lg = { kind: 'cell', id: ci, x, y, r, rot, f, hs: k.s0, bg: BG, col: COL, dim: DIM, cyt: 'rgba(191, 233, 220, 0.06)',
      lwM: W * MEMBRANE_LW * w, lwI: W * 0.6 * w, lwC: W * 0.5 * w, cilia: null };
    life(lg);
    // Cilia round the outside (with jitter)
    if (MO.cilia === 'on' || (MO.cilia !== 'off' && J > 0.35)) {
      const m = Math.round(40 + r * 0.8), len = r * (0.1 + J * 0.12);
      lg.cilia = { len, bends: [] };
      c.strokeStyle = DIM; c.lineWidth = W * 0.5 * w; c.beginPath();
      for (let i = 0; i < m; i++) {
        const a = i / m * TAU, rr = f(a), bend = (Q() - 0.5) * 0.5;
        lg.cilia.bends.push(bend);
        const px = x + Math.cos(a + rot) * rr, py = y + Math.sin(a + rot) * rr;
        c.moveTo(px, py);
        c.quadraticCurveTo(px + Math.cos(a + rot + bend) * len * 0.6, py + Math.sin(a + rot + bend) * len * 0.6, px + Math.cos(a + rot + bend * 2) * len, py + Math.sin(a + rot + bend * 2) * len);
      }
      c.stroke();
    }
    c.globalAlpha = 1;
    c.fillStyle = BG; c.beginPath(); blobPath(x, y, f, rot); c.fill();
    // Membrane (double), soft cytoplasm tone
    c.fillStyle = 'rgba(191, 233, 220, 0.06)'; c.fill();
    c.strokeStyle = COL; c.lineWidth = W * MEMBRANE_LW * w; c.stroke();
    c.strokeStyle = DIM; c.lineWidth = W * 0.6 * w; c.beginPath(); blobPath(x, y, a => f(a) * 0.9, rot); c.stroke();
    life(null);
    if (MO.detail === false) return;
    // Nucleus with nucleolus, off-centre
    const na = Q() * TAU, nd = r * (0.12 + Q() * 0.18), nr = r * (0.26 + Q() * 0.08);
    const nx = x + Math.cos(na) * nd, ny = y + Math.sin(na) * nd;
    const nf = blobFn(nr, 0.05);
    c.strokeStyle = COL; c.lineWidth = W * NUC_LW * w; c.beginPath(); blobPath(nx, ny, nf, 0, 40); c.stroke();
    c.strokeStyle = DIM; c.lineWidth = W * 0.5; c.beginPath(); blobPath(nx, ny, a => nf(a) * NUC_RING, 0, 40); c.stroke();
    c.fillStyle = COL; c.beginPath(); dot(nx + nr * 0.25 * Math.cos(na + 2), ny + nr * 0.25 * Math.sin(na + 2), nr * 0.24); c.fill();
    // Chromatin flecks
    c.fillStyle = DIM; c.beginPath();
    const flecks = [];
    for (let i = 0; i < 6; i++) { const a = Q() * TAU, d = Math.sqrt(Q()) * nr * 0.7; dot(nx + Math.cos(a) * d, ny + Math.sin(a) * d, W * 0.7); flecks.push(Math.cos(a) * d, Math.sin(a) * d); }
    c.fill();
    // Blink: the nucleus is an eye. The lid covers inside the outline (the
    // outline stays, as the socket); to look at the pointer the inside is
    // redrawn (inner ring, flecks) with the nucleolus as a moving pupil
    if (c.markEye) {
      const lw = W * NUC_LW * w, poly = [], ring = [];
      let R = 0, inner = Infinity;
      for (let i = 0; i < 40; i++) {
        const a = i / 40 * TAU, rr = Math.max(1, nf(a) - lw * 0.55), ri = nf(a) * NUC_RING;   // cover: just inside the outline's stroke
        poly.push(Math.cos(a) * rr, Math.sin(a) * rr); R = Math.max(R, rr);
        ring.push(Math.cos(a) * ri, Math.sin(a) * ri); inner = Math.min(inner, ri);
      }
      // Cells drawn after this one cover parts of it; the eye is drawn on top
      // of the finished list every frame, so it must leave those parts out.
      // `cover`: their outlines (membrane included), relative to the eye.
      const me = cells.indexOf(k), cover = [];
      for (let j = me + 1; j < cells.length; j++) {
        const o = cells[j], pad = W * (MEMBRANE_LW / 2) * o.w + 0.5;   // half the membrane stroke
        if (Math.hypot(o.x - nx, o.y - ny) > o.r * 1.6 + pad + R + 1) continue;
        const q = [];
        for (let i = 0; i < 64; i++) { const a = i / 64 * TAU, rr = o.f(a) + pad; q.push(o.x - nx + Math.cos(a + o.rot) * rr, o.y - ny + Math.sin(a + o.rot) * rr); }
        cover.push({ cx: o.x - nx, cy: o.y - ny, pts: q });
      }
      c.markEye({ id: me, x: nx, y: ny, R: R + 1, poly, ring, flecks, fr: W * 0.7, cover,
        hx: nr * 0.25 * Math.cos(na + 2), hy: nr * 0.25 * Math.sin(na + 2),
        pr: nr * 0.24, reach: Math.max(0, inner - nr * 0.24 - W), lw, lw2: W * 0.5, bg: BG, col: COL, dim: DIM });
    }
    // Organelles away from the nucleus: mitochondria (with cristae) and vacuoles
    const place = (rr) => {
      for (let t = 0; t < 12; t++) {
        const a = Q() * TAU, d = r * (0.35 + Q() * 0.42);
        const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
        if (Math.hypot(px - nx, py - ny) > nr + rr + 4) return { x: px, y: py, a };
      }
      return null;
    };
    const nm = 2 + Math.floor(Q() * 3 + density / 4);
    for (let i = 0; i < nm; i++) {
      const L = r * (0.1 + Q() * 0.05), H = L * 0.45, p = place(L);
      if (!p) continue;
      const ra = p.a + Math.PI / 2 + (Q() - 0.5);
      c.strokeStyle = COL; c.lineWidth = W * 0.7; c.beginPath(); ellipse(p.x, p.y, L, H, ra); c.stroke();
      c.strokeStyle = DIM; c.lineWidth = W * 0.45; c.beginPath();
      const cs = Math.cos(ra), sn = Math.sin(ra);
      for (let k = 0; k <= 8; k++) { const t = -0.8 + 1.6 * k / 8, wv = (k % 2 ? 1 : -1) * H * 0.6; const px = p.x + cs * t * L - sn * wv, py = p.y + sn * t * L + cs * wv; k ? c.lineTo(px, py) : c.moveTo(px, py); }
      c.stroke();
    }
    const nv = 1 + Math.floor(Q() * 2);
    c.strokeStyle = DIM; c.lineWidth = W * 0.6;
    for (let i = 0; i < nv; i++) { const rr = r * (0.08 + Q() * 0.07), p = place(rr); if (!p) continue; c.beginPath(); dot(p.x, p.y, rr); c.stroke(); }
    // Granules
    c.fillStyle = DIM; c.beginPath();
    const ng = Math.round(8 + density * 3);
    for (let i = 0; i < ng; i++) {
      const a = Q() * TAU, d = Math.sqrt(Q()) * r * 0.82, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (Math.hypot(px - nx, py - ny) < nr + 3) continue;
      dot(px, py, W * (0.4 + Q() * 0.5));
    }
    c.fill();
  });
  c.own(-1);                                       // (also after a cell that returned early)
  c.globalAlpha = 1;
}
