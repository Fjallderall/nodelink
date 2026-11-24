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
const VINE_LEAF = ['#86b86a', '#6fa35a'], VINE_PETAL = '#f5e4ec', VINE_PETAL2 = '#e7b3c6', VINE_HEART = '#ffd978';
const VINE_STEP = 4;                     // stem point spacing
const VINE_BLOOM_R = 30;                 // node bloom radius at node size 1
const VINE_CS = 8;                       // spatial hash cell size

function sanVine(v) {
  v = v || {};
  return { leaves: Math.round(clampNum(v.leaves, 0, 200, 100)), flowers: Math.round(clampNum(v.flowers, 0, 100, 60)),
    leaf: VINE_LEAVES.concat('mixed').includes(v.leaf) ? v.leaf : 'almond',
    bloom: VINE_BLOOMS.concat('mixed').includes(v.bloom) ? v.bloom : 'mixed',
    tendrils: v.tendrils !== false, veins: v.veins !== false, season: VINE_SEASONS.includes(v.season) ? v.season : 'summer' };
}
// renderVine: the plant is built in stages on one shared object vn
// (vineSetup), then drawn. The stages run in the same order as before the
// split: the layout draws from vn.R (main stems, then shoots), the plan from
// vn.RL (leaves) and vn.RT (tips), the node blooms from vn.RB.
function renderVine(c, nodes, density, sigma, weight, seed) {
  if (!nodes.length) return;
  const vn = vineSetup(c, nodes, density, sigma, weight, seed);
  vineMainStems(vn);
  vineShoots(vn);
  vineDrawPlan(vn, vinePlan(vn));
  nodes.forEach((n, i) => vineNodeBloom(vn, n, i));
  c.globalAlpha = 1;
}

// Settings, random streams, the season, colours, the area and the spatial hash
function vineSetup(c, nodes, density, sigma, weight, seed) {
  const base = Math.floor(seed * 1e6);
  const stream = tag => { let q = base * 41 + tag * 7919 + 19; return () => sr(q++); };
  const V = sanVine(S.vine);
  const { bloomT, seasonT } = liveOf(c);
  const Y0 = SEASON_YR[V.season], YR = typeof seasonT === 'number' ? ((Y0 + seasonT) % 4 + 4) % 4 : Y0;
  const SEAS = YR !== 1;                             // summer: the plain design, drawn exactly as before
  const winter = SEAS ? vineSm((YR - 2.7) / 0.4) * (1 - vineSm((YR - 3.75) / 0.25)) : 0;
  const RG = fillRegion();
  let cx = 0, cy = 0;
  nodes.forEach(n => { cx += n.x; cy += n.y; });
  cx /= nodes.length; cy /= nodes.length;
  let maxR = 60;
  nodes.forEach(n => { maxR = Math.max(maxR, Math.hypot(n.x - cx, n.y - cy)); });
  const reach = maxR + 150;
  const BG = modeBg('vine');
  c.lineCap = 'round'; c.lineJoin = 'round';
  return { c, nodes, density, weight, V, bloomT, seasonT, Y0, YR, SEAS, winter, RG, BG,
    R: stream(0), RL: stream(1), RT: stream(2), RB: stream(3),
    J: Math.max(0, Math.min(1, sigma / 100)),
    STEM: SEAS ? vineMix('#b5d29a', SEASON_STEM, winter) : '#b5d29a',
    // A node bloom: how open (1 summer, closed in winter)
    nodeOpen: SEAS ? vineSm((YR - 0.25) / 0.4) * (1 - vineSm((YR - 2.0) / 0.5)) : 1,
    GAP: Math.max(0.8, weight * 0.7),                // width of the background-coloured edges and veins
    inArea: (x, y) => RG ? RG.has({ x, y }) : Math.hypot(x - cx, y - cy) <= reach,
    fill: RG ? RG.scale(reach * 0.8) : 1,
    grow: c.grow ? g => c.grow(g) : () => {},        // Growing in stages (Rec only)
    shed: c.markPetal ? (x, y, r, big) => c.markPetal({ x, y, r, col: [VINE_PETAL, VINE_PETAL2], bg: BG, big }) : () => {},   // Falling petals
    DMIN: 9 + weight * 1.5, H: new Map(), stems: [], nid: 0, budget: 22000 };
}

// Season helpers. Smoothstep, a colour mix, and a hash per item and purpose
function vineSm(f) { return f <= 0 ? 0 : f >= 1 ? 1 : f * f * (3 - 2 * f); }
function vineMix(a, b, f) {
  if (f <= 0) return a; if (f >= 1) return b;
  const hx = c0 => [parseInt(c0.slice(1, 3), 16), parseInt(c0.slice(3, 5), 16), parseInt(c0.slice(5, 7), 16)];
  const A = hx(a), B = hx(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * f).toString(16).padStart(2, '0')).join('');
}
function vineSh(i, k) { return sr(i * 7919 + k * 104729 + 4421); }
// A leaf in this season: null (not grown yet, or fallen) or { s: size, col }
function vineLeafNow(vn, i, col) {
  if (!vn.SEAS) return { s: 1, col };
  const YR = vn.YR, h = vineSh(i, 1), tf = 2.6 + 0.6 * h;
  if (YR >= tf) return null;
  const s = vineSm((YR - 0.05 - 0.35 * h) / 0.5);
  if (s < 0.03) return null;
  if (YR < 1) col = vineMix(SEASON_SPRING[col === VINE_LEAF[0] ? 0 : 1], col, vineSm(YR));
  return { s, col: vineMix(col, SEASON_AUTUMN[Math.floor(vineSh(i, 2) * 5)], vineSm((YR - 1.85 - 0.3 * h) / 0.3)) };
}
// Every leaf for its fall (Seasons playing only): when, and how it looks then
function vineFallMark(vn, i, x, y, a, L, shape) {
  if (!vn.c.markLeaf || typeof vn.seasonT !== 'number') return;
  vn.c.markLeaf({ x: x + Math.cos(a) * L * 0.5, y: y + Math.sin(a) * L * 0.5, a, L, shape, tf: 2.6 + 0.6 * vineSh(i, 1), y0: vn.Y0, col: SEASON_AUTUMN[Math.floor(vineSh(i, 2) * 5)], bg: modeBg('vine') });
}
// A tip flower in this season: { k: 'flower', amt } | { k: 'bud', s } | { k: 'hip' } | null
function vineTipNow(vn, j) {
  if (!vn.SEAS) return { k: 'flower', amt: 1 };
  const YR = vn.YR, h = vineSh(j, 3), b0 = 0.1 + 0.2 * h, drop = 1.85 + 0.25 * h;
  if (YR < b0 || YR >= 3.5) return null;
  if (YR >= drop + 0.25) return { k: 'hip' };
  const f = vineSm((YR - 0.4 - 0.3 * h) / 0.3), amt = Math.min(f, 1 - vineSm((YR - drop) / 0.25));
  return f > 0.03 ? { k: 'flower', amt } : { k: 'bud', s: vineSm((YR - b0) / 0.3) };
}
// A tip bud: its size this season (0 = not there)
function vineBudNow(vn, j) {
  if (!vn.SEAS) return 1;
  const YR = vn.YR, h = vineSh(j, 4), b0 = 0.1 + 0.2 * h;
  return YR < b0 || YR >= 2.4 + 0.3 * h ? 0 : vineSm((YR - b0) / 0.3);
}

// Spatial hash of every stem point
const vineKey = (i, j) => i * 73856093 ^ j * 19349663;
function vineAddPt(vn, x, y, id) {
  const k = vineKey(Math.floor(x / VINE_CS), Math.floor(y / VINE_CS));
  let a = vn.H.get(k); if (!a) vn.H.set(k, a = []);
  a.push(x, y, id);
}
function vineHits(vn, x, y, id, pid) {
  const DMIN = vn.DMIN, r = Math.ceil(DMIN / VINE_CS), ci = Math.floor(x / VINE_CS), cj = Math.floor(y / VINE_CS);
  for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
    const a = vn.H.get(vineKey(ci + di, cj + dj)); if (!a) continue;
    for (let q = 0; q < a.length; q += 3) {
      if (a[q + 2] === id || a[q + 2] === pid) continue;
      if (Math.hypot(x - a[q], y - a[q + 1]) < DMIN) return true;
    }
  }
  return false;
}

// 1. Main stems: a wave between linked nodes, pinned at both ends
function vineMainStems(vn) {
  const { nodes, density, R, J, weight } = vn, TAU = Math.PI * 2, nw = n => n.w || 1;
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
    const n = Math.max(2, Math.ceil(L / VINE_STEP)), pts = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n, env = Math.pow(Math.sin(Math.PI * t), 0.6);
      const off = env * (amp * Math.sin(TAU * waves * t + ph) + amp2 * Math.sin(TAU * waves * 2.3 * t + ph2));
      pts.push({ x: A.x + (B.x - A.x) * t - uy * off, y: A.y + (B.y - A.y) * t + ux * off });
    }
    const id = ++vn.nid;
    pts.forEach(p => vineAddPt(vn, p.x, p.y, id));
    vn.stems.push({ pts, w: weight * 1.7 * (nw(A) + nw(B)) / 2, depth: 0, id, main: true, from: i, to: j });
  });
}

// 2. Shoots, grown breadth-first: off the nodes (between the main stems)
// and off the main stems; they curve, curl towards the end and fork
function vineShoots(vn) {
  const { nodes, density, R, J, weight, stems, fill } = vn, TAU = Math.PI * 2, STEP = VINE_STEP;
  const sz = n => n.size || 1, nw = n => n.w || 1;
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
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
    const a0 = R() * TAU, r0 = VINE_BLOOM_R * sz(n) * 0.6;
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
  while (queue.length && vn.budget > 0) {
    const g = queue.shift(), id = ++vn.nid, pts = [{ x: g.x, y: g.y }];
    let { x, y, ang } = g, k = g.k0, trav = 0;
    const n = Math.max(2, Math.round(g.len / STEP));
    for (let st = 0; st < n && vn.budget > 0; st++) {
      k = (k + (R() - 0.5) * 0.02 * (0.4 + J)) * 0.97;
      const prog = st / n;
      ang += k + (prog > 0.7 ? g.curl * (prog - 0.7) * 0.22 * (0.5 + J) : 0);
      const nx = x + Math.cos(ang) * STEP, ny = y + Math.sin(ang) * STEP;
      if (!vn.inArea(nx, ny)) break;
      trav += STEP;
      if (trav > vn.DMIN * 2.5 && vineHits(vn, nx, ny, id, g.pid)) break;
      x = nx; y = ny; pts.push({ x, y }); vn.budget--;
      if (g.depth < 3 && g.w > weight * 0.45 && R() < 0.018 + density * 0.003) {
        const left = (n - st) * STEP, side = R() < 0.5 ? -1 : 1, da = 0.5 + R() * 0.5, f = 0.4 + R() * 0.35;
        if (left > 30) seedShoot(x, y, ang + side * da, left * f, g.w * 0.7, g.depth + 1, id);
      }
    }
    if (pts.length < 4) continue;
    pts.forEach(p => vineAddPt(vn, p.x, p.y, id));
    stems.push({ pts, w: g.w, depth: g.depth, id, main: false, curl: g.curl });
  }
}

// Shapes. vineT(x, y, a) maps leaf/petal coordinates (u along a, v across) to the world
function vineT(x, y, a) { const co = Math.cos(a), si = Math.sin(a); return (u, v) => [x + u * co - v * si, y + u * si + v * co]; }
const vineMv = (c, p) => c.moveTo(p[0], p[1]), vineLn = (c, p) => c.lineTo(p[0], p[1]);
const vineBz = (c, p1, p2, p3) => c.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
function vinePathOf(c, pts) { c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); }
function vineDot(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
// A leaf from (x, y) pointing along a, L long; draws fill and veins
function vineLeaf(vn, x, y, a, L, shape, col) {
  const c = vn.c, T = vineT(x, y, a), TAU = Math.PI * 2;
  c.globalAlpha = 1; c.fillStyle = col;
  c.beginPath();
  if (shape === 'ivy') {
    const r0 = L * 0.55, u0 = r0 * 0.68 * 0.7;
    for (let q = 0; q <= 32; q++) {
      const th = q / 32 * TAU;
      const r = r0 * (0.84 + 0.16 * Math.cos(3 * th)) * (1 - 0.3 * Math.pow(Math.max(0, -Math.cos(th)), 10));
      const p = T(u0 + Math.cos(th) * r, Math.sin(th) * r);
      if (q) vineLn(c, p); else vineMv(c, p);
    }
    c.closePath(); c.fill();
    if (vn.V.veins) {
      c.strokeStyle = vn.BG; c.lineWidth = vn.GAP * 0.8;
      [0, 2.1, -2.1].forEach(th => { c.beginPath(); vineMv(c, T(u0 * 0.6, 0)); vineLn(c, T(u0 + Math.cos(th) * r0 * 0.7, Math.sin(th) * r0 * 0.7)); c.stroke(); });
    }
    return;
  }
  const W = L * (shape === 'round' ? 0.5 : 0.36), k1 = shape === 'round' ? 0.1 : 0.25, k2 = shape === 'round' ? 0.95 : 0.7;
  vineMv(c, T(0, 0)); vineBz(c, T(L * k1, W), T(L * k2, W * 0.9), T(L, 0)); vineBz(c, T(L * k2, -W * 0.9), T(L * k1, -W), T(0, 0));
  c.closePath(); c.fill();
  if (vn.V.veins) {
    c.strokeStyle = vn.BG; c.lineWidth = vn.GAP * 0.8;
    c.beginPath(); vineMv(c, T(L * 0.06, 0)); vineLn(c, T(L * 0.78, 0)); c.stroke();
  }
}
// A petal from the flower centre along a
function vinePetal(c, x, y, a, len, wid, round) {
  const T = vineT(x, y, a);
  c.beginPath(); vineMv(c, T(0, 0));
  if (round) { vineBz(c, T(len * 0.15, wid), T(len * 1.05, wid * 1.15), T(len, 0)); vineBz(c, T(len * 1.05, -wid * 1.15), T(len * 0.15, -wid), T(0, 0)); }
  else { vineBz(c, T(len * 0.3, wid), T(len * 0.85, wid * 0.5), T(len, 0)); vineBz(c, T(len * 0.85, -wid * 0.5), T(len * 0.3, -wid), T(0, 0)); }
  c.closePath(); c.fill(); c.stroke();
}
// A flower at (x, y), radius r, turned by rot; big = node bloom (more layers);
// sop = its season opening (times its Bloom opening)
function vineFlower(vn, x, y, r, style, rot, big, sop = 1) {
  const c = vn.c, BG = vn.BG, GAP = vn.GAP, TAU = Math.PI * 2, dot = (x0, y0, r0) => vineDot(c, x0, y0, r0);
  c.globalAlpha = 1; c.strokeStyle = BG; c.lineWidth = GAP;
  const op = sop === 1 ? vineOpenAt(vn, x, y, big) : vineOpenAt(vn, x, y, big) * sop, wk = 0.6 + 0.4 * op;   // petals shorten and narrow as the flower closes
  rot += (1 - op) * 0.5;
  if (style === 'daisy') {
    const n = big ? 16 : 11;
    for (let ring = big ? 0 : 1; ring < 2; ring++) {
      c.fillStyle = ring ? VINE_PETAL : VINE_PETAL2;
      for (let p = 0; p < n; p++) vinePetal(c, x, y, rot + (p + ring * 0.5) / n * TAU, r * (ring ? 0.92 : 1) * op, r * 0.17 * wk, false);
    }
    c.fillStyle = VINE_HEART; dot(x, y, r * 0.3); c.stroke();
    c.fillStyle = BG;
    for (let q = 0; q < 9; q++) { const a = q * 2.39996, d = r * 0.21 * Math.sqrt((q + 0.5) / 9); dot(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(0.5, GAP * 0.4)); }
  } else if (style === 'rose') {
    const rings = big ? 3 : 2;
    for (let j = 0; j < rings; j++) {
      c.fillStyle = j % 2 ? VINE_PETAL : VINE_PETAL2;
      const len = r * (1 - j * 0.28) * op;
      for (let p = 0; p < 5; p++) vinePetal(c, x, y, rot + j * 0.63 + p / 5 * TAU, len, len * 0.55 * wk, true);
    }
    c.fillStyle = VINE_PETAL; dot(x, y, r * 0.3); c.stroke();
    c.beginPath();
    for (let q = 0; q <= 24; q++) { const a = rot + q / 24 * TAU * 1.6, d = r * 0.27 * q / 24; const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d; if (q) c.lineTo(px, py); else c.moveTo(px, py); }
    c.stroke();
  } else {
    for (let layer = big ? 0 : 1; layer < 2; layer++) {
      c.fillStyle = layer ? VINE_PETAL : VINE_PETAL2;
      const len = r * (layer ? 0.85 : 1) * op;
      for (let p = 0; p < 5; p++) vinePetal(c, x, y, rot + (p + layer * 0.5) / 5 * TAU, len, len * 0.45 * wk, true);
    }
    c.fillStyle = VINE_HEART; dot(x, y, r * 0.24); c.stroke();
    c.fillStyle = BG;
    for (let q = 0; q < 7; q++) { const a = rot + q / 7 * TAU; dot(x + Math.cos(a) * r * 0.13, y + Math.sin(a) * r * 0.13, Math.max(0.5, GAP * 0.45)); }
  }
}
function vineBud(vn, x, y, a, r) {
  const c = vn.c;
  r *= 0.8 + 0.2 * (vineOpenAt(vn, x, y, false) - BLOOM_MIN) / (1 - BLOOM_MIN);   // swells with Bloom (1 when still)
  const T = vineT(x, y, a);
  c.globalAlpha = 1; c.fillStyle = VINE_PETAL2; c.strokeStyle = vn.BG; c.lineWidth = vn.GAP;
  c.beginPath(); vineMv(c, T(0, 0)); vineBz(c, T(r * 0.2, r * 0.45), T(r * 0.9, r * 0.35), T(r * 1.2, 0)); vineBz(c, T(r * 0.9, -r * 0.35), T(r * 0.2, -r * 0.45), T(0, 0));
  c.closePath(); c.fill(); c.stroke();
  [-0.5, 0.5].forEach(s => vineLeaf(vn, x, y, a + s, r * 0.75, 'almond', VINE_LEAF[0]));
}
function vineTendril(vn, x, y, a, dir, w) {
  const c = vn.c, pts = [{ x, y }];
  let stp = 2.4, kk = 0.03;
  for (let q = 0; q < 55; q++) {
    a += dir * kk; kk = Math.min(0.7, kk * 1.06); stp *= 0.985;
    x += Math.cos(a) * stp; y += Math.sin(a) * stp;
    if (!vn.inArea(x, y)) break;
    pts.push({ x, y });
  }
  if (pts.length < 3) return;
  c.globalAlpha = 1; c.strokeStyle = vn.STEM; c.lineWidth = w; vinePathOf(c, pts); c.stroke();
}
// Bloom: how open a flower at (x, y) is now (1 when still)
function vineOpenAt(vn, x, y, slow) {
  const bloomT = vn.bloomT;
  if (typeof bloomT !== 'number') return 1;
  const h = sr(Math.round(x) * 131 + Math.round(y) * 7919 + 5);
  const u = 0.5 + 0.5 * Math.sin(bloomT * Math.PI * 2 / ((slow ? BLOOM_PER_NODE : BLOOM_PER) + h * 6) + h * Math.PI * 2);
  return BLOOM_MIN + (1 - BLOOM_MIN) * u * u * (3 - 2 * u);
}
const vineNear = (vn, x, y) => vn.nodes.some(n => Math.hypot(x - n.x, y - n.y) < VINE_BLOOM_R * (n.size || 1) * 1.1);

// 3. Plan leaves, side tendrils and tips (their own streams)
function vinePlan(vn) {
  const { V, RL, RT, density, weight } = vn, TAU = Math.PI * 2;
  const leaves = [], tendrils = [], buds = [], flowers = [];
  const leafAmt = V.leaves / 100;
  vn.stems.forEach(st => {
    const pick = RL(), shape = V.leaf === 'mixed' ? VINE_LEAVES[Math.floor(pick * 3)] : V.leaf;
    const gap = (40 - density * 2.2) / Math.max(leafAmt, 0.01);
    let d = gap * (0.3 + RL() * 0.7), side = RL() < 0.5 ? -1 : 1, acc = 0;
    const pts = st.pts, m = pts.length - 1, total = m * VINE_STEP;
    for (let i = 1; i <= m && leafAmt > 0; i++) {
      acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (acc < d) continue;
      const r1 = RL(), r2 = RL(), r3 = RL(), r4 = RL();
      d += gap * (0.75 + r1 * 0.5); side = -side;
      const p = pts[i], q = pts[Math.min(m, i + 1)], o = pts[i - 1];
      const dir = Math.atan2(q.y - o.y, q.x - o.x);
      if (vineNear(vn, p.x, p.y)) continue;
      const taper = st.main ? 1 : 1 - (acc / total) * 0.45;
      const L = (16 + r2 * 9) * Math.min(1.4, Math.max(0.65, st.w / (weight * 1.35))) * taper;
      const a = dir + side * (0.6 + r3 * 0.35);
      const pl = L * 0.22, bx = p.x + Math.cos(a) * pl, by = p.y + Math.sin(a) * pl;
      if (V.tendrils && r4 < 0.1) tendrils.push({ x: p.x, y: p.y, a: dir - side * 0.9, dir: -side, w: Math.max(weight * 0.5, st.w * 0.35) });
      if (!vn.inArea(p.x + Math.cos(a) * L * 1.2, p.y + Math.sin(a) * L * 1.2)) continue;
      leaves.push({ x: p.x, y: p.y, bx, by, a, L, shape, col: VINE_LEAF[r2 < 0.5 ? 0 : 1], w: Math.max(0.5, st.w * 0.45) });
    }
    if (st.main) return;
    const u = RT(), r2 = RT(), r3 = RT(), sp = RT();
    const e = pts[m], e0 = pts[Math.max(0, m - 3)], dir = Math.atan2(e.y - e0.y, e.x - e0.x);
    const F = V.flowers / 100;
    if (u < 0.5 * F) {
      const r = st.depth ? 9 + r2 * 4 : 13 + r2 * 5, fx = e.x + Math.cos(dir) * r * 0.6, fy = e.y + Math.sin(dir) * r * 0.6;
      if (vn.inArea(fx, fy) && !vineNear(vn, fx, fy)) flowers.push({ x: fx, y: fy, r, rot: r3 * TAU, style: V.bloom === 'mixed' ? VINE_BLOOMS[Math.floor(sp * 3)] : V.bloom });
    } else if (u < 0.7 * F) buds.push({ x: e.x, y: e.y, a: dir, r: 7 + r2 * 5 });
    else if (V.tendrils) tendrils.push({ x: e.x, y: e.y, a: dir, dir: st.curl, w: Math.max(weight * 0.5, st.w * 0.5) });
  });
  return { leaves, tendrils, buds, flowers };
}

// 4. Draw: stems (thinnest first, shoots tapering), tendrils, leaves, buds, flowers
function vineDrawPlan(vn, { leaves, tendrils, buds, flowers }) {
  const { c, grow, SEAS } = vn;
  vn.stems.slice().sort((a, b) => a.w - b.w).forEach(st => {
    c.globalAlpha = 1; c.strokeStyle = vn.STEM;
    const parts = st.main ? 1 : Math.min(4, Math.floor(st.pts.length / 4) + 1);
    for (let p = 0; p < parts; p++) {
      const i0 = Math.floor(p * (st.pts.length - 1) / parts), i1 = Math.floor((p + 1) * (st.pts.length - 1) / parts);
      if (i1 <= i0) continue;
      c.lineWidth = st.w * (1 - p * 0.15);
      vinePathOf(c, st.pts.slice(i0, i1 + 1)); c.stroke();
    }
  });
  tendrils.forEach(t => vineTendril(vn, t.x, t.y, t.a, t.dir, t.w));
  leaves.forEach((l, i) => {
    c.globalAlpha = 1; c.strokeStyle = vn.STEM; c.lineWidth = l.w;
    c.beginPath(); c.moveTo(l.x, l.y); c.lineTo(l.bx, l.by); c.stroke();
    vineFallMark(vn, i, l.bx, l.by, l.a, l.L, l.shape);
    const ln = vineLeafNow(vn, i, l.col);
    if (!ln) return;
    grow({ x: l.bx, y: l.by, kind: 'leaf' });
    vineLeaf(vn, l.bx, l.by, l.a, l.L * ln.s, l.shape, ln.col);
    grow(null);
  });
  buds.forEach((b, j) => {
    const s = vineBudNow(vn, j);
    if (s < 0.05) return;
    grow({ x: b.x, y: b.y, kind: 'bud' }); vineBud(vn, b.x, b.y, b.a, b.r * s); grow(null);
  });
  flowers.forEach((f, j) => {
    const T = vineTipNow(vn, j);
    if (!T) return;
    grow({ x: f.x, y: f.y, kind: 'flower' });
    if (T.k === 'flower') {
      if (T.amt > 0.6) vn.shed(f.x, f.y, f.r, false);
      vineFlower(vn, f.x, f.y, SEAS ? f.r * (0.5 + 0.5 * T.amt) : f.r, f.style, f.rot, false, SEAS ? 0.3 + 0.7 * T.amt : 1);
    } else if (T.k === 'bud') { if (T.s > 0.05) vineBud(vn, f.x, f.y, f.rot, f.r * 0.55 * T.s); }
    else {                                           // a hip where the flower was
      c.globalAlpha = 1; c.fillStyle = vineMix(SEASON_HIP, '#6e4a3e', vn.winter); c.strokeStyle = vn.BG; c.lineWidth = vn.GAP;
      vineDot(c, f.x, f.y, Math.max(1.5, f.r * 0.3)); c.stroke();
    }
    grow(null);
  });
}

// 5. A node bloom on a rosette of leaves: the node's own part
function vineNodeBloom(vn, n, i) {
  const { c, V, RB, grow, nodeOpen, SEAS } = vn, TAU = Math.PI * 2, BG = vn.BG;
  const br = VINE_BLOOM_R * (n.size || 1) * (0.9 + RB() * 0.2), rot = RB() * TAU, sp = RB();
  const m = 4 + Math.floor(RB() * 3), a0 = RB() * TAU;
  const style = V.bloom === 'mixed' ? VINE_BLOOMS[Math.floor(sp * 3)] : V.bloom;
  c.own(i);
  for (let q = 0; q < m; q++) {
    const a = a0 + q / m * TAU + (RB() - 0.5) * 0.4, L = br * (0.75 + RB() * 0.25);
    if (V.leaves / 100 > 0) {
      const lx = n.x + Math.cos(a) * br * 0.35, ly = n.y + Math.sin(a) * br * 0.35;
      const shp = V.leaf === 'ivy' ? 'ivy' : V.leaf === 'round' ? 'round' : 'almond';
      vineFallMark(vn, 100000 + i * 16 + q, lx, ly, a, L, shp);
      const ln = vineLeafNow(vn, 100000 + i * 16 + q, VINE_LEAF[q % 2]);
      if (ln) {
        grow({ x: lx, y: ly, kind: 'leaf' });
        vineLeaf(vn, lx, ly, a, L * ln.s, shp, ln.col);
        grow(null);
      }
    }
  }
  grow({ x: n.x, y: n.y, kind: 'flower' });
  if (nodeOpen > 0.6) vn.shed(n.x, n.y, br, true);
  if (nodeOpen < 0.05 && vn.YR > 1) {               // autumn, winter: a large hip
    c.globalAlpha = 1; c.fillStyle = vineMix(SEASON_HIP, '#6e4a3e', vn.winter); c.strokeStyle = BG; c.lineWidth = vn.GAP;
    vineDot(c, n.x, n.y, br * 0.3); c.stroke();
    c.fillStyle = BG; vineDot(c, n.x - br * 0.08, n.y - br * 0.09, Math.max(0.8, br * 0.06));
  } else if (nodeOpen < 0.05) vineBud(vn, n.x, n.y, rot, br * 0.55);   // early spring: a bud
  else vineFlower(vn, n.x, n.y, br, style, rot, true, SEAS ? 0.3 + 0.7 * nodeOpen : 1);
  grow(null);
  c.own(-1);
}
