/* ═══════════════════════════════════════════════════════════════════════════
   NodeLink — developer overview
   ═══════════════════════════════════════════════════════════════════════════
   No build step, no libraries. index.html holds the markup only; the styles
   are in css/nodelink.css and the code in the js/ files, loaded as plain
   <script> tags in the order listed in index.html. All files share one
   global scope, like one big script, with one difference: a function
   declared in a later file does not exist yet while an earlier file runs
   its top-level code. Top-level code may only call what is above it; the
   app starts from window.onload (js/ui.js, INIT), when everything is
   loaded. tests/loadcheck.js checks this.

   FILES, in load order
   core.js            State · Layers · Seeded RNG · Point in polygon ·
                      Geometric clipping
   svg-builder.js     SVG EXPORT BUILDER (C2S)
   modes/*.js         one renderer per mode: pcb, foam, web (+ manifold
                      boundary), constellation, glyphs (shared helpers),
                      arcane, chaosgate (+ pillar symbols), stained, glass,
                      lightning, nebula, microscope, spiderweb, vine
   display-list.js    DISPLAY LIST, RENDERERS, MODES, Draw-on timing
   compose.js         PAGE FORMAT · COMPOSITION · DRAW (Drift warp, Item
                      cache, Symmetric replay, The whole design)
   anim-effects.js    Falling petals · Current · Twinkle · Sunlight · Life ·
                      Strikes · Blink lids
   palette.js         PALETTE
   render-export.js   RENDERING · FRAMING · COLOUR TO ALPHA · PNG DPI ·
                      CUT-OUTLINE TRACER · EXPORTS (+ Cut worker) · CUT PREVIEW
   animation.js       ANIMATION · Ambient (+ scenes)
   loop-video.js      LOOP VIDEO (Export → Video: fixed-clock render, seam
                      crossfade, WebCodecs encoder, MP4 file)
   design-io.js       STATUS · DESIGN SNAPSHOTS, HISTORY, AUTOSAVE · FAVOURITES
   ui.js              NODE DOM · UPDATE · UI SYNC (+ Colour scheme UI) ·
                      SHELL · EVENTS · INIT
   help.js            FIRST VISIT AND HELP (empty start, ? help mode)

   The user places nodes; a generator "mode" draws a pattern around them;
   the result is shown on a canvas and exported as PNG, strokes SVG (for
   editing) or cut SVG (a traced outline for Cricut / laser). Sections are
   marked "// ── NAME ──"; search for those names (line numbers drift).

   SECTIONS, in file order (CAPS = section, lower case = part of the one above)
   Base:        State · Layers · Seeded RNG · Point in polygon ·
                Geometric clipping + SVG EXPORT BUILDER (C2S)
   Renderers:   PCB · FOAM · SYNAPTIC WEB + MANIFOLD BOUNDARY · CONSTELLATION ·
                GLYPH HELPERS · ARCANE · Pillar symbols + GEOMETRICAL
                SCHEMATICS · STAINED GLASS · LIGHTNING · NEBULA · MICROSCOPE ·
                SPIDERWEB · VINES · CATHEDRAL GLASS (after STAINED GLASS)
   Pipeline:    DISPLAY LIST (+ RENDERERS, MODES) · Draw-on timing · PAGE FORMAT ·
                COMPOSITION · DRAW (Drift warp, Item cache, Symmetric replay,
                Blink lids, The whole design) · PALETTE · RENDERING · FRAMING
   Export:      COLOUR TO ALPHA · PNG DPI · CUT-OUTLINE TRACER · EXPORTS
                (+ Cut worker) · CUT PREVIEW
   Live:        ANIMATION · Ambient (+ scenes) · LOOP VIDEO
   App:         STATUS · DESIGN SNAPSHOTS · FAVOURITES · NODE DOM · UPDATE ·
                UI SYNC (+ Colour scheme UI) · SHELL · EVENTS · INIT

   HOW A PICTURE IS MADE
   1. State: everything about the design lives in S (section "State").
      Layer 2 settings are in S.layer; the controls edit whichever layer is
      selected through lget()/lset() (section "Layers").
   2. Recording: a renderer (renderPCB, renderFoam, … listed in RENDERERS)
      draws onto a Rec, a fake 2D context that only records calls into a
      flat op list ("DISPLAY LIST"). getDisplayList() records main + layer
      once per dlKey() (a JSON key of everything the drawing depends on) and
      caches the result in DL.
   3. Composition: renderDesign() → drawSymmetric() replays the op lists once
      per symmetry copy (symCopies(): rotations / mirrors, each clipped to a
      wedge), inside the boundary and page clip, with the design transform
      S.xf.
   4. Colour: paletteCtx(ctx, map) wraps the target so every colour set on it
      goes through the colour scheme's map (section "PALETTE").
   5. Target: the same replay draws to the screen canvas (draw()), to an
      offscreen canvas (renderRaster, PNG and the cut tracer) or to C2S, the
      SVG builder (strokes SVG). C2S clips geometrically and only to unions of
      convex polygons, and has no even-odd fill: anything drawn for SVG must
      keep to that (see drawLid for an example).

   ANIMATION (section "ANIMATION", live only)
   animTick() runs per frame while playing: it moves the nodes (drift,
   flow, glitch), re-records the design as needed (animRecord) and builds
   ANIM.frame = { items: [{ dl, alpha, prog, warp }], lw, spin, np }, which
   renderDesign draws instead of DL. Costs are watched all the time: slow
   devices get keyframes instead of live re-recording (ANIM.slow / heavy /
   drawHeavy), the canvas resolution adapts (adaptRes), static items are
   rasterised once and blitted (ITEM_CACHE), and edits while playing are
   throttled (KEY_HOLD_MAX). Pause keeps the frame (ANIM.frozen); exports
   while paused show that frame (frozenFrame()).
   Blink: the Microscope renderer marks its nuclei as eyes (Rec.markEye, a
   side list on the ops); drawLids/drawLid draw the lids and pupils on top of
   each frame.

   CONVENTIONS
   - World units: the editor canvas is CC (1000) units wide; exports scale.
   - Seeds are integers 0–999999 (S.seed); renderers get seedF() = seed/1e6
     and draw their randomness from sr(), a seeded RNG, in a fixed order:
     calling R() one time more or less changes every later choice, so
     existing designs would look different. New options must draw nothing
     extra from R() when they are off, and load as the old look when
     missing from a saved file.
   - Saved designs: getDesign() / applyDesign() (with the san…() checks).
     Presets (Save .json, favourites) are getDesign() + the animation
     settings (getPreset / applyPresetFile). Undo history and autosave use
     getDesign() (section "DESIGN SNAPSHOTS").
   - Colours in renderers are fixed light-on-dark values; the palette maps
     them. Use rgba strings or #hex (parseColor reads those).

   ADDING A DESIGN OPTION (for one mode)
   default in S.<mode>; LAYER_OPT_KEYS if Layer 2 has its own; dlKey();
   getDesign/applyDesign (+ its san… check); randomizeAll; the control in the
   HTML, wired with optCtl(); syncControls.
   ADDING A MODE
   a renderer function(c, nodes, density, sigma, weight, seed) drawing only
   through c; an entry in RENDERERS; modeBg() and ACCENT colours; the mode
   button in the HTML; DRIFT_JUMPY if its layout jumps when nodes move.

   TESTING (no test files in the page)
   Render every mode × [no boundary, hexagon, pentagon] at a fixed seed and
   compare canvas hashes before and after a change: changes that should not
   alter the look must leave all of them identical.
   ═══════════════════════════════════════════════════════════════════════════ */
const canvas = document.getElementById('main-canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const nodeLayer = document.getElementById('node-layer');
const viewport = document.getElementById('viewport');
const CC = 1000;

// ── State ──────────────────────────────────────────────────────────────────
// Owns S (the design: everything saved, undone and recorded) and E (export
// settings, not part of a design). Read everywhere; written by the controls
// (EVENTS), applyDesign and the animation (node positions while playing).
const S = {
  mode: 'pcb',
  density: 6,
  sigma: 80,
  weight: 1.0,
  zoom: 1,
  pan: { x: 0, y: 0 },
  showNodes: true,
  showNumbers: true,                                 // numbers on the node handles (editor only)
  seed: randomSeed(),          // integer 0..999999, shown in the UI
  palette: { mode: 'original', ink: '#000000', paper: '#ffffff', glow: '#ffffff', preset: 'custom', l2: null },
  dew: 60,                                          // spiderweb dewdrop amount 0–100
  pcb: { pour: 40, meander: true, silk: false },     // PCB extras
  nebula: { glow: true },                           // nebula: soft gas clouds (screen/PNG)
  chaos: { style: 'mixed', frames: false, links: false },   // geometrical schematics: glyph style, cartouche frames, connecting lines
  lightning: { glow: true, fill: true },            // lightning: halo round the bolts (screen/PNG); fill: branches fill the boundary
  arcane: { snap: false, wobble: 0, links: true, sats: true },          // arcane: circles snap to touch, hand-drawn wobble 0–100, script bands, satellites
  micro: { veins: true, orgs: 100, cilia: 'auto', detail: true },       // microscope: slime veins, organism amount %, cilia, cell insides
  vine: { leaves: 100, flowers: 60, leaf: 'almond', bloom: 'mixed', tendrils: true, veins: true, season: 'summer' },   // vines: leaf amount %, tip flower chance %, leaf shape, flower style, tendrils, veins
  glass: { style: 'mosaic', set: 'jewel', light: true },   // cathedral glass: style, glass colour set, light & shading
  stained: { ring: true, ragged: true },            // stained glass: outer lead ring; ragged edge (no round window, no ring)
  curved: true,                                     // spiderweb: curved silk on/off
  curve: 60,                                        // spiderweb thread curvature 0–100
  page: { preset: 'none', unit: 'mm', w: 63, h: 88, bleed: 0, clip: true },
  sym: { n: 1, mirror: false },                     // n folds; mirror = kaleidoscope wedges (n=1 + mirror = left/right)
  layer: { mode: 'none', density: 4, weight: 0.6, strength: 60 },
  boundary: { shape: 'none', size: 300, border: 'single', outside: null, lw: null, color: null },   // outside: own colour outside the boundary ('#rrggbb'), null = the background; lw: border thickness (world units), null = follows Stroke weight; color: border colour ('#rrggbb'), null = the colour scheme's
  xf: { scale: 1, rot: 0, x: 0, y: 0 },             // design scale and rotation (degrees) about the design origin, then offset (world units), inside the boundary
  draggingNode: null,
  isPanning: false,
  nodes: initNodes(6, 220)
};

// Export settings (not part of a design / undo history)
const E = { frame: 'bounds', cm: 10, dpi: 300, transparent: true, minMm: 0.8, minGapMm: 0.5, minPiece: 1,
  cutStyle: 'fill', cutPreset: 'vinyl', fmt: 'png' };
// (Loop video adds loopS, loopFps, loopSize and loopBg once changed: loopSettings() gives the defaults)

// Cut presets. kind says what falls apart: for vinyl you weed the holes; for
// a paint stencil the ink is cut away, so islands inside it fall out; for a
// laser filigree the ink is the part you keep, so separate pieces fall out.
const CUT_PRESETS = {
  vinyl:     { label: 'Vinyl (Cricut, Silhouette)', minMm: 0.8, minGapMm: 0.5, minPiece: 1, cutStyle: 'fill', kind: 'vinyl' },
  htv:       { label: 'Iron-on vinyl (HTV)', minMm: 1.0, minGapMm: 0.8, minPiece: 2, cutStyle: 'fill', kind: 'vinyl' },
  stencil:   { label: 'Paint stencil (mylar)', minMm: 1.0, minGapMm: 0.8, minPiece: 2, cutStyle: 'fill', kind: 'stencil' },
  lpaper:    { label: 'Laser: paper / card', minMm: 0.5, minGapMm: 0.3, minPiece: 0.5, cutStyle: 'hairline', kind: 'laser' },
  lply:      { label: 'Laser: 3 mm plywood', minMm: 1.5, minGapMm: 0.5, minPiece: 2, cutStyle: 'hairline', kind: 'laser' },
  lacrylic:  { label: 'Laser: 3 mm acrylic', minMm: 1.2, minGapMm: 0.4, minPiece: 1.5, cutStyle: 'hairline', kind: 'laser' }
};
const CUT_FIELDS = ['minMm', 'minGapMm', 'minPiece', 'cutStyle'];
// The chosen preset while its values are untouched; any edit makes it Custom
function cutPresetId() {
  const p = CUT_PRESETS[E.cutPreset];
  return p && CUT_FIELDS.every(f => p[f] === E[f]) ? E.cutPreset : 'custom';
}
function cutKind() {
  const id = cutPresetId();
  return id === 'custom' ? (E.cutStyle === 'hairline' ? 'laser' : 'vinyl') : CUT_PRESETS[id].kind;
}

function randomSeed() {
  return Math.floor(Math.random() * 1000000);
}

// ── Layers: the Design controls edit Layer 1 (S) or Layer 2 (S.layer).
// Layer 2 keeps its own mode, density, weight and strength; every other
// option it has not been given yet follows Layer 1 (so older designs look
// the same). Its seed follows Layer 1's seed until it gets its own.
let EDIT_L = 1;
const LAYER_OPT_KEYS = ['sigma', 'dew', 'curve', 'curved', 'pcb', 'nebula', 'lightning', 'chaos', 'stained', 'arcane', 'micro', 'vine', 'glass'];
function layerSeed() {
  return S.layer.seed !== undefined ? S.layer.seed : (S.seed * 7919 + 13) % 1000000;
}
function lget(k) {
  if (EDIT_L === 1) return S[k];
  if (k === 'seed') return layerSeed();
  return S.layer[k] !== undefined ? S.layer[k] : S[k];
}
function lset(k, v) { if (EDIT_L === 1) S[k] = v; else S.layer[k] = v; }
function editMode() { return EDIT_L === 1 ? S.mode : S.layer.mode; }
// Swap layers: Layer 1's design becomes Layer 2 and the other way round, so
// the front design goes to the back. Mode, density, weight, seed and every
// layer option move (a Layer 2 option that followed Layer 1 is resolved
// first, so both designs keep their look); Strength stays with Layer 2, the
// back layer. A Layer 2 colour scheme of its own swaps ink, glow and preset
// with Layer 1's. Nothing to swap while Layer 2 is off.
function swapLayers() {
  const L = S.layer;
  if (L.mode === 'none') return false;
  const cp = v => v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
  const front = { mode: S.mode, density: S.density, weight: S.weight, seed: S.seed };
  const back = { mode: L.mode, density: L.density, weight: L.weight, seed: layerSeed() };
  LAYER_OPT_KEYS.forEach(k => { front[k] = cp(S[k]); back[k] = cp(L[k] !== undefined ? L[k] : S[k]); });
  Object.assign(S, back);
  S.layer = { ...front, strength: L.strength };
  const P = S.palette;
  if (P.l2) {
    const l2 = { ink: P.ink, glow: P.glow, preset: P.preset };
    P.ink = P.l2.ink; P.glow = P.l2.glow; P.preset = P.l2.preset;
    P.l2 = l2;
  }
  return true;
}
// Runs fn with Layer 2's own options swapped into S
function withLayerOpts(fn) {
  const keep = LAYER_OPT_KEYS.map(k => S[k]);
  LAYER_OPT_KEYS.forEach(k => { if (S.layer[k] !== undefined) S[k] = S.layer[k]; });
  try { return fn(); } finally { LAYER_OPT_KEYS.forEach((k, i) => { S[k] = keep[i]; }); }
}

// Renderers expect a 0..1 float seed
function seedF() {
  return S.seed / 1000000;
}

// prev: optional existing nodes whose size and weight are kept
function initNodes(count, r, prev) {
  return Array.from({ length: count }).map((_, i) => {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    return {
      id: i + 1,
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      glyph: (i + 1).toString(),
      size: (prev && prev[i]) ? prev[i].size : 1,
      w: (prev && prev[i]) ? prev[i].w : 1
    };
  });
}

function newNode(i, x, y) {
  return { id: i + 1, x, y, glyph: (i + 1).toString(), size: 1, w: 1 };
}

// ── Seeded RNG ─────────────────────────────────────────────────────────────
// sr(s): a stateless hash of s into [0, 1). Renderers build a stream from it
// (let s = …; const R = () => sr(s++)), so the order of R() calls is the design.
function sr(s) {
  const x = Math.sin(s + 1) * 73856;
  return x - Math.floor(x);
}

// ── Point in polygon ───────────────────────────────────────────────────────
// pip(pt, poly): even-odd test. Used by renderers, the boundary and node placement.
function pip(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (((yi > pt.y) !== (yj > pt.y)) && pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ── Geometric clipping for the SVG builder ──
// Helpers for C2S only (SVG has no canvas clip, so paths are cut here).
// m: [a, b, c, d, e, f] canvas transform
const c2sXf = (m, p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
function c2sInv(m) {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}
// clips: regions, all of which must hold; a region holds when any of its polygons does
const c2sInside = (clips, p) => clips.every(rg => rg.some(pg => pip(p, pg)));
// Open polyline → the pieces inside every region. Each segment is cut where it
// crosses a polygon edge; a piece is kept when its midpoint is inside.
function c2sClipLine(pts, clips) {
  let pieces = [pts];
  for (const rg of clips) {
    const out = [];
    pieces.forEach(pl => {
      let cur = null;
      for (let i = 1; i < pl.length; i++) {
        const a = pl[i - 1], b = pl[i], ts = [0, 1];
        rg.forEach(pg => pg.forEach((q, j) => {
          const r = pg[(j + 1) % pg.length];
          const dx = b.x - a.x, dy = b.y - a.y, ex = r.x - q.x, ey = r.y - q.y, den = dx * ey - dy * ex;
          if (Math.abs(den) < 1e-12) return;
          const t = ((q.x - a.x) * ey - (q.y - a.y) * ex) / den, u = ((q.x - a.x) * dy - (q.y - a.y) * dx) / den;
          if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
        }));
        ts.sort((x, y) => x - y);
        const at = t => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        for (let k = 1; k < ts.length; k++) {
          if (ts[k] - ts[k - 1] < 1e-9) continue;
          const mid = at((ts[k - 1] + ts[k]) / 2);
          if (rg.some(pg => pip(mid, pg))) {
            if (!cur) cur = [at(ts[k - 1])];
            cur.push(at(ts[k]));
          } else if (cur) { out.push(cur); cur = null; }
        }
      }
      if (cur) out.push(cur);
    });
    pieces = out.filter(pl => pl.length > 1);
  }
  return pieces;
}
// Closed polygon → its parts inside every region (Sutherland–Hodgman per
// clip polygon; the clip regions used here are convex: page, boundary,
// symmetry wedges). A region of several polygons yields a part per polygon.
function c2sClipPoly(pts, clips) {
  let polys = [pts];
  for (const rg of clips) {
    const out = [];
    polys.forEach(P => rg.forEach(C => {
      // Quick cases: P wholly inside C, or wholly outside one of its edges
      const E = c2sConv(C).E;
      if (P.every(p => E.every(e => (p.x - e.x) * e.nx + (p.y - e.y) * e.ny >= 0))) { out.push(P); return; }
      if (E.some(e => P.every(p => (p.x - e.x) * e.nx + (p.y - e.y) * e.ny < 0))) return;
      let area = 0;
      C.forEach((q, j) => { const r = C[(j + 1) % C.length]; area += q.x * r.y - r.x * q.y; });
      const sg = area >= 0 ? 1 : -1;
      let poly = P;
      for (let j = 0; j < C.length && poly.length; j++) {
        const q = C[j], r = C[(j + 1) % C.length];
        const side = p => sg * ((r.x - q.x) * (p.y - q.y) - (r.y - q.y) * (p.x - q.x)) >= 0;
        const cut = (a, b) => {
          const da = (r.x - q.x) * (a.y - q.y) - (r.y - q.y) * (a.x - q.x), db = (r.x - q.x) * (b.y - q.y) - (r.y - q.y) * (b.x - q.x);
          const t = da / (da - db);
          return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        };
        const res = [];
        poly.forEach((cP, k) => {
          const pP = poly[(k + poly.length - 1) % poly.length], ci = side(cP), pi = side(pP);
          if (ci) { if (!pi) res.push(cut(pP, cP)); res.push(cP); }
          else if (pi) res.push(cut(pP, cP));
        });
        poly = res;
      }
      if (poly.length > 2) out.push(poly);
    }));
    polys = out;
  }
  return polys;
}

// Thick strokes at clip edges: the centreline alone can't be clipped, the
// stroke would stick out by half its width. A point is "safe" when a disc of
// radius h round it lies inside every region (inside one of its polygons,
// at least h from that polygon's edges; polygons are convex, so a segment
// with two safe ends is safe).
function c2sSafe(clips, p, h) {
  return clips.every(rg => rg.some(pg => c2sConvDist(pg, p) >= h));
}
// Convex clip polygon → cached inward edge normals and an inner disc, for a
// quick signed distance from p to the boundary (negative = outside)
function c2sConv(pg) {
  if (pg._cv) return pg._cv;
  let a2 = 0, cx = 0, cy = 0;
  pg.forEach((q, j) => { const r = pg[(j + 1) % pg.length]; a2 += q.x * r.y - r.x * q.y; cx += q.x; cy += q.y; });
  cx /= pg.length; cy /= pg.length;
  const sg = a2 >= 0 ? 1 : -1, E = [];
  pg.forEach((q, j) => {
    const r = pg[(j + 1) % pg.length], l = Math.hypot(r.x - q.x, r.y - q.y);
    if (l > 1e-12) E.push({ x: q.x, y: q.y, nx: -sg * (r.y - q.y) / l, ny: sg * (r.x - q.x) / l });
  });
  let rin = Infinity;
  E.forEach(e => { rin = Math.min(rin, (cx - e.x) * e.nx + (cy - e.y) * e.ny); });
  return (pg._cv = { cx, cy, rin, E });
}
function c2sConvDist(pg, p) {
  const cv = c2sConv(pg), dc = Math.hypot(p.x - cv.cx, p.y - cv.cy);
  // Well inside the inner disc: rin − dc is a lower bound, enough for the
  // callers (an under-estimate only means a little extra outlining)
  if (dc < cv.rin * 0.5) return cv.rin - dc;
  let d = Infinity;
  for (const e of cv.E) { const v = (p.x - e.x) * e.nx + (p.y - e.y) * e.ny; if (v < d) d = v; }
  return d;
}
// Polygons (counter-clockwise, so nonzero fill unions them) covering the
// stroke of segments [i0, i1) of polyline pts, half width h. Joins at every
// vertex these segments touch, caps only at the polyline's own ends.
function c2sOutline(pts, i0, i1, h, cap, join, closed, miterLimit) {
  const out = [], n = pts.length;
  const ccw = pg => { let a = 0; pg.forEach((q, j) => { const r = pg[(j + 1) % pg.length]; a += q.x * r.y - r.x * q.y; }); return a < 0 ? pg.reverse() : pg; };
  const disc = (c) => {
    const k = Math.max(8, Math.min(48, Math.ceil(h * 1.5)));
    out.push(Array.from({ length: k }, (_, j) => ({ x: c.x + h * Math.cos(j / k * 2 * Math.PI), y: c.y + h * Math.sin(j / k * 2 * Math.PI) })));
  };
  const dir = (a, b) => { const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
  const segs = [];
  for (let i = i0; i < i1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
    const d = dir(a, b), nx = -d.y * h, ny = d.x * h;
    let ea = 0, eb = 0;
    if (cap === 'square' && !closed) { if (i === 0) ea = h; if (i === n - 2) eb = h; }
    const A = { x: a.x - d.x * ea, y: a.y - d.y * ea }, B = { x: b.x + d.x * eb, y: b.y + d.y * eb };
    out.push(ccw([{ x: A.x + nx, y: A.y + ny }, { x: B.x + nx, y: B.y + ny }, { x: B.x - nx, y: B.y - ny }, { x: A.x - nx, y: A.y - ny }]));
    segs.push(i);
  }
  // Joins: at vertex v between segment v-1 and v (index wraps when closed)
  const joinAt = v => {
    const pv = closed ? (v - 1 + n - 1) % (n - 1) : v - 1, nv = closed ? v % (n - 1) : v;
    if (pv < 0 || nv >= n - 1) return;
    const p = pts[nv], d1 = dir(pts[pv], pts[pv + 1]), d2 = dir(pts[nv], pts[nv + 1]);
    if (join === 'round') { disc(p); return; }
    const cr = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(cr) < 1e-9) return;
    const s = cr > 0 ? -1 : 1;                                   // outer side
    const a = { x: p.x - d1.y * h * s, y: p.y + d1.x * h * s }, b = { x: p.x - d2.y * h * s, y: p.y + d2.x * h * s };
    if (join === 'miter') {
      // tip: a + t·d1 = b − u·d2
      const den = d1.x * d2.y - d1.y * d2.x, t = ((b.x - a.x) * d2.y - (b.y - a.y) * d2.x) / den;
      const tip = { x: a.x + d1.x * t, y: a.y + d1.y * t };
      if (Math.hypot(tip.x - p.x, tip.y - p.y) <= (miterLimit || 10) * h) { out.push(ccw([p, a, tip, b])); return; }
    }
    out.push(ccw([p, a, b]));
  };
  const verts = new Set();
  segs.forEach(i => { verts.add(i); verts.add(i + 1); });
  verts.forEach(v => {
    const end = !closed && (v === 0 || v === n - 1);
    if (end) { if (cap === 'round') disc(pts[v]); }
    else joinAt(closed && v === 0 ? n - 1 : v);
  });
  return out;
}
