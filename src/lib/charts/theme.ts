export const DASHBOARD_THEME: any = {
  color: [
    '#0d9488', // teal-600
    '#0f766e', // teal-800
    '#134e4a', // teal-900
    '#475569', // slate-600
    '#64748b', // slate-500
    '#94a3b8', // slate-400
  ],
  backgroundColor: 'transparent',
  textStyle: {
    fontFamily: 'DM Sans, sans-serif',
    color: '#334155', // slate-700
  },
  title: {
    textStyle: {
      color: '#0f172a', // slate-900
    },
    subtextStyle: {
      color: '#475569', // slate-600
    },
  },
  line: {
    itemStyle: {
      borderWidth: 2,
    },
    lineStyle: {
      width: 2,
    },
    symbolSize: 6,
  },
  radar: {
    itemStyle: {
      borderWidth: 2,
    },
    lineStyle: {
      width: 2,
    },
    symbolSize: 6,
  },
  bar: {
    itemStyle: {
      barBorderRadius: [2, 2, 0, 0],
    },
  },
  pie: {
    itemStyle: {
      borderRadius: 4,
      borderColor: '#fff',
      borderWidth: 2,
    },
  },
  scatter: {
    itemStyle: {
      borderWidth: 0,
      borderColor: '#fff',
    },
  },
  boxplot: {
    itemStyle: {
      borderColor: '#fff',
    },
  },
  parallel: {
    itemStyle: {
      borderWidth: 0,
      borderColor: '#fff',
    },
  },
  sankey: {
    itemStyle: {
      borderRadius: 5,
      borderColor: '#fff',
      borderWidth: 1.5,
    },
  },
  funnel: {
    itemStyle: {
      borderRadius: 2,
      borderColor: '#fff',
      borderWidth: 2,
    },
  },
  gauge: {
    itemStyle: {
      borderRadius: 10,
    },
  },
  candlestick: {
    itemStyle: {
      color: '#ec4899',
      color0: '#10b981',
      borderColor: '#ec4899',
      borderColor0: '#10b981',
    },
  },
  graph: {
    itemStyle: {
      borderWidth: 0,
      borderColor: '#fff',
    },
    lineStyle: {
      width: 1,
      color: '#aaa',
    },
    symbolSize: 4,
    smooth: false,
  },
  map: {
    itemStyle: {
      areaColor: '#e2e8f0', // slate-200
      borderColor: '#cbd5e1', // slate-300
      borderWidth: 0.5,
    },
    emphasis: {
      itemStyle: {
        areaColor: '#fbbf24', // amber-400
        borderColor: '#f59e0b', // amber-500
        borderWidth: 1,
      },
    },
  },
  geo: {
    itemStyle: {
      areaColor: '#e2e8f0', // slate-200
      borderColor: '#cbd5e1', // slate-300
      borderWidth: 0.5,
    },
    emphasis: {
      itemStyle: {
        areaColor: '#fbbf24', // amber-400
        borderColor: '#f59e0b', // amber-500
        borderWidth: 1,
      },
    },
  },
  categoryAxis: {
    axisLine: {
      show: true,
      lineStyle: {
        color: '#cbd5e1', // slate-300
      },
    },
    axisTick: {
      lineStyle: {
        color: '#cbd5e1', // slate-300
      },
    },
    axisLabel: {
      color: '#475569', // slate-600
    },
    splitLine: {
      lineStyle: {
        color: ['#e2e8f0'], // slate-200
      },
    },
    splitArea: {
      areaStyle: {
        color: ['rgba(0, 0, 0, 0.05)'],
      },
    },
  },
  valueAxis: {
    axisLine: {
      show: true,
      lineStyle: {
        color: '#cbd5e1', // slate-300
      },
    },
    axisTick: {
      lineStyle: {
        color: '#cbd5e1', // slate-300
      },
    },
    axisLabel: {
      color: '#475569', // slate-600
    },
    splitLine: {
      lineStyle: {
        color: ['#e2e8f0'], // slate-200
      },
    },
    splitArea: {
      areaStyle: {
        color: ['rgba(0, 0, 0, 0.05)'],
      },
    },
  },
  logAxis: {
    axisLine: {
      show: true,
      lineStyle: {
        color: '#cbd5e1', // slate-300
      },
    },
    axisTick: {
      lineStyle: {
        color: '#cbd5e1', // slate-300
      },
    },
    axisLabel: {
      color: '#475569', // slate-600
    },
    splitLine: {
      lineStyle: {
        color: ['#e2e8f0'], // slate-200
      },
    },
    splitArea: {
      areaStyle: {
        color: ['rgba(0, 0, 0, 0.05)'],
      },
    },
  },
  timeAxis: {
    axisLine: {
      show: true,
      lineStyle: {
        color: '#cbd5e1', // slate-300
      },
    },
    axisTick: {
      lineStyle: {
        color: '#cbd5e1', // slate-300
      },
    },
    axisLabel: {
      color: '#475569', // slate-600
    },
    splitLine: {
      lineStyle: {
        color: ['#e2e8f0'], // slate-200
      },
    },
    splitArea: {
      areaStyle: {
        color: ['rgba(0, 0, 0, 0.05)'],
      },
    },
  },
  toolbox: {
    iconStyle: {
      borderColor: '#0d9488', // teal-600
    },
    emphasis: {
      iconStyle: {
        borderColor: '#0f766e', // teal-800
      },
    },
  },
  legend: {
    textStyle: {
      color: '#475569', // slate-600
    },
  },
  tooltip: {
    backgroundColor: '#f8fafc', // slate-50
    borderColor: '#cbd5e1', // slate-300
    borderWidth: 1,
    textStyle: {
      color: '#0f172a', // slate-900
    },
  },
  timeline: {
    lineStyle: {
      color: '#cbd5e1', // slate-300
      width: 1,
    },
    itemStyle: {
      color: '#0d9488', // teal-600
      borderWidth: 1,
    },
    controlStyle: {
      color: '#475569', // slate-600
      borderColor: '#cbd5e1', // slate-300
      borderWidth: 0.5,
    },
    checkpointStyle: {
      color: '#e34f07',
      borderColor: 'rgba(194, 53, 49, 0.5)',
    },
    label: {
      color: '#475569', // slate-600
    },
    emphasis: {
      itemStyle: {
        color: '#0f766e', // teal-800
      },
      controlStyle: {
        color: '#475569', // slate-600
        borderColor: '#cbd5e1', // slate-300
        borderWidth: 0.5,
      },
      label: {
        color: '#475569', // slate-600
      },
    },
  },
  visualMap: {
    textStyle: {
      color: '#475569', // slate-600
    },
  },
  dataZoom: {
    backgroundColor: 'rgba(0, 0, 0, 0)',
    dataBackgroundColor: '#e2e8f0', // slate-200
    fillerColor: 'rgba(13, 148, 136, 0.1)', // teal-600 with alpha
    handleColor: '#0d9488', // teal-600
    handleSize: '100%',
    textStyle: {
      color: '#475569', // slate-600
    },
  },
  markPoint: {
    label: {
      color: '#fff',
    },
    emphasis: {
      label: {
        color: '#fff',
      },
    },
  },
};
