// 轻量逻辑测试运行器：用 esbuild 的 JS API 打包（本机 esbuild bin 可能是异构平台的），
// 通过 alias 用最小桩替换 vue/pinia，在 node 中直接跑 src/render/*.test.ts。
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tests = ['src/render/pipeline.test.ts', 'src/render/optics.test.ts']

for (const entry of tests) {
  const outfile = join(tmpdir(), `optics-test-${Math.random().toString(36).slice(2)}.mjs`)
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    alias: {
      vue: './src/render/__stubs__/vue.ts',
      pinia: './src/render/__stubs__/pinia.ts',
    },
    outfile,
  })
  console.log(`\n--- ${entry} ---`)
  await import(pathToFileURL(outfile).href)
}
