// ── VINES (stems, leaves, flowers) ─────────────────────────────────────────
// Main stems wave from node to node (spanning tree, plus a few extra links at
// higher density); shoots grow off the nodes and the stems, curve, fork and
// stop short of other stems (a spatial hash, as in Lightning). Leaves sit
// alternately along every stem; shoots end in a flower, a bud or a curled
// tendril; every node gets a large bloom on a rosette of leaves (its own
// part, for Fit nodes). Leaf veins and petal edges are drawn in the
// background colour, so they read as gaps in stencils and cut files.
// Jitter = how much the stems wave and the shoots curl.
// The layout has one random stream; leaves, tips and blooms each have their
// own, so an option changes only what it is about.
// Used by: RENDERERS.
const VINE_LEAVES = ['almond', 'round', 'ivy'], VINE_BLOOMS = ['blossom', 'daisy', 'rose'];
// Bloom (animation only): liveOf(c).bloomT, the animation time while recording
// live frames, else null (stills and exports: every flower fully open). Each
// flower opens and closes on its own period, phase from a hash of its position
// (no R() draws).
const BLOOM_MIN = 0.45, BLOOM_PER = 9, BLOOM_PER_NODE = 14;   // petal length when closed; seconds per cycle (+ up to 6)
// Seasons: the year as a number 0–4 (0 the start of spring, 1 summer = the
// plain design, 2 autumn, 3 winter). A still uses its Season setting
// (SEASON_YR); with Seasons playing, liveOf(c).seasonT is the years since Play
// (added to that start). Each leaf, bud and flower has its own moments in the
// year, hashed from its index (no R() draws), so a season changes what is
// drawn and how, never the layout: young light-green leaves unfold in spring,
// flowers open, drop their petals and leave a hip; in autumn the leaves turn
// and fall (Rec.markLeaf, drawn falling by drawPetals); winter is bare, grey
// stems and closed node blooms.
const VINE_SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const SEASON_YR = { spring: 0.6, summer: 1, autumn: 2.45, winter: 3.4 };
const SEASON_S = 12;                     // seconds per season at Season speed 1
const SEASON_SPRING = ['#b9dc7c', '#a3cf6c'], SEASON_AUTUMN = ['#e3b23c', '#d98a2b', '#c9562f', '#a63c2c', '#b98b33'];
const SEASON_STEM = '#8f8676', SEASON_HIP = '#b0343c';

function sanVine(v) {
  v = v || {};
  return { leaves: Math.round(clampNum(v.leaves, 0, 200, 100)), flowers: Math.round(clampNum(v.flowers, 0, 100, 60)),
    leaf: VINE_LEAVES.concat('mixed').includes(v.leaf) ? v.leaf : 'almond',
    bloom: VINE_BLOOMS.concat('mixed').includes(v.bloom) ? v.bloom : 'mixed',
    tendrils: v.tendrils !== false, veins: v.veins !== false, season: VINE_SEASONS.includes(v.season) ? v.season : 'summer' };
}
function renderVine(c, nodes, density, sigma, weight, seed) {
  if (!nodes.length) return;
  const base = Math.floor(seed * 1e6);
  const stream = tag => { let q = base * 41 + tag * 7919 + 19; return () => sr(q++); };
  const R = stream(0), RL = stream(1), RT = stream(2), RB = stream(3);
  const TAU = Math.PI * 2, J = Math.max(0, Math.min(1, sigma / 100));
  const V = sanVine(S.vine);
  const { bloomT, seasonT } = liveOf(c);
  const Y0 = SEASON_YR[V.season], YR = typeof seasonT === 'number' ? ((Y0 + seasonT) % 4 + 4) % 4 : Y0;
  const SEAS = YR !== 1;                             // summer: the plain design, drawn exactly as before
  const sm = f => f <= 0 ? 0 : f >= 1 ? 1 : f * f * (3 - 2 * f);
  const hx = c0 => [parseInt(c0.slice(1, 3), 16), parseInt(c0.slice(3, 5), 16), parseInt(c0.slice(5, 7), 16)];
  const mixC = (a, b, f) => { if (f <= 0) return a; if (f >= 1) return b; const A = hx(a), B = hx(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * f).toString(16).padStart(2, '0')).join(''); };
  const sh = (i, k) => sr(i * 7919 + k * 104729 + 4421);   // a hash per item and purpose
  const winter = SEAS ? sm((YR - 2.7) / 0.4) * (1 - sm((YR - 3.75) / 0.25)) : 0;
  const BG = modeBg('vine'), STEM = SEAS ? mixC('#b5d29a', SEASON_STEM, winter) : '#b5d29a', LEAF = ['#86b86a', '#6fa35a'];
  // A leaf in this season: null (not grown yet, or fallen) or { s: size, col }
  const leafNow = (i, col) => {
    if (!SEAS) return { s: 1, col };
    const h = sh(i, 1), tf = 2.6 + 0.6 * h;
    if (YR >= tf) return null;
    const s = sm((YR - 0.05 - 0.35 * h) / 0.5);
    if (s < 0.03) return null;
    if (YR < 1) col = mixC(SEASON_SPRING[col === LEAF[0] ? 0 : 1], col, sm(YR));
    return { s, col: mixC(col, SEASON_AUTUMN[Math.floor(sh(i, 2) * 5)], sm((YR - 1.85 - 0.3 * h) / 0.3)) };
  };
  // Every leaf for its fall (Seasons playing only): when, and how it looks then
  const fallMark = (i, x, y, a, L, shape) => {
    if (!c.markLeaf || typeof seasonT !== 'number') return;
    c.markLeaf({ x: x + Math.cos(a) * L * 0.5, y: y + Math.sin(a) * L * 0.5, a, L, shape, tf: 2.6 + 0.6 * sh(i, 1), y0: Y0, col: SEASON_AUTUMN[Math.floor(sh(i, 2) * 5)], bg: modeBg('vine') });
  };
  // A tip flower in this season: { k: 'flower', amt } | { k: 'bud', s } | { k: 'hip' } | null
  const tipNow = j => {
    if (!SEAS) return { k: 'flower', amt: 1 };
    const h = sh(j, 3), b0 = 0.1 + 0.2 * h, drop = 1.85 + 0.25 * h;
    if (YR < b0 || YR >= 3.5) return null;
    if (YR >= drop + 0.25) return { k: 'hip' };
    const f = sm((YR - 0.4 - 0.3 * h) / 0.3), amt = Math.min(f, 1 - sm((YR - drop) / 0.25));
    return f > 0.03 ? { k: 'flower', amt } : { k: 'bud', s: sm((YR - b0) / 0.3) };
  };
  // A tip bud: its size this season (0 = not there)
  const budNow = j => {
    if (!SEAS) return 1;
    const h = sh(j, 4), b0 = 0.1 + 0.2 * h;
    return YR < b0 || YR >= 2.4 + 0.3 * h ? 0 : sm((YR - b0) / 0.3);
  };
  // A node bloom: how open (1 summer, closed in winter)
  const nodeOpen = SEAS ? sm((YR - 0.25) / 0.4) * (1 - sm((YR - 2.0) / 0.5)) : 1;
  let SOP = 1;                                       // a flower's season opening, times its Bloom opening
  const PETAL = '#f5e4ec', PETAL2 = '#e7b3c6', HEART = '#ffd978';
  const GAP = Math.max(0.8, weight * 0.7);          // width of the background-coloured edges and veins
  const STEP = 4;                                    // stem point spacing
  const BLOOM_R = 30;                                // node bloom radius at node size 1
  const sz = n => n.size || 1, nw = n => n.w || 1;
  const RG = fillRegion();
  let cx = 0, cy = 0;
  nodes.forEach(n => { cx += n.x; cy += n.y; });
  cx /= nodes.length; cy /= nodes.length;
  let maxR = 60;
  nodes.forEach(n => { maxR = Math.max(maxR, Math.hypot(n.x - cx, n.y - cy)); });
  const reach = maxR + 150;
  const inArea = (x, y) => RG ? RG.has({ x, y }) : Math.hypot(x - cx, y - cy) <= reach;
  const fill = RG ? RG.scale(reach * 0.8) : 1;
  c.lineCap = 'round'; c.lineJoin = 'round';
  const grow = c.grow ? g => c.grow(g) : () => {};   // Growing in stages (Rec only)
  const shed = c.markPetal ? (x, y, r, big) => c.markPetal({ x, y, r, col: [PETAL, PETAL2], bg: BG, big }) : () => {};   // Falling petals

  // Spatial hash of every stem point
  const CS = 8, DMIN = 9 + weight * 1.5, H = new Map();
  const key = (i, j) => i * 73856093 ^ j * 19349663;
  const addPt = (x, y, id) => {
    const k = key(Math.floor(x / CS), Math.floor(y / CS));
    let a = H.get(k); if (!a) H.set(k, a = []);
    a.push(x, y, id);
  };
  const hits = (x, y, id, pid) => {
    const r = Math.ceil(DMIN / CS), ci = Math.floor(x / CS), cj = Math.floor(y / CS);
    for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      const a = H.get(key(ci + di, cj + dj)); if (!a) continue;
      for (let q = 0; q < a.length; q += 3) {
        if (a[q + 2] === id || a[q + 2] === pid) continue;
        if (Math.hypot(x - a[q], y - a[q + 1]) < DMIN) return true;
      }
    }
    return false;
  };
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const stems = [];
  let nid = 0, budget = 22000;

  // 1. Main stems: a wave between linked nodes, pinned at both ends
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
    all.filter(e => !links.includes(e)).slice(0, Math.floor(density / 4)).forEach(e => links.push(e));
  }
  links.forEach(([L, i, j]) => {
    const A = nodes[i], B = nodes[j];
    if (L < 1) return;
    const ux = (B.x - A.x) / L, uy = (B.y - A.y) / L;
    const amp = Math.min(70, L * (0.03 + J * 0.14)) * (0.7 + R() * 0.6);
    const waves = Math.max(0.5, L / 240) * (0.7 + R() * 0.6);
    const ph = R() * TAU, amp2 = amp * 0.25 * R(), ph2 = R() * TAU;
    const n = Math.max(2, Math.ceil(L / STEP)), pts = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n, env = Math.pow(Math.sin(Math.PI * t), 0.6);
      const off = env * (amp * Math.sin(TAU * waves * t + ph) + amp2 * Math.sin(TAU * waves * 2.3 * t + ph2));
      pts.push({ x: A.x + (B.x - A.x) * t - uy * off, y: A.y + (B.y - A.y) * t + ux * off });
    }
    const id = ++nid;
    pts.forEach(p => addPt(p.x, p.y, id));
    stems.push({ pts, w: weight * 1.7 * (nw(A) + nw(B)) / 2, depth: 0, id, main: true, from: i, to: j });
  });

  // 2. Shoots, grown breadth-first: off the nodes (between the main stems)
  // and off the main stems; they curve, curl towards the end and fork
  const queue = [];
  const seedShoot = (x, y, ang, len, w, depth, pid) =>
    queue.push({ x, y, ang, len, w, depth, pid, curl: R() < 0.5 ? -1 : 1, k0: (R() - 0.5) * 0.08 * (0.3 + J) });
  const linkAng = nodes.map(() => []);
  stems.forEach(st => {
    const p = st.pts, m = p.length - 1, a = Math.min(3, m), b = Math.max(0, m - 3);
    linkAng[st.from].push(Math.atan2(p[a].y - p[0].y, p[a].x - p[0].x));
    linkAng[st.to].push(Math.atan2(p[b].y - p[m].y, p[b].x - p[m].x));
  });
  nodes.forEach((n, i) => {
    const k = Math.max(1, Math.round((1.5 + density * 0.35) * Math.sqrt(fill) * sz(n)));
    const a0 = R() * TAU, r0 = BLOOM_R * sz(n) * 0.6;
    for (let q = 0; q < k; q++) {
      const ang = a0 + q / k * TAU + (R() - 0.5) * 0.7;
      const len = (60 + density * 9) * sz(n) * (0.6 + R() * 0.8) * Math.sqrt(fill);
      if (linkAng[i].some(a => Math.abs(angDiff(a, ang)) < 0.45)) continue;
      seedShoot(n.x + Math.cos(ang) * r0, n.y + Math.sin(ang) * r0, ang, len, weight * 1.35 * nw(n), 0, -1 - i);
    }
  });
  stems.slice().forEach(st => {
    const every = Math.max(40, 110 - density * 7), m = st.pts.length - 1;
    const cnt = Math.floor(m * STEP / every);
    for (let q = 0; q < cnt; q++) {
      const k = Math.max(3, Math.min(m - 4, Math.floor((q + 0.3 + R() * 0.4) / cnt * m)));
      const side = R() < 0.5 ? -1 : 1, da = 0.5 + R() * 0.6, len = (35 + density * 6) * (0.6 + R() * 0.8);
      if (k < 1 || k >= m) continue;
      const p = st.pts[k], nx = st.pts[k + 1];
      seedShoot(p.x, p.y, Math.atan2(nx.y - p.y, nx.x - p.x) + side * da, len, st.w * 0.6, 1, st.id);
    }
  });
  while (queue.length && budget > 0) {
    const g = queue.shift(), id = ++nid, pts = [{ x: g.x, y: g.y }];
    let { x, y, ang } = g, k = g.k0, trav = 0;
    const n = Math.max(2, Math.round(g.len / STEP));
    for (let st = 0; st < n && budget > 0; st++) {
      k = (k + (R() - 0.5) * 0.02 * (0.4 + J)) * 0.97;
      const prog = st / n;
      ang += k + (prog > 0.7 ? g.curl * (prog - 0.7) * 0.22 * (0.5 + J) : 0);
      const nx = x + Math.cos(ang) * STEP, ny = y + Math.sin(ang) * STEP;
      if (!inArea(nx, ny)) break;
      trav += STEP;
      if (trav > DMIN * 2.5 && hits(nx, ny, id, g.pid)) break;
      x = nx; y = ny; pts.push({ x, y }); budget--;
      if (g.depth < 3 && g.w > weight * 0.45 && R() < 0.018 + density * 0.003) {
        const left = (n - st) * STEP, side = R() < 0.5 ? -1 : 1, da = 0.5 + R() * 0.5, f = 0.4 + R() * 0.35;
        if (left > 30) seedShoot(x, y, ang + side * da, left * f, g.w * 0.7, g.depth + 1, id);
      }
    }
    if (pts.length < 4) continue;
    pts.forEach(p => addPt(p.x, p.y, id));
    stems.push({ pts, w: g.w, depth: g.depth, id, main: false, curl: g.curl });
  }

  // Shapes. P(x, y, a) maps leaf/petal coordinates (u along a, v across) to the world
  const P = (x, y, a) => { const co = Math.cos(a), si = Math.sin(a); return (u, v) => [x + u * co - v * si, y + u * si + v * co]; };
  const mv = (p) => c.moveTo(p[0], p[1]), ln = (p) => c.lineTo(p[0], p[1]);
  const bz = (p1, p2, p3) => c.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
  const pathOf = pts => { c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); };
  // A leaf from (x, y) pointing along a, L long; draws fill and veins
  const leaf = (x, y, a, L, shape, col) => {
    const T = P(x, y, a);
    c.globalAlpha = 1; c.fillStyle = col;
    c.beginPath();
    if (shape === 'ivy') {
      const r0 = L * 0.55, u0 = r0 * 0.68 * 0.7;
      for (let q = 0; q <= 32; q++) {
        const th = q / 32 * TAU;
        const r = r0 * (0.84 + 0.16 * Math.cos(3 * th)) * (1 - 0.3 * Math.pow(Math.max(0, -Math.cos(th)), 10));
        const p = T(u0 + Math.cos(th) * r, Math.sin(th) * r);
        if (q) ln(p); else mv(p);
      }
      c.closePath(); c.fill();
      if (V.veins) {
        c.strokeStyle = BG; c.lineWidth = GAP * 0.8;
        [0, 2.1, -2.1].forEach(th => { c.beginPath(); mv(T(u0 * 0.6, 0)); ln(T(u0 + Math.cos(th) * r0 * 0.7, Math.sin(th) * r0 * 0.7)); c.stroke(); });
      }
      return;
    }
    const W = L * (shape === 'round' ? 0.5 : 0.36), k1 = shape === 'round' ? 0.1 : 0.25, k2 = shape === 'round' ? 0.95 : 0.7;
    mv(T(0, 0)); bz(T(L * k1, W), T(L * k2, W * 0.9), T(L, 0)); bz(T(L * k2, -W * 0.9), T(L * k1, -W), T(0, 0));
    c.closePath(); c.fill();
    if (V.veins) {
      c.strokeStyle = BG; c.lineWidth = GAP * 0.8;
      c.beginPath(); mv(T(L * 0.06, 0)); ln(T(L * 0.78, 0)); c.stroke();
    }
  };
  // A petal from the flower centre along a
  const petal = (x, y, a, len, wid, round) => {
    const T = P(x, y, a);
    c.beginPath(); mv(T(0, 0));
    if (round) { bz(T(len * 0.15, wid), T(len * 1.05, wid * 1.15), T(len, 0)); bz(T(len * 1.05, -wid * 1.15), T(len * 0.15, -wid), T(0, 0)); }
    else { bz(T(len * 0.3, wid), T(len * 0.85, wid * 0.5), T(len, 0)); bz(T(len * 0.85, -wid * 0.5), T(len * 0.3, -wid), T(0, 0)); }
    c.closePath(); c.fill(); c.stroke();
  };
  const dot = (x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };
  // A flower at (x, y), radius r, turned by rot; big = node bloom (more layers)
  const flower = (x, y, r, style, rot, big) => {
    c.globalAlpha = 1; c.strokeStyle = BG; c.lineWidth = GAP;
    const op = SOP === 1 ? openAt(x, y, big) : openAt(x, y, big) * SOP, wk = 0.6 + 0.4 * op;   // petals shorten and narrow as the flower closes
    rot += (1 - op) * 0.5;
    if (style === 'daisy') {
      const n = big ? 16 : 11;
      for (let ring = big ? 0 : 1; ring < 2; ring++) {
        c.fillStyle = ring ? PETAL : PETAL2;
        for (let p = 0; p < n; p++) petal(x, y, rot + (p + ring * 0.5) / n * TAU, r * (ring ? 0.92 : 1) * op, r * 0.17 * wk, false);
      }
      c.fillStyle = HEART; dot(x, y, r * 0.3); c.stroke();
      c.fillStyle = BG;
      for (let q = 0; q < 9; q++) { const a = q * 2.39996, d = r * 0.21 * Math.sqrt((q + 0.5) / 9); dot(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(0.5, GAP * 0.4)); }
    } else if (style === 'rose') {
      const rings = big ? 3 : 2;
      for (let j = 0; j < rings; j++) {
        c.fillStyle = j % 2 ? PETAL : PETAL2;
        const len = r * (1 - j * 0.28) * op;
        for (let p = 0; p < 5; p++) petal(x, y, rot + j * 0.63 + p / 5 * TAU, len, len * 0.55 * wk, true);
      }
      c.fillStyle = PETAL; dot(x, y, r * 0.3); c.stroke();
      c.beginPath();
      for (let q = 0; q <= 24; q++) { const a = rot + q / 24 * TAU * 1.6, d = r * 0.27 * q / 24; const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d; if (q) c.lineTo(px, py); else c.moveTo(px, py); }
      c.stroke();
    } else {
      for (let layer = big ? 0 : 1; layer < 2; layer++) {
        c.fillStyle = layer ? PETAL : PETAL2;
        const len = r * (layer ? 0.85 : 1) * op;
        for (let p = 0; p < 5; p++) petal(x, y, rot + (p + layer * 0.5) / 5 * TAU, len, len * 0.45 * wk, true);
      }
      c.fillStyle = HEART; dot(x, y, r * 0.24); c.stroke();
      c.fillStyle = BG;
      for (let q = 0; q < 7; q++) { const a = rot + q / 7 * TAU; dot(x + Math.cos(a) * r * 0.13, y + Math.sin(a) * r * 0.13, Math.max(0.5, GAP * 0.45)); }
    }
  };
  const bud = (x, y, a, r) => {
    r *= 0.8 + 0.2 * (openAt(x, y, false) - BLOOM_MIN) / (1 - BLOOM_MIN);   // swells with Bloom (1 when still)
    const T = P(x, y, a);
    c.globalAlpha = 1; c.fillStyle = PETAL2; c.strokeStyle = BG; c.lineWidth = GAP;
    c.beginPath(); mv(T(0, 0)); bz(T(r * 0.2, r * 0.45), T(r * 0.9, r * 0.35), T(r * 1.2, 0)); bz(T(r * 0.9, -r * 0.35), T(r * 0.2, -r * 0.45), T(0, 0));
    c.closePath(); c.fill(); c.stroke();
    [-0.5, 0.5].forEach(s => leaf(x, y, a + s, r * 0.75, 'almond', LEAF[0]));
  };
  const tendril = (x, y, a, dir, w) => {
    const pts = [{ x, y }];
    let stp = 2.4, kk = 0.03;
    for (let q = 0; q < 55; q++) {
      a += dir * kk; kk = Math.min(0.7, kk * 1.06); stp *= 0.985;
      x += Math.cos(a) * stp; y += Math.sin(a) * stp;
      if (!inArea(x, y)) break;
      pts.push({ x, y });
    }
    if (pts.length < 3) return;
    c.globalAlpha = 1; c.strokeStyle = STEM; c.lineWidth = w; pathOf(pts); c.stroke();
  };
  const openAt = (x, y, slow) => {
    if (typeof bloomT !== 'number') return 1;
    const h = sr(Math.round(x) * 131 + Math.round(y) * 7919 + 5);
    const u = 0.5 + 0.5 * Math.sin(bloomT * TAU / ((slow ? BLOOM_PER_NODE : BLOOM_PER) + h * 6) + h * TAU);
    return BLOOM_MIN + (1 - BLOOM_MIN) * u * u * (3 - 2 * u);
  };
  const near = (x, y) => nodes.some(n => Math.hypot(x - n.x, y - n.y) < BLOOM_R * sz(n) * 1.1);

  // 3. Plan leaves, side tendrils and tips (their own streams)
  const leaves = [], tendrils = [], buds = [], flowers = [];
  const leafAmt = V.leaves / 100;
  stems.forEach(st => {
    const pick = RL(), shape = V.leaf === 'mixed' ? VINE_LEAVES[Math.floor(pick * 3)] : V.leaf;
    const gap = (40 - density * 2.2) / Math.max(leafAmt, 0.01);
    let d = gap * (0.3 + RL() * 0.7), side = RL() < 0.5 ? -1 : 1, acc = 0;
    const pts = st.pts, m = pts.length - 1, total = m * STEP;
    for (let i = 1; i <= m && leafAmt > 0; i++) {
      acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (acc < d) continue;
      const r1 = RL(), r2 = RL(), r3 = RL(), r4 = RL();
      d += gap * (0.75 + r1 * 0.5); side = -side;
      const p = pts[i], q = pts[Math.min(m, i + 1)], o = pts[i - 1];
      const dir = Math.atan2(q.y - o.y, q.x - o.x);
      if (near(p.x, p.y)) continue;
      const taper = st.main ? 1 : 1 - (acc / total) * 0.45;
      const L = (16 + r2 * 9) * Math.min(1.4, Math.max(0.65, st.w / (weight * 1.35))) * taper;
      const a = dir + side * (0.6 + r3 * 0.35);
      const pl = L * 0.22, bx = p.x + Math.cos(a) * pl, by = p.y + Math.sin(a) * pl;
      if (V.tendrils && r4 < 0.1) tendrils.push({ x: p.x, y: p.y, a: dir - side * 0.9, dir: -side, w: Math.max(weight * 0.5, st.w * 0.35) });
      if (!inArea(p.x + Math.cos(a) * L * 1.2, p.y + Math.sin(a) * L * 1.2)) continue;
      leaves.push({ x: p.x, y: p.y, bx, by, a, L, shape, col: LEAF[r2 < 0.5 ? 0 : 1], w: Math.max(0.5, st.w * 0.45) });
    }
    if (st.main) return;
    const u = RT(), r2 = RT(), r3 = RT(), sp = RT();
    const e = pts[m], e0 = pts[Math.max(0, m - 3)], dir = Math.atan2(e.y - e0.y, e.x - e0.x);
    const F = V.flowers / 100;
    if (u < 0.5 * F) {
      const r = st.depth ? 9 + r2 * 4 : 13 + r2 * 5, fx = e.x + Math.cos(dir) * r * 0.6, fy = e.y + Math.sin(dir) * r * 0.6;
      if (inArea(fx, fy) && !near(fx, fy)) flowers.push({ x: fx, y: fy, r, rot: r3 * TAU, style: V.bloom === 'mixed' ? VINE_BLOOMS[Math.floor(sp * 3)] : V.bloom });
    } else if (u < 0.7 * F) buds.push({ x: e.x, y: e.y, a: dir, r: 7 + r2 * 5 });
    else if (V.tendrils) tendrils.push({ x: e.x, y: e.y, a: dir, dir: st.curl, w: Math.max(weight * 0.5, st.w * 0.5) });
  });

  // 4. Draw: stems (thinnest first, shoots tapering), tendrils, leaves, buds, flowers
  stems.slice().sort((a, b) => a.w - b.w).forEach(st => {
    c.globalAlpha = 1; c.strokeStyle = STEM;
    const parts = st.main ? 1 : Math.min(4, Math.floor(st.pts.length / 4) + 1);
    for (let p = 0; p < parts; p++) {
      const i0 = Math.floor(p * (st.pts.length - 1) / parts), i1 = Math.floor((p + 1) * (st.pts.length - 1) / parts);
      if (i1 <= i0) continue;
      c.lineWidth = st.w * (1 - p * 0.15);
      pathOf(st.pts.slice(i0, i1 + 1)); c.stroke();
    }
  });
  tendrils.forEach(t => tendril(t.x, t.y, t.a, t.dir, t.w));
  leaves.forEach((l, i) => {
    c.globalAlpha = 1; c.strokeStyle = STEM; c.lineWidth = l.w;
    c.beginPath(); c.moveTo(l.x, l.y); c.lineTo(l.bx, l.by); c.stroke();
    fallMark(i, l.bx, l.by, l.a, l.L, l.shape);
    const ln = leafNow(i, l.col);
    if (!ln) return;
    grow({ x: l.bx, y: l.by, kind: 'leaf' });
    leaf(l.bx, l.by, l.a, l.L * ln.s, l.shape, ln.col);
    grow(null);
  });
  buds.forEach((b, j) => {
    const s = budNow(j);
    if (s < 0.05) return;
    grow({ x: b.x, y: b.y, kind: 'bud' }); bud(b.x, b.y, b.a, b.r * s); grow(null);
  });
  flowers.forEach((f, j) => {
    const T = tipNow(j);
    if (!T) return;
    grow({ x: f.x, y: f.y, kind: 'flower' });
    if (T.k === 'flower') {
      if (T.amt > 0.6) shed(f.x, f.y, f.r, false);
      SOP = SEAS ? 0.3 + 0.7 * T.amt : 1;
      flower(f.x, f.y, SEAS ? f.r * (0.5 + 0.5 * T.amt) : f.r, f.style, f.rot, false);
      SOP = 1;
    } else if (T.k === 'bud') { if (T.s > 0.05) bud(f.x, f.y, f.rot, f.r * 0.55 * T.s); }
    else {                                           // a hip where the flower was
      c.globalAlpha = 1; c.fillStyle = mixC(SEASON_HIP, '#6e4a3e', winter); c.strokeStyle = BG; c.lineWidth = GAP;
      dot(f.x, f.y, Math.max(1.5, f.r * 0.3)); c.stroke();
    }
    grow(null);
  });

  // 5. Node blooms on a rosette of leaves: each node's own part
  nodes.forEach((n, i) => {
    const br = BLOOM_R * sz(n) * (0.9 + RB() * 0.2), rot = RB() * TAU, sp = RB();
    const m = 4 + Math.floor(RB() * 3), a0 = RB() * TAU;
    const style = V.bloom === 'mixed' ? VINE_BLOOMS[Math.floor(sp * 3)] : V.bloom;
    c.own(i);
    for (let q = 0; q < m; q++) {
      const a = a0 + q / m * TAU + (RB() - 0.5) * 0.4, L = br * (0.75 + RB() * 0.25);
      if (leafAmt > 0) {
        const lx = n.x + Math.cos(a) * br * 0.35, ly = n.y + Math.sin(a) * br * 0.35;
        const shp = V.leaf === 'ivy' ? 'ivy' : V.leaf === 'round' ? 'round' : 'almond';
        fallMark(100000 + i * 16 + q, lx, ly, a, L, shp);
        const ln = leafNow(100000 + i * 16 + q, LEAF[q % 2]);
        if (ln) {
          grow({ x: lx, y: ly, kind: 'leaf' });
          leaf(lx, ly, a, L * ln.s, shp, ln.col);
          grow(null);
        }
      }
    }
    grow({ x: n.x, y: n.y, kind: 'flower' });
    if (nodeOpen > 0.6) shed(n.x, n.y, br, true);
    if (nodeOpen < 0.05 && YR > 1) {                 // autumn, winter: a large hip
      c.globalAlpha = 1; c.fillStyle = mixC(SEASON_HIP, '#6e4a3e', winter); c.strokeStyle = BG; c.lineWidth = GAP;
      dot(n.x, n.y, br * 0.3); c.stroke();
      c.fillStyle = BG; dot(n.x - br * 0.08, n.y - br * 0.09, Math.max(0.8, br * 0.06));
    } else if (nodeOpen < 0.05) bud(n.x, n.y, rot, br * 0.55);   // early spring: a bud
    else {
      SOP = SEAS ? 0.3 + 0.7 * nodeOpen : 1;
      flower(n.x, n.y, br, style, rot, true);
      SOP = 1;
    }
    grow(null);
    c.own(-1);
  });
  c.globalAlpha = 1;
}
