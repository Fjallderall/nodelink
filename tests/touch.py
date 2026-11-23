import sys
from playwright.sync_api import sync_playwright
JS = r"""async () => {
  const cc = document.getElementById('canvas-container'), cv = cc.querySelector('canvas'), r = cv.getBoundingClientRect();
  const T = (x, y, id) => new Touch({ identifier: id, target: cv, clientX: r.left + x, clientY: r.top + y });
  const fire = (el, type, ts) => el.dispatchEvent(new TouchEvent(type, { touches: ts, changedTouches: ts, bubbles: true, cancelable: true }));
  const out = [];
  fire(cv, 'touchstart', [T(40, 40, 1)]); fire(window, 'touchmove', [T(90, 70, 1)]); fire(window, 'touchend', []);
  await new Promise(r => setTimeout(r, 50)); out.push([S.pan.x, S.pan.y, S.zoom]);
  fire(cv, 'touchstart', [T(100, 100, 1), T(200, 100, 2)]); fire(window, 'touchmove', [T(80, 100, 1), T(260, 100, 2)]); fire(window, 'touchend', []);
  await new Promise(r => setTimeout(r, 50)); out.push([S.pan.x, S.pan.y, S.zoom]);
  document.getElementById('xf-move').click();
  fire(cv, 'touchstart', [T(40, 40, 1)]); fire(window, 'touchmove', [T(70, 90, 1)]); fire(window, 'touchend', []);
  await new Promise(r => setTimeout(r, 50)); out.push([S.xf.x, S.xf.y, H.stack.length]);
  return JSON.stringify(out); }"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for f in sys.argv[1:]:
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('file://' + f); pg.wait_for_timeout(600)
        print(f.split('/')[-1], pg.evaluate(JS), errs)
        ctx.close()
    b.close()
