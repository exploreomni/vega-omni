import tape from 'tape';
import {textLines, textMetrics} from '../index.js';
import {textValue} from '../src/util/text.js';

// estimated widths: 0.8 * characters * font size
textMetrics.canvas(false);

tape('textLines wraps text at spaces to fit the limit', t => {
  const item = {text: 'alpha beta gamma delta', fontSize: 10, wrap: true};
  t.deepEqual(textLines({...item, limit: 100}), ['alpha beta', 'gamma delta']);
  t.deepEqual(textLines({...item, limit: 60}), ['alpha', 'beta', 'gamma', 'delta']);
  t.equal(textLines({...item, limit: 200}), 'alpha beta gamma delta', 'one line stays a string');
  t.equal(textLines({...item, limit: 0}), 'alpha beta gamma delta', 'no limit, no wrap');
  t.equal(textLines({...item, wrap: false, limit: 60}), 'alpha beta gamma delta');
  t.end();
});

tape('textLines breaks a line exactly at the limit, which truncation would cut', t => {
  // 'alpha beta' is 10 characters: 80 wide, as wide as the limit
  const item = {text: 'alpha beta gamma delta', fontSize: 10, limit: 80, wrap: true},
        lines = textLines(item);
  t.deepEqual(lines, ['alpha', 'beta', 'gamma', 'delta']);
  t.deepEqual(lines.map(line => textValue(item, line)), lines, 'no line is truncated');
  t.end();
});

tape('textLines keeps a word wider than the limit on its own line', t => {
  t.deepEqual(
    textLines({text: 'a supercalifragilistic b', fontSize: 10, limit: 60, wrap: true}),
    ['a', 'supercalifragilistic', 'b']
  );
  t.end();
});

tape('textLines wraps each line of a line-broken or array text', t => {
  t.deepEqual(
    textLines({text: 'alpha beta\ngamma', fontSize: 10, limit: 50, lineBreak: '\n', wrap: true}),
    ['alpha', 'beta', 'gamma']
  );
  t.deepEqual(
    textLines({text: ['alpha beta', 'gamma'], fontSize: 10, limit: 50, wrap: true}),
    ['alpha', 'beta', 'gamma']
  );
  t.end();
});
