# Mode depth: one mode's options in depth, for refactors of a mode renderer.
# Usage: modes.py FILE.html OUT.json MODE…   (modes covered: glass, vine;
# add a block to OPTS for another mode). Hashes the canvas per design and the
# strokes SVG for a few; compare two runs with the snippet in README.md.
import sys, json
from playwright.sync_api import sync_playwright
html, out, modes = sys.argv[1], sys.argv[2], sys.argv[3:]
OPTS = {
  'glass': [{'style': s, 'set': st, 'light': l} for s in ['mosaic', 'tiffany', 'rose']
            for st in ['jewel', 'pastel', 'amber', 'sea', 'clear'] for l in [True, False]],
  'vine': [{'leaves': lv, 'flowers': fl, 'leaf': lf, 'bloom': bl, 'tendrils': td, 'veins': vn, 'season': se}
           for (lv, fl, td, vn) in [(100, 60, True, True), (200, 100, False, False), (0, 0, True, True), (40, 30, True, False)]
           for lf in ['almond', 'round', 'ivy', 'mixed'] for bl in ['blossom', 'daisy', 'rose', 'mixed']
           for se in ['summer', 'spring', 'autumn', 'winter'] if (lf == 'mixed' or bl == 'mixed' or se == 'summer')],
  # Modes whose options are top-level design fields: {'_top': {...}} is merged into the design
  'spiderweb': [{'_top': {'sigma': sg, 'dew': dw, 'curved': cv, 'curve': cu}}
                for sg in [60, 0, 30, 50, 75, 100] for dw in [60, 0, 100] for (cv, cu) in [(False, 50), (True, 20), (True, 90)]],
  'lightning': [{'_top': {'sigma': sg, 'lightning': {'glow': g, 'fill': f}}}
                for sg in [60, 0, 30, 100] for g in [True, False] for f in [False, True]],
  'constellation': [{'_top': {'sigma': sg, 'density': dn, 'weight': w}}
                    for sg in [60, 0, 35, 100] for dn in [6, 1, 3, 10] for w in [1, 0.4, 2.5]],
  'arcane': [{'snap': sn, 'wobble': wb, 'links': lk, 'sats': st}
             for wb in [0, 40, 100] for lk in [True, False] for st in [True, False] for sn in [False, True]],
}
JS = r"""
async ([modes, OPTS]) => {
  const md5 = s => { let h1 = 0x811c9dc5, h2 = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = (h2 * 31 + c) | 0; } return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16) + ':' + s.length; };
  const cv = document.querySelector('#canvas-container canvas');
  const base = () => {
    const d = getDesign();
    d.seed = 4242; d.sigma = 60; d.density = 6; d.weight = 1;
    d.nodes = [{x:0,y:0},{x:160,y:-40},{x:-120,y:110},{x:60,y:170},{x:-150,y:-130}].map(n => ({...n, glyph: 0, size: 1, w: 1}));
    d.sym = { n: 1, mirror: false }; d.layer = { mode: 'none', density: 4, weight: 0.6, strength: 60 };
    d.boundary = { shape: 'none', size: 300, border: 'single' }; d.xf = { scale: 1, rot: 0, x: 0, y: 0 };
    d.palette = { mode: 'original', ink: '#000000', paper: '#ffffff', glow: '#ffffff', preset: 'custom', l2: null };
    return d;
  };
  const res = {};
  const shot = (key, d, svg) => {
    applyDesign(d); draw(); res[key] = md5(cv.toDataURL());
    if (svg) {
      const L = exportLayout(exportPx()); const s = new C2S(L.W, L.H, L.cmW * 10, L.cmH * 10);
      renderTo(s, L.W, L.H, L.view, { map: makeColorMap(S.palette), plain: true });
      res[key + '|svg'] = md5(s.getSvg());
    }
  };
  for (const m of modes) {
    OPTS[m].forEach((o, i) => { const d = base(); d.mode = m; if (o._top) Object.assign(d, o._top); else d[m] = o; shot(`${m}/opt/${JSON.stringify(o)}`, d, i % 7 === 0); });
    const first = OPTS[m].slice(0, m === 'glass' ? 30 : 12);
    for (const o of first) for (const [k, mut] of [
      ['seed1', d => { d.seed = 1; }], ['seed777', d => { d.seed = 777777; d.density = 9; }],
      ['den1', d => { d.density = 1; d.sigma = 0; }], ['jit100', d => { d.sigma = 100; d.density = 10; }],
      ['hex', d => { d.boundary.shape = 'hexagon'; }], ['circle', d => { d.boundary.shape = 'circle'; d.boundary.size = 220; }],
      ['sym6', d => { d.sym = { n: 6, mirror: true }; }], ['w2', d => { d.weight = 2.5; }],
      ['sizes', d => { d.nodes = d.nodes.map((n, i) => ({...n, size: 0.6 + i * 0.3, w: 1 + (i % 3)})); }],
      ['2nodes', d => { d.nodes = d.nodes.slice(0, 2); }],
      ['stencil', d => { d.palette = { mode: 'stencil', ink: '#112233', paper: '#ffffff', glow: '#112233', preset: 'custom', l2: null }; }],
      ['xf', d => { d.xf = { scale: 1.6, rot: 30, x: 40, y: -20 }; }],
      ['L2', d => { d.layer = { mode: 'web', density: 5, weight: 0.8, strength: 70 }; }],
    ]) { const d = base(); d.mode = m; if (o._top) Object.assign(d, o._top); else d[m] = o; mut(d); shot(`${m}/${k}/${JSON.stringify(o)}`, d, k === 'hex' || k === 'sym6'); }
    for (const M of ['pcb', 'foam', 'arcane']) { const d = base(); d.mode = M; d.layer = { mode: m, density: 5, weight: 0.8, strength: 70 }; shot(`${M}+L2${m}`, d); }
  }
  return res;
}
"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1200, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file://' + html); pg.wait_for_timeout(800)
    r = pg.evaluate(JS, [modes, OPTS])
    r['_errors'] = errs
    json.dump(r, open(out, 'w'), indent=0, sort_keys=True)
    print(len(r), 'keys,', len(set(v for k, v in r.items() if k != '_errors')), 'distinct; errors:', errs[:3])
    b.close()
