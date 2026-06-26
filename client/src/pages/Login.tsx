import { useState } from "react";
import { toast } from "sonner";

const TOKEN_KEY = "reviveiq_auth_token";

interface LoginProps {
  onSuccess: () => void;
}

const GemLogo = ({ size = 32 }: { size?: number }) => (
  <svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: size, height: size }}>
    <defs>
      <linearGradient id="ll-lg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#60a5fa"/><stop offset="100%" stopColor="#2563eb"/></linearGradient>
      <linearGradient id="ll-lg2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#93c5fd"/><stop offset="100%" stopColor="#3b82f6"/></linearGradient>
      <linearGradient id="ll-lg3" x1="100%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#1d4ed8"/><stop offset="100%" stopColor="#1e3a5f"/></linearGradient>
      <filter id="ll-glow"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <polygon points="36,4 68,36 36,68 4,36" fill="url(#ll-lg3)" opacity="0.35"/>
    <polygon points="36,4 20,20 36,36 52,20" fill="url(#ll-lg2)" opacity="0.9"/>
    <polygon points="36,4 52,20 68,36 36,36" fill="url(#ll-lg1)" opacity="0.65"/>
    <polygon points="4,36 20,20 36,36 20,52" fill="url(#ll-lg1)" opacity="0.5"/>
    <polygon points="68,36 52,20 36,36 52,52" fill="url(#ll-lg2)" opacity="0.75"/>
    <polygon points="36,68 20,52 36,36 52,52" fill="url(#ll-lg3)" opacity="0.95"/>
    <circle cx="36" cy="36" r="10" fill="none" stroke="rgba(147,197,253,0.3)" strokeWidth="1"/>
    <circle cx="36" cy="36" r="6" fill="white" opacity="0.95" filter="url(#ll-glow)"/>
    <circle cx="36" cy="36" r="3" fill="#93c5fd"/>
  </svg>
);

const features = [
  {
    icon: "🎯",
    headline: "Find jobs that actually fit",
    body: "We research live openings across 30+ companies, score every role for match, and surface only the opportunities worth your time.",
  },
  {
    icon: "✉️",
    headline: "Cover letters written in seconds",
    body: "Every letter is built around your career story — not a generic template. Tailored to the role, the company, and the hiring manager.",
  },
  {
    icon: "🔗",
    headline: "Real contacts, not just job boards",
    body: "We find the right person inside each company and give you their LinkedIn profile so you can reach out directly.",
  },
  {
    icon: "📬",
    headline: "Your inbox updates your pipeline",
    body: "Connect Gmail once. We automatically detect replies, interview invites, and rejections — and update your pipeline without you lifting a finger.",
  },
];

export default function Login({ onSuccess }: LoginProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useState(() => {
    const params = new URLSearchParams(window.location.search);
    const linkedinToken = params.get("linkedin_token");
    const authError = params.get("auth_error");
    if (linkedinToken) {
      localStorage.setItem(TOKEN_KEY, linkedinToken);
      window.history.replaceState({}, "", window.location.pathname);
      onSuccess();
    } else if (authError) {
      const messages: Record<string, string> = {
        linkedin_denied: "LinkedIn sign-in was cancelled",
        state_mismatch: "Security check failed — please try again",
        token_failed: "LinkedIn authentication failed — please try again",
        profile_failed: "Could not get LinkedIn profile — please try again",
        no_email: "LinkedIn account has no email — please use email/password",
        server_error: "Server error — please try again",
      };
      toast.error(messages[authError] || "Authentication failed");
      window.history.replaceState({}, "", window.location.pathname);
    }
  });

  const handleLinkedIn = () => { window.location.href = "/api/auth/linkedin"; };

  const handleSubmit = async () => {
    if (!email || !password || (mode === "register" && !name)) {
      toast.error("Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body = mode === "login" ? { email, password } : { email, password, name };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Something went wrong"); return; }
      if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
      toast.success(mode === "login" ? "Welcome back!" : "Account created!");
      onSuccess();
    } catch {
      toast.error("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      fontFamily: "'DM Sans', sans-serif",
      background: "#080f1e",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />

      {/* ── Left panel ─────────────────────────────────────────── */}
      <div style={{
        flex: "1",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "64px 56px",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Background glow */}
        <div style={{
          position: "absolute", top: "-120px", left: "-80px",
          width: "500px", height: "500px",
          background: "radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: "-80px", right: "-40px",
          width: "400px", height: "400px",
          background: "radial-gradient(circle, rgba(96,165,250,0.07) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "48px" }}>
          <GemLogo size={40} />
          <div>
            <div style={{
              fontFamily: "'Montserrat', sans-serif", fontWeight: 800,
              fontSize: "20px", letterSpacing: "-0.5px", color: "white",
            }}>
              MyCareer<span style={{ color: "#60a5fa" }}>IQ</span>
            </div>
            <div style={{ fontSize: "11px", color: "#475569", letterSpacing: "0.5px", marginTop: "1px" }}>
              BY REVIVEIQI
            </div>
          </div>
        </div>

        {/* Headline */}
        <div style={{ marginBottom: "40px" }}>
          <h2 style={{
            fontFamily: "'Montserrat', sans-serif", fontWeight: 800,
            fontSize: "30px", lineHeight: "1.2", color: "white",
            letterSpacing: "-0.5px", margin: "0 0 14px 0",
          }}>
            Your AI job search pipeline.<br />
            <span style={{ color: "#60a5fa" }}>Do less. Land faster.</span>
          </h2>
          <p style={{
            fontSize: "15px", color: "#94a3b8", lineHeight: "1.65",
            fontWeight: 300, margin: 0, maxWidth: "440px",
          }}>
            MyCareerIQ researches live roles, writes tailored cover letters, finds hiring managers, and tracks every application — automatically.
          </p>
        </div>

        {/* Feature grid */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {features.map((f) => (
            <div key={f.headline} style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
              <div style={{
                width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0,
                background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "16px",
              }}>
                {f.icon}
              </div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "white", marginBottom: "3px" }}>
                  {f.headline}
                </div>
                <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.55", fontWeight: 300 }}>
                  {f.body}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: "44px", paddingTop: "24px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <p style={{ fontSize: "13px", color: "#475569", margin: 0 }}>
            Need to transform your resume first?{" "}
            <a href="https://resumeiq.reviveiqi.com" target="_blank" rel="noopener noreferrer"
              style={{ color: "#60a5fa", textDecoration: "none", fontWeight: 500 }}>
              Start with ResumeIQ — it's free →
            </a>
          </p>
        </div>
      </div>

      {/* ── Right panel — auth form ─────────────────────────────── */}
      <div style={{
        width: "420px",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "64px 40px",
      }}>
        <div style={{ marginBottom: "32px" }}>
          <h1 style={{
            fontFamily: "'Montserrat', sans-serif", fontWeight: 800,
            fontSize: "24px", color: "white", margin: "0 0 6px 0",
            letterSpacing: "-0.3px",
          }}>
            {mode === "login" ? "Welcome back" : "Start your search"}
          </h1>
          <p style={{ fontSize: "14px", color: "#64748b", margin: 0, fontWeight: 300 }}>
            {mode === "login"
              ? "Sign in to your job search pipeline"
              : "Set up your pipeline in minutes — free to try"}
          </p>
        </div>

        {/* LinkedIn button */}
        <button
          onClick={handleLinkedIn}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
            gap: "10px", background: "#0077B5", color: "white",
            border: "none", borderRadius: "8px", padding: "11px 16px",
            fontSize: "14px", fontWeight: 600, cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif", transition: "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#006097")}
          onMouseLeave={e => (e.currentTarget.style.background = "#0077B5")}
        >
          <svg viewBox="0 0 24 24" style={{ width: "18px", height: "18px", fill: "white", flexShrink: 0 }}>
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
          Continue with LinkedIn
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "20px 0" }}>
          <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.08)" }} />
          <span style={{ fontSize: "12px", color: "#475569" }}>or email</span>
          <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.08)" }} />
        </div>

        {/* Form fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {mode === "register" && (
            <div>
              <label style={{ fontSize: "12px", fontWeight: 500, color: "#94a3b8", display: "block", marginBottom: "6px" }}>
                Full Name
              </label>
              <input
                placeholder="Bryan Greer"
                value={name}
                onChange={e => setName(e.target.value)}
                style={inputStyle}
              />
            </div>
          )}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 500, color: "#94a3b8", display: "block", marginBottom: "6px" }}>
              Email
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 500, color: "#94a3b8", display: "block", marginBottom: "6px" }}>
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              style={inputStyle}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: "100%", padding: "11px 16px",
              background: loading ? "#1e3a5f" : "linear-gradient(135deg, #2563eb, #1d4ed8)",
              color: "white", border: "none", borderRadius: "8px",
              fontSize: "14px", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "'DM Sans', sans-serif", marginTop: "4px",
              boxShadow: loading ? "none" : "0 4px 20px rgba(37,99,235,0.35)",
              transition: "all 0.15s",
            }}
          >
            {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Free Account"}
          </button>
        </div>

        {/* Toggle */}
        <p style={{ fontSize: "13px", color: "#475569", textAlign: "center", marginTop: "24px" }}>
          {mode === "login" ? (
            <>Don't have an account?{" "}
              <button onClick={() => setMode("register")}
                style={{ background: "none", border: "none", color: "#60a5fa", cursor: "pointer", fontSize: "13px", fontWeight: 500, padding: 0 }}>
                Sign up free
              </button>
            </>
          ) : (
            <>Already have an account?{" "}
              <button onClick={() => setMode("login")}
                style={{ background: "none", border: "none", color: "#60a5fa", cursor: "pointer", fontSize: "13px", fontWeight: 500, padding: 0 }}>
                Sign in
              </button>
            </>
          )}
        </p>

        {/* Legal */}
        <p style={{ fontSize: "11px", color: "#334155", textAlign: "center", marginTop: "32px", lineHeight: "1.6" }}>
          By continuing you agree to ReviveIQI's{" "}
          <a href="/privacy" style={{ color: "#475569", textDecoration: "underline" }}>Privacy Policy</a>
          <span style={{ color: "#334155", margin: "0 6px" }}>·</span>
          <a href="/terms" style={{ color: "#475569", textDecoration: "underline" }}>Terms of Service</a>
        </p>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  color: "white",
  fontSize: "14px",
  fontFamily: "'DM Sans', sans-serif",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
};
