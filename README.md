# NodeLink

A node-based pattern generator that runs in the browser. Place up to nine nodes, pick a mode, and NodeLink grows a design between them: circuit boards, synaptic webs, spiderwebs, lightning, nebulae, constellations, foam, microscope slides, arcane circles, geometrical schematics, stained glass, cathedral glass, vines and water circles.

## What it does

- **Modes and layers**: one mode per design, plus an optional second layer in another mode.
- **Composition**: symmetry (rotational and kaleidoscope), boundaries (circle, square, pentagon, hexagon), page formats, design scale, rotation and position.
- **Animation**: Draw on, Drift, Morph, Flow and per-mode effects (current, twinkle, strikes, wind, bloom, seasons, falling petals, sunlight, breathing, microscope life, turning rings).
- **Exports**:
  - PNG with transparency, at a chosen size and DPI (for Procreate and print)
  - strokes SVG (editable vector)
  - cut SVG for Cricut vinyl, iron-on, paint stencils and laser cutting, with minimum line width, gap and piece size per material
  - loop video (MP4, 5–60 s, Full HD, 4K or the screen's size) that plays on repeat without a visible seam, for a TV or projector
- **Library**: save and load designs as `.json`, favourites, undo / redo.

Everything runs in the browser; nothing is uploaded.

## Running it

Open `index.html` in a browser (double-click works). No build step, no dependencies.

## Code layout

- `index.html`: markup only
- `css/nodelink.css`: all styles
- `js/`: plain scripts, loaded in order by `index.html` and sharing one global scope (no modules, so it also runs from `file://`)
  - `core.js`, `svg-builder.js`: state, layers, RNG, geometry, the SVG builder
  - `modes/`: one file per generator mode
  - `display-list.js`, `compose.js`, `anim-effects.js`, `palette.js`: recording, symmetry and composition, animation effects, colour schemes
  - `render-export.js`, `animation.js`, `loop-video.js`, `design-io.js`, `ui.js`, `help.js`: rendering and exports, the animation loop, the loop video export, history and favourites, the interface, the first-visit screen and help mode

The developer overview at the top of `js/core.js` explains how a picture is made. Tests are in `tests/`.

## Credits

Made by Fjallderall with Gemini and Claude. The About page in the app (menu title, or the bottom of the Library tab) tells how.

## Licence

MIT, see [LICENSE](LICENSE).
