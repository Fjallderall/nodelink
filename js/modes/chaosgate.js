// ── Pillar symbols (Geometrical Schematics, style "pillar"/"mixed") ──
// After a hand-drawn pillar-corner sheet: glyphs built on a fine grid from a heavy
// stem, rungs (T and cross), close parallel stacks (≡), hooks off line ends,
// and short serif ticks on free ends (⊢ ⊣, H shapes). Strokes vary in weight;
// jitter tilts and nudges their ends for a hand-cut look. Each glyph can sit
// in a cartouche: a convex frame with chamfered corners, often tilted, and
// sometimes paired with a mirrored twin.
// Used by: renderChaosgate, for glyph style pillar or mixed, frames or no links.
function pillarGlyph(c, hw, hh, R, weight, sigma) {
  const J = sigma / 100, G = 8, gx = hw * 2 / G, gy = hh * 2 / G;
  const occ = new Int16Array((G + 1) * (G + 1));
  const strokes = [];
  const pts = st => { const o = []; for (let i = st.a; i <= st.b; i++) o.push(st.o === 'h' ? [i, st.k] : [st.k, i]); return o; };
  const ok = (st, at) => st.a >= 0 && st.b <= G && st.k >= 0 && st.k <= G && st.b - st.a >= 1 &&
    pts(st).every(([x, y]) => !occ[y * (G + 1) + x] || (at && at[0] === x && at[1] === y));
  const put = st => { strokes.push(st); pts(st).forEach(([x, y]) => { occ[y * (G + 1) + x] = strokes.length; }); return true; };
  const ri = n => Math.floor(R() * n);
  for (let attempt = 0; attempt < 12; attempt++) {
  if (attempt) { strokes.length = 0; occ.fill(0); }
  // Heavy stem
  const o0 = R() < 0.5 ? 'h' : 'v';
  put({ o: o0, k: 2 + ri(G - 3), a: ri(2), b: G - ri(3), w: weight * (1.7 + R() * 0.6) });
  const target = 7 + ri(5) + Math.floor(J * 2);
  for (let tries = 0; tries < 140 && strokes.length < target; tries++) {
    const p = strokes[ri(strokes.length)], perp = p.o === 'h' ? 'v' : 'h', t = R();
    const w = weight * (0.8 + R() * 1.1);
    if (t < 0.5) {                                               // rung off a point of p
      const at = p.a + ri(p.b - p.a + 1), both = R() < 0.3, len = 2 + ri(4), dir = R() < 0.5 ? -1 : 1;
      const kk = at, base = p.k;
      const st = both ? { o: perp, k: kk, a: base - 1 - ri(3), b: base + 1 + ri(3), w }
        : dir > 0 ? { o: perp, k: kk, a: base, b: base + len, w } : { o: perp, k: kk, a: base - len, b: base, w };
      const atPt = p.o === 'h' ? [kk, base] : [base, kk];
      if (ok(st, atPt)) put(st);
    } else if (t < 0.8) {                                        // parallel stack next to p
      const off = (R() < 0.5 ? -1 : 1) * (1 + ri(2)), sh = ri(3) - 1;
      const st = { o: p.o, k: p.k + off, a: Math.max(0, p.a + sh + ri(2)), b: Math.min(G, p.a + sh + 2 + ri(p.b - p.a + 1)), w: R() < 0.5 ? p.w : w };
      if (ok(st, null)) put(st);
    } else {                                                     // hook off an end of p
      const end = R() < 0.5 ? p.a : p.b, len = 1 + ri(2), dir = R() < 0.5 ? -1 : 1;
      const st = dir > 0 ? { o: perp, k: end, a: p.k, b: p.k + len, w: p.w * 0.9 } : { o: perp, k: end, a: p.k - len, b: p.k, w: p.w * 0.9 };
      if (ok(st, p.o === 'h' ? [end, p.k] : [p.k, end])) put(st);
    }
  }
  if (!glyphPinwheel(strokes.map(st => st.o === 'h' ? [st.a, st.k, st.b, st.k] : [st.k, st.a, st.k, st.b]))) break;
  }
  const X = i => -hw + i * gx, Y = j => -hh + j * gy;
  const jit = () => (R() - 0.5) * J;
  c.lineCap = 'butt';
  strokes.forEach(st => {
    const cell = st.o === 'h' ? gx : gy, cross = st.o === 'h' ? gy : gx;
    // ends nudged along the stroke, and each end a little sideways (tilt)
    const e0 = jit() * 0.5 * cell, e1 = jit() * 0.5 * cell, s0 = jit() * 0.18 * cross, s1 = jit() * 0.18 * cross;
    let ax, ay, bx, by;
    if (st.o === 'h') { ax = X(st.a) + e0; bx = X(st.b) + e1; ay = Y(st.k) + s0; by = Y(st.k) + s1; }
    else { ay = Y(st.a) + e0; by = Y(st.b) + e1; ax = X(st.k) + s0; bx = X(st.k) + s1; }
    c.lineWidth = st.w;
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
    // Serif ticks on free ends (an end no other stroke touches)
    [[st.a, ax, ay], [st.b, bx, by]].forEach(([i, ex, ey]) => {
      const [gxI, gyI] = st.o === 'h' ? [i, st.k] : [st.k, i];
      const touched = strokes.some(q => q !== st && pts(q).some(([x, y]) => x === gxI && y === gyI));
      if (touched || R() > 0.42) return;
      const hl = (0.45 + R() * 0.4) * cross;
      c.lineWidth = Math.max(weight * 0.7, st.w * 0.75);
      c.beginPath();
      if (st.o === 'h') { c.moveTo(ex, ey - hl); c.lineTo(ex, ey + hl); } else { c.moveTo(ex - hl, ey); c.lineTo(ex + hl, ey); }
      c.stroke();
    });
  });
}

// Cartouche outline in local coords: a box (or tapered box, or kite) with
// chamfered corners. mirror flips it left–right for a paired twin.
function pillarFrame(hw, hh, R, mirror) {
  const t = R();
  let P;
  if (t < 0.14) { P = [{ x: 0, y: -hh * 1.15 }, { x: hw * 1.1, y: -hh * 0.1 }, { x: hw * 0.45, y: hh }, { x: -hw * 0.45, y: hh }, { x: -hw * 1.1, y: -hh * 0.1 }]; P.kite = true; }
  else {
    const tp = t < 0.3 ? 0.75 + R() * 0.15 : 1;                 // tapered top
    P = [{ x: -hw * tp, y: -hh }, { x: hw * tp, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }];
    const nC = R() < 0.2 ? 0 : R() < 0.65 ? 1 : 2, first = Math.floor(R() * 4);
    const cut = new Set([first, (first + 1 + Math.floor(R() * 3)) % 4].slice(0, nC));
    const out = [];
    P.forEach((p, i) => {
      if (!cut.has(i)) { out.push(p); return; }
      const pv = P[(i + 3) % 4], nx = P[(i + 1) % 4], a = 0.22 + R() * 0.3, b = 0.22 + R() * 0.3;
      out.push({ x: p.x + (pv.x - p.x) * a, y: p.y + (pv.y - p.y) * a }, { x: p.x + (nx.x - p.x) * b, y: p.y + (nx.y - p.y) * b });
    });
    P = out;
  }
  const Q = mirror ? P.map(p => ({ x: -p.x, y: p.y })).reverse() : P;
  Q.kite = !!P.kite;
  return Q;
}

// Routing lines stop at the symbols instead of being masked by a filled shape
// (symbols stay transparent). holes: convex polygons [{x,y}…] in world space.
function strokeAround(c, pts, holes) {
  const hs = holes;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y;
    const cut = [];
    hs.forEach(h => {
      let area = 0;
      for (let k = 0; k < h.length; k++) { const p = h[k], q = h[(k + 1) % h.length]; area += p.x * q.y - q.x * p.y; }
      const sg = area > 0 ? 1 : -1;
      let t0 = 0, t1 = 1;
      for (let k = 0; k < h.length && t0 < t1; k++) {
        const p = h[k], q = h[(k + 1) % h.length];
        const nx = -(q.y - p.y) * sg, ny = (q.x - p.x) * sg;    // inward normal
        const num = (a.x - p.x) * nx + (a.y - p.y) * ny, den = dx * nx + dy * ny;
        if (Math.abs(den) < 1e-12) { if (num < 0) t1 = -1; continue; }
        const t = -num / den;
        if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
      }
      if (t1 > t0) cut.push([t0, t1]);
    });
    cut.sort((u, v) => u[0] - v[0]);
    let t = 0;
    const seg = (u, v) => { if (v - u > 1e-6) { c.moveTo(a.x + dx * u, a.y + dy * u); c.lineTo(a.x + dx * v, a.y + dy * v); } };
    cut.forEach(([u, v]) => { seg(t, Math.min(u, 1)); t = Math.max(t, v); });
    seg(t, 1);
  }
}

// nodesNow: the nodes as drawn; while drifting the layout is placed from
// CHAOS_BASE (the real positions) and bent to nodesNow. CH = S.chaos.
function renderChaosPillar(c, nodesNow, density, sigma, weight, seed, CH) {
  let s = Math.floor(seed * 1e6) * 29 + 5;
  const R = () => sr(s++);
  const base = CHAOS_BASE && CHAOS_BASE.length === nodesNow.length ? CHAOS_BASE : null;
  const nodes = base || nodesNow;
  let cx = 0, cy = 0;
  nodes.forEach(n => { cx += n.x; cy += n.y; });
  cx /= nodes.length || 1; cy /= nodes.length || 1;
  let maxR = 0;
  nodes.forEach(n => { const d = Math.hypot(n.x - cx, n.y - cy); if (isFinite(d) && d > maxR) maxR = d; });
  const mapR = Math.max(maxR * 1.5, 250);
  const RG = fillRegion();
  const COL_LINE = 'rgba(228, 221, 208, 0.4)', COL_GLYPH = '#e4ddd0', COL_FRAME = 'rgba(228, 221, 208, 0.6)';

  // 1. Cells: node glyphs first, then extras that don't overlap (some in pairs)
  const cells = [];
  const pickAng = () => { if (R() >= 0.55) { R(); R(); } return 0; };   // always upright (same random draws as before)
  const free = (x, y, rc) => cells.every(q => Math.hypot(q.x - x, q.y - y) > (q.rc + rc) * 0.92);
  const mk = (x, y, r, ang, extra) => {
    const hw = r * (0.85 + R() * 0.35), hh = r * (0.85 + R() * 0.35);
    return { x, y, hw, hh, rc: Math.hypot(hw, hh) * 0.85, ang, ...extra };
  };
  nodes.forEach(n => cells.push(mk(n.x, n.y, (26 + R() * 14) * (n.size || 1), pickAng(), { w: n.w || 1, main: true })));
  // Inside a boundary an extra cell sits wholly inside it: once all are
  // placed, moved towards the middle until its box fits (after the layout and
  // without random draws, so every other cell and glyph stays the same)
  const boxIn = q => [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([u, v]) => RG.has({ x: q.x + u * q.hw, y: q.y + v * q.hh }));
  const inRegion = q => {
    const mx = (RG.x0 + RG.x1) / 2, my = (RG.y0 + RG.y1) / 2;
    for (let t = 0; t < 30 && !boxIn(q); t++) { q.x += (mx - q.x) * 0.06; q.y += (my - q.y) * 0.06; }
  };
  const want = Math.round(density * 4 * (RG ? RG.scale(mapR * 0.9) : 1));
  for (let tries = 0, made = 0; made < want && tries < want * 8; tries++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * mapR * 0.9;
    const gp = RG ? regionSample(RG, R) : { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
    const cl = mk(gp.x, gp.y, 18 + R() * 16, pickAng(), { w: 1 });
    if (!free(cl.x, cl.y, cl.rc)) continue;
    cells.push(cl); made++;
    if (R() < 0.4) {                                             // mirrored twin beside it
      const gap = cl.hw * 0.25, dx = Math.cos(cl.ang) * (cl.hw * 2 + gap), dy = Math.sin(cl.ang) * (cl.hw * 2 + gap);
      const tw = { ...cl, x: cl.x + dx, y: cl.y + dy, twinOf: cl };
      if (free(tw.x, tw.y, tw.rc) && (!RG || RG.has(tw))) { cells.push(tw); made++; }
    }
  }
  if (RG) cells.forEach(q => { if (!q.main) inRegion(q); });
  cells.forEach(q => {
    q.style = CH.style === 'classic' ? 'classic' : CH.style === 'pillar' ? 'pillar' : (R() < 0.65 ? 'pillar' : 'classic');
    q.frame = pillarFrame(q.hw, q.hh, R, !!q.twinOf);
    q.gs = Math.floor(R() * 1e6);
  });
  // Drifting: move the cells with the nodes (neighbours still picked from where
  // they were laid out, so the links don't jump)
  cells.forEach(q => { q.bx = q.x; q.by = q.y; });
  if (base) {
    const wf = warpOffset(base, nodesNow);
    cells.forEach(q => { const [dx, dy] = wf(q.bx, q.by); q.x = q.bx + dx; q.y = q.by + dy; });
  }

  // 2. Orthogonal routing between neighbours (behind the cells)
  c.lineCap = 'square'; c.lineJoin = 'miter';
  const links = CH.links !== false;
  c.strokeStyle = COL_LINE; c.lineWidth = weight * 0.8;
  const holes = links ? cells.map(q => q.frame.map(p => ({ x: q.x + p.x, y: q.y + p.y }))) : null;
  if (links) c.beginPath();
  if (links) cells.forEach((g, i) => {
    const ds = cells.map((q, j) => ({ j, d: i === j ? Infinity : Math.hypot(q.bx - g.bx, q.by - g.by) })).sort((a, b) => a.d - b.d);
    const k = 1 + Math.floor(R() * 2);
    for (let m = 0; m < k && m < ds.length - 1; m++) {
      const t = cells[ds[m].j], tx = t.x;
      let mid = R() > 0.5 ? { x: tx, y: g.y } : { x: g.x, y: t.y };
      // Inside a boundary an elbow can fall outside it: take the other one
      if (RG && !RG.has(mid)) { const alt = mid.x === tx && mid.y === g.y ? { x: g.x, y: t.y } : { x: tx, y: g.y }; if (RG.has(alt)) mid = alt; }
      strokeAround(c, [{ x: g.x, y: g.y }, mid, { x: tx, y: t.y }], holes);
    }
  });
  if (links) c.stroke();

  // 3. Cells: mask, frame, glyph (in the cell's own rotated frame)
  cells.forEach((q, qi) => {
    if (q.main) c.own(qi);                         // the first cells are the nodes' own (in node order)
    c.save();
    c.translate(q.x, q.y); c.rotate(q.ang);
    if (CH.frames) {
      c.strokeStyle = COL_FRAME; c.lineWidth = weight * 0.6; c.lineJoin = 'miter';
      c.beginPath(); c.moveTo(q.frame[0].x, q.frame[0].y);
      for (let i = 1; i < q.frame.length; i++) c.lineTo(q.frame[i].x, q.frame[i].y);
      c.closePath(); c.stroke();
    }
    const gw = weight * (q.w || 1);
    // Mixed: each swap also re-picks pillar or classic (same 65/35 odds as the
    // layout); swap 0 keeps the cell's own style
    const styleOf = sd => CH.style !== 'mixed' || sd === q.gs ? q.style : (sr(sd * 0.53 + 7) < 0.65 ? 'pillar' : 'classic');
    glyphCycle(c, q.gs, sd => {
      if (styleOf(sd) === 'pillar') {
        let gsd = sd;
        c.strokeStyle = COL_GLYPH;
        pillarGlyph(c, q.hw * (q.frame.kite ? 0.58 : 0.72), q.hh * (q.frame.kite ? 0.58 : 0.72), () => sr(gsd++), gw, sigma);
      } else drawChaosGlyph(c, 0, 0, Math.min(q.hw, q.hh) * 0.78, sd, gw, sigma, COL_GLYPH);
    });
    c.restore();
    if (q.main) c.own(-1);
  });
}

// ── GEOMETRICAL SCHEMATICS (CHAOSGATE) ─────────────────────────────────────
// Classic glyphs without frames: the original renderer (old designs keep
// their look); any other style or frames: renderChaosPillar
// Used by: RENDERERS. drawChaosGlyph is shared with Arcane and the pillars.
function renderChaosgate(c, nodes, density, sigma, weight, seed) {
    const CH = S.chaos || { style: 'classic', frames: false, links: true };
    if (CH.style !== 'classic' || CH.frames || CH.links === false) return renderChaosPillar(c, nodes, density, sigma, weight, seed, CH);
    let s = seed * 777;
    let cx = 0, cy = 0;
    if (nodes.length > 0) {
        nodes.forEach(n => { cx += n.x; cy += n.y; });
        cx /= nodes.length; cy /= nodes.length;
    }

    let maxR = 0;
    nodes.forEach(n => {
        const d = Math.hypot(n.x - cx, n.y - cy);
        if (isFinite(d) && d > maxR) maxR = d;
    });
    let mapR = Math.max(maxR * 1.5, 250);

    const COL_LINE = 'rgba(228, 221, 208, 0.4)'; // Faint bone
    const COL_GLYPH = '#e4ddd0'; // Solid bone

    c.lineCap = 'square';
    c.lineJoin = 'miter';

    // 1. Generate glyph points
    let glyphs = [];
    nodes.forEach(n => glyphs.push({ x: n.x, y: n.y, r: (25 + sr(s++)*15) * (n.size || 1), w: n.w || 1, isMain: true }));

    const RG = fillRegion();
    let numExtra = Math.round(density * 5 * (RG ? RG.scale(mapR * 0.9) : 1));
    for (let i = 0; i < numExtra; i++) {
        let a = sr(s++) * Math.PI * 2;
        let d = Math.sqrt(sr(s++)) * mapR * 0.9;
        const gp = RG ? regionSample(RG, () => sr(s++)) : { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
        glyphs.push({
            x: gp.x,
            y: gp.y,
            r: 12 + sr(s++) * 18,
            isMain: false
        });
    }

    // 3. Connect glyphs with orthogonal lines
    c.strokeStyle = COL_LINE;
    c.lineWidth = weight * 0.8;
    const holes = glyphs.map(g => { const h = g.r * 1.2; return [{ x: g.x - h, y: g.y - h }, { x: g.x + h, y: g.y - h }, { x: g.x + h, y: g.y + h }, { x: g.x - h, y: g.y + h }]; });
    c.beginPath();
    for (let i = 0; i < glyphs.length; i++) {
        // connect to 1 or 2 nearest neighbors
        let dists = [];
        for (let j = 0; j < glyphs.length; j++) {
            if (i !== j) dists.push({ j: j, d: Math.hypot(glyphs[j].x - glyphs[i].x, glyphs[i].y - glyphs[j].y) });
        }
        dists.sort((a,b) => a.d - b.d);

        let connects = 1 + Math.floor(sr(s++) * 2);
        for(let k = 0; k < connects && k < dists.length; k++) {
            let t = glyphs[dists[k].j];
            // Manhattan routing, stopping at the symbols
            const g0 = glyphs[i];
            let mid = sr(s++) > 0.5 ? { x: t.x, y: g0.y } : { x: g0.x, y: t.y };
            // Inside a boundary an elbow can fall outside it: take the other one
            if (RG && !RG.has(mid)) { const alt = mid.x === t.x && mid.y === g0.y ? { x: g0.x, y: t.y } : { x: t.x, y: g0.y }; if (RG.has(alt)) mid = alt; }
            strokeAround(c, [{ x: g0.x, y: g0.y }, mid, { x: t.x, y: t.y }], holes);
        }
    }
    c.stroke();

    // 4. Draw the actual glyphs over the lines
    glyphs.forEach((g, idx) => {
        if (g.isMain) c.own(idx);
        glyphCycle(c, seed * 202 + idx * 10, sd => drawChaosGlyph(c, g.x, g.y, g.r, sd, weight * (g.w || 1), sigma, COL_GLYPH));
        if (g.isMain) c.own(-1);
    });
}

// One glyph centred on (cx, cy) in a circle of radius r; seedOff picks the
// glyph (glyphCycle passes the swapped seed); sigma tilts and nudges it.
function drawChaosGlyph(c, cx, cy, r, seedOff, weight, sigma, color) {
    let s = seedOff;
    // Built as grid segments first (same random stream and path order as
    // before, so existing designs keep their glyphs), checked for a pinwheel,
    // and regenerated further along the stream if it is one
    let gridDim, segs;
    for (let attempt = 0; attempt < 12; attempt++) {
        segs = [];
        gridDim = 4 + Math.floor(sr(s++) * 3); // 4x4 to 6x6 grid
        const isVert = sr(s++) > 0.5;
        const spinePos = 1 + Math.floor(sr(s++) * (gridDim - 2));
        const spineStart = 0, spineEnd = gridDim;
        // [along, across] in the spine's frame, mapped to x/y below
        const seg = (a1, c1, a2, c2) => segs.push(isVert ? [c1, a1, c2, a2] : [a1, c1, a2, c2]);
        seg(spineStart, spinePos, spineEnd, spinePos);
        segs.spine = spinePos; segs.isVert = isVert; segs.br = [];
        const numBranches = 3 + Math.floor(sr(s++) * (sigma / 20));
        for (let i = 0; i < numBranches; i++) {
            const bPos = spineStart + 1 + Math.floor(sr(s++) * (spineEnd - spineStart - 1));
            const bLen = 1 + Math.floor(sr(s++) * 2);
            const bDir = sr(s++) > 0.5 ? 1 : -1;
            const end = spinePos + bLen * bDir;
            seg(bPos, spinePos, bPos, end);
            const b = [bPos, bLen, bDir, null];
            if (sr(s++) > 0.4) {                                  // sub-branch
                const subDir = sr(s++) > 0.5 ? 1 : -1;
                const subLen = 1 + Math.floor(sr(s++) * 1.5);
                seg(bPos, end, bPos + subLen * subDir, end);
                b[3] = [subLen, subDir];
            }
            segs.br.push(b);
        }
        if (!glyphPinwheel(segs)) break;
    }
    drawChaosGlyph.last = segs;
    c.save();
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = weight * 1.5;
    c.lineCap = 'square';
    c.lineJoin = 'miter';
    const cellSize = (r * 1.6) / gridDim;
    const startX = cx - (gridDim * cellSize) / 2;
    const startY = cy - (gridDim * cellSize) / 2;
    // Same arithmetic as the original drawing (exact same coordinates)
    c.beginPath();
    const sp = segs.spine, isVert = segs.isVert;
    if (isVert) { c.moveTo(startX + sp * cellSize, startY + 0 * cellSize); c.lineTo(startX + sp * cellSize, startY + gridDim * cellSize); }
    else { c.moveTo(startX + 0 * cellSize, startY + sp * cellSize); c.lineTo(startX + gridDim * cellSize, startY + sp * cellSize); }
    segs.br.forEach(([bPos, bLen, bDir, sub]) => {
        if (isVert) {
            const currentX = startX + sp * cellSize, currentY = startY + bPos * cellSize, endX = currentX + bLen * bDir * cellSize;
            c.moveTo(currentX, currentY); c.lineTo(endX, currentY);
            if (sub) { c.moveTo(endX, currentY); c.lineTo(endX, currentY + sub[0] * sub[1] * cellSize); }
        } else {
            const currentX = startX + bPos * cellSize, currentY = startY + sp * cellSize, endY = currentY + bLen * bDir * cellSize;
            c.moveTo(currentX, currentY); c.lineTo(currentX, endY);
            if (sub) { c.moveTo(currentX, endY); c.lineTo(currentX + sub[0] * sub[1] * cellSize, endY); }
        }
    });
    c.stroke();
    c.restore();
}
