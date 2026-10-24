import { Component, type ReactNode } from 'react'
import s from './ErrorBoundary.module.css'

export interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onReset?: () => void
}

export interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * 错误边界：捕获子组件树的渲染错误，避免整个应用白屏。
 *
 * 使用方式：
 * ```tsx
 * <ErrorBoundary fallback={<ErrorView onReset={() => window.location.reload()}>
 *   <ChatView />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: unknown) {
    console.error('[ErrorBoundary] 捕获到组件树错误:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback
      }
      return (
        <div className={s.root}>
          <div className={s.box}>
            <h2>页面出错</h2>
            <p>某个组件渲染失败了，这通常不是你的操作问题。</p>
            <pre className={s.detail}>{this.state.error?.message}</pre>
            <button type="button" onClick={this.handleReset}>
              重试
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
