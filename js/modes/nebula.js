// ── NEBULA RENDERER ─────────────────────────────────────────────────────────
// Gas filaments are streamlines of a flow field: every node is a swirl
// (alternating spin) that also breathes outward a little, bent by seeded
// value noise (jitter = turbulence). Star dust thickens near the nodes; the
// nodes and a few bright stars get cross flares. Optional glow: soft clouds of
// stacked translucent discs, coloured with hsla() so the stencil map drops
// them (they'd only make blobs in a stencil or cut file).
// Used by: RENDERERS. Calls c.markGlowEnd() so drawSymmetric can split the glow.
// Phase 45: split into nebSetup / nebField and one function per layer (glow,
// filaments, dust, flares); the random draws stay in the same order.
// Seeded value noise: returns noise(x, y) in 0..1
function nebNoise(seed) {
  const ns = Math.floor(seed * 1e6) % 9973;
  const hash = (x, y) => { const h = Math.sin(x * 127.1 + y * 311.7 + ns * 74.7) * 43758.5453; return h - Math.floor(h); };
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const xa = xi, xb = xi + 1;
    const a = hash(xa, yi), b = hash(xb, yi), c2 = hash(xa, yi + 1), d = hash(xb, yi + 1);
    return a + (b - a) * u + (c2 - a) * v + (a - b - c2 + d) * u * v;
  };
}

// The flow field: every swirl turns the point, the noise bends the result
function nebField(sw, noise, J) {
  return (x, y) => {
    let vx = 0, vy = 0;
    for (const n of sw) {
      const dx = x - n.x, dy = y - n.y, r2 = dx * dx + dy * dy, r = Math.sqrt(r2) || 1;
      const f = n.r * n.r / (r2 + n.r * n.r);
      vx += (-dy / r * n.spin + dx / r * 0.35) * f;
      vy += (dx / r * n.spin + dy / r * 0.35) * f;
    }
    const a = (noise(x / 140, y / 140) - 0.5) * Math.PI * (0.4 + J * 2.2) + (noise(x / 45 + 50, y / 45) - 0.5) * J * 1.2;
    const ca = Math.cos(a), sa = Math.sin(a);
    return { x: vx * ca - vy * sa, y: vx * sa + vy * ca };
  };
}

// Everything the layers share: the swirls (one per node: spin sign, size,
// colour family; one R() each), the flow field, the area and the random stream R
function nebSetup(nodes, sigma, seed, R) {
  const J = sigma / 100;
  let cx = 0, cy = 0;
  nodes.forEach(n => { cx += n.x; cy += n.y; });
  cx /= nodes.length || 1; cy /= nodes.length || 1;
  let maxR = 60;
  nodes.forEach(n => { maxR = Math.max(maxR, Math.hypot(n.x - cx, n.y - cy)); });
  const RG = fillRegion();
  const reach = maxR + 220;
  const HUES = [[300, '#e98bd8'], [190, '#7fe3e8'], [265, '#b59cff'], [20, '#ffb38a'], [330, '#ff8fb1'], [170, '#8ff0c4']];
  const sw = nodes.map((n, i) => {
    const h = HUES[(i + Math.floor(seed * 1e6)) % HUES.length];
    return { x: n.x, y: n.y, spin: i % 2 ? -1 : 1, r: 90 * (n.size || 1) * (0.8 + R() * 0.6), w: n.w || 1, hue: h[0], col: h[1] };
  });
  return {
    R, sw, cx, cy, RG, reach,
    fill: RG ? RG.scale(reach * 0.8) : 1,
    inArea: (x, y) => RG ? x > RG.x0 - 30 && x < RG.x1 + 30 && y > RG.y0 - 30 && y < RG.y1 + 30 : Math.hypot(x - cx, y - cy) <= reach,
    field: nebField(sw, nebNoise(seed), J),
    // Nearest swirl, for colour
    near: (x, y) => { let b = sw[0], bd = Infinity; for (const n of sw) { const d = (x - n.x) ** 2 + (y - n.y) ** 2; if (d < bd) { bd = d; b = n; } } return b; },
    gauss: () => { let u = 0; for (let k = 0; k < 4; k++) u += R(); return (u - 2) / 0.577; },
  };
}

// 1. Glow clouds (screen and PNG only)
function nebGlow(c, N, density) {
  const { R, sw, gauss } = N;
  for (const n of sw) {
    const blobs = 10 + density * 3;
    for (let k = 0; k < blobs; k++) {
      const x = n.x + gauss() * n.r * 0.6, y = n.y + gauss() * n.r * 0.6;
      const rr = n.r * (0.25 + R() * 0.55);
      // Concentric layers: soft falloff instead of a hard-edged disc
      const hue = (n.hue + (R() - 0.5) * 40).toFixed(0), li = (45 + R() * 20).toFixed(0), al = 0.012 + R() * 0.016;
      c.globalAlpha = 1;
      c.fillStyle = `hsla(${hue}, 85%, ${li}%, ${al.toFixed(3)})`;
      for (const f of [1, 0.82, 0.66, 0.5, 0.36, 0.24]) { c.beginPath(); c.arc(x, y, rr * f, 0, Math.PI * 2); c.fill(); }
    }
  }
  if (c.markGlowEnd) c.markGlowEnd();
}

// One streamline from a start point: steps along the field until it stalls or leaves the area
function nebStreamline(N, x, y, len, step) {
  const { field, inArea } = N;
  const pts = [{ x, y }];
  for (let i = 0; i < len; i++) {
    const v = field(x, y), m = Math.hypot(v.x, v.y);
    if (m < 0.02) break;
    x += v.x / m * step; y += v.y / m * step;
    if (!inArea(x, y)) break;
    pts.push({ x, y });
  }
  return pts;
}

// 2. Filaments
function nebFilaments(c, N, density, weight) {
  const { R, sw, RG, fill, gauss, near } = N;
  const lines = Math.round((30 + density * 26) * Math.sqrt(fill));
  const step = 4;
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (let k = 0; k < lines; k++) {
    const n = sw[Math.floor(R() * sw.length)];
    let x = n.x + gauss() * n.r * 0.7, y = n.y + gauss() * n.r * 0.7;
    if (RG && R() < 0.45) { const q = regionSample(RG, R); x = q.x; y = q.y; }   // fill the boundary too
    const len = 18 + Math.floor(R() * (25 + density * 6));
    const pts = nebStreamline(N, x, y, len, step);
    if (pts.length < 4) continue;
    const nn = near(pts[0].x, pts[0].y);
    c.strokeStyle = nn.col;
    c.lineWidth = weight * nn.w * (0.35 + R() * 0.9);
    // Taper: a faint full stroke, then a stronger middle part
    c.globalAlpha = 0.22 + R() * 0.2;
    c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.stroke();
    const a = Math.floor(pts.length * 0.2), b = Math.ceil(pts.length * 0.8);
    c.globalAlpha = 0.5 + R() * 0.45;
    c.beginPath(); c.moveTo(pts[a].x, pts[a].y);
    for (let i = a + 1; i < b; i++) c.lineTo(pts[i].x, pts[i].y);
    c.stroke();
  }
}

// 3. Star dust: denser near the nodes, a scattering everywhere
function nebDust(c, N, density, weight) {
  const { R, sw, RG, fill, gauss, cx, cy, reach } = N;
  const stars = Math.round((80 + density * 45) * fill);
  c.fillStyle = '#f4f0ff';
  for (let k = 0; k < stars; k++) {
    let x, y;
    if (R() < 0.6) { const n = sw[Math.floor(R() * sw.length)]; x = n.x + gauss() * n.r * 0.8; y = n.y + gauss() * n.r * 0.8; }
    else if (RG) { const q = regionSample(RG, R); x = q.x; y = q.y; }
    else { const a = R() * Math.PI * 2, r = Math.sqrt(R()) * reach; x = cx + Math.cos(a) * r; y = cy + Math.sin(a) * r; }
    const big = R();
    c.globalAlpha = 0.35 + R() * 0.65;
    const sr2 = weight * (big > 0.97 ? 1.6 : big > 0.85 ? 0.95 : 0.55);
    c.beginPath();
    if (c.markStar) c.markStar({ x, y, r: sr2, col: '#f4f0ff', kind: 'star', sp: 0, dim: false });
    c.arc(x, y, sr2, 0, Math.PI * 2); c.fill();
  }
}

// A cross flare: long cross, short diagonal cross, white core
function nebFlare(c, weight, x, y, r, col, kind = 'star') {
  c.strokeStyle = col; c.fillStyle = '#ffffff';
  c.globalAlpha = 0.9; c.lineWidth = weight * 0.7;
  c.beginPath();
  if (c.markStar) c.markStar({ x, y, r: Math.max(weight * 1.1, r * 0.09), col: '#ffffff', kind, sp: r, dim: false });
  c.moveTo(x - r, y); c.lineTo(x + r, y); c.moveTo(x, y - r); c.lineTo(x, y + r); c.stroke();
  c.globalAlpha = 0.6; c.lineWidth = weight * 0.45;
  const d = r * 0.42;
  c.beginPath(); c.moveTo(x - d, y - d); c.lineTo(x + d, y + d); c.moveTo(x - d, y + d); c.lineTo(x + d, y - d); c.stroke();
  c.globalAlpha = 1;
  c.beginPath(); c.arc(x, y, Math.max(weight * 1.1, r * 0.09), 0, Math.PI * 2); c.fill();
}

// 4. Flared stars: every node, plus a few bright ones
function nebFlares(c, N, nodes, density, weight) {
  const { R, sw, RG, fill, cx, cy, reach } = N;
  sw.forEach(n => {
    nebFlare(c, weight, n.x, n.y, 26 * (nodes[sw.indexOf(n)].size || 1), n.col, 'node');
    c.globalAlpha = 0.7; c.strokeStyle = n.col; c.lineWidth = weight * 0.6;
    c.beginPath(); c.arc(n.x, n.y, 9 * (nodes[sw.indexOf(n)].size || 1), 0, Math.PI * 2); c.stroke();
  });
  const bright = Math.round((2 + Math.floor(density / 2)) * fill);
  for (let k = 0; k < bright; k++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * reach * 0.85;
    const q = RG ? regionSample(RG, R) : { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    nebFlare(c, weight, q.x, q.y, 8 + R() * 10, '#e8e4ff');
  }
}

function renderNebula(c, nodes, density, sigma, weight, seed) {
  let s = Math.floor(seed * 1e6) * 13 + 7;
  const R = () => sr(s++);
  const glow = !S.nebula || S.nebula.glow !== false;
  const N = nebSetup(nodes, sigma, seed, R);
  if (glow) nebGlow(c, N, density);
  nebFilaments(c, N, density, weight);
  nebDust(c, N, density, weight);
  nebFlares(c, N, nodes, density, weight);
  c.globalAlpha = 1;
}
