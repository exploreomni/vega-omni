import tape from 'tape';
import {resizeView} from '../src/size.js';

// a view whose layout asks for a new width on every fit
function stubView(autosize) {
  let width = 0;
  const view = {
    _origin: [0, 0],
    autosize: () => autosize,
    _resizeWidth: {skip() {}},
    _resizeHeight: {skip() {}},
    width: () => width,
    height: () => 100,
    signal(name, value) { if (name === 'width') width = value; },
    run() {},
    runAfter(callback) { callback(view); }
  };
  return view;
}

tape('Autosize fits once unless asked to refit', t => {
  const view = stubView({type: 'fit'});
  resizeView.call(view, 100, 100, 100, 100, [0, 0], false);
  t.equal(view._autosize, 0);
  t.end();
});

tape('Autosize refit stops fitting again after a bounded number of passes', t => {
  const view = stubView({type: 'fit', refit: true});
  const fit = w => resizeView.call(view, w, 100, w, 100, [0, 0], false);

  fit(100);
  t.equal(view._autosize, 1);
  fit(101);
  t.equal(view._autosize, 1);
  fit(102);
  t.equal(view._autosize, 0, 'third pass does not ask for a fourth');

  // a later resize from outside gets its own re-fits
  fit(200);
  t.equal(view._autosize, 1);
  t.end();
});
