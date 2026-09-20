// store 逻辑测试：验证参数校验、明确降级、版本推进、三类实验计算结论不变
// vue/pinia 通过 esbuild alias 替换为最小桩（见 __stubs__）
import { useOpticsStore } from '../store/optics'

let pass = 0, fail = 0
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log('PASS', msg) }
  else { fail++; console.log('FAIL', msg) }
}

const store = useOpticsStore()

// 初始为 double，默认参数下计算
store.compute()
const doubleData = [...store.intensityData]
assert(store.dataValid === true, '默认参数有效')
assert(store.intensityData.length === 800, 'double:800 个采样')
assert(store.result.fringe === 2.75, `double:Δy=2.75mm（实际 ${store.result.fringe}）`)
const v1 = store.dataVersion
assert(v1 === 1, '首次计算版本号 = 1')
assert(Math.abs(doubleData[400] - 1) < 1e-9, 'double:中心点强度为 1（计算结论不变）')

// 快速连续切换实验：每次原子发布，版本严格递增
store.setExperiment('single')
assert(store.intensityData.length === 800, 'single:800 个采样')
assert(store.result.centralWidth === 22, `single:中央宽=22mm（实际 ${store.result.centralWidth}）`)
assert(store.dataVersion === v1 + 1, 'single:版本号 +1')
store.setExperiment('newton')
assert(store.intensityData.length === 800, 'newton:800 个采样')
assert(store.dataVersion === v1 + 2, 'newton:版本号再 +1')
assert(store.intensityData[0] === 1, 'newton:r=0 处按现有公式强度为 1（计算结论不变）')

// 无效参数：明确降级，清空数据与结论，推进版本
store.setExperiment('double')
const goodVersion = store.dataVersion
store.params.wavelength = 0 // 越界
store.compute()
assert(store.dataValid === false && store.intensityData.length === 0, '无效波长:数据清空')
assert(store.result.fringe === undefined, '无效波长:旧理论结论被清除')
assert(store.dataVersion === goodVersion + 1, '降级同样推进版本号')

// double 缝间距非正 → 无效
store.params.wavelength = 550
store.params.slitSeparation = 0
store.compute()
assert(store.dataValid === false, 'double:缝间距非正数 → 降级')

// newton 不依赖缝参数：缝宽为 0 仍应正常
store.setExperiment('newton')
store.params.slitWidth = 0
store.compute()
assert(store.dataValid === true && store.intensityData.length === 800, 'newton:不校验缝宽，仍正常计算')

// NaN 参数 → 降级
store.params.screenDistance = NaN
store.compute()
assert(store.dataValid === false && store.intensityData.length === 0, 'NaN:明确降级不留旧数据')

// 恢复有效参数后结论与之前一致
store.params.screenDistance = 1000
store.params.slitWidth = 50
store.setExperiment('double')
store.params.slitSeparation = 200
store.compute()
assert(store.result.fringe === 2.75 && store.dataValid === true, '恢复后结论与原先一致')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
