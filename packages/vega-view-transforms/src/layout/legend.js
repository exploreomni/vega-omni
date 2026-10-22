import {
  All, Auto, Bottom, BottomLeft, BottomRight, Bounds, Column, Each, End,
  Flush, Group, Left, Middle, None, Right, Start, Symbols, Top,
  TopLeft, TopRight
} from '../constants.js';
import {bboxFull, get, gridLayoutGroups} from './grid.js';
import {
  MinViewHeight, legendScrollLayout, legendScrollbarLayout, shrink
} from './legend-scroll.js';
import {boundStroke, multiLineOffset} from 'vega-scenegraph';

// utility for looking up legend layout configuration
function lookup(config, orient) {
  const opt = config[orient] || {};
  return (key, d) => opt[key] != null ? opt[key]
    : config[key] != null ? config[key]
    : d;
}

// if legends specify offset directly, use the maximum specified value
function offsets(legends, value) {
  let max = -Infinity;
  legends.forEach(item => {
    if (item.offset != null) max = Math.max(max, item.offset);
  });
  return max > -Infinity ? max : value;
}

export function legendParams(g, orient, config, xb, yb, w, h) {
  const _ = lookup(config, orient),
        offset = offsets(g, _('offset', 0)),
        anchor = _('anchor', Start),
        frame = _('frame', Group),
        mult = anchor === End ? 1 : anchor === Middle ? 0.5 : 0,
        ax = frame === Bounds ? xb.x1 + mult * xb.width() : mult * (w || yb.width() + 2 * yb.x1),
        ay = frame === Bounds ? yb.y1 + mult * yb.height() : mult * (h || xb.height() + 2 * xb.y1);

  const p = {
    align:   Each,
    bounds:  _('bounds', Flush),
    columns: _('direction') === 'vertical' ? 1 : g.length,
    span:    frame === Bounds ? xb.width() : (w || yb.width() + 2 * yb.x1),
    padding: _('margin', 8),
    center:  _('center'),
    nodirty: true
  };

  switch (orient) {
    case Left:
      p.anchor = {
        x: Math.floor(xb.x1) - offset, column: End,
        y: ay,
        row: anchor
      };
      break;
    case Right:
      p.anchor = {
        x: Math.ceil(xb.x2) + offset,
        y: ay,
        row: anchor
      };
      break;
    case Top:
      p.anchor = {
        y: Math.floor(yb.y1) - offset, row: End,
        x: ax,
        column: anchor
      };
      break;
    case Bottom:
      p.anchor = {
        y: Math.ceil(yb.y2) + offset,
        x: ax,
        column: anchor
      };
      break;
    case TopLeft:
      p.anchor = {x: offset, y: offset};
      break;
    case TopRight:
      p.anchor = {x: w - offset, y: offset, column: End};
      break;
    case BottomLeft:
      p.anchor = {x: offset, y: h - offset, row: End};
      break;
    case BottomRight:
      p.anchor = {x: w - offset, y: h - offset, column: End, row: End};
      break;
  }

  return p;
}

/**
 * Resolve `columns: "auto"` for a legend entry group: the most columns whose
 * grid fits the legend's maxWidth, measured as gridLayout will place them.
 * Entries get row and column in row-major order.
 */
export function legendEntryColumns(group, opt) {
  if (opt.columns !== Auto) return opt;

  const legend = group.mark.group,
        entries = gridLayoutGroups(group).marks,
        // a scrollable legend keeps its scrollbar gutter whether or not it overflows
        gutter = legend.maxHeight != null ? 2 * (legend.scrollbarWidth || 0) : 0,
        avail = (opt.maxWidth != null ? opt.maxWidth : Infinity)
          - 2 * (legend.padding || 0) - gutter,
        columns = fitColumns(entries.map(bboxFull), avail,
          get(opt.align, Column), get(opt.padding, Column));

  entries.forEach((g, i) => {
    g.column = i % columns;
    g.row = Math.floor(i / columns);
  });

  return {...opt, columns};
}

export function fitColumns(boxes, avail, align, padding) {
  const n = boxes.length,
        widths = boxes.map(b => Math.ceil(b.x2)),
        insets = boxes.map(b => b.x1 < 0 ? Math.ceil(-b.x1) : 0),
        wmin = widths.reduce((a, b) => Math.min(a, b), Infinity),
        wmax = widths.reduce((a, b) => Math.max(a, b), 0);

  // total width of an n-entry grid with ncols columns
  const width = ncols => {
    let w = 0, c, i, cw, ci;
    for (c = 0; c < ncols; ++c) {
      for (cw = 0, ci = 0, i = c; i < n; i += ncols) {
        cw = Math.max(cw, widths[i]);
        ci = Math.max(ci, insets[i]);
      }
      w += (align === All ? wmax : cw) + (c ? padding + ci : 0);
    }
    return w;
  };

  // no wider grid fits even if every column were as narrow as the narrowest entry
  const most = Math.floor((avail + padding) / (wmin + padding));
  let ncols = most < n ? Math.max(1, most) : n;
  while (ncols > 1 && width(ncols) > avail) --ncols;
  return Math.max(1, ncols);
}

/**
 * Lay out a legend. A slot's fit may call it again at a `maxHeight` budget
 * or `viewWidth` (`again`), which keeps the bounds the first call cached:
 * they are the legend's last rendered location, which ViewLayout dirties.
 */
export function legendLayout(view, legend, maxHeight, viewWidth, again) {
  var item = legend.items[0],
      datum = item.datum,
      orient = item.orient,
      bounds = item.bounds,
      x = item.x, y = item.y, w, h;

  // cache current bounds for later comparison
  if (!again) {
    item._bounds
      ? item._bounds.clear().union(bounds)
      : item._bounds = bounds.clone();
  }
  bounds.clear();

  const entry = item.items[0].items[0],
        scroll = datum.type === Symbols && item.maxHeight != null;

  // clip entries to maxHeight before the title is placed against them
  if (scroll) {
    legendScrollLayout(view, item, entry,
      maxHeight != null ? maxHeight : item.maxHeight, viewWidth);
  }

  // adjust legend to accommodate padding and title
  legendGroupLayout(view, item, entry);

  if (scroll) legendScrollbarLayout(view, item, entry);

  // aggregate bounds to determine size, and include origin
  bounds = legendBounds(item, bounds);
  w = 2 * item.padding;
  h = 2 * item.padding;
  if (!bounds.empty()) {
    w = Math.ceil(bounds.width() + w);
    h = Math.ceil(bounds.height() + h);
  }

  if (datum.type === Symbols) {
    legendEntryLayout(item.items[0].items[0].items[0].items);
  }

  if (orient !== None) {
    item.x = x = 0;
    item.y = y = 0;
  }
  item.width = w;
  item.height = h;
  boundStroke(bounds.set(x, y, x + w, y + h), item);
  item.mark.bounds.clear().union(bounds);

  return item;
}

/**
 * Fit the legends stacked in one orient column within the largest maxHeight
 * among them. Legends without a maxHeight keep their height; scrollable ones
 * give up viewport in proportion, down to MinViewHeight, and are laid out
 * again at the reduced budget. In a top or bottom slot `span` is the slot's
 * width, which a scrolling legend's viewport widens to (see legendRowLayout);
 * in a left or right slot `room` caps the budget (see legendSideLayout).
 */
export function legendColumnLayout(view, legends, margin, span, room) {
  const items = legends.map(mark => mark.items[0]),
        maxHeight = Math.max(...items.map(item => item.maxHeight != null ? item.maxHeight : -Infinity)),
        budget = room != null ? Math.min(maxHeight, room) : maxHeight,
        excess = budget > 0
          ? items.reduce((h, item) => h + item.height, margin * (items.length - 1)) - budget
          : 0,
        reducible = items.map(item => excess > 0 && item.maxHeight != null
          ? Math.max(0, item.items[0].items[0].bounds.height() - MinViewHeight)
          : 0);

  shrink(reducible, Math.max(0, excess)).forEach((dh, i) => {
    if (dh > 0) legendLayout(view, legends[i], items[i].height - dh, span, true);
    else if (span != null && items[i]._scrollMax > 0) legendLayout(view, legends[i], null, span, true);
  });
}

/**
 * A scrolling legend alone in a top or bottom slot widens its viewport to
 * the slot, so its scrollbar sits at the slot's edge, not against the last
 * column.
 */
export function legendRowLayout(view, legends, span) {
  const item = legends[0].items[0];
  if (legends.length === 1 && item._scrollMax > 0) legendLayout(view, legends[0], null, span, true);
}

/**
 * A scrolling legend alone in a left or right slot stays within `room`, the
 * height beside the plot and its axes from where the legend starts: a
 * maxHeight taken from the container would run past the plot's bottom once
 * a top or bottom legend has taken some of that height.
 */
export function legendSideLayout(view, legends, room) {
  const item = legends[0].items[0];
  if (item.maxHeight != null && item.maxHeight > room) legendLayout(view, legends[0], room, null, true);
}

/** The height beside the plot a left or right legend can take, from where it starts. */
export function legendRoom(params, yb) {
  const a = params.anchor;
  return Math.max(MinViewHeight, a.row === End ? a.y - yb.y1
    : a.row === Middle ? yb.height()
    : yb.y2 - a.y);
}

function legendBounds(item, b) {
  // aggregate item bounds
  item.items.forEach(_ => b.union(_.bounds));

  if (b.empty()) {
    // set upper-right corner for empty legends (e.g., no entries or title);
    // otherwise the -MAX_VALUE sentinel extents would survive the x1/y1
    // anchoring below, inflating legend size and autosize layout (#2881)
    b.x2 = item.padding;
    b.y2 = item.padding;
  }

  // anchor to legend origin
  b.x1 = item.padding;
  b.y1 = item.padding;

  return b;
}

function legendGroupLayout(view, item, entry) {
  var pad = item.padding,
      ex = pad - entry.x,
      ey = pad - entry.y;

  if (!item.datum.title) {
    if (ex || ey) translate(view, entry, ex, ey);
  } else {
    var title = item.items[1].items[0],
        anchor = title.anchor,
        tpad = item.titlePadding || 0,
        tx = pad - title.x,
        ty = pad - title.y;

    switch (title.orient) {
      case Left:
        ex += Math.ceil(title.bounds.width()) + tpad;
        break;
      case Right:
      case Bottom:
        break;
      default:
        ey += title.bounds.height() + tpad;
    }
    if (ex || ey) translate(view, entry, ex, ey);

    switch (title.orient) {
      case Left:
        ty += legendTitleOffset(item, entry, title, anchor, 1, 1);
        break;
      case Right:
        tx += legendTitleOffset(item, entry, title, End, 0, 0) + tpad;
        ty += legendTitleOffset(item, entry, title, anchor, 1, 1);
        break;
      case Bottom:
        tx += legendTitleOffset(item, entry, title, anchor, 0, 0);
        ty += legendTitleOffset(item, entry, title, End, -1, 0, 1) + tpad;
        break;
      default:
        tx += legendTitleOffset(item, entry, title, anchor, 0, 0);
    }
    if (tx || ty) translate(view, title, tx, ty);

    // translate legend if title pushes into negative coordinates
    if ((tx = Math.round(title.bounds.x1 - pad)) < 0) {
      translate(view, entry, -tx, 0);
      translate(view, title, -tx, 0);
    }
  }
}

function legendTitleOffset(item, entry, title, anchor, y, lr, noBar) {
  const grad = item.datum.type !== 'symbol',
        vgrad = title.datum.vgrad,
        e = grad && (lr || !vgrad) && !noBar ? entry.items[0] : entry,
        s = e.bounds[y ? 'y2' : 'x2'] - item.padding,
        u = vgrad && lr ? s : 0,
        v = vgrad && lr ? 0 : s,
        o = y <= 0 ? 0 : multiLineOffset(title);

  return Math.round(anchor === Start ? u
    : anchor === End ? (v - o)
    : 0.5 * (s - o));
}

function translate(view, item, dx, dy) {
  item.x += dx;
  item.y += dy;
  item.bounds.translate(dx, dy);
  item.mark.bounds.translate(dx, dy);
  view.dirty(item);
}

function legendEntryLayout(entries) {
  // get max widths for each column
  const widths = entries.reduce((w, g) => {
    w[g.column] = Math.max(g.bounds.x2 - g.x, w[g.column] || 0);
    return w;
  }, {});

  // set dimensions of legend entry groups
  entries.forEach(g => {
    g.width  = widths[g.column];
    g.height = g.bounds.y2 - g.y;
  });
}
