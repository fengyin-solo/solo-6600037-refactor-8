import { onBeforeUnmount } from 'vue'

/**
 * 统一渲染管线
 *
 * 光强分布曲线、干涉/衍射图样、2D 热力图三类图层共用同一条管线，
 * 把「取数据快照 → 尺寸处理 → 清屏 → 绘制/降级」收拢到一处：
 *
 * - 每一帧只获取一次快照，三个图层共享同一数据版本，
 *   窗口缩放、隐藏后恢复或快速连续切换实验/参数时不会混用新旧数据；
 * - 连续多次 requestRender 会被 rAF 合并为一次渲染；
 * - 空数据或 invalidParams 时清屏并绘制明确的降级占位，绝不残留旧画面；
 * - 画布 CSS 尺寸未就绪（clientWidth/clientHeight 为 0，如隐藏中）时，
 *   不保留旧位图，稍后自动重试，恢复可见后同版本重绘。
 */

/** 一次渲染所依据的不可变数据版本，同一次 pump 中所有图层共用 */
export interface RenderSnapshot {
  /** 数据版本号：每次重新计算或降级都单调递增 */
  version: number
  /** 波长（nm），用于取色 */
  wavelength: number
  /** 光强采样；空数组表示无有效数据 */
  data: number[]
  /** 参数是否有效：false 时进入降级显示 */
  valid: boolean
}

/** 传递给各图层专属绘制函数的上下文（清屏与尺寸处理已由管线完成） */
export interface DrawContext {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  data: number[]
  wavelength: number
  version: number
}

export interface CanvasLayer {
  /** 用于在渲染时取到最新 canvas 元素的 ref 读取器 */
  resolve: () => HTMLCanvasElement | null
  /** 画布底色（清屏色），与图层原有背景保持一致 */
  background: string
  /** 图层专属绘制内容；尺寸处理与清屏已由管线完成，此处不再重复 */
  draw: (dc: DrawContext) => void
}

export interface RenderPipelineOptions {
  /** 返回当前最新数据快照 */
  getSnapshot: () => RenderSnapshot
  layers: CanvasLayer[]
}

/** 降级占位：在清屏后的画布上明确提示，而不是留下上一实验的旧画面 */
function drawDegraded(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save()
  ctx.strokeStyle = 'rgba(148,163,184,0.25)'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1)
  ctx.fillStyle = '#64748b'
  ctx.font = '13px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('暂无有效数据', width / 2, height / 2)
  ctx.restore()
}

/**
 * 尺寸处理：按 CSS 尺寸同步位图尺寸（设备像素比不做放大，与原实现一致）。
 * 返回是否处于可绘制状态；返回 false 表示画布当前不可见/尺寸为 0。
 */
function resizeCanvas(canvas: HTMLCanvasElement): boolean {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (w === 0 || h === 0) return false
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  return true
}

export function createRenderPipeline({ getSnapshot, layers }: RenderPipelineOptions) {
  let rafId: number | null = null
  /** 画布尺寸未就绪时的有限次重试，避免隐藏期间无限轮询 */
  let retryCount = 0
  const MAX_RETRY = 5

  function pump() {
    rafId = null
    const snapshot = getSnapshot()

    // 第一阶段：统一做尺寸处理。任一画布未就绪（隐藏中/布局未完成），
    // 本帧整批都不绘制——既不会按错误尺寸生成位图，也保证恢复后三个图层
    // 同版本同帧落画；随后有限次重试，真正不可见时不无限轮询。
    const resolved = layers.map((layer) => {
      const canvas = layer.resolve()
      if (!canvas || !resizeCanvas(canvas)) return null
      return { layer, canvas }
    })

    if (resolved.some((r) => r === null)) {
      if (retryCount < MAX_RETRY) {
        retryCount++
        rafId = requestAnimationFrame(pump)
      } else {
        retryCount = 0
      }
      return
    }
    retryCount = 0

    // 第二阶段：同一快照、同一版本分发到所有图层；先统一清屏
    for (const item of resolved) {
      if (!item) continue
      const { layer, canvas } = item
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      ctx.fillStyle = layer.background
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      if (snapshot.valid && snapshot.data.length > 0) {
        layer.draw({
          ctx,
          width: canvas.width,
          height: canvas.height,
          data: snapshot.data,
          wavelength: snapshot.wavelength,
          version: snapshot.version,
        })
      } else {
        // 空数据 / 无效参数：明确降级，不残留旧画面
        drawDegraded(ctx, canvas.width, canvas.height)
      }
    }
  }

  /** 请求一帧渲染；连续调用合并为同一帧，使用最新数据版本 */
  function requestRender() {
    if (rafId !== null) return
    rafId = requestAnimationFrame(pump)
  }

  /** 隐藏后恢复：尺寸恢复，按当前数据版本重绘（双 rAF 等待布局完成） */
  function onVisibility() {
    if (document.visibilityState === 'visible') {
      requestRender()
      requestAnimationFrame(requestRender)
    }
  }

  window.addEventListener('resize', requestRender)
  document.addEventListener('visibilitychange', onVisibility)
  onBeforeUnmount(() => {
    window.removeEventListener('resize', requestRender)
    document.removeEventListener('visibilitychange', onVisibility)
    if (rafId !== null) cancelAnimationFrame(rafId)
  })

  return { requestRender }
}
