import { useState, useEffect } from "react";
import { Mail, RefreshCw, CheckCircle, XCircle, Calendar, AlertCircle, ExternalLink, Unplug } from "lucide-react";

interface InboxEvent {
  id: number;
  companyName: string;
  eventType: "reply" | "rejection" | "interview" | "other";
  subject: string;
  fromAddress: string;
  emailDate: string;
  snippet: string;
  newStage: string | null;
}

interface StaleApplication {
  id: number;
  companyName: string;
  jobTitle: string;
  stage: string;
  createdAt: string;
}

interface InboxStatus {
  connected: boolean;
  gmailEmail: string | null;
  lastScanned: string | null;
}

const EVENT_ICONS: Record<string, any> = {
  reply: { icon: Mail, color: "#2563eb", bg: "rgba(37,99,235,0.1)", label: "Replied" },
  rejection: { icon: XCircle, color: "#ef4444", bg: "rgba(239,68,68,0.1)", label: "Rejected" },
  interview: { icon: Calendar, color: "#10b981", bg: "rgba(16,185,129,0.1)", label: "Interview" },
};

export default function InboxIQ({ token }: { token: string }) {
  const [status, setStatus] = useState<InboxStatus | null>(null);
  const [events, setEvents] = useState<InboxEvent[]>([]);
  const [stale, setStale] = useState<StaleApplication[]>([]);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    loadStatus();
    // Check for OAuth callback success
    const params = new URLSearchParams(window.location.search);
    if (params.get("inbox_connected") === "1") {
      window.history.replaceState({}, "", window.location.pathname);
      loadStatus();
      scan();
    }
  }, []);

  async function loadStatus() {
    try {
      const res = await fetch("/api/inbox/status", { headers });
      const data = await res.json();
      setStatus(data);
      if (data.connected) loadEvents();
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  async function loadEvents() {
    try {
      const res = await fetch("/api/inbox/events", { headers });
      const data = await res.json();
      setEvents(data.events || []);
      setStale(data.stale || []);
    } catch { /* silent */ }
  }

  async function scan() {
    setScanning(true);
    try {
      const res = await fetch("/api/inbox/scan", { method: "POST", headers });
      const data = await res.json();
      if (data.events?.length) {
        await loadEvents();
      }
      await loadStatus();
    } catch { /* silent */ }
    finally { setScanning(false); }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Gmail? InboxIQ will stop monitoring your inbox.")) return;
    await fetch("/api/inbox/disconnect", { method: "POST", headers });
    setStatus({ connected: false, gmailEmail: null, lastScanned: null });
    setEvents([]);
    setStale([]);
  }

  function connectGmail() {
    window.location.href = "/api/inbox/oauth/start";
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff < 7) return `${diff}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Not connected ────────────────────────────────────────────────────────
  if (!status?.connected) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center px-4">
        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Mail className="w-8 h-8 text-indigo-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-3">Connect your inbox</h2>
        <p className="text-slate-500 text-sm leading-relaxed mb-8">
          InboxIQ watches your Gmail for replies, rejections, and interview invites — then automatically updates your pipeline so you never lose track of where things stand.
        </p>
        <div className="bg-slate-50 rounded-xl p-4 mb-8 text-left space-y-3">
          {[
            { icon: Mail, color: "#2563eb", text: "Detects replies from companies you've applied to" },
            { icon: XCircle, color: "#ef4444", text: "Identifies rejections and advances stage to Rejected" },
            { icon: Calendar, color: "#10b981", text: "Flags interview invites and marks stage as Interviewing" },
            { icon: AlertCircle, color: "#f59e0b", text: "Surfaces applications that need a follow-up" },
          ].map(({ icon: Icon, color, text }) => (
            <div key={text} className="flex items-start gap-3">
              <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color }} />
              <p className="text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </div>
        <button
          onClick={connectGmail}
          className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors"
        >
          <Mail className="w-4 h-4" />
          Connect Gmail
        </button>
        <p className="text-xs text-slate-400 mt-4">Read-only access. We never send emails on your behalf.</p>
      </div>
    );
  }

  // ── Connected ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Inbox Activity</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Monitoring <span className="font-medium text-slate-700">{status.gmailEmail}</span>
            {status.lastScanned && (
              <span className="ml-2 text-slate-400">· Last scanned {formatDate(status.lastScanned)}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={scan}
            disabled={scanning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? "Scanning..." : "Scan now"}
          </button>
          <button
            onClick={disconnect}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors"
          >
            <Unplug className="w-3 h-3" />
            Disconnect
          </button>
        </div>
      </div>

      {/* Stale applications */}
      {stale.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-800">
              {stale.length} application{stale.length !== 1 ? "s" : ""} may need a follow-up
            </h3>
          </div>
          <div className="space-y-2">
            {stale.map(app => (
              <div key={app.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-amber-100">
                <div>
                  <p className="text-sm font-medium text-slate-800">{app.companyName}</p>
                  <p className="text-xs text-slate-500">{app.jobTitle} · Applied {formatDate(app.createdAt)}</p>
                </div>
                <span className="text-xs text-amber-600 font-medium">No reply in 7+ days</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Events feed */}
      {events.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No inbox activity yet.</p>
          <p className="text-slate-400 text-xs mt-1">Click "Scan now" to check your inbox.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event: InboxEvent) => {
            const config = EVENT_ICONS[event.eventType] || EVENT_ICONS.reply;
            const Icon = config.icon;
            return (
              <div key={event.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: config.bg }}>
                  <Icon className="w-4 h-4" style={{ color: config.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-900">{event.companyName}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: config.bg, color: config.color }}>
                      {config.label}
                    </span>
                    {event.newStage && (
                      <span className="text-xs text-slate-400">→ Stage updated to <strong>{event.newStage}</strong></span>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 mt-0.5 truncate">{event.subject}</p>
                  <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{event.snippet}</p>
                </div>
                <div className="text-xs text-slate-400 flex-shrink-0">{formatDate(event.emailDate)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
