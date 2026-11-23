#!/bin/bash
# lint.sh index.html : ESLint on all scripts, concatenated in load order (as the
# browser shares one global scope between them). Reports file:line per problem.
# Also works on a single-file NodeLink (inline <script>).
python3 - "$1" <<'PY'
import sys, re, os, json
html = sys.argv[1]; base = os.path.dirname(os.path.abspath(html))
s = open(html, encoding='utf-8').read()
srcs = re.findall(r'<script src="([^"]+)"></script>', s)
parts = []  # (name, text)
if srcs:
    for f in srcs: parts.append((f, open(os.path.join(base, f), encoding='utf-8').read()))
else:
    m = max(re.finditer(r'<script>(.*?)</script>', s, re.S), key=lambda x: len(x.group(1)))
    parts.append((os.path.basename(html), '\n' * s[:m.start(1)].count('\n') + m.group(1)))
out, cmap, line = [], [], 1
for name, text in parts:
    if not text.endswith('\n'): text += '\n'
    n = text.count('\n'); cmap.append((line, name, n)); line += n; out.append(text)
open('/tmp/lint.js', 'w').write(''.join(out))
json.dump(cmap, open('/tmp/lint.map', 'w'))
PY
cat > /tmp/eslint.config.mjs <<'CFG'
const browser = { window: "readonly", document: "readonly", localStorage: "readonly", performance: "readonly", setTimeout: "readonly", clearTimeout: "readonly", requestAnimationFrame: "readonly", cancelAnimationFrame: "readonly", console: "readonly", Blob: "readonly", URL: "readonly", Worker: "readonly", DOMPoint: "readonly", DOMMatrix: "readonly", Path2D: "readonly", ResizeObserver: "readonly", matchMedia: "readonly", getComputedStyle: "readonly", postMessage: "readonly", onmessage: "readonly" };
export default [{ files: ["lint.js"], languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: browser },
  rules: { "no-unused-vars": "warn", "no-unreachable": "warn", "no-undef": "error", "no-redeclare": "error" } }];
CFG
cd /tmp && eslint -c /tmp/eslint.config.mjs -f json lint.js | python3 -c "
import sys, json
cmap = json.load(open('/tmp/lint.map'))
res = json.load(sys.stdin)
n_err = n_warn = 0
for r in res:
    for m in r['messages']:
        ln = m.get('line', 0); where = 'lint.js:%d' % ln
        for start, name, cnt in cmap:
            if start <= ln < start + cnt: where = '%s:%d' % (name, ln - start + 1); break
        kind = 'error' if m['severity'] == 2 else 'warning'
        n_err += kind == 'error'; n_warn += kind == 'warning'
        print('%s:%d: %s %s (%s)' % (where, m.get('column', 0), kind, m['message'], m.get('ruleId')))
print('%d problems (%d errors, %d warnings)' % (n_err + n_warn, n_err, n_warn))
"
