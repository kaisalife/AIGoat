import { defineConfig } from 'vitest/config'

/**
 * 测试配置。
 *
 * 只测**纯函数**（summaries / baselineMap / projections / threadOrder /
 * approvalPolicy）——它们是这个仓库里最该被守住的部分：都是纯计算，
 * 出错时界面只会安静地显示错的数字，不会崩，所以没有测试兜底很难发现。
 *
 * 刻意不引入 jsdom / Testing Library：组件测试要配环境 + 渲染库，
 * 而这个仓库目前没有组件测试的诉求。等有了再说，不预先买。
 *
 * include 只扫 `.test.ts`（不扫 `.tsx`）：现在没有组件测试，
 * 配了 jsdom 与渲染库也只是空转——等真要测组件时再一起加。
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    reporters: 'default',
  },
})
