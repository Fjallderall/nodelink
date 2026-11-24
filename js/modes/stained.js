// ── STAINED GLASS (Leaded Voronoi cells) ───────────────────────────────────
// Each node is a rosette: a centre cell ringed by petal cells. Random sites
// fill the rest. Jitter controls irregularity: low jitter relaxes the cells
// (Lloyd iterations) into even, calm glass; high jitter leaves them shattered.
// Used by: RENDERERS. voronoiCells, clipHalfPlane and polyCentroid are its own.
// Phase 46: split into stainSetup / stainRosettes / stainFill / stainCells /
// stainRagged / stainNoRim / stainLead; the random draws stay in the same order.
const STAIN_LEAD = '#d9cfbd';
const STAIN_BN = 72;        // sides of the round window

// Shared state N: random counter s, centre, window radius, region RG, ragged / ring
function stainSetup(nodes, density, seed) {
    const N = { s: seed * 6113, cx: 0, cy: 0, nodes, density };
    nodes.forEach(n => { N.cx += n.x; N.cy += n.y; });
    N.cx /= (nodes.length || 1); N.cy /= (nodes.length || 1);
    let maxR = 0;
    nodes.forEach(n => { const d = Math.hypot(n.x - N.cx, n.y - N.cy); if (isFinite(d) && d > maxR) maxR = d; });
    N.mapR0 = Math.min(4000, Math.max(maxR * 1.45, 180));
    N.RG = fillRegion();
    // Ragged (no boundary only): no round window; the glass ends in a broken
    // edge that follows the nodes, each node reaching out by its own radius
    N.ragged = !N.RG && !!(S.stained && S.stained.ragged);
    N.reachOf = n => (95 + density * 7) * (n.size || 1);
    let maxReach = 0;
    nodes.forEach(n => { maxReach = Math.max(maxReach, N.reachOf(n)); });
    N.mapR = N.ragged ? Math.min(4000, Math.max(N.mapR0, maxR + maxReach * 1.35)) : N.mapR0;
    N.ring = !N.ragged && (!S.stained || S.stained.ring !== false);
    // Outer window: a circle round the nodes, or the boundary when one is set
    N.bound = [];
    for (let i = 0; i < STAIN_BN; i++) {
        const a = (i / STAIN_BN) * Math.PI * 2;
        N.bound.push({ x: N.cx + Math.cos(a) * N.mapR, y: N.cy + Math.sin(a) * N.mapR });
    }
    if (N.RG) N.bound = N.RG.pts;
    return N;
}

// A rosette round every node: a centre site and 5-8 petal sites (fixed)
function stainRosettes(N) {
    const sites = [];
    N.nodes.forEach(n => {
        const sz = n.size || 1;
        sites.push({ x: n.x, y: n.y, fixed: true });
        const m = 5 + Math.floor(sr(N.s++) * 4);
        const rr = (30 + N.density * 2) * sz;
        const rot = sr(N.s++) * Math.PI * 2;
        for (let k = 0; k < m; k++) {
            const a = rot + (k / m) * Math.PI * 2;
            sites.push({ x: n.x + Math.cos(a) * rr, y: n.y + Math.sin(a) * rr, fixed: true });
        }
    });
    return sites;
}

// Random sites for the rest of the window, kept a minimum apart
function stainFill(N, sites) {
    const { RG, mapR, mapR0, density, cx, cy } = N;
    const target = Math.min(900, Math.round(density * 14 * (RG ? RG.scale(mapR) : 1) * (mapR / mapR0) ** 2));
    const minD = mapR0 * 1.3 / Math.sqrt(density * 14);
    // Spacing check on a bucket grid (cell = the minimum spacing)
    const md = minD * 0.6, BK = new Map();
    const bkey = (i, j) => i * 100003 + j;
    const addB = p => { const k = bkey(Math.floor(p.x / md), Math.floor(p.y / md)); (BK.get(k) || BK.set(k, []).get(k)).push(p); };
    const near = p => {
        const x = p.x, i0 = Math.floor(x / md), j0 = Math.floor(p.y / md);
        for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) {
            const b = BK.get(bkey(i, j));
            if (b) for (const q of b) if ((q.x - x) ** 2 + (q.y - p.y) ** 2 < md * md) return true;
        }
        return false;
    };
    sites.forEach(addB);
    let attempts = 0, added = 0;
    while (added < target && attempts < target * 30) {
        attempts++;
        const a = sr(N.s++) * Math.PI * 2;
        const d = Math.sqrt(sr(N.s++)) * mapR * 0.97;
        const q = RG ? regionSample(RG, () => sr(N.s++)) : { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
        const p = { x: q.x, y: q.y, fixed: false };
        if (!near(p)) { sites.push(p); addB(p); added++; }
    }
}

// Cells from the sites, relaxed by Lloyd iterations (fewer with more jitter)
function stainCells(N, sites, sigma) {
    const cellsOf = () => voronoiCells(sites, N.bound);
    let cells = cellsOf();
    const iters = Math.round((1 - sigma / 100) * 3);
    for (let it = 0; it < iters; it++) {
        sites.forEach((p, i) => {
            if (p.fixed || !cells[i] || cells[i].length < 3) return;
            const g = polyCentroid(cells[i]);
            p.x = g.x; p.y = g.y;
        });
        cells = cellsOf();
    }
    return cells;
}

// Ragged edge: per cell, distance to the nearest node in units of that node's
// reach, plus noise; past ~1 pieces drop out, more and more often
function stainRagged(N, sites, cells) {
    let rs = N.s + 911;
    return cells.map((poly, i) => {
        if (!poly || poly.length < 3) return null;
        const p = sites[i];
        let k = Infinity;
        N.nodes.forEach(n => { k = Math.min(k, Math.hypot(p.x - n.x, p.y - n.y) / N.reachOf(n)); });
        const r1 = sr(rs++), r2 = sr(rs++);
        const edge = 0.85 + (r1 - 0.5) * 0.5;
        if (k < edge) return poly;
        return k < edge + 0.35 && r2 < 0.45 * (1 - (k - edge) / 0.35) ? poly : null;   // stray shards
    });
}

// Without the ring (and no boundary), cells touching the circle are left out:
// a loose cluster of whole pieces instead of a round window
function stainNoRim(N, cells) {
    const { cx, cy, mapR } = N;
    const onRim = q => Math.abs(Math.hypot(q.x - cx, q.y - cy) - mapR * Math.cos(Math.PI / STAIN_BN)) < mapR * (1 - Math.cos(Math.PI / STAIN_BN)) + 1e-6;
    return cells.map(poly => poly && poly.some(onRim) ? null : poly);
}

// The lead lines round every cell, then the heavier outer came
function stainLead(c, N, cells, weight) {
    c.strokeStyle = STAIN_LEAD;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.globalAlpha = 1;
    c.lineWidth = weight * 2.6;
    c.beginPath();
    cells.forEach((poly, i) => {
        if (!poly || poly.length < 3) return;
        if (c.markPane) c.markPane({ pts: poly, glow: true, lw: weight * 2.6, lead: STAIN_LEAD });
        c.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) c.lineTo(poly[i].x, poly[i].y);
        c.closePath();
    });
    c.stroke();
    if (N.ring) {
        const bound = N.bound;
        c.lineWidth = weight * 4.5;
        c.beginPath();
        if (c.markLead) c.markLead({ pts: bound, lw: weight * 4.5, lead: STAIN_LEAD });
        c.moveTo(bound[0].x, bound[0].y);
        for (let i = 1; i < bound.length; i++) c.lineTo(bound[i].x, bound[i].y);
        c.closePath();
        c.stroke();
    }
}

function renderStained(c, nodes, density, sigma, weight, seed) {
    const N = stainSetup(nodes, density, seed);
    const sites = stainRosettes(N);
    stainFill(N, sites);
    let cells = stainCells(N, sites, sigma);
    if (N.ragged) cells = stainRagged(N, sites, cells);
    if (!N.ring && !N.RG) cells = stainNoRim(N, cells);
    stainLead(c, N, cells, weight);
}

// Keeps the part of polygon poly where (p · n) <= d
function clipHalfPlane(poly, nx, ny, d) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const da = a.x * nx + a.y * ny - d;
        const db = b.x * nx + b.y * ny - d;
        if (da <= 0) out.push(a);
        if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
            const t = da / (da - db);
            out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
    }
    return out;
}

// Voronoi cells by half-plane clipping, with early exit. Sites are bucketed
// on a grid; a cell is clipped ring by ring of buckets and stops as soon as
// the next ring is too far away to cut it (more than twice the cell's reach).
function voronoiCells(sites, bound, only = sites.length) {
    const n = sites.length;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    sites.forEach(p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
    const bs = Math.max(1e-6, Math.sqrt(Math.max(1, (x1 - x0) * (y1 - y0)) / Math.max(1, n)) * 1.2);
    const GW = Math.max(1, Math.min(400, Math.ceil((x1 - x0) / bs) + 1)), GH = Math.max(1, Math.min(400, Math.ceil((y1 - y0) / bs) + 1));
    const bsx = (x1 - x0) / GW || 1, bsy = (y1 - y0) / GH || 1, bmin = Math.min(bsx, bsy);
    const buckets = Array.from({ length: GW * GH }, () => []);
    const bx = x => Math.min(GW - 1, Math.max(0, Math.floor((x - x0) / bsx)));
    const by = y => Math.min(GH - 1, Math.max(0, Math.floor((y - y0) / bsy)));
    sites.forEach((p, j) => buckets[by(p.y) * GW + bx(p.x)].push(j));
    const out = [];
    for (let i = 0; i < only; i++) {
        const si = sites[i], ci = bx(si.x), cj = by(si.y);
        let poly = bound, reach2 = Infinity, dead = false;
        for (let r = 0; !dead; r++) {
            // Sites in ring r are at least (r - 1) buckets away
            if (r > 1 && ((r - 1) * bmin) ** 2 > 4 * reach2) break;
            if (r > GW && r > GH) break;
            const ring = [];
            for (let gy = cj - r; gy <= cj + r; gy++) {
                if (gy < 0 || gy >= GH) continue;
                const edge = gy === cj - r || gy === cj + r;
                for (let gx = ci - r; gx <= ci + r; gx += edge ? 1 : 2 * r || 1) {
                    if (gx < 0 || gx >= GW) continue;
                    for (const j of buckets[gy * GW + gx]) {
                        if (j === i) continue;
                        const dx = sites[j].x - si.x, dy = sites[j].y - si.y, d2 = dx * dx + dy * dy;
                        if (d2 > 1e-9) ring.push({ j, d2 });
                    }
                }
            }
            ring.sort((a, b) => a.d2 - b.d2);
            for (const o of ring) {
                if (o.d2 > 4 * reach2) break;
                const sj = sites[o.j];
                const nx = sj.x - si.x, ny = sj.y - si.y;
                const d = ((sj.x + si.x) / 2) * nx + ((sj.y + si.y) / 2) * ny;
                poly = clipHalfPlane(poly, nx, ny, d);
                if (poly.length < 3) { dead = true; break; }
                reach2 = 0;
                for (const p of poly) reach2 = Math.max(reach2, (p.x - si.x) ** 2 + (p.y - si.y) ** 2);
            }
        }
        out.push(dead ? null : poly);
    }
    return out;
}

function polyCentroid(poly) {
    let a = 0, x = 0, y = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        const k = p.x * q.y - q.x * p.y;
        a += k; x += (p.x + q.x) * k; y += (p.y + q.y) * k;
    }
    if (Math.abs(a) < 1e-9) return poly[0];
    return { x: x / (3 * a), y: y / (3 * a) };
}
