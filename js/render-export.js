// ── RENDERING ──────────────────────────────────────────────────────────────
// Border colour per mode (matches each renderer's main line colour)
// draw(): the screen canvas, each frame or update(). renderTo(): any target
// (screen view, export layout); both end in renderDesign.
const ACCENT = { pcb: '#22d0ff', foam: '#ddd6c8', web: '#ddd6c8', constellation: '#e4ddd0',
  chaosgate: '#e4ddd0', arcane: '#e4ddd0', stained: '#d9cfbd', spiderweb: '#eef3f6', nebula: '#c9b8ff', lightning: '#cfe0ff', microscope: '#bfe9dc', vine: '#b5d29a', glass: '#e6cf8a' };
function modeBg(mode) {
  if (mode === 'spiderweb') return '#0b0e11';
  if (mode === 'nebula') return '#05040c';
  if (mode === 'lightning') return '#04060d';
  if (mode === 'microscope') return '#03100e';
  if (mode === 'vine') return '#060b07';
  if (mode === 'glass') return '#07070a';
  return (mode === 'pcb' || mode === 'constellation') ? '#040a14' : '#080808';
}

// Editor-only guides: symmetry wedge, ghost copies of the node rings
function drawGuides(c, raw) {
  const z = S.zoom;
  const copies = symCopies();
  if (copies[0].wedge) {
    raw.save();
    applyXf(raw);
    const z = S.zoom * (S.xf ? S.xf.scale : 1);
    const wd = copies[0].wedge;
    const L = 3000;
    raw.setLineDash([5 / z, 7 / z]);
    raw.strokeStyle = 'rgba(90, 169, 255, 0.45)';
    raw.lineWidth = 1 / z;
    raw.beginPath();
    raw.moveTo(Math.cos(wd[0]) * L, Math.sin(wd[0]) * L); raw.lineTo(0, 0);
    raw.lineTo(Math.cos(wd[1]) * L, Math.sin(wd[1]) * L);
    raw.stroke();
    raw.setLineDash([]);
    raw.beginPath();
    raw.moveTo(-8 / z, 0); raw.lineTo(8 / z, 0); raw.moveTo(0, -8 / z); raw.lineTo(0, 8 / z);
    raw.stroke();
    if (S.showNodes) {
      raw.strokeStyle = 'rgba(90, 169, 255, 0.2)';
      shownNodes().forEach(n => copies.slice(1).forEach(cp => {
        const p = copyPoint(cp, n.x, n.y);
        raw.beginPath(); raw.arc(p.x, p.y, 10 / S.xf.scale, 0, Math.PI * 2); raw.stroke();
      }));
    }
    raw.restore();
  }
  if (pageActive()) {
    const t = pageRect(false), b = pageRect(true), F = 20000;
    c.fillStyle = modeBg(S.mode);
    c.globalAlpha = 0.7;
    c.fillRect(-F, -F, 2 * F, F + b.y);                       // above
    c.fillRect(-F, b.y + b.h, 2 * F, F);                      // below
    c.fillRect(-F, b.y, F + b.x, b.h);                        // left
    c.fillRect(b.x + b.w, b.y, F, b.h);                       // right
    c.globalAlpha = 1;
    // Pasteboard: tint + diagonal hatch outside the bleed, contrasting with
    // the background (lighter on dark, darker on paper) so the trim reads at
    // a glance even when the design is clipped to the page
    const bgCol = parseColor(S.palette.mode === 'stencil' ? S.palette.paper : modeBg(S.mode)) || { r: 0, g: 0, b: 0 };
    const dark = (0.2126 * bgCol.r + 0.7152 * bgCol.g + 0.0722 * bgCol.b) / 255 < 0.5;
    raw.save();
    raw.beginPath();
    raw.rect(-F, -F, 2 * F, 2 * F);
    raw.rect(b.x, b.y, b.w, b.h);
    raw.clip('evenodd');
    raw.fillStyle = dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.07)';
    raw.fillRect(-F, -F, 2 * F, 2 * F);
    raw.strokeStyle = dark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.1)';
    raw.lineWidth = 1 / z;
    // 45° hatch, spaced in screen pixels, covering the view around the page
    const step = 9 / z, ext = 2400 / z;
    const y0 = b.y - ext, y1 = b.y + b.h + ext, span = y1 - y0;
    raw.beginPath();
    for (let x = Math.floor((b.x - ext - span) / step) * step; x < b.x + b.w + ext; x += step) {
      raw.moveTo(x, y0); raw.lineTo(x + span, y1);
    }
    raw.stroke();
    raw.restore();
    raw.lineWidth = 1 / z;
    raw.strokeStyle = 'rgba(90, 169, 255, 0.75)';
    raw.setLineDash([]);
    raw.strokeRect(t.x, t.y, t.w, t.h);
    if (S.page.bleed > 0) {
      raw.setLineDash([4 / z, 4 / z]);
      raw.strokeStyle = 'rgba(90, 169, 255, 0.4)';
      raw.strokeRect(b.x, b.y, b.w, b.h);
      raw.setLineDash([]);
    }
  }
}

// view: { scale, tx, ty } maps world → target pixels
// opts: { map, noBackground, overlay }
let CUR_MAP = null;     // colour map of the render in progress (for fade buffers)
// Exports, bounds and the cut while paused: the paused frame (what is on
// screen), unless opts.still. Stopped or playing: the design itself.
function frozenFrame() {
  return ANIM.frozen && !ANIM.playing && ANIM.frame && dlKey() === ANIM.frozenKey ? ANIM.frame : null;
}
function renderTo(raw, w, h, view, opts = {}) {
  const keepLive = ANIM.live, keepExp = ANIM.exporting;
  if (!keepLive && !opts.still && !opts.overlay && frozenFrame()) { ANIM.live = true; ANIM.exporting = true; }
  try { renderToInner(raw, w, h, view, opts); } finally { ANIM.live = keepLive; ANIM.exporting = keepExp; }
}
function renderToInner(raw, w, h, view, opts) {
  CUR_MAP = opts.map || null;
  const c = paletteCtx(raw, opts.map);
  if (!opts.noBackground) {
    c.fillStyle = modeBg(S.mode);
    c.fillRect(0, 0, w, h);
  }
  c.save();
  c.translate(view.tx, view.ty);
  c.scale(view.scale, view.scale);
  renderDesign(c);

  // Editor overlay: drawn unmapped on the live canvas only
  if (opts.overlay) drawGuides(c, raw);
  if (opts.overlay && S.showNodes) {
    raw.globalAlpha = 1;
    shownNodes().forEach(n0 => {
      const n = dxf(n0);
      raw.beginPath();
      raw.arc(n.x, n.y, 18, 0, Math.PI * 2);
      raw.strokeStyle = 'rgba(90, 169, 255, 0.25)';
      raw.lineWidth = 0.6 / S.zoom;
      raw.stroke();
      raw.beginPath();
      raw.arc(n.x, n.y, 3, 0, Math.PI * 2);
      raw.strokeStyle = 'rgba(90, 169, 255, 0.5)';
      raw.lineWidth = 0.8 / S.zoom;
      raw.stroke();
    });
  }
  c.restore();
}

// Live canvas: CC world units across, backing store scaled for HiDPI
function draw() {
  // Width spans CC world units; the height is centred (square in the editor,
  // the screen's shape in ambient mode)
  const k = canvas.width / CC;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  const view = { scale: S.zoom * k, tx: (CC / 2 + S.pan.x) * k, ty: canvas.height / 2 + S.pan.y * k };
  // Blink: where the pointer is, in design-page coordinates (the eyes follow it)
  if (ANIM.pointer) ANIM.gazeTarget = { x: (ANIM.pointer.fx * canvas.width - view.tx) / view.scale, y: (ANIM.pointer.fy * canvas.height - view.ty) / view.scale };
  if (ANIM.frozen && !ANIM.playing && dlKey() !== ANIM.frozenKey) dropFrozen();
  ANIM.live = (ANIM.playing || ANIM.frozen) && !!ANIM.frame;
  try {
    renderTo(ctx, canvas.width, canvas.height, view, { map: makeColorMap(S.palette), overlay: !ANIM.ambient });
  } finally {
    ANIM.live = false;
  }
  if (CUT.on) drawCutPreview(ctx, view);
}

function layoutCanvas() {
  const vp = document.getElementById('viewport');
  if (ANIM.ambient) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    const f = Math.min(1, 3000 / Math.max(w * dpr, h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const rs = ANIM.playing ? ANIM.res : 1;
    canvas.width = Math.round(w * dpr * f * rs);
    canvas.height = Math.round(h * dpr * f * rs);
    return;
  }
  // Padding reserves room (the toolbar on a phone): fit inside what is left
  const cs = getComputedStyle(vp);
  const aw = vp.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = vp.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const cssScale = Math.min(aw / CC, ah / CC) * 0.92;
  const cssSize = Math.max(100, CC * cssScale);
  const dpr = window.devicePixelRatio || 1;
  const backing = Math.min(3000, Math.round(cssSize * dpr * (ANIM.playing ? ANIM.res : 1)));
  canvas.style.width = `${cssSize}px`;
  canvas.style.height = `${cssSize}px`;
  canvas.width = backing;
  canvas.height = backing;
}

// ── FRAMING ────────────────────────────────────────────────────────────────
// Export size and view (exportLayout) and renderRaster, the offscreen render
// used by PNG, the cut trace and favourite thumbnails.
const STENCIL_MAP = makeColorMap({ mode: 'stencil', ink: '#000000', paper: '#ffffff' });

function nodeCentroid() {
  const n = S.nodes.length || 1;
  const cx = S.nodes.reduce((a, p) => a + p.x, 0) / n;
  const cy = S.nodes.reduce((a, p) => a + p.y, 0) / n;
  const maxR = S.nodes.reduce((m, p) => Math.max(m, Math.hypot(p.x - cx, p.y - cy)), 0);
  return { cx, cy, maxR };
}

// Finds the world-space rectangle that actually contains ink, by rendering a
// black-on-white scan and looking for non-white pixels.
function computeBounds() {
  if (pageActive()) return pageRect(true);
  const { cx, cy, maxR } = nodeCentroid();
  const span = Math.min(6400, Math.max(1200, maxR * 8));
  const N = 2000;
  const scale = N / span;
  const view = { scale, tx: N / 2 - cx * scale, ty: N / 2 - cy * scale };

  const sc = document.createElement('canvas');
  sc.width = N;
  sc.height = N;
  const c = sc.getContext('2d', { willReadFrequently: true });
  renderTo(c, N, N, view, { map: STENCIL_MAP });

  const data = c.getImageData(0, 0, N, N).data;
  let minX = N, minY = N, maxX = -1, maxY = -1;
  for (let y = 0; y < N; y++) {
    const row = y * N * 4;
    for (let x = 0; x < N; x++) {
      const i = row + x * 4;
      if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  let x0, y0, x1, y1;
  if (maxX < 0) {
    x0 = cx - maxR; x1 = cx + maxR; y0 = cy - maxR; y1 = cy + maxR;
  } else {
    x0 = (minX - view.tx) / scale;
    x1 = (maxX + 1 - view.tx) / scale;
    y0 = (minY - view.ty) / scale;
    y1 = (maxY + 1 - view.ty) / scale;
  }
  const margin = Math.max(x1 - x0, y1 - y0) * 0.04 + 2 / scale;
  return { x: x0 - margin, y: y0 - margin, w: (x1 - x0) + margin * 2, h: (y1 - y0) + margin * 2 };
}

function currentViewFrame() {
  const half = CC / 2 / S.zoom;
  const cxw = -S.pan.x / S.zoom;
  const cyw = -S.pan.y / S.zoom;
  return { x: cxw - half, y: cyw - half, w: half * 2, h: half * 2 };
}

const MAX_EXPORT_PX = 6000;

function exportCm() {
  if (pageActive()) { const m = pageMm(); return (Math.max(m.w, m.h) + 2 * m.bleed) / 10; }
  return E.cm;
}

// Output pixel size for the longest side, from cm + DPI
function exportPx() {
  return Math.min(MAX_EXPORT_PX, Math.max(64, Math.round(exportCm() / 2.54 * E.dpi)));
}

// Returns everything needed to draw the frame at a given longest-side size
function exportLayout(px, frameOverride) {
  const frame = frameOverride || (pageActive() || E.frame === 'bounds' ? computeBounds() : currentViewFrame());
  const longest = Math.max(frame.w, frame.h);
  const scale = px / longest;
  return {
    frame,
    W: Math.max(1, Math.round(frame.w * scale)),
    H: Math.max(1, Math.round(frame.h * scale)),
    view: { scale, tx: -frame.x * scale, ty: -frame.y * scale },
    cmW: exportCm() * frame.w / longest,
    cmH: exportCm() * frame.h / longest
  };
}

function renderRaster(L, map, opts = {}) {
  const ec = document.createElement('canvas');
  ec.width = L.W;
  ec.height = L.H;
  const c = ec.getContext('2d', { willReadFrequently: true });
  renderTo(c, L.W, L.H, L.view, { map, ...opts });
  return ec;
}

// ── COLOUR TO ALPHA ────────────────────────────────────────────────────────
// Removes a background colour while keeping antialiasing and glow edges
// (same idea as GIMP's colour-to-alpha). Masks painted in the background
// colour become transparent too.
// Used by: exportPNG for transparent backgrounds.
function colorToAlpha(canvasEl, bg) {
  const c = canvasEl.getContext('2d');
  const img = c.getImageData(0, 0, canvasEl.width, canvasEl.height);
  const d = img.data;
  const B = [bg.r, bg.g, bg.b];
  for (let i = 0; i < d.length; i += 4) {
    let a = 0;
    for (let k = 0; k < 3; k++) {
      const v = d[i + k], b = B[k];
      let ak = 0;
      if (v > b) ak = (v - b) / (255 - b);
      else if (v < b) ak = (b - v) / b;
      if (ak > a) a = ak;
    }
    if (a <= 0.002) {
      d[i + 3] = 0;
      continue;
    }
    for (let k = 0; k < 3; k++) {
      const v = d[i + k], b = B[k];
      d[i + k] = Math.max(0, Math.min(255, Math.round(b + (v - b) / a)));
    }
    d[i + 3] = Math.round(a * 255);
  }
  c.putImageData(img, 0, 0);
}

// ── PNG DPI (pHYs chunk) ───────────────────────────────────────────────────
// So the PNG opens at the intended physical size (Procreate, print, Cricut).
// Used by: exportPNG.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function pngWithDpi(canvasEl, dpi) {
  const blob = await new Promise(r => canvasEl.toBlob(r, 'image/png'));
  const src = new Uint8Array(await blob.arrayBuffer());
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  // Insert right after IHDR (8-byte signature + 25-byte IHDR chunk)
  const out = new Uint8Array(src.length + 21);
  out.set(src.subarray(0, 33), 0);
  out.set(chunk, 33);
  out.set(src.subarray(33), 54);
  return new Blob([out], { type: 'image/png' });
}

// Luminance below which a pixel of the stencil render counts as ink (0–255)
const CUT_INK_LUM = 200;

// ── CUT-OUTLINE TRACER (for Cricut) ────────────────────────────────────────
// Traces the ink of a black-on-white raster into closed polygons along pixel
// edges, smooths the staircase by taking edge midpoints, then simplifies.
// Outer contours run clockwise and holes counter-clockwise (screen coords),
// so the result fills correctly with both nonzero and evenodd rules.
// Weeding cleanup on the ink raster. Paper islands (enclosed gaps you'd weed
// out) smaller than gapPx are filled solid. Ink specks smaller than speckPx
// (too small to cut at all) are dropped; that threshold is kept separate and
// tiny so intended dots (dew, stars) survive. Ink is 4-connected and paper 8-connected, matching traceInk, which
// keeps diagonally touching ink pixels apart. Paper touching the image edge
// is never filled. Returns counts so the export can report them.
// These functions are copied into the cut worker as source text
// (CUT_WORKER.src): keep them self-contained, no top-level names but each other.
// Used by: the cut worker, cutTraceSync (fallback); dp also by Constellation.
function cleanPieces(ink, W, H, gapPx, speckPx, diff = null) {
  const N = W * H;
  const lab = new Int32Array(N).fill(-1);
  const stack = new Int32Array(N);
  const comp = [];
  let filled = 0, removed = 0, filledPx = 0;
  const holeSizes = [];
  for (let p0 = 0; p0 < N; p0++) {
    if (lab[p0] >= 0) continue;
    const v = ink[p0], id = comp.length;
    let sp = 0, size = 0, edge = false;
    stack[sp++] = p0; lab[p0] = id;
    const start = p0;
    while (sp) {
      const p = stack[--sp];
      size++;
      const x = p % W, y = (p - x) / W;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (v && dx && dy) continue;              // ink: 4-connected only
          const nx = x + dx;
          if (nx < 0 || nx >= W) continue;
          const q = ny * W + nx;
          if (lab[q] < 0 && ink[q] === v) { lab[q] = id; stack[sp++] = q; }
        }
      }
    }
    comp.push({ v, size, edge, start });
    comp[id].kill = v ? size < speckPx : (!edge && size < gapPx);
    if (!v && !edge) holeSizes.push(size);
    if (comp[id].kill) { if (v) removed++; else { filled++; filledPx += size; } }
  }
  if (!filled && !removed) return { filled, removed, filledPx, holeSizes };
  for (let p = 0; p < N; p++) {
    const c = comp[lab[p]];
    if (c.kill) { ink[p] = c.v ? 0 : 1; if (diff) diff[p] = c.v ? 2 : 1; }
  }
  return { filled, removed, filledPx, holeSizes };
}

// Pure: RGBA pixels in, outline loops out. No DOM, no globals except the
// helpers below, so the same code runs in the cut worker.
function traceCore(d, W, H, threshold, growPx = 0, clean = null, stats = null) {
  const MIN_GROW_PX = 0.25;      // less growth than this is not worth a dilate pass
  const MIN_CLOSE_PX = 0.5;      // gap closing narrower than this does nothing
  const MIN_PIECE_PX = 1;        // px²: piece cleaning below this does nothing
  const MAX_STEPS = 50000000;    // safety stop for one outline walk
  const MIN_LOOP_PTS = 8;        // 4 corners (x, y each): the smallest loop
  const MIN_LOOP_AREA = 3;       // px²: smaller loops are dropped
  const SIMPLIFY_PX = 0.6;       // Douglas–Peucker tolerance on the pixel staircase
  let ink = new Uint8Array(W * H);
  for (let i = 0, p = 0; p < W * H; i += 4, p++) {
    const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    ink[p] = lum < threshold ? 1 : 0;
  }
  if (growPx > MIN_GROW_PX) ink = dilate(ink, W, H, growPx);
  if (stats) { let n = 0; for (let i = 0; i < ink.length; i++) n += ink[i]; stats.inkPx = n; }
  if (clean && clean.gapClosePx > MIN_CLOSE_PX) {
    // Morphological closing: grow, then shrink back. Gaps narrower than the
    // minimum fill in; everything else keeps its shape.
    const r = clean.gapClosePx / 2;
    const grown = dilate(ink, W, H, r);
    for (let i = 0; i < grown.length; i++) grown[i] = grown[i] ? 0 : 1;
    const back = dilate(grown, W, H, r);
    let closed = 0;
    for (let i = 0; i < back.length; i++) {
      const v = back[i] ? 0 : 1;
      if (v && !ink[i]) { closed++; if (stats && stats.diff) stats.diff[i] = 1; }
      back[i] = v | ink[i];
    }
    ink = back;
    if (stats) stats.closedPx = closed;
  }
  if (clean && clean.gapPx > MIN_PIECE_PX) {
    const r = cleanPieces(ink, W, H, clean.gapPx, clean.speckPx, stats && stats.diff);
    if (stats) Object.assign(stats, r);
  }
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H) ? ink[y * W + x] : 0;

  // Directed boundary edges, stored as outgoing-direction bits per vertex.
  // dir 0 = +x, 1 = +y, 2 = -x, 3 = -y. Clockwise around each ink pixel.
  const VW = W + 1;
  const out = new Uint8Array(VW * (H + 1));
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!ink[y * W + x]) continue;
      if (!at(x, y - 1)) out[y * VW + x] |= 1;               // top: (x,y) → +x
      if (!at(x + 1, y)) out[y * VW + x + 1] |= 2;           // right: (x+1,y) → +y
      if (!at(x, y + 1)) out[(y + 1) * VW + x + 1] |= 4;     // bottom: (x+1,y+1) → -x
      if (!at(x - 1, y)) out[(y + 1) * VW + x] |= 8;         // left: (x,y+1) → -y
    }
  }

  const loops = [];
  for (let v0 = 0; v0 < out.length; v0++) {
    while (out[v0]) {
      let startDir = 0;
      while (!(out[v0] & (1 << startDir))) startDir++;
      let v = v0, dir = startDir;
      const pts = [];
      let guard = 0;
      while (guard++ < MAX_STEPS) {
        out[v] &= ~(1 << dir);
        const x = v % VW, y = (v - x) / VW;
        pts.push(x, y);
        const nv = (y + DY[dir]) * VW + (x + DX[dir]);
        // Prefer right turn (keeps diagonal-touching pixels separate), then straight, then left
        const avail = out[nv] | (nv === v0 ? (1 << startDir) : 0);
        let nd = -1;
        for (const cand of [(dir + 1) % 4, dir, (dir + 3) % 4]) {
          if (avail & (1 << cand)) { nd = cand; break; }
        }
        if (nd < 0) break;
        v = nv;
        if (v === v0 && nd === startDir) break;
        dir = nd;
      }
      if (pts.length >= MIN_LOOP_PTS) loops.push(pts);
    }
  }

  // Midpoint smoothing + simplification; drop specks
  const result = [];
  for (const pts of loops) {
    const n = pts.length / 2;
    const mid = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      mid.push({ x: (pts[i * 2] + pts[j * 2]) / 2, y: (pts[i * 2 + 1] + pts[j * 2 + 1]) / 2 });
    }
    let area = 0;
    for (let i = 0; i < mid.length; i++) {
      const a = mid[i], b = mid[(i + 1) % mid.length];
      area += a.x * b.y - b.x * a.y;
    }
    if (Math.abs(area / 2) < MIN_LOOP_AREA) continue;
    const simp = simplifyClosed(mid, SIMPLIFY_PX);
    if (simp.length >= 3) result.push(simp);
  }
  return result;
}

// Grows ink by r pixels (near-circular, via a 3-4 chamfer distance transform).
// Used to give lines a cuttable minimum width.
function dilate(ink, W, H, r) {
  // Chamfer 3-4 distance: STEP per straight pixel step, DIAG per diagonal one
  // (≈ 3 × the true distance, within 8%); grown out to r pixels
  const STEP = 3, DIAG = 4;
  const INF = 65000;
  const dist = new Uint16Array(W * H);
  for (let i = 0; i < W * H; i++) dist[i] = ink[i] ? 0 : INF;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let v = dist[i];
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, dist[i - 1] + STEP);
      if (y > 0) {
        v = Math.min(v, dist[i - W] + STEP);
        if (x > 0) v = Math.min(v, dist[i - W - 1] + DIAG);
        if (x < W - 1) v = Math.min(v, dist[i - W + 1] + DIAG);
      }
      dist[i] = v;
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      let v = dist[i];
      if (v === 0) continue;
      if (x < W - 1) v = Math.min(v, dist[i + 1] + STEP);
      if (y < H - 1) {
        v = Math.min(v, dist[i + W] + STEP);
        if (x < W - 1) v = Math.min(v, dist[i + W + 1] + DIAG);
        if (x > 0) v = Math.min(v, dist[i + W - 1] + DIAG);
      }
      dist[i] = v;
    }
  }
  const lim = r * STEP;
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = dist[i] <= lim ? 1 : 0;
  return out;
}

function simplifyClosed(pts, tol) {
  if (pts.length < 4) return pts;
  // Split at the point farthest from pts[0] so the open-polyline DP works on a loop
  let far = 0, fd = -1;
  for (let i = 1; i < pts.length; i++) {
    const dd = (pts[i].x - pts[0].x) ** 2 + (pts[i].y - pts[0].y) ** 2;
    if (dd > fd) { fd = dd; far = i; }
  }
  const a = dp(pts.slice(0, far + 1), tol);
  const b = dp(pts.slice(far).concat([pts[0]]), tol);
  return a.slice(0, -1).concat(b.slice(0, -1));
}

function dp(pts, tol) {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [s, e] = stack.pop();
    const ax = pts[s].x, ay = pts[s].y, bx = pts[e].x, by = pts[e].y;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-9;
    let idx = -1, md = t2;
    for (let i = s + 1; i < e; i++) {
      const cr = (pts[i].x - ax) * dy - (pts[i].y - ay) * dx;
      const dd = cr * cr / len2;
      if (dd > md) { md = dd; idx = i; }
    }
    if (idx >= 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// ── EXPORTS ────────────────────────────────────────────────────────────────
// PNG, strokes SVG and the cut: export buttons (SHELL) and the cut preview.
function fileBase() {
  return `nodelink-${S.mode}-${S.seed}`;
}
// Name for Save .json: the File name field (Library), cleaned for every OS
// (no / \\ : * ? " < > | or control characters, no leading dots, .json
// dropped), or fileBase() when it is empty
function jsonName() {
  const el = document.getElementById('json-name');
  const v = (el ? el.value : '').replace(/[\/\\:*?"<>|\u0000-\u001f]+/g, '-').trim().replace(/\.json$/i, '').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 80);
  return (v || fileBase()) + '.json';
}

// In a claude.ai artifact, files go through the platform's downloads capability
// (the frame blocks normal downloads). Opened as a local file, a plain link works.
let downloadsNs = null;
try {
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('downloads').then(ns => { downloadsNs = ns; }).catch(() => {});
  }
} catch (e) { /* not in an artifact */ }

// Returns true when the file was handed over
async function download(blob, name) {
  if (downloadsNs) {
    try {
      await downloadsNs.save({ filename: name, data: blob });
      return true;
    } catch (err) {
      setStatus(err && err.code === 'declined' ? 'Download cancelled' : 'Download failed: ' + ((err && (err.message || err.code)) || err));
      return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = name;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

// Lets the status message paint before a heavy synchronous job
function busy(msg, job) {
  setStatus(msg, 0);
  setTimeout(async () => {
    try {
      await job();
    } catch (err) {
      console.error(err);
      setStatus('Export failed: ' + err.message);
    }
  }, 30);
}

function exportPNG() {
  busy('Rendering PNG…', async () => {
    const L = exportLayout(exportPx());
    const map = makeColorMap(S.palette);
    const ec = renderRaster(L, map);
    if (E.transparent) {
      const bg = S.palette.mode === 'original' ? parseColor(modeBg(S.mode)) : parseColor(S.palette.paper);
      colorToAlpha(ec, bg);
    }
    // Paused with Colour cycle: the hue on screen is a CSS filter; bake it in
    let out = ec;
    if (frozenFrame() && canvas.style.filter) {
      out = document.createElement('canvas'); out.width = ec.width; out.height = ec.height;
      const oc = out.getContext('2d');
      oc.filter = canvas.style.filter;
      oc.drawImage(ec, 0, 0);
    }
    const blob = await pngWithDpi(out, E.dpi);
    if (!(await download(blob, `${fileBase()}.png`))) return;
    setStatus(`PNG saved · ${L.W}×${L.H}px · ${L.cmW.toFixed(1)}×${L.cmH.toFixed(1)} cm`);
  });
}

function exportStrokeSVG() {
  busy('Building SVG…', async () => {
    const L = exportLayout(exportPx());
    const svg = new C2S(L.W, L.H, L.cmW * 10, L.cmH * 10);
    // Paused with Colour cycle: the hue on screen, applied to each colour
    let map = makeColorMap(S.palette);
    if (frozenFrame() && canvas.style.filter) map = cssFilterMap(map, canvas.style.filter);
    FX_PLAIN = true;
    try { renderTo(svg, L.W, L.H, L.view, { map, noBackground: E.transparent }); } finally { FX_PLAIN = false; }
    if (!(await download(new Blob([svg.getSvg()], { type: 'image/svg+xml;charset=utf-8' }), `${fileBase()}-strokes.svg`))) return;
    setStatus('Editable SVG saved');
  });
}

// Builds the traced cut at a given trace resolution. Used by the export and
// (at a lower resolution) by the live cut preview, so both follow one recipe.
function cutPrep(tracePx, wantDiff = false) {
  const L = exportLayout(tracePx);
  FX_PLAIN = true;
  let ec;
  try { ec = renderRaster(L, STENCIL_MAP); } finally { FX_PLAIN = false; }
  // Thinnest line at this size (Stroke Weight ≈ thinnest line in world units)
  const pxPerMm = L.W / (L.cmW * 10);
  // Cathedral Glass is solid pieces with lead gaps between them, not lines:
  // growing it to the minimum line width would close the lead
  const solid = S.mode === 'glass' && (S.layer.mode === 'none' || S.layer.mode === 'glass');
  const baseMm = solid ? Infinity : S.weight * L.view.scale / pxPerMm;
  const growPx = E.minMm > baseMm ? (E.minMm - baseMm) / 2 * pxPerMm : 0;
  const lineMm = solid ? E.minMm : Math.max(baseMm, E.minMm);
  // Crumbs: anything smaller than CRUMB_K of a dot of the minimum cut width
  // (≥ CRUMB_MIN_MM)
  const CRUMB_MIN_MM = 0.5, CRUMB_K = 0.8;
  const dotMm = Math.max(CRUMB_MIN_MM, E.minMm) / 2;
  const clean = { gapPx: E.minPiece * pxPerMm * pxPerMm, speckPx: Math.PI * dotMm * dotMm * CRUMB_K * pxPerMm * pxPerMm,
    gapClosePx: E.minGapMm * pxPerMm };
  const rgba = ec.getContext('2d').getImageData(0, 0, L.W, L.H).data;
  return { L, pxPerMm, lineMm, growPx, clean, wantDiff, rgba };
}

// Runs the trace for a prep: { loops, stats }
function cutTraceSync(P) {
  const stats = { filled: 0, removed: 0, closedPx: 0, diff: P.wantDiff ? new Uint8Array(P.L.W * P.L.H) : null };
  const loops = traceCore(P.rgba, P.L.W, P.L.H, CUT_INK_LUM, P.growPx, P.clean, stats);
  return { loops, stats };
}

function cutFinish(P, T) {
  const { loops, stats } = T;
  // traceCore walks clockwise around ink (y down): outlines have positive
  // area, holes (the gaps you weed out) negative
  let pieces = 0, holes = 0, points = 0;
  loops.forEach(lp => {
    let a = 0;
    for (let i = 0; i < lp.length; i++) { const p = lp[i], q = lp[(i + 1) % lp.length]; a += p.x * q.y - q.x * p.y; }
    if (a > 0) pieces++; else holes++;
    points += lp.length;
  });
  // Blob check: how much ink the cleanup added, relative to the drawn ink
  const added = (stats.closedPx || 0) + (stats.filledPx || 0);
  const addedFrac = stats.inkPx ? added / stats.inkPx : 0;
  return { L: P.L, loops, stats, lineMm: P.lineMm, pxPerMm: P.pxPerMm, pieces, holes, points, addedFrac,
    safeMinPiece: safeMinPiece(stats, P.pxPerMm) };
}

// Cleanup is "blobbing" when it adds more than this share of the drawn ink
const BLOB_FRAC = 0.35, BLOB_TARGET = 0.15;

// Largest Fill holes (mm², on a 0.5 step) that keeps the added ink under
// BLOB_TARGET, from the sizes of the enclosed holes (no re-trace needed).
function safeMinPiece(stats, pxPerMm) {
  if (!stats.holeSizes || !stats.inkPx) return null;
  const budget = BLOB_TARGET * stats.inkPx - (stats.closedPx || 0);
  if (budget <= 0) return 0;
  const sizes = stats.holeSizes.slice().sort((a, b) => a - b);
  let sum = 0;
  for (const sz of sizes) {
    if (sum + sz > budget) return Math.floor(sz / (pxPerMm * pxPerMm) * 2) / 2;
    sum += sz;
  }
  return null;                               // filling every hole stays under budget
}

// ── Cut worker: the trace runs off the main thread so the UI stays live.
// Built from the same function sources; falls back to the main thread if the
// page may not start workers.
const CUT_WORKER = {
  w: null, url: null, failed: false, seq: 0, pending: null,
  src() {
    return [traceCore, dilate, cleanPieces, simplifyClosed, dp].map(f => f.toString()).join('\n') + `
onmessage = e => {
  const { id, rgba, W, H, growPx, clean, wantDiff } = e.data;
  const stats = { filled: 0, removed: 0, closedPx: 0, diff: wantDiff ? new Uint8Array(W * H) : null };
  const loops = traceCore(rgba, W, H, ${CUT_INK_LUM}, growPx, clean, stats);
  postMessage({ id, loops, stats }, stats.diff ? [stats.diff.buffer] : []);
};`;
  },
  ensure() {
    if (this.w || this.failed) return !!this.w;
    try {
      this.url = this.url || URL.createObjectURL(new Blob([this.src()], { type: 'text/javascript' }));
      this.w = new Worker(this.url);
      this.w.onmessage = e => {
        const p = this.pending;
        if (p && p.id === e.data.id) { this.pending = null; p.resolve(e.data); }
      };
      this.w.onerror = err => {
        console.warn('Cut worker failed, tracing on the main thread instead', err.message);
        this.failed = true;
        const p = this.pending;
        this.pending = null;
        if (this.w) { this.w.terminate(); this.w = null; }
        if (p) { try { p.resolve(cutTraceSync(p.P)); } catch (e2) { p.reject(e2); } }
      };
    } catch (err) {
      this.failed = true;
    }
    return !!this.w;
  },
  // Abandons a running trace (a newer one is wanted)
  kill() {
    if (this.w) { this.w.terminate(); this.w = null; }
    if (this.pending) { const p = this.pending; this.pending = null; p.reject(new Error('cancelled')); }
  },
  trace(P) {
    if (!this.ensure()) return Promise.resolve(cutTraceSync(P));
    if (this.pending) { this.kill(); this.ensure(); }
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending = { id, resolve, reject, P };
      // copied, not transferred, so the main-thread fallback still has the pixels
      this.w.postMessage({ id, rgba: P.rgba, W: P.L.W, H: P.L.H, growPx: P.growPx, clean: P.clean, wantDiff: P.wantDiff });
    });
  }
};

async function buildCutAsync(tracePx, wantDiff = false) {
  const P = cutPrep(tracePx, wantDiff);
  return cutFinish(P, await CUT_WORKER.trace(P));
}

// k: scale (px → mm for the cut file)
function cutPathD(loops, k = 1) {
  const f = v => (Math.round(v * k * 1000) / 1000).toString();
  let d = '';
  loops.forEach(lp => {
    d += 'M' + f(lp[0].x) + ' ' + f(lp[0].y);
    for (let i = 1; i < lp.length; i++) d += 'L' + f(lp[i].x) + ' ' + f(lp[i].y);
    d += 'Z';
  });
  return d;
}

function cutSummary(r, legend = false) {
  const kind = cutKind();
  const parts = [`${r.pieces} piece${r.pieces === 1 ? '' : 's'}`,
    kind === 'laser' ? `${r.holes} cut-out${r.holes === 1 ? '' : 's'}` : `${r.holes} hole${r.holes === 1 ? '' : 's'}${kind === 'vinyl' ? ' to weed' : ''}`,
    `lines ≈ ${r.lineMm.toFixed(2)} mm`];
  const key = c => legend ? `<span class="key" style="background:${c}"></span>` : '';
  const clean = [];
  if (r.stats.closedPx) clean.push(`${key('#d6a848')}narrow gaps closed`);
  if (r.stats.filled) clean.push(`${r.stats.closedPx ? '' : key('#d6a848')}${r.stats.filled} holes filled`);
  if (r.stats.removed) clean.push(`${key('#e14848')}${r.stats.removed} crumbs dropped`);
  if (clean.length) parts.push(clean.join(', '));
  return parts.join(' · ');
}

// What will fall apart, by material
function cutWarnings(r) {
  const kind = cutKind(), w = [];
  if (r.lineMm < 0.5) w.push('lines too thin to cut (aim for 0.5 mm+)');
  if (kind === 'laser' && r.pieces > 1) w.push(`${r.pieces - 1} loose piece${r.pieces > 2 ? 's' : ''} will fall out (only connected lines hold together)`);
  if (kind === 'stencil' && r.holes > 0) w.push(`${r.holes} island${r.holes > 1 ? 's' : ''} will fall out of the stencil`);
  if (r.addedFrac > BLOB_FRAC) w.push(`cleanup adds ${Math.round(r.addedFrac * 100)}% extra ink: detail is merging into solid blobs (gold areas)`);
  return w;
}

function exportCutSVG() {
  busy('Tracing cut outlines…', async () => {
    // Trace resolution: at least ~2000px for clean curves, capped for speed
    const r = await buildCutAsync(Math.min(4000, Math.max(2000, exportPx())));
    const L = r.L;
    const ink = S.palette.mode !== 'original' ? S.palette.ink : '#000000';
    const laser = E.cutStyle === 'hairline';
    // Laser software reads a thin red stroke as "cut"; vinyl software wants a filled shape
    // In mm at scale 1 (width="100mm", viewBox 0 0 100 …): the size cutter
    // software reads most reliably
    const k = 1 / r.pxPerMm, mmW = +(L.cmW * 10).toFixed(3), mmH = +(L.cmH * 10).toFixed(3);
    const shape = laser
      ? `<path fill="none" stroke="#ff0000" stroke-width="0.02" d="${cutPathD(r.loops, k)}"/>`
      : `<path fill="${ink}" fill-rule="nonzero" d="${cutPathD(r.loops, k)}"/>`;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="${mmW}mm" height="${mmH}mm" viewBox="0 0 ${mmW} ${mmH}">\n` +
      shape + `\n</svg>`;
    if (!(await download(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${fileBase()}-${laser ? 'laser' : 'cut'}.svg`))) return;
    const sum = `${L.cmW.toFixed(1)}×${L.cmH.toFixed(1)} cm · ${cutSummary(r)}`;
    const warn = cutWarnings(r);
    if (warn.length) setStatus(`Cut SVG saved · ${sum}. Note: ${warn.join('; ')}.`, 14000);
    else if (r.points > 60000) setStatus(`Cut SVG saved, very detailed (${sum}). Raise Fill holes or lower Density for less weeding.`, 12000);
    else setStatus(`Cut SVG saved · ${sum}`, 10000);
  });
}

// ── CUT PREVIEW ────────────────────────────────────────────────────────────
// Shows the traced cut on the canvas: the paper at its export frame with a
// 1 cm grid, the cut pieces in ink with the blade path, and what the weed
// cleanup changed (gold = gaps filled, red = crumbs dropped). Recomputed a
// moment after edits stop; pan and zoom only redraw.
// The live cut overlay on the canvas (Export drawer). Used by: draw(), EVENTS.
const CUT = { on: false, key: null, res: null, path: null, diffImg: null, stale: false, timer: null, busy: false };
const CUT_PREVIEW_PX = 2400;   // default exports trace at 2000, so the preview matches them exactly

function cutKey() {
  return JSON.stringify([getDesign(), E.minMm, E.minGapMm, E.minPiece, E.cutStyle, E.cm, E.dpi, E.frame,
    E.frame === 'view' && !pageActive() ? [S.zoom, S.pan] : 0, frozenFrame() ? ANIM.time : 0]);
}

function setCutPreview(on) {
  CUT.on = on;
  document.getElementById('tb-cut').setAttribute('aria-pressed', on);
  if (!on) {
    clearTimeout(CUT.timer);
    CUT.res = CUT.path = CUT.diffImg = null;
    CUT.key = null;
  }
  scheduleCut();
  syncCutChip();
  update();
}

function scheduleCut() {
  if (!CUT.on) return;
  const key = cutKey();
  if (key === CUT.key) return;
  CUT.stale = true;
  syncCutChip();
  clearTimeout(CUT.timer);
  CUT.timer = setTimeout(runCut, 350);
}

async function runCut() {
  if (!CUT.on) return;
  const key = cutKey();
  CUT.busy = true;
  let r;
  try {
    const px = Math.min(CUT_PREVIEW_PX, Math.min(4000, Math.max(2000, exportPx())));
    r = await buildCutAsync(px, true);
  } catch (err) {
    if (err.message === 'cancelled') return;      // a newer trace took over
    console.error(err);
    setStatus('Cut preview failed: ' + err.message);
    CUT.busy = false;
    return;
  }
  CUT.busy = false;
  if (!CUT.on) return;
  const path = new Path2D(cutPathD(r.loops));
  // What the cleanup changed, as a transparent overlay at trace resolution
  let diffImg = null;
  if (r.stats.filled || r.stats.removed || r.stats.closedPx) {
    diffImg = document.createElement('canvas');
    diffImg.width = r.L.W; diffImg.height = r.L.H;
    const dc = diffImg.getContext('2d');
    const img = dc.createImageData(r.L.W, r.L.H);
    const d = r.stats.diff;
    for (let p = 0, i = 0; p < d.length; p++, i += 4) {
      if (d[p] === 1) { img.data[i] = 214; img.data[i + 1] = 168; img.data[i + 2] = 72; img.data[i + 3] = 235; }
      else if (d[p] === 2) { img.data[i] = 225; img.data[i + 1] = 72; img.data[i + 2] = 72; img.data[i + 3] = 235; }
    }
    dc.putImageData(img, 0, 0);
  }
  r.stats.diff = r.stats.holeSizes = null;
  Object.assign(CUT, { key, res: r, path, diffImg, stale: cutKey() !== key });
  if (CUT.stale) scheduleCut();
  syncCutChip();
  update();
}

function syncCutChip() {
  document.getElementById('cut-panel').classList.toggle('hidden', !CUT.on);
  const el = document.getElementById('cut-chip');
  if (!CUT.on) return;
  if (!CUT.res) { el.textContent = 'Tracing cut…'; return; }
  const r = CUT.res;
  let warn = cutWarnings(r).map(w => `<div class="warn">⚠ ${w}</div>`).join('');
  if (r.addedFrac > BLOB_FRAC) {
    const fix = blobFix(r);
    if (fix) warn += `<button class="blob-fix" id="btn-blob-fix" title="${fix.title}">${fix.label}</button>`;
  }
  el.innerHTML = (CUT.stale ? 'Updating… · ' : '') +
    `<b>${r.L.cmW.toFixed(1)} × ${r.L.cmH.toFixed(1)} cm</b> · ${cutSummary(r, true)}${warn}`;
}

// One-click way out of a blob: lower Fill holes to the largest safe value;
// if closing gaps alone is over budget, halve Min gap too.
function blobFix(r) {
  const st = r.stats;
  const closeFrac = st.inkPx ? (st.closedPx || 0) / st.inkPx : 0;
  const patch = {};
  if (closeFrac > BLOB_TARGET && E.minGapMm > 0) patch.minGapMm = Math.floor(E.minGapMm / 2 * 10) / 10;
  if (r.safeMinPiece !== null && r.safeMinPiece < E.minPiece) patch.minPiece = r.safeMinPiece;
  else if (patch.minGapMm !== undefined) patch.minPiece = Math.floor(E.minPiece / 2 * 2) / 2;
  if (!Object.keys(patch).length) return null;
  const desc = [];
  if (patch.minPiece !== undefined) desc.push(`Fill holes ${E.minPiece} → ${patch.minPiece} mm²`);
  if (patch.minGapMm !== undefined) desc.push(`Min gap ${E.minGapMm} → ${patch.minGapMm} mm`);
  return { patch, label: 'Ease cleanup: ' + desc.join(', '), title: 'Keeps the added ink near ' + Math.round(BLOB_TARGET * 100) + '% of the drawn lines' };
}

// Draws the preview over the live canvas, in world coordinates
function drawCutPreview(raw, view) {
  const r = CUT.res;
  if (!r) return;
  const L = r.L, f = L.frame, z = view.scale;
  raw.save();
  raw.setTransform(1, 0, 0, 1, 0, 0);
  raw.globalAlpha = 1;
  raw.fillStyle = '#1b1d1c';                                      // cutting mat
  raw.fillRect(0, 0, raw.canvas.width, raw.canvas.height);
  raw.translate(view.tx, view.ty);
  raw.scale(z, z);
  if (CUT.stale) raw.globalAlpha = 0.5;
  const paper = S.palette.mode === 'stencil' ? S.palette.paper : '#f4f1ea';
  const ink = S.palette.mode === 'stencil' ? S.palette.ink : '#151515';
  raw.fillStyle = paper;
  raw.fillRect(f.x, f.y, f.w, f.h);
  // 1 cm grid on the paper, for a sense of real size
  const cmWorld = f.w / L.cmW;
  if (cmWorld * z > 6) {
    raw.beginPath();
    for (let x = f.x + cmWorld; x < f.x + f.w - 1e-6; x += cmWorld) { raw.moveTo(x, f.y); raw.lineTo(x, f.y + f.h); }
    for (let y = f.y + cmWorld; y < f.y + f.h - 1e-6; y += cmWorld) { raw.moveTo(f.x, y); raw.lineTo(f.x + f.w, y); }
    raw.strokeStyle = 'rgba(70, 130, 160, 0.22)';
    raw.lineWidth = 1 / z;
    raw.stroke();
  }
  // Pieces in trace-pixel space → world
  raw.save();
  raw.translate(f.x, f.y);
  raw.scale(1 / L.view.scale, 1 / L.view.scale);
  raw.fillStyle = ink;
  raw.fill(CUT.path);
  if (CUT.diffImg) {
    raw.imageSmoothingEnabled = false;
    raw.drawImage(CUT.diffImg, 0, 0);
  }
  raw.strokeStyle = '#e5484d';                                    // blade path
  raw.lineWidth = 1 / (z / L.view.scale);
  raw.stroke(CUT.path);
  raw.restore();
  raw.strokeStyle = 'rgba(90, 169, 255, 0.8)';
  raw.lineWidth = 1 / z;
  raw.strokeRect(f.x, f.y, f.w, f.h);
  raw.restore();
}
