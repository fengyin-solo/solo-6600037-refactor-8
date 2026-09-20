export type ExperimentId = 'double' | 'single' | 'newton'

export type OpticsStatus = 'ready' | 'empty' | 'invalid'

export interface OpticsParams {
  wavelength: number
  slitWidth: number
  slitSeparation: number
  screenDistance: number
}

export interface OpticsResult {
  fringe?: number
  centralWidth?: number
}

export interface OpticsSnapshot {
  version: number
  experiment: ExperimentId | ''
  params: Readonly<OpticsParams>
  data: readonly number[]
  result: Readonly<OpticsResult>
  status: OpticsStatus
  message: string
}
