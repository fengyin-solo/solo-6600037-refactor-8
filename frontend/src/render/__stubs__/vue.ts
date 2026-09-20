export const ref = <T>(v: T) => ({ value: v })
export const onBeforeUnmount = (fn: () => void) => {
  ;(globalThis as typeof globalThis & { __onUnmount?: () => void }).__onUnmount = fn
}
