// ── FIRST VISIT AND HELP ───────────────────────────────────────────────────
// First visit (no autosave yet): the canvas starts empty with "Hit Randomise"
// and an arrow to the Randomise button (body.empty-start). The first design
// change of any kind (Randomise, a control, Load .json) ends it, through
// commit() → endEmptyStart().
// Help (the ? button, or the ? key): while on, pointing at any control shows
// what it does next to the pointer (its title). On touch a first tap shows
// the help and a second tap on the same control uses it. ? again, Esc or a
// reload turns help off. Not saved.
// Used by: INIT (initHelp), commit (endEmptyStart), the keydown handler.
const HELP = { on: false, el: null, tapped: null, block: false };
const helpEl = id => document.getElementById(id);

function initHelp(firstVisit) {
  helpEl('help-btn').addEventListener('click', () => setHelp(!HELP.on));
  document.addEventListener('pointerover', helpOver, true);
  document.addEventListener('pointermove', helpMove, true);
  document.addEventListener('pointerdown', helpTap, true);
  document.addEventListener('click', helpClick, true);
  if (firstVisit) {
    document.body.classList.add('empty-start');
    pointAtRandomise();
    window.addEventListener('resize', pointAtRandomise);
  }
}

// The arrow from the hint to the Randomise button (redrawn on resize)
function pointAtRandomise() {
  const svg = helpEl('empty-arrow'), box = helpEl('empty-hint').getBoundingClientRect(), btn = helpEl('tb-randomize').getBoundingClientRect();
  if (!document.body.classList.contains('empty-start') || !box.width || !btn.width) return;
  const bx = btn.left + btn.width / 2, by = btn.bottom + 8;
  const sx = Math.max(box.left + 16, Math.min(box.right - 16, bx)), sy = box.top - 8;
  const mx = (sx + bx) / 2 + (bx > sx ? -1 : 1) * Math.min(60, Math.abs(bx - sx) / 3), my = (sy + by) / 2;
  svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
  const a = Math.atan2(by - my, bx - mx), h = 11;
  const head = [a - 0.45, a + 0.45].map(t => `${bx - h * Math.cos(t)},${by - h * Math.sin(t)}`);
  svg.querySelector('path').setAttribute('d', `M${sx},${sy} Q${mx},${my} ${bx},${by} M${head[0]} L${bx},${by} L${head[1]}`);
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
    else { el.title = el.dataset.help; delete el.dataset.help; }
  });
  HELP.tapped = null;
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
  showHelpTip(el, e.clientX, e.clientY);
}
function helpClick(e) {
  if (!HELP.on || !HELP.block) return;
  HELP.block = false;
  e.preventDefault(); e.stopPropagation();
}
