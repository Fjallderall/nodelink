# NodeLink tests

Playwright (Python) with Chrome. Each script takes the HTML file to test as its first argument.

| Script | What it checks |
| --- | --- |
| `baseline.py FILE OUT.json` | Pixel baseline: every mode × boundary, symmetry, PCB in depth, Layer 2 combinations, strokes SVG. Hashes per render; compare with `reference/baseline-phase25.json` (all keys must match after a refactor). |
| `events.py FILE OUT.json` | Drives ~106 controls in order with a fixed Math.random and snapshots the design, export settings, view and history after each step. Compare with `reference/events-phase25.json`. |
| `touch.py FILE…` | Touch pan, pinch and move-design on a phone-sized screen; prints the results per file to compare. |
| `about.py FILE` | About dialog: entry points, Esc / × / backdrop, shortcuts blocked while open. |
| `anim.py FILE…` | Plays PCB setups with Draw on, Drift and Current; reports page errors. |
| `bench.py FILE…` | renderPCB timing. |
| `lint.sh FILE` | ESLint (no-undef, no-unused-vars, no-unreachable) on the main script, line numbers matching the HTML. |

Compare two results:

```
python3 -c "import json,sys;a,b=(json.load(open(f)) for f in sys.argv[1:]);print([k for k in a if a[k]!=b.get(k)])" A.json B.json
```
