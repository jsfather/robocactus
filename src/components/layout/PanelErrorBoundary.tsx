import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode; fallbackTitle?: string }
type State = { error: Error | null }

/** Catch render crashes inside panel routes so one broken page does not blank the whole shell. */
export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[panel]', error, info.componentStack)
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.children !== this.props.children && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-lg rounded-xl border border-red-500/30 bg-red-500/5 p-6">
          <p className="font-semibold text-red-400">
            {this.props.fallbackTitle ?? 'این بخش با خطا مواجه شد'}
          </p>
          <p className="mt-2 break-words font-mono text-xs text-rc-muted">
            {this.state.error.message}
          </p>
          <button
            type="button"
            className="mt-4 rounded-lg border border-rc-line px-3 py-2 text-sm text-rc-blue hover:bg-rc-hover"
            onClick={() => this.setState({ error: null })}
          >
            تلاش مجدد
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
