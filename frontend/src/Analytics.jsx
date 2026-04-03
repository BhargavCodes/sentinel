// Analytics.jsx — Sentinel  |  Operational Analytics & Public Transparency
//
// Access model:
//   - Authenticated admin:  sees full analytics fetched from /analytics-data
//   - Authenticated public: sees a "PUBLIC TRANSPARENCY REPORT" banner but
//                           still gets the same charts (403 is handled gracefully)
//   - Unauthenticated:      sees the same transparency report banner with a
//                           "← Return to Home" back button and a sign-in prompt
//
// Enterprise palette (matches App.jsx v2):
//   Crimson  #E63946  — fire / critical
//   Amber    #F4A261  — warning / moderate
//   Teal     #457B9D  — operational / verified
//   Green    #2A9D8F  — safe / success
//   Slate    #5A8499  — other / neutral

import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth, authFetch } from "./App";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  CartesianGrid,
} from "recharts";

// ─────────────────────────────────────────────
// ENTERPRISE PALETTE
// ─────────────────────────────────────────────
const C = {
  crimson: "#E63946",
  amber:   "#F4A261",
  teal:    "#457B9D",
  green:   "#2A9D8F",
  slate:   "#5A8499",
  purple:  "#7B68B5",
};

const TYPE_COLORS = {
  fire:       C.crimson,
  earthquake: C.amber,
  flood:      C.teal,
  cyclone:    C.purple,
  other:      C.slate,
};

const SEVERITY_COLORS = {
  critical: C.crimson,
  high:     C.amber,
  moderate: C.teal,
  low:      C.green,
};

const STATUS_COLORS = {
  verified: C.green,
  pending:  C.amber,
  rejected: C.crimson,
};

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function Analytics() {
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");

  // Whether we're in "public transparency" mode
  // (unauthenticated, or authenticated as non-admin)
  const isPublicView = !user || user.role !== "admin";

  useEffect(() => {
    fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/analytics-data");
      if (res.status === 403) {
        // Public / non-admin hit the admin gate — surface the public message
        setError("public_access");
        setLoading(false);
        return;
      }
      if (res.status === 401) {
        // Unauthenticated — same treatment
        setError("public_access");
        setLoading(false);
        return;
      }
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed to load analytics.");
      setAnalytics(d);
    } catch (err) {
      if (err.message !== "public_access") setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Back button destination changes based on auth state
  const handleBack = () => navigate(user ? "/dashboard" : "/");
  const backLabel  = user ? "← Dashboard" : "← Return to Home";

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-void)",
      color: "var(--text-primary)",
    }}>

      {/* ── TOP NAV ── */}
      <AnalyticsNav
        onBack={handleBack}
        backLabel={backLabel}
        user={user}
        isPublicView={isPublicView}
      />

      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "80px 28px 80px" }}>

        {/* ── PAGE HEADER ── */}
        <div style={{ marginBottom: 40 }}>
          {isPublicView && (
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 14px",
              background: "rgba(244,162,97,0.12)",
              border: "1px solid rgba(244,162,97,0.30)",
              borderRadius: 99,
              marginBottom: 16,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.amber, flexShrink: 0 }} />
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 9,
                letterSpacing: 2, color: C.amber,
                textTransform: "uppercase",
              }}>
                Public Transparency Report
              </span>
            </div>
          )}

          <p style={{
            fontFamily: "var(--font-mono)", fontSize: 9,
            letterSpacing: 3, color: "var(--teal)",
            textTransform: "uppercase", marginBottom: 8,
          }}>
            {isPublicView ? "Platform Metrics" : "Operational Intelligence"}
          </p>
          <h1 style={{
            fontFamily: "var(--font-display)", fontWeight: 700,
            fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)",
            color: "var(--text-primary)", marginBottom: 10,
          }}>
            Sentinel Analytics
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 15, maxWidth: 560 }}>
            {isPublicView
              ? "Live platform transparency metrics. Sentinel publishes aggregate incident data to foster public accountability in disaster response."
              : "Incident trends, severity distribution, and alert delivery telemetry."}
          </p>
        </div>

        {/* ── LOADING ── */}
        {loading && (
          <div style={{
            display: "flex", alignItems: "center",
            justifyContent: "center", height: 280,
          }}>
            <div style={{ textAlign: "center" }}>
              <div className="s-spinner" />
              <p style={{
                fontFamily: "var(--font-mono)", fontSize: 10,
                color: "var(--text-dim)", marginTop: 16, letterSpacing: 2,
                textTransform: "uppercase",
              }}>
                Aggregating Data…
              </p>
            </div>
          </div>
        )}

        {/* ── ACCESS-RESTRICTED STATE (public/unauth) ── */}
        {!loading && error === "public_access" && (
          <PublicAccessBanner user={user} />
        )}

        {/* ── GENERIC ERROR ── */}
        {!loading && error && error !== "public_access" && (
          <div style={{
            padding: "18px 22px",
            background: "var(--crimson-dim)",
            border: "1px solid rgba(230,57,70,0.30)",
            borderRadius: "var(--radius-lg)",
            color: "var(--crimson)",
            fontFamily: "var(--font-body)",
            fontSize: 14,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>⚠</span>
            {error}
          </div>
        )}

        {/* ── DATA LOADED ── */}
        {analytics && !loading && (
          <>
            {/* KPI Row */}
            <KPIRow analytics={analytics} />

            {/* Top charts — 2 columns */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))",
              gap: 18, marginBottom: 18,
            }}>
              <ChartCard
                title="Incident Trend"
                subtitle="Monthly count of all reported incidents"
                accent={C.teal}
              >
                <MonthlyTrendChart data={analytics.counts_by_month} />
              </ChartCard>

              <ChartCard
                title="Incident Type Breakdown"
                subtitle="Distribution across emergency categories"
                accent={C.crimson}
              >
                <TypeBreakdownChart data={analytics.counts_by_type} />
              </ChartCard>
            </div>

            {/* Bottom charts — 3 columns */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 18, marginBottom: 18,
            }}>
              <ChartCard
                title="Severity Distribution"
                subtitle="Incident count by severity tier"
                accent={C.amber}
              >
                <SeverityPieChart data={analytics.counts_by_severity} />
              </ChartCard>

              <ChartCard
                title="Pipeline Status"
                subtitle="Lifecycle state across all incidents"
                accent={C.green}
              >
                <StatusDonutChart data={analytics.counts_by_status} />
              </ChartCard>

              <ChartCard
                title="Alert Delivery"
                subtitle="SMS & email dispatch performance"
                accent={C.teal}
              >
                <AlertStatsPanel stats={analytics.alert_stats} />
              </ChartCard>
            </div>

            {/* Threat Radar — full width */}
            <ChartCard
              title="Threat Profile Radar"
              subtitle="Weighted risk score across incident type and severity"
              accent={C.crimson}
            >
              <ThreatRadar
                byType={analytics.counts_by_type}
                bySeverity={analytics.counts_by_severity}
              />
            </ChartCard>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PUBLIC ACCESS BANNER
// Shown when unauthenticated or non-admin attempts to view analytics.
// Still promotes sign-in / transparency messaging.
// ─────────────────────────────────────────────
function PublicAccessBanner({ user }) {
  return (
    <div style={{
      padding: "40px 36px",
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderLeft: `4px solid ${C.amber}`,
      borderRadius: "var(--radius-xl)",
      maxWidth: 680,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 18 }}>
        <div style={{
          width: 44, height: 44, borderRadius: "var(--radius-md)",
          background: "rgba(244,162,97,0.12)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, flexShrink: 0,
        }}>
          🔒
        </div>
        <div>
          <p style={{
            fontFamily: "var(--font-mono)", fontSize: 9,
            letterSpacing: 2, color: C.amber,
            textTransform: "uppercase", marginBottom: 8,
          }}>
            Admin Access Required
          </p>
          <h3 style={{
            fontFamily: "var(--font-display)", fontWeight: 700,
            fontSize: 20, color: "var(--text-primary)", marginBottom: 10,
          }}>
            Full Analytics Require an Admin Account
          </h3>
          <p style={{
            color: "var(--text-muted)", fontSize: 14, lineHeight: 1.65, marginBottom: 20,
          }}>
            Detailed incident data and alert telemetry are restricted to verified
            admin operators. Public users can view aggregate summaries once data is
            published by the platform administrator.
          </p>
          {!user ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link to="/login">
                <button className="s-btn s-btn-primary" style={{ fontSize: 13 }}>
                  Sign In as Operator →
                </button>
              </Link>
              <Link to="/register">
                <button className="s-btn s-btn-ghost" style={{ fontSize: 13 }}>
                  Create Account
                </button>
              </Link>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
              Your account ({user.email || user.name}) has{" "}
              <strong style={{ color: C.amber }}>Public</strong> role.
              Contact your system administrator for elevated access.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TOP NAV
// ─────────────────────────────────────────────
function AnalyticsNav({ onBack, backLabel, user, isPublicView }) {
  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 999,
      height: 54,
      background: "rgba(11,19,32,0.97)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderBottom: "1px solid var(--border)",
      display: "flex", alignItems: "center",
      padding: "0 24px", gap: 14,
    }}>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          background: "none", border: "none",
          color: "var(--text-muted)",
          fontFamily: "var(--font-body)",
          fontWeight: 500,
          fontSize: 13, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 5,
          padding: "5px 8px",
          borderRadius: "var(--radius-sm)",
          transition: "color 0.18s, background 0.18s",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.color      = "var(--text-primary)";
          e.currentTarget.style.background = "var(--teal-glow)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color      = "var(--text-muted)";
          e.currentTarget.style.background = "transparent";
        }}
      >
        {backLabel}
      </button>

      <div style={{ width: 1, height: 18, background: "var(--border)" }} />

      {/* Shield icon + title */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
          <path
            d="M16 2L4 7V16C4 21.5 9.5 26.5 16 30C22.5 26.5 28 21.5 28 16V7L16 2Z"
            stroke="#457B9D" strokeWidth="1.5" fill="rgba(69,123,157,0.10)"
          />
          <circle cx="16" cy="16" r="2.2" fill="#457B9D" />
        </svg>
        <span style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700, fontSize: 14,
          letterSpacing: 0.5,
          color: "var(--text-primary)",
        }}>
          Analytics
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Role / view badge */}
      <div style={{
        padding: "4px 12px", borderRadius: 99,
        background: isPublicView
          ? "rgba(244,162,97,0.10)"
          : "rgba(42,157,143,0.10)",
        border: `1px solid ${isPublicView
          ? "rgba(244,162,97,0.28)"
          : "rgba(42,157,143,0.28)"}`,
        fontFamily: "var(--font-mono)",
        fontSize: 9, letterSpacing: 2,
        color: isPublicView ? C.amber : C.green,
        textTransform: "uppercase",
      }}>
        {isPublicView ? "Public Transparency Report" : "Admin View"}
      </div>
    </nav>
  );
}

// ─────────────────────────────────────────────
// KPI ROW
// ─────────────────────────────────────────────
function KPIRow({ analytics }) {
  const { total, counts_by_status, counts_by_type, alert_stats } = analytics;

  const verifiedPct = total
    ? Math.round(((counts_by_status?.verified ?? 0) / total) * 100)
    : 0;

  const kpis = [
    {
      label: "Total Incidents",
      value: total,
      sub:   "all time",
      color: C.teal,
      icon:  "📋",
    },
    {
      label: "Verified",
      value: counts_by_status?.verified ?? 0,
      sub:   `${verifiedPct}% verification rate`,
      color: C.green,
      icon:  "✅",
    },
    {
      label: "Pending Review",
      value: counts_by_status?.pending ?? 0,
      sub:   "awaiting admin",
      color: C.amber,
      icon:  "⏳",
    },
    {
      label: "Fire Incidents",
      value: counts_by_type?.fire ?? 0,
      sub:   "highest priority",
      color: C.crimson,
      icon:  "🔥",
    },
    {
      label: "Alerts Dispatched",
      value: alert_stats?.total_sent ?? 0,
      sub:   `${alert_stats?.email ?? 0} email · ${alert_stats?.sms ?? 0} SMS`,
      color: C.teal,
      icon:  "📡",
    },
  ];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: 14, marginBottom: 20,
    }}>
      {kpis.map((kpi, i) => (
        <KPICard key={i} {...kpi} />
      ))}
    </div>
  );
}

function KPICard({ label, value, sub, color, icon }) {
  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderTop: `3px solid ${color}`,
      borderRadius: "var(--radius-lg)",
      padding: "16px 18px",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", marginBottom: 8,
      }}>
        <p style={{
          fontFamily: "var(--font-mono)", fontSize: 9,
          letterSpacing: 1.5, color: "var(--text-dim)",
          textTransform: "uppercase",
        }}>
          {label}
        </p>
        <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
      </div>
      <p style={{
        fontFamily: "var(--font-mono)", fontWeight: 700,
        fontSize: 30, color, lineHeight: 1, marginBottom: 6,
      }}>
        {value.toLocaleString()}
      </p>
      <p style={{
        fontFamily: "var(--font-body)", fontSize: 12,
        color: "var(--text-dim)",
      }}>
        {sub}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// CHART CARD WRAPPER
// ─────────────────────────────────────────────
function ChartCard({ title, subtitle, accent = C.teal, children }) {
  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      padding: "22px 22px 18px",
      overflow: "hidden",
    }}>
      {/* Left accent bar */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
        <div style={{
          width: 3, borderRadius: 99, alignSelf: "stretch",
          background: accent, flexShrink: 0, minHeight: 36,
        }} />
        <div>
          <p style={{
            fontFamily: "var(--font-mono)", fontSize: 10,
            letterSpacing: 1.5, color: "var(--text-muted)",
            textTransform: "uppercase", marginBottom: 3,
          }}>
            {title}
          </p>
          <p style={{ color: "var(--text-dim)", fontSize: 12 }}>
            {subtitle}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────
// CUSTOM TOOLTIP
// ─────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--bg-raised)",
      border: "1px solid var(--border-hot)",
      borderRadius: "var(--radius-md)",
      padding: "10px 14px",
      fontFamily: "var(--font-mono)", fontSize: 11,
      boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
    }}>
      {label && (
        <p style={{ color: "var(--text-muted)", marginBottom: 5 }}>{label}</p>
      )}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || C.teal }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────
// MONTHLY TREND LINE CHART
// ─────────────────────────────────────────────
function MonthlyTrendChart({ data }) {
  if (!data?.length) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ left: -12, right: 8, top: 4 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(69,123,157,0.08)"
          vertical={false}
        />
        <XAxis
          dataKey="month"
          tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-dim)" }}
          tickFormatter={(v) => v.slice(5)}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-dim)" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="count"
          name="Incidents"
          stroke={C.teal}
          strokeWidth={2.5}
          dot={{ fill: C.teal, r: 4, strokeWidth: 0 }}
          activeDot={{ r: 6, fill: C.teal, stroke: "var(--bg-void)", strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────
// TYPE BREAKDOWN BAR CHART
// ─────────────────────────────────────────────
function TypeBreakdownChart({ data }) {
  if (!data || !Object.keys(data).length) return <EmptyState />;

  const chartData = Object.entries(data).map(([key, val]) => ({
    type:  key.charAt(0).toUpperCase() + key.slice(1),
    count: val,
    fill:  TYPE_COLORS[key] || C.slate,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ left: -12, right: 8, top: 4 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(69,123,157,0.08)"
          vertical={false}
        />
        <XAxis
          dataKey="type"
          tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-dim)" }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-dim)" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="count" name="Incidents" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.fill} opacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────
// SEVERITY PIE CHART
// ─────────────────────────────────────────────
function SeverityPieChart({ data }) {
  if (!data || !Object.keys(data).length) return <EmptyState />;

  const chartData = Object.entries(data).map(([key, val]) => ({
    name:  key.charAt(0).toUpperCase() + key.slice(1),
    value: val,
    fill:  SEVERITY_COLORS[key] || C.slate,
  }));

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <ResponsiveContainer width="55%" height={180}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%" cy="50%"
            innerRadius={48}
            outerRadius={78}
            paddingAngle={3}
            dataKey="value"
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} stroke="var(--bg-card)" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {chartData.map((entry, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 9, height: 9, borderRadius: 2,
              background: entry.fill, flexShrink: 0,
            }} />
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 10,
              color: "var(--text-muted)",
            }}>
              {entry.name}
            </span>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 11,
              color: entry.fill, fontWeight: 700, marginLeft: "auto",
            }}>
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// STATUS DONUT CHART
// ─────────────────────────────────────────────
function StatusDonutChart({ data }) {
  if (!data || !Object.keys(data).length) return <EmptyState />;

  const chartData = Object.entries(data).map(([key, val]) => ({
    name:  key.charAt(0).toUpperCase() + key.slice(1),
    value: val,
    fill:  STATUS_COLORS[key] || C.slate,
  }));
  const total = chartData.reduce((s, d) => s + d.value, 0);

  return (
    <div>
      <div style={{ position: "relative" }}>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%" cy="50%"
              innerRadius={54}
              outerRadius={78}
              paddingAngle={4}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} stroke="var(--bg-card)" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Centered total */}
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center", pointerEvents: "none",
        }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontWeight: 700,
            fontSize: 26, color: "var(--text-primary)", lineHeight: 1,
          }}>
            {total}
          </div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 8,
            color: "var(--text-dim)", letterSpacing: 1.5,
            textTransform: "uppercase", marginTop: 3,
          }}>
            Total
          </div>
        </div>
      </div>

      {/* Row legend */}
      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 8 }}>
        {chartData.map((entry, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: entry.fill }} />
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 9,
              color: "var(--text-muted)",
            }}>
              {entry.name} ({entry.value})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ALERT STATS PANEL
// ─────────────────────────────────────────────
function AlertStatsPanel({ stats }) {
  if (!stats) return <EmptyState />;

  const total       = (stats.total_sent || 0) + (stats.failed || 0);
  const successRate = total > 0 ? Math.round((stats.total_sent / total) * 100) : 100;
  const rateColor   = successRate >= 90 ? C.green : C.amber;

  const items = [
    { label: "Total Dispatched", val: stats.total_sent, color: C.teal,    icon: "📡" },
    { label: "Email",            val: stats.email,      color: C.teal,    icon: "📧" },
    { label: "SMS",              val: stats.sms,        color: C.amber,   icon: "📱" },
    { label: "Failed",           val: stats.failed,     color: C.crimson, icon: "⚠" },
  ];

  return (
    <div>
      {/* Success rate gauge */}
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontWeight: 700,
          fontSize: 44, color: rateColor, lineHeight: 1,
        }}>
          {successRate}%
        </div>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 9,
          letterSpacing: 2, color: "var(--text-dim)",
          marginTop: 4, textTransform: "uppercase",
        }}>
          Delivery Success Rate
        </div>
        {/* Progress bar */}
        <div style={{
          background: "rgba(255,255,255,0.06)",
          borderRadius: 99, height: 5, overflow: "hidden",
          margin: "10px 0",
        }}>
          <div style={{
            height: "100%", width: `${successRate}%`,
            background: `linear-gradient(90deg, ${C.teal}, ${rateColor})`,
            borderRadius: 99, transition: "width 0.9s ease",
          }} />
        </div>
      </div>

      {/* 2×2 stat grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {items.map((item, i) => (
          <div key={i} style={{
            background: "rgba(255,255,255,0.025)",
            borderRadius: "var(--radius-md)",
            padding: "11px 12px",
            borderLeft: `2px solid ${item.color}`,
          }}>
            <div style={{ fontSize: 15, marginBottom: 3 }}>{item.icon}</div>
            <div style={{
              fontFamily: "var(--font-mono)", fontWeight: 700,
              fontSize: 20, color: item.color,
            }}>
              {item.val ?? 0}
            </div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 8,
              color: "var(--text-dim)", letterSpacing: 1,
              textTransform: "uppercase", marginTop: 2,
            }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// THREAT RADAR
// ─────────────────────────────────────────────
function ThreatRadar({ byType, bySeverity }) {
  const severityWeight = { critical: 10, high: 7, moderate: 4, low: 1 };
  const total = Object.values(byType || {}).reduce((s, v) => s + v, 0) || 1;
  const severityScore = Object.entries(bySeverity || {}).reduce(
    (s, [k, v]) => s + (severityWeight[k] || 1) * v, 0
  );

  const radarData = [
    { subject: "Fire",       value: Math.round(((byType?.fire       || 0) / total) * 100), fullMark: 100 },
    { subject: "Earthquake", value: Math.round(((byType?.earthquake || 0) / total) * 100), fullMark: 100 },
    { subject: "Flood",      value: Math.round(((byType?.flood      || 0) / total) * 100), fullMark: 100 },
    { subject: "Cyclone",    value: Math.round(((byType?.cyclone    || 0) / total) * 100), fullMark: 100 },
    { subject: "Severity",   value: Math.min(Math.round((severityScore / (total * 10)) * 100), 100), fullMark: 100 },
    { subject: "Volume",     value: Math.min(total * 5, 100),                               fullMark: 100 },
  ];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={radarData} margin={{ top: 10, right: 36, bottom: 10, left: 36 }}>
        <PolarGrid stroke="rgba(69,123,157,0.12)" />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--text-muted)" }}
        />
        <PolarRadiusAxis
          angle={30}
          domain={[0, 100]}
          tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--text-dim)" }}
          axisLine={false}
          tickLine={false}
        />
        <Radar
          name="Threat Profile"
          dataKey="value"
          stroke={C.crimson}
          strokeWidth={2}
          fill={C.crimson}
          fillOpacity={0.10}
        />
        <Tooltip content={<CustomTooltip />} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────
function EmptyState() {
  return (
    <div style={{
      height: 180,
      display: "flex", alignItems: "center",
      justifyContent: "center",
      flexDirection: "column", gap: 10,
      color: "var(--text-dim)",
    }}>
      <div style={{ fontSize: 28, opacity: 0.3 }}>📊</div>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 10,
        letterSpacing: 2, textTransform: "uppercase",
      }}>
        No Data Available
      </span>
    </div>
  );
}
