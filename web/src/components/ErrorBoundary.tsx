import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Catches render-time errors so an unexpected value from the API cannot blank
 * the whole application. The user gets a recoverable page instead of a white
 * screen, and the error is logged without any of its payload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log the message and component stack only — never the component props,
    // which can contain member data.
    console.error('Unhandled render error:', error.message, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-lg">
          <CardBody className="space-y-4 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="space-y-1.5">
              <h1 className="font-display text-lg font-bold">Something went wrong on this page</h1>
              <p className="text-sm ss-muted">
                The rest of SkillSpring is unaffected. Reloading usually clears this.
              </p>
            </div>
            <div className="flex justify-center gap-2">
              <Button onClick={() => window.location.reload()}>Reload the page</Button>
              <Button variant="secondary" onClick={() => this.setState({ error: null })}>
                Try again
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }
}
