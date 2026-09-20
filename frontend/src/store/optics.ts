import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useOpticsStore = defineStore('optics', () => {
  const currentExperiment = ref('double')
  const params = ref({ wavelength: 550, slitWidth: 50, slitSeparation: 200, screenDistance: 1000 })
  const intensityData = ref<number[]>([])
  const result = ref<{ fringe?: number; centralWidth?: number }>({})
  /**
   * 数据版本号：每次成功计算或降级都 +1，是渲染管线判定「同一批数据」
   * 的唯一依据，供窗口缩放、隐藏恢复、快速切换时共享同版本数据。
   */
  const dataVersion = ref(0)
  /** 当前参数/数据是否有效；false 时渲染管线走明确降级，不显示旧画面 */
  const dataValid = ref(true)

  function setExperiment(id: string) { currentExperiment.value = id; compute() }

  function isFinitePositive(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v > 0
  }

  /** 参数校验：三类实验共用的基础范围 + 各自所需的缝参数 */
  function validateParams(): boolean {
    const p = params.value
    if (!isFinitePositive(p.wavelength) || p.wavelength < 380 || p.wavelength > 780) return false
    if (!isFinitePositive(p.screenDistance)) return false
    if (currentExperiment.value !== 'newton') {
      if (!isFinitePositive(p.slitWidth)) return false
    }
    if (currentExperiment.value === 'double') {
      if (!isFinitePositive(p.slitSeparation)) return false
    }
    return true
  }

  /**
   * 降级路径：清空数据与理论结论、标记无效、推进版本号。
   * 渲染管线据此清屏并显示占位，而不会保留上一次的旧画面或旧结论。
   */
  function invalidate() {
    intensityData.value = []
    result.value = {}
    dataValid.value = false
    dataVersion.value++
  }

  /** 发布一次有效结果：原子替换数据并推进版本号 */
  function publish(data: number[], derived: { fringe?: number; centralWidth?: number }) {
    intensityData.value = data
    result.value = derived
    dataValid.value = true
    dataVersion.value++
  }

  function compute() {
    if (!validateParams()) {
      invalidate()
      return
    }

    const { wavelength: lam, slitWidth: a, slitSeparation: d, screenDistance: L } = params.value
    const lambda = lam * 1e-9
    const aM = a * 1e-6
    const dM = d * 1e-6
    const LM = L * 1e-3
    const N = 800
    const data: number[] = []
    const xMax = 20e-3
    const derived: { fringe?: number; centralWidth?: number } = {}

    if (currentExperiment.value === 'double') {
      derived.fringe = Math.round(lambda * LM / dM * 1e3 * 100) / 100
      for (let i = 0; i < N; i++) {
        const x = (i / N - 0.5) * xMax * 2
        const delta = Math.PI * dM * x / (lambda * LM)
        const beta = Math.PI * aM * x / (lambda * LM) || 1e-10
        const single = Math.sin(beta) / beta
        const intensity = Math.cos(delta) ** 2 * single ** 2
        data.push(Math.max(0, intensity))
      }
    } else if (currentExperiment.value === 'single') {
      derived.centralWidth = Math.round(2 * lambda * LM / aM * 1e3 * 100) / 100
      for (let i = 0; i < N; i++) {
        const x = (i / N - 0.5) * xMax * 2
        const beta = Math.PI * aM * x / (lambda * LM) || 1e-10
        const intensity = (Math.sin(beta) / beta) ** 2
        data.push(Math.max(0, intensity))
      }
    } else { // newton
      const R = 1.0
      for (let i = 0; i < N; i++) {
        const r = (i / N) * 5e-3
        const path = r * r / (2 * R)
        const phi = 2 * Math.PI * path / lambda + Math.PI
        const intensity = 0.5 * (1 - Math.cos(phi))
        data.push(Math.max(0, intensity))
      }
    }

    // 兜底：出现空数据或非有限值视为无效，明确降级，原有计算结论不受影响
    if (data.length === 0 || data.some((v) => !Number.isFinite(v))) {
      invalidate()
      return
    }

    publish(data, derived)
  }

  return { currentExperiment, params, intensityData, result, dataVersion, dataValid, setExperiment, compute }
})
