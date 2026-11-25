"""Animation frames, deterministic: requestAnimationFrame is queued and run by
hand on a fake clock (performance.now advances only by the step), Math.random
is fixed. Plays one scenario per animation effect and hashes the canvas every
few frames, then pauses and hashes the paused PNG, strokes SVG and cut input.

    python3 tests/frames.py FILE OUT.json

Compare two results with the snippet in README.md (all keys must match after a
refactor).
"""
import sys, json, hashlib
from playwright.sync_api import sync_playwright

INIT = """
(() => {
  let s = 12345; Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  let clock = 1000; performance.now = () => clock;
  window.__clock = v => { clock = v; };
  window.__raf = [];
  window.requestAnimationFrame = f => { window.__raf.push(f); return window.__raf.length; };
  window.cancelAnimationFrame = () => {};
})();
"""

BASE = ("S.nodes=[{x:-160,y:-60},{x:140,y:-90},{x:20,y:150},{x:-40,y:-10},{x:190,y:110}];"
        "S.seed=4242; S.sigma=60; S.density=6; S.layer={mode:'none',density:5,weight:0.8,strength:100};"
        "S.sym={n:1,mirror:false};")
OFF = "Object.keys(ANIM.opts).forEach(k => { if (ANIM.opts[k] === true) ANIM.opts[k] = false; });"

SCEN = {
    'vine-seasons': "S.mode='vine'; S.sym={n:6,mirror:true}; Object.assign(ANIM.opts,{draw:true,bloom:true,seasons:true,petals:true,wind:true,ptRate:3,ssSpd:4});",
    'vine-l2-bloom': "S.mode='nebula'; S.layer={mode:'vine',density:5,weight:0.8,strength:60}; S.palette={mode:'duotone',ink:'#203040',paper:'#f0e8d8',glow:'#ff8800',preset:'custom',l2:{ink:'#225522',glow:'#aaff66'}}; Object.assign(ANIM.opts,{drift:true,bloom:true});",
    'spider-dew': "S.mode='spiderweb'; S.dew=60; Object.assign(ANIM.opts,{dewroll:true,wind:true,dewSpd:3});",
    'arcane-swap': "S.mode='arcane'; S.sym={n:4,mirror:false}; Object.assign(ANIM.opts,{drift:true,glyphP:1.2,rings:true});",
    'chaos-pillar': "S.mode='chaosgate'; S.chaos={style:'mixed',frames:true,links:true}; Object.assign(ANIM.opts,{drift:true,glyphP:1.5});",
    'pcb-pcb': "S.mode='pcb'; S.layer={mode:'pcb',density:6,weight:0.6,strength:60}; Object.assign(ANIM.opts,{drift:true,current:true,draw:true});",
    'micro-blink': "S.mode='foam'; S.layer={mode:'microscope',density:5,weight:0.8,strength:60}; S.palette={mode:'duotone',ink:'#102030',paper:'#ffffff',glow:'#ff0000',preset:'custom',l2:{ink:'#0000aa',glow:'#00aaff'}}; Object.assign(ANIM.opts,{blink:true,life:true,breathe:true}); ANIM.gaze={x:60,y:-40};",
    'glass-sun': "S.mode='glass'; S.sym={n:6,mirror:true}; S.layer={mode:'nebula',density:4,weight:0.8,strength:70}; Object.assign(ANIM.opts,{sun:true,drift:true,flow:true,sunSpd:3});",
    'sky': "S.mode='constellation'; S.layer={mode:'lightning',density:5,weight:0.8,strength:80}; Object.assign(ANIM.opts,{twinkle:true,strikes:true,current:true,skRate:4,shoot:3});",
}

# Extra scenarios (frames.py FILE OUT.json extra): Cathedral Glass, Vines and Microscope in
# more depth, run on the old and the new file to compare (no reference file)
SCEN_EXTRA = {
    'tiffany-sun-draw': "S.mode='glass'; S.glass={style:'tiffany',set:'sea',light:true}; Object.assign(ANIM.opts,{sun:true,draw:true,drift:true,sunSpd:2});",
    'rose-sun': "S.mode='glass'; S.glass={style:'rose',set:'amber',light:true}; S.boundary={shape:'hexagon',size:300,border:'single'}; Object.assign(ANIM.opts,{sun:true,spin:true,sunSpd:4});",
    'mosaic-l2': "S.mode='arcane'; S.layer={mode:'glass',density:5,weight:0.8,strength:70}; Object.assign(ANIM.opts,{sun:true,drift:true,rings:true});",
    'vine-spring': "S.mode='vine'; S.vine={leaves:150,flowers:90,leaf:'mixed',bloom:'mixed',tendrils:true,veins:true,season:'spring'}; Object.assign(ANIM.opts,{seasons:true,petals:true,ssSpd:6,ptRate:4});",
    'vine-autumn': "S.mode='vine'; S.vine={leaves:100,flowers:60,leaf:'ivy',bloom:'daisy',tendrils:true,veins:true,season:'autumn'}; Object.assign(ANIM.opts,{seasons:true,wind:true,draw:true,ssSpd:6});",
    'vine-winter': "S.mode='vine'; S.vine={leaves:100,flowers:60,leaf:'round',bloom:'rose',tendrils:false,veins:false,season:'winter'}; S.sym={n:4,mirror:false}; Object.assign(ANIM.opts,{seasons:true,bloom:true,ssSpd:8});",
    'vine-grow': "S.mode='vine'; Object.assign(ANIM.opts,{draw:true,bloom:true,petals:true,wind:true,ptRate:5});",
    'vine-morph': "S.mode='vine'; Object.assign(ANIM.opts,{morph:true,drift:true,bloom:true});",
    'micro-life-sym': "S.mode='microscope'; S.sym={n:6,mirror:true}; S.micro={veins:true,orgs:100,cilia:'on',detail:true}; Object.assign(ANIM.opts,{life:true,blink:true,drift:true}); ANIM.gaze={x:-50,y:30};",
    'micro-hex-draw': "S.mode='microscope'; S.boundary={shape:'hexagon',size:300,border:'single'}; S.sigma=90; Object.assign(ANIM.opts,{draw:true,blink:true,life:true,lfSpd:3});",
    'blood-life-blink': "S.mode='microscope'; S.micro={specimen:'blood',veins:true,orgs:100,cilia:'auto',detail:true}; Object.assign(ANIM.opts,{life:true,blink:true}); ANIM.gaze={x:-50,y:30};",   # Phase 44
    'hyphae-life-blink': "S.mode='microscope'; S.micro={specimen:'hyphae',veins:true,orgs:100,cilia:'auto',detail:true}; Object.assign(ANIM.opts,{life:true,blink:true}); ANIM.gaze={x:-50,y:30};",
    'hyphae-sym-draw': "S.mode='microscope'; S.micro={specimen:'hyphae',veins:true,orgs:100,cilia:'auto',detail:true}; S.sym={n:6,mirror:true}; S.boundary={shape:'hexagon',size:300,border:'single'}; Object.assign(ANIM.opts,{draw:true,life:true,blink:true,drift:true,lfSpd:3});",
    'micro-plain': "S.mode='microscope'; S.micro={veins:false,orgs:180,cilia:'off',detail:false}; Object.assign(ANIM.opts,{life:true,spin:true,hue:true});",
    # Phase 51: per-layer effects (ANIM.opts2 holds Layer 2's own values). Each pair differs only in who has the effect
    'scope-l1': "S.mode='pcb'; S.layer={mode:'nebula',density:4,weight:0.8,strength:70}; Object.assign(ANIM.opts,{drift:false,draw:false,current:true,twinkle:false}); Object.assign(ANIM.opts2,{current:false,twinkle:true});",
    'scope-both': "S.mode='pcb'; S.layer={mode:'nebula',density:4,weight:0.8,strength:70}; Object.assign(ANIM.opts,{drift:false,draw:false,current:true,twinkle:true});",
    'scope-none': "S.mode='pcb'; S.layer={mode:'nebula',density:4,weight:0.8,strength:70}; Object.assign(ANIM.opts,{drift:false,draw:false,current:false,twinkle:false});",
    'scope-l2-speed': "S.mode='constellation'; S.layer={mode:'constellation',density:5,weight:0.8,strength:70}; S.seed=777; Object.assign(ANIM.opts,{drift:false,draw:false,twinkle:true,twRate:1}); Object.assign(ANIM.opts2,{twRate:3});",
}
if len(sys.argv) > 3 and sys.argv[3] == 'extra': SCEN = SCEN_EXTRA

JS_FRAME = """(t) => { window.__clock(t); const q = window.__raf.splice(0); q.forEach(f => f(t)); }"""
JS_SHOT = """() => document.querySelector('#canvas-container canvas').toDataURL()"""
JS_EXPORTS = """() => {
  const L = exportLayout(400);
  const png = renderRaster(L, makeColorMap(S.palette)).toDataURL();
  const svg = new C2S(L.W, L.H, L.cmW * 10, L.cmH * 10);
  renderTo(svg, L.W, L.H, L.view, { map: makeColorMap(S.palette), plain: true });
  const cut = renderRaster(L, STENCIL_MAP, { plain: true }).toDataURL();
  return [png, svg.getSvg(), cut];
}"""

md5 = lambda s: hashlib.md5(s.encode()).hexdigest()
out, errs = {}, []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1000, 'height': 760})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script(INIT)
    pg.goto('file://' + sys.argv[1]); pg.wait_for_timeout(600)
    t = 2000
    for name, setup in SCEN.items():
        pg.evaluate("() => { setPlaying(false, false); %s %s %s update(); }" % (OFF, BASE, setup))
        for _ in range(3):
            t += 16; pg.evaluate(JS_FRAME, t)
        pg.wait_for_timeout(300)
        pg.evaluate("() => setPlaying(true)")
        for i in range(60):
            t += 50; pg.evaluate(JS_FRAME, t)
            if i % 12 == 11: out[f'{name}/f{i}'] = md5(pg.evaluate(JS_SHOT))
        pg.evaluate("() => setPlaying(false)")
        for k, v in zip(['png', 'svg', 'cut'], pg.evaluate(JS_EXPORTS)): out[f'{name}/{k}'] = md5(v)
    b.close()
json.dump(out, open(sys.argv[2], 'w'), indent=0)
print(len(out), 'keys; errors:', errs[:3])
