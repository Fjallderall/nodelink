# NodeLink tests

Playwright (Python) with Chrome. Each script takes the HTML file to test as its first argument.

| Script | What it checks |
| --- | --- |
| `baseline.py FILE OUT.json` | Pixel baseline: every mode × boundary, symmetry, PCB in depth, Layer 2 combinations, strokes SVG. Hashes per render; compare with `reference/baseline-phase25.json` (all keys must match after a refactor). |
| `events.py FILE OUT.json` | Drives ~106 controls in order with a fixed Math.random and snapshots the design, export settings, view and history after each step. Compare with `reference/events-phase25.json`. |
| `frames.py FILE OUT.json` | Animation frames on a fake clock (rAF run by hand, fixed Math.random): one scenario per effect (Seasons, Bloom, dew, Symbol swap, PCB on PCB, Blink with a Layer 2 palette, Sunlight, Twinkle, Strikes), canvas hashes every 12 frames plus the paused PNG, strokes SVG and cut input. Compare with `reference/frames-phase26.json`. |
| `frames.py FILE OUT.json extra` | Eighteen more scenarios for Cathedral Glass (Tiffany, Rose windows, Mosaic as Layer 2, with Sunlight), Vines (each season start, Draw on, Morph, Wind, Petals) and Microscope (Life, Blink, Drift, Draw on; symmetry, a boundary, options off; Blood cells and Hyphae with Life and Blink, Phase 44; four per-layer scenarios, Phase 51: Current on Layer 1 only with Twinkle on Layer 2 only, both layers, neither, and a faster Twinkle on Layer 2; Phase 52: Draw on on Layer 1 only / Layer 2 only, Pulse on Layer 2 only, and both alike). The scenarios share one Math.random stream, so their order matters: the 'both alike' one runs before the per-layer ones to stay comparable with older files. No reference file: run on the old and the new file and compare. |
| `modes.py FILE OUT.json MODE…` | One mode's options in depth (glass, vine, spiderweb, lightning, constellation, arcane, microscope, nebula, stained, water so far); its last Microscope sets (Blood cells, Hyphae, Phase 43) have no old reference: every option set, then seeds, density, jitter, boundaries, symmetry, weight, node sizes, stencil, transform and Layer 2, with strokes SVG for some. Run on the old and the new file and compare; add an OPTS entry before refactoring another mode. |
| `loop.py FILE OUTDIR [scenario…]` | Loop video: renders 5 s loops (and a 15 s Spin + Colour cycle loop) through Export → Video, saves the MP4s and checks them with ffprobe / ffmpeg: codec, size, frame count, duration, and the seam step (last → first frame) against ordinary frame steps. Needs ffmpeg and numpy. |
| `touch.py FILE…` | Touch pan, pinch and move-design on a phone-sized screen; prints the results per file to compare. |
| `about.py FILE` | About dialog: entry points, Esc / × / backdrop, shortcuts blocked while open. |
| `anim.py FILE…` | Plays PCB setups with Draw on, Drift and Current; reports page errors. |
| `bench.py FILE…` | renderPCB timing. |
| `lint.sh FILE` | ESLint (no-undef, no-unused-vars, no-unreachable, no-redeclare) on all scripts, concatenated in load order; reports file:line. Phase 28: 0 errors, 15 unused-variable warnings (WebCodecs names added to the browser globals). |
| `loadcheck.js DIR` | Node + espree. Finds top-level code (and the functions it calls) that uses a name declared in a later script file, which would fail while loading. Must report 0. |

Compare two results:

```
python3 -c "import json,sys;a,b=(json.load(open(f)) for f in sys.argv[1:]);print([k for k in a if a[k]!=b.get(k)])" A.json B.json
```
