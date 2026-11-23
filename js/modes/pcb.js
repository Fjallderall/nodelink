// ── PCB MODE ───────────────────────────────────────────────────────────────
// Built like a board, in order: anchor pads → chips (QFP / SOIC) and small
// R/C parts → pin breakouts that fan out at 45° → the node network, routed
// as buses (A* on a coarse grid: octilinear, turns cost more at low jitter;
// lanes offset with mitred corners, fanning into each node) → wandering
// traces for texture → meanders on long single traces → copper pours with
// clearance knockouts and stitching vias → optional silkscreen.
// Everything shares one occupancy grid, so nothing overlaps.
// Distance from (x, y) to segment ab
// Used by: RENDERERS. As Layer 2 over a PCB main it routes round liveOf(c).obst
// (set by recordDL from renderPCB.lastObst).
function obSegDist(x, y, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / l2)) : 0;
  return Math.hypot(x - a.x - vx * t, y - a.y - vy * t);
}

// renderPCB: the board is built in stages on one shared object pb (pcbBoard,
// pcbZones), then drawn. The stages run in the same order as before the
// split and all draw from pb.R in turn, so a seed gives the same board.
// pcbRouteNetwork has its own stream (seed × 4507), as before.
function renderPCB(c, nodes, density, sigma, weight, seed) {
  const pb = pcbBoard(nodes, density, sigma, weight, seed, liveOf(c).obst);
  pcbZones(pb);
  pcbBlockMain(pb);
  renderPCB.lastLinks = pcbRouteNetwork(pb, seed);
  const pins = pcbPlaceParts(pb);
  const wk = pcbWalker(pb);
  pcbBreakouts(pb, pins, wk);
  pcbTexture(pb, wk);
  pcbMeanders(pb);
  const pour = pcbPours(pb);
  renderPCB.lastZones = pour.zBox;
  pcbDraw(c, pb, pour);
  renderPCB.lastLines = pb.lines;        // for tests: lets them check that no two traces cross
  renderPCB.lastObst = pcbObstacles(pb, pour);
  pcbSilk(c, pb);
}

const PCB_COLS = { COL_TRACE: '#22d0ff', COL_PAD: '#a1f0ff', COL_POUR: '#1a8fb8', COL_SILK: '#e9eef0', COL_HOLE: '#020610' };

// PCB board: settings, spawn area, the occupancy grid and its helpers, and
// the empty geometry lists. R is the board's main random stream.
// OB: the main board's copper when this is a second PCB layer, else null
function pcbBoard(nodes, density, sigma, weight, seed, OB) {
  let s = seed * 7331;
  const R = () => sr(s++);
  const J = sigma / 100;
  const P = S.pcb || { pour: 40, meander: true, silk: false };
  const traceW = Math.max(0.1, weight * 1.5);
  let cell = Math.max(1, traceW * 3.5);
  const viaR = traceW * 1.6;

  // ── Spawn area and grid ──
  let cx = 0, cy = 0;
  nodes.forEach(n => { cx += n.x; cy += n.y; });
  cx /= (nodes.length || 1); cy /= (nodes.length || 1);
  const RG = fillRegion();
  // Parts fill the boundary when one is set, else the node hull × 1.6
  const poly = RG ? RG.pts : [...nodes].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))
    .map(n => ({ x: cx + (n.x - cx) * 1.6, y: cy + (n.y - cy) * 1.6 }));
  let maxR = 0;
  nodes.forEach(n => { const d = Math.hypot(n.x - cx, n.y - cy); if (isFinite(d) && d > maxR) maxR = d; });
  maxR = Math.max(maxR, 60);
  let half = Math.min(3000, Math.max(maxR * 2.5, 600));
  if (RG) {
    // Grid round the boundary (and every node), so parts can reach its edges
    let ext = Math.max(Math.abs(RG.x0), Math.abs(RG.x1), Math.abs(RG.y0), Math.abs(RG.y1));
    nodes.forEach(n => { ext = Math.max(ext, Math.abs(n.x), Math.abs(n.y)); });
    half = Math.min(3000, ext + 80); cx = 0; cy = 0;
  }
  const fill = RG ? RG.scale(Math.max(maxR, 120) * 1.3) : 1;   // more parts in a bigger area
  let COLS = Math.floor(half * 2 / cell), ROWS;
  if (!isFinite(COLS) || COLS < 1) COLS = 100;
  COLS = ROWS = Math.min(COLS, 2000);
  const X0 = cx - COLS * cell / 2, Y0 = cy - ROWS * cell / 2;
  // grid: copper already placed. nodeRes: the zone around each anchor pad,
  // kept apart so a bus may enter its own node's zone but nothing else may.
  const GW = COLS;
  const grid = new Uint8Array(GW * ROWS), nodeRes = new Uint8Array(GW * ROWS);
  const IX = (x, y) => y * COLS + x;
  const DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1];
  const inG = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
  const isFree = (x, y) => inG(x, y) && grid[IX(x, y)] === 0 && nodeRes[IX(x, y)] === 0;
  const mark = (x, y) => { if (inG(x, y)) grid[IX(x, y)] = 1; };
  const markRect = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) mark(x, y); };
  const rectFree = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!isFree(x, y)) return false; return true; };
  const W = (gx, gy) => ({ x: X0 + gx * cell, y: Y0 + gy * cell });
  const G = (x, y) => ({ gx: Math.round((x - X0) / cell), gy: Math.round((y - Y0) / cell) });
  const inPoly = (gx, gy) => { const p = W(gx, gy); return pip(p, poly); };
  // Marks the cells a world polyline covers, with r cells of clearance
  function markLine(pts, r) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (cell * 0.4)));
      for (let k = 0; k <= n; k++) {
        const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n;
        if (r === 0) {
          // 2×2 cells round the point: a one-cell diagonal would let another
          // diagonal slip through its corners and cross it
          const fx = (x - X0) / cell, fy = (y - Y0) / cell;
          for (const gy of [Math.floor(fy), Math.ceil(fy)]) for (const gx of [Math.floor(fx), Math.ceil(fx)]) mark(gx, gy);
          continue;
        }
        const g = G(x, y);
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) mark(g.gx + dx, g.gy + dy);
      }
    }
  }
  // True if a world polyline only passes free cells. Samples within a skip
  // zone (a node the line connects to) are ignored. Single copper layer:
  // traces may never cross or touch, so every new line is checked first.
  // own: node indexes whose zones this line may enter (the ones it connects)
  function lineFree(pts, skip = [], own = []) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (cell * 0.4)));
      for (let k = 0; k <= n; k++) {
        const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n;
        if (skip.some(z => Math.hypot(x - z.x, y - z.y) <= z.r)) continue;
        const g = G(x, y);
        if (!inG(g.gx, g.gy) || grid[IX(g.gx, g.gy)]) return false;
        const nr = nodeRes[IX(g.gx, g.gy)];
        if (nr && !own.includes(nr - 1)) return false;
      }
    }
    return true;
  }
  const simplify = pts => pts.filter((p, i) => {
    if (i === 0 || i === pts.length - 1) return true;
    const a = pts[i - 1], b = pts[i + 1];
    return Math.abs((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) > 1e-6;
  });

  // Geometry, drawn at the end in layer order
  const lines = [];      // { pts, w, mea }
  const vias = [];       // { x, y, r }
  const pads = [];       // { x, y, w, h } copper rectangles
  const bodies = [];     // { x, y, w, h } chip bodies
  const silk = [];       // { x, y, w, h, label, pin1: {x,y} | null }
  return { nodes, density, J, P, OB, traceW, cell, viaR, cx, cy, poly, maxR, fill, COLS, ROWS, GW, X0, Y0,
    grid, nodeRes, IX, DX, DY, inG, isFree, mark, markRect, rectFree, W, G, inPoly, markLine, lineFree, simplify,
    lines, vias, pads, bodies, silk, R };
}

// PCB node zones: the reserved zone round each anchor pad (nodeRes), pad
// sizes, and the copper kept as segments inside each zone. Adds its helpers to pb.
function pcbZones(pb) {
  const { nodes, OB, traceW, cell, viaR, nodeRes, IX, DX, DY, inG, mark, G } = pb;
  // ── 1. Anchor pads ──
  // A second layer takes the main board's zone size, so inside it the main
  // lanes are checked as segments (zoneSegs) and its own walks keep out
  const nodeZone = (n, i = -1) => ({ x: n.x, y: n.y,
    r: Math.max((Math.ceil(viaR * 1.8 * (n.size || 1) / cell) + 1.5) * cell, OB && i >= 0 ? OB.zoneR[i] : 0) });
  nodes.forEach((n, i) => {
    const g = G(n.x, n.y), r = Math.max(Math.ceil(viaR * 1.8 * (n.size || 1) / cell) + 1, OB ? Math.ceil(OB.zoneR[i] / cell) : 0);
    for (let y = g.gy - r; y <= g.gy + r; y++) for (let x = g.gx - r; x <= g.gx + r; x++) if (inG(x, y)) nodeRes[IX(x, y)] = i + 1;
  });

  // ── Bus ends. Lanes stay octilinear and parallel up to the node: the
  // centreline leaves the node in one of the 8 directions with a straight
  // stub long enough for the lanes to neck down. Close to the pad the outer
  // lanes step in at 45° (outermost first, keeping the bus pitch on the
  // diagonal), then run straight and close together into the pad. The pad
  // grows a little if the narrowed bus doesn't fit inside it.
  const basePadR = n => viaR * 1.8 * (n.size || 1);
  const padNeed = new Float64Array(nodes.length);       // grown pad radius per node
  const padR = i => Math.max(basePadR(nodes[i]), padNeed[i]);
  // Copper inside each node zone (not on the grid there): [{a, b, w}]
  const zoneSegs = nodes.map((_, i) => OB && OB.zoneSegs[i] ? OB.zoneSegs[i].slice() : []);
  const D45 = Math.SQRT2 * cell;
  const OCT = DX.map((dx, d) => { const l = Math.hypot(dx, DY[d]); return { x: dx / l, y: DY[d] / l }; });
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const unit = (a, b) => { const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };

  // Distance from point p to segment ab
  const segDist = (p, a, b) => {
    const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2)) : 0;
    return Math.hypot(p.x - a.x - vx * t, p.y - a.y - vy * t);
  };
  // Inside a node zone the grid isn't used: check the new copper against
  // what already enters that node. Lines may only meet inside the pad.
  function zoneClear(pts, w, ni, N = nodes[ni]) {
    const z = nodeZone(nodes[ni], ni);
    const inner = Math.max(padR(ni), OB && OB.padR[ni] || 0) + cell * 0.25;   // lines may meet under either pad
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], m = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (cell * 0.25)));
      for (let j = 0; j <= m; j++) {
        const p = { x: a.x + (b.x - a.x) * j / m, y: a.y + (b.y - a.y) * j / m }, r = Math.hypot(p.x - N.x, p.y - N.y);
        if (r < inner || r > z.r + cell) continue;
        for (const sg of zoneSegs[ni]) if (segDist(p, sg.a, sg.b) < (w + sg.w) / 2 + traceW * 0.5) return false;
      }
    }
    return true;
  }
  const addZoneSegs = (pts, w, ni, N = nodes[ni]) => {
    for (let i = 1; i < pts.length; i++) zoneSegs[ni].push({ a: pts[i - 1], b: pts[i], w });
  };
  // Marks a lane on the grid except inside the given zones (kept as segments)
  function markOutside(pts, zs) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (cell * 0.4)));
      for (let k = 0; k <= n; k++) {
        const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n;
        if (zs.some(z => Math.hypot(x - z.x, y - z.y) <= z.r)) continue;
        const g = G(x, y);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mark(g.gx + dx, g.gy + dy);
      }
    }
  }
  Object.assign(pb, { nodeZone, basePadR, padNeed, padR, zoneSegs, D45, OCT, dot, sub, unit, segDist, zoneClear, addZoneSegs, markOutside });
}

// 1b. Second layer on a PCB: the main board's copper is in the way.
// A cell is blocked when its centre is closer to main copper than half
// both widths plus a gap (the distance to a segment is convex, so a line
// between two free centres keeps that gap too; the half cell covers
// lineFree rounding samples to the nearest centre).
function pcbBlockMain(pb) {
  const { nodes, OB, traceW, cell, ROWS, X0, Y0, grid, IX, inG } = pb;
  if (!OB) return;
  const gap = traceW * 0.6 + cell * 0.5;
  const inMainZone = (x, y) => nodes.some((n, i) => (x - n.x) ** 2 + (y - n.y) ** 2 <= OB.zoneR[i] ** 2);
  const blk = (x0, y0, x1, y1, hit) => {
    const gx0 = Math.floor((x0 - X0) / cell), gx1 = Math.ceil((x1 - X0) / cell);
    const gy0 = Math.max(0, Math.floor((y0 - Y0) / cell)), gy1 = Math.min(ROWS - 1, Math.ceil((y1 - Y0) / cell));
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      if (!inG(gx, gy)) continue;
      const k = IX(gx, gy);
      if (!grid[k] && hit(X0 + gx * cell, Y0 + gy * cell)) grid[k] = 1;
    }
  };
  OB.lines.forEach(L => {
    const r = L.w / 2 + traceW / 2 + gap;
    for (let i = 1; i < L.pts.length; i++) {
      const a = L.pts[i - 1], b = L.pts[i];
      blk(Math.min(a.x, b.x) - r, Math.min(a.y, b.y) - r, Math.max(a.x, b.x) + r, Math.max(a.y, b.y) + r, (x, y) => obSegDist(x, y, a, b) <= r && !inMainZone(x, y));
    }
  });
  OB.vias.forEach(v => { const r = v.r + traceW / 2 + gap; blk(v.x - r, v.y - r, v.x + r, v.y + r, (x, y) => (x - v.x) ** 2 + (y - v.y) ** 2 <= r * r); });
  OB.rects.forEach(p => { const m = traceW / 2 + gap; blk(p.x - m, p.y - m, p.x + p.w + m, p.y + p.h + m, () => true); });
}

// ── 2. Node network, routed first so buses take direct paths and the
// chips fill the space that's left. Own RNG stream, so the chip layout
// keeps its own draws. Per link: A* at the bus's width; when it fails or
// detours more than maxRatio × the straight distance, retry narrower.
// Afterwards every node that's still alone, and every separate group,
// gets one more try with a looser detour limit.
// Returns the node pairs it linked.
function pcbRouteNetwork(pb, seed) {
  const { nodes, density, J, OB } = pb;
  let sb = seed * 4507 + 11;
  const RB = () => sr(sb++);
  const linked = [];
  const par = nodes.map((_, i) => i);
  const find = i => par[i] === i ? i : (par[i] = find(par[i]));
  // A second layer over a PCB makes no node links: the main board already
  // joins the nodes and its copper blocks nearly every exit, so they failed anyway
  if (nodes.length > 1 && !OB) {
    // Minimum spanning tree, plus a few extra short links at higher density
    const inT = [0], all = [], edges = [];
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++)
      all.push([Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y), i, j]);
    all.sort((a, b) => a[0] - b[0]);
    while (inT.length < nodes.length) {
      const e = all.find(([, i, j]) => inT.includes(i) !== inT.includes(j));
      if (!e) break;
      edges.push(e); inT.push(inT.includes(e[1]) ? e[2] : e[1]);
    }
    const extra = Math.floor(density / 3);
    all.filter(e => !edges.includes(e)).slice(0, extra).forEach(e => edges.push(e));
    const ratio = 1.7 + 0.8 * J;
    const tryLink = (ia, ib, lanes, r) => {
      if (!pcbRouteBus(pb, ia, ib, lanes, r)) return false;
      linked.push([ia, ib]); par[find(ia)] = find(ib);
      return true;
    };
    edges.forEach(([, ia, ib]) => { const ln = Math.min(5, 1 + Math.floor(RB() * (1.5 + density / 2.5))); tryLink(ia, ib, ln, ratio); });
    // Repair: join separate groups with the shortest link that fits, loosening
    // the detour limit step by step (alone nodes are groups of one)
    for (const r of [ratio, 2.6, 4]) {
      for (let guard = 0; guard < nodes.length; guard++) {
        const roots = new Set(nodes.map((_, i) => find(i)));
        if (roots.size < 2) break;
        const cand = all.filter(([, i, j]) => find(i) !== find(j)).slice(0, 12);
        if (!cand.some(([, i, j]) => tryLink(i, j, 2, r))) break;
      }
    }
  }
  return linked;
}

// ── Bus ends. Lanes stay octilinear and parallel up to the node: the
// centreline leaves the node in one of the 8 directions with a straight
// stub long enough for the lanes to neck down. Close to the pad the outer
// lanes step in at 45° (outermost first, keeping the bus pitch on the
// diagonal), then run straight and close together into the pad. The pad
// grows a little if the narrowed bus doesn't fit inside it.
function pcbEndGeom(pb, ni, lanes, w) {
  const { nodes, traceW, cell, basePadR, D45 } = pb;
  const kmax = (lanes - 1) / 2, R0 = basePadR(nodes[ni]);
  const sp = kmax > 0 ? Math.min(cell, Math.max(w * 1.35, (R0 * 0.92 - w / 2) / kmax)) : cell;
  const pr = Math.max(R0, kmax * sp + w / 2 + traceW * 0.15);
  const a1 = pr + cell * 0.4;
  const stub = (sp < cell ? a1 + kmax * (D45 - sp) : pr) + cell * (0.5 + 0.42 * kmax);
  return { kmax, sp, pr, a1, stub };
}

// Ways to leave node N and join the inner path P (octilinear, starting
// near N). Each: { pts: [N, …, Q], k, t (Q on segment k at t), cost }
function pcbEndCandidates(pb, N, P, stub) {
  const { cell, OCT, dot, unit } = pb;
  const out = [], segs = [];
  let acc = 0;
  for (let k = 0; k < P.length - 1 && k < 3; k++) {
    const len = Math.hypot(P[k + 1].x - P[k].x, P[k + 1].y - P[k].y);
    segs.push({ k, a: P[k], b: P[k + 1], len, at: acc, d: unit(P[k], P[k + 1]) });
    acc += len;
  }
  const turnCost = (u, v) => { const c = dot(u, v); return c > 0.99 ? 0 : c > 0.6 ? cell * 0.6 : c > -0.01 ? cell * 2 : Infinity; };
  // Ray from S along v hits a segment: distance along the ray and t
  const hit = (S, v, g) => {
    const sx = g.b.x - g.a.x, sy = g.b.y - g.a.y, den = v.x * sy - v.y * sx;
    if (Math.abs(den) < 1e-9) return null;
    const dx = g.a.x - S.x, dy = g.a.y - S.y;
    const s = (dx * sy - dy * sx) / den, t = (dx * v.y - dy * v.x) / den;
    return t >= -1e-6 && t <= 1 + 1e-6 && s > 0 ? { s, t: Math.max(0, Math.min(1, t)) } : null;
  };
  const add = (pts, g, t, turns) => {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const cost = len - (g.at + t * g.len) + turns;
    if (isFinite(cost)) out.push({ pts, k: g.k, t, cost });
  };
  for (let d = 0; d < 8; d++) {
    const u = OCT[d];
    // (a) straight from the node onto the path
    segs.forEach(g => {
      const h = hit(N, u, g);
      if (h && h.s >= stub) add([N, { x: N.x + u.x * h.s, y: N.y + u.y * h.s }], g, h.t, turnCost(u, g.d));
    });
    // (b) stub, one 45°/90° turn, then onto the path
    const S = { x: N.x + u.x * stub, y: N.y + u.y * stub };
    for (const dd of [1, 7, 2, 6]) {
      const v = OCT[(d + dd) % 8];
      segs.forEach(g => {
        const h = hit(S, v, g);
        if (h && h.s >= cell * 0.6) add([N, S, { x: S.x + v.x * h.s, y: S.y + v.y * h.s }], g, h.t, turnCost(u, v) + turnCost(v, g.d));
      });
    }
    // (c) stub, then a diagonal and a straight piece to a path vertex
    for (let q = 0; q < Math.min(P.length, 3); q++) {
      const T = P[q], dx = T.x - S.x, dy = T.y - S.y, m = Math.min(Math.abs(dx), Math.abs(dy));
      const g = q < P.length - 1 ? segs[q] : segs[q - 1], t = q < P.length - 1 ? 0 : 1;
      if (!g) continue;
      const diag = { x: Math.sign(dx) * m, y: Math.sign(dy) * m }, ax = { x: dx - diag.x, y: dy - diag.y };
      for (const p1 of [diag, ax]) {
        const C = { x: S.x + p1.x, y: S.y + p1.y };
        const pts = [N, S, C, T].filter((p, i, a) => i === 0 || Math.hypot(p.x - a[i - 1].x, p.y - a[i - 1].y) > 1e-6);
        if (pts.length < 3) continue;
        let turns = 0;
        const ds = [];
        for (let i = 1; i < pts.length; i++) ds.push(unit(pts[i - 1], pts[i]));
        if (q < P.length - 1) ds.push(g.d);
        for (let i = 1; i < ds.length; i++) turns += turnCost(ds[i - 1], ds[i]);
        if (Math.hypot(pts[2].x - pts[1].x, pts[2].y - pts[1].y) < cell * 0.6 && pts.length > 3) continue;
        add(pts, g, t, turns);
      }
    }
  }
  return out.sort((x, y) => x.cost - y.cost);
}

// Removes repeats and straight-through points; null if a turn is sharper
// than 90° or a segment isn't octilinear
function pcbCleanCentre(pb, pts) {
  const { dot, unit } = pb;
  const p = pts.filter((q, i) => i === 0 || Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y) > 1e-6);
  for (let i = 1; i < p.length; i++) {
    const dx = Math.abs(p[i].x - p[i - 1].x), dy = Math.abs(p[i].y - p[i - 1].y);
    if (dx > 1e-6 && dy > 1e-6 && Math.abs(dx - dy) > 1e-4 * Math.max(dx, dy)) return null;
  }
  const outp = [p[0]];
  for (let i = 1; i < p.length - 1; i++) {
    const u = unit(outp.at(-1), p[i]), v = unit(p[i], p[i + 1]), c = dot(u, v);
    if (c < -0.01) return null;
    if (c < 0.9999) outp.push(p[i]);
  }
  outp.push(p.at(-1));
  return outp;
}

// Replaces a lane's first point (beside node N) with the neck-down
function pcbNeckDown(pb, lane, centre, N, g) {
  const { cell, D45, dot, sub, unit } = pb;
  const u = unit(centre[0], centre[1]), n = { x: -u.y, y: u.x };
  const o = dot(sub(lane[0], N), n), k = Math.abs(o) / cell;
  const next = dot(sub(lane[1], N), u);
  if (g.sp >= cell || k < 1e-6) return next > g.pr + cell * 0.2 ? lane : null;
  const tt = Math.sign(o) * k * g.sp, s0 = g.a1 + (g.kmax - k) * (D45 - g.sp), dl = k * (cell - g.sp);
  if (next < s0 + dl + cell * 0.2) return null;
  return [{ x: N.x + n.x * tt, y: N.y + n.y * tt }, { x: N.x + n.x * tt + u.x * s0, y: N.y + n.y * tt + u.y * s0 },
    { x: N.x + n.x * o + u.x * (s0 + dl), y: N.y + n.y * o + u.y * (s0 + dl) }, ...lane.slice(1)];
}

// Routes one bus between nodes ia and ib, narrowing it until it fits.
function pcbRouteBus(pb, ia, ib, maxLanes, maxRatio) {
  const { nodes, traceW, cell, COLS, ROWS, grid, nodeRes, IX, lineFree, lines, nodeZone, padNeed, zoneClear,
    addZoneSegs, markOutside } = pb;
  const A = nodes[ia], B = nodes[ib];
  const straight = Math.hypot(A.x - B.x, A.y - B.y) || 1;
  const w = traceW * ((A.w || 1) + (B.w || 1)) / 2;
  const zones = [nodeZone(A, ia), nodeZone(B, ib)];
  // Summed-area table of the fine grid: O(1) "is this block empty?"
  const SW = COLS + 1, sat = new Int32Array(SW * (ROWS + 1));
  for (let y = 0; y < ROWS; y++) {
    let row = 0;
    for (let x = 0; x < COLS; x++) {
      const k = IX(x, y), nr = nodeRes[k];
      row += grid[k] | (nr && nr !== ia + 1 && nr !== ib + 1 ? 1 : 0);
      sat[(y + 1) * SW + x + 1] = sat[y * SW + x + 1] + row;
    }
  }
  for (let lanes = maxLanes; lanes >= 1; lanes--) {
    const K = lanes + 3;                                      // coarse cell, in fine cells
    const inner = pcbAstar(pb, A, B, K, sat, SW);
    if (!inner) continue;
    const gA = pcbEndGeom(pb, ia, lanes, w), gB = pcbEndGeom(pb, ib, lanes, w);
    // Centreline candidates: node A's way in × node B's way in
    const cands = [];
    if (inner.length >= 2) {
      const nP = inner.length, rev = [...inner].reverse();
      const cA = pcbEndCandidates(pb, A, inner, gA.stub).slice(0, 6);
      const cB = pcbEndCandidates(pb, B, rev, gB.stub).slice(0, 6).map(c => ({ ...c, k: nP - 2 - c.k, t: 1 - c.t }));
      cA.forEach(a => cB.forEach(b => {
        if (a.k > b.k || (a.k === b.k && a.t >= b.t - 1e-6)) return;
        cands.push({ pts: [...a.pts, ...inner.slice(a.k + 1, b.k + 1), ...[...b.pts].reverse()], cost: a.cost + b.cost });
      }));
    }
    // Close neighbours: a direct octilinear link (straight, or diagonal + straight)
    {
      const dx = B.x - A.x, dy = B.y - A.y, m = Math.min(Math.abs(dx), Math.abs(dy));
      const diag = { x: Math.sign(dx) * m, y: Math.sign(dy) * m };
      for (const C of [{ x: A.x + diag.x, y: A.y + diag.y }, { x: B.x - diag.x, y: B.y - diag.y }]) {
        const pts = [A, C, B];
        let len = 0; for (let i = 1; i < 3; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        cands.push({ pts, cost: len - straight + cell * 0.6 + 1e6 * (inner.length >= 2) });
      }
    }
    cands.sort((x, y) => x.cost - y.cost);
    for (const cd of cands.slice(0, 16)) {
      const centre = pcbCleanCentre(pb, cd.pts);
      if (!centre || centre.length < 2) continue;
      let len = 0;
      for (let i = 1; i < centre.length; i++) len += Math.hypot(centre[i].x - centre[i - 1].x, centre[i].y - centre[i - 1].y);
      if (len > maxRatio * straight + 2 * K * cell) continue;   // slack: the stubs dominate short links
      const rc = [...centre].reverse(), b = [];
      for (let l = 0; l < lanes; l++) {
        let ln = offsetPolyline(centre, (l - (lanes - 1) / 2) * cell);
        ln = ln.length >= 2 && pcbNeckDown(pb, ln, centre, A, gA);
        ln = ln && pcbNeckDown(pb, [...ln].reverse(), rc, B, gB);
        if (!ln) break;
        ln.reverse();
        if (!lineFree(ln, zones, [ia, ib]) || !zoneClear(ln, w, ia, A) || !zoneClear(ln, w, ib, B)) break;
        b.push(ln);
      }
      if (b.length !== lanes) continue;
      if (b.some((x, i) => b.some((y, j) => j > i && polylinesCross(x, y)))) continue;
      b.forEach(ln => {
        lines.push({ pts: ln, w, mea: lanes === 1 });
        markOutside(ln, zones);
        addZoneSegs(ln, w, ia, A); addZoneSegs(ln, w, ib, B);
      });
      padNeed[ia] = Math.max(padNeed[ia], gA.pr); padNeed[ib] = Math.max(padNeed[ib], gB.pr);
      return true;
    }
  }
  return false;
}

// A* over (coarse cell, heading); 45° turns are cheap, 90° expensive,
// sharper never. Returns the simplified inner centreline, or null.
function pcbAstar(pb, A, B, K, sat, SW) {
  const { J, COLS, ROWS, DX, DY, W, G, simplify } = pb;
  const CW = Math.floor(COLS / K), CH = Math.floor(ROWS / K);
  if (CW < 3 || CH < 3) return null;
  const blockFree = (i, j) => {
    const x0 = i * K, y0 = j * K, x1 = x0 + K, y1 = y0 + K;
    return sat[y1 * SW + x1] - sat[y0 * SW + x1] - sat[y1 * SW + x0] + sat[y0 * SW + x0] === 0;
  };
  const toC = n => { const g = G(n.x, n.y); return [Math.max(0, Math.min(CW - 1, Math.floor(g.gx / K))), Math.max(0, Math.min(CH - 1, Math.floor(g.gy / K)))]; };
  const [si, sj] = toC(A), [ti, tj] = toC(B);
  const pass = (i, j) => i >= 0 && j >= 0 && i < CW && j < CH && (blockFree(i, j) || (i === si && j === sj) || (i === ti && j === tj));
  const t45 = 0.4 + (1 - J) * 2.5, t90 = 3 + (1 - J) * 7;
  const NS = CW * CH * 8, gS = new Float32Array(NS).fill(Infinity), prv = new Int32Array(NS).fill(-1);
  const heap = [], hf = [];
  const push = (id, f) => {
    heap.push(id); hf.push(f);
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hf[p], hf[i]] = [hf[i], hf[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], lastId = heap.pop(), lastF = hf.pop();
    if (heap.length) {
      heap[0] = lastId; hf[0] = lastF;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heap.length && hf[l] < hf[m]) m = l;
        if (r < heap.length && hf[r] < hf[m]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; [hf[m], hf[i]] = [hf[i], hf[m]]; i = m;
      }
    }
    return top;
  };
  const hEst = (i, j) => { const dx = Math.abs(i - ti), dy = Math.abs(j - tj); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  for (let d = 0; d < 8; d++) { const id = ((sj * CW) + si) * 8 + d; gS[id] = 0; push(id, hEst(si, sj)); }
  let goal = -1, expanded = 0;
  while (heap.length && expanded++ < 80000) {
    const id = pop(), d = id % 8, cellId = (id - d) / 8, i = cellId % CW, j = (cellId - i) / CW;
    if (i === ti && j === tj) { goal = id; break; }
    const g0 = gS[id];
    for (let nd = 0; nd < 8; nd++) {
      const diff = Math.min(Math.abs(nd - d), 8 - Math.abs(nd - d));
      if (diff > 2) continue;
      const ni = i + DX[nd], nj = j + DY[nd];
      if (!pass(ni, nj)) continue;
      if (DX[nd] && DY[nd] && (!pass(i + DX[nd], j) || !pass(i, j + DY[nd]))) continue;
      const g1 = g0 + (DX[nd] && DY[nd] ? 1.414 : 1) + (diff === 1 ? t45 : diff === 2 ? t90 : 0);
      const nid = ((nj * CW) + ni) * 8 + nd;
      if (g1 < gS[nid]) { gS[nid] = g1; prv[nid] = id; push(nid, g1 + hEst(ni, nj)); }
    }
  }
  if (goal < 0) return null;
  const cellsPath = [];
  for (let id = goal; id >= 0; id = prv[id]) { const cid = (id - id % 8) / 8; cellsPath.push([cid % CW, (cid - cid % CW) / CW]); }
  cellsPath.reverse();
  const centre = cellsPath.map(([i, j]) => W(i * K + (K - 1) / 2, j * K + (K - 1) / 2));
  return simplify(centre.slice(1, -1));
}

// 3. Chips and small parts. Returns their pins for the breakouts.
function pcbPlaceParts(pb) {
  const { density, cell, fill, COLS, ROWS, DX, DY, markRect, rectFree, W, inPoly, pads, bodies, silk, R } = pb;
  const pins = [];       // { gx, gy, out, rel } trace start just outside the pad
  let nU = 0, nR = 0, nC = 0;
  const chipCount = Math.round((1 + density * 0.55) * fill);
  for (let tries = 0, made = 0; made < chipCount && tries < 400; tries++) {
    const qfp = R() < 0.45;
    const n = 3 + Math.floor(R() * (2 + density * 0.45));
    const horiz = R() < 0.5;
    const len = 2 * n + 1, wid = qfp ? len : 3 + Math.floor(R() * 2);
    const bw = horiz || qfp ? len : wid, bh = horiz || qfp ? wid : len;
    const gx0 = 6 + Math.floor(R() * (COLS - bw - 12)), gy0 = 6 + Math.floor(R() * (ROWS - bh - 12));
    if (!inPoly(gx0 + bw / 2, gy0 + bh / 2)) continue;
    if (!rectFree(gx0 - 4, gy0 - 4, gx0 + bw + 3, gy0 + bh + 3)) continue;
    markRect(gx0 - 1, gy0 - 1, gx0 + bw, gy0 + bh);
    const tl = W(gx0, gy0);
    bodies.push({ x: tl.x - cell / 2, y: tl.y - cell / 2, w: bw * cell, h: bh * cell });
    // Sides with pins: [out dir, along dir, count]
    const sides = qfp ? [6, 2, 4, 0] : (horiz ? [6, 2] : [4, 0]);
    let pin1 = null;
    sides.forEach(out => {
      const vert = out === 0 || out === 4;           // pins along y
      const cnt = vert ? Math.floor((bh - 1) / 2) : Math.floor((bw - 1) / 2);
      for (let i = 0; i < cnt; i++) {
        const gx = vert ? (out === 0 ? gx0 + bw : gx0 - 1) : gx0 + 1 + 2 * i;
        const gy = vert ? gy0 + 1 + 2 * i : (out === 2 ? gy0 + bh : gy0 - 1);
        const p = W(gx, gy);
        // Pad: long in the pin's outward direction
        const pw = (vert ? 1.25 : 0.62) * cell, ph = (vert ? 0.62 : 1.25) * cell;
        pads.push({ x: p.x - pw / 2, y: p.y - ph / 2, w: pw, h: ph });
        if (!pin1) pin1 = p;
        pins.push({ gx: gx + DX[out], gy: gy + DY[out], out, rel: i - (cnt - 1) / 2, vert });
      }
    });
    nU++;
    silk.push({ x: tl.x - cell * 1.6, y: tl.y - cell * 1.6, w: (bw + 2.2) * cell, h: (bh + 2.2) * cell, label: 'U' + nU, pin1 });
    made++;
  }
  const partCount = Math.round(density * 1.6);
  for (let tries = 0, made = 0; made < partCount && tries < 600; tries++) {
    const horiz = R() < 0.5;
    const gx = 4 + Math.floor(R() * (COLS - 10)), gy = 4 + Math.floor(R() * (ROWS - 10));
    const gx1 = horiz ? gx + 3 : gx, gy1 = horiz ? gy : gy + 3;
    if (!inPoly(gx, gy) || !rectFree(gx - 2, gy - 2, gx1 + 2, gy1 + 2)) continue;
    markRect(gx - 1, gy - 1, gx1 + 1, gy1 + 1);
    [[gx, gy, horiz ? 4 : 6], [gx1, gy1, horiz ? 0 : 2]].forEach(([px, py, out]) => {
      const p = W(px, py);
      pads.push({ x: p.x - cell * 0.6, y: p.y - cell * 0.6, w: cell * 1.2, h: cell * 1.2 });
      pins.push({ gx: px + 2 * DX[out], gy: py + 2 * DY[out], out, rel: 0, part: true, from: p });
    });
    const a = W(gx, gy), b = W(gx1, gy1);
    const isR = R() < 0.6;
    silk.push({ x: Math.min(a.x, b.x) - cell, y: Math.min(a.y, b.y) - cell, w: Math.abs(b.x - a.x) + cell * 2, h: Math.abs(b.y - a.y) + cell * 2,
      label: isR ? 'R' + (++nR) : 'C' + (++nC), pin1: null });
    made++;
  }
  return pins;
}

// Walker: fine-grid trace that keeps clear of everything. Returns { walk, addWalk }.
function pcbWalker(pb) {
  const { J, viaR, DX, DY, isFree, mark, W, simplify, lines, vias, R } = pb;
  const turnP = 0.02 + J * 0.35, minStraight = Math.max(1, 6 - Math.floor(J * 5));
  function canStep(x, y, d) {
    const nx = x + DX[d], ny = y + DY[d];
    if (!isFree(nx, ny)) return false;
    if (DX[d] && DY[d] && (!isFree(x + DX[d], y) || !isFree(x, y + DY[d]))) return false;
    return true;
  }
  function walk(gx, gy, dir, maxLen, plan = null) {
    if (!isFree(gx, gy)) return null;
    const pts = [[gx, gy]];
    mark(gx, gy);
    let cd = dir, straight = 0;
    const step = d => { gx += DX[d]; gy += DY[d]; mark(gx, gy); pts.push([gx, gy]); };
    if (plan) {
      for (const [pd, n] of plan) {
        for (let i = 0; i < n; i++) { if (!canStep(gx, gy, pd)) return pts; step(pd); }
        cd = pd;
      }
    }
    for (let i = 0; i < maxLen; i++) {
      if (canStep(gx, gy, cd)) {
        step(cd);
        if (++straight > minStraight && R() < turnP) { cd = (cd + (R() < 0.5 ? 1 : 7)) % 8; straight = 0; }
        continue;
      }
      const opts = [1, 7].map(t => (cd + t) % 8).filter(d => canStep(gx, gy, d));
      const opts90 = opts.length ? opts : [2, 6].map(t => (cd + t) % 8).filter(d => canStep(gx, gy, d));
      if (!opts90.length) break;
      cd = opts90[Math.floor(R() * opts90.length)];
      straight = 0;
    }
    return pts;
  }
  function addWalk(pts, w, viaEnd, prefix = null) {
    if (!pts || pts.length < 2) return;
    let wp = pts.map(([x, y]) => W(x, y));
    if (prefix) wp = [prefix, ...wp];
    lines.push({ pts: simplify(wp), w, mea: true });
    const e = wp[wp.length - 1];
    if (viaEnd && R() < 0.85) vias.push({ x: e.x, y: e.y, r: viaR });
  }
  return { walk, addWalk };
}

// 4. Pin breakouts (after the buses, which get first pick of the space): out, fan away from the chip centre at 45°, out again
function pcbBreakouts(pb, pins, { walk, addWalk }) {
  const { density, traceW, DX, DY, W, R } = pb;
  pins.forEach(pn => {
    if (R() < (pn.part ? 0.15 : 0.22)) return;
    let plan;
    if (pn.part) plan = [[pn.out, 1]];
    else {
      const k = Math.round(Math.abs(pn.rel));
      const alongPos = pn.vert ? 2 : 0;                        // +y for side pins, +x for top/bottom
      const along = pn.rel > 0 ? alongPos : (alongPos + 4) % 8;
      const diag = along === (pn.out + 2) % 8 ? (pn.out + 1) % 8 : (pn.out + 7) % 8;
      plan = k ? [[pn.out, 1], [diag, k], [pn.out, 2 + Math.floor(R() * 3)]] : [[pn.out, 3 + Math.floor(R() * 3)]];
    }
    const prefix = pn.part ? pn.from : W(pn.gx - DX[pn.out], pn.gy - DY[pn.out]);
    addWalk(walk(pn.gx, pn.gy, pn.out, 3 + R() * (8 + density), plan), traceW, true, prefix);
  });
}

// 5. Texture: traces leaving the nodes, and short parallel runs
function pcbTexture(pb, { walk, addWalk }) {
  const { nodes, density, traceW, cell, viaR, fill, COLS, ROWS, DX, DY, W, G, inPoly, markLine, lineFree, R,
    nodeZone, padR, OCT, dot, sub, zoneClear, addZoneSegs } = pb;
  nodes.forEach(n => {
    const g = G(n.x, n.y), r = Math.ceil(viaR * 1.8 * (n.size || 1) / cell) + 2;
    for (let k = 0; k < 2 + Math.floor(density / 4); k++) {
      const d = Math.floor(R() * 8);
      const st = W(g.gx + DX[d] * r, g.gy + DY[d] * r);
      // Start inside the pad on the exact line of direction d, so the stem
      // is octilinear too (the grid point is up to half a cell off centre)
      const ni = nodes.indexOf(n), u = OCT[d], along = dot(sub(st, n), u);
      const p0 = { x: st.x - u.x * along, y: st.y - u.y * along }, stem = [p0, st];
      if (Math.hypot(p0.x - n.x, p0.y - n.y) > padR(ni) * 0.6) continue;
      if (!lineFree(stem, [nodeZone(n, ni)], [ni]) || !zoneClear(stem, traceW * (n.w || 1), ni)) continue;
      const pts = walk(g.gx + DX[d] * r, g.gy + DY[d] * r, d, 12 + R() * 30);
      if (pts) { markLine(stem, 0); addZoneSegs(stem, traceW * (n.w || 1), ni); }
      addWalk(pts, traceW * (n.w || 1), true, p0);
    }
  });
  for (let b = 0, tries = 0; b < density * 2 * fill && tries < 800 * fill; tries++) {
    const gx = Math.floor(R() * COLS), gy = Math.floor(R() * ROWS);
    if (!inPoly(gx, gy)) continue;
    const dir = Math.floor(R() * 8), perp = (dir + 2) % 8, count = 2 + Math.floor(R() * 4), len = 15 + R() * 35;
    let added = false;
    for (let l = 0; l < count; l++) {
      const pts = walk(gx + DX[perp] * l, gy + DY[perp] * l, dir, len);
      if (pts && pts.length > 2) { addWalk(pts, traceW, true); added = true; }
    }
    if (added) b++;
  }
}

// 6. Meanders (serpentine length tuning) on long straight single runs
function pcbMeanders(pb) {
  const { J, P, cell, isFree, G, markLine, lines, R } = pb;
  if (!P.meander) return;
  const amp = 1.6 * cell;
  lines.forEach(L => {
    if (!L.mea) return;
    const out = [L.pts[0]];
    for (let i = 1; i < L.pts.length; i++) {
      const a = L.pts[i - 1], b = L.pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < cell * 12 || R() > 0.35 + J * 0.4) { out.push(b); continue; }
      const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len, nx = -uy, ny = ux;
      const pitch = cell * (Math.abs(ux) > 0.01 && Math.abs(uy) > 0.01 ? 1.42 : 1);
      const m = Math.min(16, Math.floor(len * 0.55 / pitch));
      const t0 = (len - m * pitch) / 2;
      // Clearance check on both sides of the run (the run's own cells excluded)
      let ok = true;
      for (let t = t0 - cell; t <= t0 + m * pitch + cell && ok; t += cell * 0.5)
        for (const side of [-1, 1]) for (let o = 1; o <= 2.7; o += 0.4) {
          const g = G(a.x + ux * t + nx * side * o * cell, a.y + uy * t + ny * side * o * cell);
          if (!isFree(g.gx, g.gy)) { ok = false; break; }
        }
      if (!ok) { out.push(b); continue; }
      const P0 = t => ({ x: a.x + ux * t, y: a.y + uy * t });
      const off = (p, k) => ({ x: p.x + nx * k, y: p.y + ny * k });
      out.push(P0(t0));
      let side = 1;
      for (let k = 0; k < m; k++) {
        out.push(off(P0(t0 + k * pitch), side * amp), off(P0(t0 + (k + 1) * pitch), side * amp));
        side = -side;
      }
      out.push(P0(t0 + m * pitch), b);
      const band = out.slice(-2 * m - 2);
      markLine(band, 1);
    }
    L.pts = out;
  });
}

// 7. Copper pours: chamfered zones, hatched, with stitching vias.
// Returns { zBox, pourOutline, pourHatch }.
function pcbPours(pb) {
  const { zones, zBox, inZone } = pcbPourZones(pb);
  const pourable = pcbKeepOut(pb, zBox);
  return { zBox, ...pcbPourLines(pb, zones, zBox, inZone, pourable) };
}

// Pour zones and their stitching vias. Returns { zones, zBox, inZone }.
function pcbPourZones(pb) {
  const { density, P, viaR, cx, cy, poly, maxR, COLS, ROWS, mark, rectFree, W, vias, R } = pb;
  const zones = [];
  const zoneCount = Math.round(P.pour / 100 * (1 + density * 0.6));
  for (let z = 0, tries = 0; z < zoneCount && tries < 200; tries++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * maxR * 1.3;
    const zx = cx + Math.cos(a) * d, zy = cy + Math.sin(a) * d;
    if (!pip({ x: zx, y: zy }, poly)) continue;
    const hw = maxR * (0.15 + R() * 0.3), hh = maxR * (0.15 + R() * 0.3), ch = Math.min(hw, hh) * 0.4;
    zones.push([[zx - hw + ch, zy - hh], [zx + hw - ch, zy - hh], [zx + hw, zy - hh + ch], [zx + hw, zy + hh - ch],
      [zx + hw - ch, zy + hh], [zx - hw + ch, zy + hh], [zx - hw, zy + hh - ch], [zx - hw, zy - hh + ch]]
      .map(([x, y]) => ({ x, y })));
    z++;
  }
  // Inside a pour other than `skip`
  const zBox = zones.map(zp => {
    let a = Infinity, b = -Infinity, e = Infinity, f = -Infinity;
    zp.forEach(p => { a = Math.min(a, p.x); b = Math.max(b, p.x); e = Math.min(e, p.y); f = Math.max(f, p.y); });
    return { x0: a, x1: b, y0: e, y1: f };
  });
  const inZ = (x, y, i) => { const bx = zBox[i]; return x >= bx.x0 && x <= bx.x1 && y >= bx.y0 && y <= bx.y1 && pip({ x, y }, zones[i]); };
  const inZone = (p, skip = -1) => zones.some((_, i) => i !== skip && inZ(p.x, p.y, i));
  if (zones.length) {
    // Stitching vias
    for (let gy = 0; gy < ROWS; gy += 4) for (let gx = (gy / 4) % 2 ? 2 : 0; gx < COLS; gx += 4) {
      const p = W(gx, gy);
      if (inZone(p) && rectFree(gx - 1, gy - 1, gx + 1, gy + 1)) { vias.push({ x: p.x, y: p.y, r: viaR * 0.75, stitch: true }); mark(gx, gy); }
    }
  }
  return { zones, zBox, inZone };
}

// Pour copper is sampled against a keep-out raster instead of knocked out
// with background fills, so nothing is painted over a second layer.
// The raster (KR pixels per grid cell) marks every point closer to a trace, pad, body, via or node than
// the clearance plus half a hatch line. Returns pourable(x, y).
function pcbKeepOut(pb, zBox) {
  const { nodes, OB, traceW, cell, ROWS, GW, X0, Y0, lines, vias, pads, bodies, padR, segDist } = pb;
  if (!zBox.length) return () => false;
  const KR = Math.max(1, Math.min(3, Math.floor(Math.sqrt(16e6 / (GW * ROWS))))), mc = cell / KR;
  const MW = GW * KR, MH = ROWS * KR, keep = new Uint8Array(MW * MH);
  const MI = (mx, my) => my * MW + mx;
  const mIn = (mx, my) => mx >= 0 && my >= 0 && mx < MW && my < MH;
  const clr = traceW * 1.6 + traceW * 0.28 + mc * 0.71;
  let ux0 = Infinity, ux1 = -Infinity, uy0 = Infinity, uy1 = -Infinity;
  zBox.forEach(b => { ux0 = Math.min(ux0, b.x0); ux1 = Math.max(ux1, b.x1); uy0 = Math.min(uy0, b.y0); uy1 = Math.max(uy1, b.y1); });
  // Marks raster pixels in a world box where hit(px, py) holds
  const ko = (x0, y0, x1, y1, hit) => {
    if ((x1 < ux0 - clr || x0 > ux1 + clr)) return;
    if (y1 < uy0 - clr || y0 > uy1 + clr) return;
    const mx0 = Math.floor((x0 - X0) / mc), mx1 = Math.ceil((x1 - X0) / mc);
    const my0 = Math.max(0, Math.floor((y0 - Y0) / mc)), my1 = Math.min(MH - 1, Math.ceil((y1 - Y0) / mc));
    for (let my = my0; my <= my1; my++) for (let mx = mx0; mx <= mx1; mx++) {
      if (!mIn(mx, my)) continue;
      const k = MI(mx, my);
      if (!keep[k] && hit(X0 + mx * mc, Y0 + my * mc)) keep[k] = 1;
    }
  };
  lines.forEach(L => {
    const r = L.w / 2 + clr;
    for (let i = 1; i < L.pts.length; i++) {
      const a = L.pts[i - 1], b = L.pts[i];
      ko(Math.min(a.x, b.x) - r, Math.min(a.y, b.y) - r, Math.max(a.x, b.x) + r, Math.max(a.y, b.y) + r, (x, y) => segDist({ x, y }, a, b) <= r);
    }
  });
  const disc = (x, y, r) => ko(x - r, y - r, x + r, y + r, (px, py) => (px - x) ** 2 + (py - y) ** 2 <= r * r);
  vias.forEach(v => disc(v.x, v.y, v.r + clr));
  nodes.forEach((n, i) => disc(n.x, n.y, padR(i) + clr));
  pads.concat(bodies).forEach(p => ko(p.x - clr, p.y - clr, p.x + p.w + clr, p.y + p.h + clr, () => true));
  if (OB) {
    OB.lines.forEach(L => {
      const r = L.w / 2 + clr;
      for (let i = 1; i < L.pts.length; i++) {
        const a = L.pts[i - 1], b = L.pts[i];
        ko(Math.min(a.x, b.x) - r, Math.min(a.y, b.y) - r, Math.max(a.x, b.x) + r, Math.max(a.y, b.y) + r, (x, y) => obSegDist(x, y, a, b) <= r);
      }
    });
    OB.vias.forEach(v => disc(v.x, v.y, v.r + clr));
    OB.rects.forEach(p => ko(p.x - clr, p.y - clr, p.x + p.w + clr, p.y + p.h + clr, () => true));
  }
  return (x, y) => {
    const mx = Math.round((x - X0) / mc), my = Math.round((y - Y0) / mc);
    return mIn(mx, my) && !keep[MI(mx, my)];
  };
}

// Splits a sampled polyline into runs of good points (closed: joins the ends)
function pcbRuns(pts, ok, closed) {
  const out = [];
  let cur = null;
  pts.forEach((p, i) => {
    if (ok[i]) { (cur || (cur = [])).push(p); }
    else if (cur) { out.push(cur); cur = null; }
  });
  if (cur) {
    if (closed && out.length && ok[0]) out[0] = cur.concat(out[0]);
    else out.push(cur);
  }
  if (closed && !out.length && cur) out.push(cur);
  return out.filter(r => r.length > 1);
}

// Pour outlines (broken where copper passes close) and the 45° hatch.
function pcbPourLines(pb, zones, zBox, inZone, pourable) {
  const { cell, simplify } = pb;
  const pourOutline = [], pourHatch = [];
  if (zones.length) {
    const st = cell * 0.25;
    zones.forEach((zp, zi) => {
      const ring = [];
      zp.forEach((a, i) => {
        const b = zp[(i + 1) % zp.length], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / st));
        for (let k = 0; k < n; k++) ring.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n });
      });
      const ok = ring.map(p => !inZone(p, zi) && pourable(p.x, p.y));
      if (ok.every(Boolean)) { pourOutline.push([...zp, zp[0]]); return; }
      pcbRuns(ring, ok, true).forEach(r => pourOutline.push(simplify(r)));
    });
    // 45° hatch over the union
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    zBox.forEach(b => { x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); y0 = Math.min(y0, b.y0); y1 = Math.max(y1, b.y1); });
    const hs = cell * 0.9, span = y1 - y0;
    const n = Math.max(1, Math.ceil(span * Math.SQRT2 / st));
    for (let x = Math.floor((x0 - span) / hs) * hs; x < x1; x += hs) {
      const pts = [], ok = [];
      for (let k = 0; k <= n; k++) {
        const p = { x: x + span * k / n, y: y0 + span * k / n };
        pts.push(p);
        ok.push(p.x >= x0 - 1 && p.x <= x1 + 1 && inZone(p) && pourable(p.x, p.y));
      }
      pcbRuns(pts, ok, false).forEach(r => {
        const a = r[0], b = r[r.length - 1];
        if (Math.hypot(b.x - a.x, b.y - a.y) > cell * 0.3) pourHatch.push([a, b]);
      });
    }
  }
  return { pourOutline, pourHatch };
}

// Draws the board: pours, traces, vias, pads and chip bodies, node pads.
function pcbDraw(c, pb, pour) {
  const { nodes, traceW, viaR, lines, vias, pads, bodies, padR } = pb;
  const { pourOutline, pourHatch } = pour;
  const { COL_TRACE, COL_PAD, COL_POUR, COL_HOLE } = PCB_COLS;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.shadowBlur = 0;
  const strokeLines = (col, extra) => {
    c.strokeStyle = col;
    lines.forEach(L => {
      if (L.pts.length < 2) return;
      c.lineWidth = L.w + extra;
      c.beginPath(); c.moveTo(L.pts[0].x, L.pts[0].y);
      for (let i = 1; i < L.pts.length; i++) c.lineTo(L.pts[i].x, L.pts[i].y);
      c.stroke();
    });
  };
  const nodePadR = n => padR(nodes.indexOf(n));

  if (pourOutline.length || pourHatch.length) {
    // Outline (broken where copper passes close), then the hatch
    c.strokeStyle = COL_POUR; c.lineWidth = traceW * 1.4;
    c.beginPath();
    pourOutline.forEach(r => { c.moveTo(r[0].x, r[0].y); for (let i = 1; i < r.length; i++) c.lineTo(r[i].x, r[i].y); });
    c.stroke();
    c.lineWidth = traceW * 0.55;
    c.beginPath();
    pourHatch.forEach(([a, b]) => { c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); });
    c.stroke();
  }

  strokeLines(COL_TRACE, 0);

  vias.forEach(v => {
    c.fillStyle = v.stitch ? COL_POUR : COL_TRACE;
    c.beginPath(); c.arc(v.x, v.y, v.r, 0, Math.PI * 2); c.fill();
    c.fillStyle = COL_HOLE;
    c.beginPath(); c.arc(v.x, v.y, v.r * 0.42, 0, Math.PI * 2); c.fill();
  });

  c.fillStyle = COL_PAD;
  pads.forEach(p => c.fillRect(p.x, p.y, p.w, p.h));
  bodies.forEach(b => {
    c.fillStyle = COL_PAD;
    c.fillRect(b.x, b.y, b.w, b.h);
    c.fillStyle = COL_HOLE;
    c.fillRect(b.x + traceW * 1.2, b.y + traceW * 1.2, b.w - traceW * 2.4, b.h - traceW * 2.4);
  });

  nodes.forEach(n => {
    c.fillStyle = COL_PAD;
    c.beginPath(); c.arc(n.x, n.y, nodePadR(n), 0, Math.PI * 2); c.fill();
    c.fillStyle = COL_HOLE;
    c.beginPath(); c.arc(n.x, n.y, viaR * 0.8 * (n.size || 1), 0, Math.PI * 2); c.fill();
  });
}

// Everything copper, for a second PCB layer to route round.
function pcbObstacles(pb, pour) {
  const { nodes, traceW, lines, vias, pads, bodies, nodeZone, padR, zoneSegs } = pb;
  const { pourOutline, pourHatch } = pour;
  // Everything copper, for a second PCB layer to route round (pours count:
  // their hatch is dense enough to block the layer's grid)
  return {
    lines: lines.map(L => ({ pts: L.pts, w: L.w }))
      .concat(pourOutline.map(pts => ({ pts, w: traceW * 1.4 })), pourHatch.map(pts => ({ pts, w: traceW * 0.55 }))),
    vias: vias.map(v => ({ x: v.x, y: v.y, r: v.r })),
    rects: pads.concat(bodies),
    zoneSegs: zoneSegs.map(z => z.slice()),
    padR: nodes.map((_, i) => padR(i)),
    zoneR: nodes.map((n, i) => nodeZone(n, i).r)
  };
}

// Optional silkscreen: part outlines, labels and pin-1 dots.
function pcbSilk(c, pb) {
  const { P, traceW, cell, silk } = pb;
  if (!P.silk) return;
  const { COL_SILK } = PCB_COLS;
  c.strokeStyle = COL_SILK; c.fillStyle = COL_SILK;
  c.lineWidth = traceW * 0.45;
  c.font = `${(cell * 1.5).toFixed(2)}px monospace`;
  c.textAlign = 'left';
  c.textBaseline = 'bottom';
  silk.forEach(k => {
    c.beginPath(); c.rect(k.x, k.y, k.w, k.h); c.stroke();
    c.fillText(k.label, k.x, k.y - cell * 0.3);
    if (k.pin1) { c.beginPath(); c.arc(k.x - cell * 0.6, k.y + cell * 0.2, cell * 0.35, 0, Math.PI * 2); c.fill(); }
  });
}

// True if two polylines cross or touch anywhere except at the given shared points
function polylinesCross(p, q, shared = []) {
  const isShared = pt => shared.some(s => Math.hypot(pt.x - s.x, pt.y - s.y) < 1e-6);
  for (let i = 1; i < p.length; i++) for (let j = 1; j < q.length; j++) {
    const a = p[i - 1], b = p[i], c = q[j - 1], d = q[j];
    const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den, u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
    if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) continue;
    if (!isShared({ x: a.x + t * rx, y: a.y + t * ry })) return true;
  }
  return false;
}

// Offsets an octilinear polyline sideways by d, with mitred corners, so
// parallel bus lanes keep an even spacing through 45° bends.
function offsetPolyline(pts, d) {
  const nrm = (a, b) => { const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: -(b.y - a.y) / l, y: (b.x - a.x) / l }; };
  return pts.map((p, i) => {
    if (i === 0) { const n = nrm(p, pts[1]); return { x: p.x + n.x * d, y: p.y + n.y * d }; }
    if (i === pts.length - 1) { const n = nrm(pts[i - 1], p); return { x: p.x + n.x * d, y: p.y + n.y * d }; }
    const n1 = nrm(pts[i - 1], p), n2 = nrm(p, pts[i + 1]);
    let mx = n1.x + n2.x, my = n1.y + n2.y;
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml; my /= ml;
    const k = d / Math.max(0.3, mx * n1.x + my * n1.y);
    return { x: p.x + mx * k, y: p.y + my * k };
  });
}
