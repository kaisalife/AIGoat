import { lazy, Suspense } from 'react'
import type { MarkdownTextProps } from './MarkdownText'

/**
 * Markdown 正文的**懒加载包装**。
 *
 * 真正的组件在 `./MarkdownText`，它带 marked + dompurify（约 76KB 独立 chunk）。
 * 冷启动第一帧通常只有引导页 / 空会话，根本用不到排版引擎——把它静态引入
 * 首屏等于白白撑大启动。这里包一层 `lazy`，让引擎随正文渲染才加载。
 *
 * 加载窗口内先按**纯文本**渲染：内容是对的，只是没有排版，引擎到齐后自动
 * 替换。首屏之后 `main.tsx` 会 idle 预取这个 chunk，而连接 + 工作区 + 恢复
 * 会话本来就比它慢，所以实践中用户看不到这一步。
 *
 * 放在 primitives 桶里导出（同名替换），两个消费方（MessageItem / UserInputCard）
 * 无需改动。
 */
const Real = lazy(() => import('./MarkdownText').then((m) => ({ default: m.MarkdownText })))

export function MarkdownText(props: MarkdownTextProps) {
  return (
    <Suspense
      fallback={
        <div className={props.className} style={{ whiteSpace: 'pre-wrap' }}>
          {props.text}
        </div>
      }
    >
      <Real {...props} />
    </Suspense>
  )
}
