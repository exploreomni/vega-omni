import {addEncoders, extendEncode} from './encode/util.js';
import guideMark from './guides/guide-mark.js';
import {RectMark} from './marks/marktypes.js';
import {
  Auto, Discrete, Gradient,
  GuideLabelStyle, LegendScales, Skip, Symbols
} from './guides/constants.js';
import guideGroup from './guides/guide-group.js';
import {getEncoding, getStyle, lookup} from './guides/guide-util.js';
import legendGradient from './guides/legend-gradient.js';
import legendGradientDiscrete from './guides/legend-gradient-discrete.js';
import legendGradientLabels from './guides/legend-gradient-labels.js';
import legendSymbolGroups, {legendSymbolLayout} from './guides/legend-symbol-groups.js';
import legendTitle from './guides/legend-title.js';
import parseMark from './mark.js';
import {
  LegendEntryRole, LegendRole, LegendScrollFadeRole, LegendScrollbarRole
} from './marks/roles.js';

import {deref, ref} from '../util.js';
import {Collect, LegendEntries} from '../transforms.js';

import {parseExpression} from 'vega-functions';
import {isContinuous, isDiscretizing} from 'vega-scale';
import {error, isObject, stringValue} from 'vega-util';

export default function(spec, scope) {
  const config = scope.config.legend,
        encode = spec.encode || {},
        _ = lookup(spec, config),
        legendEncode = encode.legend || {},
        name = legendEncode.name || undefined,
        interactive = legendEncode.interactive,
        style = legendEncode.style,
        scales = {};

  let scale = 0, entryLayout, params, children;

  // resolve scales and 'canonical' scale name
  LegendScales.forEach(s => spec[s]
    ? (scales[s] = spec[s], scale = scale || spec[s]) : 0
  );
  if (!scale) error('Missing valid scale for legend.');

  // resolve legend type (symbol, gradient, or discrete gradient)
  const type = legendType(spec, scope.scaleType(scale)),
        scrollable = type === Symbols && _('maxHeight') != null;

  // single-element data source for legend group
  const datum = {
    title:  spec.title != null,
    scales: scales,
    type:   type,
    vgrad:  type !== 'symbol' &&  _.isVertical()
  };
  const dataRef = ref(scope.add(Collect(null, [datum])));

  // encoding properties for legend entry sub-group
  const entryEncode = {enter: {x: {value: 0}, y: {value: 0}}};
  // a scrollable entry group is hit-tested so wheel events can find it
  if (scrollable) entryEncode.enter.fill = {value: 'transparent'};

  // data source for legend values
  const entryRef = ref(scope.add(LegendEntries(params = {
    type:    type,
    scale:   scope.scaleRef(scale),
    count:   scope.objectProperty(_('tickCount')),
    limit:   scope.property(_('symbolLimit')),
    values:  scope.objectProperty(spec.values),
    minstep: scope.property(spec.tickMinStep),
    formatType: scope.property(spec.formatType),
    formatSpecifier: scope.property(spec.format)
  })));

  // continuous gradient legend
  if (type === Gradient) {
    children = [
      legendGradient(spec, scale, config, encode.gradient),
      legendGradientLabels(spec, config, encode.labels, entryRef)
    ];
    // adjust default tick count based on the gradient length
    params.count = params.count || scope.signalRef(
      `max(2,2*floor((${deref(_.gradientLength())})/100))`
    );
  }

  // discrete gradient legend
  else if (type === Discrete) {
    children = [
      legendGradientDiscrete(spec, scale, config, encode.gradient, entryRef),
      legendGradientLabels(spec, config, encode.labels, entryRef)
    ];
  }

  // symbol legend
  else {
    // determine legend symbol group layout
    entryLayout = legendSymbolLayout(spec, config);
    // auto columns are resolved at layout time, which re-runs when maxWidth
    // changes; encoders only need a non-zero count
    if (entryLayout.columns === Auto && _('maxWidth') != null) {
      entryLayout.maxWidth = _('maxWidth');
    }
    const columns = entryLayout.columns === Auto ? 1 : deref(entryLayout.columns);
    children = [
      legendSymbolGroups(spec, config, encode, entryRef, columns)
    ];
    // pass symbol size information to legend entry generator
    params.size = sizeExpression(spec, scope, children[0].marks);
  }

  // generate legend marks
  children = [
    guideGroup({
      role: LegendEntryRole,
      from: dataRef,
      encode: entryEncode,
      marks: children,
      layout: entryLayout,
      interactive: interactive || scrollable
    })
  ];

  // include legend title if defined
  if (datum.title) {
    children.push(legendTitle(spec, config, encode.title, dataRef));
  }

  // scroll fade and scrollbar thumb; layout sizes and places both
  if (scrollable) {
    const fade = _('scrollFadeColor');
    if (fade != null) {
      const color = isObject(fade)
              ? (fade.signal ? `(${fade.signal})` : stringValue(fade.value))
              : stringValue(fade),
            rgba = `rgb(${color})`,
            // the first stop is the fade color at zero alpha, not 'transparent':
            // a renderer that interpolates unpremultiplied blends black into it
            clear = `'rgba(' + ${rgba}.r + ',' + ${rgba}.g + ',' + ${rgba}.b + ',0)'`;
      children.push(guideMark({
        type: RectMark,
        role: LegendScrollFadeRole,
        from: dataRef,
        encode: {
          enter: {
            width: {value: 0},
            height: {value: 0}
          },
          update: {
            // a color rgb() cannot parse, such as 'transparent', draws no fade
            fill: {
              signal: `isFinite(${rgba}.r) ? {gradient: 'linear', x1: 0, y1: 0, x2: 0, y2: 1, stops: [{offset: 0, color: ${clear}}, {offset: 1, color: ${color}}]} : null`
            }
          }
        }
      }));
    }
    const thumbEncode = {enter: {width: {value: 0}, height: {value: 0}}, update: {}};
    addEncoders(thumbEncode, {fill: _('scrollbarColor')});
    children.push(guideMark({
      type: RectMark,
      role: LegendScrollbarRole,
      from: dataRef,
      encode: thumbEncode
    }));
  }

  // parse legend specification
  return parseMark(
    guideGroup({
      role:        LegendRole,
      from:        dataRef,
      encode:      extendEncode(buildLegendEncode(_, spec, config), legendEncode, Skip),
      marks:       children,
      aria:        _('aria'),
      description: _('description'),
      zindex:      _('zindex'),
      name,
      interactive,
      style
    }),
    scope
  );
}

function legendType(spec, scaleType) {
  let type = spec.type || Symbols;

  if (!spec.type && scaleCount(spec) === 1 && (spec.fill || spec.stroke)) {
    type = isContinuous(scaleType) ? Gradient
      : isDiscretizing(scaleType) ? Discrete
      : Symbols;
  }

  return type !== Gradient ? type
    : isDiscretizing(scaleType) ? Discrete
    : Gradient;
}

function scaleCount(spec) {
  return LegendScales.reduce((count, type) => count + (spec[type] ? 1 : 0), 0);
}

function buildLegendEncode(_, spec, config) {
  const encode = {enter: {}, update: {}};

  addEncoders(encode, {
    orient:       _('orient'),
    offset:       _('offset'),
    padding:      _('padding'),
    titlePadding: _('titlePadding'),
    cornerRadius: _('cornerRadius'),
    fill:         _('fillColor'),
    stroke:       _('strokeColor'),
    strokeWidth:  config.strokeWidth,
    strokeDash:   config.strokeDash,
    x:            _('legendX'),
    y:            _('legendY'),
    maxWidth:     _('maxWidth'),
    maxHeight:    _('maxHeight'),
    scrollbarWidth: _('scrollbarWidth'),

    // accessibility support
    format:       spec.format,
    formatType:   spec.formatType
  });

  return encode;
}

function sizeExpression(spec, scope, marks) {
  const size = deref(getChannel('size', spec, marks)),
        strokeWidth = deref(getChannel('strokeWidth', spec, marks)),
        fontSize = deref(getFontSize(marks[1].encode, scope, GuideLabelStyle));

  return parseExpression(
    `max(ceil(sqrt(${size})+${strokeWidth}),${fontSize})`,
    scope
  );
}

function getChannel(name, spec, marks) {
  return spec[name]
    ? `scale("${spec[name]}",datum)`
    : getEncoding(name, marks[0].encode);
}

function getFontSize(encode, scope, style) {
  return getEncoding('fontSize', encode) || getStyle('fontSize', scope, style);
}
