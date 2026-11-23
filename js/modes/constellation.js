// ── CONSTELLATION MAP ──────────────────────────────────────────────────────
// Used by: RENDERERS. Uses dp() from the cut tracer to simplify lines.
function renderConstellation(c, nodes, density, sigma, weight, seed) {
    let s = seed * 404;
    let cx = 0;
    let cy = 0;
    nodes.forEach(n => {
        cx += n.x;
        cy += n.y;
    });
    cx /= (nodes.length || 1);
    cy /= (nodes.length || 1);

    // Organic boundary constraints
    const sortedNodes = [...nodes].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    const expandedPoly = sortedNodes.map(n => {
        let dx = n.x - cx;
        let dy = n.y - cy;
        return {
            x: cx + dx * 1.8,
            y: cy + dy * 1.8
        };
    });

    let maxR = 0;
    nodes.forEach(n => {
        const d = Math.hypot(n.x - cx, n.y - cy);
        if (d > maxR) maxR = d;
    });
    let mapR = maxR * 1.8;

    const COL_LINE = 'rgba(228, 221, 208, 0.8)', COL_FAINT = 'rgba(228, 221, 208, 0.5)';
    const COL_STAR = '#e4ddd0'; // Solid bone

    // 1. Generate minor star points inside organic bounds
    let stars = [];
    const RG = fillRegion();
    let numStars = Math.round(density * 12 * (RG ? RG.scale(mapR) : 1));
    let attempts = 0;
    while (stars.length < numStars && attempts < 4000) {
        attempts++;
        let a = sr(s++) * Math.PI * 2;
        let d = Math.sqrt(sr(s++)) * mapR;
        let pt = RG ? regionSample(RG, () => sr(s++)) : {
            x: cx + Math.cos(a) * d,
            y: cy + Math.sin(a) * d
        };
        if (RG || pip(pt, expandedPoly)) {
            stars.push({
                x: pt.x,
                y: pt.y,
                r: weight * (1.2 + sr(s++) * 1.4),
                isNode: false
            });
        }
    }

    // Include primary nodes as major stars
    nodes.forEach(n => {
        stars.push({
            x: n.x,
            y: n.y,
            r: weight * 3.2 * (n.size || 1) * Math.sqrt(n.w || 1),
            isNode: true
        });
    });

    // 2. Build Minimum Spanning Tree to connect constellations
    let edges = [];
    for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
            let dist = Math.hypot(stars[j].x - stars[i].x, stars[i].y - stars[j].y);
            edges.push({ i, j, dist });
        }
    }
    edges.sort((a, b) => a.dist - b.dist);

    let parent = Array.from({ length: stars.length }, (_, i) => i);
    let hasNode = Array.from({ length: stars.length }, (_, i) => stars[i].isNode);

    function find(i) {
        return parent[i] === i ? i : (parent[i] = find(parent[i]));
    }

    function union(i, j) {
        let rootI = find(i);
        let rootJ = find(j);

        if (rootI === rootJ) return false;

        // Prevent different constellations from connecting to each other
        if (hasNode[rootI] && hasNode[rootJ]) return false;

        parent[rootI] = rootJ;
        hasNode[rootJ] = hasNode[rootJ] || hasNode[rootI];
        return true;
    }

    let mainLines = [];
    let faintLines = [];
    let maxDist = Math.max(100, (800 / density) * 1.2);

    let extraLineChance = (sigma / 100) * 0.25;

    for (let e of edges) {
        if (e.dist > maxDist) continue;

        if (union(e.i, e.j)) {
            mainLines.push(e);
        } else {
            // Only allow faint jitter lines (cycles) strictly WITHIN the same constellation
            let rootI = find(e.i);
            let rootJ = find(e.j);
            if (rootI === rootJ && sr(s++) < extraLineChance && e.dist < maxDist * 0.6) {
                faintLines.push(e);
            }
        }
    }

    // 3. Draw Background Nebula Dust based on Density and Jitter
    c.fillStyle = '#ffffff';
    c.globalAlpha = 0.25 + (sigma / 100) * 0.2;
    let numDust = density * 40 * (1 + (sigma / 100)) * (RG ? RG.scale(mapR) : 1);
    for (let i = 0; i < numDust; i++) {
        let a = sr(s++) * Math.PI * 2;
        let d = Math.sqrt(sr(s++)) * mapR * 1.2;
        const dp = RG ? regionSample(RG, () => sr(s++)) : { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
        c.beginPath();
        c.arc(dp.x, dp.y, weight * (0.2 + sr(s++) * 0.5), 0, Math.PI * 2);
        c.fill();
    }
    c.globalAlpha = 1.0;

    // 4. Draw Constellation Paths
    c.strokeStyle = COL_LINE;
    c.lineWidth = weight * 1.3;
    if (c.setLineDash) c.setLineDash([]);

    c.beginPath();
    mainLines.forEach(e => {
        c.moveTo(stars[e.i].x, stars[e.i].y);
        c.lineTo(stars[e.j].x, stars[e.j].y);
    });
    c.stroke();

    // Secondary faint paths
    if (faintLines.length > 0) {
        c.strokeStyle = COL_FAINT;
        c.lineWidth = weight * 0.8;
        if (c.setLineDash) c.setLineDash([weight * 3, weight * 4]);

        c.beginPath();
        faintLines.forEach(e => {
            c.moveTo(stars[e.i].x, stars[e.i].y);
            c.lineTo(stars[e.j].x, stars[e.j].y);
        });
        c.stroke();

        if (c.setLineDash) c.setLineDash([]);
    }

    // 5. Draw Stars (masking the lines behind them)
    stars.forEach(st => {
        c.fillStyle = '#040a14';
        c.beginPath();
        c.arc(st.x, st.y, st.r * 1.5, 0, Math.PI * 2);
        c.fill();

        c.fillStyle = COL_STAR;
        if (st.isNode) {
            // Render major nodes as 4-point stars
            let pr = st.r * 2.2;
            let ir = st.r * 0.6;
            c.beginPath();
            if (c.markStar) c.markStar({ x: st.x, y: st.y, r: st.r, col: COL_STAR, kind: 'node', sp: pr, dim: false });
            for (let i = 0; i < 8; i++) {
                let r = (i % 2 === 0) ? pr : ir;
                let a = (i * Math.PI) / 4;
                c.lineTo(st.x + Math.cos(a) * r, st.y + Math.sin(a) * r);
            }
            if (c.closePath) {
                c.closePath();
            } else {
                c.lineTo(st.x + Math.cos(0) * pr, st.y + Math.sin(0) * pr);
            }
            c.fill();
            c.strokeStyle = COL_FAINT;
            c.lineWidth = weight * 0.7;
            c.beginPath(); c.arc(st.x, st.y, pr * 1.25, 0, Math.PI * 2); c.stroke();
        } else {
            // Render minor stars as circles
            c.beginPath();
            if (c.markStar) c.markStar({ x: st.x, y: st.y, r: st.r, col: COL_STAR, kind: 'star', sp: 0, dim: true });
            c.arc(st.x, st.y, st.r, 0, Math.PI * 2);
            c.fill();
        }
    });
}
