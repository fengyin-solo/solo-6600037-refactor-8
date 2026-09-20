// 管线调度逻辑测试：使用 DOM/Canvas stub，验证同版本共享、rAF 合并、降级与事件触发
import { createRenderPipeline } from './pipeline'

// ---- rAF 可控队列 ----
let frame = 0
const queue: FrameRequestCallback[] = []
;(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
  queue.push(cb)
  return queue.length
}
;(globalThis as any).cancelAnimationFrame = () => {}
function flushFrames(n = 1) {
  for (let k = 0; k < n; k++) {
    frame++
    const q = queue.splice(0)
    q.forEach((cb) => cb(frame))
  }
}

// ---- window/document 事件桩 ----
const listeners: Record<string, (() => void) | undefined> = {}
;(globalThis as any).window = {
  addEventListener: (ev: string, fn: () => void) => { listeners['w:' + ev] = fn },
  removeEventListener: () => {},
}
;(globalThis as any).document = {
  visibilityState: 'visible',
  addEventListener: (ev: string, fn: () => void) => { listeners['d:' + ev] = fn },
  removeEventListener: () => {},
}

function makeCanvas(w: number, h: number) {
  const calls: string[] = []
  const ctx = {
    canvas: null as any,
    fillStyle: '', fillRect: (x: number, y: number, cw: number, ch: number) => calls.push(`clear:${cw}x${ch}`),
    save: () => {}, restore: () => {}, strokeStyle: '', lineWidth: 0, strokeRect: () => calls.push('border'),
    font: '', textAlign: '', textBaseline: '', fillText: (t: string) => calls.push(`text:${t}`),
    draw: (v: number) => calls.push(`draw:v${v}`),
  }
  const canvas = { clientWidth: w, clientHeight: h, width: 0, height: 0, getContext: () => ctx }
  ctx.canvas = canvas
  return { canvas, ctx, calls }
}

const A = makeCanvas(100, 200), B = makeCanvas(100, 200), C = makeCanvas(100, 200)

let snapshot = { version: 1, wavelength: 550, data: [1, 2, 3], valid: true }
const seen: number[] = []
const pipeline = createRenderPipeline({
  getSnapshot: () => snapshot,
  layers: [
    { resolve: () => A.canvas, background: 'black', draw: (dc) => { seen.push(dc.version); A.ctx.draw(dc.version) } },
    { resolve: () => B.canvas, background: '#0f172a', draw: (dc) => { seen.push(dc.version); B.ctx.draw(dc.version) } },
    { resolve: () => C.canvas, background: 'black', draw: (dc) => { seen.push(dc.version); C.ctx.draw(dc.version) } },
  ],
})

let pass = 0, fail = 0
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log('PASS', msg) }
  else { fail++; console.log('FAIL', msg) }
}

// 1) 连续快速请求 5 次（模拟快速切换实验），只应产生一帧；三图层同版本
pipeline.requestRender(); pipeline.requestRender(); pipeline.requestRender()
pipeline.requestRender(); pipeline.requestRender()
assert(queue.length === 1, '连续 5 次请求被 rAF 合并为 1 帧')
flushFrames()
assert(seen.length === 3 && seen.every((v) => v === 1), '三图层共享同一版本 v1')
assert(A.canvas.width === 100 && A.canvas.height === 200, '尺寸处理:位图同步为 CSS 尺寸')
assert(A.calls[0] === 'clear:100x200', '绘制前先清屏')

// 2) 参数变化推进版本后请求渲染
snapshot = { version: 2, wavelength: 600, data: [4, 5, 6], valid: true }
pipeline.requestRender(); flushFrames()
assert(seen.length === 6 && seen.slice(3).every((v) => v === 2), '版本切换后三图层统一使用 v2')

// 3) 无效参数降级：清屏 + 占位，绝不调用专属绘制，不留旧画面
snapshot = { version: 3, wavelength: 0, data: [], valid: false }
pipeline.requestRender(); flushFrames()
const lastA = [...A.calls]
assert(lastA[lastA.length - 2] === 'border' && lastA[lastA.length - 1] === 'text:暂无有效数据', '降级:清屏后绘制占位而非旧画面')
assert(seen.length === 6, '降级:不调用任何图层的专属绘制')

// 4) 恢复有效后按新版本正常绘制
snapshot = { version: 4, wavelength: 550, data: [1], valid: true }
pipeline.requestRender(); flushFrames()
assert(seen.length === 9 && seen.slice(6).every((v) => v === 4), '恢复:三图层统一回到有效版本 v4')

// 5) resize 事件触发重绘
listeners['w:resize']!()
assert(queue.length === 1, '窗口 resize 触发一帧重绘')
flushFrames()
assert(seen.length === 12, 'resize:按当前数据版本重绘')

// 6) 隐藏后恢复触发重绘
listeners['d:visibilitychange']!()
assert(queue.length >= 1, 'visibilitychange 触发重绘调度')
flushFrames(2)

// 7) 画布尺寸为 0（隐藏中）时不按错误尺寸绘制，恢复后自动重绘
A.canvas.clientWidth = 0
pipeline.requestRender(); flushFrames(6) // 超过最大重试次数后停止轮询
const hiddenDrawsAfter = seen.length
pipeline.requestRender(); flushFrames(6)
assert(seen.length === hiddenDrawsAfter, '隐藏画布持续不可见时不产生绘制')
A.canvas.clientWidth = 100
listeners['d:visibilitychange']!()
flushFrames(2)
assert(seen.length > hiddenDrawsAfter, '恢复可见后同版本重绘成功')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
