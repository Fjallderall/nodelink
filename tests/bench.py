import sys
from playwright.sync_api import sync_playwright
JS = r"""() => { const cv = document.createElement('canvas'); cv.width = 800; cv.height = 800; const c = cv.getContext('2d');
  const nodes = [{x:0,y:0},{x:160,y:-40},{x:-120,y:110},{x:60,y:170},{x:-150,y:-130}].map(n => ({...n, size: 1, w: 1}));
  S.pcb = {pour: 80, meander: true, silk: true};
  for (let i = 0; i < 3; i++) renderPCB(c, nodes, 8, 60, 1, 4242 + i);
  const t = performance.now(); for (let i = 0; i < 30; i++) renderPCB(c, nodes, 8, 60, 1, 1000 + i); return (performance.now() - t) / 30; }"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for f in sys.argv[1:]:
        pg = b.new_page(); pg.goto('file://' + f); pg.wait_for_timeout(500)
        print(f.split('/')[-1], ['%.1f ms' % pg.evaluate(JS) for _ in range(3)])
    b.close()
