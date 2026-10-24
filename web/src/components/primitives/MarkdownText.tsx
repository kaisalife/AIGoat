import { useDeferredValue, useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import clsx from 'clsx'
import s from './MarkdownText.module.css'

export interface MarkdownTextProps {
  text: string
  /** 流式中：未闭合的语法不补全，且最后一块略微淡出，提示还在写。 */
  streaming?: boolean
  className?: string
}

/**
 * Markdown 正文。
 *
 * **必须消毒**：模型输出是不可信输入，直接 `innerHTML` 等于把 XSS 交给
 * 上游决定。这里固定用白名单净化，不开放任何自定义标签。
 *
 * 字号走 `--ag-fs-content-*`：正文档位由设置中心控制（10–22px），
 * 而 UI 控件字号不跟着变——两块内容该能分别缩放。
 */
export function MarkdownText({ text, streaming = false, className }: MarkdownTextProps) {
  // 流式时正文每帧都在变，而 marked 解析 + DOMPurify 消毒 + innerHTML 替换
  // 都是**按整段文本**算的。直接跟着每个 delta 重算，等于把长消息的每个增量
  // 都变成一次全量重排。`useDeferredValue` 让 React 把这次重算降到低优先级，
  // 中间态直接跳过：屏幕上的 markdown 略微滞后于原始文本（不可感知），但
  // 解析/消毒次数随渲染节奏大幅下降。
  const deferred = useDeferredValue(text)
  const html = useMemo(() => render(deferred), [deferred])

  return (
    <div
      className={clsx(s.md, className)}
      data-streaming={streaming || undefined}
      // 内容已经过 DOMPurify 白名单净化
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** afterSanitizeAttributes 钩子只装一次（DOMPurify 的钩子是全局的）。 */
let linkHookInstalled = false

function ensureLinkHook(): void {
  if (linkHookInstalled) return
  linkHookInstalled = true
  // 白名单里故意不放 target/rel（否则模型可以自带任意 rel），改为净化之后
  // 由钩子统一补：链接一律新窗口打开并断开 opener——否则点击会把整个应用
  // 页面顶掉，而且注释里承诺的"断开 opener"并没有发生。
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element
    if (el.tagName === 'A' && el.getAttribute('href')) {
      el.setAttribute('target', '_blank')
      el.setAttribute('rel', 'noopener noreferrer nofollow')
    }
  })
}

function render(text: string): string {
  ensureLinkHook()
  // 流式过程中 Markdown 常常处于「半个语法」状态（如未闭合的 `**`）。
  // 关掉智能解析的副作用（自动补全未闭合标记）能让显示稳定得多。
  const parsed = marked.parse(text, { async: false, gfm: true, breaks: true })
  return DOMPurify.sanitize(parsed, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
      'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'a', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    ALLOWED_ATTR: ['href', 'title', 'class'],
    ALLOW_DATA_ATTR: false,
  })
}