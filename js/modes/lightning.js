// ── LIGHTNING RENDERER ──────────────────────────────────────────────────────
// Bolts jump between the nodes (spanning tree plus extra links at higher
// density): jagged by midpoint displacement, jitter = roughness. Lichtenberg
// discharge grows off the nodes and forks off the bolts: branches wander,
// split into thinner children and stop where they would touch other copper
// (a spatial hash), so the figure fills space without crossing itself.
// Optional glow: wide translucent hsla() strokes along the bolts, which the
// stencil map drops (screen/PNG only), like the nebula's clouds.
// Used by: RENDERERS.
function renderLightning(c, nodes, density, sigma, weight, seed) {
  if (!nodes.length) return;
  let s = Math.floor(seed * 1e6) * 17 + 3;
  const R = () => sr(s++);
  const J = sigma / 100;
  const glow = !S.lightning || S.lightning.glow !== false;
  const RG = fillRegion();
  let cx = 0, cy = 0;
  nodes.forEach(n => { cx += n.x; cy += n.y; });
  cx /= nodes.length; cy /= nodes.length;
  let maxR = 60;
  nodes.forEach(n => { maxR = Math.max(maxR, Math.hypot(n.x - cx, n.y - cy)); });
  const reach = maxR + 170;
  const inArea = (x, y) => RG ? RG.has({ x, y }) : Math.hypot(x - cx, y - cy) <= reach;
  const fill = RG ? RG.scale(reach * 0.8) : 1;

  // Spatial hash of every drawn point
  const CS = 6, DMIN = 3.2 + weight * 0.9, H = new Map();
  const key = (i, j) => i * 73856093 ^ j * 19349663;
  const addPt = (x, y, id) => {
    const k = key(Math.floor(x / CS), Math.floor(y / CS));
    let a = H.get(k); if (!a) H.set(k, a = []);
    a.push(x, y, id);
  };
  const hits = (x, y, id, pid) => {
    const ci = Math.floor(x / CS), cj = Math.floor(y / CS);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const a = H.get(key(ci + di, cj + dj)); if (!a) continue;
      for (let q = 0; q < a.length; q += 3) {
        if (a[q + 2] === id || a[q + 2] === pid) continue;
        if (Math.hypot(x - a[q], y - a[q + 1]) < DMIN) return true;
      }
    }
    return false;
  };
  let nid = 0, budget = 26000;

  // 1. Bolts: midpoint displacement between linked nodes
  const links = [];
  if (nodes.length > 1) {
    const all = [];
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++)
      all.push([Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y), i, j]);
    all.sort((a, b) => a[0] - b[0]);
    const inT = [0];
    while (inT.length < nodes.length) {
      const e = all.find(([, i, j]) => inT.includes(i) !== inT.includes(j));
      if (!e) break;
      links.push(e); inT.push(inT.includes(e[1]) ? e[2] : e[1]);
    }
    all.filter(e => !links.includes(e)).slice(0, Math.floor(density / 3)).forEach(e => links.push(e));
  }
  const rough = 0.14 + J * 0.32;
  const bolts = links.map(([, i, j]) => {
    const A = nodes[i], B = { x: nodes[j].x, y: nodes[j].y };
    let pts = [{ x: A.x, y: A.y }, B];
    for (let pass = 0; pass < 9; pass++) {
      const out = [pts[0]];
      let split = false;
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k], L = Math.hypot(b.x - a.x, b.y - a.y);
        if (L > 13) {
          // Kinks shrink faster than the segments: long straight-ish strokes
          // with sharp turns, rather than an even wiggle
          const d = (R() - 0.5) * 2 * rough * Math.pow(0.78, pass) * L, t = 0.3 + R() * 0.4;
          out.push({ x: a.x + (b.x - a.x) * t - (b.y - a.y) / L * d, y: a.y + (b.y - a.y) * t + (b.x - a.x) / L * d });
          split = true;
        }
        out.push(b);
      }
      pts = out;
      if (!split) break;
    }
    const id = ++nid;
    pts.forEach(p => addPt(p.x, p.y, id));
    return { pts, id, w: weight * (1.5 + R() * 0.7) * ((A.w || 1) + (nodes[j].w || 1)) / 2, a: i, b: j };
  });

  // 2. Lichtenberg branches, grown breadth-first so the trunks claim space first
  const branches = [], queue = [];
  const wander = 0.35 + J * 0.8, splitP = 0.07 + density * 0.011, STEP = 4.5;
  const seedBranch = (x, y, ang, len, w, depth, pid) => queue.push({ x, y, ang, len, w, depth, pid });
  nodes.forEach((n, i) => {
    const k = Math.round((2 + density * 0.55) * Math.sqrt(fill) * (n.size || 1));
    const a0 = R() * Math.PI * 2;
    for (let q = 0; q < k; q++) {
      const ang = a0 + q / k * Math.PI * 2 + (R() - 0.5) * 0.8;
      const r0 = 7 * (n.size || 1);
      seedBranch(n.x + Math.cos(ang) * r0, n.y + Math.sin(ang) * r0, ang,
        (55 + density * 12) * (n.size || 1) * (0.6 + R() * 0.8) * Math.sqrt(fill), weight * (n.w || 1) * (1.1 + R() * 0.5), 0, -1 - i);
    }
  });
  bolts.forEach(b => {
    const forks = Math.round(b.pts.length * (0.02 + density * 0.006));
    for (let q = 0; q < forks; q++) {
      const k = 2 + Math.floor(R() * (b.pts.length - 4));
      if (k < 1 || k >= b.pts.length - 1) continue;
      const p = b.pts[k], nx = b.pts[k + 1];
      const ang = Math.atan2(nx.y - p.y, nx.x - p.x) + (R() < 0.5 ? -1 : 1) * (0.4 + R() * 0.6);
      seedBranch(p.x, p.y, ang, (25 + density * 7) * (0.5 + R()), b.w * 0.55, 1, b.id);
    }
  });
  const grow = () => { while (queue.length && budget > 0) {
    const g = queue.shift(), id = ++nid, pts = [{ x: g.x, y: g.y }];
    let { x, y, ang } = g, travelled = 0;
    const n = Math.max(2, Math.round(g.len / STEP));
    for (let st = 0; st < n && budget > 0; st++) {
      ang += (R() - 0.5) * wander;
      const nx = x + Math.cos(ang) * STEP, ny = y + Math.sin(ang) * STEP;
      if (!inArea(nx, ny)) break;
      travelled += STEP;
      if (travelled > DMIN * 2 && hits(nx, ny, id, g.pid)) break;
      x = nx; y = ny; pts.push({ x, y }); budget--;
      if (g.depth < 7 && g.w > weight * 0.22 && R() < splitP) {
        const left = (n - st) * STEP;
        seedBranch(x, y, ang + (R() < 0.5 ? -1 : 1) * (0.35 + R() * 0.6), left * (0.35 + R() * 0.45), g.w * (0.55 + R() * 0.15), g.depth + 1, id);
      }
    }
    if (pts.length < 2) continue;
    pts.forEach(p => addPt(p.x, p.y, id));
    branches.push({ pts, w: g.w, depth: g.depth, id, pid: g.pid });
  } };
  grow();
  // Fill the boundary: empty spots (on a jittered grid, nearest the nodes
  // first) get a thin branch grown towards them from the closest drawn point,
  // until no spot is further than about a gap from the lightning
  const LF = S.lightning || {};
  if (RG && LF.fill) {
    budget += 24000;
    const GAP = 30 - density * 1.6, CC2 = GAP * 2, coarse = new Map();
    const ck = (i, j) => i * 92821 + j;
    const addC = (x, y, id) => { const k = ck(Math.floor(x / CC2), Math.floor(y / CC2)); let a = coarse.get(k); if (!a) coarse.set(k, a = []); a.push(x, y, id); };
    bolts.forEach(b => b.pts.forEach(p => addC(p.x, p.y, b.id)));
    branches.forEach(b => b.pts.forEach(p => addC(p.x, p.y, b.id)));
    const nearest = (x, y, maxD) => {
      const ci = Math.floor(x / CC2), cj = Math.floor(y / CC2), rings = Math.ceil(maxD / CC2) + 1;
      let best = null, bd = Infinity;
      for (let rr = 0; rr <= rings; rr++) {
        for (let di = -rr; di <= rr; di++) for (let dj = -rr; dj <= rr; dj++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== rr) continue;
          const a = coarse.get(ck(ci + di, cj + dj)); if (!a) continue;
          for (let q = 0; q < a.length; q += 3) { const d = Math.hypot(x - a[q], y - a[q + 1]); if (d < bd) { bd = d; best = [a[q], a[q + 1], a[q + 2]]; } }
        }
        if (best && bd <= rr * CC2) break;
      }
      return best ? { x: best[0], y: best[1], id: best[2], d: bd } : null;
    };
    const spots = [];
    for (let y = RG.y0; y <= RG.y1; y += GAP) for (let x = RG.x0; x <= RG.x1; x += GAP) {
      const p = { x: x + (R() - 0.5) * GAP * 0.8, y: y + (R() - 0.5) * GAP * 0.8 };
      if (!RG.has(p)) continue;
      p.k = Math.min(...nodes.map(n => Math.hypot(p.x - n.x, p.y - n.y)));
      spots.push(p);
    }
    spots.sort((a, b) => a.k - b.k);
    const reachMax = Math.max(RG.x1 - RG.x0, RG.y1 - RG.y0);
    for (const p of spots) {
      if (budget <= 0) break;
      const q = nearest(p.x, p.y, reachMax);
      if (!q || q.d < GAP * 1.25) continue;
      const nb = branches.length;
      seedBranch(q.x, q.y, Math.atan2(p.y - q.y, p.x - q.x), q.d + GAP * (0.5 + R()), weight * (0.55 + R() * 0.35), 3, q.id);
      grow();
      for (let b = nb; b < branches.length; b++) branches[b].pts.forEach(pt => addC(pt.x, pt.y, branches[b].id));
    }
  }

  const poly = pts => { c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); };
  c.lineCap = 'round'; c.lineJoin = 'round';

  if (c.markBolts) c.markBolts({ bolts: bolts.map(b => ({ pts: b.pts, w: b.w, id: b.id, a: b.a, b: b.b })),
    branches: branches.map(b => ({ pts: b.pts, w: b.w, id: b.id, pid: b.pid, depth: b.depth })) });

  // 3. Glow along the bolts and the node trunks (each blob opens with a
  // fillStyle, which splitGlow uses to deal blobs over the symmetry steps)
  if (glow) {
    const halo = (pts, w, a) => {
      c.fillStyle = `hsla(212, 100%, 70%, ${a.toFixed(3)})`;
      c.strokeStyle = `hsla(212, 100%, 70%, ${a.toFixed(3)})`;
      c.globalAlpha = 1;
      for (const f of [9, 5, 2.6]) { c.lineWidth = w * f; poly(pts); c.stroke(); }
    };
    bolts.forEach(b => halo(b.pts, b.w, 0.05));
    branches.forEach(b => { if (b.depth === 0) halo(b.pts, b.w, 0.03); });
    if (c.markGlowEnd) c.markGlowEnd();
  }

  // 4. Branches, thinning along their length (thinnest first, trunks on top)
  branches.slice().sort((a, b) => a.w - b.w).forEach(b => {
    c.strokeStyle = b.depth > 2 ? '#7fa6e8' : '#a9c8ff';
    const parts = Math.min(3, Math.floor(b.pts.length / 3) + 1);
    for (let p = 0; p < parts; p++) {
      const i0 = Math.floor(p * (b.pts.length - 1) / parts), i1 = Math.floor((p + 1) * (b.pts.length - 1) / parts);
      if (i1 <= i0) continue;
      c.globalAlpha = 0.95 - p * 0.15 - Math.min(b.depth, 5) * 0.05;
      c.lineWidth = b.w * (1 - p * 0.22);
      poly(b.pts.slice(i0, i1 + 1)); c.stroke();
    }
  });

  // 5. Bolts: bright core on a blue edge
  bolts.forEach(b => {
    c.globalAlpha = 0.9; c.strokeStyle = '#8fb8ff'; c.lineWidth = b.w * 1.7; poly(b.pts); c.stroke();
    c.globalAlpha = 1; c.strokeStyle = '#f2f7ff'; c.lineWidth = b.w * 0.7; poly(b.pts); c.stroke();
  });

  // 6. Strike points at the nodes
  nodes.forEach(n => {
    const r = 6 * (n.size || 1);
    c.globalAlpha = 1; c.fillStyle = '#f2f7ff';
    c.beginPath(); c.arc(n.x, n.y, Math.max(weight * 1.4, r * 0.5), 0, Math.PI * 2); c.fill();
    c.globalAlpha = 0.75; c.strokeStyle = '#a9c8ff'; c.lineWidth = weight * 0.8;
    c.beginPath(); c.arc(n.x, n.y, r * 1.6, 0, Math.PI * 2); c.stroke();
  });
  c.globalAlpha = 1;
}
