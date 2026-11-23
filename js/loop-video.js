// ── LOOP VIDEO ─────────────────────────────────────────────────────────────
// Export → Video: records the animation as an MP4 that another device (a TV,
// projector or VJ software) plays on repeat with no visible seam.
// A screen recording would jump at the seam: the effects run on their own
// clocks (twinkle, strikes, drift, seasons, petals), so the last frame never
// matches the first. Instead:
//  1. Offline, on a fixed clock: animStep() is stepped 1000 / fps ms per
//     frame whatever the wall time, with ANIM.clock set, so every measured
//     cost is 0 and no slow-device fallback (keyframes, lower resolution)
//     starts. Rendering may be slower than real time; the video is not.
//  2. The seam is a crossfade. The animation runs LOOP_WARM s first (stepped,
//     not drawn), then N + Fn frames are drawn (N = length × fps, Fn =
//     LOOP_XFADE × fps). Frames 0 … Fn−1 are kept, Fn … N−1 go to the video
//     as they are, and frames N … N+Fn−1 get frame (k − N) faded in over them
//     (0 → 100%). So the video (N frames, starting at frame Fn) ends on frame
//     Fn−1, which is followed by frame Fn: its own first frame.
//  3. WebCodecs VideoEncoder with exact timestamps (MediaRecorder follows the
//     wall clock), H.264 in MP4 for TVs and VJ software; VP9 in MP4 where the
//     browser has no H.264 encoder (VLC and browsers play it, TVs may not).
//     The MP4 file is written by mp4File below (no libraries).
// Background: the design's own, or pure black for a projector (loopBlack).
// Settings live in E (loopS, loopFps, loopSize, loopBg) with the other export settings.
// Used by: the Export drawer (ui.js).
const LOOP_XFADE = 1;        // s: crossfade at the seam
const LOOP_WARM = 3;         // s: the animation runs this long (not drawn) before the first frame
const LOOP_KEY_S = 2;        // s between keyframes (where a player can jump in)
const LOOP_BPP = 0.2;        // bits per pixel per frame: fine lines on dark need a high rate
const LOOP_BR_MIN = 4e6, LOOP_BR_MAX = 80e6;
const LOOP_KEEP_MB = 600;    // the first Fn frames are kept as bitmaps up to this size, as PNG files above it
const LOOP_SIZES = { '1080': [1920, 1080], '2160': [3840, 2160] };
const LOOP_S_MIN = 5, LOOP_S_MAX = 60;
// Spin and Colour cycle are plain functions of time: when a whole number of
// turns (of the symmetry, for Spin) is within LOOP_NUDGE of what the loop
// holds, their pace is nudged to it while rendering, so the seam's crossfade
// joins two identical frames instead of two turned ones (a double image)
const LOOP_NUDGE = 0.25;
const LOOP = { busy: false, cancel: false };

// Saved settings come back unchecked (localStorage): clamp them
function loopSettings() {
  const s = Math.round(+E.loopS);
  return {
    secs: Number.isFinite(s) ? Math.max(LOOP_S_MIN, Math.min(LOOP_S_MAX, s)) : 10,
    fps: +E.loopFps === 60 ? 60 : 30,
    size: E.loopSize in LOOP_SIZES || E.loopSize === 'screen' ? E.loopSize : '1080',
    bg: E.loopBg === 'black' ? 'black' : 'design'
  };
}
// Pixel size: a fixed one, or this screen in device pixels (at most 4K's
// area and 4096 px a side, the most H.264 level 5.2 takes; even numbers)
function loopScreenSize() {
  const d = window.devicePixelRatio || 1;
  const w = screen.width * d, h = screen.height * d;
  const k = Math.min(1, Math.sqrt(3840 * 2160 / (w * h)), 4096 / Math.max(w, h));
  return [Math.round(w * k / 2) * 2, Math.round(h * k / 2) * 2];
}
function loopSize(size) { return size === 'screen' ? loopScreenSize() : LOOP_SIZES[size]; }
// What is on the canvas (the page if there is one), whole and centred in the
// video; the background fills the rest, as in Export PNG
function loopView(W, H) {
  const f = pageActive() ? pageRect(true) : currentViewFrame();
  const scale = Math.min(W / f.w, H / f.h);
  return { scale, tx: W / 2 - (f.x + f.w / 2) * scale, ty: H / 2 - (f.y + f.h / 2) * scale };
}

// Factor that makes amount a whole number (≥ 1) of periods, or 1 if that is too far off
function loopNudge(amount, period) {
  const k = Math.round(amount / period), f = k * period / amount;
  return k >= 1 && Math.abs(f - 1) <= LOOP_NUDGE ? f : 1;
}
// The first encoder this browser has for the size: H.264 High at the lowest
// level that fits (Main as a second try), else VP9. null: no video here.
async function loopCodec(W, H, fps) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
  const bitrate = Math.round(Math.min(LOOP_BR_MAX, Math.max(LOOP_BR_MIN, W * H * fps * LOOP_BPP)));
  const mbs = Math.ceil(W / 16) * Math.ceil(H / 16), rate = mbs * fps;
  // H.264 levels: [level_idc, max macroblocks per frame, per second]
  const lv = [[40, 8192, 245760], [42, 8704, 522240], [50, 22080, 589824], [51, 36864, 983040], [52, 36864, 2073600]]
    .find(l => mbs <= l[1] && rate <= l[2]);
  const hex = n => n.toString(16).toUpperCase().padStart(2, '0');
  const vp9Level = W * H <= 2048 * 1152 ? (fps > 30 ? '41' : '40') : (fps > 30 ? '52' : '51');
  const tries = [];
  if (lv) {
    tries.push({ kind: 'avc', codec: 'avc1.6400' + hex(lv[0]) });
    tries.push({ kind: 'avc', codec: 'avc1.4D00' + hex(lv[0]) });
  }
  tries.push({ kind: 'vp9', codec: `vp09.00.${vp9Level}.08`, level: +vp9Level });
  for (const t of tries) {
    const config = { codec: t.codec, width: W, height: H, bitrate, framerate: fps, latencyMode: 'quality' };
    if (t.kind === 'avc') config.avc = { format: 'avc' };
    try {
      const s = await VideoEncoder.isConfigSupported(config);
      if (s.supported) return { ...t, config };
    } catch { /* not this one */ }
  }
  return null;
}

// ── MP4 file ──
// One video track, one chunk: ftyp, moov (sample tables), mdat (the frames).
// moov comes first so players can start before reading the whole file.
const mp4Ascii = s => Uint8Array.from(s, ch => ch.charCodeAt(0));
function mp4U(bytes, ...vals) {
  const b = new Uint8Array(bytes * vals.length), dv = new DataView(b.buffer);
  vals.forEach((v, i) => { if (bytes === 4) dv.setUint32(i * 4, v >>> 0); else if (bytes === 2) dv.setUint16(i * 2, v & 0xffff); else dv.setUint8(i, v); });
  return b;
}
function mp4Box(type, ...parts) {
  const len = 8 + parts.reduce((a, p) => a + p.length, 0), b = new Uint8Array(len);
  new DataView(b.buffer).setUint32(0, len);
  b.set(mp4Ascii(type), 4);
  let o = 8;
  parts.forEach(p => { b.set(p, o); o += p.length; });
  return b;
}
// A full box: version (8 bits) and flags (24 bits) first
const mp4Full = (type, version, flags, ...parts) => mp4Box(type, mp4U(4, (version << 24 | flags) >>> 0), ...parts);
const MP4_MATRIX = mp4U(4, 0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000);
// V: { kind: 'avc' | 'vp9', level, W, H, fps, desc (avcC), chunks: [{ data, key }] }
function mp4Moov(V, offset) {
  const n = V.chunks.length, ts = V.fps * 1000, dur = n * 1000;
  const mvhd = mp4Full('mvhd', 0, 0, mp4U(4, 0, 0, ts, dur, 0x10000), mp4U(2, 0x100, 0), mp4U(4, 0, 0), MP4_MATRIX,
    mp4U(4, 0, 0, 0, 0, 0, 0, 2));
  const tkhd = mp4Full('tkhd', 0, 3, mp4U(4, 0, 0, 1, 0, dur, 0, 0), mp4U(2, 0, 0, 0, 0), MP4_MATRIX, mp4U(4, V.W * 65536, V.H * 65536));
  const mdhd = mp4Full('mdhd', 0, 0, mp4U(4, 0, 0, ts, dur), mp4U(2, 0x55c4, 0));   // language 'und'
  const hdlr = mp4Full('hdlr', 0, 0, mp4U(4, 0), mp4Ascii('vide'), mp4U(4, 0, 0, 0), mp4Ascii('VideoHandler\0'));
  const vmhd = mp4Full('vmhd', 0, 1, mp4U(2, 0, 0, 0, 0));
  const dinf = mp4Box('dinf', mp4Full('dref', 0, 0, mp4U(4, 1), mp4Full('url ', 0, 1)));
  // Codec setup: avcC as the encoder gave it; vpcC: profile 0, 8 bit, 4:2:0, BT.709, limited range
  const cfg = V.kind === 'avc' ? mp4Box('avcC', V.desc)
    : mp4Full('vpcC', 1, 0, mp4U(1, 0, V.level, (8 << 4) | (1 << 1) | 0, 1, 1, 1), mp4U(2, 0));
  const name = new Uint8Array(32);
  const entry = mp4Box(V.kind === 'avc' ? 'avc1' : 'vp09', new Uint8Array(6), mp4U(2, 1, 0, 0), mp4U(4, 0, 0, 0),
    mp4U(2, V.W, V.H), mp4U(4, 0x480000, 0x480000, 0), mp4U(2, 1), name, mp4U(2, 0x18, 0xffff), cfg);
  const keys = [];
  V.chunks.forEach((c, i) => { if (c.key) keys.push(i + 1); });
  const stbl = mp4Box('stbl',
    mp4Full('stsd', 0, 0, mp4U(4, 1), entry),
    mp4Full('stts', 0, 0, mp4U(4, 1, n, 1000)),
    mp4Full('stss', 0, 0, mp4U(4, keys.length, ...keys)),
    mp4Full('stsc', 0, 0, mp4U(4, 1, 1, n, 1)),
    mp4Full('stsz', 0, 0, mp4U(4, 0, n, ...V.chunks.map(c => c.data.length))),
    mp4Full('stco', 0, 0, mp4U(4, 1, offset)));
  const minf = mp4Box('minf', vmhd, dinf, stbl);
  return mp4Box('moov', mvhd, mp4Box('trak', tkhd, mp4Box('mdia', mdhd, hdlr, minf)));
}
function mp4File(V) {
  const ftyp = mp4Box('ftyp', mp4Ascii('isom'), mp4U(4, 512), mp4Ascii('isomiso2' + (V.kind === 'avc' ? 'avc1' : 'vp09') + 'mp41'));
  const data = V.chunks.reduce((a, c) => a + c.data.length, 0);
  if (data + 8 > 0xffffffff) throw new Error('the video is over 4 GB: try a shorter loop or a smaller size');
  const head = ftyp.length + mp4Moov(V, 0).length;   // moov's size doesn't depend on the offset
  const moov = mp4Moov(V, head + 8);
  return new Blob([ftyp, moov, mp4U(4, data + 8), mp4Ascii('mdat'), ...V.chunks.map(c => c.data)], { type: 'video/mp4' });
}

// ── Pure black background ──
// The colour the design's background is painted in (as Export PNG's
// transparent background works it out), and whether it is light
function loopBgColor() { return S.palette.mode === 'original' ? parseColor(modeBg(S.mode)) : parseColor(S.palette.paper); }
function loopBgLight() { const b = loopBgColor(); return 0.2126 * b.r + 0.7152 * b.g + 0.0722 * b.b > 128; }
// The background colour becomes true black: as colorToAlpha (Export PNG's
// transparent background) laid over black, in one pass, so antialiased
// edges and glows keep their shape and masks painted in the background
// colour (lead, gaps, lids) go black too. Per channel: v − b × (1 − a).
// Before the hue filter: Colour cycle leaves black black.
// An opaque pixel as one 32-bit number, in this machine's byte order
const LITTLE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const u32Of = (r, g, b) => LITTLE ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
const BLACK32 = u32Of(0, 0, 0);
function loopBlack(cv, bg) {
  if (!bg.r && !bg.g && !bg.b) return;                // already black
  const c = cv.getContext('2d'), img = c.getImageData(0, 0, cv.width, cv.height), d = img.data;
  const br = bg.r, bgg = bg.g, bb = bg.b;
  // Per channel, 255 / (255 − b) above the background, 1 / b below (0: that side can't happen)
  const ur = br < 255 ? 1 / (255 - br) : 0, ug = bgg < 255 ? 1 / (255 - bgg) : 0, ub = bb < 255 ? 1 / (255 - bb) : 0;
  const lr = br ? 1 / br : 0, lg = bgg ? 1 / bgg : 0, lb = bb ? 1 / bb : 0;
  // Plain background pixels (most of them) are one 32-bit compare
  const u32 = new Uint32Array(d.buffer, d.byteOffset, d.length >> 2), bg32 = u32Of(br, bgg, bb);
  for (let i = 0; i < d.length; i += 4) {
    if (u32[i >> 2] === bg32) { u32[i >> 2] = BLACK32; continue; }
    const r = d[i], g = d[i + 1], b = d[i + 2];
    let a = r > br ? (r - br) * ur : (br - r) * lr;
    const ag = g > bgg ? (g - bgg) * ug : (bgg - g) * lg; if (ag > a) a = ag;
    const ab = b > bb ? (b - bb) * ub : (bb - b) * lb; if (ab > a) a = ab;
    if (a <= 0.002) { d[i] = d[i + 1] = d[i + 2] = 0; continue; }
    const k = 1 - a;
    d[i] = r - br * k; d[i + 1] = g - bgg * k; d[i + 2] = b - bb * k;   // Uint8Clamped rounds and clamps
  }
  c.putImageData(img, 0, 0);
}

// ── Rendering ──
// The current animation frame (ANIM.frame) into out, Colour cycle baked in
function loopDraw(R) {
  const keepLive = ANIM.live, keepExp = ANIM.exporting;
  ANIM.live = true; ANIM.exporting = true;            // draw ANIM.frame, no screen blit cache
  try {
    const hue = ANIM.hueFilter;
    const target = hue ? R.work : R.out, c = target.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
    renderTo(c, R.W, R.H, R.view, { map: R.map });
    if (R.black) loopBlack(target, R.black);
    if (hue) { R.oc.filter = hue; R.oc.drawImage(R.work, 0, 0); R.oc.filter = 'none'; }
  } finally { ANIM.live = keepLive; ANIM.exporting = keepExp; }
}
const loopYield = () => new Promise(r => setTimeout(r, 0));
const loopBlob = cv => new Promise((ok, no) => cv.toBlob(b => b ? ok(b) : no(new Error('could not keep a frame')), 'image/png'));

function loopDialog(on) {
  const d = document.getElementById('loop-dlg');
  if (on && !d.open) d.showModal();
  if (!on && d.open) d.close();
}
function loopProgress(done, total, t0) {
  const $ = id => document.getElementById(id);
  $('loop-bar').value = done / total;
  const left = done > 4 ? (performance.now() - t0) / done * (total - done) / 1000 : null;
  $('loop-msg').textContent = `Frame ${done} of ${total}` +
    (left == null ? '' : left < 60 ? ` · about ${Math.max(1, Math.round(left))} s left` : ` · about ${Math.round(left / 60)} min left`);
}

async function exportLoopVideo() {
  if (LOOP.busy) return;
  if (!ANIM.playing && !ANIM.frozen) { setStatus('Press Animate first: a still design has nothing to loop', 6000); return; }
  const set = loopSettings(), [W, H] = loopSize(set.size), fps = set.fps;
  const codec = await loopCodec(W, H, fps);
  if (!codec) { setStatus("This browser can't make video files: try Chrome or Edge", 8000); return; }
  const N = set.secs * fps, Fn = Math.round(LOOP_XFADE * fps), dtMs = 1000 / fps, total = N + Fn;
  const wasPlaying = ANIM.playing;
  LOOP.busy = true; LOOP.cancel = false;
  document.getElementById('loop-title').textContent = `Rendering a ${set.secs} s loop · ${W} × ${H} · ${fps} fps`;
  loopProgress(0, total, 0);
  loopDialog(true);
  // A fresh run on the fixed clock, with nothing measured yet
  cancelAnimationFrame(ANIM.raf); ANIM.raf = 0;
  clearAnimFrame();
  ANIM.playing = true;
  animFresh();
  Object.assign(ANIM, { recEMA: 0, recMode: '', slow: false, heavy: false, recMs: 0, keyMs: 0, trail: [], last: 0 });
  const o = ANIM.opts, keepSp = o.spSpd;
  if (o.spin) o.spSpd *= loopNudge(set.secs * o.speed * o.spSpd * SPIN_RATE, 2 * Math.PI / Math.max(1, S.sym.n));
  if (o.hue) ANIM.hueK = loopNudge(set.secs * o.speed * HUE_RATE, 360);
  let now = 1000;
  const step = () => { now += dtMs; ANIM.clock = now; animStep(now); };
  const R = { W, H, view: loopView(W, H), map: makeColorMap(S.palette), out: document.createElement('canvas'), work: document.createElement('canvas'),
    black: set.bg === 'black' ? loopBgColor() : null };
  R.out.width = R.work.width = W; R.out.height = R.work.height = H;
  R.oc = R.out.getContext('2d', { willReadFrequently: !!R.black });
  if (R.black) R.work.getContext('2d', { willReadFrequently: true });
  const chunks = [], keep = [], asPng = W * H * 4 * Fn / 1e6 > LOOP_KEEP_MB;
  let desc = null, encErr = null, blob = null;
  const encoder = new VideoEncoder({
    output: (ch, meta) => {
      const data = new Uint8Array(ch.byteLength);
      ch.copyTo(data);
      chunks.push({ data, key: ch.type === 'key' });
      const d = meta && meta.decoderConfig && meta.decoderConfig.description;
      if (d && !desc) desc = new Uint8Array(ArrayBuffer.isView(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d.slice(0));
    },
    error: e => { encErr = e; }
  });
  try {
    encoder.configure(codec.config);
    for (let i = 0; i < LOOP_WARM * fps; i++) step();
    const t0 = performance.now();
    let outI = 0;
    for (let k = 0; k < total; k++) {
      if (LOOP.cancel) throw new Error('cancelled');
      if (encErr) throw encErr;
      step();
      loopDraw(R);
      if (k < Fn) keep.push(asPng ? await loopBlob(R.out) : await createImageBitmap(R.out));
      else {
        if (k >= N) {
          // The seam: the video's own start fades in over its end
          const j = k - N, u = (j + 1) / Fn, img = keep[j] instanceof Blob ? await createImageBitmap(keep[j]) : keep[j];
          R.oc.globalAlpha = u * u * (3 - 2 * u);
          R.oc.drawImage(img, 0, 0);
          R.oc.globalAlpha = 1;
          img.close(); keep[j] = null;
        }
        const vf = new VideoFrame(R.out, { timestamp: Math.round(outI * 1e6 / fps), duration: Math.round(1e6 / fps) });
        encoder.encode(vf, { keyFrame: outI % (LOOP_KEY_S * fps) === 0 });
        vf.close();
        outI++;
        while (encoder.encodeQueueSize > 2 && !encErr) await new Promise(r => setTimeout(r, 5));
      }
      loopProgress(k + 1, total, t0);
      await loopYield();
    }
    await encoder.flush();
    if (encErr) throw encErr;
    if (codec.kind === 'avc' && !desc) throw new Error('the encoder gave no H.264 setup');
    blob = mp4File({ kind: codec.kind, level: codec.level, W, H, fps, desc, chunks });
  } catch (err) {
    if (err.message !== 'cancelled') { console.error(err); setStatus('Video failed: ' + (err.message || err), 8000); }
    else setStatus('Video cancelled');
  } finally {
    if (encoder.state !== 'closed') encoder.close();
    keep.forEach(b => { if (b && b.close) b.close(); });
    ANIM.clock = null; o.spSpd = keepSp; ANIM.hueK = 1;
    LOOP.busy = false;
    loopDialog(false);
    // Back to the screen: the video's last frame, paused, or playing on from it
    ANIM.playing = false; ANIM.last = 0;
    ANIM.frozen = !!ANIM.frame; ANIM.frozenKey = dlKey();
    canvas.style.filter = ANIM.hueFilter;
    if (wasPlaying) setPlaying(true);
    else { syncAnimButton(); update(); }
  }
  if (!blob) return;
  if (!(await download(blob, `${fileBase()}-loop-${set.secs}s.mp4`))) return;
  setStatus(`Video saved · ${W}×${H} · ${set.secs} s · ${fps} fps · ${codec.kind === 'avc' ? 'H.264' : 'VP9'}${set.bg === 'black' ? ' · pure black' : ''} · ${(blob.size / 1e6).toFixed(1)} MB`, 8000);
}
