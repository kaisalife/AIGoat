import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 前端与桥接层是纯 TS 契约，没有二进制依赖，因此 base 直接相对路径，
// 装进 Tauri 后从 `dist/` 起服务也能用。
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    // tauri.conf.json 的 devUrl 钉死这个端口：strictPort 保证端口被占时
    // 直接报错，而不是悄悄换端口让外壳加载到别的东西上。
    port: 5180,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // 依赖分块：重且按需的库各归一块，冷启动只加载首屏真正用到的。
    // - codemirror 只被「预览」面板用，而面板已懒加载 → 它跟着懒 chunk 走
    // - markdown（marked + dompurify）正文渲染要用，单独成块便于缓存
    // - tauri api 与 react 各自成块，业务代码改动不牵连它们的缓存
    // 用函数式而不是对象式：对象式要把每个包名硬编码，漏一个就混进 vendor。
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@codemirror') || id.includes('@lezer')) return 'codemirror'
          if (id.includes('marked') || id.includes('dompurify')) return 'markdown'
          if (id.includes('@tauri-apps')) return 'tauri'
          return 'vendor'
        },
      },
    },
  },
})