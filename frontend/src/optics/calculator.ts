import type { ExperimentId, OpticsParams, OpticsResult, OpticsSnapshot, OpticsStatus } from './types'

const DATA_SIZE = 800
const X_MAX = 20e-3

export const EMPTY_SNAPSHOT: OpticsSnapshot = Object.freeze({
  version: 0,
  experiment: '',
  params: Object.freeze({ wavelength: 550, slitWidth: 50, slitSeparation: 200, screenDistance: 1000 }),
  data: Object.freeze([]),
  result: Object.freeze({}),
  status: 'empty',
  message: '等待生成光强数据',
})

function inRange(value: number, min: number, max: number) {
  return Number.isFinite(value) && value >= min && value <= max
}

export function validateOpticsParams(
  experiment: ExperimentId | '',
  params: OpticsParams,
): string {
  const { wavelength, slitWidth, slitSeparation, screenDistance } = params

  if (!['double', 'single', 'newton'].includes(experiment)) {
    return '无效的实验类型'
  }
  if (!inRange(wavelength, 380, 780)) {
    return '波长必须在 380–780 nm 之间'
  }
  if (experiment !== 'newton' && !inRange(slitWidth, 10, 200)) {
    return '缝宽/间距必须在 10–200 μm 之间'
  }
  if (experiment === 'double' && !inRange(slitSeparation, 50, 500)) {
    return '缝间距必须在 50–500 μm 之间'
  }
  if (!inRange(screenDistance, 100, 2000)) {
    return '屏幕距离必须在 100–2000 mm 之间'
  }

  return ''
}

export function calculateOptics(
  experiment: ExperimentId,
  params: OpticsParams,
): { data: number[]; result: OpticsResult } {
  const { wavelength: lam, slitWidth: a, slitSeparation: d, screenDistance: L } = params
  const lambda = lam * 1e-9
  const aM = a * 1e-6
  const dM = d * 1e-6
  const LM = L * 1e-3
  const data: number[] = []
  const result: OpticsResult = {}

  if (experiment === 'double') {
    result.fringe = Math.round(lambda * LM / dM * 1e3 * 100) / 100
    for (let i = 0; i < DATA_SIZE; i++) {
      const x = (i / DATA_SIZE - 0.5) * X_MAX * 2
      const delta = Math.PI * dM * x / (lambda * LM)
      const beta = Math.PI * aM * x / (lambda * LM) || 1e-10
      const single = Math.sin(beta) / beta
      const intensity = Math.cos(delta) ** 2 * single ** 2
      data.push(Math.max(0, intensity))
    }
  } else if (experiment === 'single') {
    result.centralWidth = Math.round(2 * lambda * LM / aM * 1e3 * 100) / 100
    for (let i = 0; i < DATA_SIZE; i++) {
      const x = (i / DATA_SIZE - 0.5) * X_MAX * 2
      const beta = Math.PI * aM * x / (lambda * LM) || 1e-10
      const intensity = (Math.sin(beta) / beta) ** 2
      data.push(Math.max(0, intensity))
    }
  } else {
    const R = 1.0
    for (let i = 0; i < DATA_SIZE; i++) {
      const r = (i / DATA_SIZE) * 5e-3
      const path = r * r / (2 * R)
      const phi = 2 * Math.PI * path / lambda + Math.PI
      const intensity = 0.5 * (1 - Math.cos(phi))
      data.push(Math.max(0, intensity))
    }
  }

  return { data, result }
}

export function createSnapshot(
  previous: OpticsSnapshot,
  experiment: ExperimentId | '',
  params: OpticsParams,
): OpticsSnapshot {
  const nextParams = Object.freeze({ ...params })
  const version = previous.version + 1
  const message = validateOpticsParams(experiment, nextParams)

  if (message) {
    const status: OpticsStatus = experiment ? 'invalid' : 'empty'
    return Object.freeze({
      version,
      experiment,
      params: nextParams,
      data: Object.freeze([]),
      result: Object.freeze({}),
      status,
      message,
    })
  }

  const { data, result } = calculateOptics(experiment as ExperimentId, nextParams)
  if (!data.length) {
    return Object.freeze({
      version,
      experiment,
      params: nextParams,
      data: Object.freeze([]),
      result: Object.freeze({}),
      status: 'empty',
      message: '未生成光强数据',
    })
  }

  return Object.freeze({
    version,
    experiment,
    params: nextParams,
    data: Object.freeze(data),
    result: Object.freeze(result),
    status: 'ready',
    message: '',
  })
}
