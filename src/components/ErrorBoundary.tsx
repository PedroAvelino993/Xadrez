import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCcw, Home } from "lucide-react";

interface State {
  error: Error | null;
}

/** Keeps the app shell alive if a page throws, instead of a blank screen. */
export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erro na página:", error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    // navigating to another page clears the error
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="card pad stack" style={{ maxWidth: 520, margin: "40px auto", textAlign: "center" }}>
          <h2>Algo deu errado nesta tela</h2>
          <p className="muted small">Seu progresso está salvo. Tente de novo; se o problema continuar, volte ao início.</p>
          <p className="xs faint mono">{String(this.state.error.message).slice(0, 160)}</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn primary" onClick={() => this.setState({ error: null })}>
              <RotateCcw size={16} /> Tentar de novo
            </button>
            <button
              className="btn"
              onClick={() => {
                window.location.hash = "/";
                window.location.reload();
              }}
            >
              <Home size={16} /> Início
            </button>
          </div>
        </div>
      </div>
    );
  }
}
