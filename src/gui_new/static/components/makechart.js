const { linear, stepped, bars, spline, spline2 } = uPlot.paths;



const lineInterpolations = {
  linear:     0,
  stepAfter:  1,
  stepBefore: 2,
  spline:     3,
//	spline2:    4,
};

const drawStyles = {
  line:      0,
  bars:      1,
  points:    2,
  barsLeft:  3,
  barsRight: 4,
};

// generate bar builder with 60% bar (40% gap) & 100px max bar width
const _bars60_100   = bars({size: [0.6, 100]});
const _bars100Left  = bars({size: [1], align:  1});
const _bars100Right = bars({size: [1], align: -1});
const _stepBefore   = stepped({align: -1}); //, ascDesc: true
const _stepAfter    = stepped({align:  1}); //, ascDesc: true
const _linear       = linear();
const _spline       = spline();
//	const _spline2      = spline2();

function paths(u, seriesIdx, idx0, idx1, extendGap, buildClip) {
  let s = u.series[seriesIdx];
  let style = s.drawStyle;
  let interp = s.lineInterpolation;

  let renderer = (
    style == drawStyles.line ? (
      interp == lineInterpolations.linear     ? _linear :
      interp == lineInterpolations.stepAfter  ? _stepAfter :
      interp == lineInterpolations.stepBefore ? _stepBefore :
      interp == lineInterpolations.spline     ? _spline :
    //	interp == lineInterpolations.spline2    ? _spline2 :
      null
    ) :
    style == drawStyles.bars ? (
      _bars60_100
    ) :
    style == drawStyles.barsLeft ? (
      _bars100Left
    ) :
    style == drawStyles.barsRight ? (
      _bars100Right
    ) :
    style == drawStyles.points ? (
      () => null
    ) : () => null
  );

  return renderer(u, seriesIdx, idx0, idx1, extendGap, buildClip);
}

const palette = {
  "target":'#f8f9fa', // 0: red
  "volt_q":'#ffe066', // 1: yellow
  "volt_d":'#b197fc', // 2: violet
  "curr_q":'#91a7ff', // 3: indigo
  "curr_d":'#74c0fc', // 4: blue
  "velocity":'#63e6be', // 5: teal
  "angle":'#ffa94d', // 6: orange
};

function getSize() {
  return {
    width: Math.min(1000,window.innerWidth - 200),
    height: 300,
  }
}

function makeChart(cfg) {
  let opts = {
    title: cfg.title,
    ...getSize(),
    cursor: {
      points: {
        size:   (u, seriesIdx)       => u.series[seriesIdx].points.size * 2.5,
        width:  (u, seriesIdx, size) => size / 4,
        stroke: (u, seriesIdx)       => u.series[seriesIdx].points.stroke(u, seriesIdx) + '90',
        fill:   (u, seriesIdx)       => "#fff",
      },
      sync: {
        key: 0,
      }
    },
      legend: {show: false},
    scales: {
      x: {
        time: true,
      //	range: [-10,110],
      //	dir: -1,
      },
      "%": {
        auto: true,
      }
    },
    axes: [
      {
        stroke: "#eef1f5",
      //	font: `12px 'Roboto'`,
      //	labelFont: `12px 'Roboto'`,      
        grid: {
          show:false
        },
        ticks: {
          width: 1 / devicePixelRatio,
          stroke: "#eef1f5",
        }
      },
      {
        stroke: "#eef1f5",
      //	font: `12px 'Roboto'`,
      //	labelFont: `12px 'Roboto'`,
        grid: {
          width: 0.5 / devicePixelRatio,
          stroke: "#eef1f5",
        },
        ticks: {
          width: 1 / devicePixelRatio,
          stroke: "#eef1f5",
        },
      
      },
    ],
    series: [
      {
        label: "X",
      },
      Object.assign({
        label: "Target",
        width: 3 / devicePixelRatio,
        drawStyle: drawStyles.line,
        lineInterpolation: 3,
        paths,
      }, {
        drawStyle:         cfg.drawStyle,
        lineInterpolation: cfg.lineInterpolation,
        stroke:            palette["target"],
      }),
      Object.assign({
        label: "Volt_Q",
        width: 3 / devicePixelRatio,
        drawStyle: drawStyles.line,
        lineInterpolation: 3,
        paths,
      }, {
        drawStyle:         cfg.drawStyle,
        lineInterpolation: cfg.lineInterpolation,
        stroke:            palette["volt_q"],
      }),
      Object.assign({
        label: "Volt_D",
        width: 3 / devicePixelRatio,
        drawStyle: drawStyles.line,
        lineInterpolation: 3,
        paths,
      }, {
        drawStyle:         cfg.drawStyle,
        lineInterpolation: cfg.lineInterpolation,
        stroke:            palette["volt_d"],
      }),
      Object.assign({
        label: "Curr_Q",
        width: 3 / devicePixelRatio,
        drawStyle: drawStyles.line,
        lineInterpolation: 3,
        paths,
      }, {
        drawStyle:         cfg.drawStyle,
        lineInterpolation: cfg.lineInterpolation,
        stroke:            palette["curr_q"],
      }),
      Object.assign({
        label: "Curr_D",
        width: 3 / devicePixelRatio,
        drawStyle: drawStyles.line,
        lineInterpolation: 3,
        paths,
      }, {
        drawStyle:         cfg.drawStyle,
        lineInterpolation: cfg.lineInterpolation,
        stroke:            palette["curr_d"],
      }),
      Object.assign({
        label: "Velocity",
        width: 3 / devicePixelRatio,
        drawStyle: drawStyles.line,
        lineInterpolation: 3,
        paths,
      }, {
        drawStyle:         cfg.drawStyle,
        lineInterpolation: cfg.lineInterpolation,
        stroke:            palette["velocity"],
      }),
      Object.assign({
        label: "Angle",
        width: 3 / devicePixelRatio,
        drawStyle: drawStyles.line,
        lineInterpolation: 3,
        paths,
      }, {
        drawStyle:         cfg.drawStyle,
        lineInterpolation: cfg.lineInterpolation,
        stroke:            palette["angle"],
      }),
    ],
  };

  let u = new uPlot(opts, [], document.getElementById("chart"));
window.addEventListener("resize", () => u.setSize(getSize()));
 
  return u;
}