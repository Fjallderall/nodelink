#!/bin/bash
# lint.sh file.html : ESLint on the main script, line numbers match the HTML
python3 - "$1" <<'PY'
import sys,re
s=open(sys.argv[1]).read()
m=list(re.finditer(r'<script>(.*?)</script>', s, re.S))
m=max(m,key=lambda x:len(x.group(1)))
pre=s[:m.start(1)].count('\n')
open('/tmp/lint.js','w').write('\n'*pre+m.group(1))
PY
cat > /tmp/eslint.config.mjs <<'CFG'
export default [{ files: ["lint.js"], languageOptions: { ecmaVersion: 2022, sourceType: "script" },
  rules: { "no-unused-vars": "warn", "no-unreachable": "warn", "no-undef": "error", "no-redeclare": "error" } }];
CFG
cd /tmp && eslint -c /tmp/eslint.config.mjs lint.js
