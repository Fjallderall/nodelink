// ── CATHEDRAL GLASS (coloured glass) ───────────────────────────────────────
// Coloured glass pieces in dark lead. Three styles: Mosaic (the leaded
// layout with coloured cells and a jewel on every node), Tiffany (curved
// pieces, stems with split leaves between the nodes, a flower on every node)
// and Rose windows (a round traced window on every node, in a mosaic).
// Every piece is filled, shaded and leaded in turn (painter's order), so a
// piece laid on top hides the lead under it. Lead is near-black: in stencils
// and cut files it becomes gaps, so the glass pieces cut out one by one.
// Shading and the lead's shine are hsla(), which stencils drop.
// Used by: RENDERERS. Shares voronoiCells, polyCentroid with STAINED GLASS.
const GLASS_STYLES = ['mosaic', 'tiffany', 'rose'];
const GLASS_SETS = {
  jewel: { glass: ['#b0182f', '#1f4fb0', '#1d8a55', '#e0a21c', '#6a2f9a', '#d45a1a'], bg: ['#1f4fb0', '#2a63c4', '#1a3f94', '#3a75cf'],
    leaf: ['#2f9a4f', '#1d7a45', '#5fae3a'], petal: ['#b0182f', '#d83a5a', '#6a2f9a', '#e0a21c'], heart: '#f2c230' },
  pastel: { glass: ['#f2a7bd', '#a7c7f2', '#b5e3c0', '#f7dc9a', '#cdb5ee', '#f5c0a0'], bg: ['#cfe3f5', '#bcd6f0', '#dcebf7', '#c7dcef'],
    leaf: ['#9fd3a8', '#86c294', '#b9e0a5'], petal: ['#f2a7bd', '#e88fae', '#cdb5ee', '#f7dc9a'], heart: '#f7e08a' },
  amber: { glass: ['#c9761a', '#e3a531', '#a8431c', '#f0c75a', '#8a2a18', '#d98b2b'], bg: ['#e3a531', '#d4902a', '#eab84a', '#c98222'],
    leaf: ['#7a8a2a', '#5f7a26', '#9aa83a'], petal: ['#a8431c', '#8a2a18', '#d4602a', '#f0c75a'], heart: '#ffe08a' },
  sea: { glass: ['#1a6f8a', '#2aa39a', '#1d4f7a', '#5fc4c0', '#3a8acf', '#7fd0a8'], bg: ['#1d4f7a', '#1a6f8a', '#246a96', '#1a5a84'],
    leaf: ['#2aa36a', '#1f8a5a', '#5fc48a'], petal: ['#5fc4c0', '#e6f2f0', '#3a8acf', '#9fdce0'], heart: '#f0e6b0' },
  clear: { glass: ['#d8d4c6', '#c4c9c2', '#e4dfcf', '#b9bdb3', '#cfc7b0'], bg: ['#d8d4c6', '#c4c9c2', '#e4dfcf', '#cdd0c6'],
    leaf: ['#a9b89a', '#98a88c', '#b8c4a4'], petal: ['#e8e2d0', '#d8cfb8', '#f0ead8'], heart: '#e6c46a' }
};
const GLASS_REF_R = 290;                            // window radius the piece count is set for (with a boundary)
const GLASS_LEAD = '#16130f';                       // darker than the stencil cut-off: lead = gap
const GLASS_BN = 72;                                // corners of the round window (no boundary)
const GLASS_LEAF_GAP = 44;                          // Tiffany: leaf spacing along a stem
function sanGlass(v) {
  v = v || {};
  return { style: GLASS_STYLES.includes(v.style) ? v.style : 'mosaic',
    set: GLASS_SETS[v.set] ? v.set : 'jewel', light: v.light !== false };
}

// renderGlass: the window is built in stages on one shared object gl
// (glassSetup), then drawn piece by piece. The stages run in the same order
// as before the split and draw from gl.R / gl.RC / gl.RM in turn, so a seed
// gives the same window. Tiffany stems keep their own streams.
function renderGlass(c, nodes, density, sigma, weight, seed) {
  if (!nodes.length) return;
  const gl = glassSetup(c, nodes, density, sigma, weight, seed);
  const { rnd, spacing } = glassSample(gl);
  glassTint(gl, rnd, spacing);
  const { sites, cells, nodeCols } = glassCells(gl, rnd, spacing);
  gl.phx = gl.R() * Math.PI * 2; gl.phy = gl.R() * Math.PI * 2;   // Tiffany's lead field (drawn for every style)
  // Mosaic: cells near the nodes hold the rosettes (drawn first, nodes last)
  cells.forEach((poly, i) => {
    if (!poly || poly.length < 3) return;
    glassPiece(gl, gl.style === 'tiffany' ? glassCurvy(gl, poly) : poly, sites[i].col);
  });
  if (gl.style === 'mosaic') glassJewels(gl, nodeCols);
  if (gl.style === 'tiffany') {
    glassStems(gl).forEach((s, si) => glassStem(gl, s, si));
    nodes.forEach((n, i) => glassFlower(gl, n, i));
  }
  if (gl.style === 'rose') nodes.forEach((n, i) => glassRose(gl, n, i));
  // The window's own came (a boundary draws its border instead)
  if (!gl.RG) { c.strokeStyle = GLASS_LEAD; c.globalAlpha = 1; c.lineWidth = gl.LW * 2.2; c.beginPath(); if (c.markLead) c.markLead({ pts: gl.bound, lw: gl.LW * 2.2, lead: GLASS_LEAD }); glassPath(c, gl.bound); c.stroke(); }
  c.globalAlpha = 1;
}

// Settings, random streams, the window's centre, size and outline
function glassSetup(c, nodes, density, sigma, weight, seed) {
  const base = Math.floor(seed * 1e6);
  // Streams far apart (layout sampling alone can take ~80k draws), so they never overlap
  const stream = tag => { let q = base * 53 + tag * 104729 + 29; return () => sr(q++); };
  const TAU = Math.PI * 2, G = sanGlass(S.glass), style = G.style;
  const gl = { c, nodes, density, weight, stream, G, style, P: GLASS_SETS[G.set],
    R: stream(0), RC: stream(1), RM: stream(2),       // layout, colours, motifs; Tiffany stems: stream(10 + 2 × stem) and the next
    J: Math.max(0, Math.min(1, sigma / 100)),
    LW: weight * 4,                                   // ~0.6 mm at 10 cm: wider than the cut's minimum gap
    RG: fillRegion(), bndEdges: null };
  let cx = 0, cy = 0;
  nodes.forEach(n => { cx += n.x; cy += n.y; });
  cx /= nodes.length; cy /= nodes.length;
  let maxR = 0;
  nodes.forEach(n => { const d = Math.hypot(n.x - cx, n.y - cy); if (isFinite(d) && d > maxR) maxR = d; });
  let reachMax = 0;
  nodes.forEach(n => { reachMax = Math.max(reachMax, style === 'rose' ? glassRoseR(gl, n) : glassFlowR(gl, n)); });
  const mapR0 = Math.min(4000, Math.max(maxR * 1.45, 180));
  const mapR = style === 'mosaic' ? mapR0 : Math.min(4000, Math.max(mapR0, maxR + reachMax * 1.3));
  let bound = [];
  for (let i = 0; i < GLASS_BN; i++) {
    const a = (i / GLASS_BN) * TAU;
    bound.push({ x: cx + Math.cos(a) * mapR, y: cy + Math.sin(a) * mapR });
  }
  if (gl.RG) bound = gl.RG.pts;
  Object.assign(gl, { cx, cy, mapR, bound });
  gl.inArea = q => gl.RG ? gl.RG.has(q) : Math.hypot(q.x - cx, q.y - cy) <= mapR;
  return gl;
}
const glassSz = n => n.size || 1;
const glassRoseR = (gl, n) => (55 + gl.density * 5) * glassSz(n);
const glassFlowR = (gl, n) => (40 + gl.density * 4) * glassSz(n);
const glassPick = (arr, r) => arr[Math.min(arr.length - 1, Math.floor(r() * arr.length))];

// Colour helper: a small seeded lightness shift per piece, so no two
// pieces of the same glass are quite alike
function glassVary(gl, h, amt = 0.09, r = gl.RC) {
  const q = parseColor(h) || { r: 128, g: 128, b: 128 }, f = Math.round((r() - 0.5) * 8) / 4 * amt;   // 9 steps: keeps colour caches small
  const t = f > 0 ? 255 : 0, k = Math.abs(f);
  return `rgb(${Math.round(q.r + (t - q.r) * k)},${Math.round(q.g + (t - q.g) * k)},${Math.round(q.b + (t - q.b) * k)})`;
}
// Pieces
function glassPath(c, pts) {
  c.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
  c.closePath();
}
function glassShrink(pts, k) { const g = polyCentroid(pts); return pts.map(p => ({ x: g.x + (p.x - g.x) * k, y: g.y + (p.y - g.y) * k })); }
function glassPiece(gl, pts, col, lw = gl.LW) {
  if (!pts || pts.length < 3) return;
  const c = gl.c, G = gl.G;
  c.globalAlpha = 1;
  c.fillStyle = col;
  c.beginPath(); if (c.markPane) c.markPane({ pts, col, lw, lead: GLASS_LEAD, light: G.light }); glassPath(c, pts); c.fill();
  if (G.light) {
    // Light through the glass: brighter towards the middle of the piece
    c.fillStyle = 'hsla(48, 70%, 94%, 0.07)';
    c.beginPath(); glassPath(c, glassShrink(pts, 0.72)); c.fill();
    c.fillStyle = 'hsla(48, 70%, 95%, 0.07)';
    c.beginPath(); glassPath(c, glassShrink(pts, 0.48)); c.fill();
    c.fillStyle = 'hsla(48, 70%, 97%, 0.07)';
    c.beginPath(); glassPath(c, glassShrink(pts, 0.24)); c.fill();
  }
  c.strokeStyle = GLASS_LEAD; c.lineWidth = lw;
  c.beginPath(); glassPath(c, pts); c.stroke();
  if (G.light && lw > 1.2) {
    c.strokeStyle = 'hsla(40, 15%, 70%, 0.22)'; c.lineWidth = Math.max(0.4, lw * 0.22);
    c.stroke();
  }
}
// Shapes (polygons; circles as 28-gons)
function glassCircle(x, y, r, m = 28, rot = 0) {
  return Array.from({ length: m }, (_, i) => {
    const a = rot + (i / m) * Math.PI * 2; return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
  });
}
// Lobed roundel (trefoil, quatrefoil …): lobes bulge, cusps point in
function glassFoil(x, y, r, lobes, rot = 0) {
  return Array.from({ length: lobes * 12 }, (_, i) => {
    const a = rot + (i / (lobes * 12)) * Math.PI * 2;
    const rr = r * (0.62 + 0.38 * Math.abs(Math.cos(lobes * (a - rot) / 2)));
    return { x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr };
  });
}
// Pointed petal / leaf (vesica) from p along angle a, length L, half width W
function glassVesica(x, y, a, L, W, m = 10) {
  const ca = Math.cos(a), sa = Math.sin(a), out = [];
  for (let i = 0; i <= m; i++) { const t = i / m, w = W * Math.pow(Math.sin(Math.PI * t), 0.85); out.push({ x: x + ca * L * t - sa * w, y: y + sa * L * t + ca * w }); }
  for (let i = m - 1; i > 0; i--) { const t = i / m, w = W * Math.pow(Math.sin(Math.PI * t), 0.85); out.push({ x: x + ca * L * t + sa * w, y: y + sa * L * t - ca * w }); }
  return out;
}
// Annulus sector r0..r1, a0..a1
function glassSector(x, y, r0, r1, a0, a1) {
  const m = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.12)), out = [];
  for (let i = 0; i <= m; i++) { const a = a0 + (a1 - a0) * i / m; out.push({ x: x + Math.cos(a) * r1, y: y + Math.sin(a) * r1 }); }
  if (r0 <= 0.5) out.push({ x, y });
  else for (let i = m; i >= 0; i--) { const a = a0 + (a1 - a0) * i / m; out.push({ x: x + Math.cos(a) * r0, y: y + Math.sin(a) * r0 }); }
  return out;
}

// ── Background: Voronoi glass over the whole window ──
// Random sites are sampled, spaced and coloured apart from the nodes, in
// units that scale with the window, so moving a node (Drift) only changes
// the cells near it: the rest keep their place and colour.
function glassSample(gl) {
  const { style, RG, R, mapR, cx, cy, density } = gl, TAU = Math.PI * 2;
  const per = style === 'tiffany' ? 7 : style === 'rose' ? 10 : 14;
  const area = RG ? RG.area : Math.PI * mapR * mapR;
  // Without a boundary the count is fixed per style (not tied to how far the
  // window grew round the motifs), so the whole layout scales with the window
  const roomy = style === 'rose' ? 1.6 : style === 'tiffany' ? 1.3 : 1;
  const want = density * per * (RG ? Math.min(6, Math.max(0.5, area / (Math.PI * GLASS_REF_R ** 2))) : roomy);
  const target = Math.min(900, Math.round(want));
  const spacing = 0.44 * Math.sqrt(area / want);          // closest two random sites may be
  const rnd = [];
  const BK = new Map(), bkey = (i, j) => i * 100003 + j;
  const near = p => {
    const i0 = Math.floor(p.x / spacing), j0 = Math.floor(p.y / spacing);
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) {
      const b = BK.get(bkey(i, j));
      if (b) for (const q of b) if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 < spacing * spacing) return true;
    }
    return false;
  };
  for (let tries = 0; rnd.length < target && tries < target * 30; tries++) {
    const a = R() * TAU, d = Math.sqrt(R()) * mapR * 0.97;
    const q = RG ? regionSample(RG, R) : { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
    if (near(q)) continue;
    rnd.push(q);
    const k = bkey(Math.floor(q.x / spacing), Math.floor(q.y / spacing));
    (BK.get(k) || BK.set(k, []).get(k)).push(q);
  }
  return { rnd, spacing };
}
// Colours of the random sites, on their sampled places (before relaxing),
// one colour-stream draw pair per site: no two close sites share a glass
// (mosaic, rose); Tiffany drifts slowly between neighbouring tones (sky-like)
function glassTint(gl, rnd, spacing) {
  const { style, RG, RC, P } = gl, TAU = Math.PI * 2;
  const ph1 = RC() * TAU, ph2 = RC() * TAU;
  // The window's own frame (the boundary's when set), so the tones stay put while nodes drift
  const wx = RG ? (RG.x0 + RG.x1) / 2 : gl.cx, wy = RG ? (RG.y0 + RG.y1) / 2 : gl.cy, wr = RG ? RG.w / 2 : gl.mapR;
  const list = style === 'mosaic' ? P.glass : P.bg, md = spacing * 2.2;
  const BK = new Map(), bkey = (i, j) => i * 100003 + j;
  rnd.forEach(p => {
    const r1 = RC();
    if (style === 'tiffany') {
      const f = 0.5 + 0.5 * Math.sin((p.x - wx) / wr * 2.1 + ph1) * Math.cos((p.y - wy) / wr * 1.7 + ph2);
      p.base = list[Math.min(list.length - 1, Math.floor((f * 0.8 + r1 * 0.35) * list.length))];
    } else {
      const used = new Set(), i0 = Math.floor(p.x / md), j0 = Math.floor(p.y / md);
      for (let a = i0 - 1; a <= i0 + 1; a++) for (let b = j0 - 1; b <= j0 + 1; b++) {
        const arr = BK.get(bkey(a, b));
        if (arr) arr.forEach(q => { if (Math.hypot(q.x - p.x, q.y - p.y) < md) used.add(q.base); });
      }
      const free = list.filter(h => !used.has(h));
      p.base = glassPick(free.length ? free : list, () => r1);
      const k = bkey(Math.floor(p.x / md), Math.floor(p.y / md));
      (BK.get(k) || BK.set(k, []).get(k)).push(p);
    }
    p.col = glassVary(gl, p.base, style === 'tiffany' ? 0.12 : 0.08);
  });
}
// The Voronoi cells. Mosaic: each node is a rosette, a heart cell ringed by
// petal cells in two glasses; random sites that crowd a rosette are left out.
// Free sites are relaxed towards their cell's centre.
function glassCells(gl, rnd, spacing) {
  const { style, nodes, P, RC, R, density, bound } = gl, TAU = Math.PI * 2;
  const sites = [], nodeCols = [];
  if (style === 'mosaic') {
    nodes.forEach(n => {
      const cols = [glassPick(P.glass, RC), glassPick(P.glass, RC)];
      nodeCols.push(cols);
      sites.push({ x: n.x, y: n.y, fixed: true, col: P.heart });
      const m = 5 + Math.floor(R() * 4), rr = (30 + density * 2) * glassSz(n), rot = R() * TAU;
      for (let k = 0; k < m; k++) {
        const a = rot + (k / m) * TAU;
        sites.push({ x: n.x + Math.cos(a) * rr, y: n.y + Math.sin(a) * rr, fixed: true, col: cols[k % 2] });
      }
    });
  }
  const rosettes = sites.slice();
  rnd.forEach(p => {
    if (rosettes.some(f => (f.x - p.x) ** 2 + (f.y - p.y) ** 2 < spacing * spacing)) return;
    sites.push({ x: p.x, y: p.y, fixed: false, col: p.col });
  });
  let cells = voronoiCells(sites, bound);
  const iters = style === 'mosaic' ? Math.round((1 - gl.J) * 3) : 2;
  for (let it = 0; it < iters; it++) {
    sites.forEach((p, i) => {
      if (p.fixed || !cells[i] || cells[i].length < 3) return;
      const g = polyCentroid(cells[i]); p.x = g.x; p.y = g.y;
    });
    cells = voronoiCells(sites, bound);
  }
  return { sites, cells, nodeCols };
}

// Tiffany: curved lead. Each edge bends along a smooth field evaluated at
// the edge's own points, projected on its normal, so the two cells either
// side bend a shared edge in exactly the same way
function glassField(gl, x, y) {
  const fa = 1 / 70, fb = 1 / 90, phx = gl.phx, phy = gl.phy;
  return { x: Math.sin(x * fa + phx) + Math.sin(y * fb * 1.3 + phy + x * fa * 0.4),
    y: Math.cos(y * fa + phy) + Math.cos(x * fb * 1.2 + phx - y * fb * 0.5) };
}
// Edge p–q lies on the window's outline (kept straight)
function glassOnBound(gl, p, q) {
  if (!gl.RG) {
    const r1 = Math.hypot(p.x - gl.cx, p.y - gl.cy), r2 = Math.hypot(q.x - gl.cx, q.y - gl.cy), lim = gl.mapR * Math.cos(Math.PI / GLASS_BN) - 0.5;
    return r1 >= lim && r2 >= lim;
  }
  const bound = gl.bound;
  if (!gl.bndEdges) gl.bndEdges = bound.map((a, i) => [a, bound[(i + 1) % bound.length]]);
  const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  return gl.bndEdges.some(([a, b]) => {
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((m.x - a.x) * dx + (m.y - a.y) * dy) / L2));
    return Math.hypot(a.x + dx * t - m.x, a.y + dy * t - m.y) < 0.5;
  });
}
function glassCurvy(gl, poly) {
  const out = [], amp = 0.08 + gl.J * 0.14;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    out.push(p);
    const dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy);
    if (L < 6 || glassOnBound(gl, p, q)) continue;
    const nx = -dy / L, ny = dx / L, m = Math.min(10, Math.ceil(L / 8));
    for (let k = 1; k < m; k++) {
      const t = k / m, x = p.x + dx * t, y = p.y + dy * t, f = glassField(gl, x, y);
      const o = (f.x * nx + f.y * ny) * 0.5 * Math.sin(Math.PI * t) * L * amp;
      out.push({ x: x + nx * o, y: y + ny * o });
    }
  }
  return out;
}

// ── Motifs ──
// Mosaic: a cabochon jewel on every node, with a ring of small beads
function glassJewels(gl, nodeCols) {
  const { c, nodes, density, RM, P, LW, G } = gl, TAU = Math.PI * 2;
  nodes.forEach((n, i) => {
    c.own(i);
    const r = (11 + density * 0.8) * glassSz(n);
    const beads = 6 + Math.floor(RM() * 3) * 2;
    glassPiece(gl, glassCircle(n.x, n.y, r * 1.55), glassVary(gl, nodeCols[i][1], 0.05));
    for (let k = 0; k < beads; k++) {
      const a = (k / beads) * TAU;
      glassPiece(gl, glassCircle(n.x + Math.cos(a) * r * 1.55, n.y + Math.sin(a) * r * 1.55, r * 0.3, 14), P.heart, LW * 0.8);
    }
    glassPiece(gl, glassCircle(n.x, n.y, r), glassVary(gl, nodeCols[i][0], 0.05));
    if (G.light) {
      c.fillStyle = 'hsla(50, 80%, 97%, 0.35)';
      c.beginPath(); glassPath(c, glassCircle(n.x - r * 0.35, n.y - r * 0.35, r * 0.22, 12)); c.fill();
    }
    c.own(-1);
  });
}

// Tiffany stems: a spanning tree between the nodes (nearest first, Prim),
// then shoots off every node, curving outwards, ending in a bud
function glassStems(gl) {
  const { nodes, RM, J, weight, density, cx, cy } = gl, sz = glassSz;
  const inT = [0], links = [];
  while (inT.length < nodes.length) {
    let best = null;
    inT.forEach(a => nodes.forEach((nb, b) => {
      if (inT.includes(b)) return;
      const d = Math.hypot(nodes[a].x - nb.x, nodes[a].y - nb.y);
      if (!best || d < best.d) best = { a, b, d };
    }));
    inT.push(best.b); links.push([best.a, best.b]);
  }
  const stems = [];
  links.forEach(([a, b]) => {
    const A = nodes[a], B = nodes[b], dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
    const bend = (RM() - 0.5) * (0.3 + J * 0.6) * L;
    const nx = -dy / L, ny = dx / L;
    const c1 = { x: A.x + dx * 0.3 + nx * bend, y: A.y + dy * 0.3 + ny * bend };
    const c2 = { x: A.x + dx * 0.7 - nx * bend * 0.6, y: A.y + dy * 0.7 - ny * bend * 0.6 };
    stems.push({ A, B, c1, c2, w: (6 + weight * 2.4) * (sz(A) + sz(B)) / 2, tip: false });
  });
  nodes.forEach(n => {
    const k = 1 + Math.floor(density / 4);
    for (let s = 0; s < k; s++) {
      const a0 = Math.atan2(n.y - cy, n.x - cx) + (RM() - 0.5) * 2.6 + (s - (k - 1) / 2) * 1.1;
      let L = (90 + RM() * 80) * sz(n);
      const curl = (RM() - 0.5) * 1.6;
      let E;
      for (let tries = 0; tries < 4; tries++) {
        E = { x: n.x + Math.cos(a0 + curl) * L, y: n.y + Math.sin(a0 + curl) * L };
        if (gl.inArea(E)) break;
        L *= 0.7;
      }
      if (!gl.inArea(E)) continue;
      stems.push({ A: n, B: E, c1: { x: n.x + Math.cos(a0) * L * 0.45, y: n.y + Math.sin(a0) * L * 0.45 },
        c2: { x: n.x + Math.cos(a0 + curl * 0.7) * L * 0.8, y: n.y + Math.sin(a0 + curl * 0.7) * L * 0.8 }, w: (4.5 + weight * 1.8) * sz(n), tip: true });
    }
  });
  return stems;
}
// One Tiffany stem. Each stem draws from its own stream, so a stem that
// changes (Drift) leaves the other stems and the flowers as they were
function glassStem(gl, s, si) {
  const { P, LW, nodes } = gl;
  const RS = gl.stream(10 + 2 * si), RSeg = gl.stream(11 + 2 * si);   // leaves and bud; stem segment shades
  const bez = t => {
    const u = 1 - t;
    return { x: u * u * u * s.A.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t * t * t * s.B.x,
      y: u * u * u * s.A.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t * t * t * s.B.y };
  };
  const N = 40, pts = [], at = [0];
  for (let i = 0; i <= N; i++) pts.push(bez(i / N));
  for (let i = 1; i <= N; i++) at.push(at[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const len = at[N];
  const tang = i => { const p = pts[Math.max(0, i - 1)], q = pts[Math.min(N, i + 1)]; return Math.atan2(q.y - p.y, q.x - p.x); };
  const half = i => s.w / 2 * (s.tip ? 1 - 0.55 * i / N : 1);
  // Stem in segments of glass ~55 units long
  const segs = Math.max(1, Math.round(len / 55));
  for (let g = 0; g < segs; g++) {
    const i0 = Math.round(g * N / segs), i1 = Math.round((g + 1) * N / segs), L = [], Rt = [];
    for (let i = i0; i <= i1; i++) {
      const a = tang(i), h = half(i);
      L.push({ x: pts[i].x - Math.sin(a) * h, y: pts[i].y + Math.cos(a) * h });
      Rt.push({ x: pts[i].x + Math.sin(a) * h, y: pts[i].y - Math.cos(a) * h });
    }
    glassPiece(gl, L.concat(Rt.reverse()), glassVary(gl, P.leaf[1], 0.1, RSeg), LW * 0.9);
  }
  // Leaves every GLASS_LEAF_GAP along the stem, alternating sides, kept clear
  // of the node flowers; split along the midrib into a light and a dark half.
  // Every leaf draws the same numbers whether or not it is drawn.
  for (let k = 1, i = 0; k * GLASS_LEAF_GAP < len - GLASS_LEAF_GAP / 2; k++) {
    const skip = RS() < 0.25, r1 = RS(), r2 = RS(), r3 = RS(), r4 = RS();
    while (i < N && at[i] < k * GLASS_LEAF_GAP) i++;
    const p = pts[i];
    if (skip || nodes.some(n => Math.hypot(n.x - p.x, n.y - p.y) < glassFlowR(gl, n) * 1.05)) continue;
    const a = tang(i) + (k % 2 ? 1 : -1) * (0.7 + r1 * 0.4);
    const Ln = (26 + r2 * 18) * (s.w / 9 + 0.6);
    const full = glassVesica(p.x, p.y, a, Ln, Ln * (0.28 + r3 * 0.08), 10);
    const top = full.slice(0, 11), bot = [full[10]].concat(full.slice(11), [full[0]]);   // base→tip one side; tip→base the other
    const ci = Math.floor(r4 * P.leaf.length);
    glassPiece(gl, top, glassVary(gl, P.leaf[ci], 0.06, RS), LW * 0.8);
    glassPiece(gl, bot, glassVary(gl, P.leaf[(ci + 1) % P.leaf.length], 0.06, RS), LW * 0.8);
  }
  if (s.tip) {
    const a = tang(N), r = s.w * 1.9;
    glassPiece(gl, glassVesica(s.B.x - Math.cos(a) * r * 0.3, s.B.y - Math.sin(a) * r * 0.3, a, r * 2.4, r * 0.75), glassVary(gl, glassPick(P.petal, RS), 0.06, RS));
  }
}
// Tiffany: a flower on every node: back petals, front petals, a heart
function glassFlower(gl, n, i) {
  const { c, RM, P } = gl, TAU = Math.PI * 2;
  c.own(i);
  const Rf = glassFlowR(gl, n), k = 5 + Math.floor(RM() * 3), rot = RM() * TAU, lily = RM() < 0.4;
  const cA = glassPick(P.petal, RM), cB = glassPick(P.petal.filter(h => h !== cA), RM);
  for (let p = 0; p < k; p++) {
    const a = rot + p * TAU / k;
    glassPiece(gl, glassVesica(n.x, n.y, a, Rf * (lily ? 1.15 : 1), Rf * (lily ? 0.24 : 0.36)), glassVary(gl, cA, 0.06, RM));
  }
  if (!lily) for (let p = 0; p < k; p++) {
    const a = rot + (p + 0.5) * TAU / k;
    glassPiece(gl, glassVesica(n.x, n.y, a, Rf * 0.66, Rf * 0.26), glassVary(gl, cB, 0.06, RM));
  }
  glassPiece(gl, glassCircle(n.x, n.y, Rf * 0.2, 20), P.heart);
  c.own(-1);
}

// Rose windows: a round traced window on every node
function glassRose(gl, n, i) {
  const { c, RM, P, LW } = gl, TAU = Math.PI * 2;
  const piece = (pts, col, lw) => glassPiece(gl, pts, col, lw), vary = (h, amt) => glassVary(gl, h, amt);
  c.own(i);
  const Rr = glassRoseR(gl, n), k = glassPick([6, 8, 8, 10, 12], RM), rot = -Math.PI / 2 + (RM() < 0.5 ? Math.PI / k : 0);
  const variant = glassPick(['lancet', 'foil', 'wheel'], RM);
  const g = P.glass, cs = [];
  for (let q = 0; q < 6; q++) cs.push(glassPick(g, RM));
  if (cs[1] === cs[0]) cs[1] = g[(g.indexOf(cs[0]) + 2) % g.length];
  if (cs[3] === cs[2]) cs[3] = g[(g.indexOf(cs[2]) + 3) % g.length];
  const step = TAU / k, r0 = 0.3 * Rr, r1 = 0.84 * Rr;
  // Outer band: 2k panes in two glasses, with a thick came round it
  for (let s = 0; s < 2 * k; s++) piece(glassSector(n.x, n.y, r1, Rr, rot + s * step / 2, rot + (s + 1) * step / 2), vary(s % 2 ? cs[0] : cs[1], 0.05));
  // Middle: the field between the petals
  for (let s = 0; s < k; s++) {
    const a0 = rot + s * step - step / 2, a1 = a0 + step;
    if (variant === 'wheel') {
      piece(glassSector(n.x, n.y, r0, (r0 + r1) / 2, a0, a1), vary(s % 2 ? cs[2] : cs[3], 0.05));
      piece(glassSector(n.x, n.y, (r0 + r1) / 2, r1, a0, a1), vary(s % 2 ? cs[4] : cs[5], 0.05));
    } else piece(glassSector(n.x, n.y, r0, r1, a0, a1), vary(cs[3], 0.06));
  }
  for (let s = 0; s < k; s++) {
    const a = rot + s * step;
    if (variant === 'lancet') {
      const W = Math.sin(step / 2) * (r0 + r1) / 2 * 0.62;
      piece(glassVesica(n.x + Math.cos(a) * r0 * 0.92, n.y + Math.sin(a) * r0 * 0.92, a, (r1 - r0 * 0.92) * 0.97, W), vary(cs[2], 0.05));
      const rm = r0 + (r1 - r0) * 0.58;
      piece(glassCircle(n.x + Math.cos(a) * rm, n.y + Math.sin(a) * rm, W * 0.42, 18), vary(cs[4], 0.05));
    } else if (variant === 'foil') {
      const rm = (r0 + r1) / 2, fr = Math.min((r1 - r0) / 2 * 0.92, Math.sin(step / 2) * rm * 0.95);
      piece(glassFoil(n.x + Math.cos(a) * rm, n.y + Math.sin(a) * rm, fr, 4, a), vary(cs[2], 0.05));
      piece(glassCircle(n.x + Math.cos(a) * rm, n.y + Math.sin(a) * rm, fr * 0.36, 16), vary(cs[4], 0.05));
    } else {
      // Wheel: a small roundel where each spoke meets the band
      piece(glassCircle(n.x + Math.cos(a + step / 2) * r1, n.y + Math.sin(a + step / 2) * r1, (Rr - r1) * 0.7, 14), P.heart, LW * 0.8);
    }
  }
  // Centre: an oculus with a foil and a heart
  piece(glassCircle(n.x, n.y, r0, 36), vary(cs[5], 0.05));
  piece(glassFoil(n.x, n.y, r0 * 0.78, { 6: 3, 8: 4, 10: 5, 12: 4 }[k], rot), vary(cs[0], 0.05));
  piece(glassCircle(n.x, n.y, r0 * 0.24, 18), P.heart);
  // Tracery: heavier lead round the window and the oculus
  c.strokeStyle = GLASS_LEAD; c.globalAlpha = 1;
  const mark = (pts, lw) => { if (c.markLead) c.markLead({ pts, lw, lead: GLASS_LEAD }); return pts; };
  c.lineWidth = LW * 2; c.beginPath(); glassPath(c, mark(glassCircle(n.x, n.y, Rr, 72), LW * 2)); c.stroke();
  c.lineWidth = LW * 1.5; c.beginPath(); glassPath(c, mark(glassCircle(n.x, n.y, r1, 72), LW * 1.5)); c.stroke();
  c.beginPath(); glassPath(c, mark(glassCircle(n.x, n.y, r0, 48), LW * 1.5)); c.stroke();
  c.own(-1);
}
