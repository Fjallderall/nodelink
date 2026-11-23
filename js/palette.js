// ── PALETTE (colour remapping) ─────────────────────────────────────────────
// Renderers hardcode their colours. In stencil mode every colour set on the
// context is remapped: dark colours (backgrounds, masks) become paper, all
// others become ink. Alpha is kept, so faint lines stay faint.
// Used by: RENDERING and EXPORTS (makeColorMap, paletteCtx); cssFilterMap
// for a paused Colour cycle in the strokes SVG.
const colorCache = new Map();

function parseColor(str) {
  if (typeof str !== 'string') return null;
  if (colorCache.has(str)) return colorCache.get(str);
  let out = null;
  const s = str.trim().toLowerCase();
  let m;
  if ((m = s.match(/^#([0-9a-f]{3})$/))) {
    out = { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16), a: 1 };
  } else if ((m = s.match(/^#([0-9a-f]{6})$/))) {
    out = { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
  } else if ((m = s.match(/^rgba?\(([^)]+)\)$/))) {
    const p = m[1].split(',').map(v => parseFloat(v));
    out = { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  } else if ((m = s.match(/^hsla?\(([^)]+)\)$/))) {
    const p = m[1].split(',').map(v => parseFloat(v));
    const h = ((p[0] % 360) + 360) % 360 / 60, sa = p[1] / 100, l = p[2] / 100;
    const C = (1 - Math.abs(2 * l - 1)) * sa, X = C * (1 - Math.abs(h % 2 - 1)), o = l - C / 2;
    const [r, g, b] = h < 1 ? [C, X, 0] : h < 2 ? [X, C, 0] : h < 3 ? [0, C, X] : h < 4 ? [0, X, C] : h < 5 ? [X, 0, C] : [C, 0, X];
    out = { r: (r + o) * 255, g: (g + o) * 255, b: (b + o) * 255, a: p.length > 3 ? p[3] : 1 };
  }
  colorCache.set(str, out);
  return out;
}

// Colour schemes: background, lines, highlights. A renderer colour is placed
// on that ramp by its brightness, relative to its mode's main line colour
// (ACCENT): darker colours fade towards the background, the main lines get
// "lines", brighter ones (cores, dew, glints) run on to "highlights".
const PALETTES = [
  { id: 'phosphor', name: 'Phosphor', bg: '#020a04', ink: '#1fd655', glow: '#c8ffd4' },
  { id: 'amber', name: 'Amber CRT', bg: '#0b0600', ink: '#ff9d1c', glow: '#ffe6b3' },
  { id: 'gameboy', name: 'Game Boy', bg: '#0f380f', ink: '#8bac0f', glow: '#d6e894' },
  { id: 'blood', name: 'Blood', bg: '#0a0203', ink: '#e3203c', glow: '#ff9e9e' },
  { id: 'pink', name: 'Neon pink', bg: '#0e0410', ink: '#ff2fa4', glow: '#ffd3ee' },
  { id: 'teal', name: 'Teal', bg: '#021111', ink: '#16b8a6', glow: '#c6fff6' },
  { id: 'purple', name: 'Amethyst', bg: '#0b0616', ink: '#9461ff', glow: '#e6d9ff' },
  { id: 'synth', name: 'Synthwave', bg: '#14052b', ink: '#ff3cac', glow: '#5ff4ff' },
  { id: 'thermal', name: 'Thermal', bg: '#06000c', ink: '#d0206a', glow: '#ffe94a' },
  { id: 'ice', name: 'Ice', bg: '#050b14', ink: '#4fa3d9', glow: '#f2fbff' },
  { id: 'gold', name: 'Gold leaf', bg: '#090807', ink: '#b8892f', glow: '#fff0c2' },
  { id: 'blueprint', name: 'Blueprint', bg: '#0d3b70', ink: '#9cc6f0', glow: '#ffffff' },
  { id: 'sepia', name: 'Parchment', bg: '#efe3c8', ink: '#6b4423', glow: '#2a1406' },
  { id: 'paper', name: 'Ink on paper', bg: '#f5f2ea', ink: '#3a3a3a', glow: '#000000' }
];

let PAL_L2 = false;     // set while Layer 2 is replayed (drawSymmetric)

// pal: a palette like S.palette ({ mode, ink, paper, glow, l2 }). Returns
// a function colour string → colour string (cached per layer), or null
// when the original colours stay.
function makeColorMap(pal) {
  if (!pal) return null;
  const l2 = pal.l2 && S.layer.mode !== 'none' ? pal.l2 : null;
  if (pal.mode === 'original' && !l2) return null;
  const P = c => parseColor(c) || { r: 0, g: 0, b: 0, a: 1 };
  const lumOf = c => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  const bg = pal.mode === 'original' ? P(modeBg(S.mode)) : P(pal.paper);
  const stencil = (ink) => (c) => lumOf(c) < 0.13 ? bg : ink;
  const mix = (A, B, f) => ({ r: A.r + (B.r - A.r) * f, g: A.g + (B.g - A.g) * f, b: A.b + (B.b - A.b) * f });
  // Luminance range of a mode's colours: a0 and below is background, up to a1
  // (the mode's accent) runs from paper to ink, above it from ink to glow
  const lumRange = mode => ({ a0: 0.05, a1: Math.min(0.94, Math.max(0.3, lumOf(P(ACCENT[mode] || '#ddd6c8')))) });
  const ramp = (ink, glow, mode) => {
    const { a0, a1 } = lumRange(mode);
    const own = lumOf(P(modeBg(mode))) + 0.012;   // the mode's own background fill stays background
    return (c) => {
      const L = lumOf(c);
      if (L <= Math.max(a0, own)) return bg;
      if (L <= a1) return mix(bg, ink, Math.pow((L - a0) / (a1 - a0), 0.55));   // curved: faint lines stay readable
      return mix(ink, glow, Math.min(1, (L - a1) / (1 - a1)));
    };
  };
  // Nebula: each swirl has its own hue. Under a scheme the hue picks a tone
  // between ink and glow (instead of every swirl becoming the same colour);
  // brightness still fades it from the background as in ramp()
  const hueRamp = (ink, glow, mode) => {
    const base = ramp(ink, glow, mode);
    const { a0, a1 } = lumRange(mode);
    return (c) => {
      const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b);
      if (mx < 1 || (mx - mn) / mx < 0.25) return base(c);       // white cores, grey: as usual
      let h;
      if (mx === c.r) h = ((c.g - c.b) / (mx - mn)) % 6; else if (mx === c.g) h = (c.b - c.r) / (mx - mn) + 2; else h = (c.r - c.g) / (mx - mn) + 4;
      const tone = mix(ink, glow, Math.min(1, Math.max(0, 0.5 + 0.8 * Math.sin(h * Math.PI / 3))));   // pushed apart
      // Hue alone sets the tone, so judge brightness on the colour's value
      const L = Math.max(lumOf(c), mx / 255 * 0.55);
      if (L <= a0) return bg;
      return mix(bg, tone, Math.min(1, Math.pow((L - a0) / (a1 - a0), 0.55)));
    };
  };
  const pick = (mode, layer) => {
    const src = layer ? l2 : pal;
    if (pal.mode === 'original' && !layer) return null;
    if (pal.mode === 'stencil') return stencil(P(src.ink));
    return (mode === 'nebula' || mode === 'glass' ? hueRamp : ramp)(P(src.ink), P(src.glow || src.ink), mode);
  };
  const fns = [pick(S.mode, false), l2 ? pick(S.layer.mode, true) : null];
  const caches = [new Map(), new Map()];
  return (v) => {
    const k = PAL_L2 && l2 ? 1 : 0;
    const fn = fns[k];
    if (!fn) return v;
    const cache = caches[k];
    if (cache.has(v)) return cache.get(v);
    let res = v;
    if (typeof v === 'string' && v.startsWith('hsla(') && pal.mode === 'stencil') res = 'rgba(0,0,0,0)';   // nebula glow
    else {
      const c = parseColor(v);
      if (c) { const t = fn(c); res = `rgba(${Math.round(t.r)},${Math.round(t.g)},${Math.round(t.b)},${c.a})`; }
    }
    cache.set(v, res);
    return res;
  };
}

// Colour cycle in vector exports. On screen the cycle is a CSS filter on the
// canvas (sepia, saturate, hue-rotate); a PNG bakes it in with ctx.filter,
// but an SVG has no pixels, so every colour is run through the same filter
// maths instead: the Filter Effects colour matrices, in sRGB, clamped after
// each step as the browser does. Wraps an existing colour map (or none).
function cssFilterMap(base, filter) {
  const M = [];
  for (const [, fn, arg] of filter.matchAll(/([a-z-]+)\(([-\d.]+)(?:deg)?\)/g)) {
    const v = +arg;
    if (fn === 'sepia') { const a = 1 - Math.min(1, v); M.push([0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a, 0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a, 0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a]); }
    else if (fn === 'saturate') M.push([0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v, 0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v, 0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v]);
    else if (fn === 'hue-rotate') {
      const r = v * Math.PI / 180, co = Math.cos(r), si = Math.sin(r);
      M.push([0.213 + co * 0.787 - si * 0.213, 0.715 - co * 0.715 - si * 0.715, 0.072 - co * 0.072 + si * 0.928,
        0.213 - co * 0.213 + si * 0.143, 0.715 + co * 0.285 + si * 0.140, 0.072 - co * 0.072 - si * 0.283,
        0.213 - co * 0.213 - si * 0.787, 0.715 - co * 0.715 + si * 0.715, 0.072 + co * 0.928 + si * 0.072]);
    }
  }
  if (!M.length) return base;
  const cache = new Map(), cl = v => Math.max(0, Math.min(1, v));
  return (v0) => {
    const v = base ? base(v0) : v0;
    if (typeof v !== 'string') return v;           // gradients and patterns pass through
    if (cache.has(v)) return cache.get(v);
    const c = parseColor(v);
    let res = v;
    if (c) {
      let r = c.r / 255, g = c.g / 255, b = c.b / 255;
      for (const m of M) [r, g, b] = [cl(m[0] * r + m[1] * g + m[2] * b), cl(m[3] * r + m[4] * g + m[5] * b), cl(m[6] * r + m[7] * g + m[8] * b)];
      res = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${c.a})`;
    }
    cache.set(v, res);
    return res;
  };
}

// Wraps a 2D context (or the SVG builder) so colour assignments go through map()
function paletteCtx(c, map) {
  if (!map) return c;
  const bound = new Map();
  return new Proxy(c, {
    get(t, p) {
      const v = t[p];
      if (typeof v !== 'function') return v;
      if (!bound.has(p)) bound.set(p, v.bind(t));
      return bound.get(p);
    },
    set(t, p, v) {
      if (p === 'strokeStyle' || p === 'fillStyle' || p === 'shadowColor') v = map(v);
      t[p] = v;
      return true;
    }
  });
}
