// ── SPIDERWEB (orb ↔ tangle, with dew) ─────────────────────────────────────
// Nodes are the anchor points. Low jitter: a classic orb web (frame, radials,
// spiral). High jitter: the orb tears and gives way to an irregular sheet /
// tangle web with hanging strands. Threads sag slightly under the dew.
// Used by: RENDERERS. Reads liveOf(c).dewT (animation time while recording
// live frames, else null) for rolling dew.

// renderSpiderweb: the web is built in stages on one shared object sp
// (spiderSetup), then drawn. The stages run in the same order as before the
// split and all draw from sp.R in turn, so a seed gives the same web.
function renderSpiderweb(c, nodes, density, sigma, weight, seed) {
    const sp = spiderSetup(nodes, density, sigma, weight, seed);
    if (sp.orb > 0) spiderOrb(sp);
    if (sp.tg > 0) spiderTangle(sp);
    spiderGuys(sp);
    spiderSilk(c, sp);
    if (S.dew <= 0) return;
    spiderDewDraw(c, spiderDew(sp, liveOf(c).dewT));
}

// Settings, the random stream, the hub and the frame polygon
function spiderSetup(nodes, density, sigma, weight, seed) {
    const sp = { nodes, density, sigma, weight, s: seed * 3571, J: sigma / 100, threads: [] };
    sp.R = () => sr(sp.s++);
    let cx = 0, cy = 0;
    nodes.forEach(n => { cx += n.x; cy += n.y; });
    cx /= (nodes.length || 1); cy /= (nodes.length || 1);
    let maxR = 0;
    nodes.forEach(n => { const d = Math.hypot(n.x - cx, n.y - cy); if (isFinite(d) && d > maxR) maxR = d; });
    sp.maxR = maxR = Math.min(4000, Math.max(maxR, 60));
    const hub = sp.hub = { x: cx + (sp.R() - 0.5) * maxR * 0.15, y: cy + (sp.R() - 0.5) * maxR * 0.15 };

    // Frame polygon: anchors sorted around the hub (or a ring if too few)
    let frame = [...nodes].sort((a, b) => Math.atan2(a.y - hub.y, a.x - hub.x) - Math.atan2(b.y - hub.y, b.x - hub.x))
        .map(n => ({ x: n.x, y: n.y }));
    if (frame.length < 3) {
        frame = [];
        for (let i = 0; i < 8; i++) {
            const a = i / 8 * Math.PI * 2;
            frame.push({ x: hub.x + Math.cos(a) * maxR * 1.1, y: hub.y + Math.sin(a) * maxR * 1.1 });
        }
    }
    sp.frame = frame;
    sp.rayPoly = frame;                                // what spiderRay measures to (the drawn frame once the orb has one)
    sp.CV = S.curved ? S.curve / 100 : 0;
    sp.lwMain = weight * 0.8; sp.lwFine = weight * 0.55;
    sp.orb = 1 - Math.max(0, Math.min(1, (sigma - 55) / 35));   // orb fades out as jitter rises
    sp.tg = Math.max(0, (sigma - 25) / 75);                     // tangle grows with jitter
    return sp;
}

// Threads: [x1, y1, cx, cy, x2, y2, width, dewFactor] (quadratic, sagging downwards).
// bulge: signed offset of the control point away from the hub (arcs around
// the hub, frames pulled inward); null = random sideways bow
function spiderThread(sp, x1, y1, x2, y2, w, sagK, dewK = 1, bulge = null) {
    const len = Math.hypot(x2 - x1, y2 - y1) || 1e-6;
    sp.s++;   // a sag draw that is no longer used: kept so the random stream stays the same
    let mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    if (bulge !== null) {
        const hx = mx - sp.hub.x, hy = my - sp.hub.y, hl = Math.hypot(hx, hy) || 1;
        mx += hx / hl * bulge * sp.CV;
        my += hy / hl * bulge * sp.CV;
    } else {
        const b = len * sp.CV * 0.22 * (sp.R() - 0.5) * 2;
        mx += -(y2 - y1) / len * b;
        my += (x2 - x1) / len * b;
    }
    sp.threads.push([x1, y1, mx, my, x2, y2, w, dewK]);
}

// Distance from the hub to sp.rayPoly along angle a
function spiderRay(sp, a) {
    const frame = sp.rayPoly, hub = sp.hub;
    const dx = Math.cos(a), dy = Math.sin(a);
    let best = Infinity;
    for (let i = 0; i < frame.length; i++) {
        const p = frame[i], q = frame[(i + 1) % frame.length];
        const ex = q.x - p.x, ey = q.y - p.y;
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((p.x - hub.x) * ey - (p.y - hub.y) * ex) / den;
        const u = ((p.x - hub.x) * dy - (p.y - hub.y) * dx) / den;
        if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
    }
    return isFinite(best) ? best : sp.maxR;
}

// ORB: frame, radials, capture spiral and hub
function spiderOrb(sp) {
    const frame = sp.frame;
    for (let i = 0; i < frame.length; i++) {
        const p = frame[i], q = frame[(i + 1) % frame.length];
        spiderThread(sp, p.x, p.y, q.x, q.y, sp.lwMain, 0.02, 1, -Math.hypot(q.x - p.x, q.y - p.y) * 0.16);
    }
    // Radials must end on the frame as drawn (curved or not): sample the frame threads
    sp.rayPoly = [];
    sp.threads.slice(-frame.length).forEach(t => {
        for (let k = 0; k < 16; k++) {
            const u = k / 16, v = 1 - u;
            sp.rayPoly.push({ x: v * v * t[0] + 2 * v * u * t[2] + u * u * t[4], y: v * v * t[1] + 2 * v * u * t[3] + u * u * t[5] });
        }
    });
    const rad = spiderRadials(sp);
    spiderSpiral(sp, rad);
    spiderHub(sp, rad);
}

function spiderRadials(sp) {
    const hub = sp.hub, K = 10 + sp.density * 2;
    const rot = sp.R() * Math.PI * 2;
    const rad = [];
    for (let i = 0; i < K; i++) {
        const a = rot + (i / K) * Math.PI * 2 + (sp.R() - 0.5) * sp.J * (Math.PI * 2 / K) * 0.8;
        const R = spiderRay(sp, a);
        rad.push({ a, R, dx: Math.cos(a), dy: Math.sin(a) });
        // straight (under tension), so the spiral attaches exactly on it
        spiderThread(sp, hub.x, hub.y, hub.x + Math.cos(a) * R, hub.y + Math.sin(a) * R, sp.lwMain, 0, 0.7, 0);
    }
    return rad;
}

// A segment between two points on neighbouring radials, bowed round the hub
function spiderArc(sp, prev, pt, dewK) {
    const ch2 = (pt.x - prev.x) ** 2 + (pt.y - prev.y) ** 2;
    const rr = Math.hypot((pt.x + prev.x) / 2 - sp.hub.x, (pt.y + prev.y) / 2 - sp.hub.y) || 1;
    spiderThread(sp, prev.x, prev.y, pt.x, pt.y, sp.lwFine, dewK ? 0.04 : 0.0, dewK, ch2 / (4 * rr));
}

// Capture spiral: one segment per radial, inward → outward
function spiderSpiral(sp, rad) {
    const hub = sp.hub, K = rad.length;
    const turns = 5 + sp.density * 2.2;
    const steps = Math.floor(K * turns);
    const t0 = 0.2, t1 = 0.93;
    const broken = sp.J * 0.25;
    let prev = null;
    for (let k = 0; k <= steps; k++) {
        const r = rad[k % K];
        const t = t0 + (t1 - t0) * k / steps + (sp.R() - 0.5) * sp.J * 0.02;
        const pt = { x: hub.x + r.dx * r.R * t, y: hub.y + r.dy * r.R * t };
        if (prev && sp.R() > broken) spiderArc(sp, prev, pt, 1);
        prev = pt;
    }
}

// Hub: a small dense mesh, no dew
function spiderHub(sp, rad) {
    const hub = sp.hub, K = rad.length;
    let prev = null;
    const hubSteps = K * 3;
    for (let k = 0; k <= hubSteps; k++) {
        const r = rad[k % K];
        const t = 0.02 + 0.09 * k / hubSteps;
        const pt = { x: hub.x + r.dx * r.R * t, y: hub.y + r.dy * r.R * t };
        if (prev) spiderArc(sp, prev, pt, 0);
        prev = pt;
    }
}

// TANGLE / SHEET web: extra points, sheet edges, links, hanging strands
function spiderTangle(sp) {
    const pts = spiderTanglePts(sp);
    // Sheet edges strung between the anchors once the orb is gone
    if (sp.orb <= 0 && sp.nodes.length >= 2) {
        const frame = sp.frame;
        for (let i = 0; i < frame.length; i++) {
            const a = frame[i], b = frame[(i + 1) % frame.length];
            spiderThread(sp, a.x, a.y, b.x, b.y, sp.lwMain, 0.05, 1, -Math.hypot(b.x - a.x, b.y - a.y) * 0.16);
        }
    }
    spiderTangleLinks(sp, pts);
    // Strands hanging down from the sheet
    const hang = Math.round(sp.density * 3 * sp.tg);
    for (let i = 0; i < hang; i++) {
        const p = pts[Math.floor(sp.R() * pts.length)];
        const L = sp.maxR * (0.3 + sp.R() * 0.8);
        spiderThread(sp, p.x, p.y, p.x + (sp.R() - 0.5) * L * 0.35, p.y + L, sp.lwFine, 0.01);
    }
}

// The anchors plus random points, mostly inside the frame
function spiderTanglePts(sp) {
    const { nodes, hub, frame } = sp;
    const pts = nodes.map(n => ({ x: n.x, y: n.y }));
    const target = Math.round(sp.density * 22 * sp.tg) + 6;
    let tries = 0;
    while (pts.length < nodes.length + target && tries++ < target * 30) {
        const a = sp.R() * Math.PI * 2;
        const d = Math.sqrt(sp.R()) * sp.maxR * 1.05;
        const p = { x: hub.x + Math.cos(a) * d, y: hub.y + Math.sin(a) * d * 0.85 };
        if (frame.length >= 3 && !pip(p, frame) && sp.R() > 0.08) continue;
        pts.push(p);
    }
    return pts;
}

// Each point links to a few of its nearest, now and then a further one
function spiderTangleLinks(sp, pts) {
    const seen = new Set();
    pts.forEach((p, i) => {
        const near = pts.map((q, j) => ({ j, d: (q.x - p.x) ** 2 + (q.y - p.y) ** 2 }))
            .filter(o => o.j !== i).sort((a, b) => a.d - b.d);
        const links = 3 + Math.floor(sp.R() * 3);
        for (let k = 0; k < Math.min(links, near.length); k++) {
            // occasionally reach further for long, crossing strands
            const o = sp.R() < 0.25 ? near[Math.min(near.length - 1, k + 3 + Math.floor(sp.R() * 4))] : near[k];
            const key = i < o.j ? `${i}-${o.j}` : `${o.j}-${i}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const q = pts[o.j];
            spiderThread(sp, p.x, p.y, q.x, q.y, sp.lwFine, 0.06 * sp.tg);
        }
    });
}

// Guy lines from each anchor outward
function spiderGuys(sp) {
    const hub = sp.hub;
    sp.nodes.forEach(n => {
        const a0 = Math.atan2(n.y - hub.y, n.x - hub.x);
        const cnt = 1 + Math.floor(sp.R() * 2);
        for (let k = 0; k < cnt; k++) {
            const a = a0 + (sp.R() - 0.5) * 1.2;
            const L = sp.maxR * (0.25 + sp.R() * 0.5);
            spiderThread(sp, n.x, n.y, n.x + Math.cos(a) * L, n.y + Math.sin(a) * L, sp.lwMain, 0.01, 0.5);
        }
    });
}

// Draw silk, grouped by width
function spiderSilk(c, sp) {
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(214, 224, 230, 0.8)';
    [sp.lwMain, sp.lwFine].forEach(w => {
        c.lineWidth = w;
        c.beginPath();
        sp.threads.forEach(t => {
            if (t[6] !== w) return;
            c.moveTo(t[0], t[1]);
            c.quadraticCurveTo(t[2], t[3], t[4], t[5]);
        });
        c.stroke();
    });
}

// Dew: beads along the threads, mostly small with the odd big one.
// T: the animation time while recording live frames (never in exports), else
// null. Each drop then rolls (accelerating) to its thread's lowest point,
// stretches and drips off, and a new one forms where it started.
// Returns { big, small, falling } for spiderDewDraw.
function spiderDew(sp, T) {
    const dew = S.dew / 100, weight = sp.weight;
    const gapBase = 46 - dew * 36;
    const out = { big: [], small: [], falling: [] };
    const bead = (x, y, r) => (r > weight * 1.9 ? out.big : out.small).push([x, y, r]);
    sp.threads.forEach(t => {
        if (!t[7]) return;
        const len = Math.hypot(t[4] - t[0], t[5] - t[1]) + Math.abs(t[3] - (t[1] + t[5]) / 2);
        const at = u => { const v = 1 - u; return { x: v * v * t[0] + 2 * v * u * t[2] + u * u * t[4], y: v * v * t[1] + 2 * v * u * t[3] + u * u * t[5] }; };
        // Lowest point (largest y) of the quadratic
        const den = t[1] - 2 * t[3] + t[5];
        let uLow = Math.abs(den) > 1e-9 ? (t[1] - t[3]) / den : (t[5] > t[1] ? 1 : 0);
        if (!(uLow > 0 && uLow < 1)) uLow = t[5] > t[1] ? 1 : 0;
        const low = at(uLow);
        let pos = sp.R() * gapBase;
        while (pos < len) {
            const u = pos / len;
            const r = weight * (0.7 + Math.pow(sp.R(), 4) * 3.4 * (0.5 + dew));
            pos += gapBase * (0.5 + sp.R() * 1.5) / t[7] + r * 2;
            if (T === null) { const p = at(u); bead(p.x, p.y, r); continue; }
            const start = u < uLow ? 0 : 1, span = uLow - start;
            const track = Math.abs(span) * len;
            const p0 = Math.abs(span) > 1e-6 ? (u - start) / span : 1;
            const P = (7.5 + track / 15) * (1.15 - Math.min(0.5, r / weight * 0.08));   // seconds per cycle; bigger drops roll faster
            const cy = ((0.1 + 0.7 * Math.sqrt(Math.max(0, Math.min(1, p0))) + T / P) % 1 + 1) % 1;
            if (cy < 0.1) {                                  // forming
                const q = at(start), rr = r * cy / 0.1;
                if (rr > weight * 0.2) (r > weight * 1.9 ? out.big : out.small).push([q.x, q.y, rr]);
            } else if (cy < 0.8) {                           // rolling
                const k = (cy - 0.1) / 0.7, q = at(start + span * k * k);
                bead(q.x, q.y, r);
            } else {                                         // dripping off
                const k = (cy - 0.8) / 0.2;
                out.falling.push([low.x, low.y + r + k * k * (30 + r * 12), r * (1 - 0.4 * k), 1 - k, k]);
            }
        }
    });
    return out;
}

function spiderDewDraw(c, { big, small, falling }) {
    falling.forEach(([x, y, r, a, k]) => {
        c.globalAlpha = a;
        c.fillStyle = '#eef3f6';
        c.save(); c.translate(x, y); c.scale(1 - 0.3 * k, 1 + 0.9 * k);
        c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
        c.restore();
    });
    c.globalAlpha = 1;
    c.fillStyle = '#eef3f6';
    c.beginPath();
    small.forEach(([x, y, r]) => { c.moveTo(x + r, y); c.arc(x, y, r, 0, Math.PI * 2); });
    c.fill();
    // Big drops: bright rim, dark body, small glint (reads as glass in stencil too)
    big.forEach(([x, y, r]) => {
        c.fillStyle = '#eef3f6';
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#0b0e11';
        c.beginPath(); c.arc(x + r * 0.12, y + r * 0.14, r * 0.7, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#eef3f6';
        c.beginPath(); c.arc(x - r * 0.24, y - r * 0.26, r * 0.2, 0, Math.PI * 2); c.fill();
    });
}
