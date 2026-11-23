// ── STATUS ─────────────────────────────────────────────────────────────────
// setStatus(msg, ms): the short message line (#status); clears after ms.
let statusTimer = null;
function setStatus(msg, ms = 4000) {
  const el = document.getElementById('status');
  el.textContent = msg;
  clearTimeout(statusTimer);
  if (ms) statusTimer = setTimeout(() => { el.textContent = ''; }, ms);
}

// ── DESIGN SNAPSHOTS, HISTORY, AUTOSAVE ────────────────────────────────────
// Used by: Undo/Redo and autosave (commit after every change), file load (EVENTS),
// favourites, Ambient. Saved-file compatibility lives in applyDesign.
function getDesign() {
  return {
    app: 'nodelink',
    v: 3,
    mode: S.mode,
    density: S.density,
    sigma: S.sigma,
    weight: S.weight,
    seed: S.seed,
    dew: S.dew,
    pcb: { ...S.pcb },
    nebula: { ...S.nebula },
    lightning: { ...S.lightning },
    chaos: { ...S.chaos },
    stained: { ...S.stained },
    arcane: { ...S.arcane },
    micro: { ...S.micro },
    vine: { ...S.vine },
    glass: { ...S.glass },
    curved: S.curved,
    curve: S.curve,
    palette: { ...S.palette, l2: S.palette.l2 ? { ...S.palette.l2 } : null },
    page: { ...S.page },
    sym: { ...S.sym },
    layer: { ...S.layer },
    boundary: { ...S.boundary },
    xf: { ...S.xf },
    nodes: S.nodes.map(n => ({
      x: Math.round(n.x * 100) / 100, y: Math.round(n.y * 100) / 100, glyph: n.glyph,
      size: n.size, w: n.w
    }))
  };
}

const HEX = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
function sanitizePalette(p) {
  p = p || {};
  const l2 = p.l2 && HEX(p.l2.ink) ? { ink: p.l2.ink, glow: HEX(p.l2.glow) ? p.l2.glow : p.l2.ink,
    preset: typeof p.l2.preset === 'string' ? p.l2.preset : 'custom' } : null;
  return {
    mode: ['stencil', 'tint'].includes(p.mode) ? p.mode : 'original',
    ink: HEX(p.ink) ? p.ink : '#000000',
    paper: HEX(p.paper) ? p.paper : '#ffffff',
    glow: HEX(p.glow) ? p.glow : (HEX(p.ink) ? p.ink : '#ffffff'),
    preset: typeof p.preset === 'string' ? p.preset : 'custom',
    l2
  };
}

// Mode options. Missing values load as the look the design had before the
// option existed (no fill, no snap, no wobble, everything shown).
function sanLightning(l) { return { glow: !(l && l.glow === false), fill: !!(l && l.fill) }; }
function sanArcane(a) {
  a = a || {};
  return { snap: !!a.snap, wobble: Math.round(clampNum(a.wobble, 0, 100, 0)), links: a.links !== false, sats: a.sats !== false };
}
function sanMicro(m) {
  m = m || {};
  return { veins: m.veins !== false, orgs: Math.round(clampNum(m.orgs, 0, 200, 100)),
    cilia: ['auto', 'on', 'off'].includes(m.cilia) ? m.cilia : 'auto', detail: m.detail !== false };
}

// d: a parsed design (file, autosave, undo step or preset). Every field is
// checked; a missing one loads as the look designs had before it existed.
function applyDesign(d) {
  if (!d || !Array.isArray(d.nodes) || d.nodes.length < 2) throw new Error('Not a NodeLink design');
  S.mode = MODES.includes(d.mode) ? d.mode : 'pcb';
  S.density = clampNum(d.density, 1, 10, 6);
  S.sigma = clampNum(d.sigma, 0, 100, 80);
  S.weight = clampNum(d.weight, 0.2, 5, 1);
  S.seed = Math.floor(clampNum(d.seed, 0, 999999, randomSeed()));
  S.dew = clampNum(d.dew, 0, 100, 60);
  S.curve = clampNum(d.curve, 0, 100, 60);
  S.curved = d.curved !== false;
  const pcb = d.pcb || {};
  S.pcb = { pour: clampNum(pcb.pour, 0, 100, 40), meander: pcb.meander !== false, silk: !!pcb.silk };
  S.nebula = { glow: !(d.nebula && d.nebula.glow === false) };
  S.lightning = sanLightning(d.lightning);
  S.arcane = sanArcane(d.arcane);
  S.micro = sanMicro(d.micro);
  S.vine = sanVine(d.vine);
  S.glass = sanGlass(d.glass);
  // Files from before the pillar glyphs have no chaos block: classic, no frames
  S.chaos = d.chaos ? { style: ['mixed', 'pillar', 'classic'].includes(d.chaos.style) ? d.chaos.style : 'mixed', frames: !!d.chaos.frames, links: d.chaos.links !== false }
    : { style: 'classic', frames: false, links: true };
  S.stained = { ring: !(d.stained && d.stained.ring === false), ragged: !!(d.stained && d.stained.ragged) };
  S.palette = sanitizePalette(d.palette);
  // v2 files have none of these: defaults keep them looking the same
  const pg = d.page || {};
  S.page = {
    preset: (pg.preset === 'custom' || PAGE_PRESETS[pg.preset]) ? pg.preset : 'none',
    unit: pg.unit === 'px' ? 'px' : 'mm',
    w: clampNum(pg.w, 1, 20000, 63),
    h: clampNum(pg.h, 1, 20000, 88),
    bleed: clampNum(pg.bleed, 0, 20, 0),
    clip: pg.clip !== false
  };
  const sym = d.sym || {}, lay = d.layer || {}, bnd = d.boundary || {};
  S.sym = { n: Math.round(clampNum(sym.n, 1, 12, 1)), mirror: !!sym.mirror };
  S.layer = {
    mode: MODES.includes(lay.mode) ? lay.mode : 'none',
    density: clampNum(lay.density, 1, 10, 4),
    weight: clampNum(lay.weight, 0.2, 5, 0.6),
    strength: clampNum(lay.strength, 10, 100, 60)
  };
  // Layer 2's own options (absent: follows Layer 1)
  if (lay.sigma !== undefined) S.layer.sigma = clampNum(lay.sigma, 0, 100, 80);
  if (lay.dew !== undefined) S.layer.dew = clampNum(lay.dew, 0, 100, 60);
  if (lay.curve !== undefined) S.layer.curve = clampNum(lay.curve, 0, 100, 60);
  if (lay.curved !== undefined) S.layer.curved = lay.curved !== false;
  if (lay.seed !== undefined) S.layer.seed = Math.floor(clampNum(lay.seed, 0, 999999, 0));
  if (lay.pcb) S.layer.pcb = { pour: clampNum(lay.pcb.pour, 0, 100, 40), meander: lay.pcb.meander !== false, silk: !!lay.pcb.silk };
  if (lay.nebula) S.layer.nebula = { glow: lay.nebula.glow !== false };
  if (lay.lightning) S.layer.lightning = sanLightning(lay.lightning);
  if (lay.arcane) S.layer.arcane = sanArcane(lay.arcane);
  if (lay.micro) S.layer.micro = sanMicro(lay.micro);
  if (lay.vine) S.layer.vine = sanVine(lay.vine);
  if (lay.glass) S.layer.glass = sanGlass(lay.glass);
  if (lay.chaos) S.layer.chaos = { style: ['mixed', 'pillar', 'classic'].includes(lay.chaos.style) ? lay.chaos.style : 'mixed', frames: !!lay.chaos.frames, links: lay.chaos.links !== false };
  if (lay.stained) S.layer.stained = { ring: lay.stained.ring !== false, ragged: !!lay.stained.ragged };
  S.boundary = {
    // Shield and arm band are retired: a shield loads as a circle, a band as none
    shape: ['none', 'circle', 'square', 'pentagon', 'hexagon'].includes(bnd.shape) ? bnd.shape : bnd.shape === 'shield' ? 'circle' : 'none',
    size: clampNum(bnd.size, 100, 900, 300),
    border: ['single', 'double', 'none'].includes(bnd.border) ? bnd.border : 'single'
  };
  const xf = d.xf || {};
  S.xf = { scale: clampNum(xf.scale, 0.25, 4, 1), rot: clampNum(xf.rot, -180, 180, 0), x: clampNum(xf.x, -XF_MAX, XF_MAX, 0), y: clampNum(xf.y, -XF_MAX, XF_MAX, 0) };
  S.nodes = d.nodes.slice(0, 9).map((n, i) => ({
    id: i + 1,
    x: Number(n.x) || 0,
    y: Number(n.y) || 0,
    glyph: (i + 1).toString(),
    size: clampNum(n.size, 0.5, 3, 1),
    w: clampNum(n.w, 0.5, 3, 1)
  }));
  syncControls();
  renderNodeRoster();
  update();
}

function clampNum(v, lo, hi, dflt) {
  v = Number(v);
  if (!isFinite(v)) return dflt;
  return Math.max(lo, Math.min(hi, v));
}

const H = { stack: [], idx: -1 };
const LS_STATE = 'nodelink.state';
const LS_FAVS = 'nodelink.favs';
const LS_EXPORT = 'nodelink.export';

// Call after any finished edit. Identical states are not pushed.
function commit() {
  const snap = JSON.stringify(getDesign());
  if (H.stack[H.idx] === snap) return;
  H.stack = H.stack.slice(0, H.idx + 1);
  H.stack.push(snap);
  if (H.stack.length > 100) H.stack.shift();
  H.idx = H.stack.length - 1;
  syncHistoryButtons();
  if (H.stack.length > 1) endEmptyStart();       // the first design change ends the first-visit screen
  try { localStorage.setItem(LS_STATE, snap); } catch (e) { /* storage unavailable */ }
}

function undo() {
  if (H.idx <= 0) return;
  H.idx--;
  applyDesign(JSON.parse(H.stack[H.idx]));
  persistCurrent();
  syncHistoryButtons();
}

function redo() {
  if (H.idx >= H.stack.length - 1) return;
  H.idx++;
  applyDesign(JSON.parse(H.stack[H.idx]));
  persistCurrent();
  syncHistoryButtons();
}

function persistCurrent() {
  try { localStorage.setItem(LS_STATE, H.stack[H.idx]); } catch (e) { /* ignore */ }
}

function syncHistoryButtons() {
  document.getElementById('btn-undo').disabled = H.idx <= 0;
  document.getElementById('btn-redo').disabled = H.idx >= H.stack.length - 1;
}

// ── FAVOURITES ─────────────────────────────────────────────────────────────
// Saved presets with thumbnails in localStorage (LS_FAVS).
function loadFavs() {
  try {
    const f = JSON.parse(localStorage.getItem(LS_FAVS) || '[]');
    return Array.isArray(f) ? f : [];
  } catch (e) {
    return [];
  }
}

function saveFavs(favs) {
  try {
    localStorage.setItem(LS_FAVS, JSON.stringify(favs));
    return true;
  } catch (e) {
    setStatus('Favourites storage is full. Delete some, or use Save .json.');
    return false;
  }
}

function addFavourite() {
  // The thumbnail shows the design the favourite restores (never a paused frame)
  const keepF = ANIM.frozen; ANIM.frozen = false;
  let L, tc;
  try { L = exportLayout(180, computeBounds()); tc = renderRaster(L, makeColorMap(S.palette), { still: true }); }
  finally { ANIM.frozen = keepF; }
  const favs = loadFavs();
  favs.unshift({ id: Date.now(), design: getPreset(), thumb: tc.toDataURL('image/jpeg', 0.85) });
  if (favs.length > 30) favs.length = 30;
  if (saveFavs(favs)) {
    renderFavs();
    setStatus('Saved to favourites');
  }
}

function renderFavs() {
  const box = document.getElementById('favs');
  box.innerHTML = '';
  const favs = loadFavs();
  document.getElementById('favs-empty').classList.toggle('hidden', favs.length > 0);
  favs.forEach(f => {
    const el = document.createElement('div');
    el.className = 'fav';
    const what = `${f.design.mode} · seed ${f.design.seed}`;
    el.title = `Load this favourite (${what})`;
    const img = document.createElement('img');
    img.src = f.thumb;
    img.alt = what;
    const del = document.createElement('button');
    del.className = 'fav-del';
    del.textContent = '×';
    del.title = 'Remove this favourite';
    del.addEventListener('click', e => {
      e.stopPropagation();
      saveFavs(loadFavs().filter(x => x.id !== f.id));
      renderFavs();
    });
    el.addEventListener('click', () => {
      applyPresetFile(f.design);
      commit();
      setStatus('Favourite restored (Undo to go back)');
    });
    el.append(img, del);
    box.appendChild(el);
  });
}
