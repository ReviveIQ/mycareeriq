import { useEffect, useState } from "react";
import { useLocation } from "wouter";

export default function SSO() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setError("Invalid SSO link. Please try again from ResumeIQ.");
      setStatus("error");
      return;
    }

    fetch("/api/auth/resumeiq-sso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error === "Token expired"
            ? "This link has expired. Please go back to ResumeIQ and try again."
            : "Something went wrong. Please try again.");
          setStatus("error");
          return;
        }

        // Store session token
        localStorage.setItem("reviveiq_auth_token", data.token);

        // Store trial info
        if (data.trialDaysRemaining !== undefined) {
          localStorage.setItem("mciq_trial_days", String(data.trialDaysRemaining));
          localStorage.setItem("mciq_trial_active", String(data.trialActive));
        }

        // Store resume key for settings pre-load
        if (data.resumeKey) {
          localStorage.setItem("mciq_resumeiq_key", data.resumeKey);
        }

        // Auto-sync resume to settings in background
        fetch("/api/auth/resumeiq-resume-sync", {
          method: "POST",
          headers: { Authorization: `Bearer ${data.token}` },
        }).then(r => r.json())
          .then(d => { if (d.synced) console.log(`[SSO] Resume synced — role: ${d.role}`); })
          .catch(() => {});

        // Full page redirect — forces AuthContext to re-initialize with new token
        window.location.href = "/";
      })
      .catch(() => {
        setError("Network error. Please try again.");
        setStatus("error");
      });
  }, [navigate]);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080f1e",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "DM Sans, sans-serif",
    }}>
      {status === "loading" ? (
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: "48px", height: "48px", border: "3px solid rgba(37,99,235,0.2)",
            borderTop: "3px solid #2563eb", borderRadius: "50%",
            animation: "spin 0.8s linear infinite", margin: "0 auto 20px",
          }} />
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          <p style={{ color: "#94a3b8", fontSize: "15px" }}>Setting up your job search pipeline…</p>
          <p style={{ color: "#475569", fontSize: "13px", marginTop: "8px" }}>Your resume is being transferred automatically.</p>
        </div>
      ) : (
        <div style={{ textAlign: "center", maxWidth: "400px", padding: "0 24px" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
          <h2 style={{ color: "white", fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>Something went wrong</h2>
          <p style={{ color: "#94a3b8", fontSize: "14px", marginBottom: "24px" }}>{error}</p>
          <a
            href="https://resumeiq.reviveiqi.com/app"
            style={{
              display: "inline-block", padding: "10px 24px",
              background: "#2563eb", color: "white", borderRadius: "8px",
              textDecoration: "none", fontWeight: 600, fontSize: "14px",
            }}
          >
            Back to ResumeIQ
          </a>
        </div>
      )}
    </div>
  );
}
