// ── FIRST VISIT AND HELP ───────────────────────────────────────────────────
// First visit (no autosave yet): the canvas starts empty with "Hit Randomise"
// and an arrow to the Randomise button (body.empty-start). The first design
// change of any kind (Randomise, a control, Load .json) ends it, through
// commit() → endEmptyStart().
// Second step: when that first change is the Randomise button, a note
// points at Animate (startAnimHint). It goes when Animate is pressed
// (setPlaying), the note is clicked or Esc is pressed; never shown again
// after a reload (the design is saved by then).
// Help (the ? button, or the ? key): while on, pointing at any control shows
// what it does next to the pointer (its title). On touch a first tap shows
// the help and a second tap on the same control uses it (a slider holds
// still on the first tap). ? again, Esc or a
// reload turns help off. Not saved.
// A control and its label share one help text (linkLabelHelp), so pointing
// at either explains it; the native tooltip shows on both too.
// Used by: INIT (initHelp), commit (endEmptyStart), the keydown handler.
const HELP = { on: false, el: null, tapped: null, block: false, hold: null };
const helpEl = id => document.getElementById(id);

function initHelp(firstVisit) {
  linkLabelHelp();
  helpEl('help-btn').addEventListener('click', () => setHelp(!HELP.on));
  document.addEventListener('pointerover', helpOver, true);
  document.addEventListener('pointermove', helpMove, true);
  document.addEventListener('pointerdown', helpTap, true);
  document.addEventListener('click', helpClick, true);
  document.addEventListener('input', helpHold, true);
  document.addEventListener('change', helpHold, true);
  if (firstVisit) {
    document.body.classList.add('empty-start');
    pointAtRandomise();
    window.addEventListener('resize', pointAtRandomise);
  }
}

// The arrow from the hint to the Randomise button (redrawn on resize). It
// ends just below, beside or at a lower corner of the button, whichever is
// nearest below the middle without the curve or its head crossing another
// toolbar control (on narrow phones the rows stack, so straight up can run
// through Export or Animate). Nothing clear: straight up, as before.
const ARROW_GAP = 9, ARROW_CLEAR = 3, ARROW_HEAD = 11, ARROW_BEND = 28;
function pointAtRandomise() {
  const svg = helpEl('empty-arrow'), box = helpEl('empty-hint').getBoundingClientRect(), btn = helpEl('tb-randomize').getBoundingClientRect();
  if (!document.body.classList.contains('empty-start') || !box.width || !btn.width) return;
  const k = ARROW_CLEAR, walls = [...document.querySelectorAll('.toolbar button, .toolbar select, .toolbar input')]
    .filter(el => el.id !== 'tb-randomize').map(el => el.getBoundingClientRect()).filter(r => r.width && r.height);
  const hits = (x, y) => walls.some(r => x > r.left - k && x < r.right + k && y > r.top - k && y < r.bottom + k);
  const cx = btn.left + btn.width / 2, sy = box.top - 8;
  const best = arrowTips(btn).map(t => {
    const sx = Math.max(box.left + 16, Math.min(box.right - 16, t.x));
    const c2 = { x: t.x - t.dx * ARROW_BEND, y: t.y - t.dy * ARROW_BEND }, c1 = { x: sx, y: (sy + c2.y) / 2 };
    const pts = arrowCurve({ x: sx, y: sy }, c1, c2, t, 48).concat(arrowHead(t));
    return { t, sx, c1, c2, ok: t.y < sy - 20 && pts.every(p => !hits(p.x, p.y)), cost: Math.abs(t.x - cx) + t.side };
  }).filter(o => o.ok).sort((a, b) => a.cost - b.cost)[0];
  const t = best ? best.t : { x: cx, y: btn.bottom + 8, dx: 0, dy: -1 };
  const sx = best ? best.sx : Math.max(box.left + 16, Math.min(box.right - 16, cx));
  const c1 = best ? best.c1 : { x: sx, y: (sy + t.y) / 2 }, c2 = best ? best.c2 : c1;
  svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
  const head = arrowHead(t).filter((p, i) => i !== 1).map(p => `${p.x},${p.y}`);
  svg.querySelector('path').setAttribute('d', `M${sx},${sy} C${c1.x},${c1.y} ${c2.x},${c2.y} ${t.x},${t.y} M${head[0]} L${t.x},${t.y} L${head[1]}`);
}

// Candidate tips around the button, each with the direction it points in
// (dx, dy) and an extra cost for not coming from straight below
function arrowTips(btn) {
  const g = ARROW_GAP, d = g * Math.SQRT1_2, tips = [];
  for (let x = btn.left + 6; x <= btn.right - 6; x += 4) tips.push({ x, y: btn.bottom + g, dx: 0, dy: -1, side: 0 });
  for (let y = btn.top + 8; y <= btn.bottom - 4; y += 4) {
    tips.push({ x: btn.left - g, y, dx: 1, dy: 0, side: 30 }, { x: btn.right + g, y, dx: -1, dy: 0, side: 30 });
  }
  tips.push({ x: btn.left - d, y: btn.bottom + d, dx: Math.SQRT1_2, dy: -Math.SQRT1_2, side: 15 });
  tips.push({ x: btn.right + d, y: btn.bottom + d, dx: -Math.SQRT1_2, dy: -Math.SQRT1_2, side: 15 });
  return tips;
}
// Points along a cubic curve, to test it against the other controls
function arrowCurve(p0, p1, p2, p3, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, e = t * t * t;
    pts.push({ x: a * p0.x + b * p1.x + c * p2.x + e * p3.x, y: a * p0.y + b * p1.y + c * p2.y + e * p3.y });
  }
  return pts;
}
// The arrowhead's two barb ends with the tip between them
function arrowHead(t) {
  const a = Math.atan2(t.dy, t.dx), h = ARROW_HEAD;
  const [l, r] = [a - 0.45, a + 0.45].map(q => ({ x: t.x - h * Math.cos(q), y: t.y - h * Math.sin(q) }));
  return [l, t, r];
}

// label[for] ↔ its control: whichever has a title lends it to the other
function linkLabelHelp() {
  document.querySelectorAll('label[for]').forEach(lab => {
    const el = document.getElementById(lab.htmlFor);
    if (!el) return;
    if (el.title && !lab.title) lab.title = el.title;
    else if (lab.title && !el.title) el.title = lab.title;
  });
}

function startAnimHint() {
  const el = helpEl('anim-hint'), btn = helpEl('tb-anim');
  if (!el || !btn.getBoundingClientRect().width) return;          // no Animate button in view: nothing to point at
  el.classList.remove('hidden');
  document.body.classList.add('anim-hint');
  placeAnimHint();
  window.addEventListener('resize', placeAnimHint);
  window.addEventListener('keydown', animHintKey);
  el.addEventListener('click', endAnimHint);
}
// Below the Animate button (above it when there is no room), the caret on its centre
function placeAnimHint() {
  const el = helpEl('anim-hint'), btn = helpEl('tb-anim').getBoundingClientRect();
  if (el.classList.contains('hidden') || !btn.width) return;
  const w = el.offsetWidth, h = el.offsetHeight, below = btn.bottom + 12 + h < window.innerHeight - 8;
  const mid = btn.left + btn.width / 2, x = Math.max(8, Math.min(window.innerWidth - w - 8, mid - w / 2));
  el.style.left = x + 'px';
  el.style.top = (below ? btn.bottom + 12 : btn.top - 12 - h) + 'px';
  el.classList.toggle('above', !below);
  el.style.setProperty('--caret-x', (mid - x) + 'px');
}
function animHintKey(e) { if (e.key === 'Escape') endAnimHint(); }
function endAnimHint() {
  const el = helpEl('anim-hint');
  if (!el || el.classList.contains('hidden')) return;
  el.classList.add('hidden');
  document.body.classList.remove('anim-hint');
  window.removeEventListener('resize', placeAnimHint);
  window.removeEventListener('keydown', animHintKey);
  el.removeEventListener('click', endAnimHint);
}

function endEmptyStart() {
  if (!document.body.classList.contains('empty-start')) return;
  document.body.classList.remove('empty-start');
  window.removeEventListener('resize', pointAtRandomise);
}

function setHelp(on) {
  HELP.on = on;
  document.body.classList.toggle('help-on', on);
  helpEl('help-btn').setAttribute('aria-pressed', on);
  // Native tooltips would show over ours: park the titles while help is on
  document.querySelectorAll(on ? '[title]' : '[data-help]').forEach(el => {
    if (on) { el.dataset.help = el.title; el.removeAttribute('title'); }
    else { if (!el.title) el.title = el.dataset.help; delete el.dataset.help; }   // a title set meanwhile is newer
  });
  HELP.tapped = null; HELP.hold = null;
  showHelpTip(null);
}

// The control under the pointer that has help (null: none). A title added
// after help came on (a new favourite, a node) is parked here.
function helpTarget(t) {
  const el = t && t.closest ? t.closest('[data-help], [title]') : null;
  if (!el || el.id === 'help-btn') return null;
  if (el.title) { el.dataset.help = el.title; el.removeAttribute('title'); }
  return el;
}

function showHelpTip(el, x, y) {
  const tip = helpEl('help-tip');
  HELP.el = el;
  if (!el) { tip.hidden = true; return; }
  tip.textContent = el.dataset.help;
  tip.hidden = false;
  placeHelpTip(x, y);
}

// Beside the pointer (below right), flipped to stay on screen
function placeHelpTip(x, y) {
  const tip = helpEl('help-tip'), w = tip.offsetWidth, h = tip.offsetHeight, m = 8;
  let l = x + 16, t = y + 20;
  if (l + w > window.innerWidth - m) l = Math.max(m, x - 12 - w);
  if (t + h > window.innerHeight - m) t = Math.max(m, y - 12 - h);
  tip.style.left = l + 'px'; tip.style.top = t + 'px';
}

function helpOver(e) {
  if (!HELP.on || e.pointerType === 'touch') return;
  const el = helpTarget(e.target);
  if (el !== HELP.el) showHelpTip(el, e.clientX, e.clientY);
}
function helpMove(e) {
  if (HELP.on && HELP.el && e.pointerType !== 'touch') placeHelpTip(e.clientX, e.clientY);
}
// Touch: the first tap on a control shows its help, a second tap uses it
function helpTap(e) {
  if (!HELP.on || e.pointerType !== 'touch') return;
  const el = helpTarget(e.target);
  HELP.block = !!el && el !== HELP.tapped;
  HELP.tapped = el;
  const r = e.target.closest && e.target.closest('input[type=range]');
  HELP.hold = HELP.block && r ? { el: r, v: r.value } : null;
  showHelpTip(el, e.clientX, e.clientY);
}
// A slider moves on the touch itself, not on the click: during a first tap
// its value is put back and the app never hears of the change
function helpHold(e) {
  if (!HELP.hold || e.target !== HELP.hold.el) return;
  e.target.value = HELP.hold.v;
  e.stopImmediatePropagation();
}
function helpClick(e) {
  if (!HELP.on || !HELP.block) return;
  HELP.block = false;
  e.preventDefault(); e.stopPropagation();
}
