import tape from 'tape';
import {Bounds} from 'vega-scenegraph';
import {legendScrollLayout, legendScrollbarLayout, scrollEntries, shrink} from '../src/layout/legend-scroll.js';

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
        item = {
          datum: {title: false, type: 'symbol'},
          padding: 0, scrollbarWidth: 4,
          items: [{items: [entry], bounds: new Bounds()},
                  {role: 'legend-scrollbar', items: [thumb], bounds: new Bounds()}],
          ...props
        };
  entry.mark = item.items[0];
  thumb.mark = item.items[1];
  return {item, entry, entries, thumb};
}

tape('legendScrollLayout clips entries that overflow maxHeight', t => {
  const {item, entry, entries} = legend(10, {maxHeight: 50});

  legendScrollLayout(view, item, entry, item.maxHeight);
  t.equal(entry.clip, true);
  t.equal(entry.height, 50);
  t.equal(entry.width, 60 + 8, 'content width plus scrollbar gutter');
  t.equal(item._scrollMax, 127 - 50);
  t.deepEqual([entry.bounds.x2, entry.bounds.y2], [68, 50]);
  t.equal(entries[0].y, 0, 'unscrolled');

  // a stale offset is clamped and applied
  item._scroll = 500;
  legendScrollLayout(view, item, entry, item.maxHeight);
  t.equal(item._scroll, 77);
  t.equal(entries[0].y, -77);
  t.equal(entries[0].bounds.y1, -77);

  // layout runs again without the grid resetting positions: nothing moves
  legendScrollLayout(view, item, entry, item.maxHeight);
  t.equal(entries[0].y, -77);
  t.equal(item._scrollMax, 77, 'content height measured independent of scroll');

  // the grid reset positions: the offset is applied again from scratch
  entries.forEach((g, i) => { g.y = 13 * i; g.bounds.set(0, 13 * i, 60, 13 * i + 10); });
  entry.items[0].bounds.set(0, 0, 60, 127);
  entry._scrollY = 0;
  legendScrollLayout(view, item, entry, item.maxHeight);
  t.equal(entries[0].y, -77);

  // a viewport width widens the clip box but never narrows it
  legendScrollLayout(view, item, entry, item.maxHeight, 120);
  t.equal(entry.width, 120);
  t.equal(entry.bounds.x2, 120);
  legendScrollLayout(view, item, entry, item.maxHeight, 50);
  t.equal(entry.width, 68);

  // a budget with no room, as an unsized container gives, clips nothing
  item.maxHeight = -66;
  legendScrollLayout(view, item, entry, item.maxHeight);
  t.equal(entry.clip, false);
  t.equal(item._scrollMax, 0);
  t.equal(entries[0].y, 0);

  // room for everything: no clip, entries back in place
  item.maxHeight = 200;
  legendScrollLayout(view, item, entry, item.maxHeight);
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

  legendScrollLayout(view, item, entry, item.maxHeight);
  t.equal(entry.height, 50 - 4 - 11 - 5);

  // a budget the title and padding use up still clips, keeping one entry in view
  legendScrollLayout(view, item, entry, 18);
  t.equal(entry.clip, true);
  t.equal(entry.height, 10);

  title.orient = 'left';
  legendScrollLayout(view, item, entry, item.maxHeight);
  t.equal(entry.height, 50 - 4);
  t.end();
});

tape('a scroll to the end survives a pass at a bigger viewport', t => {
  const view = {dirty() {}},
        {item, entry} = legend(10, {maxHeight: 50});

  legendScrollLayout(view, item, entry, item.maxHeight);
  const end = item._scrollMax;
  item._scroll = item._scrollWanted = end;

  // measured at a bigger viewport, then narrowed again, as a side legend
  // is when the slot's room is less than its maxHeight
  legendScrollLayout(view, item, entry, 80);
  t.ok(item._scroll < end, 'clamped to the bigger viewport\'s range');
  legendScrollLayout(view, item, entry, item.maxHeight);
  t.equal(item._scroll, end, 'back at the end');
  t.equal(entry._scrollY, end);

  // a pass where everything fits, as a legend sharing a slot is measured
  // before the slot narrows it, keeps the offset too
  legendScrollLayout(view, item, entry, 200);
  t.equal(item._scroll, 0, 'nothing to scroll');
  legendScrollLayout(view, item, entry, item.maxHeight);
  t.equal(item._scroll, end, 'back at the end again');
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
  legendScrollLayout(view, item, entry, item.maxHeight);
  legendScrollbarLayout(view, item, entry);
  t.equal(thumb.x, 3 + 68 - 4);
  t.equal(thumb.width, 4);
  t.equal(thumb.height, Math.round(50 * 50 / 127));
  t.equal(thumb.y, 7);

  item._scroll = 77;
  legendScrollLayout(view, item, entry, item.maxHeight);
  legendScrollbarLayout(view, item, entry);
  t.equal(thumb.y, 7 + 50 - thumb.height, 'thumb at the bottom when fully scrolled');
  t.equal(thumb.bounds.y2, thumb.y + thumb.height);

  // a viewport shorter than the thumb's minimum: the thumb fills it
  legendScrollLayout(view, item, entry, 6);
  legendScrollbarLayout(view, item, entry);
  t.equal(item._scrollView, 10);
  item.scrollbarWidth = 6;
  legendScrollbarLayout(view, item, entry);
  t.equal(thumb.height, 10);
  t.equal(thumb.y, 7, 'within the viewport when fully scrolled');
  item.scrollbarWidth = 4;

  item.maxHeight = 200;
  legendScrollLayout(view, item, entry, item.maxHeight);
  legendScrollbarLayout(view, item, entry);
  t.equal(thumb.width, 0, 'hidden when nothing overflows');
  t.end();
});

// a laid-out scrolling legend, the view's event listeners, and a symbol in it
function scrolling() {
  const listeners = {},
        runs = [],
        view = {
          dirty() {},
          runAsync() { runs.push(1); },
          addEventListener(type, handler) { (listeners[type] = listeners[type] || []).push(handler); }
        },
        parts = legend(10, {maxHeight: 50}),
        {item, entry, entries} = parts;

  // the scene chain a picked symbol walks up: symbol -> scope group -> entry -> legend
  item.mark = {role: 'legend', group: null};
  entry.mark.role = 'legend-entry';
  entry.mark.group = item;
  entry.items[0].mark = {role: 'scope', group: entry};
  entries.forEach(g => g.mark = entry.items[0].mark);
  const symbol = {mark: {role: 'legend-symbol', group: entries[2]}};

  legendScrollLayout(view, item, entry, item.maxHeight);
  legendScrollLayout(view, item, entry, item.maxHeight);

  const fire = (type, evt, target = symbol) => {
    evt.prevented = false;
    evt.preventDefault = () => { evt.prevented = true; };
    listeners[type][0](evt, target);
    return evt.prevented;
  };
  return {...parts, listeners, runs, fire};
}

tape('wheel events scroll the legend under the pointer', t => {
  const {item, entries, thumb, listeners, runs, fire} = scrolling();
  t.deepEqual(Object.keys(listeners), ['wheel', 'touchstart', 'touchmove']);
  t.ok(Object.values(listeners).every(l => l.length === 1), 'registered once');

  const wheel = (deltaY, deltaMode = 0) => fire('wheel', {deltaY, deltaMode});

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
  t.equal(fire('wheel', {deltaY: 10}, {mark: {role: 'mark', group: null}}), false);
  t.equal(fire('wheel', {deltaY: 10}, null), false);
  t.end();
});

tape('fractional wheel deltas add up, with entries on whole pixels', t => {
  const {item, entries, fire} = scrolling();
  const wheel = deltaY => fire('wheel', {deltaY, deltaMode: 0});

  t.equal(wheel(0.4), true, 'a small delta still keeps the page still');
  t.equal(entries[0].y, 0);
  t.equal(wheel(0.4), true);
  t.equal(item._scroll, 1);
  t.equal(entries[0].y, -1);
  t.equal(wheel(0.4), true);
  t.equal(entries[0].y, -1);
  t.end();
});

tape('a touch dragging a legend scrolls it', t => {
  const {item, entries, fire} = scrolling();
  const touch = (type, clientY, target) => fire(type, {changedTouches: [{clientY}]}, target);

  touch('touchstart', 100);
  t.equal(touch('touchmove', 70), true, 'dragging up scrolls down');
  t.equal(item._scroll, 30);
  t.equal(entries[0].y, -30);
  t.equal(touch('touchmove', 80), true);
  t.equal(item._scroll, 20);
  t.equal(touch('touchmove', 200), true, 'clamped at the start');
  t.equal(item._scroll, 0);
  t.equal(touch('touchmove', 210), false, 'past the start the page scrolls');

  // a drag that starts outside any legend is left to the page
  touch('touchstart', 100, {mark: {role: 'mark', group: null}});
  t.equal(touch('touchmove', 70), false);
  t.equal(item._scroll, 0);
  t.end();
});

tape('shrink splits the excess in proportion to what each legend can give', t => {
  t.deepEqual(shrink([100, 50, 0], 30), [20, 10, 0]);
  t.deepEqual(shrink([100, 50, 0], 300), [100, 50, 0], 'never past what is reducible');
  t.deepEqual(shrink([0, 0], 30), [0, 0]);
  t.end();
});
