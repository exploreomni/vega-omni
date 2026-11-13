import {textMetrics} from 'vega-scenegraph';

const Aligns = ['right', 'center', 'left'],
      Baselines = ['bottom', 'middle', 'top'];

export default function($, bitmaps, anchors, offsets, overlap) {
  const width = $.width,
        height = $.height,
        bm0 = bitmaps[0],
        bm1 = bitmaps[1],
        n = offsets.length,
        // labels allowed to overlap get a last pass that takes the first anchor
        m = overlap ? n + 1 : n;

  return function(d) {
    const boundary = d.boundary,
          textHeight = d.datum.fontSize;

    // an item with no text has nothing to place, and takes no space
    if (d.datum.text == null || d.datum.text === '') {
      return false;
    }

    // can not be placed if the mark is not visible in the graph bound
    if (boundary[2] < 0 || boundary[5] < 0 || boundary[0] > width || boundary[3] > height) {
      return false;
    }

    let textWidth = d.textWidth ?? 0,
        i, force, dx, dy, isInside, sizeFactor, insideFactor,
        x1, x2, y1, y2, xc, yc,
        _x1, _x2, _y1, _y2;

    // for each anchor and offset
    for (let k=0; k<m; ++k) {
      force = k === n;
      i = force ? 0 : k;
      dx = (anchors[i] & 0x3) - 1;
      dy = ((anchors[i] >>> 0x2) & 0x3) - 1;
      if (d.mirror) {
        dx = -dx;
        dy = -dy;
      }

      isInside = (dx === 0 && dy === 0) || offsets[i] < 0;
      sizeFactor = dx && dy ? Math.SQRT1_2 : 1;
      insideFactor = offsets[i] < 0 ? -1 : 1;

      x1 = boundary[1 + dx] + offsets[i] * dx * sizeFactor;
      yc = boundary[4 + dy] + (insideFactor * textHeight * dy) / 2 + offsets[i] * dy * sizeFactor;
      y1 = yc - textHeight / 2;
      y2 = yc + textHeight / 2;

      _x1 = $(x1);
      _y1 = $(y1);
      _y2 = $(y2);

      if (!textWidth) {
        // to avoid finding width of text label,
        if (!force && !test(_x1, _x1, _y1, _y2, bm0, bm1, x1, x1, y1, y2, boundary, isInside, overlap)) {
          // skip this anchor/offset option if we fail to place a label with 1px width
          continue;
        } else {
          // Otherwise, find the label width
          textWidth = textMetrics.width(d.datum, d.datum.text);
        }
      }

      xc = x1 + (insideFactor * textWidth * dx) / 2;
      x1 = xc - textWidth / 2;
      x2 = xc + textWidth / 2;

      _x1 = $(x1);
      _x2 = $(x2);

      if (force || test(_x1, _x2, _y1, _y2, bm0, bm1, x1, x2, y1, y2, boundary, isInside, overlap)) {
        // place label if the position is placeable
        d.x = !dx ? xc : dx * insideFactor < 0 ? x2 : x1;
        d.y = !dy ? yc : dy * insideFactor < 0 ? y2 : y1;

        d.align = Aligns[dx * insideFactor + 1];
        d.baseline = Baselines[dy * insideFactor + 1];

        if (!overlap) bm0.setRange(_x1, _y1, _x2, _y2);
        return true;
      }
    }

    return false;
  };
}

// Test if a label with the given dimensions can be added without overlap.
// A label allowed to overlap need only stay in bounds.
function test(_x1, _x2, _y1, _y2, bm0, bm1, x1, x2, y1, y2, boundary, isInside, overlap) {
  return !(
    bm0.outOfBounds(_x1, _y1, _x2, _y2) ||
    (!overlap && ((isInside && bm1) || bm0).getRange(_x1, _y1, _x2, _y2))
  );
}
