import tape from 'tape';
import * as vega from '../index.js';

vega.textMetrics.canvas(false);

// a bottom legend of 40 entries whose columns fit maxWidth
function spec(autosize, legend, signals = []) {
  return {
    width: 500,
    height: 100,
    autosize,
    signals,
    data: [{
      name: 'source',
      transform: [{type: 'sequence', start: 1, stop: 41, as: 'x'}]
    }],
    scales: [{
      name: 'color',
      type: 'ordinal',
      range: {scheme: 'category20'},
      domain: {data: 'source', field: 'x'}
    }],
    legends: [{
      fill: 'color', orient: 'bottom', direction: 'horizontal',
      columns: 'auto', symbolLimit: 0, ...legend
    }]
  };
}

function legendWidth(view) {
  return view.scenegraph().root.items[0].items
    .find(m => m.role === 'legend').items[0].bounds.width();
}

tape('Auto columns re-fit when a maxWidth signal changes', async t => {
  const view = new vega.View(
    vega.parse(spec('pad', {maxWidth: {signal: 'mw'}}, [{name: 'mw', value: 400}])),
    {renderer: 'none'}
  );
  await view.runAsync();
  t.ok(legendWidth(view) <= 400);

  await view.signal('mw', 150).runAsync();
  t.ok(legendWidth(view) <= 150, `${legendWidth(view)} fits 150`);
  t.end();
});

tape('Auto columns re-fit when maxWidth follows a fit width', async t => {
  const view = new vega.View(
    vega.parse(spec({type: 'fit', contains: 'padding'}, {maxWidth: {signal: 'width'}})),
    {renderer: 'none'}
  );
  await view.runAsync();
  t.ok(legendWidth(view) <= view.width(), `${legendWidth(view)} fits ${view.width()}`);

  await view.width(300).runAsync();
  t.ok(legendWidth(view) <= view.width(), `${legendWidth(view)} fits ${view.width()}`);
  t.end();
});

tape('A scrolling bottom legend spans its slot within maxWidth', async t => {
  // auto columns cannot leave room for a left title, which is measured after
  // the entries are laid out, so that case sets its columns
  for (const legend of [{titleOrient: 'top'}, {titleOrient: 'left', columns: 2}]) {
    const view = new vega.View(
      vega.parse(spec('pad', {maxWidth: 200, maxHeight: 40, title: 'Entries', ...legend})),
      {renderer: 'none'}
    );
    await view.runAsync();
    t.ok(legendWidth(view) <= 200, `${legend.titleOrient} title: ${legendWidth(view)} fits 200`);
  }
  t.end();
});
