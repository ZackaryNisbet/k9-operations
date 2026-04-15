import React from "react";

const SHOW_TECHNICAL_DETAILS = !import.meta.env.PROD;

const shellStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background:
    "radial-gradient(circle at top, rgba(132,204,22,0.18), transparent 38%), linear-gradient(180deg, #14532D 0%, #0F3F22 100%)",
  padding: 24,
  fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
};

const cardStyle = {
  width: "100%",
  maxWidth: 520,
  padding: "36px 32px",
  borderRadius: 24,
  background: "rgba(15, 63, 34, 0.92)",
  border: "1px solid rgba(240, 242, 245, 0.12)",
  boxShadow: "0 28px 80px rgba(0,0,0,0.34)",
  color: "#F0F2F5",
};

const primaryButtonStyle = {
  padding: "12px 18px",
  borderRadius: 12,
  border: "none",
  background: "#84CC16",
  color: "#14532D",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 800,
  fontFamily: "inherit",
};

const secondaryButtonStyle = {
  padding: "12px 18px",
  borderRadius: 12,
  border: "1px solid rgba(240, 242, 245, 0.16)",
  background: "rgba(240, 242, 245, 0.06)",
  color: "#F0F2F5",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  fontFamily: "inherit",
};

export function AppCrashScreen({
  title = "K9 Operations hit an unexpected error",
  description = "This screen protects the app from hard-crashing. You can reload now or return to the app to keep working.",
  onRetry,
  retryLabel = "Return to App",
  returnHref = "/welcome",
  returnLabel = "Go to Welcome",
  error = null,
  details = null,
}) {
  const technicalDetails =
    details || error?.stack || error?.message || (typeof error === "string" ? error : "");

  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: "rgba(132,204,22,0.14)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
            }}
          >
            !
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#84CC16", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Recovery Mode
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em" }}>K9 Operations</div>
          </div>
        </div>

        <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: 14, color: "rgba(240, 242, 245, 0.78)", lineHeight: 1.65, marginBottom: 22 }}>
          {description}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {onRetry && (
            <button onClick={onRetry} style={primaryButtonStyle}>
              {retryLabel}
            </button>
          )}
          <button onClick={() => window.location.reload()} style={secondaryButtonStyle}>
            Reload App
          </button>
          <a href={returnHref} style={{ ...secondaryButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            {returnLabel}
          </a>
        </div>

        {SHOW_TECHNICAL_DETAILS && technicalDetails ? (
          <details style={{ marginTop: 22 }}>
            <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#D9F99D" }}>
              Technical details
            </summary>
            <pre
              style={{
                marginTop: 10,
                padding: 14,
                borderRadius: 14,
                background: "rgba(0,0,0,0.28)",
                color: "#E2E8F0",
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                overflowX: "auto",
              }}
            >
              {technicalDetails}
            </pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}

export class BrandedErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("BrandedErrorBoundary caught:", error, info);
    this.setState({ info });
  }

  reset = () => {
    this.setState({ error: null, info: null });
  };

  render() {
    if (this.state.error) {
      return (
        <AppCrashScreen
          title={this.props.title}
          description={this.props.description}
          returnHref={this.props.returnHref}
          returnLabel={this.props.returnLabel}
          retryLabel={this.props.retryLabel || "Try Again"}
          onRetry={this.reset}
          error={this.state.error}
          details={this.state.info?.componentStack}
        />
      );
    }

    return this.props.children;
  }
}
