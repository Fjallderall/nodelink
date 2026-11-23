// ── SYNAPTIC WEB ───────────────────────────────────────────────────────────
// Used by: RENDERERS. renderMode draws drawManifold (next) under it.
function renderWeb(c, nodes, density, sigma, weight, seed) {
    let s = seed * 888;
    c.globalAlpha = 1.0;
    const depth = Math.max(0, density - 2);   // depth < 0 never hits the base case (stack overflow at density 1)
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const lw = weight * ((nodes[i].w || 1) + (nodes[j].w || 1)) / 2;
            c.lineWidth = lw * 1.6;
            c.globalAlpha = 1;
            drawJaggedThread(c, nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y, depth, s++, sigma);
            // A finer strand alongside (its own jitter), so a link reads as a fibre bundle
            c.lineWidth = lw * 0.7;
            c.globalAlpha = 0.55;
            drawJaggedThread(c, nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y, depth, s++ + 5003, Math.min(100, sigma * 1.3 + 10));
        }
    }
    // Soma: a small solid body at each node
    c.globalAlpha = 1;
    c.fillStyle = '#ddd6c8';
    nodes.forEach(n => { c.beginPath(); c.arc(n.x, n.y, weight * 3.2 * (n.size || 1), 0, Math.PI * 2); c.fill(); });
}

// ── MANIFOLD BOUNDARY ──────────────────────────────────────────────────────
// The soft outer ring of Web mode; drawn by renderMode before renderWeb.
function drawManifold(c, nodes, sigma, weight) {
  const cx = nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length;
  const cy = nodes.reduce((sum, n) => sum + n.y, 0) / nodes.length;
  let maxR = 0;

  nodes.forEach(n => {
      const d = Math.hypot(n.x - cx, n.y - cy);
      if (d > maxR) maxR = d;
  });

  let outerR = maxR * 1.35;
  // Inside a boundary the ring stays inside it (it grows with the nodes'
  // spread, so a scaled-up design would push it past the edge)
  // (the boundary line itself, not the fill region: rings that already fit stay as they were)
  const BP = boundaryPoly(), P = BP && BP.map(ixf);
  if (P && pip({ x: cx, y: cy }, P)) {
    let d = Infinity;
    P.forEach((p, i) => { const q = P[(i + 1) % P.length]; d = Math.min(d, segDist2(cx, cy, p.x, p.y, q.x, q.y)); });
    const jit = (sigma / 100) * 0.05;              // the jitter below reaches outerR × (1 + jit)
    outerR = Math.min(outerR, (d - weight) / (1 + jit));
  }
  const pts = [];
  const numPoints = 180;

  for (let i = 0; i < numPoints; i++) {
    let ang = (i / numPoints) * Math.PI * 2;
    let jitter = (sr(i) - 0.5) * (sigma / 100) * outerR * 0.1;
    pts.push({
        x: cx + Math.cos(ang) * (outerR + jitter),
        y: cy + Math.sin(ang) * (outerR + jitter)
    });
  }

  c.beginPath();
  c.moveTo((pts[0].x + pts[numPoints - 1].x) / 2, (pts[0].y + pts[numPoints - 1].y) / 2);

  for (let i = 0; i < numPoints; i++) {
      let midX = (pts[i].x + pts[(i + 1) % numPoints].x) / 2;
      let midY = (pts[i].y + pts[(i + 1) % numPoints].y) / 2;
      c.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
  }

  c.lineWidth = weight * 0.9;
  c.globalAlpha = 0.42;
  c.stroke();
  c.globalAlpha = 1.0;
}
