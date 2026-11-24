import React, { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("React Error Caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            backgroundColor: "#1e1e2e",
            color: "#cdd6f4",
            minHeight: "100vh",
            padding: "32px",
            fontFamily: "sans-serif",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <h2 style={{ color: "#f38ba8", marginBottom: "16px" }}>Bir hata oluştu</h2>
          <pre
            style={{
              backgroundColor: "#181825",
              padding: "16px",
              borderRadius: "8px",
              maxWidth: "600px",
              overflow: "auto",
              color: "#fab387",
              fontSize: "13px",
            }}
          >
            {this.state.error?.message || "Bilinmeyen hata"}
            {"\n\n"}
            {this.state.error?.stack}
          </pre>
          <div style={{ marginTop: "24px", display: "flex", gap: "12px" }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                backgroundColor: "#cba6f7",
                color: "#11111b",
                border: "none",
                padding: "10px 20px",
                borderRadius: "8px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Yeniden Yükle
            </button>
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              style={{
                backgroundColor: "#45475a",
                color: "#cdd6f4",
                border: "none",
                padding: "10px 20px",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              Önbelleği Sıfırla
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
