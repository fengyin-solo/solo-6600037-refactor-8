import type { OpticsSnapshot } from '../optics/types'
import type { CanvasPipelineLayer, PreparedCanvas } from './useCanvasPipeline'

export type OpticsCanvasLayer = CanvasPipelineLayer<OpticsSnapshot>

export function wavelengthToRGB(nm: number): [number, number, number] {
  let r = 0, g = 0, b = 0
  if (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; b = 1.0 }
  else if (nm >= 440 && nm < 490) { g = (nm - 440) / 50; b = 1.0 }
  else if (nm >= 490 && nm < 510) { g = 1.0; b = -(nm - 510) / 20 }
  else if (nm >= 510 && nm < 580) { r = (nm - 510) / 70; g = 1.0 }
  else if (nm >= 580 && nm < 645) { r = 1.0; g = -(nm - 645) / 65 }
  else if (nm >= 645 && nm <= 780) { r = 1.0 }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

export function hasOpticsData(snapshot: OpticsSnapshot) {
  return snapshot.status === 'ready' && snapshot.data.length > 1
}

function drawPattern({ ctx, width: W, height: H }: PreparedCanvas, snapshot: OpticsSnapshot) {
  const [r, g, b] = wavelengthToRGB(snapshot.params.wavelength)
  const { data } = snapshot
  for (let x = 0; x < W; x++) {
    const idx = Math.round(x / W * (data.length - 1))
    const intensity = data[idx] || 0
    const alpha = Math.min(1, intensity)
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
    ctx.fillRect(x, 0, 1, H)
  }
}

function drawIntensity({ ctx, width: W, height: H }: PreparedCanvas, snapshot: OpticsSnapshot) {
  const { data } = snapshot
  if (data.length <= 1) return

  const [r, g, b] = wavelengthToRGB(snapshot.params.wavelength)
  ctx.beginPath()
  ctx.strokeStyle = `rgb(${r},${g},${b})`
  ctx.lineWidth = 2
  data.forEach((v, i) => {
    const x = i / (data.length - 1) * W
    const y = H - v * (H - 10) - 5
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.stroke()
  // Fill
  ctx.fillStyle = `rgba(${r},${g},${b},0.15)`
  ctx.lineTo(W, H); ctx.lineTo(0, H)
  ctx.closePath(); ctx.fill()
  // Axes
  ctx.strokeStyle = '#475569'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#94a3b8'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
  ctx.fillText('0', W / 2, H - 2); ctx.fillText('光强 I', 30, 12); ctx.fillText('位置 x', W - 20, H - 2)
}

function drawHeatmap({ ctx, width: W, height: H }: PreparedCanvas, snapshot: OpticsSnapshot) {
  const [r, g, b] = wavelengthToRGB(snapshot.params.wavelength)
  const { data } = snapshot
  const imgData = ctx.createImageData(W, H)
  for (let x = 0; x < W; x++) {
    const idx = Math.round(x / W * (data.length - 1))
    const intensity = Math.min(1, data[idx] || 0)
    for (let y = 0; y < H; y++) {
      const dist = Math.abs(y - H / 2) / (H / 2)
      const alpha = intensity * (1 - dist * 0.8) * 255
      const pos = (y * W + x) * 4
      imgData.data[pos] = r; imgData.data[pos + 1] = g; imgData.data[pos + 2] = b; imgData.data[pos + 3] = alpha
    }
  }
  ctx.putImageData(imgData, 0, 0)
}

export function createPatternLayer(element: OpticsCanvasLayer['element']): OpticsCanvasLayer {
  return {
    name: 'pattern',
    element,
    background: 'black',
    canRender: hasOpticsData,
    draw: drawPattern,
  }
}

export function createIntensityLayer(element: OpticsCanvasLayer['element']): OpticsCanvasLayer {
  return {
    name: 'intensity',
    element,
    background: '#0f172a',
    canRender: hasOpticsData,
    draw: drawIntensity,
  }
}

export function createHeatmapLayer(element: OpticsCanvasLayer['element']): OpticsCanvasLayer {
  return {
    name: 'heatmap',
    element,
    background: 'black',
    canRender: hasOpticsData,
    draw: drawHeatmap,
  }
}
