// ── MICROSCOPE SPECIMENS: blood cells and hyphae ───────────────────────────
// The Microscope mode draws one of three specimens (S.micro.specimen):
//   organisms  the original slide (cells, slime-mould veins, microorganisms): microscope.js
//   blood      a blood smear: a dense, even layer of overlapping red blood cells
//              (biconcave discs, paler in the middle) and a few platelets; the
//              nodes are white blood cells (the Microscope cell, no cilia)
//   hyphae     fungal hyphae: long, branching, septate tubes in layers, darker
//              where they pile up, with soft out-of-focus threads behind; the
//              nodes are spores (a small Microscope cell, no cilia) the hyphae
//              grow from
// Life: red cells and platelets drift (one Life group each); every hypha with
// its branches drifts as one; the white cells and spores wobble. Blink: the
// nuclei of the white cells and spores (red cells and hyphae have none).
// Both use the shared setup (micSetup) and helpers of microscope.js, and the
// random stream mc.R in a fixed order, so a seed gives the same slide.
// Used by: renderMicroscope (microscope.js), which calls micSpecimen.

// Blood smear
const BLOOD_FILL = 'rgba(226, 108, 140, 0.5)';     // cell body: overlaps get denser
const BLOOD_EDGE = 'rgba(255, 170, 190, 0.75)';    // rim
const BLOOD_PALE = 'rgba(255, 200, 215, 0.3)';     // rim of the paler centre
const BLOOD_PLT = 'rgba(190, 150, 255, 0.75)';     // platelets
const BLOOD_R = 20;                                // red cell radius (× 0.85–1.15)
const BLOOD_SPACING_BASE = 2.5, BLOOD_SPACING_PER_DENSITY = 0.15;   // grid step in radii: 2.5 − 0.15 × density, kept 1.2–2.2
const BLOOD_JITTER = 0.35;                         // grid positions move up to this × the step
const BLOOD_FLAT = 0.88;                           // shortest axis ÷ longest
const BLOOD_CENTRE = 0.5, BLOOD_CENTRE_A = 0.5;    // paler centre: radius × and how much background it lets through
const BLOOD_PLATELET_P = 0.05;
const HY_SPORE = 0.4;                              // spore size on a node: × the Microscope cell                     // chance that a grid place holds platelets instead

// Hyphae
const HY_BODY = 'rgba(214, 70, 84, 0.3)';          // tube body: where tubes cross it adds up
const HY_EDGE = 'rgba(240, 120, 130, 0.8)';        // tube walls
const HY_SEPTUM = 'rgba(240, 120, 130, 0.6)';      // cross-walls
const HY_FAR = 'rgba(214, 70, 84, 1)';             // out-of-focus threads (alpha set per pass)
const HY_W = 7;                                    // tube width at Stroke weight 1
const HY_STEP = 10;                                // length of one growth step
const HY_FAR_SHARE = 0.35;                         // share of the threads that lie out of focus
const HY_FAR_PASSES = [[2.6, 0.045], [1.7, 0.06], [1, 0.08]];   // [width ×, alpha]: stacked strokes give a soft edge
const HY_BRANCH_P = 0.02, HY_BRANCH_PER_DENSITY = 0.004;        // branch chance per step
const HY_BRANCH_W = 0.8, HY_MAX_DEPTH = 3;         // a branch is this × as wide; branches of branches stop here
const HY_MAX_POINTS = 9000;                        // growth stops when the threads have this many points in all
const HY_SEPTUM_GAP = 4.5, HY_SEPTUM_VAR = 0.35;   // cross-walls every 4.5 widths, ± this share

function micSpecimen(mc, sp) {
  if (sp === 'blood') micBlood(mc); else micHyphae(mc);
  mc.c.own(-1);
  mc.c.globalAlpha = 1;
}

// ── Blood smear ──
// The area to fill: the boundary's box (points outside it are skipped), or a
// disc round the nodes
function micArea(mc) {
  const RG = mc.RG;
  if (RG) return { x: (RG.x0 + RG.x1) / 2, y: (RG.y0 + RG.y1) / 2, rad: Math.hypot(RG.x1 - RG.x0, RG.y1 - RG.y0) / 2, has: p => RG.has(p) };
  return { x: mc.cx, y: mc.cy, rad: mc.reach, has: p => Math.hypot(p.x - mc.cx, p.y - mc.cy) <= mc.reach };
}

function micBlood(mc) {
  const { c, R, W, BG } = mc;
  micCells(mc);                                    // the white blood cells, drawn last like all Microscope cells
  mc.noCilia = true;
  const A = micArea(mc);
  const step = BLOOD_R * Math.max(1.2, Math.min(2.2, BLOOD_SPACING_BASE - BLOOD_SPACING_PER_DENSITY * mc.density));
  const rows = Math.ceil(A.rad * 2 / (step * 0.87)), cols = Math.ceil(A.rad * 2 / step), reds = [], plts = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const jx = (R() - 0.5) * 2 * BLOOD_JITTER * step, jy = (R() - 0.5) * 2 * BLOOD_JITTER * step, kind = R(), rr = 0.85 + R() * 0.3, fl = BLOOD_FLAT + R() * (1 - BLOOD_FLAT), rot = R() * MIC_TAU, order = R();
      const p = { x: A.x - A.rad + i * step + (j % 2 ? step / 2 : 0) + jx, y: A.y - A.rad + j * step * 0.87 + jy };
      if (!A.has(p) || mc.cells.some(q => Math.hypot(p.x - q.x, p.y - q.y) < q.r * 0.9)) continue;
      if (kind < BLOOD_PLATELET_P) plts.push(p);
      else reds.push({ x: p.x, y: p.y, rx: BLOOD_R * rr, ry: BLOOD_R * rr * fl, rot, order });
    }
  }
  reds.sort((a, b) => a.order - b.order);          // random stacking order
  c.lineJoin = 'round';
  const hs0 = mc.s % 1000000;                      // (Life groups take no random draws)
  reds.forEach((o, i) => {
    mc.life({ kind: 'rbc', x: o.x, y: o.y, r: BLOOD_R, ang: 0, hs: hs0 + i * 7919 });
    c.beginPath(); micEllipse(c, o.x, o.y, o.rx, o.ry, o.rot);
    c.fillStyle = BLOOD_FILL; c.fill();
    c.strokeStyle = BLOOD_EDGE; c.lineWidth = W * 0.9; c.stroke();
    c.beginPath(); micEllipse(c, o.x, o.y, o.rx * BLOOD_CENTRE, o.ry * BLOOD_CENTRE, o.rot);
    c.globalAlpha = BLOOD_CENTRE_A; c.fillStyle = BG; c.fill(); c.globalAlpha = 1;
    c.strokeStyle = BLOOD_PALE; c.lineWidth = W * 0.5; c.stroke();
    mc.life(null);
  });
  c.fillStyle = BLOOD_PLT;
  plts.forEach((p, i) => {
    mc.life({ kind: 'speck', x: p.x, y: p.y, r: 4, ang: 0, hs: hs0 + 500000 + i * 7919 });
    c.beginPath();
    for (let k = 0; k < 3; k++) micDot(c, p.x + (R() - 0.5) * 8, p.y + (R() - 0.5) * 8, 1.6 + R() * 1.4);
    c.fill();
    mc.life(null);
  });
  mc.cells.forEach((k, ci) => micCell(mc, k, ci));
}

// ── Hyphae ──
// Threads grow in steps with a wandering direction and branch now and then.
// Each is { pts, w, far }: far = out of focus (wide, faint, no walls).
function micHyphae(mc) {
  const { c, R, J, W } = mc, A = micArea(mc), pb = HY_BRANCH_P + HY_BRANCH_PER_DENSITY * mc.density;
  const curl = 0.18 + J * 0.5, w0 = HY_W * Math.max(0.6, Math.min(1.6, W));
  const threads = [], hs0 = mc.s % 1000000;
  let points = 0, tree = 0;                        // tree: the thread and its branches (they drift together)
  const grow = (x, y, ang, w, depth, steps, far) => {
    const th = { pts: [{ x, y }], w, far, tree };
    threads.push(th);
    for (let s = 0; s < steps && points < HY_MAX_POINTS; s++) {
      ang += (R() - 0.5) * curl;
      x += Math.cos(ang) * HY_STEP; y += Math.sin(ang) * HY_STEP;
      if (Math.hypot(x - A.x, y - A.y) > A.rad * 1.1) break;
      th.pts.push({ x, y }); points++;
      if (depth < HY_MAX_DEPTH && R() < pb) {
        const side = R() < 0.5 ? -1 : 1, da = (0.5 + R() * 0.4) * side;
        grow(x, y, ang + da, w * HY_BRANCH_W, depth + 1, Math.round(steps * (0.3 + R() * 0.4)), far);
      }
    }
  };
  // From every node: a tuft of threads, as many as the node is big
  mc.nodes.forEach(n => {
    const m = Math.max(2, Math.round((3 + mc.density * 0.5) * (n.size || 1)));
    for (let k = 0; k < m; k++) { tree++; grow(n.x, n.y, R() * MIC_TAU, w0 * (0.85 + R() * 0.3), 0, Math.round(A.rad * (0.5 + R() * 0.6) / HY_STEP), R() < HY_FAR_SHARE); }
  });
  // Free threads crossing the whole slide, grown both ways from a point
  const free = Math.round(mc.density * 3 * (mc.RG ? mc.fill : 1));
  for (let k = 0; k < free; k++) {
    const a = R() * MIC_TAU, d = Math.sqrt(R()) * A.rad, ang = R() * MIC_TAU, w = w0 * (0.85 + R() * 0.3), far = R() < HY_FAR_SHARE, len = Math.round(A.rad * (0.5 + R() * 0.5) / HY_STEP);
    const x = A.x + Math.cos(a) * d, y = A.y + Math.sin(a) * d;
    tree++; grow(x, y, ang, w, 0, len, far); grow(x, y, ang + Math.PI, w, 0, len, far);   // both halves are one tree
  }
  c.lineCap = 'round'; c.lineJoin = 'round';
  // Each tree is one Life group (threads of a tree are drawn one after another)
  const drawTrees = (list, draw) => {
    let cur = -1;
    list.forEach(t => {
      if (t.tree !== cur) { if (cur >= 0) mc.life(null); cur = t.tree; mc.life({ kind: 'hypha', x: t.pts[0].x, y: t.pts[0].y, r: 10, ang: 0, hs: hs0 + t.tree * 7919 }); }
      draw(mc, t);
    });
    if (cur >= 0) mc.life(null);
  };
  drawTrees(threads.filter(t => t.far && t.pts.length > 1), micHyphaFar);
  drawTrees(threads.filter(t => !t.far && t.pts.length > 1), micHypha);
  // The spores the colony grows from, drawn last like all Microscope cells
  micCells(mc, HY_SPORE);
  mc.noCilia = true;
  mc.cells.forEach((k, ci) => micCell(mc, k, ci));
}

// Out of focus: a wide, faint smear built from stacked strokes
function micHyphaFar(mc, t) {
  const c = mc.c;
  c.strokeStyle = HY_FAR;
  HY_FAR_PASSES.forEach(([k, a]) => {
    c.globalAlpha = a; c.lineWidth = t.w * k;
    c.beginPath(); micPolyline(c, t.pts); c.stroke();
  });
  c.globalAlpha = 1;
}

// In focus: a translucent body (so crossings darken), two wall lines and cross-walls
function micHypha(mc, t) {
  const { c, R, W } = mc, { pts, w } = t, L = [], Rr = [];
  pts.forEach((p, i) => {
    const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    let tx = q.x - o.x, ty = q.y - o.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    L.push({ x: p.x - ty * w / 2, y: p.y + tx * w / 2 }); Rr.push({ x: p.x + ty * w / 2, y: p.y - tx * w / 2 });
  });
  c.fillStyle = HY_BODY;
  c.beginPath(); micPolyline(c, L); for (let i = Rr.length - 1; i >= 0; i--) c.lineTo(Rr[i].x, Rr[i].y); c.closePath(); c.fill();
  c.strokeStyle = HY_EDGE; c.lineWidth = W * 0.8;
  c.beginPath(); micPolyline(c, L); c.stroke();
  c.beginPath(); micPolyline(c, Rr); c.stroke();
  // Septa: a cross-wall about every HY_SEPTUM_GAP widths, unevenly
  c.strokeStyle = HY_SEPTUM; c.lineWidth = W * 0.6; c.beginPath();
  let acc = R() * w * HY_SEPTUM_GAP;
  for (let i = 1; i < pts.length - 1; i++) {
    acc -= HY_STEP;
    if (acc > 0) continue;
    acc += w * HY_SEPTUM_GAP * (1 + (R() - 0.5) * 2 * HY_SEPTUM_VAR);
    c.moveTo(L[i].x, L[i].y); c.lineTo(Rr[i].x, Rr[i].y);
  }
  c.stroke();
}
