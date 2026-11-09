import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** změna klíče (např. cesta stránky) chybu zahodí a obsah se vykreslí znovu */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Zachytí výjimku při vykreslování (např. generátor kroků spuštěný v useMemo nad nečekaným vstupem), aby
 * nezmizela celá aplikace včetně menu. Nabídne „Zkusit znovu“ a návrat na přehled.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "Vizualizaci se nepodařilo vykreslit:",
      error,
      info.componentStack,
    );
  }

  componentDidMount() {
    window.addEventListener("hashchange", this.reset);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.reset();
  }

  componentWillUnmount() {
    window.removeEventListener("hashchange", this.reset);
  }

  // přechod na jinou stránku (i tlačítkem Zpět) chybu ruší
  reset = () => {
    if (this.state.error) this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="error-panel" role="alert">
        <h2>Tuhle vizualizaci se nepodařilo vykreslit</h2>
        <p>
          Nejspíš dostala vstup, se kterým si neporadila (příliš velký, necelé
          nebo záporné číslo…). Zkuste to znovu s jiným vstupem – vaše data v
          ostatních modulech tím nejsou dotčena.
        </p>
        <p className="error-actions">
          <button type="button" className="primary" onClick={this.reset}>
            Zkusit znovu
          </button>
          <a href="#/">Zpět na přehled</a>
        </p>
        <details>
          <summary>Podrobnosti chyby</summary>
          <pre>{error.message || String(error)}</pre>
        </details>
      </div>
    );
  }
}
