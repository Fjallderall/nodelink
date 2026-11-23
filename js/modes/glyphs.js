// ── GLYPH HELPERS: swastika guard, symbol swap (Arcane, Chaosgate) ──────────
// Used by: Arcane, Pillar symbols and Chaosgate. animTick sets GLYPH_T,
// GLYPH_P and CHAOS_BASE while recording live frames.

// Swastika guard.
// Glyphs are drawn on an integer grid, so they can be checked before drawing.
// segs: axis-aligned segments [x1, y1, x2, y2] in grid units. A pinwheel is a
// point with arms in all four directions where at least three arms end in a
// hook turning the same way (either way round). Such glyphs are regenerated.
function glyphPinwheel(segs) {
  const E = new Set(), P = new Set();
  const k = (x, y, dx, dy) => x + ',' + y + ',' + dx + ',' + dy;
  segs.forEach(([x1, y1, x2, y2]) => {
    const dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1), n = Math.abs(x2 - x1) + Math.abs(y2 - y1);
    for (let i = 0; i < n; i++) {
      const x = x1 + dx * i, y = y1 + dy * i;
      E.add(k(x, y, dx, dy)); E.add(k(x + dx, y + dy, -dx, -dy)); P.add(x + ',' + y); P.add((x + dx) + ',' + (y + dy));
    }
  });
  const D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (const pk of P) {
    const [px, py] = pk.split(',').map(Number);
    if (!D.every(([dx, dy]) => E.has(k(px, py, dx, dy)))) continue;
    let cw = 0, ccw = 0;
    D.forEach(([dx, dy]) => {
      let x = px, y = py, g = 0;
      while (E.has(k(x, y, dx, dy)) && g++ < 99) { x += dx; y += dy; }
      const L = E.has(k(x, y, dy, -dx)), Rt = E.has(k(x, y, -dy, dx));
      if (L !== Rt) { if (L) ccw++; else cw++; }
    });
    if (cw >= 3 || ccw >= 3) return true;
  }
  return false;
}

// While playing (Drift, Flow or Glitch) each symbol swaps for a newly
// generated one every GLYPH_P seconds, at its own moment, crossfading over
// GLYPH_FADE of the period. GLYPH_T is the animation time while recording a
// live frame, else null (stills and exports draw the seed's own glyphs).
// GLYPH_P comes from the "Symbol swap" setting (0 = off, GLYPH_T stays null).
let GLYPH_T = null;
// The real node positions while a drifting frame is recorded: pillar layout is
// placed from these (so it doesn't reshuffle) and then moved with the nodes
let CHAOS_BASE = null;
let GLYPH_P = 3.5;
const GLYPH_FADE = 0.18;
// Draws a glyph through draw(seed), swapping and crossfading by GLYPH_T.
// Swap 0 is the seed's own glyph (seed === base).
function glyphCycle(c, base, draw) {
  if (GLYPH_T === null) { draw(base); return; }
  const e = GLYPH_T / GLYPH_P + sr(base * 0.37 + 11), ep = Math.floor(e), f = e - ep;
  const sd = n => n ? base + n * 104729 : base;
  if (f >= GLYPH_FADE) { draw(sd(ep)); return; }
  const a0 = c.globalAlpha ?? 1, u = f / GLYPH_FADE;
  c.globalAlpha = a0 * (1 - u); draw(sd(ep - 1));
  c.globalAlpha = a0 * u; draw(sd(ep));
  c.globalAlpha = a0;
}
