import tape from 'tape';
import {Bounds} from 'vega-scenegraph';
import {fitColumns, legendEntryColumns} from '../src/layout/legend.js';

const box = (x1, x2) => new Bounds().set(x1, 0, x2, 10);

tape('fitColumns picks the most columns whose grid fits', t => {
  const boxes = [box(0, 50), box(0, 30), box(0, 40), box(0, 20), box(0, 10)];

  // five entries, 10px gaps: 50+30+40+20+10 + 4*10 = 190
  t.equal(fitColumns(boxes, 190, 'each', 10), 5);
  // four columns: column widths 50,30,40,20 + 3*10 = 170
  t.equal(fitColumns(boxes, 189, 'each', 10), 4);
  // two columns: max(50,40,10)=50 + max(30,20)=30 + 10 = 90
  t.equal(fitColumns(boxes, 90, 'each', 10), 2);
  t.equal(fitColumns(boxes, 89, 'each', 10), 1);
  // narrower than any entry still yields one column
  t.equal(fitColumns(boxes, 0, 'each', 10), 1);
  t.equal(fitColumns([], 100, 'each', 10), 1);

  // 'all' aligns every column to the widest entry: 3*50 + 2*10 = 170
  t.equal(fitColumns(boxes, 170, 'all', 10), 3);
  t.equal(fitColumns(boxes, 169, 'all', 10), 2);

  // an entry extending left of its origin widens the gap before its column
  const inset = [box(0, 50), box(-5, 30), box(0, 40)];
  t.equal(fitColumns(inset, 50 + 15 + 30 + 10 + 40, 'each', 10), 3);
  t.equal(fitColumns(inset, 50 + 15 + 30 + 10 + 40 - 1, 'each', 10), 2);

  t.end();
});

tape('legendEntryColumns resolves auto columns against the legend maxWidth', t => {
  const entries = [50, 30, 40, 20].map(w => ({x: 0, y: 0, bounds: box(0, w)})),
        group = {
          mark: {group: {maxWidth: 110, padding: 5}},
          items: [{marktype: 'group', role: 'scope', items: entries}]
        },
        opt = {columns: 'auto', align: 'each', padding: {row: 2, column: 10}};

  // available 100: two columns (50+30+10) fit, three (50+30+40 + 2*10) do not
  const resolved = legendEntryColumns(group, opt);
  t.equal(resolved.columns, 2);
  t.equal(opt.columns, 'auto', 'layout options are not mutated');
  t.deepEqual(entries.map(e => [e.row, e.column]), [[0, 0], [0, 1], [1, 0], [1, 1]]);

  // no maxWidth: a single row
  group.mark.group = {padding: 0};
  t.equal(legendEntryColumns(group, opt).columns, 4);

  // numeric columns pass through untouched
  t.equal(legendEntryColumns(group, {columns: 3}).columns, 3);
  t.end();
});
