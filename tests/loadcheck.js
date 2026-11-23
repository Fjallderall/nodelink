// loadcheck.js OUTDIR : for classic scripts loaded in order, find load-time code
// (top-level statements, IIFEs, and the bodies of functions they call, transitively)
// that references a top-level name declared in a LATER file.
const fs = require('fs'), path = require('path');
const espree = require(process.env.ESPREE || '/opt/node-tools/node_modules/espree');
const dir = process.argv[2];
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const files = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);

const declFile = {};   // name -> file index
const funcs = {};      // function name -> { node, fi }
const loadRoots = [];  // { node, fi }
files.forEach((f, fi) => {
  const ast = espree.parse(fs.readFileSync(path.join(dir, f), 'utf8'), { ecmaVersion: 2022, sourceType: 'script', loc: true });
  for (const st of ast.body) {
    if (st.type === 'FunctionDeclaration') { declFile[st.id.name] = fi; funcs[st.id.name] = { node: st, fi }; continue; }
    if (st.type === 'VariableDeclaration') for (const d of st.declarations) collectPattern(d.id, nm => { declFile[nm] = fi; });
    if (st.type === 'ClassDeclaration') declFile[st.id.name] = fi;
    loadRoots.push({ node: st, fi });
  }
});
function collectPattern(p, cb) {
  if (!p) return;
  if (p.type === 'Identifier') cb(p.name);
  else if (p.type === 'ObjectPattern') p.properties.forEach(q => collectPattern(q.type === 'RestElement' ? q.argument : q.value, cb));
  else if (p.type === 'ArrayPattern') p.elements.forEach(e => collectPattern(e, cb));
  else if (p.type === 'AssignmentPattern') collectPattern(p.left, cb);
  else if (p.type === 'RestElement') collectPattern(p.argument, cb);
}
const isFn = t => t === 'FunctionExpression' || t === 'ArrowFunctionExpression' || t === 'FunctionDeclaration';
// Walk node; collect identifier refs, not descending into deferred function bodies
function refs(node, out, top) {
  if (!node || typeof node.type !== 'string') return;
  if (!top && isFn(node.type)) return; // deferred
  if (node.type === 'CallExpression' && isFn(node.callee.type)) { refs(node.callee.body, out, true); node.arguments.forEach(a => refs(a, out)); return; } // IIFE
  if (node.type === 'Identifier') { out.push(node); return; }
  if ((node.type === 'CallExpression' || node.type === 'NewExpression') && node.callee.type === 'Identifier') { node.callee._call = true; }
  if (node.type === 'MemberExpression') { refs(node.object, out); if (node.computed) refs(node.property, out); return; }
  if (node.type === 'Property' || node.type === 'PropertyDefinition' || node.type === 'MethodDefinition') {
    if (node.computed) refs(node.key, out);
    if (node.type === 'MethodDefinition') return;
    if (node.type === 'PropertyDefinition' && !node.static) return;
    refs(node.value, out); return;
  }
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'range' || k === 'parent') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach(x => x && typeof x.type === 'string' && refs(x, out));
    else if (v && typeof v.type === 'string') refs(v, out);
  }
}
const problems = new Set(), seen = new Set();
const queue = loadRoots.map(r => ({ node: r.node, fi: r.fi, via: files[r.fi] + ':' + r.node.loc.start.line, top: false }));
while (queue.length) {
  const { node, fi, via, top } = queue.shift();
  const out = []; refs(node, out, top);
  for (const id of out) {
    const df = declFile[id.name];
    if (df !== undefined && df > fi) problems.add(`${via} -> ${id.name} (declared in ${files[df]}, line ${id.loc.start.line})`);
    if (id._call && funcs[id.name] && !seen.has(id.name)) { seen.add(id.name); queue.push({ node: funcs[id.name].node.body, fi, via: via + ' > ' + id.name, top: true }); }
  }
}
console.log(files.length, 'files,', Object.keys(declFile).length, 'top-level names;', problems.size, 'load-order problems');
for (const p of problems) console.log('  ' + p);
