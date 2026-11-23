// ── FOAM RENDERER (Organic Jitter + Dreamcatcher) ──────────────────────────
// Used by: RENDERERS. drawJaggedThread is shared with Synaptic web.
function renderFoam(ctx, nodes, density, sigma, weight, seed) {
    let s = seed * 999;
    const angleVal = sigma;

    let cx = 0;
    let cy = 0;
    nodes.forEach(a => {
        cx += a.x;
        cy += a.y;
    });
    cx /= nodes.length;
    cy /= nodes.length;

    const sortedNodes = [...nodes].sort((a, b) => {
        return Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx);
    });

    let maxDist = 0;
    nodes.forEach(a => {
        let d = Math.hypot(a.x - cx, a.y - cy);
        if (d > maxDist) maxDist = d;
    });

    let bubbles = [];
    const RG = fillRegion();
    let targetBubbles = Math.round(density * 12 * (RG ? RG.scale(maxDist * 1.1) : 1));
    let attempts = targetBubbles * 10;

    for (let i = 0; i < attempts && bubbles.length < targetBubbles; i++) {
        let a = sr(s++) * Math.PI * 2;
        let dist = Math.sqrt(sr(s++)) * maxDist * 1.5;
        let bx = cx + Math.cos(a) * dist;
        let by = cy + Math.sin(a) * dist;
        if (RG) { const q = regionSample(RG, () => sr(s++)); bx = q.x; by = q.y; }

        if (RG || pip({ x: bx, y: by }, sortedNodes)) {
            let r = 8 + sr(s++) * (maxDist * 0.3);
            for (let b of bubbles) {
                let d = Math.hypot(bx - b.x, by - b.y);
                if (d < b.r + 3) {
                    r = Math.min(r, d - b.r - 3);
                }
            }
            if (r > 6) {
                bubbles.push({ x: bx, y: by, r: r });
            }
        }
    }

    if (ctx.markBubbles) ctx.markBubbles(bubbles.map(b => {
        let d = Infinity;
        for (const n of nodes) d = Math.min(d, Math.hypot(b.x - n.x, b.y - n.y));
        return { x: b.x, y: b.y, r: b.r, d: isFinite(d) ? d : 0 };
    }));
    ctx.lineWidth = weight * 2.0;
    ctx.globalAlpha = 1.0;
    for (let i = 0; i < bubbles.length; i++) {
        drawDeformedBubble(ctx, bubbles[i].x, bubbles[i].y, bubbles[i].r, s + i, angleVal);
    }

    // All bubble-to-bubble threads in one path: at density 7 that is ~4,500
    // threads; stroked one by one, a frame with 16 symmetry copies took ~1 s.
    // (Where threads cross they no longer add up: dense lace ~2% dimmer.)
    ctx.lineWidth = weight * 0.5;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    for (let i = 0; i < bubbles.length; i++) {
        for (let j = i + 1; j < bubbles.length; j++) {
            let b1 = bubbles[i];
            let b2 = bubbles[j];
            let d = Math.hypot(b1.x - b2.x, b1.y - b2.y);

            if (d < b1.r + b2.r + 40 + (angleVal * 0.6)) {
                let a1 = Math.atan2(b2.y - b1.y, b2.x - b1.x);
                let a2 = Math.atan2(b1.y - b2.y, b1.x - b2.x);
                let p1x = b1.x + Math.cos(a1) * b1.r;
                let p1y = b1.y + Math.sin(a1) * b1.r;
                let p2x = b2.x + Math.cos(a2) * b2.r;
                let p2y = b2.y + Math.sin(a2) * b2.r;

                jaggedPath(ctx, p1x, p1y, p2x, p2y, 2, s + i + j, angleVal);
                if (sr(s + i + j) < 0.3) {
                    jaggedPath(ctx, p1x, p1y, p2x, p2y, 3, s + i + j + 1, angleVal);
                }
            }
        }
    }
    ctx.stroke();

    for (let a = 0; a < sortedNodes.length; a++) {
        let anc = sortedNodes[a];
        ctx.lineWidth = weight * 0.6;
        ctx.globalAlpha = 0.8;
        let dists = bubbles.map((b, i) => ({ d: Math.hypot(b.x - anc.x, b.y - anc.y), idx: i }));
        dists.sort((a, b) => a.d - b.d);

        for (let k = 0; k < Math.min(3, dists.length); k++) {
            let b = bubbles[dists[k].idx];
            let a1 = Math.atan2(anc.y - b.y, anc.x - b.x);
            let p1x = b.x + Math.cos(a1) * b.r;
            let p1y = b.y + Math.sin(a1) * b.r;
            drawJaggedThread(ctx, p1x, p1y, anc.x, anc.y, 2, s++, angleVal);
        }
    }

    ctx.lineWidth = weight * 0.35;
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < bubbles.length; i++) {
        let b = bubbles[i];
        if (b.r > 22 && sr(s + i) < (angleVal / 60)) {
            drawDreamcatcherWeave(ctx, b.x, b.y, b.r, s + i * 2, angleVal);
        } else if (b.r > 12 && sr(s + i + 1) < 0.4) {
            ctx.globalAlpha = 0.4;
            let a1 = sr(s + i + 2) * Math.PI * 2;
            let a2 = a1 + Math.PI + (sr(s + i + 3) - 0.5);
            let p1x = b.x + Math.cos(a1) * (b.r * 0.9);
            let p1y = b.y + Math.sin(a1) * (b.r * 0.9);
            let p2x = b.x + Math.cos(a2) * (b.r * 0.9);
            let p2y = b.y + Math.sin(a2) * (b.r * 0.9);
            drawJaggedThread(ctx, p1x, p1y, p2x, p2y, 2, s++, angleVal);
            ctx.globalAlpha = 0.7;
        }
    }
}

function drawDreamcatcherWeave(ctx, cx, cy, radius, seedOff, angleVal) {
    let s = seedOff;
    let numPoints = Math.floor(6 + sr(s++) * 6);
    let points = [];
    let rOffset = radius * 0.9;

    for (let i = 0; i < numPoints; i++) {
        let angle = (i / numPoints) * Math.PI * 2;
        let jitter = (sr(s++) - 0.5) * (angleVal / 100) * radius * 0.3;
        points.push({
            x: cx + Math.cos(angle) * (rOffset + jitter),
            y: cy + Math.sin(angle) * (rOffset + jitter)
        });
    }

    let layers = Math.min(12, Math.floor(radius / 6));
    let t = 0.45 + sr(s++) * 0.1;

    ctx.beginPath();
    for (let l = 0; l < layers; l++) {
        let nextPoints = [];
        for (let i = 0; i < numPoints; i++) {
            let p1 = points[i];
            let p2 = points[(i + 1) % numPoints];

            let dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            let jitter = (angleVal / 100) * dist * 0.2;
            let cpX = (p1.x + p2.x) / 2 + (sr(s++) - 0.5) * jitter;
            let cpY = (p1.y + p2.y) / 2 + (sr(s++) - 0.5) * jitter;

            ctx.moveTo(p1.x, p1.y);
            ctx.quadraticCurveTo(cpX, cpY, p2.x, p2.y);

            let nx = p1.x + (p2.x - p1.x) * t;
            let ny = p1.y + (p2.y - p1.y) * t;
            nextPoints.push({ x: nx, y: ny });
        }
        points = nextPoints;
    }
    ctx.stroke();

    if (points.length > 0) {
        let centerPx = points.reduce((acc, val) => acc + val.x, 0) / points.length;
        let centerPy = points.reduce((acc, val) => acc + val.y, 0) / points.length;
        ctx.beginPath();
        ctx.arc(centerPx, centerPy, 1 + sr(s++) * 2, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function drawDeformedBubble(ctx, cx, cy, r, seedOff, angleVal) {
    let s = seedOff;
    ctx.beginPath();
    const numPoints = 8;
    let points = [];
    for (let i = 0; i < numPoints; i++) {
        let ang = (i / numPoints) * Math.PI * 2;
        let jitter = (sr(s++) - 0.5) * (angleVal / 100) * r * 0.5;
        points.push({
            x: cx + Math.cos(ang) * (r + jitter),
            y: cy + Math.sin(ang) * (r + jitter)
        });
    }
    ctx.moveTo((points[0].x + points[numPoints - 1].x) / 2, (points[0].y + points[numPoints - 1].y) / 2);
    for (let i = 0; i < numPoints; i++) {
        let p1 = points[i];
        let p2 = points[(i + 1) % numPoints];
        let midX = (p1.x + p2.x) / 2;
        let midY = (p1.y + p2.y) / 2;
        ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
    }
    ctx.stroke();
}

// One path per thread: the zig-zag points in order from (x1, y1) to (x2, y2).
// (Each leaf segment used to be its own path: foam at density 7 recorded
// ~41k strokes, replayed per symmetry copy every animation frame.)
// jaggedPath adds the thread to the caller's open path, which strokes it once
// (foam's bubble-to-bubble threads: thousands of them share one style)
function drawJaggedThread(ctx, x1, y1, x2, y2, depth, seedOff, angleVal) {
    ctx.beginPath();
    jaggedPath(ctx, x1, y1, x2, y2, depth, seedOff, angleVal);
    ctx.stroke();
}
function jaggedPath(ctx, x1, y1, x2, y2, depth, seedOff, angleVal) {
    ctx.moveTo(x1, y1);
    jaggedTo(ctx, x1, y1, x2, y2, depth, seedOff, angleVal);
}
function jaggedTo(ctx, x1, y1, x2, y2, depth, seedOff, angleVal) {
    let s = seedOff;
    if (depth <= 0) { ctx.lineTo(x2, y2); return; }
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dist = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    const intensity = (angleVal / 100) * (dist * 0.25);
    const nx = mx + (sr(s++) - 0.5) * intensity;
    const ny = my + (sr(s++) - 0.5) * intensity;

    jaggedTo(ctx, x1, y1, nx, ny, depth - 1, s, angleVal);
    jaggedTo(ctx, nx, ny, x2, y2, depth - 1, s + 1, angleVal);
}
