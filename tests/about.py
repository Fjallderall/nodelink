import sys
from playwright.sync_api import sync_playwright
f = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for vp, mob in [({'width': 1300, 'height': 900}, False), ({'width': 390, 'height': 844}, True)]:
        ctx = b.new_context(viewport=vp, has_touch=mob, is_mobile=mob); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('file://' + f); pg.wait_for_timeout(600)
        vis = pg.evaluate("() => [...document.querySelectorAll('[data-about]')].map(b => b.offsetParent !== null)")
        if not mob: pg.click('h1 .about-btn')
        else:
            pg.evaluate("() => document.querySelector('.tabs .tab[data-tab=\"library\"]').click()"); pg.wait_for_timeout(200)
            pg.click('.about-link')
        pg.wait_for_timeout(200)
        seed0 = pg.evaluate("() => S.seed"); opened = pg.evaluate("() => document.getElementById('about').open")
        pg.keyboard.press('r'); pg.keyboard.press('Control+z'); pg.wait_for_timeout(100)
        seed1 = pg.evaluate("() => S.seed")
        pg.screenshot(path='/home/claude/tests/about_%s.png' % ('phone' if mob else 'desk'))
        ver = pg.evaluate("() => document.getElementById('about-version').textContent")
        pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
        closed = not pg.evaluate("() => document.getElementById('about').open")
        if not mob:
            pg.click('h1 .about-btn'); pg.wait_for_timeout(100); pg.mouse.click(5, 5); pg.wait_for_timeout(100)
            bd = not pg.evaluate("() => document.getElementById('about').open")
            pg.click('h1 .about-btn'); pg.click('#about-close'); x = not pg.evaluate("() => document.getElementById('about').open")
        else: bd = x = None
        print('phone' if mob else 'desk', 'entry visible', vis, 'opened', opened, 'keys blocked', seed0 == seed1, 'version', ver, 'esc closes', closed, 'backdrop', bd, 'x', x, 'errors', errs)
        ctx.close()
    b.close()
