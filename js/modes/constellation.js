// ── CONSTELLATION MAP ──────────────────────────────────────────────────────
// Minor stars scattered round the nodes (or through the boundary), joined
// into one constellation per node by a minimum spanning tree, over a haze of
// dust; the nodes are four-pointed major stars.
// Used by: RENDERERS. Reads fillRegion / regionSample to fill a boundary.

const CON_SPREAD = 1.8;                  // star field reaches 1.8 × the farthest node
const CON_LINE = 'rgba(228, 221, 208, 0.8)', CON_FAINT = 'rgba(228, 221, 208, 0.5)';
const CON_STAR = '#e4ddd0';              // solid bone
const CON_MASK = '#040a14';              // the mode's background: hides lines behind a star

// renderConstellation: built in stages on one shared object cn (conSetup).
// The stages draw from cn.R in the same order as before the split, so a seed
// gives the same sky.
function renderConstellation(c, nodes, density, sigma, weight, seed) {
    const cn = conSetup(nodes, density, sigma, weight, seed);
    conStars(cn);
    const links = conLinks(cn);
    conDust(c, cn);
    conPaths(c, cn, links);
    cn.stars.forEach(st => st.isNode ? conNodeStar(c, st, weight) : conMinorStar(c, st));
}

// Settings, the random stream, the centre, the organic outline (the nodes
// pushed outwards) and the boundary region, if any
function conSetup(nodes, density, sigma, weight, seed) {
    const cn = { nodes, density, sigma, weight, s: seed * 404, stars: [] };
    cn.R = () => sr(cn.s++);
    let cx = 0, cy = 0;
    nodes.forEach(n => { cx += n.x; cy += n.y; });
    cn.cx = cx /= (nodes.length || 1);
    cn.cy = cy /= (nodes.length || 1);
    const sorted = [...nodes].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    cn.outline = sorted.map(n => ({ x: cx + (n.x - cx) * CON_SPREAD, y: cy + (n.y - cy) * CON_SPREAD }));
    let maxR = 0;
    nodes.forEach(n => { const d = Math.hypot(n.x - cx, n.y - cy); if (d > maxR) maxR = d; });
    cn.mapR = maxR * CON_SPREAD;
    cn.RG = fillRegion();
    cn.fill = cn.RG ? cn.RG.scale(cn.mapR) : 1;     // how much more area a boundary gives
    return cn;
}

// A random point in a disc of k × mapR round the centre, or in the boundary.
// Both draws come first either way, and d is multiplied in the old order
// (× k last; × 1 is exact), as before the split.
function conPoint(cn, k) {
    const a = cn.R() * Math.PI * 2, d = Math.sqrt(cn.R()) * cn.mapR * k;
    return cn.RG ? regionSample(cn.RG, cn.R) : { x: cn.cx + Math.cos(a) * d, y: cn.cy + Math.sin(a) * d };
}

// Minor stars inside the outline (or the boundary), then the nodes as major stars
function conStars(cn) {
    const { stars, weight } = cn, want = Math.round(cn.density * 12 * cn.fill);
    for (let tries = 0; stars.length < want && tries < 4000; tries++) {
        const pt = conPoint(cn, 1);
        if (cn.RG || pip(pt, cn.outline)) stars.push({ x: pt.x, y: pt.y, r: weight * (1.2 + cn.R() * 1.4), isNode: false });
    }
    cn.nodes.forEach(n => stars.push({ x: n.x, y: n.y, r: weight * 3.2 * (n.size || 1) * Math.sqrt(n.w || 1), isNode: true }));
}

// Minimum spanning forest over the stars, shortest pairs first: two groups
// that each hold a node never join, so every node gets its own constellation.
// Pairs that would close a loop inside one constellation become faint lines
// now and then (more with jitter). Returns { main, faint } as pairs { i, j }.
function conLinks(cn) {
    const { stars } = cn, n = stars.length;
    const edges = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) edges.push({ i, j, dist: Math.hypot(stars[j].x - stars[i].x, stars[i].y - stars[j].y) });
    }
    edges.sort((a, b) => a.dist - b.dist);
    const parent = Array.from({ length: n }, (_, i) => i);
    const hasNode = stars.map(st => st.isNode);
    const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
    const main = [], faint = [];
    const maxDist = Math.max(100, (800 / cn.density) * 1.2), extra = (cn.sigma / 100) * 0.25;
    for (const e of edges) {
        if (e.dist > maxDist) continue;
        const ri = find(e.i), rj = find(e.j);
        if (ri !== rj && !(hasNode[ri] && hasNode[rj])) {
            parent[ri] = rj;
            hasNode[rj] = hasNode[rj] || hasNode[ri];
            main.push(e);
        } else if (ri === rj && cn.R() < extra && e.dist < maxDist * 0.6) {
            faint.push(e);
        }
    }
    return { main, faint };
}

// Background dust: more with density and jitter, a little past the stars
function conDust(c, cn) {
    const { weight, sigma } = cn;
    c.fillStyle = '#ffffff';
    c.globalAlpha = 0.25 + (sigma / 100) * 0.2;
    const count = cn.density * 40 * (1 + sigma / 100) * cn.fill;
    for (let i = 0; i < count; i++) {
        const pt = conPoint(cn, 1.2);
        c.beginPath();
        c.arc(pt.x, pt.y, weight * (0.2 + cn.R() * 0.5), 0, Math.PI * 2);
        c.fill();
    }
    c.globalAlpha = 1.0;
}

// The constellation lines: solid, then the faint loops dashed
function conPaths(c, cn, links) {
    const { stars, weight } = cn;
    const path = list => {
        c.beginPath();
        list.forEach(e => { c.moveTo(stars[e.i].x, stars[e.i].y); c.lineTo(stars[e.j].x, stars[e.j].y); });
        c.stroke();
    };
    c.strokeStyle = CON_LINE;
    c.lineWidth = weight * 1.3;
    if (c.setLineDash) c.setLineDash([]);
    path(links.main);
    if (!links.faint.length) return;
    c.strokeStyle = CON_FAINT;
    c.lineWidth = weight * 0.8;
    if (c.setLineDash) c.setLineDash([weight * 3, weight * 4]);
    path(links.faint);
    if (c.setLineDash) c.setLineDash([]);
}

// Each star first masks the lines behind it with the background colour
function conMask(c, st) {
    c.fillStyle = CON_MASK;
    c.beginPath();
    c.arc(st.x, st.y, st.r * 1.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = CON_STAR;
}

// A node: four-pointed star with a faint ring round it
function conNodeStar(c, st, weight) {
    conMask(c, st);
    const pr = st.r * 2.2, ir = st.r * 0.6;
    c.beginPath();
    if (c.markStar) c.markStar({ x: st.x, y: st.y, r: st.r, col: CON_STAR, kind: 'node', sp: pr, dim: false });
    for (let i = 0; i < 8; i++) {
        const r = (i % 2 === 0) ? pr : ir, a = (i * Math.PI) / 4;
        c.lineTo(st.x + Math.cos(a) * r, st.y + Math.sin(a) * r);
    }
    if (c.closePath) c.closePath();
    else c.lineTo(st.x + pr, st.y);
    c.fill();
    c.strokeStyle = CON_FAINT;
    c.lineWidth = weight * 0.7;
    c.beginPath(); c.arc(st.x, st.y, pr * 1.25, 0, Math.PI * 2); c.stroke();
}

// A minor star: a dot (it may twinkle or dim when animated)
function conMinorStar(c, st) {
    conMask(c, st);
    c.beginPath();
    if (c.markStar) c.markStar({ x: st.x, y: st.y, r: st.r, col: CON_STAR, kind: 'star', sp: 0, dim: true });
    c.arc(st.x, st.y, st.r, 0, Math.PI * 2);
    c.fill();
}
