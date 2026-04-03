// Profile.jsx — Sentinel  |  Operator Settings & Field Reports
//
// Layout: Fixed sidebar + scrollable main content
// Tab 1: Operator Settings — fetch GET /me, update via PATCH /me
// Tab 2: My Field Reports — fetch GET /incidents/mine, card grid
//
// Theme: "Enterprise Disaster Command" — mirrors App.jsx / Landing.jsx
// Deep navy void (#0B1320), card panels (#162237), operational teal (#457B9D),
// crimson alerts (#E63946), amber warnings (#F4A261), safe green (#2A9D8F).
// DM Sans for UI, Space Mono for labels/tags/metadata.

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate }                              from "react-router-dom";
import { motion, AnimatePresence }                  from "framer-motion";
import { useAuth, authFetch, API_BASE }             from "./App";

// ─────────────────────────────────────────────────────────────
// DESIGN TOKENS (mirrors App.jsx / Landing.jsx)
// ─────────────────────────────────────────────────────────────
const T = {
  navy:    "#0B1320",
  panel:   "#111C2D",
  card:    "#162237",
  raised:  "#1A2840",
  teal:    "#457B9D",
  tealDim: "rgba(69,123,157,0.12)",
  crimson: "#E63946",
  amber:   "#F4A261",
  green:   "#2A9D8F",
  text:    "#F0F4F8",
  muted:   "#8AABB8",
  dim:     "#4A6A7A",
  border:  "rgba(69,123,157,0.15)",
  borderH: "rgba(69,123,157,0.38)",
};

// ─────────────────────────────────────────────────────────────
// ANIMATION VARIANTS
// ─────────────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show:   { opacity: 1, y: 0,  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

const stagger = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

// ─────────────────────────────────────────────────────────────
// CITIES LIST (matches backend METRO_CITIES_DISTANCE keys + common cities)
// ─────────────────────────────────────────────────────────────
const CITIES = [
  "Mumbai", "Delhi", "Kolkata", "Chennai",
  "Bangalore", "Hyderabad", "Pune", "Ahmedabad",
  "Jaipur", "Surat", "Lucknow", "Kanpur",
  "Nagpur", "Indore", "Bhopal", "Visakhapatnam",
  "Patna", "Vadodara", "Ludhiana", "Coimbatore",
];

// Severity → colour mapping
const SEV_COLOR = {
  low:      T.green,
  moderate: T.amber,
  high:     T.crimson,
  critical: T.crimson,
};

// Status → colour + label
const STATUS_META = {
  pending:  { color: T.amber,   label: "PENDING"  },
  verified: { color: T.green,   label: "VERIFIED" },
  rejected: { color: T.crimson, label: "REJECTED" },
};

// ─────────────────────────────────────────────────────────────
// ROOT — Profile Page
// ─────────────────────────────────────────────────────────────
export default function Profile() {
  const { user, logout } = useAuth();
  const navigate          = useNavigate();
  const [activeTab, setActiveTab] = useState("settings"); // "settings" | "reports"

  // Redirect if somehow unauthenticated (belt + suspenders)
  useEffect(() => {
    if (!user) navigate("/login", { replace: true });
  }, [user, navigate]);

  return (
    <div style={{
      minHeight: "100vh",
      background: T.navy,
      display: "flex",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* ── SIDEBAR ── */}
      <Sidebar
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        navigate={navigate}
        logout={logout}
      />

      {/* ── MAIN CONTENT ── */}
      <main style={{
        flex: 1,
        overflowY: "auto",
        padding: "40px 48px",
        minHeight: "100vh",
      }}>
        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{ marginBottom: 36 }}
        >
          <MonoTag label="Operator Console" />
          <h1 style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
            fontSize: 28, color: T.text, letterSpacing: "-0.4px",
            marginTop: 8, marginBottom: 6,
          }}>
            {activeTab === "settings" ? "Operator Settings" : "My Field Reports"}
          </h1>
          <p style={{ color: T.muted, fontSize: 14, lineHeight: 1.65 }}>
            {activeTab === "settings"
              ? "Manage your operator profile, alert city, and contact information."
              : "Review and track all incidents you have submitted to the command queue."}
          </p>
        </motion.div>

        {/* ── TAB CONTENT ── */}
        <AnimatePresence mode="wait">
          {activeTab === "settings" ? (
            <SettingsTab key="settings" user={user} />
          ) : (
            <ReportsTab key="reports" />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────────────────────
function Sidebar({ user, activeTab, setActiveTab, navigate, logout }) {
  const NAV = [
    {
      id:    "settings",
      icon:  <SettingsIcon />,
      label: "Operator Settings",
      sub:   "Profile & city config",
    },
    {
      id:    "reports",
      icon:  <ReportsIcon />,
      label: "My Field Reports",
      sub:   "Submitted incidents",
    },
  ];

  return (
    <motion.aside
      initial={{ x: -280, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      style={{
        width: 260,
        flexShrink: 0,
        background: T.panel,
        borderRight: `1px solid ${T.border}`,
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        position: "sticky",
        top: 0,
      }}
    >
      {/* Branding header */}
      <div
        onClick={() => navigate("/")}
        style={{
          padding: "22px 24px 20px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", gap: 10,
          cursor: "pointer",
        }}
      >
        <ShieldLogo size={24} />
        <div>
          <div style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
            fontSize: 13, letterSpacing: 3, color: T.text,
          }}>
            SENTINEL
          </div>
          <div style={{
            fontFamily: "'Space Mono', monospace", fontSize: 7,
            letterSpacing: 2, color: T.teal, marginTop: 1,
          }}>
            OPERATOR CONSOLE
          </div>
        </div>
      </div>

      {/* Operator identity card */}
      <div style={{
        margin: "16px 16px 8px",
        background: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        padding: "14px 16px",
      }}>
        {/* Avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: `linear-gradient(135deg, rgba(69,123,157,0.35), rgba(69,123,157,0.10))`,
            border: `1.5px solid ${T.teal}55`,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <span style={{
              fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
              fontSize: 16, color: T.teal,
            }}>
              {user?.name?.[0]?.toUpperCase() ?? "O"}
            </span>
          </div>
          <div style={{ overflow: "hidden" }}>
            <div style={{
              fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
              fontSize: 13, color: T.text,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {user?.name ?? "Operator"}
            </div>
            <div style={{
              fontFamily: "'Space Mono', monospace", fontSize: 8,
              letterSpacing: 1.5, color: T.teal, textTransform: "uppercase",
              marginTop: 2,
            }}>
              {user?.role ?? "public"} operator
            </div>
          </div>
        </div>
        {/* Live status pill */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "rgba(42,157,143,0.08)",
          border: "1px solid rgba(42,157,143,0.18)",
          borderRadius: 99, padding: "4px 10px",
          width: "fit-content",
        }}>
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{
              width: 5, height: 5, borderRadius: "50%",
              background: T.green, boxShadow: `0 0 5px ${T.green}`,
            }}
          />
          <span style={{
            fontFamily: "'Space Mono', monospace", fontSize: 8,
            letterSpacing: 1.5, color: T.green, textTransform: "uppercase",
          }}>
            Session Active
          </span>
        </div>
      </div>

      {/* Nav label */}
      <div style={{ padding: "16px 24px 6px" }}>
        <span style={{
          fontFamily: "'Space Mono', monospace", fontSize: 8,
          letterSpacing: 2.5, color: T.dim, textTransform: "uppercase",
        }}>
          Navigation
        </span>
      </div>

      {/* Nav items */}
      <nav style={{ padding: "0 12px", flex: 1 }}>
        {NAV.map((item) => {
          const active = activeTab === item.id;
          return (
            <motion.button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.98 }}
              style={{
                width: "100%",
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px",
                marginBottom: 4,
                background: active ? T.tealDim : "transparent",
                border: `1px solid ${active ? T.borderH : "transparent"}`,
                borderRadius: 8,
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.18s, border-color 0.18s",
              }}
            >
              <div style={{ color: active ? T.teal : T.dim, flexShrink: 0 }}>
                {item.icon}
              </div>
              <div>
                <div style={{
                  fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                  fontSize: 13, color: active ? T.text : T.muted,
                  transition: "color 0.18s",
                }}>
                  {item.label}
                </div>
                <div style={{
                  fontFamily: "'Space Mono', monospace", fontSize: 8,
                  letterSpacing: 1, color: active ? T.teal : T.dim,
                  marginTop: 2,
                }}>
                  {item.sub}
                </div>
              </div>
              {active && (
                <motion.div
                  layoutId="nav-pill"
                  style={{
                    marginLeft: "auto",
                    width: 4, height: 4, borderRadius: "50%",
                    background: T.teal,
                    boxShadow: `0 0 6px ${T.teal}`,
                    flexShrink: 0,
                  }}
                />
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* Divider */}
      <div style={{ height: 1, background: T.border, margin: "8px 0" }} />

      {/* Bottom actions */}
      <div style={{ padding: "12px 12px 24px" }}>
        <SidebarAction
          icon={<DashboardIcon />}
          label="Command Dashboard"
          onClick={() => navigate("/dashboard")}
        />
        <SidebarAction
          icon={<SignOutIcon />}
          label="Sign Out"
          danger
          onClick={() => { navigate("/"); logout(); }}
        />
      </div>
    </motion.aside>
  );
}

function SidebarAction({ icon, label, onClick, danger = false }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "100%",
        display: "flex", alignItems: "center", gap: 10,
        padding: "9px 14px",
        marginBottom: 3,
        background: hov
          ? danger ? "rgba(230,57,70,0.08)" : T.tealDim
          : "transparent",
        border: "none", borderRadius: 8,
        cursor: "pointer", textAlign: "left",
        transition: "background 0.15s",
      }}
    >
      <span style={{ color: danger ? (hov ? T.crimson : "#c47a7a") : (hov ? T.teal : T.dim) }}>
        {icon}
      </span>
      <span style={{
        fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500,
        color: danger ? (hov ? T.crimson : "#c47a7a") : (hov ? T.text : T.muted),
        transition: "color 0.15s",
      }}>
        {label}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB 1 — OPERATOR SETTINGS
// Fetches GET /me on mount, updates via PATCH /me
// ─────────────────────────────────────────────────────────────
function SettingsTab({ user }) {
  const { login } = useAuth();

  const [form, setForm]         = useState({ name: "", phone: "", target_city: "" });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [toast, setToast]       = useState(null); // { type: "success"|"error", msg }

  // ── Fetch current profile from GET /me ──
  const fetchMe = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await authFetch("/me");
      const data = await res.json();
      if (res.ok) {
        setProfileData(data);
        setForm({
          name:        data.name        ?? "",
          phone:       data.phone       ?? "",
          target_city: data.target_city ?? "",
        });
      } else {
        showToast("error", data.detail ?? "Failed to load profile.");
      }
    } catch {
      showToast("error", "Network error — could not reach server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  function showToast(type, msg) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  // ── PATCH /me ──
  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {};
      if (form.name.trim()        && form.name.trim()        !== profileData?.name)        payload.name        = form.name.trim();
      if (form.phone.trim()       && form.phone.trim()       !== profileData?.phone)       payload.phone       = form.phone.trim();
      if (form.target_city.trim() && form.target_city.trim() !== profileData?.target_city) payload.target_city = form.target_city.trim();

      // Allow blanking phone (send empty string to indicate intent)
      if (form.phone.trim() === "" && profileData?.phone) payload.phone = "";

      if (Object.keys(payload).length === 0) {
        showToast("error", "No changes detected.");
        setSaving(false);
        return;
      }

      const res  = await authFetch("/me", {
        method:  "PATCH",
        body:    JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok) {
        setProfileData(data.user);
        // Update the name in localStorage / AuthContext so Nav reflects it
        if (data.user?.name) {
          localStorage.setItem("sentinel_name", data.user.name);
          login(
            localStorage.getItem("sentinel_token"),
            data.user.name,
            localStorage.getItem("sentinel_role"),
          );
        }
        showToast("success", "Profile updated successfully.");
      } else {
        showToast("error", data.detail ?? "Update failed.");
      }
    } catch {
      showToast("error", "Network error — update could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 320 }}>
        <div style={{ textAlign: "center" }}>
          <div className="s-spinner" style={{ width: 24, height: 24 }} />
          <p style={{
            fontFamily: "'Space Mono', monospace", fontSize: 10,
            letterSpacing: 2, color: T.teal, marginTop: 16, textTransform: "uppercase",
          }}>
            Loading Profile…
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      key="settings-tab"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            style={{
              position: "fixed", top: 22, right: 28, zIndex: 2000,
              display: "flex", alignItems: "center", gap: 10,
              padding: "11px 18px",
              background: T.card,
              border: `1px solid ${toast.type === "success" ? "rgba(42,157,143,0.45)" : "rgba(230,57,70,0.45)"}`,
              borderRadius: 10,
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              maxWidth: 340,
            }}
          >
            <div style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              background: toast.type === "success" ? T.green : T.crimson,
              boxShadow: `0 0 6px ${toast.type === "success" ? T.green : T.crimson}`,
            }} />
            <span style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 13,
              fontWeight: 500, color: T.text,
            }}>
              {toast.msg}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20, maxWidth: 900 }}>

        {/* ── LEFT: Settings form ── */}
        <motion.div variants={stagger} initial="hidden" animate="show">

          {/* Account info section */}
          <motion.div variants={fadeUp} className="s-card" style={{ marginBottom: 16 }}>
            <SectionHeader icon="🪪" title="Identity" sub="Core operator credentials" />
            <div style={{ height: 1, background: T.border, margin: "16px 0 20px" }} />

            <form onSubmit={handleSave}>
              {/* Read-only email */}
              <div style={{ marginBottom: 18 }}>
                <label className="s-label">Email Address</label>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 13px",
                  background: "rgba(69,123,157,0.04)",
                  border: `1px solid ${T.border}`,
                  borderRadius: "var(--radius-md)",
                }}>
                  <span style={{ fontSize: 13, color: T.dim }}>{profileData?.email ?? "—"}</span>
                  <span style={{
                    marginLeft: "auto",
                    fontFamily: "'Space Mono', monospace", fontSize: 8,
                    letterSpacing: 1.5, color: T.dim, textTransform: "uppercase",
                  }}>
                    READ-ONLY
                  </span>
                </div>
              </div>

              {/* Name */}
              <div style={{ marginBottom: 18 }}>
                <label className="s-label">Display Name</label>
                <input
                  className="s-input"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Your full name"
                  required
                />
              </div>

              {/* Phone */}
              <div style={{ marginBottom: 18 }}>
                <label className="s-label">Phone Number</label>
                <input
                  className="s-input"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+91 XXXXX XXXXX"
                />
                <p style={{
                  fontFamily: "'Space Mono', monospace", fontSize: 9,
                  color: T.dim, marginTop: 5, letterSpacing: 0.5,
                }}>
                  Used for Twilio SMS alerts. Leave blank to opt out.
                </p>
              </div>

              {/* Role — read only */}
              <div style={{ marginBottom: 22 }}>
                <label className="s-label">Access Role</label>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "6px 14px",
                  background: T.tealDim,
                  border: `1px solid ${T.borderH}`,
                  borderRadius: 99,
                }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: T.teal, boxShadow: `0 0 5px ${T.teal}`,
                  }} />
                  <span style={{
                    fontFamily: "'Space Mono', monospace", fontSize: 9,
                    letterSpacing: 2, color: T.teal, textTransform: "uppercase",
                  }}>
                    {profileData?.role ?? "public"}
                  </span>
                </div>
              </div>

              <SectionHeader icon="📡" title="Alert Configuration" sub="Controls which city triggers your alerts" />
              <div style={{ height: 1, background: T.border, margin: "16px 0 20px" }} />

              {/* Target city */}
              <div style={{ marginBottom: 24 }}>
                <label className="s-label">Target City</label>
                <select
                  className="s-input"
                  value={form.target_city}
                  onChange={(e) => setForm((f) => ({ ...f, target_city: e.target.value }))}
                >
                  <option value="">— Select a city —</option>
                  {CITIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <p style={{
                  fontFamily: "'Space Mono', monospace", fontSize: 9,
                  color: T.dim, marginTop: 5, letterSpacing: 0.5,
                }}>
                  Sentinel will send SMS + email alerts for incidents verified in this city.
                </p>
              </div>

              {/* Save button */}
              <motion.button
                type="submit"
                className="s-btn s-btn-primary"
                disabled={saving}
                whileHover={{ scale: saving ? 1 : 1.03 }}
                whileTap={{ scale: saving ? 1 : 0.97 }}
                style={{
                  padding: "11px 32px", fontSize: 13,
                  position: "relative", overflow: "hidden",
                }}
              >
                {saving ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="s-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    Saving…
                  </span>
                ) : (
                  "Save Changes →"
                )}
              </motion.button>
            </form>
          </motion.div>
        </motion.div>

        {/* ── RIGHT: Stats sidebar ── */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          {/* Profile completeness card */}
          <motion.div variants={fadeUp} className="s-card">
            <div style={{
              fontFamily: "'Space Mono', monospace", fontSize: 9,
              letterSpacing: 2, color: T.teal, textTransform: "uppercase",
              marginBottom: 12,
            }}>
              Profile Completeness
            </div>

            {[
              { label: "Email",       done: !!profileData?.email       },
              { label: "Name",        done: !!profileData?.name        },
              { label: "Phone",       done: !!profileData?.phone       },
              { label: "Target City", done: !!profileData?.target_city },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.muted }}>
                  {item.label}
                </span>
                <div style={{
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                  <div style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: item.done ? T.green : T.dim,
                    boxShadow: item.done ? `0 0 5px ${T.green}` : "none",
                  }} />
                  <span style={{
                    fontFamily: "'Space Mono', monospace", fontSize: 8,
                    letterSpacing: 1, color: item.done ? T.green : T.dim,
                    textTransform: "uppercase",
                  }}>
                    {item.done ? "Set" : "Missing"}
                  </span>
                </div>
              </div>
            ))}

            {/* Progress bar */}
            {(() => {
              const done = [
                profileData?.email, profileData?.name,
                profileData?.phone, profileData?.target_city,
              ].filter(Boolean).length;
              const pct = (done / 4) * 100;
              return (
                <div style={{ marginTop: 14 }}>
                  <div style={{
                    height: 4, background: T.border,
                    borderRadius: 99, overflow: "hidden",
                  }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      style={{
                        height: "100%",
                        background: pct === 100
                          ? `linear-gradient(90deg, ${T.green}, #33b5a6)`
                          : `linear-gradient(90deg, ${T.teal}, #5591b4)`,
                        borderRadius: 99,
                      }}
                    />
                  </div>
                  <div style={{
                    fontFamily: "'Space Mono', monospace", fontSize: 8,
                    letterSpacing: 1, color: T.dim, marginTop: 5,
                    textTransform: "uppercase",
                  }}>
                    {done}/4 fields complete
                  </div>
                </div>
              );
            })()}
          </motion.div>

          {/* Account metadata card */}
          <motion.div variants={fadeUp} className="s-card">
            <div style={{
              fontFamily: "'Space Mono', monospace", fontSize: 9,
              letterSpacing: 2, color: T.teal, textTransform: "uppercase",
              marginBottom: 14,
            }}>
              Account Metadata
            </div>
            <MetaRow label="User ID" value={profileData?.id ? `${profileData.id.slice(0, 8)}…` : "—"} mono />
            <MetaRow label="Role"    value={profileData?.role ?? "public"} />
            <MetaRow
              label="Alert City"
              value={profileData?.target_city ?? "Not configured"}
              accent={!!profileData?.target_city}
            />
          </motion.div>

          {/* Security card */}
          <motion.div variants={fadeUp} className="s-card">
            <div style={{
              fontFamily: "'Space Mono', monospace", fontSize: 9,
              letterSpacing: 2, color: T.teal, textTransform: "uppercase",
              marginBottom: 14,
            }}>
              Security
            </div>
            {[
              { label: "JWT Auth",  status: "HS256" },
              { label: "Password",  status: "bcrypt" },
              { label: "Session",   status: "24 hr TTL" },
            ].map((s) => (
              <MetaRow key={s.label} label={s.label} value={s.status} mono />
            ))}
          </motion.div>
        </motion.div>

      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB 2 — MY FIELD REPORTS
// Fetches GET /incidents/mine — card grid display
// ─────────────────────────────────────────────────────────────
function ReportsTab() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [filter, setFilter]       = useState("all"); // "all"|"pending"|"verified"|"rejected"

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res  = await authFetch("/incidents/mine");
        const data = await res.json();
        if (res.ok) {
          setIncidents(Array.isArray(data) ? data : []);
        } else {
          setError(data.detail ?? "Failed to load incidents.");
        }
      } catch {
        setError("Network error — could not reach server.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = filter === "all"
    ? incidents
    : incidents.filter((i) => i.status === filter);

  // Summary counts
  const counts = {
    all:      incidents.length,
    pending:  incidents.filter((i) => i.status === "pending").length,
    verified: incidents.filter((i) => i.status === "verified").length,
    rejected: incidents.filter((i) => i.status === "rejected").length,
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 320 }}>
        <div style={{ textAlign: "center" }}>
          <div className="s-spinner" style={{ width: 24, height: 24 }} />
          <p style={{
            fontFamily: "'Space Mono', monospace", fontSize: 10,
            letterSpacing: 2, color: T.teal, marginTop: 16, textTransform: "uppercase",
          }}>
            Loading Reports…
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: 280,
        }}
      >
        <div style={{
          background: T.card,
          border: `1px solid rgba(230,57,70,0.3)`,
          borderRadius: 12, padding: "28px 36px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.crimson, marginBottom: 6 }}>
            {error}
          </div>
          <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: T.dim, letterSpacing: 1 }}>
            Check network or re-authenticate.
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      key="reports-tab"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Summary stat pills */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}
      >
        {[
          { key: "all",      label: "All Reports", color: T.teal    },
          { key: "pending",  label: "Pending",     color: T.amber   },
          { key: "verified", label: "Verified",    color: T.green   },
          { key: "rejected", label: "Rejected",    color: T.crimson },
        ].map((f) => (
          <motion.button
            key={f.key}
            variants={fadeUp}
            onClick={() => setFilter(f.key)}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "7px 14px",
              background: filter === f.key
                ? `${f.color}20`
                : "rgba(22,34,55,0.7)",
              border: `1px solid ${filter === f.key ? f.color + "55" : T.border}`,
              borderRadius: 99,
              cursor: "pointer",
              transition: "all 0.18s",
            }}
          >
            <span style={{
              fontFamily: "'Space Mono', monospace", fontSize: 8,
              letterSpacing: 1.5, color: filter === f.key ? f.color : T.dim,
              textTransform: "uppercase", transition: "color 0.18s",
            }}>
              {f.label}
            </span>
            <span style={{
              fontFamily: "'Space Mono', monospace", fontWeight: 700,
              fontSize: 10, color: filter === f.key ? f.color : T.muted,
              transition: "color 0.18s",
            }}>
              {counts[f.key]}
            </span>
          </motion.button>
        ))}
      </motion.div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            minHeight: 260,
            background: T.card,
            border: `1px solid ${T.border}`,
            borderRadius: 14,
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 14, opacity: 0.35 }}>🗂️</div>
          <div style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
            fontSize: 15, color: T.muted, marginBottom: 6,
          }}>
            No reports found
          </div>
          <p style={{
            fontFamily: "'Space Mono', monospace", fontSize: 9,
            letterSpacing: 1, color: T.dim, textTransform: "uppercase",
          }}>
            {filter === "all"
              ? "Submit your first incident from the dashboard."
              : `No ${filter} incidents match this filter.`}
          </p>
        </motion.div>
      )}

      {/* Incident grid */}
      {filtered.length > 0 && (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 14,
          }}
        >
          {filtered.map((inc) => (
            <IncidentCard key={inc.id} inc={inc} />
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// INCIDENT CARD — single report entry
// ─────────────────────────────────────────────────────────────
function IncidentCard({ inc }) {
  const [hov, setHov] = useState(false);

  const statusMeta  = STATUS_META[inc.status]  ?? STATUS_META.pending;
  const sevColor    = SEV_COLOR[inc.severity]  ?? T.amber;

  // Format ISO timestamp → readable
  const timeLabel = inc.time
    ? new Date(inc.time).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";

  return (
    <motion.div
      variants={fadeUp}
      onHoverStart={() => setHov(true)}
      onHoverEnd={() => setHov(false)}
      style={{
        background: hov ? T.raised : T.card,
        border: `1px solid ${hov ? T.borderH : T.border}`,
        borderRadius: 12,
        overflow: "hidden",
        transition: "background 0.22s, border-color 0.22s",
        position: "relative",
      }}
    >
      {/* Top accent bar — coloured by severity */}
      <div style={{
        height: 3,
        background: `linear-gradient(90deg, ${sevColor}, ${sevColor}55, transparent)`,
        opacity: hov ? 1 : 0.55,
        transition: "opacity 0.22s",
      }} />

      {/* Image area */}
      <div style={{
        height: 120, background: T.raised,
        borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative", overflow: "hidden",
      }}>
        {inc.image_url ? (
          <img
            src={`${API_BASE}${inc.image_url}`}
            alt="Incident"
            style={{
              width: "100%", height: "100%",
              objectFit: "cover",
              filter: hov ? "brightness(0.95)" : "brightness(0.85)",
              transition: "filter 0.3s",
            }}
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div style={{ opacity: 0.2, fontSize: 36 }}>
            {inc.type === "fire" ? "🔥" : inc.type === "earthquake" ? "🌍" : inc.type === "flood" ? "🌊" : "⚠️"}
          </div>
        )}

        {/* Status badge overlay */}
        <div style={{
          position: "absolute", top: 8, right: 8,
          display: "flex", alignItems: "center", gap: 5,
          padding: "3px 9px",
          background: "rgba(11,19,32,0.88)",
          backdropFilter: "blur(8px)",
          border: `1px solid ${statusMeta.color}44`,
          borderRadius: 99,
        }}>
          <div style={{
            width: 5, height: 5, borderRadius: "50%",
            background: statusMeta.color,
            boxShadow: `0 0 5px ${statusMeta.color}`,
          }} />
          <span style={{
            fontFamily: "'Space Mono', monospace", fontSize: 7,
            letterSpacing: 1.5, color: statusMeta.color, textTransform: "uppercase",
          }}>
            {statusMeta.label}
          </span>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "14px 16px 16px" }}>
        {/* Type tag + severity */}
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between", marginBottom: 8,
        }}>
          <span style={{
            fontFamily: "'Space Mono', monospace", fontSize: 8,
            letterSpacing: 2, color: T.teal, textTransform: "uppercase",
          }}>
            {inc.type ?? "Incident"}
          </span>
          <span style={{
            fontFamily: "'Space Mono', monospace", fontSize: 8,
            letterSpacing: 1.5, color: sevColor, textTransform: "uppercase",
          }}>
            {inc.severity ?? "—"}
          </span>
        </div>

        {/* Location */}
        <div style={{
          fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
          fontSize: 14, color: T.text, marginBottom: 4,
        }}>
          📍 {inc.location ?? "Unknown Location"}
        </div>

        {/* Timestamp */}
        <div style={{
          fontFamily: "'Space Mono', monospace", fontSize: 9,
          color: T.dim, letterSpacing: 0.3, marginBottom: 10,
        }}>
          {timeLabel}
        </div>

        {/* Confidence chip — if present */}
        {inc.confidence && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 9px",
            background: "rgba(69,123,157,0.08)",
            border: `1px solid ${T.border}`,
            borderRadius: 99,
          }}>
            <span style={{
              fontFamily: "'Space Mono', monospace", fontSize: 8,
              letterSpacing: 1, color: T.muted, textTransform: "uppercase",
            }}>
              AI Conf: {inc.confidence}
            </span>
          </div>
        )}
      </div>

      {/* Bottom ID strip */}
      <div style={{
        padding: "7px 16px",
        borderTop: `1px solid ${T.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{
          fontFamily: "'Space Mono', monospace", fontSize: 8,
          color: T.dim, letterSpacing: 0.5,
        }}>
          ID: {inc.id?.slice(0, 8) ?? "—"}…
        </span>
        {inc.notes && (
          <span style={{
            fontFamily: "'Space Mono', monospace", fontSize: 8,
            color: T.amber, letterSpacing: 1, textTransform: "uppercase",
          }}>
            ✎ Note
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// SHARED UI HELPERS
// ─────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, sub }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div>
        <div style={{
          fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
          fontSize: 14, color: T.text,
        }}>
          {title}
        </div>
        <div style={{
          fontFamily: "'Space Mono', monospace", fontSize: 8,
          letterSpacing: 1.5, color: T.dim, textTransform: "uppercase", marginTop: 1,
        }}>
          {sub}
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value, mono = false, accent = false }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between",
      alignItems: "center", marginBottom: 10,
    }}>
      <span style={{
        fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.dim,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: mono ? "'Space Mono', monospace" : "'DM Sans', sans-serif",
        fontSize: mono ? 10 : 12,
        fontWeight: mono ? 400 : 600,
        color: accent ? T.teal : T.muted,
        letterSpacing: mono ? 0.5 : 0,
      }}>
        {value}
      </span>
    </div>
  );
}

function MonoTag({ label }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 16, height: 1, background: T.borderH }} />
      <span style={{
        fontFamily: "'Space Mono', monospace", fontSize: 9,
        letterSpacing: 2.5, color: T.teal, textTransform: "uppercase",
      }}>
        {label}
      </span>
      <div style={{ width: 16, height: 1, background: T.borderH }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ICON COMPONENTS (inline SVG — no icon library dependency)
// ─────────────────────────────────────────────────────────────

function ShieldLogo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M16 2L4 7V16C4 21.5 9.5 26.5 16 30C22.5 26.5 28 21.5 28 16V7L16 2Z"
        stroke={T.teal} strokeWidth="1.5" fill="rgba(69,123,157,0.08)"
      />
      <path
        d="M16 6L8 10V16C8 19.8 11.6 23.2 16 25.5C20.4 23.2 24 19.8 24 16V10L16 6Z"
        stroke={T.teal} strokeWidth="0.75" fill="rgba(69,123,157,0.05)" opacity="0.7"
      />
      <circle cx="16" cy="16" r="2.2" fill={T.teal} />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ReportsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
