"""Loop video (Export → Video): renders a short loop in Chrome, saves the MP4
and checks it with ffprobe / ffmpeg: frame count, size, duration, and that the
seam (last frame → first) changes no more than an ordinary step between frames.

    python3 tests/loop.py FILE OUTDIR [scenario …]

Needs ffmpeg and ffprobe on the PATH. Prints one line per scenario.
"""
import sys, json, base64, subprocess, os
import numpy as np
from playwright.sync_api import sync_playwright

BASE = ("S.nodes=[{x:-160,y:-60},{x:140,y:-90},{x:20,y:150},{x:-40,y:-10},{x:190,y:110}];"
        "S.seed=4242; S.sigma=60; S.density=6; S.layer={mode:'none',density:5,weight:0.8,strength:100};"
        "S.sym={n:1,mirror:false};")
OFF = "Object.keys(ANIM.opts).forEach(k => { if (ANIM.opts[k] === true) ANIM.opts[k] = false; });"
SCEN = {
    'sky': "S.mode='constellation'; Object.assign(ANIM.opts,{twinkle:true,drift:true,current:true,draw:true,shoot:3});",
    'vine': "S.mode='vine'; S.sym={n:6,mirror:true}; Object.assign(ANIM.opts,{draw:true,bloom:true,seasons:true,petals:true,wind:true,ssSpd:4});",
    'pcb-hue': "S.mode='pcb'; Object.assign(ANIM.opts,{drift:true,current:true,hue:true,spin:true});",
    'spin6': "S.mode='arcane'; S.sym={n:6,mirror:false}; Object.assign(ANIM.opts,{spin:true,hue:true,rings:true});",
    'glass-sun': "S.mode='glass'; Object.assign(ANIM.opts,{sun:true,flow:true,drift:true,sunSpd:2});",
    # Pure black background (Phase 29): lead and other background-coloured masks go black too
    'glass-black': "S.mode='glass'; E.loopBg='black'; Object.assign(ANIM.opts,{sun:true,drift:true,hue:true});",
    'micro-black': "S.mode='microscope'; E.loopBg='black'; Object.assign(ANIM.opts,{life:true,blink:true});",
    # Page shape (Phase 47): the video takes the page's aspect ratio (A4 portrait, square, wide)
    'page-a4': "S.mode='constellation'; S.page={preset:'a4',unit:'mm',w:210,h:297,bleed:0,clip:true}; Object.assign(ANIM.opts,{twinkle:true,drift:true});",
    'page-tarot-bleed': "S.mode='pcb'; S.page={preset:'tarot',unit:'mm',w:70,h:120,bleed:3,clip:true}; Object.assign(ANIM.opts,{drift:true,current:true});",
    # Ripples (Phase 41): Steady nudged to whole rings, so the seam has no jump even before the crossfade
    'water-ripples': "S.mode='water'; S.water={meet:'wave',spacing:24,drops:0}; Object.assign(ANIM.opts,{ripples:true,rpSpd:1.3});",
}
SECS = {'spin6': 15}   # Spin nudged to 1/6 turn (−17%), Colour cycle exactly one turn
JS_RUN = """async ([secs, fps, size]) => {
  E.fmt = 'video'; E.loopS = secs; E.loopFps = fps; E.loopSize = size;
  let got = null;
  window.download = async (blob, name) => { got = { name, b64: await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result.split(',')[1]); f.readAsDataURL(blob); }) }; return true; };
  const t0 = performance.now();
  await exportLoopVideo();
  return { got, ms: performance.now() - t0, status: document.getElementById('status').textContent,
    playing: ANIM.playing, frozen: ANIM.frozen, clock: ANIM.clock };
}"""

def frames(path, w, h):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'scale={w}:{h}', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.int16)

def main():
    f, outdir = sys.argv[1], sys.argv[2]
    names = sys.argv[3:] or list(SCEN)
    os.makedirs(outdir, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for name in names:
            pg = b.new_page(viewport={'width': 1000, 'height': 760})
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto('file://' + f); pg.wait_for_timeout(500)
            pg.evaluate("() => {" + BASE + OFF + SCEN[name] + "update(); setPlaying(true);}")
            pg.wait_for_timeout(400)
            r = pg.evaluate(JS_RUN, [SECS.get(name, 5), 30, '1080'])
            if not r['got']:
                print(name, 'NO FILE', r['status'], errs); continue
            path = os.path.join(outdir, name + '.mp4')
            open(path, 'wb').write(base64.b64decode(r['got']['b64']))
            pr = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', path],
                                           capture_output=True, check=True).stdout)
            st = pr['streams'][0]
            fr = frames(path, 480, 270)
            d = np.abs(np.diff(fr, axis=0)).mean(axis=(1, 2))
            seam = np.abs(fr[0] - fr[-1]).mean()
            x0 = len(fr) - 30                    # where the crossfade starts (1 s at 30 fps)
            xf = d[x0 - 1:].max()
            # Background level (0–255 full range): the darkest 10% of pixels, and how many are true black
            full = frames(path, 480, 270)[::15]
            dark = f"bg p10={np.percentile(full, 10):.0f} black={(full <= 1).mean()*100:.0f}%"
            print(f"{name}: {st['codec_name']} {st['width']}x{st['height']} frames={st['nb_read_frames']} dur={float(pr['format']['duration']):.3f}s "
                  f"size={os.path.getsize(path)/1e6:.1f}MB render={r['ms']/1000:.1f}s | step median={np.median(d):.2f} max={d.max():.2f} seam={seam:.2f} xfade max={xf:.2f} {dark} "
                  f"| after: playing={r['playing']} clock={r['clock']} errors={errs}")
        b.close()

main()
