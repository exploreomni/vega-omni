import tape from 'tape';
import {Bounds} from 'vega-scenegraph';
import {legendScrollLayout, legendScrollbarLayout, scrollEntries} from '../src/layout/legend-scroll.js';

const view = {dirty() {}};

// a symbol legend with n 10px-tall entries on a 13px pitch and no title
function legend(n, props) {
  const entries = Array.from({length: n}, (_, i) => ({
          x: 0, y: 13 * i, bounds: new Bounds().set(0, 13 * i, 60, 13 * i + 10)
        })),
        scope = {marktype: 'group', role: 'scope', items: entries,
          bounds: new Bounds().set(0, 0, 60, 13 * (n - 1) + 10)},
        entry = {x: 0, y: 0, items: [scope], bounds: new Bounds(), _scrollY: 0},
        thumb = {bounds: new Bounds()},
        fade = {bounds: new Bounds()},
        item = {
          datum: {title: false, type: 'symbol'},
          padding: 0, scrollbarWidth: 4,
          items: [{items: [entry], bounds: new Bounds()},
                  {role: 'legend-scroll-fade', items: [fade], bounds: new Bounds()},
                  {role: 'legend-scrollbar', items: [thumb], bounds: new Bounds()}],
          ...props
        };
  entry.mark = item.items[0];
  fade.mark = item.items[1];
  thumb.mark = item.items[2];
  return {item, entry, entries, fade, thumb};
}

tape('legendScrollLayout clips entries that overflow maxHeight', t => {
  const {item, entry, entries} = legend(10, {maxHeight: 50});

  legendScrollLayout(view, item, entry);
  t.equal(entry.clip, true);
  t.equal(entry.height, 50);
  t.equal(entry.width, 60 + 8, 'content width plus scrollbar gutter');
  t.equal(item._scrollMax, 127 - 50);
  t.deepEqual([entry.bounds.x2, entry.bounds.y2], [68, 50]);
  t.equal(entries[0].y, 0, 'unscrolled');

  // a stale offset is clamped and applied
  item._scroll = 500;
  legendScrollLayout(view, item, entry);
  t.equal(item._scroll, 77);
  t.equal(entries[0].y, -77);
  t.equal(entries[0].bounds.y1, -77);

  // layout runs again without the grid resetting positions: nothing moves
  legendScrollLayout(view, item, entry);
  t.equal(entries[0].y, -77);
  t.equal(item._scrollMax, 77, 'content height measured independent of scroll');

  // the grid reset positions: the offset is applied again from scratch
  entries.forEach((g, i) => { g.y = 13 * i; g.bounds.set(0, 13 * i, 60, 13 * i + 10); });
  entry.items[0].bounds.set(0, 0, 60, 127);
  entry._scrollY = 0;
  legendScrollLayout(view, item, entry);
  t.equal(entries[0].y, -77);

  // a budget with no room, as an unsized container gives, clips nothing
  item.maxHeight = -66;
  legendScrollLayout(view, item, entry);
  t.equal(entry.clip, false);
  t.equal(item._scrollMax, 0);
  t.equal(entries[0].y, 0);

  // room for everything: no clip, entries back in place
  item.maxHeight = 200;
  legendScrollLayout(view, item, entry);
  t.equal(entry.clip, false);
  t.equal(item._scroll, 0);
  t.equal(entries[0].y, 0);
  t.deepEqual([entry.bounds.x2, entry.bounds.y2], [60, 127]);
  t.end();
});

tape('legendScrollLayout leaves room for a stacked title', t => {
  const {item, entry} = legend(10, {maxHeight: 50, padding: 2, titlePadding: 5});
  const title = {orient: 'top', bounds: new Bounds().set(0, 0, 40, 11)};
  item.datum.title = true;
  item.items.splice(1, 0, {items: [title], bounds: new Bounds()});

  legendScrollLayout(view, item, entry);
  t.equal(entry.height, 50 - 4 - 11 - 5);

  title.orient = 'left';
  legendScrollLayout(view, item, entry);
  t.equal(entry.height, 50 - 4);
  t.end();
});

tape('scrollEntries moves by the difference from the applied offset', t => {
  const {entry, entries} = legend(3, {});
  scrollEntries(view, entry, 10);
  scrollEntries(view, entry, 25);
  t.equal(entries[1].y, 13 - 25);
  t.equal(entry.items[0].bounds.y1, -25);
  scrollEntries(view, entry, 0);
  t.equal(entries[1].y, 13);
  t.end();
});

tape('legendScrollbarLayout sizes the thumb to the visible fraction', t => {
  const {item, entry, thumb} = legend(10, {maxHeight: 50});
  entry.x = 3; entry.y = 7;
  legendScrollLayout(view, item, entry);
  legendScrollbarLayout(view, item, entry);
  t.equal(thumb.x, 3 + 68 - 4);
  t.equal(thumb.width, 4);
  t.equal(thumb.height, Math.round(50 * 50 / 127));
  t.equal(thumb.y, 7);

  item._scroll = 77;
  legendScrollLayout(view, item, entry);
  legendScrollbarLayout(view, item, entry);
  t.equal(thumb.y, 7 + 50 - thumb.height, 'thumb at the bottom when fully scrolled');
  t.equal(thumb.bounds.y2, thumb.y + thumb.height);

  item.maxHeight = 200;
  legendScrollLayout(view, item, entry);
  legendScrollbarLayout(view, item, entry);
  t.equal(thumb.width, 0, 'hidden when nothing overflows');
  t.end();
});

tape('legendScrollbarLayout fades the last rows while more can be scrolled', t => {
  const {item, entry, fade} = legend(10, {maxHeight: 50});
  entry.x = 3; entry.y = 7;
  legendScrollLayout(view, item, entry, item.maxHeight);
  legendScrollbarLayout(view, item, entry);
  t.deepEqual([fade.x, fade.y, fade.width, fade.height], [3, 7 + 50 - 24, 68, 24]);

  item._scroll = 77;
  legendScrollLayout(view, item, entry, item.maxHeight);
  legendScrollbarLayout(view, item, entry);
  t.equal(fade.height, 0, 'no fade at the end');

  item.maxHeight = 30;
  item._scroll = 0;
  legendScrollLayout(view, item, entry, item.maxHeight);
  legendScrollbarLayout(view, item, entry);
  t.equal(fade.height, 24, 'capped by the viewport');

  // a legend that fits keeps the empty fade inside its entries, where it
  // adds nothing to the legend's bounds
  item.maxHeight = 200;
  legendScrollLayout(view, item, entry, item.maxHeight);
  legendScrollbarLayout(view, item, entry);
  t.deepEqual([fade.y, fade.width, fade.height], [7, 0, 0]);
  t.equal(fade.bounds.y2, 7);
  t.end();
});

tape('wheel events scroll the legend under the pointer', t => {
  const listeners = {},
        runs = [],
        view = {
          dirty() {},
          runAsync() { runs.push(1); },
          addEventListener(type, handler) { listeners[type] = handler; }
        },
        {item, entry, entries, thumb} = legend(10, {maxHeight: 50});

  // the scene chain a picked symbol walks up: symbol -> scope group -> entry -> legend
  item.mark = {role: 'legend', group: null};
  entry.mark.role = 'legend-entry';
  entry.mark.group = item;
  entry.items[0].mark = {role: 'scope', group: entry};
  entries.forEach(g => g.mark = entry.items[0].mark);
  const symbol = {mark: {role: 'legend-symbol', group: entries[2]}};

  legendScrollLayout(view, item, entry);
  legendScrollLayout(view, item, entry);
  t.equal(Object.keys(listeners).join(), 'wheel', 'registered once');

  const wheel = (deltaY, deltaMode = 0) => {
    const evt = {deltaY, deltaMode, prevented: false, preventDefault() { this.prevented = true; }};
    listeners.wheel(evt, symbol);
    return evt.prevented;
  };

  t.equal(wheel(30), true);
  t.equal(item._scroll, 30);
  t.equal(entries[0].y, -30);
  t.ok(thumb.y > 0, 'thumb follows');
  t.equal(runs.length, 1, 're-rendered');

  t.equal(wheel(2, 1), true, 'line-mode deltas scale');
  t.equal(item._scroll, 62);

  t.equal(wheel(100), true, 'clamped at the end');
  t.equal(item._scroll, 77);
  t.equal(wheel(10), false, 'past the end the page scrolls');
  t.equal(wheel(-200), true);
  t.equal(item._scroll, 0);
  t.equal(entries[0].y, 0);
  t.equal(wheel(-10), false, 'past the start the page scrolls');

  // a wheel outside any legend is ignored
  const evt = {deltaY: 10, prevented: false, preventDefault() { this.prevented = true; }};
  listeners.wheel(evt, {mark: {role: 'mark', group: null}});
  listeners.wheel(evt, null);
  t.equal(evt.prevented, false);
  t.end();
});
