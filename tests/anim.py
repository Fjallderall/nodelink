import sys
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for f in sys.argv[1:]:
        pg = b.new_page(viewport={'width': 1200, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('file://' + f); pg.wait_for_timeout(500)
        r = []
        for setup in ["S.mode='pcb'; S.layer.mode='none'", "S.mode='pcb'; S.layer={mode:'pcb',density:6,weight:0.6,strength:60}", "S.mode='web'; S.layer={mode:'pcb',density:5,weight:0.8,strength:60}"]:
            pg.evaluate("() => { %s; S.sym={n:4,mirror:true}; Object.assign(ANIM.opts,{draw:true,drift:true,current:true}); update(); setPlaying(true); }" % setup)
            pg.wait_for_timeout(2500)
            r.append(pg.evaluate("() => { const f = document.getElementById('fps'); const t = f ? f.textContent : ''; setPlaying(false, false); return t; }"))
        print(f.split('/')[-1], r, 'errors:', errs[:3])
    b.close()
