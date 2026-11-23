// ── Falling petals ──
// Falling petals (Vines): every flower the renderer marked (Rec.markPetal)
// lets a petal go now and then: per flower, one chance per PT_SLOT s (node
// blooms PT_BIG × as often), PT_P of the slots, at a hashed moment. A petal
// leaves from a hashed spot on the flower, picks up speed to its own fall
// speed (PT_FALL, time constant PT_TAU), sways side to side, turns and tumbles
// (its width follows a cosine: seen edge-on now and then), and fades out over
// the last PT_OUT of its life. It falls screen-down (after symmetry, spin and
// the design's rotation), one flower per symmetry copy, only from a flower in
// its copy's wedge; with Wind it is blown along (+x). Everything is a pure
// function of time, so a paused frame and its PNG match. Left out of the cut
// and the SVG exports (plain, from renderTo). Draw on: petals only from an open flower,
// fading with it as it folds.
const PETAL_MODES = ['vine'];
const PT_SLOT = 5, PT_BIG = 2.5, PT_P = 0.6, PT_LIFE = [4.5, 7.5], PT_FALL = [20, 34], PT_TAU = 0.8;
const PT_SWAY = [5, 14], PT_FREQ = [1.3, 2.3], PT_IN = 0.35, PT_OUT = 0.3, PT_WIND = 16, PT_MIN = 2.5;
// This frame's petals of one flower i: [{ dx, dy, rot, flip, L, col, al }],
// dx / dy from the flower's centre, in world units, screen-aligned
function petalFrame(p, i, t, rate, wind, salt) {
  const out = [];
  const slot = PT_SLOT / rate / (p.big ? PT_BIG : 1), k0 = Math.floor(t / slot);
  const back = Math.ceil(PT_LIFE[1] / slot) + 1;
  for (let k = k0; k >= k0 - back; k--) {
    const h = j => twHash(i * 7.31 + k * 13.17 + j * 2.71 + salt);
    if (h(1) > PT_P) continue;
    const t0 = (k + 0.9 * h(2)) * slot, age = t - t0, life = PT_LIFE[0] + (PT_LIFE[1] - PT_LIFE[0]) * h(3);
    if (age < 0 || age >= life) continue;
    const v = PT_FALL[0] + (PT_FALL[1] - PT_FALL[0]) * h(4);
    const fall = v * (age - PT_TAU * (1 - Math.exp(-age / PT_TAU)));
    const sw = PT_SWAY[0] + (PT_SWAY[1] - PT_SWAY[0]) * h(5), w = PT_FREQ[0] + (PT_FREQ[1] - PT_FREQ[0]) * h(6), ph = h(7) * 6.283;
    const ease = 1 - Math.exp(-age / 0.6);                         // the sway builds up once it is free
    const a = h(8) * 6.283, d = p.r * (0.3 + 0.45 * h(9));       // where on the flower it leaves
    const blow = wind ? PT_WIND * (age - 0.6 * ease) * (0.7 + 0.6 * h(10)) : 0;
    const dx = Math.cos(a) * d + sw * ease * Math.sin(w * age + ph) + blow;
    const dy = Math.sin(a) * d * 0.6 + fall;
    const rot = a + (h(11) - 0.5) * 2.4 * age + 0.5 * Math.cos(w * age + ph);
    const flip = Math.cos(w * 1.3 * age + h(12) * 6.283);
    const al = Math.min(1, age / PT_IN) * Math.min(1, (life - age) / (life * PT_OUT));
    out.push({ dx, dy, rot, flip, L: Math.max(PT_MIN, p.r * (p.big ? 0.4 : 0.5) * (0.8 + 0.4 * h(13))), col: p.col[h(14) < 0.5 ? 0 : 1], al });
  }
  return out;
}
// Falling petals of one list, through every symmetry copy (see above)
// Falling leaves (Seasons): this frame's pose of leaf l, or null. Its age is
// real seconds since its fall moment (tf) in the year.
function leafFallFrame(l, i, ys, spd, wind) {
  const yr = ((l.y0 + ys) % 4 + 4) % 4, age = ((yr - l.tf) % 4 + 4) % 4 * SEASON_S / spd;
  const h = j => twHash(i * 5.17 + j * 3.07 + l.tf * 11.3);
  const life = LF_LIFE[0] + (LF_LIFE[1] - LF_LIFE[0]) * h(1);
  if (age >= life || ys * SEASON_S / spd < age) return null;     // (nothing fell before Play)
  const v = LF_FALL[0] + (LF_FALL[1] - LF_FALL[0]) * h(2);
  const fall = v * (age - LF_TAU * (1 - Math.exp(-age / LF_TAU)));
  const sw = LF_SWAY[0] + (LF_SWAY[1] - LF_SWAY[0]) * h(3), w = PT_FREQ[0] + (PT_FREQ[1] - PT_FREQ[0]) * h(4), ph = h(5) * 6.283;
  const ease = 1 - Math.exp(-age / 0.8);
  const blow = wind ? PT_WIND * (age - 0.8 * ease) * (0.7 + 0.6 * h(6)) : 0;
  return { dx: sw * ease * Math.sin(w * age + ph) + blow, dy: fall, rot: l.a + (h(7) - 0.5) * 1.6 * age + 0.6 * ease * Math.cos(w * age + ph),
    flip: Math.cos(w * 1.1 * age + h(8) * 6.283), al: Math.min(1, (life - age) / (life * PT_OUT)) };
}
const LF_LIFE = [5, 8], LF_FALL = [14, 24], LF_TAU = 1, LF_SWAY = [10, 24];
// plain: an export that leaves out the overlay effects (cut, strokes SVG)
function drawPetals(x, ops, a, prog, wp, isL2, copies, F, plain = false) {
  if (F && F.ys != null && !plain && x.setTransform && ops.leafFall && a > 0.003) drawLeafFall(x, ops, a, wp, copies, F);
  if (!F || F.pt == null || plain || !x.setTransform || !ops.petals || a <= 0.003 || !PETAL_MODES.includes(isL2 ? S.layer.mode : S.mode)) return;
  const rate = ANIM.opts.ptRate ?? 1;
  const A = prog < 1 ? (F.np ? animTimesNode(ops) : animTimes(ops)) : null;
  const T = x.getTransform(), s = Math.sqrt(Math.abs(T.a * T.d - T.b * T.c)) || 1;
  const al = Math.min(1, a), salt = isL2 ? 0.53 : 0;
  x.save();
  x.lineJoin = 'round';
  ops.petals.forEach((p, i) => {
    const u = A && p.g ? growAmt(ops, p.g, A, prog < 1 ? F.np : null, A ? prog * A.max : Infinity) : 1;
    if (u <= 0) return;
    const P = petalFrame(p, i, F.pt, rate, F.ptWind, salt);
    if (!P.length) return;
    let fx = p.x, fy = p.y;
    if (wp) { const o = wp(fx, fy); fx += o[0]; fy += o[1]; }
    copies.forEach(cp => {
      const q = copyPoint(cp, fx, fy);
      if (cp.wedge) {
        let an = Math.atan2(q.y, q.x) - cp.wedge[0];
        an -= Math.floor(an / (Math.PI * 2)) * Math.PI * 2;
        if (an > cp.wedge[1] - cp.wedge[0]) return;
      }
      const cx = T.a * q.x + T.c * q.y + T.e, cy = T.b * q.x + T.d * q.y + T.f;
      P.forEach(r => {
        const co = Math.cos(r.rot), sn = Math.sin(r.rot), f = Math.sign(r.flip || 1) * Math.max(0.12, Math.abs(r.flip));
        x.setTransform(s * co, s * sn, -s * sn * f, s * co * f, cx + r.dx * s, cy + r.dy * s);
        const L = r.L, W = L * 0.42;
        x.globalAlpha = al * u * r.al;
        x.fillStyle = r.col; x.strokeStyle = p.bg; x.lineWidth = Math.max(0.4, L * 0.07);
        x.beginPath(); x.moveTo(-L * 0.5, 0);
        x.bezierCurveTo(-L * 0.25, W, L * 0.3, W, L * 0.5, 0);
        x.bezierCurveTo(L * 0.3, -W, -L * 0.25, -W, -L * 0.5, 0);
        x.closePath(); x.fill(); x.stroke();
      });
    });
  });
  x.restore();
}

function drawLeafFall(x, ops, a, wp, copies, F) {
  const spd = ANIM.opts.ssSpd || 1, T = x.getTransform(), s = Math.sqrt(Math.abs(T.a * T.d - T.b * T.c)) || 1, al = Math.min(1, a);
  x.save();
  x.lineJoin = 'round'; x.lineCap = 'round';
  ops.leafFall.forEach((l, i) => {
    const r = leafFallFrame(l, i, F.ys, spd, F.ptWind);
    if (!r) return;
    let fx = l.x, fy = l.y;
    if (wp) { const o = wp(fx, fy); fx += o[0]; fy += o[1]; }
    copies.forEach(cp => {
      const q = copyPoint(cp, fx, fy);
      if (cp.wedge) {
        let an = Math.atan2(q.y, q.x) - cp.wedge[0];
        an -= Math.floor(an / (Math.PI * 2)) * Math.PI * 2;
        if (an > cp.wedge[1] - cp.wedge[0]) return;
      }
      const cx = T.a * q.x + T.c * q.y + T.e, cy = T.b * q.x + T.d * q.y + T.f;
      const co = Math.cos(r.rot), sn = Math.sin(r.rot), f = Math.sign(r.flip || 1) * Math.max(0.15, Math.abs(r.flip));
      x.setTransform(s * co, s * sn, -s * sn * f, s * co * f, cx + r.dx * s, cy + r.dy * s);
      const L = l.L, W = L * (l.shape === 'round' || l.shape === 'ivy' ? 0.42 : 0.3);
      x.globalAlpha = al * r.al;
      x.fillStyle = l.col; x.strokeStyle = l.bg; x.lineWidth = Math.max(0.5, L * 0.05);
      x.beginPath(); x.moveTo(-L * 0.5, 0);
      x.bezierCurveTo(-L * 0.3, W, L * 0.2, W * 0.9, L * 0.5, 0);
      x.bezierCurveTo(L * 0.2, -W * 0.9, -L * 0.3, -W, -L * 0.5, 0);
      x.closePath(); x.fill();
      x.beginPath(); x.moveTo(-L * 0.42, 0); x.lineTo(L * 0.3, 0); x.stroke();
    });
  });
  x.restore();
}

// ── Current ──
// Current (PCB, Synaptic Web, Geometrical Schematics, Constellation): bright
// pulses run along the lines, one line at a time, and the end of a line
// flashes when a pulse arrives. currentPaths() walks a display list once
// (cached on it) and keeps its stroked, open subpaths as polylines in the
// list's own frame: at least CUR_MINLEN long, mostly straight or curved (not
// circles), not faint, duplicates dropped. Lines with an end on a node are
// preferred, and run towards that node; at most CUR_MAX. Each line has its own
// rest between pulses and its own phase (hashes of its points, no R() draws).
// Drawn on top of the list every frame (cached or not), like the Blink lids.
const CURRENT_MODES = ['pcb', 'web', 'chaosgate', 'constellation'];
const CUR_V = 150, CUR_TAIL = 70, CUR_FLASH = 0.45, CUR_MAX = 70, CUR_MINLEN = 40, CUR_NODE_R = 70;
const CUR_COL = { pcb: '#fff1c2', web: '#e9f6ff', chaosgate: '#ffffff', constellation: '#fff8dc' };
function curAlpha(col) {
  const m = typeof col === 'string' && col.match(/rgba?\([^)]*,\s*([\d.]+)\s*\)/);
  return m && col.startsWith('rgba') ? parseFloat(m[1]) : 1;
}
function currentPaths(ops, mode) {
  if (ops._cur) return ops._cur;
  // Schematics: its links are cut round the glyphs into short runs between them, so keep them all
  const sch = mode === 'chaosgate', minLen = sch ? 20 : CUR_MINLEN;
  let M = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const tp = (x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
  const scl = () => Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) || 1;
  let subs = [], cur = null, has = false, cx = 0, cy = 0, s0x = 0, s0y = 0, filled = false;
  let lw = 1, ga = 1, ss = '#fff';
  const lwStack = [];
  const found = [];
  const start = (x, y) => { cur = { pts: [tp(x, y)], arc: 0 }; subs.push(cur); has = true; cx = s0x = x; cy = s0y = y; };
  const add = (x, y) => { cur.pts.push(tp(x, y)); cx = x; cy = y; };
  for (let i = 0; i < ops.length; i += 3) {
    const m = ops[i + 1], a = ops[i + 2];
    if (ops[i] === 1) {
      if (m === 'lineWidth') lw = a; else if (m === 'globalAlpha') ga = a; else if (m === 'strokeStyle') ss = a;
      continue;
    }
    switch (m) {
      case 'save': stack.push(M.slice()); lwStack.push([lw, ga, ss]); break;
      case 'restore': M = stack.pop() || M; [lw, ga, ss] = lwStack.pop() || [lw, ga, ss]; break;
      case 'translate': M[4] += M[0] * a[0] + M[2] * a[1]; M[5] += M[1] * a[0] + M[3] * a[1]; break;
      case 'scale': M[0] *= a[0]; M[1] *= a[0]; M[2] *= a[1]; M[3] *= a[1]; break;
      case 'rotate': {
        const co = Math.cos(a[0]), si = Math.sin(a[0]), [m0, m1, m2, m3] = M;
        M[0] = m0 * co + m2 * si; M[1] = m1 * co + m3 * si; M[2] = m2 * co - m0 * si; M[3] = m3 * co - m1 * si;
        break;
      }
      case 'setTransform': case 'resetTransform': M = m === 'setTransform' && a.length >= 6 ? a.slice(0, 6) : [1, 0, 0, 1, 0, 0]; break;
      case 'beginPath': subs = []; has = false; filled = false; break;
      case 'moveTo': start(a[0], a[1]); break;
      case 'rect': case 'roundRect': has = false; break;
      case 'lineTo': if (!has) start(a[0], a[1]); else add(a[0], a[1]); break;
      case 'quadraticCurveTo': case 'bezierCurveTo': {
        if (!has) start(a[0], a[1]);
        const q = a.length === 4 ? [cx, cy, a[0], a[1], a[0], a[1], a[2], a[3]] : [cx, cy, ...a];
        if (a.length === 4) { q[2] = cx + (a[0] - cx) * 2 / 3; q[3] = cy + (a[1] - cy) * 2 / 3; q[4] = a[2] + (a[0] - a[2]) * 2 / 3; q[5] = a[3] + (a[1] - a[3]) * 2 / 3; }
        const n = 12;
        for (let k = 1; k <= n; k++) {
          const u = k / n, v = 1 - u;
          add(v * v * v * q[0] + 3 * v * v * u * q[2] + 3 * v * u * u * q[4] + u * u * u * q[6], v * v * v * q[1] + 3 * v * v * u * q[3] + 3 * v * u * u * q[5] + u * u * u * q[7]);
        }
        break;
      }
      case 'arc': {
        const [x, y, r, a0, a1, ccw] = a, sw = arcSweep(a0, a1, !!ccw), dir = ccw ? -1 : 1;
        const bx = x + r * Math.cos(a0), by = y + r * Math.sin(a0);
        if (!has) start(bx, by); else add(bx, by);
        const n = Math.max(2, Math.min(48, Math.ceil(r * sw / 8)));
        for (let k = 1; k <= n; k++) { const t = a0 + dir * sw * k / n; add(x + r * Math.cos(t), y + r * Math.sin(t)); }
        cur.arc += r * sw * scl();
        break;
      }
      case 'closePath': if (has) { add(s0x, s0y); cur.closed = true; } break;
      case 'fill': case 'clip': filled = true; break;
      case 'stroke':
        if (!filled) subs.forEach(sp => { if (!sp.done) { sp.done = true; sp.w = lw * scl(); sp.al = ga * curAlpha(ss); found.push(sp); } });
        break;
    }
  }
  // Keep the lines: lengths, filters, duplicates
  const nodes = ops.rn || S.nodes;
  const nearNode = (p) => { let d = Infinity, ni = -1; nodes.forEach((q, j) => { const e = Math.hypot(p[0] - q.x, p[1] - q.y); if (e < d) { d = e; ni = j; } }); return [d, ni]; };
  const seen = new Set(), keep = [];
  found.forEach(sp => {
    const P = sp.pts;
    if (sp.closed || P.length < 2 || sp.al < 0.25) return;
    const cum = [0];
    for (let k = 1; k < P.length; k++) cum.push(cum[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
    const len = cum[cum.length - 1], A = P[0], B = P[P.length - 1];
    if (len < minLen || Math.hypot(B[0] - A[0], B[1] - A[1]) < 12 || sp.arc > 0.5 * len) return;   // (nearly closed: an outline)
    const key = [A[0], A[1], B[0], B[1]].map(v => Math.round(v / 3)).sort().join() + ':' + Math.round(len / 5);
    if (seen.has(key)) return;
    seen.add(key);
    const [dA, nA] = nearNode(A), [dB, nB] = nearNode(B);
    // Hash of the ends relative to their nodes, in 25-unit steps, so a line keeps
    // its rhythm when Drift re-records it a little further on
    const rel = (P2, ni) => ni < 0 ? [Math.round(P2[0] / 25), Math.round(P2[1] / 25)] : [Math.round((P2[0] - nodes[ni].x) / 25), Math.round((P2[1] - nodes[ni].y) / 25)];
    const ra = rel(A, nA), rb = rel(B, nB);
    const h = (k) => sr(ra[0] * 7.31 + ra[1] * 13.79 + rb[0] * 1.13 + rb[1] * 5.57 + nA * 3.7 + nB * 11.9 + Math.round(len / 25) * 0.917 + k * 17.3);
    const onA = dA < CUR_NODE_R, onB = dB < CUR_NODE_R;
    if (!onA && !onB && !sch && h(1) < 0.5) return;
    // run towards a node end (or either way)
    const rev = onA && !onB ? true : !onA && onB ? false : h(2) < 0.5;
    const pts = rev ? P.slice().reverse() : P, cl = rev ? cum.map(v => len - v).reverse() : cum;
    // own speed (0.55–1.5× CUR_V) and rest; the sliders scale them per frame (currentFrame)
    keep.push({ pts, cum: cl, len, w: Math.max(1, Math.min(4, sp.w)), rest: 1.2 + 3.5 * h(3), ph: h(4), vk: 0.55 + 0.95 * h(5),
      ns: rev ? nB : nA, ne: rev ? nA : nB, score: len * (onA || onB ? 2 : 1) });
  });
  keep.sort((p, q) => q.score - p.score);
  return (ops._cur = keep.slice(0, CUR_MAX));
}
// Point at arc length d along a kept line (binary search on cum)
function curAt(L, d) {
  const C = L.cum, P = L.pts;
  if (d <= 0) return P[0];
  if (d >= L.len) return P[P.length - 1];
  let lo = 0, hi = C.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (C[mid] <= d) lo = mid; else hi = mid; }
  const f = C[hi] > C[lo] ? (d - C[lo]) / (C[hi] - C[lo]) : 0;
  return [P[lo][0] + (P[hi][0] - P[lo][0]) * f, P[lo][1] + (P[hi][1] - P[lo][1]) * f];
}
// This frame's pulses of a list: [{ tail: [[x, y]…], head, w, flash, at }]
function currentFrame(ops, t, wp, np, mode) {
  const out = [];
  const W = wp ? (p => { const o = wp(p[0], p[1]); return [p[0] + o[0], p[1] + o[1]]; }) : (p => p);
  const spd = ANIM.opts.curSpd || 1, rate = ANIM.opts.curRate || 1;
  currentPaths(ops, mode).forEach(L => {
    if (np && ((np[L.ns] ?? 1) < 1 || (np[L.ne] ?? 1) < 1)) return;
    const V = CUR_V * L.vk * spd, per = L.len / V + L.rest / rate;
    const u = ((t + L.ph * per) % per + per) % per, d = u * V;
    const fl = (d - L.len) / (V * CUR_FLASH);
    if (d > L.len + CUR_TAIL && fl >= 1) return;   // (rest)
    const tl = Math.min(CUR_TAIL, L.len * 0.5), n = 6, tail = [];
    for (let k = 0; k <= n; k++) tail.push(W(curAt(L, Math.min(L.len, d) - tl * (1 - k / n) * (d > L.len ? Math.max(0, 1 - (d - L.len) / tl) : 1))));
    out.push({ tail, head: d <= L.len ? tail[n] : null, w: L.w, flash: fl >= 0 && fl < 1 ? fl : -1, at: W(L.pts[L.pts.length - 1]) });
  });
  return out;
}
function drawPulse(x, P, col, a, lwMul) {
  const w = P.w * lwMul, T = P.tail, n = T.length - 1;
  x.strokeStyle = col; x.fillStyle = col; x.lineCap = 'round'; x.lineJoin = 'round';
  // glow, then a core that fades towards the tail end
  x.globalAlpha = 0.2 * a; x.lineWidth = w * 4;
  x.beginPath(); T.forEach((p, k) => k ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.stroke();
  x.lineWidth = w * 1.5;
  for (let k = 1; k <= n; k++) {
    x.globalAlpha = a * k / n;
    x.beginPath(); x.moveTo(T[k - 1][0], T[k - 1][1]); x.lineTo(T[k][0], T[k][1]); x.stroke();
  }
  if (P.head) {
    x.globalAlpha = 0.3 * a; x.beginPath(); x.arc(P.head[0], P.head[1], w * 4.5, 0, Math.PI * 2); x.fill();
    x.globalAlpha = a; x.beginPath(); x.arc(P.head[0], P.head[1], w * 1.8, 0, Math.PI * 2); x.fill();
  }
  if (P.flash >= 0) {
    const f = P.flash, e = 1 - f;
    x.globalAlpha = 0.35 * a * e; x.beginPath(); x.arc(P.at[0], P.at[1], w * (3 + 9 * f), 0, Math.PI * 2); x.fill();
    x.globalAlpha = a * e; x.beginPath(); x.arc(P.at[0], P.at[1], w * 2.2, 0, Math.PI * 2); x.fill();
  }
}

// ── Twinkle ──
// Twinkle (Constellation, Nebula): every star the renderer marked (Rec.markStar)
// flickers at its own rhythm: a faint shimmer all the time, and once a period
// (1.6–5 s) a twinkle that flares it (glow, and cross spikes when bright) or,
// for Constellation's small stars, dims it under the star mask colour. Node
// stars only glow, slower. Now and then a shooting star crosses the stars'
// area (one slot of SHOOT_SLOT s, most slots one meteor). Everything is a
// hash of the star's index and the time: no R() draws, stills unchanged.
// Drawn on top of the list every frame, like Current.
// ── Sunlight ──
// Sunlight (Cathedral Glass, Stained Glass): a band of sunlight sweeps across
// the window, from the upper left, and every piece it passes brightens as a
// whole: Cathedral glass glows in its own colour, the leaded mode's cells fill
// with a warm glow. One pass takes SUN_SWEEP s, then SUN_REST s of shade (both
// × Sun speed). The band lies in the design's own space, across all symmetry
// copies at once. Drawn on top of the (cached) list each frame: a lit piece
// is redrawn whole (glass, shading, lead), and so is every later piece that
// lies over a redrawn one (Tiffany flowers on their ground), then the heavier
// leads; the recording is unchanged, so stills are not affected.
const SUN_MODES = ['glass', 'stained'];
const SUN_SWEEP = 6, SUN_REST = 4;        // seconds per pass, seconds of shade between passes
const SUN_ANGLE = 0.6;                     // the light's direction, rad below the horizontal (towards the lower right)
const SUN_W = 0.22;                        // band half-width, × the window's radius
const SUN_GAIN = 0.9, SUN_WARM = [70, 62, 40];   // glass: colour × (1 + gain·k) + warm·k
const SUN_GLOW = 0.32;                     // leaded: glow alpha at full light
const SUN_MIN = 0.04, SUN_STEPS = 16;      // unlit below this; k in steps (colour caches stay small)
// Per recording: centroids, bounds, the earlier pieces each piece lies over, the window radius
function sunPrep(ops) {
  if (ops._sun) return ops._sun;
  const P = ops.panes || [], L = ops.leads || [];
  const box = pts => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; pts.forEach(q => { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }); return [x0, y0, x1, y1]; };
  let R = 1;
  P.forEach(p => {
    const g = polyCentroid(p.pts);
    p.cx = g.x; p.cy = g.y; p.b = box(p.pts);
    p.test = p.pts.map(q => ({ x: g.x + (q.x - g.x) * 0.9, y: g.y + (q.y - g.y) * 0.9 })).concat([g]);
    R = Math.max(R, Math.hypot(g.x, g.y) + Math.hypot(p.b[2] - p.b[0], p.b[3] - p.b[1]) / 2);
  });
  L.forEach(l => { l.b = box(l.pts); });
  const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  // Painter's order: pieces drawn later may lie over earlier ones. Grid of bounds, then a real test
  const cs = Math.max(8, R / 24), grid = new Map(), cells = b => { const out = []; for (let i = Math.floor(b[0] / cs); i <= Math.floor(b[2] / cs); i++) for (let j = Math.floor(b[1] / cs); j <= Math.floor(b[3] / cs); j++) out.push(i * 100003 + j); return out; };
  P.forEach((p, i) => {
    const seen = new Set();
    p.under = [];
    cells(p.b).forEach(key => {
      const lst = grid.get(key);
      if (lst) lst.forEach(j => {
        if (seen.has(j)) return; seen.add(j);
        const q = P[j];
        if (hit(p.b, q.b) && (p.test.some(t => pip(t, q.pts)) || q.test.some(t => pip(t, p.pts)))) p.under.push(j);
      });
      (lst || grid.set(key, []).get(key)).push(i);
    });
  });
  return (ops._sun = { R, P, L, hit });
}
// Brightened glass colour at light step s (1 … SUN_STEPS)
function sunTint(p, s) {
  const tc = p._tc || (p._tc = {});
  if (tc[s]) return tc[s];
  const q = parseColor(p.col) || { r: 128, g: 128, b: 128 }, k = s / SUN_STEPS, m = 1 + SUN_GAIN * k;
  return (tc[s] = `rgb(${Math.min(255, Math.round(q.r * m + SUN_WARM[0] * k))},${Math.min(255, Math.round(q.g * m + SUN_WARM[1] * k))},${Math.min(255, Math.round(q.b * m + SUN_WARM[2] * k))})`);
}
// The band this frame: position along the light's direction (world units), or null in the shade
function sunBand(t, R) {
  const ph = ((t % (SUN_SWEEP + SUN_REST)) + SUN_SWEEP + SUN_REST) % (SUN_SWEEP + SUN_REST);
  if (ph >= SUN_SWEEP) return null;
  const W = R * SUN_W;
  return { b: -R - 2 * W + (2 * R + 4 * W) * ph / SUN_SWEEP, W, ux: Math.cos(SUN_ANGLE), uy: Math.sin(SUN_ANGLE) };
}
// One piece, redrawn at light step s (0 = as recorded)
function drawPane(y, p, s, lm) {
  const path = () => { const q = p.pts; y.beginPath(); y.moveTo(q[0].x, q[0].y); for (let i = 1; i < q.length; i++) y.lineTo(q[i].x, q[i].y); y.closePath(); };
  if (p.glow) {
    if (s > 0) { y.fillStyle = `rgba(255, 234, 186, ${(SUN_GLOW * s / SUN_STEPS).toFixed(3)})`; path(); y.fill(); }
  } else {
    y.fillStyle = s > 0 ? sunTint(p, s) : p.col; path(); y.fill();
    if (p.light) {
      // Light & shading, as renderGlass draws it
      const sh = k => { const q = p.pts; y.beginPath(); q.forEach((v, i) => { const x = p.cx + (v.x - p.cx) * k, yy = p.cy + (v.y - p.cy) * k; i ? y.lineTo(x, yy) : y.moveTo(x, yy); }); y.closePath(); y.fill(); };
      y.fillStyle = 'hsla(48, 70%, 94%, 0.07)'; sh(0.72);
      y.fillStyle = 'hsla(48, 70%, 95%, 0.07)'; sh(0.48);
      y.fillStyle = 'hsla(48, 70%, 97%, 0.07)'; sh(0.24);
    }
  }
  y.strokeStyle = p.lead; y.lineWidth = p.lw * lm; path(); y.stroke();
  if (p.light && p.lw > 1.2) { y.strokeStyle = 'hsla(40, 15%, 70%, 0.22)'; y.lineWidth = Math.max(0.4, p.lw * 0.22) * lm; y.stroke(); }
}

// ── Life ──
// Life (Microscope): the organisms swim and the cells live. Rods, spirilla and
// pennate diatoms glide along a figure of eight that starts along their own
// axis (they turn with it); cocci and specks jiggle, centric diatoms drift and
// turn slowly, amoebae creep while their lobes flow. Cell membranes wobble and
// the cilia beat in a wave round the cell. The nuclei and organelles stay put,
// so the Blink eyes stay where they are. Everything is a function of the Life
// clock (ANIM.lfTime) and offsets from the recorded shape, so time 0 is the
// still. Groups come from Rec.life; replayAnim moves and redraws them.
const LIFE_MODES = ['microscope'];
const LIFE_SWIM = { rod: [10, 22, 1], spiril: [14, 26, 1.3], diatomP: [3, 6, 0.7] };   // gliders: [speed min, max (units/s), loop size ×]
const LIFE_WANDER = { coccus: [3, 1.3, 0.15], speck: [2.5, 1.8, 0], diatomC: [6, 0.25, 0.06], amoeba: [9, 0.12, 0] };   // [reach, rate rad/s, spin rad/s]
const LIFE_WOBBLE = [3, 4, 6];     // membrane wave numbers; each 0.6–1.4% of the radius
const LIFE_BEAT = 6, LIFE_BEND = 0.45, LIFE_WAVE = 4;   // cilia: beat rad/s, extra bend, waves round the cell
const lifeH = (g, j) => sr(g.hs * 0.37 + j * 101.3);
// This frame's move of an organism: { dx, dy, da } (rotation round its centre), or null
function lifeMove(g, t) {
  if (g.kind === 'cell') return null;
  const H = j => lifeH(g, j), TAU = Math.PI * 2, sw = LIFE_SWIM[g.kind];
  if (sw) {
    const A = (14 + 26 * H(1)) * sw[2], B = A * (0.3 + 0.25 * H(2));
    const v = sw[0] + (sw[1] - sw[0]) * H(3), dir = H(4) < 0.5 ? -1 : 1;
    const L = 4.1 * Math.hypot(A, 2 * B);          // about the loop's length
    const u0 = H(5) * TAU, u = u0 + dir * TAU * v * t / L;
    const P = w => [A * Math.sin(w), B * Math.sin(2 * w)];
    const D = w => Math.atan2(2 * B * Math.cos(2 * w) * dir, A * Math.cos(w) * dir);
    const h0 = D(u0), phi = g.ang - h0, p = P(u), q = P(u0), ex = p[0] - q[0], ey = p[1] - q[1];
    const cs = Math.cos(phi), sn = Math.sin(phi);
    return { dx: ex * cs - ey * sn, dy: ex * sn + ey * cs, da: D(u) - h0 };
  }
  const Wd = LIFE_WANDER[g.kind] || LIFE_WANDER.speck;
  const a = Wd[0] * (0.6 + 0.8 * H(1)), w1 = Wd[1] * (0.7 + 0.6 * H(2)), w2 = w1 * 1.73;
  const p1 = H(3) * TAU, p2 = H(4) * TAU, p3 = H(6) * TAU, p4 = H(7) * TAU;
  const S2 = (w, p) => Math.sin(w * t + p) - Math.sin(p);
  return { dx: a * (S2(w1, p1) + 0.5 * S2(w2, p2)), dy: a * (S2(w1 * 1.21, p3) + 0.5 * S2(w2 * 0.87, p4)),
    da: Wd[2] ? Wd[2] * (H(8) < 0.5 ? -1 : 1) * (0.5 + H(9)) * t : 0 };
}
// Draw on: a group is redrawn live only once it is fully drawn in
function lifeShown(ops, g, prog, np) {
  if (g._kl === undefined) {
    const A = np ? animTimesNode(ops) : animTimes(ops);
    g._kl = -1;
    for (let k = g.i1 / 3 - 1; k >= g.i0 / 3; k--) { const kd = A.kind[k]; if (kd === 1 || kd === 2 || kd === 4) { g._kl = k; break; } }
  }
  return g._kl < 0 || opShown(ops, g._kl, prog, np);
}
// Redraws a cell (cilia, membrane) or an amoeba at Life time t, in place of its recorded ops
function lifeDraw(c, g, t, am, lm) {
  const TAU = Math.PI * 2, H = j => lifeH(g, j);
  if (g.kind === 'cell') {
    const { x, y, r, rot, f } = g;
    const wob = LIFE_WOBBLE.map((k, j) => ({ k, b: r * (0.006 + 0.008 * H(20 + j)), q: H(30 + j) * TAU, w: (0.5 + 0.8 * H(40 + j)) * (H(50 + j) < 0.5 ? -1 : 1) }));
    const R = a => f(a) + wob.reduce((sum, o) => sum + o.b * (Math.sin(o.k * a + o.q + o.w * t) - Math.sin(o.k * a + o.q)), 0);
    const path = m => { for (let i = 0; i <= 64; i++) { const a = i / 64 * TAU, rr = R(a) * m, px = x + Math.cos(a + rot) * rr, py = y + Math.sin(a + rot) * rr; i ? c.lineTo(px, py) : c.moveTo(px, py); } c.closePath(); };
    if (g.cilia) {
      const C = g.cilia, m = C.bends.length;
      c.strokeStyle = g.dim; c.lineWidth = g.lwC * lm; c.beginPath();
      for (let i = 0; i < m; i++) {
        const a = i / m * TAU, rr = R(a), ph = LIFE_BEAT * t - LIFE_WAVE * a;
        const bend = C.bends[i] + LIFE_BEND * (Math.sin(ph) + Math.sin(LIFE_WAVE * a)), len = C.len * (1 + 0.12 * (Math.cos(ph) - Math.cos(LIFE_WAVE * a)));
        const px = x + Math.cos(a + rot) * rr, py = y + Math.sin(a + rot) * rr;
        c.moveTo(px, py);
        c.quadraticCurveTo(px + Math.cos(a + rot + bend) * len * 0.6, py + Math.sin(a + rot + bend) * len * 0.6, px + Math.cos(a + rot + bend * 2) * len, py + Math.sin(a + rot + bend * 2) * len);
      }
      c.stroke();
    }
    c.globalAlpha = am;
    c.fillStyle = g.bg; c.beginPath(); path(1); c.fill();
    c.fillStyle = g.cyt; c.fill();
    c.strokeStyle = g.col; c.lineWidth = g.lwM * lm; c.stroke();
    c.strokeStyle = g.dim; c.lineWidth = g.lwI * lm; c.beginPath(); path(0.9); c.stroke();
    return;
  }
  const M = g.amoeba, { x, y, r, ang } = g, W = M.W;
  const sp = M.h.map((e, j) => (0.25 + 0.45 * H(60 + j)) * (H(70 + j) < 0.5 ? -1 : 1));
  const f = a => r * (1 + M.h.reduce((sum, e, j) => sum + e.a * Math.sin(e.k * a + e.p + sp[j] * t), 0));
  const dot = (px, py, rr) => { c.moveTo(px + rr, py); c.arc(px, py, rr, 0, TAU); };
  c.globalAlpha = am;
  c.fillStyle = M.bg; c.beginPath();
  for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU, rr = f(a), px = x + Math.cos(a + ang) * rr, py = y + Math.sin(a + ang) * rr; i ? c.lineTo(px, py) : c.moveTo(px, py); }
  c.closePath(); c.fill();
  c.strokeStyle = M.col; c.lineWidth = W * 0.9 * lm; c.stroke();
  c.strokeStyle = M.dim; c.lineWidth = W * 0.6 * lm; c.beginPath(); dot(x + r * 0.15, y - r * 0.1, r * 0.22); dot(x - r * 0.3, y + r * 0.2, r * 0.1); c.stroke();
}

const TWINKLE_MODES = ['constellation', 'nebula'];
const TW_DIM = '#040a14';          // Constellation's star mask (renderConstellation)
const TW_MIN = 0.04;               // brightness change below which a star is left alone
const SHOOT_SLOT = 7, SHOOT_P = 0.75, SHOOT_DUR = [0.6, 1.1];
function twHash(x) { const v = Math.sin(x * 91.3458 + 47.853) * 43758.5453; return v - Math.floor(v); }
// Brightness change of star i at time t: -1 dimmed … 0 as drawn … 1 flaring
function twinkleAmt(t, i, kind) {
  const node = kind === 'node';
  const P = (node ? 3 : 1.6) + (node ? 3 : 3.4) * twHash(i + 0.5), u = t / P + twHash(i + 1.7), k = Math.floor(u), f = u - k;
  const sh = (node ? 0.1 : 0.16) * Math.sin(t * (4 + 4 * twHash(i + 3.1)) + i) * Math.sin(t * (1.7 + twHash(i + 4.2)) + i * 1.7);
  let v = sh;
  if (twHash(i * 2.9 + k * 0.71) < (node ? 0.6 : 0.75)) {
    const dur = (node ? 0.9 : 0.25) + (node ? 0.8 : 0.4) * twHash(i * 5.3 + k * 1.1);
    const at = 0.1 + (0.85 - dur / P) * twHash(i * 3.7 + k * 1.31);
    const d = (f - at) * P / dur;
    if (d > 0 && d < 1) {
      const pk = Math.sin(Math.PI * d) ** 2;
      v += (!node && twHash(i * 1.9 + k * 2.3) < 0.3 ? -1 : node ? 0.6 : 1) * pk;
    }
  }
  return node ? Math.max(0, v) : Math.max(-1, Math.min(1, v));
}
// Whether op k of a list is drawn yet (Draw on; the same test as replayAnim)
function opShown(ops, k, prog, np) {
  if (prog >= 1) return true;
  const A = np ? animTimesNode(ops) : animTimes(ops), kd = A.kind[k];
  if (kd === undefined) return true;
  const tau = np ? (np[kd === 2 ? A.pathNid[A.pid[k]] : A.nid[k]] ?? 1) : prog * A.max;
  return kd === 2 ? A.pathT[A.pid[k]] <= tau : (kd === 1 || kd === 4) ? A.te[k] <= tau : true;
}
// This frame's changed stars: [{ x, y, r, col, sp, v }]
function twinkleFrame(ops, t, wp, prog, np) {
  const out = [];
  ops.stars.forEach((st, i) => {
    const v = twinkleAmt(t, i, st.kind);
    if (v > TW_MIN ? false : v < -TW_MIN ? !st.dim : true) return;
    if (!opShown(ops, st.k, prog, np)) return;
    let x = st.x, y = st.y;
    if (wp) { const o = wp(x, y); x += o[0]; y += o[1]; }
    out.push({ x, y, r: st.r, col: st.col, sp: st.sp, v, node: st.kind === 'node' });
  });
  return out;
}
function drawTwinkle(x, q, a) {
  const { r, v } = q;
  x.save();
  if (v < 0) {
    x.fillStyle = TW_DIM; x.globalAlpha = Math.min(1, -v * 0.8) * a;
    x.beginPath(); x.arc(q.x, q.y, r * 1.15, 0, Math.PI * 2); x.fill();
    x.restore();
    return;
  }
  x.fillStyle = q.col; x.strokeStyle = q.col; x.lineCap = 'round';
  const g = q.node ? Math.max(r * 2, q.sp * 0.6) : r * (2.2 + 2.8 * v);
  x.globalAlpha = 0.1 * v * a; x.beginPath(); x.arc(q.x, q.y, g * (q.node ? 1 + 0.5 * v : 1.6), 0, Math.PI * 2); x.fill();
  x.globalAlpha = 0.22 * v * a; x.beginPath(); x.arc(q.x, q.y, g * (q.node ? 0.6 + 0.3 * v : 0.8), 0, Math.PI * 2); x.fill();
  x.globalAlpha = Math.min(1, 0.9 * v) * a; x.beginPath(); x.arc(q.x, q.y, r * (1 + 0.25 * v), 0, Math.PI * 2); x.fill();
  if (v > 0.45 && !q.node) {
    const e = (v - 0.45) / 0.55, L = Math.max(q.sp * (1 + 0.5 * e), r * (3 + 6 * e));
    x.globalAlpha = 0.8 * e * a; x.lineWidth = Math.max(0.6, r * 0.4);
    x.beginPath(); x.moveTo(q.x - L, q.y); x.lineTo(q.x + L, q.y); x.moveTo(q.x, q.y - L); x.lineTo(q.x, q.y + L); x.stroke();
  }
  x.restore();
}
// Shooting star of a list at time t, or null: { x0, y0, dx, dy, L, u, w, col }
// (u: 0–1 through its flight). The area is the stars' bounding box (cached).
function shootFrame(ops, t) {
  let B = ops._twB;
  if (B === undefined) {
    B = null;
    const S2 = ops.stars.filter(st => st.kind !== 'node');
    if (S2.length >= 8) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      S2.forEach(st => { x0 = Math.min(x0, st.x); y0 = Math.min(y0, st.y); x1 = Math.max(x1, st.x); y1 = Math.max(y1, st.y); });
      const rs = S2.map(st => st.r).sort((p, q) => p - q);
      B = { x0, y0, w: x1 - x0, h: y1 - y0, r: rs[rs.length >> 1], col: S2[0].col, salt: ops.stars.length * 0.37 };
      if (B.w < 60 || B.h < 60) B = null;
    }
    ops._twB = B;
  }
  const rate = ANIM.opts.shoot ?? 1;
  if (!B || rate <= 0) return null;
  const slot = SHOOT_SLOT / rate, k0 = Math.floor(t / slot);
  for (const k of [k0, k0 - 1, k0 - 2, k0 - 3]) {
    const h = j => twHash(k * 13.7 + j * 3.31 + B.salt);
    if (h(1) > SHOOT_P) continue;
    const dur = SHOOT_DUR[0] + (SHOOT_DUR[1] - SHOOT_DUR[0]) * h(2), st = k * slot + Math.max(0, slot - 1.2) * h(3), u = (t - st) / dur;
    if (u < 0 || u >= 1) continue;
    const an = (h(4) < 0.5 ? 0.12 : 0.62) * Math.PI + h(5) * 0.26 * Math.PI;   // down to the right or to the left
    const D = Math.hypot(B.w, B.h), L = D * (0.22 + 0.18 * h(6));
    return { x0: B.x0 + B.w * (0.15 + 0.7 * h(7)), y0: B.y0 + B.h * (0.05 + 0.55 * h(8)), dx: Math.cos(an), dy: Math.sin(an),
      L, u, w: Math.max(0.8, B.r * 0.9), col: B.col };
  }
  return null;
}
function drawShoot(x, M, a) {
  const ease = 1 - (1 - M.u) ** 2, hd = M.L * ease, tl = Math.min(hd, M.L * 0.38);
  const env = Math.min(1, M.u / 0.12) * Math.min(1, (1 - M.u) / 0.35);
  if (env <= 0 || tl <= 0) return;
  const P = d => [M.x0 + M.dx * d, M.y0 + M.dy * d], n = 8, T = [];
  for (let k = 0; k <= n; k++) T.push(P(hd - tl * (1 - k / n)));
  x.save();
  x.strokeStyle = M.col; x.fillStyle = M.col; x.lineCap = 'round';
  x.globalAlpha = 0.18 * env * a; x.lineWidth = M.w * 4;
  x.beginPath(); x.moveTo(T[0][0], T[0][1]); x.lineTo(T[n][0], T[n][1]); x.stroke();
  x.lineWidth = M.w * 1.2;
  for (let k = 1; k <= n; k++) {
    x.globalAlpha = env * a * (k / n) ** 1.5;
    x.beginPath(); x.moveTo(T[k - 1][0], T[k - 1][1]); x.lineTo(T[k][0], T[k][1]); x.stroke();
  }
  x.globalAlpha = 0.3 * env * a; x.beginPath(); x.arc(T[n][0], T[n][1], M.w * 4, 0, Math.PI * 2); x.fill();
  x.globalAlpha = env * a; x.beginPath(); x.arc(T[n][0], T[n][1], M.w * 1.5, 0, Math.PI * 2); x.fill();
  x.restore();
}

// ── Strikes ──
// Strikes (Lightning): the recorded discharge rests at STRIKE_REST; one strike
// per slot of STRIKE_SLOT s (a few slots skipped) picks a bolt (or a node,
// with no bolts), never the same one twice running. The stepped leader runs
// down the bolt in LEADER_T s, the bolt flashes (sometimes a return stroke:
// flash, dip, flash), and the branches off the bolt and off both its end
// nodes crawl outward at CRAWL_V (each starts where it forks off its parent),
// then everything fades in STRIKE_AFTER. strikeTree() links the renderer's
// marks (Rec.markBolts) into a tree once per list; strikeSet() orders one
// target's branches by start time (at most STRIKE_MAXB). All hashes of the
// slot number: no R() draws, stills unchanged. Drawn on top every frame.
const STRIKE_MODES = ['lightning'];
const STRIKE_REST = 0.3, STRIKE_SLOT = 1.5, STRIKE_SKIP = 0.15, LEADER_T = 0.14, CRAWL_V = 420, STRIKE_AFTER = 0.55, STRIKE_MAXB = 400, STRIKE_LIFE = 3.2;
const STRIKE_CORE = '#f2f7ff', STRIKE_EDGE = '#8fb8ff', STRIKE_BRANCH = '#cfe0ff';
function strikeTree(ops) {
  if (ops._stk) return ops._stk;
  const L = ops.light, arc = P => { const c = [0]; for (let k = 1; k < P.length; k++) c.push(c[k - 1] + Math.hypot(P[k].x - P[k - 1].x, P[k].y - P[k - 1].y)); return c; };
  const items = new Map();
  const mk = (b, bolt) => { const cum = arc(b.pts); const it = { ...b, cum, len: cum[cum.length - 1], kids: [], bolt }; items.set(b.id, it); return it; };
  const bolts = L.bolts.map(b => mk(b, true));
  L.branches.forEach(b => mk(b, false));
  const nodeKids = new Map();
  L.branches.forEach(b => {
    const it = items.get(b.id);
    if (b.pid < 0) { const i = -1 - b.pid; if (!nodeKids.has(i)) nodeKids.set(i, []); nodeKids.get(i).push({ it, at: 0 }); return; }
    const P = items.get(b.pid);
    if (!P) return;
    // where it forks off its parent: the parent's nearest point
    const p0 = b.pts[0];
    let bi = 0, bd = Infinity;
    P.pts.forEach((q, k) => { const d = (q.x - p0.x) ** 2 + (q.y - p0.y) ** 2; if (d < bd) { bd = d; bi = k; } });
    P.kids.push({ it, at: P.cum[bi] });
  });
  const nodesWith = [...nodeKids.keys()].sort((p, q) => p - q);
  return (ops._stk = { bolts, nodeKids, nodesWith, sets: new Map() });
}
// One target's parts with their start times: [{ it, t0, v }], bolt first
function strikeSet(T, tg) {
  if (T.sets.has(tg)) return T.sets.get(tg);
  const out = [], queue = [];
  const push = (it, t0, v) => queue.push({ it, t0, v });
  if (T.bolts.length) {
    const B = T.bolts[tg];
    push(B, 0, Math.max(1, B.len) / LEADER_T);
    (T.nodeKids.get(B.a) || []).forEach(k => push(k.it, 0.02, CRAWL_V));
    (T.nodeKids.get(B.b) || []).forEach(k => push(k.it, LEADER_T, CRAWL_V));
  } else (T.nodeKids.get(T.nodesWith[tg]) || []).forEach(k => push(k.it, 0.02, CRAWL_V));
  while (queue.length) {
    queue.sort((p, q) => p.t0 - q.t0);
    const e = queue.shift();
    if (e.t0 > STRIKE_LIFE - STRIKE_AFTER || out.length >= STRIKE_MAXB) break;
    out.push(e);
    e.it.kids.forEach(k => push(k.it, e.t0 + k.at / e.v, CRAWL_V));
  }
  T.sets.set(tg, out);
  return out;
}
// This frame's lit pieces: [{ pts, w, al, bolt, flash }] (pts warped)
function strikeFrame(ops, t, wp, np) {
  const T = strikeTree(ops), n = T.bolts.length || T.nodesWith.length, out = [];
  if (!n) return out;
  const W = wp ? (p => { const o = wp(p.x, p.y); return { x: p.x + o[0], y: p.y + o[1] }; }) : (p => p);
  const raw = k => Math.floor(twHash(k * 3.31 + 0.13) * n) % n;
  const slot = STRIKE_SLOT / (ANIM.opts.skRate || 1), spd = ANIM.opts.skSpd || 1, k0 = Math.floor(t / slot);
  for (let k = k0 - Math.ceil(STRIKE_LIFE / (spd * 0.7) / slot); k <= k0; k++) {
    const h = j => twHash(k * 7.77 + j * 1.37 + 0.5);
    if (h(1) < STRIKE_SKIP) continue;
    // u: the strike's own time (pace 0.7–1.4× the Strike speed)
    const u = (t - (k * slot + h(2) * 0.6 * slot)) * spd * (0.7 + 0.7 * h(5));
    if (u < 0 || u > STRIKE_LIFE) continue;
    let tg = raw(k);
    if (n > 1 && tg === raw(k - 1)) tg = (tg + 1) % n;
    // Draw on: only when the target's nodes are drawn ('none': whole design still drawing)
    if (np) {
      if (np === 'none' || !T.bolts.length) continue;
      const B = T.bolts[tg];
      if ((np[B.a] ?? 1) < 1 || (np[B.b] ?? 1) < 1) continue;
    }
    const L = LEADER_T, ret = h(3) < 0.4;
    const fl = u < L ? 0.65 : u < L + 0.06 ? 1 : ret && u < L + 0.1 ? 0.35 : ret && u < L + 0.16 ? 1 : Math.exp(-(u - L - (ret ? 0.16 : 0.06)) / STRIKE_AFTER);
    strikeSet(T, tg).forEach(({ it, t0, v }) => {
      const d = (u - t0) * v;
      if (d <= 0) return;
      const full = t0 + it.len / v;
      const al = it.bolt ? fl : 0.9 * (u < full ? 1 : Math.exp(-(u - full) / STRIKE_AFTER));
      if (al < 0.02) return;
      // the lit part: up to arc length d
      const P = it.pts, C = it.cum, pts = [];
      for (let k2 = 0; k2 < P.length && C[k2] <= d; k2++) pts.push(W(P[k2]));
      if (d < it.len && pts.length && pts.length < P.length) {
        const k2 = pts.length, f = (d - C[k2 - 1]) / ((C[k2] - C[k2 - 1]) || 1);
        pts.push(W({ x: P[k2 - 1].x + (P[k2].x - P[k2 - 1].x) * f, y: P[k2 - 1].y + (P[k2].y - P[k2 - 1].y) * f }));
      }
      if (pts.length < 2) return;
      out.push({ pts, w: it.w, al, bolt: it.bolt, depth: it.depth || 0,
        flash: it.bolt && u >= L ? { a: W(P[0]), b: W(P[P.length - 1]), e: fl } : null });
    });
  }
  return out;
}
function drawStrike(x, D, a, lwMul) {
  const line = P => { x.beginPath(); x.moveTo(P[0].x, P[0].y); for (let i = 1; i < P.length; i++) x.lineTo(P[i].x, P[i].y); x.stroke(); };
  x.save();
  x.lineCap = 'round'; x.lineJoin = 'round';
  // branches (thin first), then bolts with glow, edge and core
  D.filter(q => !q.bolt).sort((p, q) => p.w - q.w).forEach(q => {
    x.strokeStyle = STRIKE_BRANCH; x.globalAlpha = q.al * a * (1 - Math.min(q.depth, 5) * 0.06);
    x.lineWidth = q.w * lwMul * 1.05; line(q.pts);
  });
  D.filter(q => q.bolt).forEach(q => {
    const w = q.w * lwMul;
    x.strokeStyle = STRIKE_EDGE;
    x.globalAlpha = 0.12 * q.al * a; x.lineWidth = w * 7; line(q.pts);
    x.globalAlpha = 0.9 * q.al * a; x.lineWidth = w * 1.7; line(q.pts);
    x.strokeStyle = STRIKE_CORE; x.globalAlpha = q.al * a; x.lineWidth = w * 0.75; line(q.pts);
    if (q.flash) {
      x.fillStyle = STRIKE_CORE;
      for (const p of [q.flash.a, q.flash.b]) {
        x.globalAlpha = 0.18 * q.flash.e * a; x.beginPath(); x.arc(p.x, p.y, w * (8 + 6 * (1 - q.flash.e)), 0, Math.PI * 2); x.fill();
        x.globalAlpha = 0.8 * q.flash.e * a; x.beginPath(); x.arc(p.x, p.y, w * 2.2, 0, Math.PI * 2); x.fill();
      }
    }
  });
  x.restore();
}

// ── Blink lids ──
// Blink: how shut eye `id` is at time t (0 open … 1 shut). Each eye has its own
// interval (3.2–6.7 s) and offset, a blink lands somewhere in the first half
// of each interval, and one in four is a double blink. Mirror and rotation
// copies of an eye blink together.
function blinkHash(x) { const v = Math.sin(x * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); }
function blinkShape(d) {
  // close 0.09 s, shut 0.05 s, open 0.16 s
  if (d <= 0 || d >= 0.3) return 0;
  const ease = u => u * u * (3 - 2 * u);
  return d < 0.09 ? ease(d / 0.09) : d < 0.14 ? 1 : 1 - ease((d - 0.14) / 0.16);
}
function blinkAmt(t, id) {
  const P = 3.2 + 3.5 * blinkHash(id + 1), u = t - blinkHash(id + 2.5) * P, k = Math.floor(u / P);
  let v = 0;
  for (const n of [k - 1, k]) {
    const st = n * P + blinkHash(id * 7.13 + n * 1.618) * P * 0.5;
    v = Math.max(v, blinkShape(u - st));
    if (blinkHash(id * 3.1 + n * 0.77) < 0.25) v = Math.max(v, blinkShape(u - st - 0.38));
  }
  return v;
}
// A lid over one nucleus: the nucleus (inside its outline) is covered except
// for an eye-shaped opening between two half-ellipses; shut, the upper lid
// bows down past the middle (a closed eye) and meets the lower one
// e: the eye from markEye. k: how shut (0 open … 1 shut). a: alpha.
// look: gaze point in the eye's own coordinates, or null (no pupil move).
// axis: seam eyes only, the edge their pupil slides along. erase: wipe what
// the lid covers instead of painting it (faint layers, see drawLids).
function drawLid(c, e, k, a, look = null, axis = null, erase = false) {
  const { x: ex, y: ey, R, poly } = e, N = 20;
  const svg = !!c.isSVG;
  const up = R * (1 - k * 1.15), lo = Math.max(R * (1 - k), R * (k * 1.15 - 1));
  const outline = () => { for (let i = 0; i < poly.length; i += 2) i ? c.lineTo(ex + poly[i], ey + poly[i + 1]) : c.moveTo(ex + poly[i], ey + poly[i + 1]); c.closePath(); };
  const upper = (first) => { for (let i = 0; i <= N; i++) { const th = Math.PI * (1 - i / N), px = ex + Math.cos(th) * R, py = ey - Math.sin(th) * up; (i || !first) ? c.lineTo(px, py) : c.moveTo(px, py); } };
  const lower = () => { for (let i = 1; i <= N; i++) { const th = Math.PI * i / N; c.lineTo(ex + Math.cos(th) * R, ey + Math.sin(th) * lo); } c.closePath(); };
  // The nucleus inside: inner ring, chromatin flecks, and the nucleolus as the
  // pupil at (px, py)
  const inside = (px, py) => {
    c.beginPath(); for (let i = 0; i < e.ring.length; i += 2) i ? c.lineTo(ex + e.ring[i], ey + e.ring[i + 1]) : c.moveTo(ex + e.ring[i], ey + e.ring[i + 1]); c.closePath();
    c.strokeStyle = e.dim; c.lineWidth = e.lw2; c.stroke();
    c.beginPath(); for (let i = 0; i < e.flecks.length; i += 2) { const fx = ex + e.flecks[i], fy = ey + e.flecks[i + 1]; c.moveTo(fx + e.fr, fy); c.arc(fx, fy, e.fr, 0, Math.PI * 2); }
    c.fillStyle = e.dim; c.fill();
    c.beginPath(); c.moveTo(px + e.pr, py); c.arc(px, py, e.pr, 0, Math.PI * 2); c.fillStyle = e.col; c.fill();
  };
  const cellFill = () => { c.fillStyle = e.bg; c.fill(); c.fillStyle = 'rgba(191, 233, 220, 0.06)'; c.fill(); };
  c.save();
  c.globalAlpha = a;
  c.beginPath(); outline(); c.clip();
  // Leave out what later cells cover (see markEye). Canvas: one even-odd clip
  // per cell (a box with the cell as a hole; one clip each, so two
  // overlapping covers don't cancel out). The SVG builder clips only to
  // unions of convex polygons and has no even-odd, so there the outside of a
  // cell is cut into slices: rays from the cell's centre through each outline
  // point, out past the eye (the outline is star-shaped round its centre, so
  // the slices don't overlap).
  const B = R * 2 + 10;
  (e.cover || []).forEach(q => {
    const P = q.pts;
    c.beginPath();
    if (svg) {
      const far = Math.hypot(q.cx, q.cy) + B * 2, n = P.length / 2;
      const out = i => { const dx = P[i * 2] - q.cx, dy = P[i * 2 + 1] - q.cy, d = Math.hypot(dx, dy) || 1; return [ex + q.cx + dx / d * far, ey + q.cy + dy / d * far]; };
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, fi = out(i), fj = out(j);
        c.moveTo(ex + P[i * 2], ey + P[i * 2 + 1]); c.lineTo(ex + P[j * 2], ey + P[j * 2 + 1]);
        c.lineTo(fj[0], fj[1]); c.lineTo(fi[0], fi[1]); c.closePath();
      }
      c.clip();
      return;
    }
    c.rect(ex - B, ey - B, B * 2, B * 2);
    for (let i = 0; i < P.length; i += 2) i ? c.lineTo(ex + P[i], ey + P[i + 1]) : c.moveTo(ex + P[i], ey + P[i + 1]);
    c.closePath(); c.clip('evenodd');
  });
  // Where the pupil goes: towards the pointer (fully over at 4 eye-radii
  // away), or its own spot when not looking
  let px = ex + (e.hx || 0), py = ey + (e.hy || 0);
  if (look) {
    const vx = look.x - ex, vy = look.y - ey, d = Math.hypot(vx, vy) || 1, m = e.reach * Math.min(1, d / (R * 4));
    let ux = vx / d, uy = vy / d, bx = ex, by = ey;
    if (axis) {
      // On a wedge edge: the pupil sits on the edge line (each copy draws the
      // half on its side) and slides along it
      const t = ux * axis.x + uy * axis.y; ux = axis.x * t; uy = axis.y * t;
      if (axis.x || axis.y) { const f = (ex - axis.ox) * axis.x + (ey - axis.oy) * axis.y; bx = axis.ox + axis.x * f; by = axis.oy + axis.y * f; }
    }
    px = bx + ux * m; py = by + uy * m;
  }
  if (svg) {
    // SVG: cover the nucleus, then redraw its inside through the opening
    // (vertical strips between the two lid curves: convex, no even-odd)
    if (!look && k <= 0) { c.restore(); return; }
    c.beginPath(); outline(); cellFill();
    if (k < 0.97) {
      c.save();
      c.beginPath();
      for (let i = 0; i < N; i++) {
        const t0 = Math.PI * (1 - i / N), t1 = Math.PI * (1 - (i + 1) / N);
        const x0 = ex + Math.cos(t0) * R, x1 = ex + Math.cos(t1) * R;
        c.moveTo(x0, ey - Math.sin(t0) * up); c.lineTo(x1, ey - Math.sin(t1) * up);
        c.lineTo(x1, ey + Math.sin(t1) * lo); c.lineTo(x0, ey + Math.sin(t0) * lo); c.closePath();
      }
      c.clip();
      inside(px, py);
      c.restore();
    }
  } else {
    // In a faint layer's buffer: first wipe what the lid (or, looking, the
    // redrawn inside) covers, so nothing underneath shows through it
    if (erase && (look || k > 0)) {
      c.save();
      c.globalCompositeOperation = 'destination-out';
      c.globalAlpha = 1; c.fillStyle = '#000';
      c.beginPath(); outline();
      if (look) c.fill(); else { upper(true); lower(); c.fill('evenodd'); }
      c.restore();
    }
    if (look) {
      // Looking: clear the inside and redraw it with the pupil moved
      c.beginPath(); outline(); cellFill();
      inside(px, py);
    }
    if (k <= 0) { c.restore(); return; }
    // Lid = nucleus minus the opening (even-odd), in the cell's own fill
    c.beginPath(); outline(); upper(true); lower();
    c.fillStyle = e.bg; c.fill('evenodd');
    c.fillStyle = 'rgba(191, 233, 220, 0.06)'; c.fill('evenodd');
  }
  if (k <= 0) { c.restore(); return; }
  // Lid edges: the upper one drawn like the nucleus outline, the lower one fine
  c.lineCap = 'round';
  c.beginPath(); upper(true); c.strokeStyle = e.col; c.lineWidth = e.lw; c.stroke();
  if (k < 0.97) { c.beginPath(); for (let i = 0; i <= N; i++) { const th = Math.PI * i / N, qx = ex + Math.cos(th) * R, qy = ey + Math.sin(th) * lo; i ? c.lineTo(qx, qy) : c.moveTo(qx, qy); } c.strokeStyle = e.dim; c.lineWidth = e.lw2; c.stroke(); }
  c.restore();
}
