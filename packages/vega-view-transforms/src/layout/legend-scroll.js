import {Left, Right} from '../constants.js';
import {Marks} from 'vega-scenegraph';

const LegendRole = 'legend',
      ScrollbarRole = 'legend-scrollbar',
      ScrollFadeRole = 'legend-scroll-fade',
      WheelEvent = 'wheel',
      TouchStartEvent = 'touchstart',
      TouchMoveEvent = 'touchmove',
      LineHeight = 16,
      FadeHeight = 24;

const clamp = (v, max) => Math.max(0, Math.min(max, v || 0));

/**
 * Size a symbol legend's entry group to a height budget, and to a viewport
 * width when given. Overflowing entries are clipped and shifted by the
 * legend's scroll offset. Runs before the title is placed; the viewport
 * leaves room for it.
 */
export function legendScrollLayout(view, item, entry, maxHeight, viewWidth) {
  const scope = entry.items[0],
        title = item.datum.title ? item.items[1].items[0] : null,
        stacked = title && title.orient !== Left && title.orient !== Right,
        pad = item.padding || 0,
        bar = item.scrollbarWidth || 0,
        // a left or right title sits beside the viewport
        beside = title && !stacked ? Math.ceil(title.bounds.width()) + (item.titlePadding || 0) : 0,
        room = Math.floor(maxHeight - 2 * pad
          - (stacked ? title.bounds.height() + (item.titlePadding || 0) : 0)),
        row = scope.items.length ? Math.ceil(scope.items[0].bounds.height()) : 0,
        // a budget keeps at least one entry in view; none at all (an unsized
        // container) draws the legend unclipped
        viewHeight = maxHeight > 0 ? Math.max(room, row) : room,
        contentHeight = Math.ceil(scope.bounds.y2 + (entry._scrollY || 0)),
        max = viewHeight > 0 ? contentHeight - viewHeight : 0;

  item._scrollMax = Math.max(0, max);
  item._scrollView = viewHeight;
  // _scrollWanted is the offset a wheel or touch asked for. A layout may
  // measure at a bigger viewport first, even one where everything fits;
  // clamping _scroll there would lose the end of the list once a later pass
  // narrows the viewport.
  item._scroll = max > 0
    ? Math.round(clamp(item._scrollWanted != null ? item._scrollWanted : item._scroll, max))
    : 0;
  scrollEntries(view, entry, item._scroll);

  if (max > 0) {
    legendScrollEvents(view);
    entry.clip = true;
    entry.width = Math.max(
      Math.ceil(scope.bounds.x2) + 2 * bar,
      viewWidth != null
        ? Math.min(viewWidth, item.maxWidth != null ? item.maxWidth : Infinity) - 2 * pad - beside
        : 0
    );
    entry.height = viewHeight;
    entry.bounds.set(entry.x, entry.y, entry.x + entry.width, entry.y + entry.height);
  } else {
    entry.clip = false;
    entry.width = entry.height = 0;
    entry.bounds.clear().union(scope.bounds).translate(entry.x, entry.y);
  }
  entry.mark.bounds.clear().union(entry.bounds);
  view.dirty(entry);
}

/**
 * Shift a legend entry group's entries so `scroll` pixels of content sit
 * above the viewport. The applied offset is kept on the group, so repeat
 * calls move entries by the difference only.
 */
export function scrollEntries(view, entry, scroll) {
  const scope = entry.items[0],
        dy = scroll - (entry._scrollY || 0);
  if (!dy) return;
  scope.items.forEach(g => {
    g.y -= dy;
    g.bounds.translate(0, -dy);
    view.dirty(g);
  });
  scope.bounds.translate(0, -dy);
  entry._scrollY = scroll;
}

/** The viewport height a scrollable legend keeps when its slot is short of room. */
export const MinViewHeight = 40;

/** Split `excess` across `reducible` in proportion, taking no more than each can give. */
export function shrink(reducible, excess) {
  const total = reducible.reduce((a, b) => a + b, 0),
        take = Math.min(excess, total);
  return reducible.map(r => total ? Math.round(take * r / total) : 0);
}

/**
 * Register the view's wheel and touch listeners once a legend can scroll.
 * Handlers run inside the browser's event dispatch, so preventDefault lands
 * before the page scrolls; a wheel or drag past either end is left to the
 * page. A touchmove carries the item its touchstart picked.
 */
export function legendScrollEvents(view) {
  if (view._legendScroll || !view.addEventListener) return;
  view._legendScroll = true;
  // the y of a touch dragging a legend; null when the drag began elsewhere
  let touchY = null;

  view.addEventListener(WheelEvent, (evt, item) => {
    const legend = scrollableLegend(item);
    if (legend) scrollLegend(view, legend, wheelDelta(evt, legend._scrollView), evt);
  });
  view.addEventListener(TouchStartEvent, (evt, item) => {
    touchY = scrollableLegend(item) ? evt.changedTouches[0].clientY : null;
  });
  view.addEventListener(TouchMoveEvent, (evt, item) => {
    const legend = scrollableLegend(item);
    if (!legend || touchY == null) return;
    const y = evt.changedTouches[0].clientY;
    scrollLegend(view, legend, touchY - y, evt);
    touchY = y;
  });
}

// The offset keeps its fraction so small trackpad deltas add up; entries
// sit on whole pixels, which keeps canvas text sharp.
function scrollLegend(view, legend, delta, evt) {
  const max = legend._scrollMax,
        from = clamp(legend._scrollWanted != null ? legend._scrollWanted : legend._scroll, max),
        wanted = clamp(from + delta, max);
  if (wanted === from) return;

  evt.preventDefault();
  legend._scrollWanted = wanted;
  const scroll = Math.round(wanted);
  if (scroll === legend._scroll) return;

  legend._scroll = scroll;
  const entry = legend.items[0].items[0];
  scrollEntries(view, entry, scroll);
  view.dirty(entry);
  legendScrollbarLayout(view, legend, entry);
  view.runAsync();
}

function scrollableLegend(item) {
  for (; item; item = item.mark.group) {
    if (item.mark.role === LegendRole) return item._scrollMax > 0 ? item : null;
  }
  return null;
}

function wheelDelta(evt, viewHeight) {
  return evt.deltaMode === 1 ? evt.deltaY * LineHeight
    : evt.deltaMode === 2 ? evt.deltaY * viewHeight
    : evt.deltaY;
}

/**
 * Place the scrollbar thumb along the right edge of the entry viewport, and
 * the fade over the viewport's last rows while more can be scrolled.
 */
export function legendScrollbarLayout(view, item, entry) {
  const max = item._scrollMax,
        viewHeight = item._scrollView,
        w = item.scrollbarWidth || 0,
        h = max > 0
          ? Math.min(viewHeight, Math.max(2 * w, Math.round(viewHeight * viewHeight / (viewHeight + max))))
          : 0,
        thumb = legendPart(item, ScrollbarRole),
        fade = legendPart(item, ScrollFadeRole);

  if (thumb) {
    thumb.cornerRadius = w / 2;
    placeRect(view, thumb, {
      x: entry.x + entry.width - (max > 0 ? w : 0),
      y: entry.y + (max > 0 ? Math.round((viewHeight - h) * item._scroll / max) : 0),
      width: max > 0 ? w : 0,
      height: h
    });
  }
  if (fade) {
    const fh = max > 0 && item._scroll < max ? Math.min(FadeHeight, viewHeight) : 0;
    // an empty rect still has bounds, so it stays inside the entries
    placeRect(view, fade, {
      x: entry.x,
      y: entry.y + (fh ? viewHeight - fh : 0),
      width: fh ? entry.width : 0,
      height: fh
    });
  }
}

function legendPart(item, role) {
  const mark = item.items.find(m => m.role === role);
  return mark && mark.items[0];
}

function placeRect(view, rect, {x, y, width, height}) {
  view.dirty(rect);
  rect.x = x;
  rect.y = y;
  rect.width = width;
  rect.height = height;
  Marks.rect.bound(rect.bounds.clear(), rect);
  rect.mark.bounds.clear().union(rect.bounds);
  view.dirty(rect);
}
