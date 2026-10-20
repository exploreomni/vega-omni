import tape from 'tape';
import * as vega from '../index.js';

vega.textMetrics.canvas(false);

// a right symbol legend of 25 entries that scrolls past maxHeight 100
function spec(legend, signals = []) {
  return {
    width: 200,
    height: 150,
    autosize: 'pad',
    signals,
    data: [{
      name: 'source',
      transform: [{type: 'sequence', start: 1, stop: 26, as: 'x'}]
    }],
    scales: [{
      name: 'color',
      type: 'ordinal',
      range: {scheme: 'category20'},
      domain: {data: 'source', field: 'x'}
    }],
    legends: [{fill: 'color', orient: 'right', symbolLimit: 0, maxHeight: 100, ...legend}]
  };
}

async function render(legend, signals) {
  const view = new vega.View(vega.parse(spec(legend, signals)), {renderer: 'none'});
  await view.runAsync();
  return view;
}

function part(view, role) {
  let found;
  (function visit(item) {
    if (item.mark && item.mark.role === role) found = item;
    (item.items || []).forEach(visit);
  })(view.scenegraph().root);
  return found;
}

tape('A scroll fade color the canvas cannot parse draws no fade', async t => {
  const view = await render({scrollFadeColor: 'transparent'});
  t.equal(part(view, 'legend-scroll-fade').fill, null);
  await view.toCanvas();
  t.end();
});

tape('Scroll colors and width accept value refs', async t => {
  const view = await render({
    scrollFadeColor: {value: 'white'},
    scrollbarColor: {value: 'red'},
    scrollbarWidth: {value: 6}
  });
  const thumb = part(view, 'legend-scrollbar');
  t.deepEqual(part(view, 'legend-scroll-fade').fill.stops.map(s => s.color),
    ['rgba(255,255,255,0)', 'white']);
  t.equal(thumb.fill, 'red');
  t.equal(thumb.width, 6);
  t.equal(thumb.cornerRadius, 3);
  t.end();
});

tape('Scroll colors and width follow their signals', async t => {
  const view = await render(
    {
      scrollFadeColor: {signal: 'fade'},
      scrollbarColor: {signal: 'bar'},
      scrollbarWidth: {signal: 'barWidth'}
    },
    [{name: 'fade', value: 'white'}, {name: 'bar', value: 'red'}, {name: 'barWidth', value: 4}]
  );
  await view.signal('fade', 'black').signal('bar', 'blue').signal('barWidth', 8).runAsync();

  const thumb = part(view, 'legend-scrollbar');
  t.equal(part(view, 'legend-scroll-fade').fill.stops[1].color, 'black');
  t.equal(thumb.fill, 'blue');
  t.equal(thumb.width, 8);
  t.equal(thumb.cornerRadius, 4);
  t.end();
});
