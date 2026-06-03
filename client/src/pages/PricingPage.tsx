import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Zap, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PricingPageProps {
  onClose?: () => void;
  trigger?: "run_limit" | "upgrade_cta" | "settings";
}

export default function PricingPage({ onClose, trigger }: PricingPageProps) {
  const [interval, setInterval] = useState<"monthly" | "annual">("annual");
  const [loading, setLoading] = useState<string | null>(null);

  const { data: subscription } = trpc.subscription.getStatus.useQuery();
  const createCheckout = trpc.subscription.createCheckout.useMutation();
  const createPortal = trpc.subscription.createPortal.useMutation();

  const handleUpgrade = async (plan: "pro_monthly" | "pro_annual") => {
    setLoading(plan);
    try {
      const { url } = await createCheckout.mutateAsync({ plan });
      window.location.href = url;
    } catch (err: any) {
      toast.error(err.message || "Failed to start checkout");
      setLoading(null);
    }
  };

  const handleManage = async () => {
    setLoading("portal");
    try {
      const { url } = await createPortal.mutateAsync();
      window.location.href = url;
    } catch (err: any) {
      toast.error(err.message || "Failed to open billing portal");
      setLoading(null);
    }
  };

  const isPro = subscription?.isPro;

  const PRO_FEATURES = [
    "Unlimited job research runs",
    "Unlimited pipeline (no 10-job cap)",
    "Real ATS jobs from Greenhouse, Ashby & Lever",
    "Fit-scored roles matched to your resume",
    "Recruiter & TA contact enrichment",
    "Cover letter generation (coming soon)",
    "Daily automated research at 8am EST",
    "Country + state + work arrangement filters",
  ];

  const FREE_FEATURES = [
    "3 research runs per month",
    "Up to 10 jobs in pipeline",
    "Resume scoring",
    "Dismiss & stage management",
  ];

  return (
    <div style={{
      minHeight: "100%",
      background: "#f8fafc",
      padding: "40px 24px",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", maxWidth: "560px", margin: "0 auto 40px" }}>
        <h1 style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 800, fontSize: "30px",
          color: "#0f172a", margin: "0 0 10px",
        }}>
          {trigger === "run_limit"
            ? "You've hit your free limit"
            : "Upgrade your job search"}
        </h1>
        <p style={{ color: "#64748b", fontSize: "15px", margin: 0 }}>
          {trigger === "run_limit"
            ? "Free plan includes 3 research runs/month. Upgrade for unlimited runs and a full pipeline."
            : "From 3 free runs to unlimited research, real ATS listings, and fit-scored roles."}
        </p>
      </div>

      {/* Billing toggle */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "32px" }}>
        <div style={{
          display: "flex", background: "white",
          border: "1px solid #e2e8f0", borderRadius: "10px",
          padding: "4px", gap: "4px",
        }}>
          {(["monthly", "annual"] as const).map(i => (
            <button
              key={i}
              onClick={() => setInterval(i)}
              style={{
                padding: "8px 20px", borderRadius: "7px", border: "none",
                fontSize: "13px", fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s",
                background: interval === i ? "#2563eb" : "transparent",
                color: interval === i ? "white" : "#64748b",
              }}
            >
              {i === "monthly" ? "Monthly" : "Annual"}
              {i === "annual" && (
                <span style={{
                  marginLeft: "6px", background: interval === "annual" ? "rgba(255,255,255,0.25)" : "#dcfce7",
                  color: interval === "annual" ? "white" : "#15803d",
                  fontSize: "10px", fontWeight: 700, padding: "1px 6px",
                  borderRadius: "10px", letterSpacing: "0.3px",
                }}>
                  SAVE 50%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Plan cards */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: "20px", maxWidth: "760px", margin: "0 auto 32px",
      }}>
        {/* Free */}
        <div style={{
          background: "white", borderRadius: "16px",
          border: `2px solid ${!isPro ? "#2563eb" : "#e2e8f0"}`,
          padding: "28px",
        }}>
          <div style={{ marginBottom: "20px" }}>
            <p style={{ fontSize: "12px", fontWeight: 700, color: "#94a3b8", letterSpacing: "1px", margin: "0 0 6px", textTransform: "uppercase" }}>Free</p>
            <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
              <span style={{ fontSize: "36px", fontWeight: 800, color: "#0f172a", fontFamily: "'Montserrat', sans-serif" }}>$0</span>
              <span style={{ fontSize: "14px", color: "#94a3b8" }}>/month</span>
            </div>
            <p style={{ fontSize: "13px", color: "#64748b", margin: "6px 0 0" }}>To get started</p>
          </div>

          {!isPro ? (
            <div style={{
              width: "100%", padding: "10px",
              background: "#f1f5f9", borderRadius: "8px",
              fontSize: "13px", fontWeight: 600, color: "#94a3b8",
              textAlign: "center", border: "none",
            }}>
              Current plan
            </div>
          ) : (
            <div style={{
              width: "100%", padding: "10px",
              background: "#f8fafc", borderRadius: "8px",
              fontSize: "13px", color: "#94a3b8",
              textAlign: "center",
            }}>
              Free tier
            </div>
          )}

          <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0" }}>
            {FREE_FEATURES.map(f => (
              <li key={f} style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginBottom: "10px" }}>
                <CheckCircle2 style={{ width: "15px", height: "15px", color: "#94a3b8", flexShrink: 0, marginTop: "2px" }} />
                <span style={{ fontSize: "13px", color: "#64748b" }}>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Pro */}
        <div style={{
          background: "linear-gradient(135deg, #1e3a5f, #0f172a)",
          borderRadius: "16px", border: "2px solid #2563eb",
          padding: "28px", position: "relative", overflow: "hidden",
        }}>
          {/* Glow */}
          <div style={{ position: "absolute", top: "-40px", right: "-40px", width: "160px", height: "160px", background: "radial-gradient(circle, rgba(37,99,235,0.3), transparent 70%)", pointerEvents: "none" }} />

          <div style={{ position: "absolute", top: "12px", right: "12px", background: "#2563eb", color: "white", fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "10px", letterSpacing: "0.5px" }}>
            MOST POPULAR
          </div>

          <div style={{ marginBottom: "20px" }}>
            <p style={{ fontSize: "12px", fontWeight: 700, color: "#60a5fa", letterSpacing: "1px", margin: "0 0 6px", textTransform: "uppercase" }}>Pro</p>
            <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
              <span style={{ fontSize: "36px", fontWeight: 800, color: "white", fontFamily: "'Montserrat', sans-serif" }}>
                {interval === "annual" ? "$24.92" : "$49.99"}
              </span>
              <span style={{ fontSize: "14px", color: "#94a3b8" }}>/month</span>
            </div>
            {interval === "annual" && (
              <p style={{ fontSize: "12px", color: "#60a5fa", margin: "4px 0 0" }}>
                $299/year — billed once, no auto-renew
              </p>
            )}
            {interval === "monthly" && (
              <p style={{ fontSize: "12px", color: "#94a3b8", margin: "4px 0 0" }}>
                $49.99/month — no auto-renew
              </p>
            )}
          </div>

          {isPro ? (
            <button
              onClick={handleManage}
              disabled={loading === "portal"}
              style={{
                width: "100%", padding: "11px",
                background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "8px", color: "white",
                fontSize: "13px", fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
              }}
            >
              {loading === "portal" ? <Loader2 style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite" }} /> : null}
              Manage subscription
            </button>
          ) : (
            <button
              onClick={() => handleUpgrade(interval === "annual" ? "pro_annual" : "pro_monthly")}
              disabled={!!loading}
              style={{
                width: "100%", padding: "11px",
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                border: "none", borderRadius: "8px", color: "white",
                fontSize: "13px", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                boxShadow: "0 4px 20px rgba(37,99,235,0.4)",
              }}
            >
              {loading ? <Loader2 style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite" }} /> : <Zap style={{ width: "14px", height: "14px" }} />}
              {loading ? "Loading..." : `Upgrade to Pro — ${interval === "annual" ? "$299/year" : "$49.99/month"}`}
            </button>
          )}

          <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0" }}>
            {PRO_FEATURES.map(f => (
              <li key={f} style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginBottom: "10px" }}>
                <CheckCircle2 style={{ width: "15px", height: "15px", color: "#60a5fa", flexShrink: 0, marginTop: "2px" }} />
                <span style={{ fontSize: "13px", color: "#94a3b8" }}>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Career Launch Bundle CTA */}
      <div style={{
        maxWidth: "760px", margin: "0 auto 24px",
        background: "white", borderRadius: "14px",
        border: "1px solid #e2e8f0", padding: "24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: "20px",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <span style={{ fontSize: "18px" }}>🚀</span>
            <p style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: 0 }}>
              Career Launch Bundle — $79.99
            </p>
            <span style={{ background: "#dcfce7", color: "#15803d", fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "10px" }}>
              BEST VALUE
            </span>
          </div>
          <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>
            ResumeIQ transformation + Working With Me profile + 30 days MyCareerIQ Pro. Everything you need to go from resume to pipeline in one shot.
          </p>
        </div>
        <a
          href="https://resumeiq.reviveiqi.com/app"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flexShrink: 0, display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "10px 20px", background: "#0f172a", color: "white",
            borderRadius: "8px", fontSize: "13px", fontWeight: 600,
            textDecoration: "none", whiteSpace: "nowrap",
          }}
        >
          Get Bundle <ExternalLink style={{ width: "12px", height: "12px" }} />
        </a>
      </div>

      {/* Trust line */}
      <p style={{ textAlign: "center", fontSize: "12px", color: "#94a3b8", maxWidth: "400px", margin: "0 auto" }}>
        No auto-renew. No hidden fees. Cancel anytime from your billing portal. Powered by Stripe.
      </p>
    </div>
  );
}
