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

tape('Scrollbar color and width accept value refs', async t => {
  const view = await render({
    scrollbarColor: {value: 'red'},
    scrollbarWidth: {value: 6}
  });
  const thumb = part(view, 'legend-scrollbar');
  t.equal(thumb.fill, 'red');
  t.equal(thumb.width, 6);
  t.equal(thumb.cornerRadius, 3);
  t.end();
});

tape('Scrollbar color and width follow their signals', async t => {
  const view = await render(
    {scrollbarColor: {signal: 'bar'}, scrollbarWidth: {signal: 'barWidth'}},
    [{name: 'bar', value: 'red'}, {name: 'barWidth', value: 4}]
  );
  await view.signal('bar', 'blue').signal('barWidth', 8).runAsync();

  const thumb = part(view, 'legend-scrollbar');
  t.equal(thumb.fill, 'blue');
  t.equal(thumb.width, 8);
  t.equal(thumb.cornerRadius, 4);
  t.end();
});

tape('A gradient legend with maxHeight leaves its entries alone', async t => {
  const view = new vega.View(vega.parse({
    width: 200,
    height: 150,
    scales: [{name: 'color', type: 'linear', domain: [0, 100], range: {scheme: 'blues'}}],
    legends: [{fill: 'color', orient: 'right', maxHeight: 100}]
  }), {renderer: 'none'});
  await view.runAsync();

  const entry = part(view, 'legend-entry');
  t.equal(entry.mark.interactive, false);
  t.equal(entry.fill, undefined);
  t.end();
});

tape('A legend laid out again by its slot keeps its last location for dirtying', async t => {
  // two stacked right legends share maxHeight, so the column fit lays the
  // scrolling one out a second time in the same pass
  const view = new vega.View(vega.parse({
    width: 200, height: 150, autosize: 'pad',
    signals: [{name: 'offset', value: 0}],
    data: [{name: 'source', transform: [{type: 'sequence', start: 1, stop: 26, as: 'x'}]}],
    scales: [
      {name: 'color', type: 'ordinal', range: {scheme: 'category20'}, domain: {data: 'source', field: 'x'}},
      {name: 'size', type: 'ordinal', range: [20, 40, 60], domain: [1, 2, 3]}
    ],
    legends: [
      {fill: 'color', orient: 'right', symbolLimit: 0, maxHeight: 100, offset: {signal: 'offset'}},
      {size: 'size', orient: 'right', maxHeight: 100, offset: {signal: 'offset'}}
    ]
  }), {renderer: 'none'});
  await view.runAsync();
  const legend = part(view, 'legend'),
        before = legend.bounds.clone();

  await view.signal('offset', 30).runAsync();
  t.ok(legend._bounds.equals(before), 'the cached bounds are where the legend was');
  t.notOk(legend.bounds.equals(before), 'and the legend moved');
  t.end();
});

tape('Side legends laid out side by side each stay within the room beside the plot', async t => {
  const view = new vega.View(vega.parse({
    width: 200, height: 150, autosize: 'pad',
    config: {legend: {layout: {right: {direction: 'horizontal'}}}},
    data: [{name: 'source', transform: [{type: 'sequence', start: 1, stop: 26, as: 'x'}]}],
    scales: [
      {name: 'color', type: 'ordinal', range: {scheme: 'category20'}, domain: {data: 'source', field: 'x'}},
      {name: 'shape', type: 'ordinal', range: 'symbol', domain: {data: 'source', field: 'x'}}
    ],
    legends: [
      {fill: 'color', orient: 'right', symbolLimit: 0, maxHeight: 400},
      {shape: 'shape', orient: 'right', symbolLimit: 0, maxHeight: 400}
    ]
  }), {renderer: 'none'});
  await view.runAsync();

  const legends = view.scenegraph().root.items[0].items
    .filter(m => m.role === 'legend').map(m => m.items[0]);
  t.equal(legends.length, 2);
  legends.forEach((legend, i) => t.ok(legend.height <= 150, `legend ${i} fits the 150 beside the plot: ${legend.height}`));
  t.end();
});
