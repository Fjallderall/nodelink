// ── SVG EXPORT BUILDER ─────────────────────────────────────────────────────
// Escapes text for SVG attributes and text nodes
// C2S: a stand-in for a canvas 2D context that writes SVG. The renderers
// draw into it unchanged. Used by exportStrokeSVG (EXPORTS).
function escXml(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

class C2S {
    // mmW/mmH: optional physical size in mm. The file is then at scale 1 in
    // mm (width="100mm" with viewBox 0 0 100 …): cutter software such as
    // Cricut Design Space reads that size reliably; px drawing is scaled
    // inside one root group.
    // No <clipPath> is written: cutters ignore it. clip() records the region
    // and paths that cross it are clipped geometrically (see c2sClip*), the
    // page edge included.
    constructor(w, h, mmW, mmH) {
        this.w = w;
        this.h = h;
        const mm = mmW > 0 && mmH > 0, f = v => +v.toFixed(3);
        this.out = mm
          ? `<svg xmlns="http://www.w3.org/2000/svg" width="${f(mmW)}mm" height="${f(mmH)}mm" viewBox="0 0 ${f(mmW)} ${f(mmH)}">`
          : `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
        this.rootG = mm ? `<g transform="scale(${mmW / w})">` : '';
        this.subs = [];
        this.out += `<defs>
            <filter id="glow">
                <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
                <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                </feMerge>
            </filter>
        </defs>` + this.rootG;
        this.path = '';
        this.stack = [];
        this.state = {
            lineWidth: 1,
            strokeStyle: '#ddd6c8',
            fillStyle: '#000',
            globalAlpha: 1,
            lineCap: 'round',
            lineJoin: 'round',
            shadowBlur: 0,
            lineDash: [],
            m: [1, 0, 0, 1, 0, 0],                       // current transform (root px)
            clips: [[[{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]]]   // regions: each a list of polygons
        };
        this.gCount = 0;
        this.isSVG = true;
    }

    get lineWidth() { return this.state.lineWidth; }
    set lineWidth(v) { this.state.lineWidth = v; }

    get strokeStyle() { return this.state.strokeStyle; }
    set strokeStyle(v) { this.state.strokeStyle = v; }

    get fillStyle() { return this.state.fillStyle; }
    set fillStyle(v) { this.state.fillStyle = v; }

    get globalAlpha() { return this.state.globalAlpha; }
    set globalAlpha(v) { this.state.globalAlpha = v; }

    get lineCap() { return this.state.lineCap; }
    set lineCap(v) { this.state.lineCap = v; }

    get lineJoin() { return this.state.lineJoin; }
    set lineJoin(v) { this.state.lineJoin = v; }

    get shadowBlur() { return this.state.shadowBlur; }
    set shadowBlur(v) { this.state.shadowBlur = v; }

    get shadowColor() { return this.state.shadowColor; }
    set shadowColor(v) { this.state.shadowColor = v; }

    setLineDash(d) {
        this.state.lineDash = d;
    }

    save() {
        this.stack.push({
            ...this.state,
            lineDash: [...this.state.lineDash],
            m: this.state.m.slice(),
            gCount: this.gCount
        });
        this.gCount = 0;
    }

    restore() {
        for (let i = 0; i < this.gCount; i++) {
            this.out += `</g>`;
        }
        let pop = this.stack.pop();
        if (pop) {
            this.state = pop;
            this.gCount = pop.gCount;
        }
    }

    translate(x, y) {
        const m = this.state.m;
        m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y;
        this.out += `<g transform="translate(${x},${y})">`;
        this.gCount++;
    }

    scale(x, y) {
        const m = this.state.m;
        m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y;
        this.out += `<g transform="scale(${x},${y})">`;
        this.gCount++;
    }

    rotate(r) {
        const m = this.state.m, co = Math.cos(r), si = Math.sin(r), [a, b, c, d] = m;
        m[0] = a * co + c * si; m[1] = b * co + d * si; m[2] = c * co - a * si; m[3] = d * co - b * si;
        this.out += `<g transform="rotate(${r * 180 / Math.PI})">`;
        this.gCount++;
    }

    // Current transform as a DOMMatrix, like CanvasRenderingContext2D's
    // (renderDesign and the Blink eyes need it)
    getTransform() { return new DOMMatrix(this.state.m); }

    beginPath() {
        this.path = '';
        this.subs = [];
    }
    // Flattened copy of the path: [{ pts, closed }] in local coords
    _pt(x, y) {
        const s = this.subs.at(-1);
        if (!s || s.closed) this.subs.push({ pts: [{ x, y }], closed: false });
        else s.pts.push({ x, y });
    }
    _last() { const s = this.subs.at(-1); return s && s.pts.at(-1); }
    // Segments for a curve whose size is about len local units
    _steps(len) { const k = Math.hypot(this.state.m[0], this.state.m[1]) || 1; return Math.max(4, Math.min(96, Math.ceil(len * k / 3))); }

    moveTo(x, y) {
        this.path += `M ${x} ${y} `;
        this.subs.push({ pts: [{ x, y }], closed: false });
    }

    lineTo(x, y) {
        this.path += `L ${x} ${y} `;
        this._pt(x, y);
    }

    closePath() {
        this.path += 'Z ';
        const s = this.subs.at(-1);
        if (s && !s.closed) { s.closed = true; this.subs.push({ pts: [s.pts[0]], closed: false }); }
    }

    quadraticCurveTo(cx, cy, x, y) {
        this.path += `Q ${cx} ${cy} ${x} ${y} `;
        const p = this._last() || { x: cx, y: cy }, n = this._steps(Math.hypot(cx - p.x, cy - p.y) + Math.hypot(x - cx, y - cy));
        for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; this._pt(u * u * p.x + 2 * u * t * cx + t * t * x, u * u * p.y + 2 * u * t * cy + t * t * y); }
    }

    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
        this.path += `C ${c1x} ${c1y} ${c2x} ${c2y} ${x} ${y} `;
        const p = this._last() || { x: c1x, y: c1y };
        const n = this._steps(Math.hypot(c1x - p.x, c1y - p.y) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(x - c2x, y - c2y));
        for (let i = 1; i <= n; i++) {
            const t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
            this._pt(a * p.x + b * c1x + c * c2x + d * x, a * p.y + b * c1y + c * c2y + d * y);
        }
    }
    // Flattened arc (canvas semantics: joins from the current point)
    _arcPts(x, y, r, sa, sweep, dir, fresh) {
        const n = Math.max(8, Math.min(256, this._steps(r * sweep)));
        if (fresh) this.subs.push({ pts: [], closed: false });
        for (let i = 0; i <= n; i++) { const a = sa + dir * sweep * i / n; this._pt(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    }

    // Full circles and partial arcs (canvas semantics: joins to the start point)
    arc(x, y, r, sa, ea, ccw) {
        let sweep = ccw ? sa - ea : ea - sa;
        if (Math.abs(Math.abs(sweep) - Math.PI * 2) < 1e-3 || Math.abs(sweep) > Math.PI * 2) {
            this.path += `M ${x - r} ${y} A ${r} ${r} 0 1 0 ${x + r} ${y} A ${r} ${r} 0 1 0 ${x - r} ${y} `;
            this._arcPts(x, y, r, Math.PI, Math.PI * 2, -1, true);
            return;
        }
        if (sweep < 0) sweep += Math.PI * 2;          // canvas normalises like this
        const end = ccw ? sa - sweep : sa + sweep;
        const sx = x + Math.cos(sa) * r, sy = y + Math.sin(sa) * r;
        const ex = x + Math.cos(end) * r, ey = y + Math.sin(end) * r;
        this.path += (this.path ? 'L' : 'M') + ` ${sx} ${sy} `;
        this.path += `A ${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} ${ccw ? 0 : 1} ${ex} ${ey} `;
        this._arcPts(x, y, r, sa, sweep, ccw ? -1 : 1, false);
    }

    // Clip to the current path until the matching restore()
    clip() {
        const polys = this.subs.filter(s => s.pts.length > 2).map(s => s.pts.map(p => c2sXf(this.state.m, p)));
        if (polys.length) this.state.clips = [...this.state.clips, polys];
    }
    // Writes the current path with attrs, clipped to the clip regions when it
    // crosses them (drawn as is when wholly inside, dropped when outside)
    // Strokes: kept as strokes where the whole stroke width is inside; segments
    // closer than half the width to a clip edge are outlined into filled
    // polygons and clipped as such (a second <path> with the stroke colour).
    // Dashed strokes keep the old centreline clip (outlining would lose the dashes).
    _emit(attrs, filled) {
        const m = this.state.m, clips = this.state.clips;
        const subs = this.subs.filter(s => s.pts.length > 1 || (filled && s.pts.length > 2));
        const root = subs.map(s => ({ pts: s.pts.map(p => c2sXf(m, p)), closed: s.closed }));
        const dashed = this.state.lineDash && this.state.lineDash.length;
        const h = filled || dashed ? 0 : this.state.lineWidth * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) / 2;
        const ok = h > 0 ? p => c2sSafe(clips, p, h) : p => c2sInside(clips, p);
        const safe = root.map(s => s.pts.map(ok));
        if (safe.every(a => a.every(Boolean))) {
            this.out += `<path d="${this.path}" ${attrs} />`;
            return;
        }
        const inv = c2sInv(m), f = v => (Math.round(v * 1000) / 1000).toString();
        let d = '', dOut = '';
        const put = (pts, close, toOut) => {
            let t = '';
            pts.forEach((p, i) => { const q = c2sXf(inv, p); t += (i ? 'L' : 'M') + f(q.x) + ' ' + f(q.y); });
            if (close) t += 'Z';
            if (toOut) dOut += t; else d += t;
        };
        if (filled) root.forEach(s => { if (s.pts.length > 2) c2sClipPoly(s.pts, clips).forEach(pg => put(pg, true)); });
        else if (!h) root.forEach(s => c2sClipLine(s.closed ? [...s.pts, s.pts[0]] : s.pts, clips).forEach(pl => put(pl, false)));
        else root.forEach((s, k) => {
            const pts = s.closed ? [...s.pts, s.pts[0]] : s.pts, sf = s.closed ? [...safe[k], safe[k][0]] : safe[k];
            if (sf.every(Boolean)) { put(pts, s.closed, false); return; }
            // Runs of safe segments stay strokes; the rest is outlined
            let i = 0;
            while (i < pts.length - 1) {
                const isSafe = sf[i] && sf[i + 1];
                let j = i;
                while (j < pts.length - 1 && (sf[j] && sf[j + 1]) === isSafe) j++;
                if (isSafe) put(pts.slice(i, j + 1), false, false);
                else c2sOutline(pts, i, j, h, this.state.lineCap, this.state.lineJoin, s.closed, this.state.miterLimit)
                    .forEach(pg => c2sClipPoly(pg, clips).forEach(q => put(q, true, true)));
                i = j;
            }
        });
        if (d) this.out += `<path d="${d}" ${attrs} />`;
        if (dOut) {
            const filt = /filter="[^"]*"/.exec(attrs);
            this.out += `<path d="${dOut}" fill="${this.state.strokeStyle}" opacity="${this.state.globalAlpha}" ${filt ? filt[0] : ''} />`;
        }
    }

    get font() { return this.state.font || '10px serif'; }
    set font(v) { this.state.font = v; }
    get textAlign() { return this.state.textAlign || 'start'; }
    set textAlign(v) { this.state.textAlign = v; }
    get textBaseline() { return this.state.textBaseline || 'alphabetic'; }
    set textBaseline(v) { this.state.textBaseline = v; }

    textAttrs() {
        const m = /([\d.]+)px\s+(.+)$/.exec(this.font);
        const size = m ? m[1] : 10;
        const fam = (m ? m[2] : 'serif').replace(/"/g, "'");
        const anchor = { center: 'middle', right: 'end', end: 'end' }[this.state.textAlign] || 'start';
        const base = { middle: 'central', top: 'hanging', hanging: 'hanging' }[this.state.textBaseline] || 'alphabetic';
        return `font-size="${size}" font-family="${fam}" text-anchor="${anchor}" dominant-baseline="${base}"`;
    }

    fillText(t, x, y) {
        if (!c2sInside(this.state.clips, c2sXf(this.state.m, { x, y }))) return;
        this.out += `<text x="${x}" y="${y}" ${this.textAttrs()} fill="${this.state.fillStyle}" opacity="${this.state.globalAlpha}">${escXml(t)}</text>`;
    }

    strokeText(t, x, y) {
        if (!c2sInside(this.state.clips, c2sXf(this.state.m, { x, y }))) return;
        this.out += `<text x="${x}" y="${y}" ${this.textAttrs()} fill="none" stroke="${this.state.strokeStyle}" stroke-width="${this.state.lineWidth}" stroke-linejoin="round" opacity="${this.state.globalAlpha}">${escXml(t)}</text>`;
    }

    rect(x, y, w, h) {
        this.path += `M ${x} ${y} h ${w} v ${h} h ${-w} Z `;
        this.subs.push({ pts: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], closed: true });
        this.subs.push({ pts: [{ x, y }], closed: false });
    }

    fillRect(x, y, w, h) {
        const keep = [this.path, this.subs];
        this.path = `M ${x} ${y} h ${w} v ${h} h ${-w} Z `;
        this.subs = [{ pts: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], closed: true }];
        this._emit(`fill="${this.state.fillStyle}" opacity="${this.state.globalAlpha}"`, true);
        [this.path, this.subs] = keep;
    }

    roundRect(x, y, w, h, r) {
        if (typeof r === 'undefined') r = 0;
        this.path += `M ${x + r} ${y} h ${w - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r} v ${h - 2 * r} a ${r} ${r} 0 0 1 ${-r} ${r} h ${-(w - 2 * r)} a ${r} ${r} 0 0 1 ${-r} ${-r} v ${-(h - 2 * r)} a ${r} ${r} 0 0 1 ${r} ${-r} Z `;
        this.subs.push({ pts: [], closed: false });
        const H = Math.PI / 2;
        this._arcPts(x + w - r, y + r, r, -H, H, 1, false); this._arcPts(x + w - r, y + h - r, r, 0, H, 1, false);
        this._arcPts(x + r, y + h - r, r, H, H, 1, false); this._arcPts(x + r, y + r, r, Math.PI, H, 1, false);
        this.closePath();
    }

    fill() {
        if (!this.path) return;
        let filter = this.state.shadowBlur > 0 ? `filter="url(#glow)"` : '';
        this._emit(`fill="${this.state.fillStyle}" opacity="${this.state.globalAlpha}" ${filter}`, true);
    }

    stroke() {
        if (!this.path) return;
        let filter = this.state.shadowBlur > 0 ? `filter="url(#glow)"` : '';
        let dashAttr = this.state.lineDash && this.state.lineDash.length ? `stroke-dasharray="${this.state.lineDash.join(',')}"` : '';
        this._emit(`fill="none" stroke="${this.state.strokeStyle}" stroke-width="${this.state.lineWidth}" stroke-linecap="${this.state.lineCap}" stroke-linejoin="${this.state.lineJoin}" opacity="${this.state.globalAlpha}" ${dashAttr} ${filter}`, false);
    }

    getSvg() {
        for (let i = 0; i < this.gCount; i++) {
            this.out += `</g>`;
        }
        return this.out + (this.rootG ? '</g>' : '') + `</svg>`;
    }
}
