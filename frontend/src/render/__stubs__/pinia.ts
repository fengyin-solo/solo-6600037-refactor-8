// 最小 pinia 桩：模拟 setup store 对顶层 ref 的解包（属性访问直达 .value）
export const defineStore = (_id: string, setup: () => Record<string, unknown>) => () => {
  const state = setup()
  return new Proxy(state, {
    get(target, key) {
      const v = target[key as string]
      return v && typeof v === 'object' && 'value' in (v as object) ? (v as { value: unknown }).value : v
    },
    set(target, key, value) {
      const v = target[key as string]
      if (v && typeof v === 'object' && 'value' in (v as object)) {
        ;(v as { value: unknown }).value = value
      } else {
        target[key as string] = value
      }
      return true
    },
  })
}
