import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Error boundaries must be classes. Renders nothing extra until a descendant throws. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error boundary caught:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div role="alert" className="min-h-0 flex-1 overflow-y-auto p-(--gutter)">
        <div className="mx-auto max-w-xl space-y-3 rounded-xl border bg-card p-6">
          <h2 className="text-base font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            The app hit an unexpected error. Reloading usually fixes it.
          </p>
          <pre className="num overflow-x-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
            {error.message}
          </pre>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    )
  }
}
