// ── SPIDERWEB (orb ↔ tangle, with dew) ─────────────────────────────────────
// Nodes are the anchor points. Low jitter: a classic orb web (frame, radials,
// spiral). High jitter: the orb tears and gives way to an irregular sheet /
// tangle web with hanging strands. Threads sag slightly under the dew.
// Used by: RENDERERS. Reads liveOf(c).dewT (animation time while recording
// live frames, else null) for rolling dew.

function renderSpiderweb(c, nodes, density, sigma, weight, seed) {
    let s = seed * 3571;
    const J = sigma / 100;
    let cx = 0, cy = 0;
    nodes.forEach(n => { cx += n.x; cy += n.y; });
    cx /= (nodes.length || 1); cy /= (nodes.length || 1);
    let maxR = 0;
    nodes.forEach(n => { const d = Math.hypot(n.x - cx, n.y - cy); if (isFinite(d) && d > maxR) maxR = d; });
    maxR = Math.min(4000, Math.max(maxR, 60));
    const hub = { x: cx + (sr(s++) - 0.5) * maxR * 0.15, y: cy + (sr(s++) - 0.5) * maxR * 0.15 };

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

    // Threads: [x1, y1, cx, cy, x2, y2, width, dewFactor] (quadratic, sagging downwards)
    const threads = [];
    // bulge: signed offset of the control point away from the hub (arcs around
    // the hub, frames pulled inward); null = random sideways bow
    const CV = S.curved ? S.curve / 100 : 0;
    function thread(x1, y1, x2, y2, w, sagK, dewK = 1, bulge = null) {
        const len = Math.hypot(x2 - x1, y2 - y1) || 1e-6;
        s++;   // a sag draw that is no longer used: kept so the random stream stays the same
        let mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        if (bulge !== null) {
            const hx = mx - hub.x, hy = my - hub.y, hl = Math.hypot(hx, hy) || 1;
            mx += hx / hl * bulge * CV;
            my += hy / hl * bulge * CV;
        } else {
            const b = len * CV * 0.22 * (sr(s++) - 0.5) * 2;
            mx += -(y2 - y1) / len * b;
            my += (x2 - x1) / len * b;
        }
        threads.push([x1, y1, mx, my, x2, y2, w, dewK]);
    }

    // Distance from the hub to the frame along angle a
    let rayPoly = frame;
    function rayFrame(a) {
        const frame = rayPoly;
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
        return isFinite(best) ? best : maxR;
    }

    const lwMain = weight * 0.8, lwFine = weight * 0.55;

    // ORB: fades out as jitter rises
    const orb = 1 - Math.max(0, Math.min(1, (sigma - 55) / 35));
    if (orb > 0) {
        for (let i = 0; i < frame.length; i++) {
            const p = frame[i], q = frame[(i + 1) % frame.length];
            thread(p.x, p.y, q.x, q.y, lwMain, 0.02, 1, -Math.hypot(q.x - p.x, q.y - p.y) * 0.16);
        }
        // Radials must end on the frame as drawn (curved or not): sample the frame threads
        rayPoly = [];
        threads.slice(-frame.length).forEach(t => {
            for (let k = 0; k < 16; k++) {
                const u = k / 16, v = 1 - u;
                rayPoly.push({ x: v * v * t[0] + 2 * v * u * t[2] + u * u * t[4], y: v * v * t[1] + 2 * v * u * t[3] + u * u * t[5] });
            }
        });
        const K = 10 + density * 2;
        const rot = sr(s++) * Math.PI * 2;
        const rad = [];
        for (let i = 0; i < K; i++) {
            const a = rot + (i / K) * Math.PI * 2 + (sr(s++) - 0.5) * J * (Math.PI * 2 / K) * 0.8;
            const R = rayFrame(a);
            rad.push({ a, R, dx: Math.cos(a), dy: Math.sin(a) });
            // straight (under tension), so the spiral attaches exactly on it
            thread(hub.x, hub.y, hub.x + Math.cos(a) * R, hub.y + Math.sin(a) * R, lwMain, 0, 0.7, 0);
        }
        // Capture spiral: one segment per radial, inward → outward
        const turns = 5 + density * 2.2;
        const steps = Math.floor(K * turns);
        const t0 = 0.2, t1 = 0.93;
        const broken = J * 0.25;
        let prev = null;
        for (let k = 0; k <= steps; k++) {
            const r = rad[k % K];
            const t = t0 + (t1 - t0) * k / steps + (sr(s++) - 0.5) * J * 0.02;
            const pt = { x: hub.x + r.dx * r.R * t, y: hub.y + r.dy * r.R * t };
            if (prev && sr(s++) > broken) {
                const ch2 = (pt.x - prev.x) ** 2 + (pt.y - prev.y) ** 2;
                const rr = Math.hypot((pt.x + prev.x) / 2 - hub.x, (pt.y + prev.y) / 2 - hub.y) || 1;
                thread(prev.x, prev.y, pt.x, pt.y, lwFine, 0.04, 1, ch2 / (4 * rr));
            }
            prev = pt;
        }
        // Hub: a small dense mesh, no dew
        prev = null;
        const hubSteps = K * 3;
        for (let k = 0; k <= hubSteps; k++) {
            const r = rad[k % K];
            const t = 0.02 + 0.09 * k / hubSteps;
            const pt = { x: hub.x + r.dx * r.R * t, y: hub.y + r.dy * r.R * t };
            if (prev) {
                const ch2 = (pt.x - prev.x) ** 2 + (pt.y - prev.y) ** 2;
                const rr = Math.hypot((pt.x + prev.x) / 2 - hub.x, (pt.y + prev.y) / 2 - hub.y) || 1;
                thread(prev.x, prev.y, pt.x, pt.y, lwFine, 0.0, 0, ch2 / (4 * rr));
            }
            prev = pt;
        }
    }

    // TANGLE / SHEET web: grows with jitter
    const tg = Math.max(0, (sigma - 25) / 75);
    if (tg > 0) {
        const pts = nodes.map(n => ({ x: n.x, y: n.y }));
        const target = Math.round(density * 22 * tg) + 6;
        let tries = 0;
        while (pts.length < nodes.length + target && tries++ < target * 30) {
            const a = sr(s++) * Math.PI * 2;
            const d = Math.sqrt(sr(s++)) * maxR * 1.05;
            const p = { x: hub.x + Math.cos(a) * d, y: hub.y + Math.sin(a) * d * 0.85 };
            if (frame.length >= 3 && !pip(p, frame) && sr(s++) > 0.08) continue;
            pts.push(p);
        }
        // Sheet edges strung between the anchors once the orb is gone
        if (orb <= 0 && nodes.length >= 2) {
            for (let i = 0; i < frame.length; i++) {
                const a = frame[i], b = frame[(i + 1) % frame.length];
                thread(a.x, a.y, b.x, b.y, lwMain, 0.05, 1, -Math.hypot(b.x - a.x, b.y - a.y) * 0.16);
            }
        }
        const seen = new Set();
        pts.forEach((p, i) => {
            const near = pts.map((q, j) => ({ j, d: (q.x - p.x) ** 2 + (q.y - p.y) ** 2 }))
                .filter(o => o.j !== i).sort((a, b) => a.d - b.d);
            const links = 3 + Math.floor(sr(s++) * 3);
            for (let k = 0; k < Math.min(links, near.length); k++) {
                // occasionally reach further for long, crossing strands
                const o = sr(s++) < 0.25 ? near[Math.min(near.length - 1, k + 3 + Math.floor(sr(s++) * 4))] : near[k];
                const key = i < o.j ? `${i}-${o.j}` : `${o.j}-${i}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const q = pts[o.j];
                thread(p.x, p.y, q.x, q.y, lwFine, 0.06 * tg);
            }
        });
        // Strands hanging down from the sheet
        const hang = Math.round(density * 3 * tg);
        for (let i = 0; i < hang; i++) {
            const p = pts[Math.floor(sr(s++) * pts.length)];
            const L = maxR * (0.3 + sr(s++) * 0.8);
            thread(p.x, p.y, p.x + (sr(s++) - 0.5) * L * 0.35, p.y + L, lwFine, 0.01);
        }
    }

    // Guy lines from each anchor outward
    nodes.forEach(n => {
        const a0 = Math.atan2(n.y - hub.y, n.x - hub.x);
        const cnt = 1 + Math.floor(sr(s++) * 2);
        for (let k = 0; k < cnt; k++) {
            const a = a0 + (sr(s++) - 0.5) * 1.2;
            const L = maxR * (0.25 + sr(s++) * 0.5);
            thread(n.x, n.y, n.x + Math.cos(a) * L, n.y + Math.sin(a) * L, lwMain, 0.01, 0.5);
        }
    });

    // Draw silk, grouped by width
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(214, 224, 230, 0.8)';
    [lwMain, lwFine].forEach(w => {
        c.lineWidth = w;
        c.beginPath();
        threads.forEach(t => {
            if (t[6] !== w) return;
            c.moveTo(t[0], t[1]);
            c.quadraticCurveTo(t[2], t[3], t[4], t[5]);
        });
        c.stroke();
    });

    // Dew: beads along the threads, mostly small with the odd big one
    if (S.dew <= 0) return;
    const dew = S.dew / 100;
    const gapBase = 46 - dew * 36;
    const big = [], small = [], falling = [];
    // Live animation (never in exports): dewT is the animation time. Each
    // drop rolls (accelerating) to its thread's lowest point, stretches and
    // drips off, and a new one forms where it started.
    const T = liveOf(c).dewT;
    threads.forEach(t => {
        if (!t[7]) return;
        const len = Math.hypot(t[4] - t[0], t[5] - t[1]) + Math.abs(t[3] - (t[1] + t[5]) / 2);
        const at = u => { const v = 1 - u; return { x: v * v * t[0] + 2 * v * u * t[2] + u * u * t[4], y: v * v * t[1] + 2 * v * u * t[3] + u * u * t[5] }; };
        // Lowest point (largest y) of the quadratic
        const den = t[1] - 2 * t[3] + t[5];
        let uLow = Math.abs(den) > 1e-9 ? (t[1] - t[3]) / den : (t[5] > t[1] ? 1 : 0);
        if (!(uLow > 0 && uLow < 1)) uLow = t[5] > t[1] ? 1 : 0;
        const low = at(uLow);
        let pos = sr(s++) * gapBase;
        while (pos < len) {
            const u = pos / len;
            const r = weight * (0.7 + Math.pow(sr(s++), 4) * 3.4 * (0.5 + dew));
            pos += gapBase * (0.5 + sr(s++) * 1.5) / t[7] + r * 2;
            if (T === null) { const p = at(u); (r > weight * 1.9 ? big : small).push([p.x, p.y, r]); continue; }
            const start = u < uLow ? 0 : 1, span = uLow - start;
            const track = Math.abs(span) * len;
            const p0 = Math.abs(span) > 1e-6 ? (u - start) / span : 1;
            const P = (7.5 + track / 15) * (1.15 - Math.min(0.5, r / weight * 0.08));   // seconds per cycle; bigger drops roll faster
            const c = ((0.1 + 0.7 * Math.sqrt(Math.max(0, Math.min(1, p0))) + T / P) % 1 + 1) % 1;
            if (c < 0.1) {                                   // forming
                const q = at(start), rr = r * c / 0.1;
                if (rr > weight * 0.2) (r > weight * 1.9 ? big : small).push([q.x, q.y, rr]);
            } else if (c < 0.8) {                            // rolling
                const k = (c - 0.1) / 0.7, q = at(start + span * k * k);
                (r > weight * 1.9 ? big : small).push([q.x, q.y, r]);
            } else {                                         // dripping off
                const k = (c - 0.8) / 0.2;
                falling.push([low.x, low.y + r + k * k * (30 + r * 12), r * (1 - 0.4 * k), 1 - k, k]);
            }
        }
    });
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
