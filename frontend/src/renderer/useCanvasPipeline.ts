import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'

export interface PreparedCanvas {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  width: number
  height: number
}

export interface CanvasPipelineLayer<TSnapshot> {
  name: string
  element: Ref<HTMLCanvasElement | null>
  background: string
  canRender: (snapshot: TSnapshot) => boolean
  draw: (prepared: PreparedCanvas, snapshot: TSnapshot) => void
}

function prepareCanvas<TSnapshot>(
  layer: CanvasPipelineLayer<TSnapshot>,
): PreparedCanvas | null {
  const canvas = layer.element.value
  if (!canvas) return null

  const width = Math.max(1, Math.floor(canvas.clientWidth || canvas.offsetWidth))
  const height = Math.max(1, Math.floor(canvas.clientHeight || canvas.offsetHeight || 200))

  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const prepared = { canvas, ctx, width, height }
  ctx.fillStyle = layer.background
  ctx.fillRect(0, 0, width, height)

  return prepared
}

function renderLayer<TSnapshot>(
  layer: CanvasPipelineLayer<TSnapshot>,
  snapshot: TSnapshot,
) {
  const prepared = prepareCanvas(layer)
  if (!prepared) return

  if (!layer.canRender(snapshot)) return
  layer.draw(prepared, snapshot)
}

export function useCanvasPipeline<TSnapshot>(
  snapshotRef: Ref<TSnapshot>,
  layers: CanvasPipelineLayer<TSnapshot>[],
) {
  let frame = 0

  function render() {
    frame = 0
    if (document.visibilityState === 'hidden') return

    const snapshot = snapshotRef.value
    layers.forEach(layer => renderLayer(layer, snapshot))
  }

  function schedule() {
    if (frame || document.visibilityState === 'hidden') return
    frame = requestAnimationFrame(render)
  }

  function cancelFrame() {
    if (!frame) return
    cancelAnimationFrame(frame)
    frame = 0
  }

  let resizeObserver: ResizeObserver | null = null

  function handleVisible() {
    if (document.visibilityState === 'visible') {
      // 浏览器可能丢弃隐藏期间的画布位图，恢复时用当前版本重绘。
      schedule()
    }
  }

  onMounted(() => {
    resizeObserver = new ResizeObserver(schedule)
    layers.forEach(({ element }) => {
      if (element.value) resizeObserver?.observe(element.value)
    })
    document.addEventListener('visibilitychange', handleVisible)
    window.addEventListener('resize', schedule)
    schedule()
  })

  watch(snapshotRef, schedule, { flush: 'post' })

  onBeforeUnmount(() => {
    cancelFrame()
    resizeObserver?.disconnect()
    window.removeEventListener('resize', schedule)
    document.removeEventListener('visibilitychange', handleVisible)
  })

  return { schedule }
}
