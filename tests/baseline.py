# Pixel baseline: md5 of the canvas for many designs. Usage: baseline.py file.html out.json
import sys, json
from playwright.sync_api import sync_playwright
html, out = sys.argv[1], sys.argv[2]
JS = r"""
async () => {
  const md5 = s => { let h1 = 0x811c9dc5, h2 = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = (h2 * 31 + c) | 0; } return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16) + ':' + s.length; };
  const cv = document.querySelector('#canvas-container canvas');
  const base = () => {
    const d = getDesign();
    d.seed = 4242; d.sigma = 60; d.density = 6; d.weight = 1;
    d.nodes = [{x:0,y:0},{x:160,y:-40},{x:-120,y:110},{x:60,y:170},{x:-150,y:-130}].map(n => ({...n, glyph: 0, size: 1, w: 1}));
    delete d.arcane; delete d.micro; d.lightning = { glow: true };
    d.sym = { n: 1, mirror: false }; d.layer = { mode: 'none', density: 4, weight: 0.6, strength: 60 };
    d.boundary = { shape: 'none', size: 300, border: 'single' }; d.xf = { scale: 1, rot: 0, x: 0, y: 0 };
    d.palette = { mode: 'original', ink: '#000000', paper: '#ffffff', glow: '#ffffff', preset: 'custom', l2: null };
    return d;
  };
  const res = {};
  const shot = (key, d) => { applyDesign(d); draw(); res[key] = md5(cv.toDataURL());
    if (d.mode === 'pcb' && renderPCB.lastLines) res[key + '|lines'] = md5(JSON.stringify([renderPCB.lastLines, renderPCB.lastLinks, renderPCB.lastZones, renderPCB.lastObst])); };
  for (const m of MODES) for (const sh of ['none', 'hexagon', 'pentagon']) { const d = base(); d.mode = m; d.boundary.shape = sh; shot(m + '/' + sh, d); }
  for (const m of MODES) { const d = base(); d.mode = m; d.sym = { n: 6, mirror: true }; shot(m + '/sym6', d); }
  // PCB in depth
  for (const seed of [1, 4242, 99991, 500000, 777777]) for (const den of [1, 4, 8, 10]) for (const sg of [0, 50, 100]) {
    const d = base(); d.mode = 'pcb'; d.seed = seed; d.density = den; d.sigma = sg; shot(`pcb/${seed}/${den}/${sg}`, d);
  }
  for (const pcb of [{pour:0,meander:false,silk:false},{pour:100,meander:true,silk:true},{pour:70,meander:false,silk:true}]) for (const sh of ['none','circle','square']) {
    const d = base(); d.mode = 'pcb'; d.pcb = pcb; d.boundary.shape = sh; shot(`pcb/opt/${JSON.stringify(pcb)}/${sh}`, d);
  }
  for (const w of [0.3, 2.5]) { const d = base(); d.mode = 'pcb'; d.weight = w; shot('pcb/w' + w, d); }
  { const d = base(); d.mode = 'pcb'; d.nodes = d.nodes.map((n, i) => ({...n, size: 0.6 + i * 0.3, w: 1 + (i % 3)})); shot('pcb/sizes', d); }
  { const d = base(); d.mode = 'pcb'; d.nodes = d.nodes.slice(0, 2); shot('pcb/2nodes', d); }
  for (const L of MODES) { const d = base(); d.mode = 'pcb'; d.layer = { mode: L, density: 5, weight: 0.8, strength: 70 }; shot('pcb+L2/' + L, d); }
  for (const M of MODES) { const d = base(); d.mode = M; d.layer = { mode: 'pcb', density: 5, weight: 0.8, strength: 70 }; shot(M + '+L2pcb', d); }
  { const d = base(); d.mode = 'pcb'; d.layer = { mode: 'pcb', density: 7, weight: 0.6, strength: 60, seed: 123 }; d.boundary.shape = 'hexagon'; shot('pcb+pcb/hex', d); }
  { const d = base(); d.mode = 'pcb'; d.xf = { scale: 1.6, rot: 30, x: 40, y: -20 }; d.sym = { n: 4, mirror: false }; shot('pcb/xf', d); }
  { const d = base(); d.mode = 'pcb'; d.palette = { mode: 'stencil', ink: '#112233', paper: '#ffffff', glow: '#112233', preset: 'custom', l2: null }; shot('pcb/stencil', d); }
  // strokes SVG and cut input for pcb
  for (const [k, mut] of [['pcb', d => {}], ['pcbsilk', d => { d.pcb = {pour:100, meander:true, silk:true}; d.boundary.shape = 'circle'; }], ['pcb+pcb', d => { d.layer = { mode: 'pcb', density: 7, weight: 0.6, strength: 60 }; }]]) {
    const d = base(); d.mode = 'pcb'; mut(d); applyDesign(d); draw();
    const L = exportLayout(exportPx()); const svg = new C2S(L.W, L.H, L.cmW * 10, L.cmH * 10);
    FX_PLAIN = true; try { renderTo(svg, L.W, L.H, L.view, { map: makeColorMap(S.palette) }); } finally { FX_PLAIN = false; }
    res['svg/' + k] = md5(svg.getSvg());
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
    r = pg.evaluate(JS)
    r['_errors'] = errs
    json.dump(r, open(out, 'w'), indent=0, sort_keys=True)
    print(len(r), 'keys; errors:', errs[:3])
    b.close()
