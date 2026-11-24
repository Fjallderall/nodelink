// ── NODE DOM ───────────────────────────────────────────────────────────────
// Elements are reused rather than rebuilt each frame: rebuilding detaches the
// element a touch started on, which stops its touchmove events reaching window.
// The draggable node handles over the canvas, the node list, placing and
// fitting nodes, and Move-design mode.
let nodeEls = [];

function renderNodeDOM(pos = null) {
  if (!S.showNodes) {
    nodeLayer.innerHTML = '';
    nodeEls = [];
    return;
  }

  while (nodeEls.length < S.nodes.length) {
    const idx = nodeEls.length;
    const el = document.createElement('div');
    el.className = 'node-el';
    el.addEventListener('mousedown', e => {
      e.stopPropagation();
      S.draggingNode = idx;
      el.classList.add('dragging');
    });
    el.addEventListener('touchstart', e => {
      e.stopPropagation();
      e.preventDefault();
      S.draggingNode = idx;
      el.classList.add('dragging');
    }, { passive: false });
    nodeLayer.appendChild(el);
    nodeEls.push(el);
  }
  while (nodeEls.length > S.nodes.length) {
    nodeEls.pop().remove();
  }

  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / CC;

  S.nodes.forEach((node, idx) => {
    const el = nodeEls[idx];
    el.textContent = S.showNumbers ? node.glyph : '';
    el.classList.toggle('plain', !S.showNumbers);
    el.title = `Node ${idx + 1}: drag to move it`;
    el.classList.toggle('dragging', S.draggingNode === idx);
    const p = dxf((pos && pos[idx]) || node);
    el.style.left = `${(p.x * S.zoom + CC / 2 + S.pan.x) * scale}px`;
    el.style.top = `${(p.y * S.zoom + CC / 2 + S.pan.y) * scale}px`;
  });
}

let openNode = -1;   // index of the node whose detail panel is open
const ND_HELP = {
  size: 'How large this node is, and what is drawn round it (circles, cells, glyphs, flowers)',
  w: 'How thick the lines that grow from this node are'
};

function renderNodeRoster() {
  const r = document.getElementById('node-roster');
  r.innerHTML = '';
  if (openNode >= S.nodes.length) openNode = -1;

  S.nodes.forEach((node, idx) => {
    const wrap = document.createElement('div');
    const row = document.createElement('div');
    row.className = 'node-row';
    row.innerHTML = `
      <button class="glyph-btn" title="Show this node's size and weight"></button>
      <span class="node-sum"></span>
      <button class="del-node" title="Remove this node (2 at least stay)">×</button>
    `;
    row.querySelector('.node-sum').textContent = `Node ${idx + 1} · size ${Number(node.size).toFixed(1)} · weight ${Number(node.w).toFixed(1)}`;
    const gb = row.querySelector('.glyph-btn');
    gb.textContent = node.glyph;
    gb.classList.toggle('open', openNode === idx);
    gb.addEventListener('click', () => {
      openNode = openNode === idx ? -1 : idx;
      renderNodeRoster();
    });

    const delBtn = row.querySelector('.del-node');
    if (S.nodes.length <= 2) {
      delBtn.disabled = true;
    } else {
      delBtn.addEventListener('click', () => {
        S.nodes.splice(idx, 1);
        // Reassign IDs to keep them sequential
        S.nodes.forEach((n, i) => {
          n.id = i + 1;
          n.glyph = (i + 1).toString();
        });
        if (openNode === idx) openNode = -1;
        else if (openNode > idx) openNode--;
        renderNodeRoster();
        update();
        commit();
      });
    }
    wrap.appendChild(row);

    if (openNode === idx) {
      const det = document.createElement('div');
      det.className = 'node-detail';
      det.innerHTML = `
        <label title="${ND_HELP.size}">Size <span class="val nd-vs"></span></label>
        <input type="range" class="nd-size" min="0.5" max="3" step="0.1" title="${ND_HELP.size}">
        <label title="${ND_HELP.w}">Weight <span class="val nd-vw"></span></label>
        <input type="range" class="nd-w" min="0.5" max="3" step="0.1" title="${ND_HELP.w}">
      `;
      [['.nd-size', '.nd-vs', 'size'], ['.nd-w', '.nd-vw', 'w']].forEach(([q, vq, key]) => {
        const el = det.querySelector(q), v = det.querySelector(vq);
        el.value = node[key];
        v.textContent = Number(node[key]).toFixed(1);
        el.addEventListener('input', () => {
          node[key] = parseFloat(el.value);
          v.textContent = node[key].toFixed(1);
          update();
        });
        el.addEventListener('change', () => { commit(); renderNodeRoster(); });
      });
      wrap.appendChild(det);
    }
    r.appendChild(wrap);
  });

  const btnAdd = document.getElementById('btn-add-node');
  if (btnAdd) btnAdd.disabled = S.nodes.length >= 9;
}

// Composition-aware placement: inside the symmetry wedge,
// or the original ring around the current centre
function autoPlace(nodes) {
  const N = nodes.length;
  const B = S.boundary;
  const wd = symCopies()[0].wedge;
  // Wedges are in design space: only the scale applies; the other layouts are
  // in world space and mapped back through the design transform
  if (wd) {
    const R = (B.shape !== 'none' ? B.size : 320) / S.xf.scale;
    const span = wd[1] - wd[0];
    return nodes.map((n, i) => {
      const a = wd[0] + span * (0.2 + 0.6 * ((i * 0.618) % 1));
      const r = R * (0.25 + 0.6 * (i + 0.5) / N);
      return { ...n, x: Math.cos(a) * r, y: Math.sin(a) * r };
    });
  }
  if (B.shape !== 'none') {
    const r = B.size * 0.62;
    return nodes.map((n, i) => {
      const a = (i / N) * Math.PI * 2 - Math.PI / 2;
      return ixf({ ...n, x: Math.cos(a) * r, y: Math.sin(a) * r });
    });
  }
  if (pageActive()) {
    const r = pageRect(false);
    return nodes.map((n, i) => {
      const a = (i / N) * Math.PI * 2 - Math.PI / 2;
      return ixf({ ...n, x: Math.cos(a) * r.w * 0.3, y: Math.sin(a) * r.h * 0.3 });
    });
  }
  const { cx, cy, maxR } = nodeCentroid();
  return nodes.map((node, i) => {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const r = maxR * (0.8 + Math.sin(i * 2.4) * 0.2);
    return { ...node, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
}

// Random nodes inside the region that is actually drawn: the source
// wedge of a symmetry, the boundary, the page, or a disc. Keeps size/weight by
// index. Rejection sampling with a minimum spacing so nodes don't clump.
function randomNodes(count) {
  const B = S.boundary, wd = symCopies()[0].wedge;
  let sample;
  if (wd) {
    const R = (B.shape !== 'none' ? B.size : pageActive() ? Math.min(pageRect(false).w, pageRect(false).h) / 2 : 320) / S.xf.scale;
    sample = () => {
      const a = wd[0] + (wd[1] - wd[0]) * (0.1 + 0.8 * Math.random());
      const r = R * (0.15 + 0.7 * Math.sqrt(Math.random()));
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    };
  } else if (B.shape !== 'none') {
    const poly = scalePoly(boundaryPoly(), 0.8), R = B.size * 1.25;
    sample = () => {
      for (let k = 0; k < 50; k++) {
        const p = { x: (Math.random() * 2 - 1) * R, y: (Math.random() * 2 - 1) * R };
        if (pip(p, poly)) return p;
      }
      return { x: 0, y: 0 };
    };
  } else if (pageActive()) {
    const r = pageRect(false);
    sample = () => ({ x: r.x + r.w * (0.15 + 0.7 * Math.random()), y: r.y + r.h * (0.15 + 0.7 * Math.random()) });
  } else {
    sample = () => {
      const a = Math.random() * Math.PI * 2, r = 320 * Math.sqrt(Math.random());
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    };
  }
  if (!wd) { const s0 = sample; sample = () => ixf(s0()); }   // world → design space
  // spacing: shrink the requirement until everything fits
  const pts = [];
  let minD = 400 / Math.sqrt(count);
  for (let tries = 0; pts.length < count; tries++) {
    if (tries > 0 && tries % 200 === 0) minD *= 0.8;
    const p = sample();
    if (pts.every(q => Math.hypot(p.x - q.x, p.y - q.y) >= minD)) pts.push(p);
  }
  const prev = S.nodes;
  return pts.map((p, i) => ({ ...newNode(i, Math.round(p.x), Math.round(p.y)),
    size: prev[i] ? prev[i].size : 1, w: prev[i] ? prev[i].w : 1 }));
}

// New size and line weight for every node, 0.6–1.8 each, median 1
// (r^1.6 leans towards the small end, so most designs stay near the old look
// and now and then one node stands out). One decimal, like the node sliders.
const VARY_MIN = 0.6, VARY_SPAN = 1.2, VARY_BIAS = 1.6;
function varyNodeSizes(nodes) {
  const v = () => Math.round((VARY_MIN + VARY_SPAN * Math.pow(Math.random(), VARY_BIAS)) * 10) / 10;
  return nodes.map(n => ({ ...n, size: v(), w: v() }));
}

// Fit nodes: every node (and each of its symmetry copies) is pulled in
// towards the middle until it sits a little inside the boundary, or the page
// when it clips. In modes that draw a part round each node (OWN_MODES: Arcane
// constructs, Microscope cells, Chaosgate main glyphs; see Rec.own) that part
// must fit too, at the current design scale: the display list is recorded,
// each node's part measured (ownedHulls), the node pulled in, and that
// repeated (the parts change a little as nodes move; FIT_ROUNDS at most).
// Moves each node as little as it can. Returns how many moved, or -1 when
// there is nothing to fit to, -2 when the middle itself is outside;
// fitNodes.tooBig = nodes whose part is too big to fit anywhere (only the
// node itself is pulled in then).
// Used by: the Fit nodes button, Shuffle, Randomise.
const OWN_MODES = ['arcane', 'microscope', 'chaosgate', 'vine', 'glass'];
const FIT_ROUNDS = 4;
const FIT_NODE_K = 0.9;        // node centres stay inside 90% of the boundary
const FIT_PART_K = 0.97;       // their parts inside 97% (clear of the border line)
function fitRegionPoly(k = FIT_NODE_K) {
  const poly = boundaryPoly();
  if (poly) return scalePoly(poly, k);
  if (pageActive() && S.page.clip) {
    const r = pageRect(false), m = Math.min(r.w, r.h) * (1 - k) * 0.7;
    return [{ x: r.x + m, y: r.y + m }, { x: r.x + r.w - m, y: r.y + m }, { x: r.x + r.w - m, y: r.y + r.h - m }, { x: r.x + m, y: r.y + r.h - m }];
  }
  return null;
}
// q inside the (convex) polygon by at least m
function insideBy(q, poly, m) {
  if (!pip(q, poly)) return false;
  if (m <= 0) return true;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
    if (segDist2(q.x, q.y, poly[j].x, poly[j].y, poly[i].x, poly[i].y) < m) return false;
  return true;
}
// Convex hull (monotone chain) of a flat [x, y, x, y, …] list
function hull2(f) {
  const P = [];
  for (let i = 0; i < f.length; i += 2) P.push({ x: f[i], y: f[i + 1] });
  if (P.length < 3) return P;
  P.sort((a, b) => a.x - b.x || a.y - b.y);
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], up = [];
  P.forEach(p => { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
// Each node's own part of a display list (between own(i) and own(-1)): the
// convex hull of what is stroked or filled, in design space relative to the
// node, and m = half the widest stroke. Arcs are sampled; curves count their
// control points (the curve lies inside them); clip paths don't count.
// Cached on the ops. Returns per node { h, m } or null; null when the list
// has no marks.
function ownedHulls(ops) {
  if (!ops || !ops.own) return null;
  if (ops._H) return ops._H;
  const nodes = S.nodes, marks = ops.own, n = ops.length / 3;
  const pts = nodes.map(() => []), mar = nodes.map(() => 0);
  let mi = 0, owner = -1, M = [1, 0, 0, 1, 0, 0], lw = 1, path = [];
  const stack = [];
  const add = (x, y) => { if (owner >= 0 && owner < nodes.length) path.push(owner, M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]); };
  const paint = m => {
    for (let j = 0; j < path.length; j += 3) {
      const o = path[j];
      pts[o].push(path[j + 1] - nodes[o].x, path[j + 2] - nodes[o].y);
      if (m > mar[o]) mar[o] = m;
    }
  };
  for (let k = 0; k < n; k++) {
    while (mi < marks.length && marks[mi] <= k * 3) { owner = marks[mi + 1]; mi += 2; }
    const m = ops[k * 3 + 1], a = ops[k * 3 + 2];
    if (ops[k * 3] === 1) { if (m === 'lineWidth') lw = a; continue; }
    switch (m) {
      case 'save': stack.push([M.slice(), lw]); break;
      case 'restore': { const t = stack.pop(); if (t) [M, lw] = t; break; }
      case 'translate': M[4] += M[0] * a[0] + M[2] * a[1]; M[5] += M[1] * a[0] + M[3] * a[1]; break;
      case 'scale': M[0] *= a[0]; M[1] *= a[0]; M[2] *= a[1]; M[3] *= a[1]; break;
      case 'rotate': {
        const co = Math.cos(a[0]), si = Math.sin(a[0]), [m0, m1, m2, m3] = M;
        M[0] = m0 * co + m2 * si; M[1] = m1 * co + m3 * si; M[2] = m2 * co - m0 * si; M[3] = m3 * co - m1 * si;
        break;
      }
      case 'beginPath': path = []; break;
      case 'moveTo': case 'lineTo': add(a[0], a[1]); break;
      case 'quadraticCurveTo': case 'bezierCurveTo': for (let j = 0; j < a.length; j += 2) add(a[j], a[j + 1]); break;
      case 'arc': {
        const [x, y, r, a0, a1, ccw] = a, sw = arcSweep(a0, a1, !!ccw), st = Math.max(2, Math.ceil(sw / (Math.PI / 24)));
        for (let j = 0; j <= st; j++) { const t = a0 + (ccw ? -1 : 1) * sw * j / st; add(x + Math.cos(t) * r, y + Math.sin(t) * r); }
        break;
      }
      case 'rect': case 'roundRect': add(a[0], a[1]); add(a[0] + a[2], a[1]); add(a[0] + a[2], a[1] + a[3]); add(a[0], a[1] + a[3]); break;
      case 'fillRect': case 'fillText': case 'strokeText': {
        const keep = path; path = [];
        if (m === 'fillRect') { add(a[0], a[1]); add(a[0] + a[2], a[1] + a[3]); add(a[0] + a[2], a[1]); add(a[0], a[1] + a[3]); }
        else add(a[1], a[2]);
        paint(0); path = keep; break;
      }
      case 'stroke': paint(lw * Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) / 2); break;
      case 'fill': paint(0); break;
    }
  }
  return (ops._H = nodes.map((_, i) => pts[i].length ? { h: hull2(pts[i]), m: mar[i] } : null));
}
function fitNodes() {
  fitNodes.tooBig = 0;
  const poly = fitRegionPoly();
  if (!poly) return -1;
  const copies = symCopies();
  const ok = p => copies.every(cp => pip(dxf(copyPoint(cp, p.x, p.y)), poly));
  // Pull towards the design origin (where symmetry turns), else the middle of the region
  const target = [{ x: 0, y: 0 }, ixf({ x: 0, y: 0 })].find(ok);
  if (!target) return -2;                          // the middle itself is outside (design moved far off)
  const parts = OWN_MODES.includes(S.mode) || (S.layer.mode !== 'none' && OWN_MODES.includes(S.layer.mode));
  const pat = fitRegionPoly(FIT_PART_K), k = S.xf.scale;
  // Node at p with its parts (hulls recorded with the node at n), in every copy
  const fits = (hs, n, p) => hs.every(H => copies.every(cp => H.h.every(q =>
    insideBy(dxf(copyPoint(cp, p.x + q.x, p.y + q.y)), pat, H.m * k))));
  const moved = new Set(), tooBig = new Set();
  for (let round = 0; round < (parts ? FIT_ROUNDS : 1); round++) {
    const dl = parts ? getDisplayList() : null;
    const Hm = dl ? ownedHulls(dl.main) : null, Hl = dl ? ownedHulls(dl.layer) : null;
    let any = false;
    S.nodes.forEach((n, i) => {
      const hs = [Hm && Hm[i], Hl && Hl[i]].filter(Boolean);
      let good = hs.length ? p => ok(p) && fits(hs, n, p) : ok;
      if (good(n)) return;
      if (good !== ok && !good(target)) { tooBig.add(i); good = ok; if (ok(n)) return; }
      const at = t => ({ x: n.x + (target.x - n.x) * t, y: n.y + (target.y - n.y) * t });
      let lo = 0, hi = 1;
      for (let j = 0; j < 24; j++) { const m = (lo + hi) / 2; if (good(at(m))) hi = m; else lo = m; }
      let q = at(hi);
      q = { x: Math.round(q.x), y: Math.round(q.y) };
      if (!good(q)) { const r = at(Math.min(1, hi + 0.02)); q = { x: Math.round(r.x), y: Math.round(r.y) }; }
      if (q.x === n.x && q.y === n.y) return;
      n.x = q.x; n.y = q.y;
      moved.add(i); any = true;
    });
    if (!any) break;
  }
  fitNodes.tooBig = tooBig.size;
  return moved.size;
}

// Move-design mode: dragging the background moves the design (S.xf.x/y)
// instead of panning the view. Shift+drag does the same without the mode.
const XF_MAX = 2000;
function setMoveDesign(on) {
  S.moveDesign = on;
  ['xf-move', 'btn-move'].forEach(id => document.getElementById(id).setAttribute('aria-pressed', on));
  document.getElementById('canvas-container').classList.toggle('moving', on);
}
function nudgeDesign(dx, dy) {
  S.xf.x = Math.max(-XF_MAX, Math.min(XF_MAX, Math.round((S.xf.x + dx) * 10) / 10));
  S.xf.y = Math.max(-XF_MAX, Math.min(XF_MAX, Math.round((S.xf.y + dy) * 10) / 10));
  syncComposition(); renderNodeDOM(); update();
}

// Reset view: centre on the origin, zoomed so the boundary fits
function fitView() {
  S.pan = { x: 0, y: 0 };
  const B = S.boundary;
  if (pageActive()) { const r = pageRect(true); S.zoom = Math.max(0.2, Math.min(5, CC * 0.9 / Math.max(r.w, r.h))); return; }
  if (B.shape !== 'none') S.zoom = Math.max(0.2, Math.min(5, CC * 0.88 / (B.size * 2.6)));
  else S.zoom = 1;
}

// ── UPDATE (batched to one redraw per animation frame) ─────────────────────
// update(): ask for a redraw; every change ends here.
let frameQueued = false;
function update() {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(() => {
    frameQueued = false;
    // While playing, animTick draws every frame (and picks up the change);
    // drawing here too would draw twice per frame
    if (!(ANIM.playing && ANIM.raf)) draw();
    if (!ANIM.playing || ANIM.ambient) renderNodeDOM(ANIM.frozen ? ANIM.hpos : null);   // while playing, animTick places the handles
    scheduleCut();
  });
}

// ── UI SYNC ────────────────────────────────────────────────────────────────
// syncVals: write S back into the sliders' value labels.
function syncVals() {
  const m = editMode(), L2 = EDIT_L === 2;
  document.getElementById('v-density').textContent = lget('density');
  document.getElementById('v-sigma').textContent = lget('sigma');
  document.getElementById('v-weight').textContent = lget('weight').toFixed(1);
  syncBorder();                     // its thickness may follow Stroke weight
  document.getElementById('v-dew').textContent = lget('dew');
  document.getElementById('v-curve').textContent = lget('curve');
  document.getElementById('dew-cg').classList.toggle('hidden', m !== 'spiderweb');
  // Rolling dew only means something on a spiderweb that has dew (the option keeps its value while hidden)
  syncAnimRelevance();
  document.getElementById('pcb-cg').classList.toggle('hidden', m !== 'pcb');
  document.getElementById('v-pcb-pour').textContent = lget('pcb').pour;
  document.getElementById('web-cg').classList.toggle('hidden', m !== 'web');
  document.getElementById('neb-cg').classList.toggle('hidden', m !== 'nebula');
  document.getElementById('chaos-cg').classList.toggle('hidden', m !== 'chaosgate');
  document.getElementById('light-cg').classList.toggle('hidden', m !== 'lightning');
  document.getElementById('arc-cg').classList.toggle('hidden', m !== 'arcane');
  document.getElementById('micro-cg').classList.toggle('hidden', m !== 'microscope');
  document.getElementById('v-arc-wobble').textContent = lget('arcane').wobble;
  document.getElementById('v-micro-orgs').textContent = lget('micro').orgs;
  const sp = lget('micro').specimen;      // each specimen shows only the controls it uses
  document.querySelectorAll('#micro-cg .mic-org').forEach(el => el.classList.toggle('hidden', sp !== 'organisms'));
  document.querySelectorAll('#micro-cg .mic-cells').forEach(el => el.classList.toggle('hidden', sp !== 'organisms'));
  document.getElementById('stain-cg').classList.toggle('hidden', m !== 'stained');
  document.getElementById('vine-cg').classList.toggle('hidden', m !== 'vine');
  document.getElementById('glass-cg').classList.toggle('hidden', m !== 'glass');
  document.getElementById('water-cg').classList.toggle('hidden', m !== 'water');
  document.getElementById('v-water-spacing').textContent = sanWater(lget('water')).spacing;
  document.getElementById('v-water-drops').textContent = sanWater(lget('water')).drops;
  document.getElementById('v-vine-leaves').textContent = lget('vine').leaves;
  document.getElementById('v-vine-flowers').textContent = lget('vine').flowers;
  document.getElementById('mode').classList.toggle('hidden', L2);
  document.getElementById('layer-mode').classList.toggle('hidden', !L2);
  document.getElementById('layer-str-cg').classList.toggle('hidden', !L2);
  document.querySelector('.panel[data-panel="design"]').classList.toggle('l2-off', L2 && S.layer.mode === 'none');
  document.getElementById('layer-swap').disabled = S.layer.mode === 'none';
  document.querySelectorAll('#ed-layer button').forEach(b => {
    b.setAttribute('aria-selected', String(+b.dataset.l === EDIT_L));
    if (b.dataset.l === '2') b.textContent = S.layer.mode === 'none' ? 'Layer 2 · off' : 'Layer 2';
  });
}

// ── Colour scheme UI ──
// Also: syncControls (all Design controls from S), Composition and Export
// control sync.
function swatchSVG(p) {
  return `<svg viewBox="0 0 60 30" preserveAspectRatio="none" aria-hidden="true"><rect width="60" height="30" fill="${p.bg}"/>`
    + `<path d="M4 24 L22 10 L38 18 L56 6" fill="none" stroke="${p.ink}" stroke-width="2.2"/>`
    + `<circle cx="22" cy="10" r="3.2" fill="${p.glow}"/><circle cx="56" cy="6" r="2.4" fill="${p.glow}"/></svg>`;
}
function buildPaletteGrid() {
  const g = document.getElementById('pal-grid');
  g.innerHTML = PALETTES.map(p => `<button type="button" role="option" data-p="${p.id}" title="Colour scheme: ${p.name}">${swatchSVG(p)}<span>${p.name}</span></button>`).join('');
  g.addEventListener('click', e => {
    const b = e.target.closest('button[data-p]');
    if (!b) return;
    applyPreset(b.dataset.p, true);
  });
}
function applyPreset(id, live) {
  const p = PALETTES.find(q => q.id === id);
  if (!p) return;
  if (EDIT_L === 2 && live) {
    S.palette.l2 = { ink: p.ink, glow: p.glow, preset: p.id };
  } else {
    Object.assign(S.palette, { paper: p.bg, ink: p.ink, glow: p.glow, preset: p.id });
    if (S.palette.mode === 'original') S.palette.mode = 'tint';
  }
  if (!live) return;
  syncControls(); update(); commit();
}
function markPreset() {
  const cur = EDIT_L === 2 ? (S.palette.l2 && S.palette.l2.preset) : (S.palette.mode === 'original' ? null : S.palette.preset);
  document.querySelectorAll('#pal-grid button').forEach(b => b.setAttribute('aria-selected', b.dataset.p === cur ? 'true' : 'false'));
}
function syncPalette() {
  const pal = S.palette, L2 = EDIT_L === 2;
  const grp = document.getElementById('grp-colour');
  grp.classList.toggle('hidden', L2 && S.layer.mode === 'none');
  const $ = id => document.getElementById(id);
  $('palette').value = pal.mode;
  $('palette').closest('.cg').classList.toggle('hidden', L2);
  $('l2-same-row').classList.toggle('hidden', !L2);
  $('l2-same').checked = !pal.l2;
  const own = L2 && pal.l2;
  const showGrid = L2 ? !!own : true;
  $('pal-grid').classList.toggle('hidden', !showGrid);
  const showRow = L2 ? !!own : pal.mode !== 'original';
  $('ink-row').style.display = showRow ? 'flex' : 'none';
  const stencil = pal.mode === 'stencil';
  $('paper-cell').style.display = L2 ? 'none' : '';
  $('glow-cell').style.display = stencil ? 'none' : '';
  $('lbl-paper').textContent = stencil ? 'Paper' : 'Background';
  $('lbl-ink').textContent = stencil ? 'Ink' : 'Lines';
  const src = own ? pal.l2 : pal;
  $('ink').value = src.ink;
  $('glow').value = src.glow || src.ink;
  $('paper').value = pal.paper;
  markPreset();
}

function syncControls() {
  document.getElementById('mode').value = S.mode;
  document.getElementById('density').value = lget('density');
  document.getElementById('sigma').value = lget('sigma');
  document.getElementById('weight').value = lget('weight');
  document.getElementById('dew').value = lget('dew');
  document.getElementById('curve').value = lget('curve');
  document.getElementById('curved').checked = lget('curved');
  const pcb = lget('pcb'), ch = lget('chaos'), st = lget('stained');
  document.getElementById('pcb-pour').value = pcb.pour;
  document.getElementById('pcb-meander').checked = pcb.meander;
  document.getElementById('pcb-silk').checked = pcb.silk;
  document.getElementById('web-ring').checked = !lget('web') || lget('web').ring !== false;
  document.getElementById('neb-glow').checked = lget('nebula').glow;
  document.getElementById('light-glow').checked = lget('lightning').glow;
  document.getElementById('light-fill').checked = !!lget('lightning').fill;
  const ao = lget('arcane'), mo = lget('micro');
  document.getElementById('arc-snap').checked = ao.snap;
  document.getElementById('arc-wobble').value = ao.wobble;
  document.getElementById('arc-links').checked = ao.links;
  document.getElementById('arc-sats').checked = ao.sats;
  document.getElementById('micro-specimen').value = mo.specimen;
  document.getElementById('micro-veins').checked = mo.veins;
  document.getElementById('micro-orgs').value = mo.orgs;
  document.getElementById('micro-cilia').value = mo.cilia;
  document.getElementById('micro-detail').checked = mo.detail;
  const vo = lget('vine');
  document.getElementById('vine-leaves').value = vo.leaves;
  document.getElementById('vine-flowers').value = vo.flowers;
  document.getElementById('vine-leaf').value = vo.leaf;
  document.getElementById('vine-bloom').value = vo.bloom;
  document.getElementById('vine-season').value = vo.season;
  document.getElementById('vine-tendrils').checked = vo.tendrils;
  document.getElementById('vine-veins').checked = vo.veins;
  const go = sanGlass(lget('glass'));
  document.getElementById('glass-style').value = go.style;
  document.getElementById('glass-set').value = go.set;
  document.getElementById('glass-light').checked = go.light;
  const wo = sanWater(lget('water'));
  document.getElementById('water-meet').value = wo.meet;
  document.getElementById('water-spacing').value = wo.spacing;
  document.getElementById('water-drops').value = wo.drops;
  document.getElementById('chaos-style').value = ch.style;
  document.getElementById('chaos-frames').checked = ch.frames;
  document.getElementById('chaos-links').checked = ch.links;
  document.getElementById('stain-ring').checked = st.ring;
  document.getElementById('stain-ragged').checked = st.ragged;
  document.getElementById('stain-ring').disabled = st.ragged && S.boundary.shape === 'none';
  document.getElementById('curve-sub').classList.toggle('hidden', !lget('curved'));
  document.getElementById('seed').value = lget('seed');
  syncPalette();
  syncComposition();
  syncVals();
  syncSummaries();
}

// Border thickness and colour (Layout → Boundary). Also called when Stroke
// weight moves, as the thickness follows it while Follow Stroke weight is on.
function syncBorder() {
  const $ = id => document.getElementById(id), B = S.boundary;
  $('bnd-line').classList.toggle('hidden', B.border === 'none');
  const lw = borderLw();
  $('bnd-lw').value = lw;
  $('v-bnd-lw').textContent = lw.toFixed(1);
  $('bnd-lw-auto').checked = B.lw == null;
  $('bnd-col-mode').value = B.color ? 'own' : 'scheme';
  $('bnd-col').classList.toggle('hidden', !B.color);
  if (B.color) { $('bnd-col').value = B.color; $('bnd-col').dataset.used = 1; }
}
function syncComposition() {
  const $ = id => document.getElementById(id);
  const symType = S.sym.n > 1 ? 'radial' : (S.sym.mirror ? 'mirror' : 'off');
  $('sym-type').value = symType;
  if (S.sym.n > 1) $('sym-n').value = S.sym.n;        // keep the last fold count while symmetry is off
  $('v-sym-n').textContent = $('sym-n').value;
  $('sym-kaleido').checked = S.sym.mirror;
  $('sym-radial').classList.toggle('hidden', symType !== 'radial');
  $('sym-note').classList.toggle('hidden', symType === 'off');

  $('layer-mode').value = S.layer.mode;
  $('layer-strength').value = S.layer.strength;
  $('v-layer-strength').textContent = S.layer.strength;

  $('bnd-shape').value = S.boundary.shape;
  $('bnd-sub').classList.toggle('hidden', S.boundary.shape === 'none');
  $('bnd-size').value = S.boundary.size;
  $('v-bnd-size').textContent = S.boundary.size;
  $('bnd-border').value = S.boundary.border;
  syncBorder();
  $('bnd-out-mode').value = S.boundary.outside ? 'own' : 'bg';
  $('bnd-out').classList.toggle('hidden', !S.boundary.outside);
  if (S.boundary.outside) { $('bnd-out').value = S.boundary.outside; $('bnd-out').dataset.used = 1; }
  $('xf-scale').value = Math.round(S.xf.scale * 100);
  $('v-xf-scale').textContent = Math.round(S.xf.scale * 100) + '%';
  $('xf-rot').value = S.xf.rot;
  $('v-xf-rot').textContent = S.xf.rot + '°';
  $('xf-reset').disabled = !xfOn();
  $('xf-centre').disabled = !(S.xf.x || S.xf.y);
  $('xf-fit').disabled = !fitRegionPoly();
  $('v-xf-pos').textContent = (S.xf.x || S.xf.y) ? `${Math.round(S.xf.x)}, ${Math.round(S.xf.y)}` : 'centre';

  $('pg-preset').value = S.page.preset;
  $('pg-sub').classList.toggle('hidden', !pageActive());
  $('pg-unit').value = S.page.unit;
  $('pg-w').value = +S.page.w.toFixed(S.page.unit === 'px' ? 0 : 1);
  $('pg-h').value = +S.page.h.toFixed(S.page.unit === 'px' ? 0 : 1);
  $('pg-bleed').value = S.page.bleed;
  $('pg-clip').checked = S.page.clip;
  if (pageActive()) {
    const m = pageMm();
    const pw = Math.round(m.w / 25.4 * E.dpi), ph = Math.round(m.h / 25.4 * E.dpi);
    $('pg-readout').textContent = `${+m.w.toFixed(1)} × ${+m.h.toFixed(1)} mm = ${pw} × ${ph} px @ ${E.dpi} DPI` +
      (m.bleed > 0 ? ` · +${m.bleed} mm bleed each side` : '');
  }

  updateExportReadout();
}

function syncExportControls() {
  document.getElementById('ex-frame').value = E.frame;
  document.getElementById('ex-cm').value = E.cm;
  document.getElementById('ex-dpi').value = E.dpi;
  document.getElementById('ex-transparent').checked = E.transparent;
  document.getElementById('ex-minmm').value = E.minMm;
  document.getElementById('ex-mingap').value = E.minGapMm;
  document.getElementById('ex-minpiece').value = E.minPiece;
  document.getElementById('ex-cutstyle').value = E.cutStyle;
  const lv = loopSettings();
  document.getElementById('ex-loop-s').value = lv.secs;
  document.getElementById('v-loop-s').textContent = lv.secs;
  document.getElementById('ex-loop-fps').value = lv.fps;
  document.getElementById('ex-loop-size').value = lv.size;
  document.getElementById('ex-loop-bg').value = lv.bg;
  const pid = cutPresetId();
  document.getElementById('ex-cutpreset').value = pid;
  document.getElementById('ex-cut-sum').textContent = (pid === 'custom' ? 'Custom' : CUT_PRESETS[pid].label) +
    ` · lines ≥ ${E.minMm} mm · gaps ≥ ${E.minGapMm} mm · ${E.cutStyle === 'hairline' ? 'hairline outlines' : 'filled shape'}`;
  updateExportReadout();
  scheduleCut();
  try { localStorage.setItem(LS_EXPORT, JSON.stringify(E)); } catch (e) { /* ignore */ }
}

function updateExportReadout() {
  const fmt = E.fmt;
  const $ = id => document.getElementById(id);
  // A page dictates the frame and size, so those controls go away
  // and the readout says what wins
  const fixed = pageActive();
  $('ex-size-ctrls').classList.toggle('hidden', pageActive() || fmt === 'video');
  $('ex-cm').closest('.cg').classList.toggle('hidden', fixed);
  document.querySelectorAll('#ex-format button').forEach(b => b.setAttribute('aria-selected', b.dataset.fmt === fmt));
  document.querySelectorAll('.drawer .fmt').forEach(el => { el.hidden = el.dataset.fmt !== fmt; });
  $('btn-export-go').textContent = { png: 'Export PNG', cut: 'Export cut SVG', svg: 'Export stroke SVG', video: 'Render loop video' }[fmt];

  const cm = exportCm();
  const parts = [];
  if (fmt === 'video') {
    const lv = loopSettings(), [w, h] = loopSize(lv.size);
    $('ex-loop-screen').textContent = `This screen (${loopScreenSize().join(' × ')})`;
    parts.push(`${w} × ${h} px`, `${lv.secs} s`, `${lv.secs * lv.fps} frames`, 'MP4');
    $('ex-loop-bg-note').classList.toggle('hidden', !(lv.bg === 'black' && loopBgLight()));
  } else if (pageActive()) { const m = pageMm(); parts.push(`Page: ${+m.w.toFixed(1)} × ${+m.h.toFixed(1)} mm` + (m.bleed ? ` + ${m.bleed} mm bleed` : '')); }
  else if (fmt === 'png') parts.push(`${+cm.toFixed(1)} cm`);
  if (fmt === 'png') {
    const px = exportPx();
    const capped = Math.round(cm / 2.54 * E.dpi) > MAX_EXPORT_PX;
    parts.push(`${px} px${capped ? ` (capped; ≈ ${Math.round(px / (cm / 2.54))} DPI)` : ''}`);
  }
  $('ex-readout').textContent = parts.join(' · ');
}

// ── SHELL: tabs, toolbar, export drawer, shortcuts ─────────────────────────
// Layout state of the page itself (tab, drawer, folded menu), saved in LS_UI.
const LS_UI = 'nodelink.ui';
const APP_VERSION = 'Phase 44c (24-11-2026)';   // shown in About; update with every published phase
// About or the loop video's progress is open: no shortcuts
function modalOpen() { return document.getElementById('about').open || document.getElementById('loop-dlg').open; }
function setTab(name) {
  document.querySelectorAll('.tabs .tab').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === name));
  document.querySelectorAll('aside .panel').forEach(p => { p.hidden = p.dataset.panel !== name; });
  saveUi({ tab: name });
}

function syncHandleToggles() {
  const n = document.getElementById('tb-numbers');
  document.getElementById('btn-toggle-nodes').setAttribute('aria-pressed', S.showNodes);
  n.setAttribute('aria-pressed', S.showNumbers);
  n.disabled = !S.showNodes;
}

function saveUi(patch) {
  try {
    const ui = JSON.parse(localStorage.getItem(LS_UI) || 'null') || {};
    localStorage.setItem(LS_UI, JSON.stringify({ ...ui, ...patch }));
  } catch (e) { /* ignore */ }
}

function setDrawer(open) {
  document.getElementById('export-drawer').hidden = !open;
  document.getElementById('tb-export').setAttribute('aria-expanded', open);
  if (open) updateExportReadout();
}

// Short summaries on collapsed groups, so a closed group still says what's set
function syncSummaries() {
  const pn = id => (PALETTES.find(p => p.id === id) || { name: 'custom' }).name.toLowerCase();
  document.getElementById('sum-colour').textContent = (S.palette.mode === 'tint' ? pn(S.palette.preset) : S.palette.mode === 'stencil' ? 'own colours' : 'original')
    + (S.palette.l2 && S.layer.mode !== 'none' ? ' · L2 ' + pn(S.palette.l2.preset) : '');
}

// Fold the side menu (bottom sheet on a phone) away, or bring it back.
// The canvas keeps the same view centre; it just gets more room.
function setMenu(open, quiet) {
  document.body.classList.toggle('menu-min', !open);
  document.getElementById('tb-menu').setAttribute('aria-pressed', open);
  if (quiet) return;
  saveUi({ menu: open });
  layoutCanvas();
  update();
}

function setupShell() {
  let tab = 'design';
  try {
    const ui = JSON.parse(localStorage.getItem(LS_UI) || 'null') || {};
    tab = ui.tab || tab;
    if (ui.numbers === false) S.showNumbers = false;
  } catch (e) { /* ignore */ }
  syncHandleToggles();
  try { if ((JSON.parse(localStorage.getItem(LS_UI) || 'null') || {}).menu === false) setMenu(false, true); } catch (e) { /* ignore */ }
  document.getElementById('tb-menu').addEventListener('click', () => setMenu(document.body.classList.contains('menu-min')));
  document.querySelectorAll('.tabs .tab').forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));
  setTab(document.querySelector(`.tabs .tab[data-tab="${tab}"]`) ? tab : 'design');

  const $ = id => document.getElementById(id);
  $('tb-reseed').addEventListener('click', () => $('btn-reseed').click());
  $('tb-cut').addEventListener('click', () => setCutPreview(!CUT.on));
  $('tb-numbers').addEventListener('click', () => {
    S.showNumbers = !S.showNumbers;
    saveUi({ numbers: S.showNumbers });
    syncHandleToggles();
    renderNodeDOM();
  });
  $('tb-export').addEventListener('click', () => setDrawer($('export-drawer').hidden));
  $('ex-close').addEventListener('click', () => setDrawer(false));
  document.querySelectorAll('#ex-format button').forEach(b => b.addEventListener('click', () => { E.fmt = b.dataset.fmt; syncExportControls(); }));
  $('btn-export-go').addEventListener('click', () => ({ png: exportPNG, cut: exportCutSVG, svg: exportStrokeSVG, video: exportLoopVideo })[E.fmt]());
  $('ex-loop-s').addEventListener('input', e => { E.loopS = parseInt(e.target.value, 10); syncExportControls(); });
  $('ex-loop-fps').addEventListener('change', e => { E.loopFps = parseInt(e.target.value, 10); syncExportControls(); });
  $('ex-loop-size').addEventListener('change', e => { E.loopSize = e.target.value; syncExportControls(); });
  $('ex-loop-bg').addEventListener('change', e => { E.loopBg = e.target.value; syncExportControls(); });
  // Esc or Cancel stops a render (the dialog stays until it has wound down)
  $('loop-cancel').addEventListener('click', () => { LOOP.cancel = true; });
  $('loop-dlg').addEventListener('cancel', e => { e.preventDefault(); LOOP.cancel = true; });
  ['palette', 'layer-mode'].forEach(id => $(id).addEventListener('change', syncSummaries));

  // Single-key shortcuts, ignored while typing
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, tag = (t.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'select' || (tag === 'input' && !['checkbox', 'range', 'radio'].includes(t.type))) return;
    if (modalOpen()) return;
    const k = e.key.toLowerCase();
    if (k === '?') { e.preventDefault(); setHelp(!HELP.on); return; }
    if (k === 'escape' && HELP.on) { setHelp(false); return; }
    if (k === 'escape') { if (ANIM.ambient) exitAmbient(); else if (!$('export-drawer').hidden) setDrawer(false); return; }
    if (k === 'f') { e.preventDefault(); ANIM.ambient ? exitAmbient() : enterAmbient(); return; }
    if (ANIM.ambient) return;                  // no editing keys on a background screen
    if (k === 'a') { e.preventDefault(); $(e.shiftKey ? 'tb-anim-reset' : 'tb-anim').click(); return; }
    if (k === 'm') { e.preventDefault(); setMoveDesign(!S.moveDesign); return; }
    if (k === '\\') { e.preventDefault(); $('tb-menu').click(); return; }
    if (S.moveDesign && k.startsWith('arrow') && tag !== 'input') {
      e.preventDefault();
      const d = e.shiftKey ? 10 : 1;
      nudgeDesign(k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0, k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0);
      clearTimeout(nudgeDesign.t); nudgeDesign.t = setTimeout(commit, 400);
      return;
    }
    const act = { r: 'btn-reseed', v: 'btn-random', s: 'tb-shuffle', x: 'tb-randomize', h: 'btn-toggle-nodes', n: 'tb-numbers', c: 'tb-cut', e: 'tb-export' }[k];
    if (act) { e.preventDefault(); $(act).click(); }
  });
}

// ── EVENTS ─────────────────────────────────────────────────────────────────
// setupEvents(): wires every control once, at INIT, group by group (the
// bind* functions below). The order matters only where two groups listen
// to the same thing (document keydown: history keys before setupShell).
function setupEvents() {
  bindDesignControls();
  bindComposition();
  bindModeOptions();
  bindHistoryControls();
  bindPaletteControls();
  bindNodeControls();
  bindLibrary();
  bindAbout();
  bindExportControls();

  setupShell();
  setupAnim();
  trackToolbar();
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches)
    document.querySelector('.hint').textContent = 'Drag nodes · drag background to pan · pinch to zoom · ✥ moves the design';
  bindZoomButtons();
  bindCanvasPointer();
}

// Design tab: the main sliders, mode, seed, Reseed and Random.
function bindDesignControls() {
  // Sliders: live redraw while dragging, history entry on release
  [['density', 'density'], ['sigma', 'sigma'], ['weight', 'weight'], ['dew', 'dew'], ['curve', 'curve']].forEach(([id, key]) => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => {
      lset(key, parseFloat(el.value));
      syncVals();
      update();
    });
    el.addEventListener('change', commit);
  });

  document.getElementById('mode').addEventListener('change', e => {
    S.mode = e.target.value;
    syncVals();
    update();
    commit();
  });

  const seedEl = document.getElementById('seed');
  seedEl.addEventListener('change', () => {
    const n = parseInt(seedEl.value.replace(/\D/g, ''), 10);
    if (isFinite(n)) lset('seed', n % 1000000);
    seedEl.value = lget('seed');
    update();
    commit();
  });

  document.getElementById('btn-reseed').addEventListener('click', () => {
    lset('seed', randomSeed());
    seedEl.value = lget('seed');
    update();
    commit();
  });

  document.getElementById('btn-random').addEventListener('click', () => {
    // Layer 2 without a design has nothing to vary: say so instead of doing nothing
    if (EDIT_L === 2 && S.layer.mode === 'none') {
      setStatus('There is no design in Layer 2 to vary: pick a mode for Layer 2 first', 5000);
      return;
    }
    lset('sigma', Math.floor(Math.random() * 100));
    lset('density', Math.floor(Math.random() * 5) + 4);
    lset('weight', +(Math.random() * 1.5 + 0.4).toFixed(1));
    lset('seed', randomSeed());
    // Nodes are shared by both layers, so only Layer 1's Vary changes them
    if (EDIT_L === 1) { S.nodes = varyNodeSizes(S.nodes); renderNodeRoster(); }
    syncControls();
    update();
    commit();
  });
}

// Composition: layer tabs and swap, symmetry, boundary, design transform, page format.
function bindComposition() {
  const $ = id => document.getElementById(id);
  const liveSlider = (id, apply) => {
    const el = $(id);
    el.addEventListener('input', () => { apply(parseFloat(el.value)); syncComposition(); update(); });
    el.addEventListener('change', commit);
  };
  const changeCtl = (id, apply) => {
    $(id).addEventListener('change', e => { apply(e.target); syncComposition(); update(); commit(); });
  };

  document.querySelectorAll('#ed-layer button').forEach(b => b.addEventListener('click', () => {
    EDIT_L = +b.dataset.l;
    syncControls();
  }));
  // The layer being edited follows its design to the other slot
  $('layer-swap').addEventListener('click', () => {
    if (!swapLayers()) return;
    EDIT_L = EDIT_L === 1 ? 2 : 1;
    syncControls(); syncComposition(); update(); commit();
  });

  changeCtl('sym-type', t => {
    if (t.value === 'off') S.sym = { n: 1, mirror: false };
    else if (t.value === 'mirror') S.sym = { n: 1, mirror: true };
    else S.sym = { n: Math.max(2, parseInt($('sym-n').value, 10) || 6), mirror: $('sym-kaleido').checked };
  });
  liveSlider('sym-n', v => { S.sym.n = Math.round(v); });
  changeCtl('sym-kaleido', t => { S.sym.mirror = t.checked; });

  changeCtl('layer-mode', t => { S.layer.mode = t.value; syncControls(); });
  liveSlider('layer-strength', v => { S.layer.strength = v; });

  changeCtl('bnd-shape', t => { S.boundary.shape = t.value; fitView(); });
  liveSlider('bnd-size', v => { S.boundary.size = v; });
  liveSlider('xf-scale', v => { S.xf.scale = v / 100; renderNodeDOM(); });
  liveSlider('xf-rot', v => { S.xf.rot = v; renderNodeDOM(); });
  $('xf-reset').addEventListener('click', () => { S.xf = { scale: 1, rot: 0, x: 0, y: 0 }; syncComposition(); renderNodeDOM(); update(); commit(); });
  $('xf-centre').addEventListener('click', () => { S.xf.x = 0; S.xf.y = 0; syncComposition(); renderNodeDOM(); update(); commit(); });
  let fitTimer = 0;
  $('xf-fit').addEventListener('click', () => {
    const n = fitNodes(), b = $('xf-fit');
    if (n > 0) { renderNodeRoster(); renderNodeDOM(); update(); commit(); }
    const big = fitNodes.tooBig;
    b.textContent = big ? `${big} node${big > 1 ? 's' : ''} too big to fit: lower the scale`
      : n > 0 ? `Moved ${n} node${n > 1 ? 's' : ''} inside` : n === 0 ? 'All nodes already fit'
      : n === -2 ? 'Centre the design first' : 'No boundary or page to fit to';
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => { b.textContent = 'Fit nodes inside'; }, big ? 3000 : 1800);
  });
  $('xf-move').addEventListener('click', () => setMoveDesign(!S.moveDesign));
  $('btn-move').addEventListener('click', () => setMoveDesign(!S.moveDesign));
  changeCtl('bnd-border', t => { S.boundary.border = t.value; });
  // Border thickness: moving the slider gives the border its own thickness;
  // Follow Stroke weight takes it back to 2.4 × Stroke weight
  liveSlider('bnd-lw', v => { S.boundary.lw = v; });
  changeCtl('bnd-lw-auto', t => { S.boundary.lw = t.checked ? null : borderLw(); });
  // Border colour: the first time, the colour the border has now (the
  // scheme's accent), so switching to Own colour changes nothing until picked
  changeCtl('bnd-col-mode', t => {
    const pick = $('bnd-col');
    if (t.value === 'own' && !pick.dataset.used) {
      const acc = ACCENT[S.mode] || '#ddd6c8', map = makeColorMap(S.palette), now = map ? map(acc) : acc;
      const c = parseColor(now);
      if (c) pick.value = '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    }
    pick.dataset.used = 1;
    S.boundary.color = t.value === 'own' ? pick.value : null;
  });
  $('bnd-col').addEventListener('input', e => { S.boundary.color = e.target.value; update(); });
  $('bnd-col').addEventListener('change', () => commit());
  // Outside colour: the picker keeps its last colour while switched to
  // Background; the first time, a grey that stands apart from the background
  changeCtl('bnd-out-mode', t => {
    const pick = $('bnd-out');
    if (t.value === 'own' && !pick.dataset.used) {
      const b = parseColor(S.palette.mode === 'original' ? modeBg(S.mode) : S.palette.paper) || { r: 0, g: 0, b: 0 };
      pick.value = 0.2126 * b.r + 0.7152 * b.g + 0.0722 * b.b > 128 ? '#c8c8c8' : '#2a2a2a';
    }
    pick.dataset.used = 1;
    S.boundary.outside = t.value === 'own' ? pick.value : null;
  });
  $('bnd-out').addEventListener('input', e => { S.boundary.outside = e.target.value; update(); });
  $('bnd-out').addEventListener('change', () => commit());

  // Page format
  changeCtl('pg-preset', t => {
    S.page.preset = t.value;
    const pr = PAGE_PRESETS[t.value];
    if (pr) { S.page.unit = 'mm'; S.page.w = pr[0]; S.page.h = pr[1]; }
    fitView();
  });
  changeCtl('pg-unit', t => {
    // keep the physical size, convert the numbers
    const k = t.value === 'px' ? E.dpi / 25.4 : 25.4 / E.dpi;
    if (t.value !== S.page.unit) {
      S.page.w = Math.round(S.page.w * k * 10) / 10;
      S.page.h = Math.round(S.page.h * k * 10) / 10;
      if (t.value === 'px') { S.page.w = Math.round(S.page.w); S.page.h = Math.round(S.page.h); }
    }
    S.page.unit = t.value;
  });
  ['w', 'h'].forEach(k => changeCtl('pg-' + k, t => {
    S.page[k] = clampNum(t.value, 1, 20000, S.page[k]);
    if (S.page.preset !== 'custom') S.page.preset = 'custom';
    fitView();
  }));
  changeCtl('pg-bleed', t => { S.page.bleed = clampNum(t.value, 0, 20, 0); });
  changeCtl('pg-clip', t => { S.page.clip = t.checked; });
  $('pg-rotate').addEventListener('click', () => {
    const w = S.page.w;
    S.page.w = S.page.h;
    S.page.h = w;
    // a rotated preset is still that preset
    fitView();
    syncComposition();
    update();
    commit();
  });
}

// Mode options (PCB, Stained Glass, Synaptic Web, Nebula, Schematics, Lightning, Arcane,
// Microscope, Vines, Cathedral Glass, Water Circles, Spiderweb curve).
function bindModeOptions() {
  const pour = document.getElementById('pcb-pour');
  pour.addEventListener('input', () => { lset('pcb', { ...lget('pcb'), pour: parseFloat(pour.value) }); syncVals(); update(); });
  pour.addEventListener('change', commit);
  // Checkboxes and selects that set one mode option, then redraw and commit
  const optNow = (id, key, field) => document.getElementById(id).addEventListener('change', e => {
    lset(key, { ...lget(key), [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
    update();
    commit();
  });
  optNow('pcb-meander', 'pcb', 'meander');
  optNow('pcb-silk', 'pcb', 'silk');
  optNow('stain-ragged', 'stained', 'ragged');
  optNow('stain-ring', 'stained', 'ring');
  optNow('web-ring', 'web', 'ring');
  optNow('neb-glow', 'nebula', 'glow');
  optNow('chaos-style', 'chaos', 'style');
  optNow('chaos-frames', 'chaos', 'frames');
  optNow('chaos-links', 'chaos', 'links');
  optNow('light-glow', 'lightning', 'glow');
  optNow('light-fill', 'lightning', 'fill');
  // Arcane and microscope options: checkboxes and selects commit at once,
  // sliders draw live and commit on release
  const optCtl = (id, key, field, kind) => {
    const el = document.getElementById(id);
    const val = () => kind === 'check' ? el.checked : kind === 'num' ? parseFloat(el.value) : el.value;
    const set = () => { lset(key, { ...lget(key), [field]: val() }); syncVals(); update(); };
    if (kind === 'num') { el.addEventListener('input', set); el.addEventListener('change', commit); }
    else el.addEventListener('change', () => { set(); commit(); });
  };
  optCtl('arc-snap', 'arcane', 'snap', 'check');
  optCtl('arc-wobble', 'arcane', 'wobble', 'num');
  optCtl('arc-links', 'arcane', 'links', 'check');
  optCtl('arc-sats', 'arcane', 'sats', 'check');
  optCtl('micro-specimen', 'micro', 'specimen', 'sel');
  optCtl('micro-veins', 'micro', 'veins', 'check');
  optCtl('micro-orgs', 'micro', 'orgs', 'num');
  optCtl('micro-cilia', 'micro', 'cilia', 'sel');
  optCtl('micro-detail', 'micro', 'detail', 'check');
  optCtl('vine-leaves', 'vine', 'leaves', 'num');
  optCtl('vine-flowers', 'vine', 'flowers', 'num');
  optCtl('vine-leaf', 'vine', 'leaf', 'sel');
  optCtl('vine-bloom', 'vine', 'bloom', 'sel');
  optCtl('vine-season', 'vine', 'season', 'sel');
  optCtl('vine-tendrils', 'vine', 'tendrils', 'check');
  optCtl('vine-veins', 'vine', 'veins', 'check');
  optCtl('glass-style', 'glass', 'style', 'sel');
  optCtl('glass-set', 'glass', 'set', 'sel');
  optCtl('glass-light', 'glass', 'light', 'check');
  optCtl('water-meet', 'water', 'meet', 'sel');
  optCtl('water-spacing', 'water', 'spacing', 'num');
  optCtl('water-drops', 'water', 'drops', 'num');

  document.getElementById('curved').addEventListener('change', e => {
    lset('curved', e.target.checked);
    syncControls();
    update();
    commit();
  });
}

// Undo / redo buttons and Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y.
function bindHistoryControls() {
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);

  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' && (e.target.type === 'text' || e.target.type === 'number')) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    if (modalOpen()) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
  });
}

// Palette: colour scheme, Layer 2 colours, ink / paper / glow pickers.
function bindPaletteControls() {
  buildPaletteGrid();
  document.getElementById('palette').addEventListener('change', e => {
    const m = e.target.value;
    // First switch to a scheme: start from Phosphor rather than black on black
    if (m === 'tint' && S.palette.mode !== 'tint' && S.palette.preset === 'custom') applyPreset('phosphor', false);
    S.palette.mode = m;
    syncControls();
    update();
    commit();
  });
  document.getElementById('l2-same').addEventListener('change', e => {
    if (e.target.checked) S.palette.l2 = null;
    else {
      // Start from a scheme that differs from Layer 1's, so the change shows
      const p = PALETTES.find(q => q.id !== (S.palette.mode === 'tint' ? S.palette.preset : '')) || PALETTES[0];
      S.palette.l2 = { ink: p.ink, glow: p.glow, preset: p.id };
    }
    syncControls(); update(); commit();
  });
  ['ink', 'paper', 'glow'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => {
      const tgt = EDIT_L === 2 ? S.palette.l2 : S.palette;
      if (!tgt) return;
      tgt[id] = el.value;
      tgt.preset = 'custom';
      markPreset();
      update();
    });
    el.addEventListener('change', () => { syncSummaries(); commit(); });
  });
}

// Nodes: add, reset, show/hide, Shuffle, Randomise, auto-place.
function bindNodeControls() {
  const seedEl = document.getElementById('seed');
  document.getElementById('btn-add-node').addEventListener('click', () => {
    if (S.nodes.length >= 9) return;
    const { cx, cy, maxR } = nodeCentroid();
    const i = S.nodes.length;
    const a = Math.random() * Math.PI * 2;
    S.nodes.push(newNode(i, cx + Math.cos(a) * (maxR || 220), cy + Math.sin(a) * (maxR || 220)));
    renderNodeRoster();
    update();
    commit();
  });

  document.getElementById('btn-reset-nodes').addEventListener('click', () => {
    S.nodes = initNodes(S.nodes.length, 220, S.nodes);
    S.pan = { x: 0, y: 0 };
    S.zoom = 1;
    renderNodeRoster();
    update();
    commit();
  });

  document.getElementById('btn-toggle-nodes').addEventListener('click', () => {
    S.showNodes = !S.showNodes;
    syncHandleToggles();
    update();
  });

  document.getElementById('tb-shuffle').addEventListener('click', () => {
    S.nodes = randomNodes(3 + Math.floor(Math.random() * 7));   // 3..9
    S.seed = randomSeed();
    fitNodes();                                    // after the seed: the parts round the nodes depend on it
    seedEl.value = lget('seed');
    openNode = -1;
    renderNodeRoster();
    update();
    commit();
  });

  document.getElementById('tb-randomize').addEventListener('click', () => { randomizeAll(); commit(); });

  document.getElementById('btn-auto-place').addEventListener('click', () => {
    S.nodes = autoPlace(S.nodes);
    update();
    commit();
  });
}

// Library (Grimoire): favourite, Save .json with its file name, Load .json.
function bindLibrary() {
  document.getElementById('btn-fav').addEventListener('click', addFavourite);

  document.getElementById('btn-save-json').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(getPreset(), null, 2)], { type: 'application/json' });
    const name = jsonName();
    download(blob, name).then(ok => { if (ok) setStatus('Saved ' + name); });
  });
  const nameEl = document.getElementById('json-name');
  nameEl.addEventListener('focus', () => { nameEl.placeholder = fileBase(); });
  nameEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-save-json').click(); } });

  const fileEl = document.getElementById('file-json');
  document.getElementById('btn-load-json').addEventListener('click', () => fileEl.click());
  fileEl.addEventListener('change', async () => {
    const f = fileEl.files[0];
    fileEl.value = '';
    if (!f) return;
    try {
      applyPresetFile(JSON.parse(await f.text()));
      nameEl.value = f.name.replace(/\.json$/i, '');
      commit();
      setStatus('Preset loaded');
    } catch (err) {
      setStatus('Could not load: ' + err.message);
    }
  });
}

// About: the dialog opens from the menu title and the Library tab; Esc,
// × or a click on the backdrop closes it, and focus goes back to the opener.
function bindAbout() {
  const dlg = document.getElementById('about');
  document.getElementById('about-version').textContent = APP_VERSION;
  document.querySelectorAll('[data-about]').forEach(b => b.addEventListener('click', () => {
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }));
  document.getElementById('about-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });   // the backdrop
}

// Export settings and the cut panel.
function bindExportControls() {
  document.getElementById('ex-frame').addEventListener('change', e => { E.frame = e.target.value; syncExportControls(); });
  document.getElementById('ex-cm').addEventListener('change', e => { E.cm = clampNum(e.target.value, 1, 100, 10); syncExportControls(); });
  document.getElementById('ex-dpi').addEventListener('change', e => { E.dpi = parseInt(e.target.value, 10); syncExportControls(); syncComposition(); update(); });
  document.getElementById('ex-transparent').addEventListener('change', e => { E.transparent = e.target.checked; syncExportControls(); });
  [['ex-minmm', 'minMm', 5, 0.8], ['ex-mingap', 'minGapMm', 5, 0.5], ['ex-minpiece', 'minPiece', 50, 1]].forEach(([id, k, max, def]) => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => { if (el.value !== '') { E[k] = clampNum(el.value, 0, max, def); scheduleCut(); } });
    el.addEventListener('change', () => { E[k] = clampNum(el.value, 0, max, def); syncExportControls(); });
  });
  document.getElementById('cut-chip').addEventListener('click', e => {
    if (!e.target.closest('#btn-blob-fix') || !CUT.res) return;
    const fix = blobFix(CUT.res);
    if (!fix) return;
    Object.assign(E, fix.patch);
    syncExportControls();
    setStatus(fix.label.replace('Ease cleanup: ', 'Cleanup eased: '));
  });
  document.getElementById('ex-cutstyle').addEventListener('change', e => { E.cutStyle = e.target.value; syncExportControls(); });
  const presetSel = document.getElementById('ex-cutpreset');
  presetSel.innerHTML = Object.entries(CUT_PRESETS).map(([id, p]) => `<option value="${id}">${p.label}</option>`).join('') +
    '<option value="custom" disabled>Custom</option>';
  presetSel.addEventListener('change', () => {
    const p = CUT_PRESETS[presetSel.value];
    if (p) { CUT_FIELDS.forEach(f => { E[f] = p[f]; }); E.cutPreset = presetSel.value; }
    syncExportControls();
  });
  document.getElementById('cut-collapse').addEventListener('click', e => {
    const body = document.getElementById('cut-body'), open = body.classList.toggle('hidden');
    e.currentTarget.textContent = open ? '▾' : '▴';
    e.currentTarget.setAttribute('aria-expanded', !open);
  });
  document.getElementById('ex-cut-edit').addEventListener('click', () => { setCutPreview(true); setDrawer(false); });
  syncExportControls();
}

// Zoom buttons.
function bindZoomButtons() {
  document.getElementById('btn-zi').addEventListener('click', () => {
    S.zoom = Math.min(5, S.zoom * 1.25);
    update();
  });
  document.getElementById('btn-zo').addEventListener('click', () => {
    S.zoom = Math.max(0.2, S.zoom / 1.25);
    update();
  });
  document.getElementById('btn-zr').addEventListener('click', () => {
    fitView();
    update();
  });
}

// Canvas pointer: pan, move design (✥ or Shift), node drags, pinch and wheel zoom, resize.
function bindCanvasPointer() {
  const cc = document.getElementById('canvas-container');
  cc.addEventListener('mousedown', e => {
    if (S.draggingNode === null && (e.target === canvas || e.target === cc)) {
      S.isPanning = true;
      S.movingDesign = S.moveDesign || e.shiftKey;
      cc.classList.add('grabbing');
    }
  });

  let lastTouch = null;
  let initialPinchDist = null;
  let initialZoom = null;

  cc.addEventListener('touchstart', e => {
    if (S.draggingNode === null && (e.target === canvas || e.target === cc)) {
      if (e.touches.length === 1) {
        S.isPanning = true;
        S.movingDesign = S.moveDesign;
        cc.classList.add('grabbing');
        lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        initialPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        initialZoom = S.zoom;
        S.isPanning = false;
      }
    }
  }, { passive: false });

  function moveNodeTo(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / CC;
    const mx = (clientX - rect.left) / scale - CC / 2;
    const my = (clientY - rect.top) / scale - CC / 2;
    const q = ixf({ x: (mx - S.pan.x) / S.zoom, y: (my - S.pan.y) / S.zoom });
    S.nodes[S.draggingNode].x = q.x;
    S.nodes[S.draggingNode].y = q.y;
    if (ANIM.playing) ANIM.dw[S.draggingNode] = 0;   // hold it under the pointer
    update();
  }

  window.addEventListener('mousemove', e => {
    if (S.draggingNode !== null) {
      moveNodeTo(e.clientX, e.clientY);
    } else if (S.isPanning) {
      const scale = canvas.getBoundingClientRect().width / CC;
      if (S.movingDesign) nudgeDesign(e.movementX / scale / S.zoom, e.movementY / scale / S.zoom);
      else { S.pan.x += e.movementX / scale; S.pan.y += e.movementY / scale; update(); }
    }
  });

  window.addEventListener('touchmove', e => {
    if (S.draggingNode !== null) {
      e.preventDefault();
      moveNodeTo(e.touches[0].clientX, e.touches[0].clientY);
    } else if (S.isPanning && e.touches.length === 1 && lastTouch) {
      e.preventDefault();
      const scale = canvas.getBoundingClientRect().width / CC;
      const dx = (e.touches[0].clientX - lastTouch.x) / scale, dy = (e.touches[0].clientY - lastTouch.y) / scale;
      if (S.movingDesign) nudgeDesign(dx / S.zoom, dy / S.zoom);
      else { S.pan.x += dx; S.pan.y += dy; }
      lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      update();
    } else if (e.touches.length === 2 && initialPinchDist) {
      e.preventDefault();
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      S.zoom = Math.max(0.2, Math.min(5, initialZoom * (dist / initialPinchDist)));
      update();
    }
  }, { passive: false });

  const endInteraction = () => {
    const wasDragging = S.draggingNode !== null || (S.isPanning && S.movingDesign);
    S.draggingNode = null;
    S.isPanning = false;
    S.movingDesign = false;
    lastTouch = null;
    initialPinchDist = null;
    cc.classList.remove('grabbing');
    update();
    if (wasDragging) commit();
  };

  window.addEventListener('mouseup', endInteraction);
  window.addEventListener('touchend', endInteraction);
  window.addEventListener('touchcancel', endInteraction);

  viewport.addEventListener('wheel', e => {
    e.preventDefault();
    S.zoom *= e.deltaY < 0 ? 1.1 : 0.9;
    S.zoom = Math.max(0.2, Math.min(5, S.zoom));
    update();
  }, { passive: false });

  window.addEventListener('resize', () => {
    layoutCanvas();
    update();
  });
}

// ── INIT ───────────────────────────────────────────────────────────────────
// Restores the autosave and export settings, then the first draw.
window.onload = () => {
  layoutCanvas();

  // Restore last session and export settings (none: first visit)
  let firstVisit = true;
  try {
    const saved = localStorage.getItem(LS_STATE);
    firstVisit = !saved;
    if (saved) applyDesign(JSON.parse(saved));
  } catch (e) { /* first run or bad data: keep defaults */ }
  try {
    const ex = JSON.parse(localStorage.getItem(LS_EXPORT) || 'null');
    if (ex) Object.assign(E, ex);
  } catch (e) { /* ignore */ }

  fitView();
  syncControls();
  syncExportControls();
  renderNodeRoster();
  renderFavs();
  setupEvents();
  initHelp(firstVisit);
  commit();
  update();
  // Labels use a web font: redraw once it has loaded
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => update());
};
