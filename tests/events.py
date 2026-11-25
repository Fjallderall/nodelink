# Events test: drives every control setupEvents wires and snapshots state after each step.
import sys, json
from playwright.sync_api import sync_playwright
html, out = sys.argv[1], sys.argv[2]
INIT = r"""(() => { let s = 12345; Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  try { localStorage.clear(); } catch (e) {} })()"""
SNAP = r"""() => JSON.stringify({ d: getDesign(), E, EDIT_L, zoom: S.zoom, pan: S.pan, show: S.showNodes, mv: !!S.moveDesign,
  h: [H.idx, H.stack.length], cut: document.getElementById('cut-body').className,
  seed: document.getElementById('seed').value, status: (document.getElementById('status') || {}).textContent })"""
STEPS = [
 ('input', 'density', '3'), ('change', 'density', None), ('input', 'sigma', '20'), ('input', 'weight', '2.5'), ('input', 'dew', '30'), ('input', 'curve', '90'),
 ('select', 'mode', 'pcb'), ('fill', 'seed', '31337'), ('click', 'btn-reseed'), ('click', 'btn-random'),
 ('select', 'sym-type', 'rot'), ('input', 'sym-n', '5'), ('check', 'sym-kaleido', True), ('select', 'sym-type', 'mirror'), ('select', 'sym-type', 'off'),
 ('select', 'layer-mode', 'foam'), ('input', 'layer-strength', '40'), ('click', '#ed-layer button[data-l="2"]'), ('input', 'density', '7'), ('click', 'layer-swap'), ('click', '#ed-layer button[data-l="1"]'),
 ('select', 'bnd-shape', 'hexagon'), ('input', 'bnd-size', '400'), ('input', 'xf-scale', '150'), ('input', 'xf-rot', '30'), ('click', 'xf-fit'), ('click', 'xf-centre'), ('click', 'xf-reset'),
 ('click', 'xf-move'), ('click', 'btn-move'), ('select', 'bnd-border', 'double'),
 ('select', 'pg-preset', 'a5'), ('select', 'pg-unit', 'px'), ('fill', 'pg-w', '900'), ('fill', 'pg-bleed', '3'), ('check', 'pg-clip', False), ('click', 'pg-rotate'), ('select', 'pg-unit', 'mm'),
 ('input', 'pcb-pour', '75'), ('check', 'pcb-meander', False), ('check', 'pcb-silk', True), ('check', 'stain-ragged', True), ('check', 'stain-ring', False), ('check', 'neb-glow', False),
 ('select', 'chaos-style', 'pillar'), ('check', 'chaos-frames', True), ('check', 'chaos-links', False), ('check', 'light-glow', False), ('check', 'light-fill', False),
 ('check', 'arc-snap', True), ('input', 'arc-wobble', '40'), ('check', 'arc-links', False), ('check', 'arc-sats', False), ('check', 'micro-veins', False), ('input', 'micro-orgs', '150'),
 ('select', 'micro-cilia', 'on'), ('check', 'micro-detail', False), ('input', 'vine-leaves', '50'), ('input', 'vine-flowers', '90'), ('select', 'vine-leaf', 'ivy'), ('select', 'vine-bloom', 'rose'),
 ('select', 'vine-season', 'autumn'), ('check', 'vine-tendrils', False), ('check', 'vine-veins', False), ('select', 'glass-style', 'tiffany'), ('select', 'glass-set', 'sea'), ('check', 'glass-light', False),
 ('check', 'curved', False), ('click', 'btn-undo'), ('click', 'btn-undo'), ('click', 'btn-redo'), ('key', 'Control+z'), ('key', 'Control+Shift+Z'), ('key', 'Control+y'),
 ('select', 'palette', 'tint'), ('select', 'l2-colour', 'own'), ('select', 'l2-colour', 'same'), ('color', 'ink', '#ff0000'), ('select', 'palette', 'stencil'), ('color', 'paper', '#00ff00'),
 ('click', 'btn-add-node'), ('click', 'btn-reset-nodes'), ('nodedrag', None), ('click', 'btn-toggle-nodes'), ('click', 'tb-shuffle'), ('click', 'tb-randomize'), ('click', 'btn-auto-place'), ('click', 'btn-fav'),
 ('select', 'ex-frame', 'page'), ('fill', 'ex-cm', '15'), ('select', 'ex-dpi', '600'), ('check', 'ex-transparent', False), ('fill', 'ex-minmm', '1.2'), ('fill', 'ex-mingap', '0.9'), ('fill', 'ex-minpiece', '3'),
 ('select', 'ex-cutstyle', 'hairline'), ('select', 'ex-cutpreset', 'lply'), ('click', 'cut-collapse'),
 ('click', 'btn-zi'), ('click', 'btn-zi'), ('click', 'btn-zo'), ('wheel', None), ('drag', None), ('shiftdrag', None), ('click', 'btn-zr'), ('resize', None),
]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1300, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script(INIT)
    pg.goto('file://' + html); pg.wait_for_timeout(800)
    res = []
    for st in STEPS:
        kind, tgt = st[0], st[1]
        sel = tgt if tgt and (tgt.startswith('#') or ' ' in tgt) else ('#' + tgt if tgt else None)
        try:
            if kind == 'input':
                pg.evaluate("([s, v]) => { const el = document.querySelector(s); el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }", [sel, st[2]])
            elif kind == 'change':
                pg.evaluate("s => document.querySelector(s).dispatchEvent(new Event('change', {bubbles: true}))", sel)
            elif kind in ('select', 'fill', 'color'):
                pg.evaluate("([s, v]) => { const el = document.querySelector(s); if (el.tagName === 'SELECT' && ![...el.options].some(o => o.value === v)) v = el.options[Math.min(1, el.options.length - 1)].value; el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }", [sel, st[2]])
            elif kind == 'check':
                pg.evaluate("([s, v]) => { const el = document.querySelector(s); el.checked = v; el.dispatchEvent(new Event('change', {bubbles: true})); }", [sel, st[2]])
            elif kind == 'click':
                pg.evaluate("s => document.querySelector(s).click()", sel)
            elif kind == 'key':
                pg.evaluate("() => document.activeElement && document.activeElement.blur()"); pg.keyboard.press(tgt)
            elif kind == 'wheel':
                pg.evaluate("() => { const v = document.querySelector('#canvas-container'); v.dispatchEvent(new WheelEvent('wheel', {deltaY: -100, bubbles: true, cancelable: true})); }")
            elif kind in ('drag', 'shiftdrag'):
                bb = pg.locator('#canvas-container canvas').bounding_box(); x, y = bb['x'] + 30, bb['y'] + 30
                if kind == 'shiftdrag': pg.keyboard.down('Shift')
                pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 40, y + 25, steps=4); pg.mouse.up()
                if kind == 'shiftdrag': pg.keyboard.up('Shift')
            elif kind == 'nodedrag':
                h = pg.locator('.node-el').first
                bb = h.bounding_box(timeout=3000)
                if bb:
                    pg.mouse.move(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2); pg.mouse.down(); pg.mouse.move(bb['x'] + 60, bb['y'] + 30, steps=4); pg.mouse.up()
            elif kind == 'resize':
                pg.set_viewport_size({'width': 1100, 'height': 800})
        except Exception as e:
            res.append(['ERR', str(st), str(e)[:200]]); continue
        pg.wait_for_timeout(120)
        snap = json.loads(pg.evaluate(SNAP))
        if tgt == 'xf-fit': snap['fit'] = pg.evaluate("() => document.getElementById('xf-fit').textContent")
        res.append([str(st), snap])
    json.dump({'steps': res, 'errors': errs}, open(out, 'w'), indent=0, sort_keys=True)
    print(len(res), 'steps; ERR steps:', [r for r in res if r[0] == 'ERR'][:5], 'page errors:', errs[:3])
    b.close()
