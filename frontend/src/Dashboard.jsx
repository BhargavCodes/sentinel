// ═══════════════════════════════════════════════════════════════════════════
// Dashboard.jsx  —  Sentinel  |  Enterprise Operational Command Center
// ═══════════════════════════════════════════════════════════════════════════
//
//  Theme: "Enterprise Disaster Command"
//  Palette sourced from App.jsx CSS variables:
//    --bg-void    #0B1320   deep navy
//    --bg-deep    #111C2D   raised panel
//    --bg-card    #162237   card surface
//    --bg-raised  #1A2840   input/chip bg
//    --teal       #457B9D   operational accent (primary)
//    --crimson    #E63946   fire / danger / alert
//    --amber      #F4A261   warning / pending
//    --green      #2A9D8F   safe / verified / success
//    --border     rgba(69,123,157,0.15)
//    --border-hot rgba(69,123,157,0.40)
//    --text-primary  #F0F4F8
//    --text-muted    #8AABB8
//    --text-dim      #4A6A7A
//
//  Typography rule:
//    var(--font-body) / DM Sans  — all prose, labels, buttons
//    var(--font-mono) / Space Mono — data points, API values, status codes
//
//  Layout:
//  ┌─────────────────────────────────────────────────────────────────┐
//  │  TopNav (fixed 52px)                                            │
//  ├──────────────┬──────────────────────────────────────────────────┤
//  │ Sidebar 380px│  Map (flex:1, position:relative)                 │
//  │              │  ┌ AQI HUD          top-left                     │
//  │ • Search     │  ┌ Weather HUD+PDF  top-right                    │
//  │ • Fire AI    │  ┌ Seismic HUD      bottom-left                  │
//  │   (all roles)│  ┌ LayerDock        bottom-center                │
//  │ • Video AI   │                                                   │
//  │   (admin)    │  Leaflet MapContainer                             │
//  │ • Report     │    click → geocode (passive)                      │
//  │   (public)   │    click → pin incident (active)                 │
//  │ • History    │                                                   │
//  │ ─────────────│                                                   │
//  │ Admin Queue  │                                                   │
//  └──────────────┴──────────────────────────────────────────────────┘
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef } from "react";
import {
  MapContainer, TileLayer, Marker, Popup,
  Circle, useMap, useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
import { useNavigate } from "react-router-dom";
import { useAuth, authFetch } from "./App";
import {
  LineChart, Line, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const OWM_KEY =
  (typeof import.meta !== "undefined" && import.meta?.env?.VITE_OWM_KEY) ||
  "0810f8af801a68b40b2a1aa5b5736f6e";

const SAFE_ZONES = [
  { name: "AIIMS New Delhi",           lat: 28.5672, lon: 77.2100, type: "Hospital"  },
  { name: "Lilavati Hospital, Mumbai", lat: 19.0502, lon: 72.8236, type: "Hospital"  },
  { name: "Victoria Memorial Shelter", lat: 22.5448, lon: 88.3426, type: "Shelter"   },
  { name: "Rajiv Gandhi NDRF Camp",    lat: 28.6448, lon: 77.2167, type: "NDRF Base" },
  { name: "Civil Defence HQ, Pune",    lat: 18.5204, lon: 73.8567, type: "Shelter"   },
];

const CITIES = [
  "New Delhi","Mumbai","Bangalore","Hyderabad","Chennai","Kolkata","Pune",
  "Jaipur","Lucknow","Kanpur","Nagpur","Indore","Thane","Bhopal","Visakhapatnam",
  "Patna","Vadodara","Ghaziabad","Agra","Nashik","Varanasi","Srinagar",
  "Aurangabad","Amritsar","Ranchi","Guwahati","Chandigarh","Mysore","Dehradun",
];

// Enterprise incident type colours — aligned to palette
const TYPE_COLOR = {
  fire:       "var(--crimson)",  // #E63946
  earthquake: "var(--amber)",   // #F4A261
  flood:      "var(--teal)",    // #457B9D
  cyclone:    "#7B68B5",        // purple — no token, keep literal
  other:      "var(--text-dim)",// #4A6A7A
};

// Resolved literals for contexts that can't use CSS variables (Recharts, etc.)
const C = {
  crimson: "#E63946",
  amber:   "#F4A261",
  teal:    "#457B9D",
  green:   "#2A9D8F",
  purple:  "#7B68B5",
  dim:     "#4A6A7A",
  text:    "#F0F4F8",
  muted:   "#8AABB8",
  card:    "#162237",
  deep:    "#111C2D",
  void:    "#0B1320",
  border:  "rgba(69,123,157,0.15)",
  borderH: "rgba(69,123,157,0.40)",
};

// ═══════════════════════════════════════════════════════════════════
// LEAFLET ICON FACTORY
// CSS classes defined in App.jsx GlobalStyles — enterprise palette:
//   pulse-red    → Crimson  #E63946  (fire / critical)
//   pulse-orange → Amber    #F4A261  (moderate incidents)
//   pulse-blue   → Teal     #457B9D  (monitored city)
//   pulse-green  → Green    #2A9D8F  (safe zones / shelters)
// ═══════════════════════════════════════════════════════════════════

function makePulseIcon(colorClass) {
  return L.divIcon({
    className: "",
    html: `<div class="pulse-marker ${colorClass}"></div>`,
    iconSize:    [16, 16],
    iconAnchor:  [8, 8],
    popupAnchor: [0, -12],
  });
}

function makePngIcon(color) {
  return L.icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color}.png`,
    shadowUrl: iconShadow,
    iconSize:    [25, 41],
    iconAnchor:  [12, 41],
    popupAnchor: [1, -34],
  });
}

// Module-scope — never recreated on render
const PulseBlueIcon   = makePulseIcon("pulse-blue");
const PulseGreenIcon  = makePulseIcon("pulse-green");
const PulseRedIcon    = makePulseIcon("pulse-red");
const PulseOrangeIcon = makePulseIcon("pulse-orange");
const RedPinIcon      = makePngIcon("red");

// ═══════════════════════════════════════════════════════════════════
// SHARED GLASSMORPHISM — enterprise slate, NOT neon-tinted
// ═══════════════════════════════════════════════════════════════════

const GLASS = {
  background:           "rgba(11, 19, 32, 0.85)",  // --bg-void @ 85%
  backdropFilter:       "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  border:               `1px solid ${C.borderH}`,  // rgba(69,123,157,0.40)
  borderRadius:         "var(--radius-lg)",         // 12px
  boxShadow:            "0 8px 40px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.03)",
  pointerEvents:        "auto",
};

// ═══════════════════════════════════════════════════════════════════
// MAP UTILITY HOOKS
// ═══════════════════════════════════════════════════════════════════

function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 10, { duration: 1.4 });
  }, [center, map]);
  return null;
}

/**
 * MapClickCapture
 *   active=true  → incident-pinning mode  → calls onCapture(lat, lng)
 *   active=false → reverse-geocode mode   → calls onGeocode("lat,lng")
 */
function MapClickCapture({ active, onCapture, onGeocode }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      if (active) {
        onCapture(lat, lng);
      } else {
        onGeocode(`${lat.toFixed(5)},${lng.toFixed(5)}`);
      }
    },
  });
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// TOP NAV
// ═══════════════════════════════════════════════════════════════════

function TopNav({ user, onLogout, onAnalytics, onLogoClick }) {
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0,
      zIndex: 9999, height: 52,
      background: "rgba(11,19,32,0.97)",
      backdropFilter: "blur(22px)",
      WebkitBackdropFilter: "blur(22px)",
      borderBottom: `1px solid ${C.border}`,
      display: "flex", alignItems: "center",
      padding: "0 20px", gap: 14,
    }}>
      {/* Logo — enterprise shield, navigates home */}
      <div
        onClick={onLogoClick}
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
        title="Return to Home"
      >
        <ShieldLogo size={22} />
        <div>
          <div style={{
            fontFamily: "var(--font-display)", fontWeight: 700,
            fontSize: 14, letterSpacing: 3, color: C.text,
          }}>
            SENTINEL
          </div>
        </div>
      </div>

      {/* Live status dot */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span className="status-dot live" />
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 9,
          color: C.green, letterSpacing: 2, textTransform: "uppercase",
        }}>Live</span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Role pill */}
      <div style={{
        padding: "4px 12px", borderRadius: 99,
        background: user?.role === "admin"
          ? "rgba(244,162,97,0.10)" : "rgba(69,123,157,0.10)",
        border: `1px solid ${user?.role === "admin"
          ? "rgba(244,162,97,0.28)" : C.borderH}`,
        fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5,
        color: user?.role === "admin" ? C.amber : C.teal,
        textTransform: "uppercase",
      }}>
        {user?.role} — {user?.name}
      </div>

      <button
        className="s-btn s-btn-ghost"
        style={{ fontSize: 12, padding: "6px 14px" }}
        onClick={onAnalytics}
      >
        📊 Analytics
      </button>

      <button
        className="s-btn"
        style={{
          fontSize: 12, padding: "6px 14px",
          background: "var(--crimson-dim)",
          color: C.crimson,
          border: `1px solid rgba(230,57,70,0.28)`,
          borderRadius: "var(--radius-md)",
        }}
        onClick={onLogout}
      >
        Logout
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ROOT DASHBOARD COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // ── Search ──
  const [inputValue, setInputValue]           = useState("Loading…");
  const [suggestions, setSuggestions]         = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggRef = useRef(null);

  // ── Environmental data ──
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);

  // ── Map controls ──
  const [activeLayer, setActiveLayer]     = useState(null);
  const [showSafeZones, setShowSafeZones] = useState(true);

  // ── Fire image detection — available to ALL roles ──
  const [fireResult, setFireResult]   = useState(null);
  const [loadingFire, setLoadingFire] = useState(false);

  // ── Drone video — admin only renders the panel ──
  const [videoResult, setVideoResult]   = useState(null);
  const [loadingVideo, setLoadingVideo] = useState(false);

  // ── Approval queue (admin) ──
  const [pendingIncidents, setPendingIncidents] = useState([]);
  const [activeTab, setActiveTab]               = useState("monitor");

  // ── Report incident (public) ──
  const [showReportModal, setShowReportModal] = useState(false);
  const [capturingLatLon, setCapturingLatLon] = useState(false);
  const [capturedLatLon, setCapturedLatLon]   = useState(null);

  // ── Incident history ──
  const [history, setHistory] = useState([]);

  // ── Initial load ──────────────────────────────────────────────
  useEffect(() => {
    const initializeDashboard = async () => {
      let startingCity = "Pune"; // ultimate fallback
      try {
        const res = await authFetch("/me");
        if (res.ok) {
          const profile = await res.json();
          if (profile.target_city) startingCity = profile.target_city;
        }
      } catch { /* non-critical */ }
      handleSearch(startingCity);
      fetchHistory();
      if (user?.role === "admin") fetchPendingIncidents();
    };
    if (user) initializeDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Close suggestion dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (suggRef.current && !suggRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── API helpers ────────────────────────────────────────────────

  const fetchHistory = async () => {
    try {
      const res = await authFetch("/history");
      const d   = await res.json();
      setHistory(Array.isArray(d) ? d : []);
    } catch { /* silent */ }
  };

  const fetchPendingIncidents = async () => {
    try {
      const res = await authFetch("/admin/incidents?status_filter=pending");
      const d   = await res.json();
      setPendingIncidents(Array.isArray(d) ? d : []);
    } catch {}
  };

  const handleSearch = async (query, isFallback = false) => {
    if (!query) return;
    setLoading(true);
    try {
      const res = await authFetch(`/weather/${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error("Location not found");
      const result = await res.json();
      setData(result);
      setInputValue(result.weather.location.name);
    } catch {
      if (!isFallback && query.toLowerCase() !== "pune") {
        handleSearch("Pune", true);
      } else {
        alert("Failed to load location data.");
      }
    } finally {
      setLoading(false);
      setShowSuggestions(false);
    }
  };

  // Fire image upload — ALL roles
  const handleFireUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    setLoadingFire(true);
    setFireResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("location", data?.weather?.location?.name || "Unknown Sector");
    try {
      const res    = await authFetch("/predict-fire", { method: "POST", body: fd });
      const result = await res.json();
      setFireResult(result);
      if (result.result?.includes("FIRE")) fetchHistory();
    } catch (err) { console.error("Fire upload failed:", err); }
    setLoadingFire(false);
  };

  // Drone video — admin only
  const handleVideoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    if (!file.name.toLowerCase().endsWith(".mp4")) {
      alert("Only .mp4 files are supported."); return;
    }
    setLoadingVideo(true);
    setVideoResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("location", data?.weather?.location?.name || "Drone Zone Alpha");
    try {
      const res    = await authFetch("/analyze-drone", { method: "POST", body: fd });
      const result = await res.json();
      setVideoResult(result);
      if (result.fire_detected) fetchHistory();
    } catch (err) { console.error("Video upload failed:", err); }
    setLoadingVideo(false);
  };

  const handleVerify = async (id, newStatus) => {
    try {
      const res = await authFetch(`/admin/incidents/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus, notes: `Reviewed by ${user.name}` }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail);
      fetchPendingIncidents();
      fetchHistory();
      const label = newStatus === "verified" ? "Verified ✅" : "Rejected ❌";
      alert(`${label}\n${d.alerts?.emails_sent ?? 0} email(s), ${d.alerts?.sms_sent ?? 0} SMS dispatched.`);
    } catch (err) { alert(err.message); }
  };

  // PDF Situation Report — POST /download-report
  const handleDownloadReport = async () => {
    if (!data) { alert("Search a city first to generate a report."); return; }
    try {
      const res = await authFetch("/download-report", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Report generation failed.");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `Sentinel_Report_${(data.weather.location.name || "Unknown").replace(/\s/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert(err.message); }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);
    setSuggestions(
      val.length > 0
        ? CITIES.filter((c) => c.toLowerCase().startsWith(val.toLowerCase()))
        : []
    );
    setShowSuggestions(val.length > 0);
  };

  // ── Derived values ─────────────────────────────────────────────
  const mapCenter = data
    ? [data.weather.location.lat, data.weather.location.lon]
    : [20.5937, 78.9629];

  const seismic = data?.seismic_risk ?? null;
  const aqi     = data?.aqi_calculated ?? 0;

  // AQI colour — enterprise palette, no neon
  const aqiColor =
    aqi <= 50  ? C.green  :
    aqi <= 100 ? "#A3BE8C" :  // muted sage
    aqi <= 150 ? C.amber  :
    aqi <= 200 ? C.crimson:
                 "#8B4A6B";   // deep purple-rose for hazardous

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100vh",
      background: "var(--bg-void)",
      paddingTop: 52,
    }}>
      <TopNav
        user={user}
        onLogout={() => { logout(); navigate("/"); }}
        onAnalytics={() => navigate("/analytics")}
        onLogoClick={() => navigate("/")}
      />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ════════════════════════════════════════
            LEFT SIDEBAR — 380px, always visible
            ════════════════════════════════════════ */}
        <aside style={{
          width: 380, flexShrink: 0,
          background: "rgba(11,19,32,0.96)",
          borderRight: `1px solid ${C.border}`,
          display: "flex", flexDirection: "column",
          overflowY: "auto", overflowX: "hidden",
        }}>

          {/* Admin tab bar */}
          {user?.role === "admin" && (
            <div style={{
              display: "flex",
              borderBottom: `1px solid ${C.border}`,
              flexShrink: 0,
            }}>
              {[
                { id: "monitor", label: "Monitor" },
                { id: "queue",   label: `Queue (${pendingIncidents.length})` },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    flex: 1, padding: "13px 0",
                    background: "transparent", border: "none",
                    borderBottom: activeTab === t.id
                      ? `2px solid ${C.teal}` : "2px solid transparent",
                    color: activeTab === t.id ? C.teal : C.dim,
                    fontFamily: "var(--font-mono)",
                    fontSize: 10, letterSpacing: 2,
                    cursor: "pointer", transition: "all 0.2s",
                    textTransform: "uppercase",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {/* ─ Monitor tab ─ */}
          {activeTab === "monitor" && (
            <div style={{
              display: "flex", flexDirection: "column",
              padding: "14px 14px 20px", gap: 12,
            }}>

              {/* ── SEARCH BAR ── */}
              <div style={{ position: "relative" }} ref={suggRef}>
                <div style={{ position: "relative" }}>
                  <span style={{
                    position: "absolute", left: 13, top: "50%",
                    transform: "translateY(-50%)",
                    color: C.dim, fontSize: 14, pointerEvents: "none",
                  }}>
                    🔍
                  </span>
                  <input
                    className="s-input"
                    style={{ paddingLeft: 38 }}
                    placeholder="Search city or click map…"
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setShowSuggestions(false);
                        handleSearch(inputValue);
                      }
                    }}
                  />
                </div>

                {/* Suggestions dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <ul style={{
                    position: "absolute", top: "calc(100% + 4px)",
                    left: 0, right: 0,
                    background: C.card,
                    borderRadius: "var(--radius-md)",
                    border: `1px solid ${C.borderH}`,
                    listStyle: "none", zIndex: 600,
                    maxHeight: 200, overflowY: "auto",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
                  }}>
                    {suggestions.map((s, i) => (
                      <li
                        key={i}
                        onClick={() => {
                          setInputValue(s);
                          setShowSuggestions(false);
                          handleSearch(s);
                        }}
                        style={{
                          padding: "9px 14px", cursor: "pointer",
                          borderBottom: `1px solid ${C.border}`,
                          fontSize: 13, color: C.text,
                          fontFamily: "var(--font-body)",
                          transition: "background 0.12s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(69,123,157,0.10)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Loading feedback */}
              {loading && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                  <div className="s-spinner" style={{ width: 18, height: 18, flexShrink: 0 }} />
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 9,
                    color: C.dim, letterSpacing: 2, textTransform: "uppercase",
                  }}>
                    Scanning sector…
                  </span>
                </div>
              )}

              {/* Active sector indicator */}
              {data && !loading && (
                <div style={{
                  padding: "7px 12px", borderRadius: "var(--radius-sm)",
                  background: "rgba(69,123,157,0.08)",
                  border: `1px solid ${C.border}`,
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span className="status-dot live" />
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 9,
                    color: C.teal, letterSpacing: 1.5, textTransform: "uppercase",
                  }}>
                    Monitoring: {data.weather.location.name}
                  </span>
                </div>
              )}

              {/* ══ AERIAL FIRE INTELLIGENCE — ALL ROLES ══ */}
              <SectionDivider label="Aerial Fire Intelligence" />

              <FireUploadPanel
                fireResult={fireResult}
                loadingFire={loadingFire}
                handleFireUpload={handleFireUpload}
              />

              {/* ══ DRONE VIDEO — ADMIN ONLY ══ */}
              {user?.role === "admin" && (
                <>
                  <SectionDivider label="Drone Video Analysis" />
                  <VideoUploadPanel
                    videoResult={videoResult}
                    loadingVideo={loadingVideo}
                    handleVideoUpload={handleVideoUpload}
                  />
                </>
              )}

              {/* ══ REPORT INCIDENT — PUBLIC ONLY ══ */}
              {user?.role !== "admin" && (
                <>
                  <SectionDivider label="Crowdsource Report" />
                  <PublicReportPanel
                    onOpenReportModal={() => {
                      setCapturingLatLon(true);
                      setShowReportModal(false);
                    }}
                  />
                </>
              )}

              {/* ══ INCIDENT HISTORY ══ */}
              <SectionDivider label="Recent Verified Incidents" />

              <IncidentHistory history={history} />

              {history.length === 0 && (
                <div style={{
                  textAlign: "center", padding: "16px 0",
                  fontFamily: "var(--font-mono)", fontSize: 9,
                  letterSpacing: 1.5, color: C.dim,
                  textTransform: "uppercase",
                }}>
                  No verified incidents yet
                </div>
              )}
            </div>
          )}

          {/* ─ Admin Approval Queue ─ */}
          {activeTab === "queue" && (
            <ApprovalQueue
              incidents={pendingIncidents}
              onRefresh={fetchPendingIncidents}
              onVerify={handleVerify}
            />
          )}
        </aside>

        {/* ════════════════════════════════════════
            MAP AREA — flex:1, position:relative
            HUDs are absolutely positioned children.
            ════════════════════════════════════════ */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>

          {/* Incident-pinning banner */}
          {capturingLatLon && (
            <div style={{
              position: "absolute", top: 14, left: "50%",
              transform: "translateX(-50%)",
              zIndex: 1500,
              background: "rgba(244,162,97,0.12)",
              border: `1px solid ${C.amber}`,
              borderRadius: 99, padding: "8px 22px",
              fontFamily: "var(--font-mono)",
              fontSize: 10, color: C.amber, letterSpacing: 1.5,
              pointerEvents: "none",
              boxShadow: `0 4px 20px rgba(244,162,97,0.18)`,
              textTransform: "uppercase",
            }}>
              📍 Click map to pin incident location
            </div>
          )}

          {/* ══ AQI HUD — top-left ══ */}
          {data && (
            <div style={{
              ...GLASS,
              position: "absolute", top: 16, left: 16,
              zIndex: 1100, width: 200,
              padding: "12px 14px",
              borderLeft: `3px solid ${aqiColor}`,
            }}>
              <MonoLabel text="Air Quality Index" />
              <div style={{
                display: "flex", alignItems: "center",
                gap: 10, marginTop: 6, marginBottom: 8,
              }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontWeight: 700,
                  fontSize: 30, lineHeight: 1, color: aqiColor,
                }}>
                  {aqi > 0 ? aqi : "—"}
                </span>
                <div>
                  <div style={{
                    fontFamily: "var(--font-body)", fontWeight: 600,
                    color: aqiColor, fontSize: 12,
                  }}>
                    {aqiLabel(aqi)}
                  </div>
                  <div
                    style={{ fontSize: 10, color: C.dim, marginTop: 1, maxWidth: 110 }}
                    title={data.aqi_source}
                  >
                    {(data.aqi_source || "").length > 22
                      ? data.aqi_source.slice(0, 22) + "…"
                      : data.aqi_source}
                  </div>
                </div>
              </div>
              {/* Progress bar */}
              <div style={{
                height: 4, borderRadius: 99,
                background: "rgba(255,255,255,0.06)", overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min((aqi / 500) * 100, 100)}%`,
                  background: `linear-gradient(90deg, ${C.teal}, ${aqiColor})`,
                  borderRadius: 99, transition: "width 0.8s ease",
                }} />
              </div>
            </div>
          )}

          {/* ══ WEATHER HUD + PDF — top-right ══ */}
          {data && (
            <WeatherHUD data={data} onDownloadReport={handleDownloadReport} />
          )}

          {/* ══ SEISMIC HUD — bottom-left ══ */}
          {data && (
            <SeismicHUD seismic={seismic} />
          )}

          {/* ══ LEAFLET MAP ══ */}
          <MapContainer
            center={mapCenter}
            zoom={5}
            style={{ height: "100%", width: "100%" }}
            zoomControl={false}
          >
            {/* Dark CartoDB base tile */}
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            />

            {/* Weather overlay layers */}
            {activeLayer === "clouds" && (
              <TileLayer url={`https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`} />
            )}
            {activeLayer === "rain" && (
              <TileLayer url={`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`} />
            )}
            {activeLayer === "temp" && (
              <TileLayer url={`https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`} />
            )}
            {activeLayer === "wind" && (
              <TileLayer url={`https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`} />
            )}

            {/*
              MapClickCapture:
                active=true  → pin mode for incident report
                active=false → reverse-geocode any click via handleSearch
            */}
            <MapClickCapture
              active={capturingLatLon}
              onCapture={(lat, lng) => {
                setCapturedLatLon({ lat, lon: lng });
                setCapturingLatLon(false);
                setShowReportModal(true);
              }}
              onGeocode={(query) => handleSearch(query)}
            />

            {/* Monitored city — pulse teal */}
            {data && (
              <>
                <Marker
                  position={[data.weather.location.lat, data.weather.location.lon]}
                  icon={PulseBlueIcon}
                >
                  <Popup>
                    <strong style={{ color: C.teal }}>
                      📍 {data.weather.location.name}
                    </strong>
                    <br />
                    <span style={{ color: C.muted, fontSize: 11 }}>
                      Monitored Sector
                    </span>
                  </Popup>
                </Marker>
                <MapUpdater
                  center={[data.weather.location.lat, data.weather.location.lon]}
                />
              </>
            )}

            {/* Seismic epicentre — crimson pin + danger circle */}
            {seismic && (
              <>
                <Circle
                  center={seismic.coords}
                  radius={150000}
                  pathOptions={{
                    color: C.crimson, fillColor: C.crimson,
                    fillOpacity: 0.07, dashArray: "8 4", weight: 1.5,
                  }}
                />
                <Marker position={seismic.coords} icon={RedPinIcon}>
                  <Popup>
                    <strong style={{ color: C.crimson }}>⚠ Seismic Alert</strong>
                    <br />
                    {seismic.user_message}
                    <br />
                    <small style={{ color: C.muted }}>{seismic.location}</small>
                  </Popup>
                </Marker>
              </>
            )}

            {/* Safe zones — pulse green, toggleable */}
            {showSafeZones && SAFE_ZONES.map((sz, i) => (
              <Marker key={`sz-${i}`} position={[sz.lat, sz.lon]} icon={PulseGreenIcon}>
                <Popup>
                  <strong style={{ color: C.green }}>🛡 {sz.type}</strong>
                  <br />
                  {sz.name}
                </Popup>
              </Marker>
            ))}

            {/* Verified incidents — pulse crimson (critical/fire) or amber */}
            {history.map((inc, i) => {
              if (!inc.lat || !inc.lon) return null;
              const critical = inc.severity === "critical" || inc.type === "fire";
              const icon     = critical ? PulseRedIcon : PulseOrangeIcon;
              const color    = critical ? C.crimson : C.amber;
              return (
                <Marker key={`inc-${i}`} position={[inc.lat, inc.lon]} icon={icon}>
                  <Popup>
                    <strong style={{ color }}>
                      {inc.type?.toUpperCase() ?? "INCIDENT"}
                    </strong>
                    <br />
                    {inc.location}
                    <br />
                    <small style={{ color: C.muted }}>
                      {inc.severity?.toUpperCase()} ·{" "}
                      {inc.time ? new Date(inc.time).toLocaleDateString("en-IN") : ""}
                    </small>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>

          {/* Layer + shelter dock */}
          <LayerDock
            activeLayer={activeLayer}
            setActiveLayer={setActiveLayer}
            showSafeZones={showSafeZones}
            setShowSafeZones={setShowSafeZones}
          />
        </div>
      </div>

      {/* Report Incident modal */}
      {showReportModal && (
        <ReportIncidentModal
          capturedLatLon={capturedLatLon}
          onClose={() => { setShowReportModal(false); setCapturedLatLon(null); }}
          onSuccess={() => {
            setShowReportModal(false);
            setCapturedLatLon(null);
            fetchHistory();
          }}
          currentCity={data?.weather?.location?.name || ""}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FLOATING HUDs
// ═══════════════════════════════════════════════════════════════════

// ── Weather HUD (top-right) ──────────────────────────────────────
function WeatherHUD({ data, onDownloadReport }) {
  const current  = data.weather.current;
  const loc      = data.weather.location;
  const condIcon = `https:${current.condition.icon}`;
  const forecast = data.weather.forecast?.forecastday?.[0]?.hour || [];
  const hours    = forecast.filter((_, i) => i % 4 === 0).slice(0, 4);

  return (
    <div style={{
      ...GLASS,
      position: "absolute", top: 16, right: 16,
      zIndex: 1100, width: 264,
      padding: "14px 16px",
    }}>
      <MonoLabel text="Meteorology" />

      {/* Main weather row */}
      <div style={{
        display: "flex", alignItems: "center",
        gap: 12, marginTop: 8, marginBottom: 10,
      }}>
        <img src={condIcon} alt="" style={{ width: 48, height: 48 }} />
        <div>
          <div style={{
            fontFamily: "var(--font-mono)", fontWeight: 700,
            fontSize: 34, lineHeight: 1, color: C.text,
          }}>
            {Math.round(current.temp_c)}°
          </div>
          <div style={{
            fontFamily: "var(--font-body)", fontSize: 12,
            color: C.muted, marginTop: 2,
          }}>
            {current.condition.text}
          </div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9,
            color: C.teal, letterSpacing: 1, marginTop: 1,
          }}>
            {loc.name}, {loc.country}
          </div>
        </div>
      </div>

      {/* Stat grid — values in Space Mono, labels in DM Sans */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
        gap: 6, marginBottom: 10,
      }}>
        {[
          { k: "Humidity",   v: `${current.humidity}%` },
          { k: "Wind",       v: `${current.wind_kph}k` },
          { k: "Feels Like", v: `${Math.round(current.feelslike_c)}°` },
        ].map(({ k, v }) => (
          <div key={k} style={{
            background: "rgba(255,255,255,0.04)",
            borderRadius: "var(--radius-sm)",
            padding: "6px 4px", textAlign: "center",
          }}>
            <div style={{
              fontFamily: "var(--font-mono)", fontWeight: 700,
              fontSize: 11, color: C.text,
            }}>{v}</div>
            <div style={{
              fontFamily: "var(--font-body)", fontSize: 9,
              color: C.dim, marginTop: 2,
            }}>{k}</div>
          </div>
        ))}
      </div>

      {/* Hourly forecast strip */}
      {hours.length > 0 && (
        <div style={{
          display: "flex", justifyContent: "space-between",
          borderTop: `1px solid ${C.border}`,
          paddingTop: 8, marginBottom: 10,
        }}>
          {hours.map((h, i) => {
            const hr   = new Date(h.time).getHours();
            const ampm = hr < 12 ? "AM" : "PM";
            return (
              <div key={i} style={{ textAlign: "center", flex: 1 }}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 8, color: C.dim,
                }}>
                  {hr % 12 || 12}{ampm}
                </div>
                <img
                  src={`https:${h.condition.icon}`} alt=""
                  style={{ width: 22, height: 22 }}
                />
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  color: C.text, fontWeight: 700,
                }}>
                  {Math.round(h.temp_c)}°
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PDF Situation Report download — always present in Weather HUD */}
      <button
        className="s-btn s-btn-ghost"
        onClick={onDownloadReport}
        style={{ width: "100%", padding: "8px 0", fontSize: 12 }}
      >
        ⬇ Generate Situation Report
      </button>
    </div>
  );
}

// ── Seismic HUD (bottom-left) ────────────────────────────────────
function SeismicHUD({ seismic }) {
  const hasRisk = !!seismic;

  return (
    <div style={{
      ...GLASS,
      position: "absolute",
      bottom: 80, left: 16,   // clears the layer dock
      zIndex: 1100, width: 248,
      padding: "12px 14px",
      borderLeft: `3px solid ${hasRisk ? C.crimson : C.green}`,
    }}>
      <MonoLabel text="Seismic Proximity" />

      {hasRisk ? (
        <div style={{ marginTop: 8 }}>
          {/* Alert header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
          }}>
            <div style={{
              width: 28, height: 28,
              borderRadius: "var(--radius-sm)",
              background: "var(--crimson-dim)",
              display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 14, flexShrink: 0,
            }}>
              ⚠
            </div>
            <div>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 9,
                color: C.crimson, letterSpacing: 1, textTransform: "uppercase",
              }}>
                Elevated Risk
              </div>
              <div style={{
                fontFamily: "var(--font-body)", fontSize: 10, color: C.dim,
              }}>
                {new Date(seismic.time).toLocaleString("en-IN")}
              </div>
            </div>
          </div>

          {/* User-centric message */}
          <div style={{
            background: "rgba(230,57,70,0.08)",
            border: "1px solid rgba(230,57,70,0.22)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 10px",
            fontFamily: "var(--font-body)",
            fontSize: 12, color: C.crimson, lineHeight: 1.5,
            marginBottom: 8,
          }}>
            {seismic.user_message}
          </div>

          {/* Magnitude / distance stats */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6,
          }}>
            {[
              { k: "Magnitude", v: `M ${seismic.magnitude}` },
              { k: "Distance",  v: `${seismic.distance_km} km` },
            ].map(({ k, v }) => (
              <div key={k} style={{
                background: "rgba(230,57,70,0.06)",
                borderRadius: "var(--radius-sm)",
                padding: "7px 8px", textAlign: "center",
              }}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontWeight: 700,
                  color: C.crimson, fontSize: 13,
                }}>{v}</div>
                <div style={{
                  fontFamily: "var(--font-body)", fontSize: 9,
                  color: C.dim, marginTop: 2,
                }}>{k}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginTop: 8,
        }}>
          <span style={{ fontSize: 18 }}>🛡</span>
          <div>
            <div style={{
              fontFamily: "var(--font-body)", fontWeight: 600,
              color: C.green, fontSize: 12,
            }}>
              Sector Safe
            </div>
            <div style={{
              fontFamily: "var(--font-body)", fontSize: 11, color: C.dim,
            }}>
              No quake within 150 km · M &gt; 4.5
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SIDEBAR PANELS
// ═══════════════════════════════════════════════════════════════════

// ── Fire Image Upload — ALL roles ────────────────────────────────
function FireUploadPanel({ fireResult, loadingFire, handleFireUpload }) {
  return (
    <div>
      <label
        style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "16px 0",
          border: `1.5px dashed rgba(230,57,70,0.28)`,
          borderRadius: "var(--radius-lg)", cursor: "pointer",
          background: "rgba(230,57,70,0.03)",
          transition: "background 0.2s, border-color 0.2s",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background   = "rgba(230,57,70,0.07)";
          e.currentTarget.style.borderColor  = "rgba(230,57,70,0.55)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background   = "rgba(230,57,70,0.03)";
          e.currentTarget.style.borderColor  = "rgba(230,57,70,0.28)";
        }}
      >
        <input
          type="file" accept="image/*"
          onChange={handleFireUpload}
          style={{ display: "none" }}
          disabled={loadingFire}
        />
        <span style={{ fontSize: 26, marginBottom: 5 }}>🛰️</span>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 10,
          letterSpacing: 1.5, color: C.muted, textTransform: "uppercase",
        }}>
          {loadingFire ? "Analysing image…" : "Upload Aerial Image"}
        </span>
        <span style={{
          fontFamily: "var(--font-body)", fontSize: 11,
          color: C.dim, marginTop: 3,
        }}>
          JPG / PNG · MobileNetV2 model
        </span>
      </label>

      {loadingFire && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 0",
        }}>
          <div className="s-spinner" style={{ width: 18, height: 18, flexShrink: 0 }} />
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 9,
            color: C.dim, letterSpacing: 1.5, textTransform: "uppercase",
          }}>
            Running AI model…
          </span>
        </div>
      )}

      {fireResult && <FireResultBadge result={fireResult} />}
    </div>
  );
}

// ── Drone Video Upload — admin only ──────────────────────────────
function VideoUploadPanel({ videoResult, loadingVideo, handleVideoUpload }) {
  return (
    <div>
      <label
        style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "16px 0",
          border: `1.5px dashed rgba(244,162,97,0.28)`,
          borderRadius: "var(--radius-lg)", cursor: "pointer",
          background: "rgba(244,162,97,0.03)",
          transition: "background 0.2s, border-color 0.2s",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background  = "rgba(244,162,97,0.07)";
          e.currentTarget.style.borderColor = "rgba(244,162,97,0.55)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background  = "rgba(244,162,97,0.03)";
          e.currentTarget.style.borderColor = "rgba(244,162,97,0.28)";
        }}
      >
        <input
          type="file" accept=".mp4"
          onChange={handleVideoUpload}
          style={{ display: "none" }}
          disabled={loadingVideo}
        />
        <span style={{ fontSize: 26, marginBottom: 5 }}>🎥</span>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 10,
          letterSpacing: 1.5, color: C.muted, textTransform: "uppercase",
        }}>
          {loadingVideo ? "Processing video…" : "Upload .mp4 Feed"}
        </span>
        <span style={{
          fontFamily: "var(--font-body)", fontSize: 11,
          color: C.dim, marginTop: 3,
        }}>
          1 frame / second · OpenCV analysis
        </span>
      </label>

      {loadingVideo && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 0",
        }}>
          <div className="s-spinner" style={{ width: 18, height: 18, flexShrink: 0 }} />
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 9,
            color: C.dim, letterSpacing: 1.5, textTransform: "uppercase",
          }}>
            Extracting frames…
          </span>
        </div>
      )}

      {videoResult && <VideoTimeline result={videoResult} />}
    </div>
  );
}

// ── Public Report Incident ────────────────────────────────────────
function PublicReportPanel({ onOpenReportModal }) {
  return (
    <div>
      <p style={{
        fontFamily: "var(--font-body)",
        color: C.muted, fontSize: 13,
        marginBottom: 10, lineHeight: 1.55,
      }}>
        Witnessed a fire, flood, or emergency? Pin it on the map —
        an admin will verify before alerts are dispatched.
      </p>
      <button
        className="s-btn"
        style={{
          width: "100%", padding: "12px 0",
          background: "transparent",
          border: `1px solid rgba(244,162,97,0.35)`,
          borderRadius: "var(--radius-md)",
          color: C.amber,
          fontFamily: "var(--font-body)", fontWeight: 600,
          fontSize: 13, cursor: "pointer",
          transition: "background 0.18s, border-color 0.18s",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background   = "rgba(244,162,97,0.08)";
          e.currentTarget.style.borderColor  = C.amber;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background   = "transparent";
          e.currentTarget.style.borderColor  = "rgba(244,162,97,0.35)";
        }}
        onClick={onOpenReportModal}
      >
        📍 Pin Incident on Map →
      </button>
    </div>
  );
}

// ── Incident History ──────────────────────────────────────────────
function IncidentHistory({ history }) {
  if (!history.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {history.slice(0, 6).map((inc, i) => {
        const colorVar = TYPE_COLOR[inc.type] || "var(--text-dim)";
        // For borderLeft we need the resolved literal (CSS vars don't work in border strings in some engines)
        const borderColor =
          inc.type === "fire"       ? C.crimson :
          inc.type === "earthquake" ? C.amber   :
          inc.type === "flood"      ? C.teal    :
          inc.type === "cyclone"    ? C.purple  : C.dim;

        return (
          <div key={i} style={{
            padding: "8px 10px",
            background: "rgba(255,255,255,0.02)",
            borderRadius: "var(--radius-sm)",
            borderLeft: `2px solid ${borderColor}`,
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between", marginBottom: 2,
            }}>
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9, color: borderColor, letterSpacing: 1.2,
                textTransform: "uppercase",
              }}>
                {inc.type ?? "Incident"}
              </span>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 8, color: C.dim,
              }}>
                {inc.time ? new Date(inc.time).toLocaleDateString("en-IN") : ""}
              </span>
            </div>
            <div style={{
              fontFamily: "var(--font-body)", fontSize: 12, color: C.text,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {inc.location}
            </div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 8,
              color: C.dim, marginTop: 2, textTransform: "uppercase",
            }}>
              {inc.severity}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FIRE RESULT BADGE
// ═══════════════════════════════════════════════════════════════════
function FireResultBadge({ result }) {
  const isFire = result.result?.includes("FIRE");
  return (
    <div style={{
      marginTop: 10, padding: "12px 14px",
      borderRadius: "var(--radius-md)",
      background: isFire
        ? "rgba(230,57,70,0.10)"
        : "rgba(42,157,143,0.08)",
      border: `1px solid ${isFire
        ? "rgba(230,57,70,0.28)"
        : "rgba(42,157,143,0.25)"}`,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 5,
      }}>
        <span style={{ fontSize: 18 }}>{isFire ? "🔥" : "✅"}</span>
        <span style={{
          fontFamily: "var(--font-mono)", fontWeight: 700,
          fontSize: 13,
          color: isFire ? C.crimson : C.green,
        }}>
          {result.result}
        </span>
      </div>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 9,
        color: C.muted, lineHeight: 1.7,
      }}>
        CONFIDENCE: {result.confidence}
        {result.prefilter_score && (
          <><br />PREFILTER: {result.prefilter_score}</>
        )}
      </div>
      {isFire && (
        <div style={{
          marginTop: 7, fontFamily: "var(--font-body)",
          fontSize: 12, color: C.amber, lineHeight: 1.4,
        }}>
          📋 Logged as pending — awaiting admin verification.
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// VIDEO TIMELINE
// ═══════════════════════════════════════════════════════════════════
function VideoTimeline({ result }) {
  // 1. Safely grab the array, whether the backend calls it 'timeline' or 'fire_frames'
  const rawData = result.timeline || result.fire_frames || [];

  // 2. Map it safely to what Recharts expects without crashing
  const chartData = rawData.map((t) => {
    let conf = 0;
    if (typeof t.confidence === 'string') {
      conf = parseFloat(t.confidence.replace('%', '')) || 0; 
    } else if (typeof t.confidence === 'number') {
      conf = +(t.confidence * 100).toFixed(1);
    }

    return {
      second:     t.second !== undefined ? t.second : t.frame,
      confidence: conf,
      fire:       t.is_fire !== undefined ? t.is_fire : t.fire_detected,
    };
  });

  return (
    <div style={{ marginTop: 12 }}>
      {/* Summary pills */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <StatPill label="Frames" val={result.total_frames_sampled || result.total_frames_analysed || 0} color="#4DFFB4" />
        <StatPill
          label="Peak"
          val={result.fire_detected ? "High" : "Low"}
          color={result.fire_detected ? "#FF4D6D" : "#4DFFB4"}
        />
        <StatPill
          label="Status"
          val={result.fire_detected ? "FIRE" : "CLEAR"}
          color={result.fire_detected ? "#FF4D6D" : "#4DFFB4"}
        />
      </div>

      {/* Recharts line chart */}
      {chartData.length > 0 && (
        <div style={{ background: "rgba(0,0,0,0.28)", borderRadius: 8, padding: "10px 4px 6px" }}>
          <div style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 8, letterSpacing: 1, color: "#3A5068",
            paddingLeft: 12, marginBottom: 6,
          }}>
            FIRE CONFIDENCE / SECOND (%)
          </div>
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={chartData} margin={{ left: 0, right: 6 }}>
              <Tooltip
                contentStyle={{
                  background: "#0F1929", border: "1px solid rgba(77,255,180,0.20)",
                  borderRadius: 6, fontFamily: "'Space Mono', monospace", fontSize: 9,
                }}
                labelFormatter={(s) => `Frame ${s}`}
                formatter={(v) => [`${v}%`, "Confidence"]}
              />
              <ReferenceLine y={55} stroke="rgba(255,77,109,0.45)" strokeDasharray="4 3" />
              <Line
                type="monotone" dataKey="confidence"
                stroke="#FFB84D" strokeWidth={2} isAnimationActive={false}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  return payload.fire
                    ? <circle key={`f${cx}`} cx={cx} cy={cy} r={3} fill="#FF4D6D" />
                    : <circle key={`s${cx}`} cx={cx} cy={cy} r={2} fill="#4DFFB4" />;
                }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div style={{
            fontFamily: "'Space Mono', monospace", fontSize: 8,
            color: "#3A5068", paddingLeft: 12, paddingTop: 3,
          }}>
            🔴 = fire threshold (55%)
          </div>
        </div>
      )}
    </div>
  );
}

function StatPill({ label, val, color }) {
  return (
    <div style={{
      padding: "3px 9px", borderRadius: "var(--radius-sm)",
      background: `${color}18`, border: `1px solid ${color}28`,
    }}>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 8,
        color: C.dim, letterSpacing: 1,
      }}>
        {label}:{" "}
      </span>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 9,
        color, fontWeight: 700,
      }}>
        {val}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ADMIN APPROVAL QUEUE
// ═══════════════════════════════════════════════════════════════════
function ApprovalQueue({ incidents, onRefresh, onVerify }) {
  const TYPE_ICON = {
    fire: "🔥", earthquake: "🌍", flood: "🌊", cyclone: "🌀", other: "📋",
  };

  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <MonoLabel text="Pending Review" />
          <div style={{
            fontFamily: "var(--font-display)", fontWeight: 700,
            fontSize: 20, color: C.text, marginTop: 3,
          }}>
            {incidents.length} Incident{incidents.length !== 1 ? "s" : ""}
          </div>
        </div>
        <button
          className="s-btn s-btn-ghost"
          style={{ fontSize: 12, padding: "6px 12px" }}
          onClick={onRefresh}
        >
          ↻ Refresh
        </button>
      </div>

      {incidents.length === 0 && (
        <div style={{
          textAlign: "center", padding: "36px 0",
          fontFamily: "var(--font-body)",
          fontSize: 13, color: C.dim,
        }}>
          ✅ No pending incidents
        </div>
      )}

      {incidents.map((inc) => (
        <div key={inc.id} style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderLeft: `3px solid ${C.amber}`,
          borderRadius: "var(--radius-md)", padding: 14,
        }}>
          {/* Incident header */}
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "flex-start", marginBottom: 8,
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 18 }}>{TYPE_ICON[inc.type] || "📋"}</span>
              <div>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 9,
                  color: C.amber, letterSpacing: 1.5, textTransform: "uppercase",
                }}>
                  {inc.type}
                </div>
                <div style={{
                  fontFamily: "var(--font-display)", fontWeight: 600,
                  fontSize: 14, color: C.text,
                }}>
                  {inc.location}
                </div>
              </div>
            </div>
            <div style={{
              padding: "3px 8px", borderRadius: "var(--radius-sm)",
              background: "var(--amber-dim)",
              fontFamily: "var(--font-mono)", fontSize: 8,
              color: C.amber, letterSpacing: 1, textTransform: "uppercase",
            }}>
              {inc.severity}
            </div>
          </div>

          {/* Meta */}
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9,
            color: C.dim, marginBottom: 8, lineHeight: 1.7,
          }}>
            {inc.confidence && <span>CONF: {inc.confidence} · </span>}
            {new Date(inc.time).toLocaleString("en-IN")}
          </div>

          {inc.notes && (
            <div style={{
              fontFamily: "var(--font-body)", fontSize: 12,
              color: C.muted, marginBottom: 8, lineHeight: 1.5,
            }}>
              {inc.notes}
            </div>
          )}

          {inc.image_url && (
            <img
              src={inc.image_url} alt="Incident evidence"
              style={{
                width: "100%", height: 110,
                objectFit: "cover",
                borderRadius: "var(--radius-sm)", marginBottom: 10,
              }}
            />
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="s-btn s-btn-primary"
              style={{ flex: 1, padding: "9px 0", fontSize: 12 }}
              onClick={() => onVerify(inc.id, "verified")}
            >
              ✅ Verify &amp; Alert
            </button>
            <button
              className="s-btn s-btn-danger"
              style={{ flex: 1, padding: "9px 0", fontSize: 12 }}
              onClick={() => onVerify(inc.id, "rejected")}
            >
              ❌ Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// REPORT INCIDENT MODAL — public flow
// ═══════════════════════════════════════════════════════════════════
function ReportIncidentModal({ capturedLatLon, onClose, onSuccess, currentCity }) {
  const [form, setForm] = useState({
    type: "fire", location: currentCity, severity: "moderate", notes: "",
  });
  const [image, setImage]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData();
    fd.append("type",     form.type);
    fd.append("location", form.location);
    fd.append("severity", form.severity);
    fd.append("notes",    form.notes);
    if (capturedLatLon) {
      fd.append("lat", capturedLatLon.lat);
      fd.append("lon", capturedLatLon.lon);
    }
    if (image) fd.append("image", image);
    try {
      const res = await authFetch("/incidents/submit", { method: "POST", body: fd });
      const d   = await res.json();
      if (!res.ok) throw new Error(d.detail || "Submission failed.");
      onSuccess();
      alert("✅ Incident submitted. Admin will review before alerts are dispatched.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.borderH}`,
          borderRadius: "var(--radius-xl)", padding: 28,
          width: "100%", maxWidth: 460,
          maxHeight: "90vh", overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: 20,
        }}>
          <div>
            <MonoLabel text="Crowdsource Report" />
            <h2 style={{
              fontFamily: "var(--font-display)", fontWeight: 700,
              fontSize: 20, color: C.text, marginTop: 3,
            }}>
              Report Incident
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none",
              color: C.dim, fontSize: 20, cursor: "pointer",
            }}
          >✕</button>
        </div>

        {/* Pinned coords */}
        {capturedLatLon && (
          <div style={{
            padding: "8px 12px", borderRadius: "var(--radius-sm)",
            marginBottom: 14,
            background: "rgba(69,123,157,0.08)",
            border: `1px solid ${C.borderH}`,
            fontFamily: "var(--font-mono)", fontSize: 10, color: C.teal,
          }}>
            📍 Pinned: {capturedLatLon.lat.toFixed(4)}, {capturedLatLon.lon.toFixed(4)}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: "10px 12px", borderRadius: "var(--radius-sm)",
            marginBottom: 12,
            background: "var(--crimson-dim)",
            border: "1px solid rgba(230,57,70,0.28)",
            color: C.crimson, fontSize: 12,
          }}>
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 13 }}
        >
          <div>
            <label className="s-label">Incident Type</label>
            <select className="s-input" name="type" value={form.type} onChange={handleChange}>
              <option value="fire">🔥 Fire</option>
              <option value="earthquake">🌍 Earthquake</option>
              <option value="flood">🌊 Flood</option>
              <option value="cyclone">🌀 Cyclone</option>
              <option value="other">📋 Other</option>
            </select>
          </div>

          <div>
            <label className="s-label">Location / City</label>
            <input
              className="s-input" name="location"
              value={form.location} onChange={handleChange}
              placeholder="e.g. Mumbai, Dharavi sector" required
            />
          </div>

          <div>
            <label className="s-label">Severity</label>
            <select className="s-input" name="severity" value={form.severity} onChange={handleChange}>
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label className="s-label">Description</label>
            <textarea
              className="s-input" name="notes" rows={3}
              placeholder="Describe what you are witnessing…"
              value={form.notes} onChange={handleChange}
              style={{ resize: "vertical", minHeight: 72 }}
            />
          </div>

          <div>
            <label className="s-label">Photo Evidence (optional)</label>
            <label style={{
              display: "block", padding: "14px", textAlign: "center",
              border: `1.5px dashed ${C.borderH}`,
              borderRadius: "var(--radius-md)",
              cursor: "pointer", background: "rgba(69,123,157,0.03)",
              transition: "background 0.2s",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(69,123,157,0.06)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(69,123,157,0.03)"}
            >
              <input
                type="file" accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => setImage(e.target.files[0])}
              />
              {image
                ? <span style={{ fontSize: 12, color: C.teal }}>📎 {image.name}</span>
                : <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 10, color: C.dim,
                    textTransform: "uppercase",
                  }}>
                    + Attach Photo
                  </span>
              }
            </label>
          </div>

          <button
            className="s-btn s-btn-primary"
            type="submit" disabled={loading}
            style={{ padding: "13px 0", fontSize: 13 }}
          >
            {loading ? "Submitting…" : "Submit for Review →"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LAYER DOCK — floating pill, bottom-center of map
// ═══════════════════════════════════════════════════════════════════
function LayerDock({ activeLayer, setActiveLayer, showSafeZones, setShowSafeZones }) {
  const layers = [
    { id: "clouds", icon: "☁️",  label: "Clouds" },
    { id: "rain",   icon: "🌧️", label: "Rain"   },
    { id: "temp",   icon: "🌡️", label: "Temp"   },
    { id: "wind",   icon: "💨",  label: "Wind"   },
  ];

  return (
    <div style={{
      position: "absolute", bottom: 20, left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(11,19,32,0.94)",
      backdropFilter: "blur(18px)",
      WebkitBackdropFilter: "blur(18px)",
      border: `1px solid ${C.borderH}`,
      borderRadius: 99, padding: "7px 14px",
      display: "flex", gap: 3, zIndex: 1000,
      boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
    }}>
      {layers.map((layer) => (
        <button
          key={layer.id}
          onClick={() => setActiveLayer(activeLayer === layer.id ? null : layer.id)}
          style={{
            background: activeLayer === layer.id ? C.teal : "transparent",
            color:      activeLayer === layer.id ? "#fff" : C.muted,
            border: "none", borderRadius: 99, padding: "6px 12px",
            cursor: "pointer",
            fontFamily: "var(--font-body)", fontSize: 12,
            display: "flex", alignItems: "center", gap: 4,
            transition: "all 0.18s",
          }}
        >
          {layer.icon} {layer.label}
        </button>
      ))}

      {/* Divider */}
      <div style={{ width: 1, background: C.border, margin: "4px 4px" }} />

      {/* Shelters toggle */}
      <button
        onClick={() => setShowSafeZones((v) => !v)}
        style={{
          background: showSafeZones ? "rgba(42,157,143,0.15)" : "transparent",
          color:      showSafeZones ? C.green : C.muted,
          border: `1px solid ${showSafeZones ? "rgba(42,157,143,0.35)" : "transparent"}`,
          borderRadius: 99, padding: "6px 12px",
          cursor: "pointer",
          fontFamily: "var(--font-body)", fontSize: 12,
          display: "flex", alignItems: "center", gap: 4,
          transition: "all 0.18s",
        }}
      >
        🛡 Shelters
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MICRO UTILITIES
// ═══════════════════════════════════════════════════════════════════

/**
 * MonoLabel — small uppercase Space Mono category label
 * Used as the section header inside HUDs and sidebar cards.
 */
function MonoLabel({ text }) {
  return (
    <div style={{
      fontFamily: "var(--font-mono)",
      fontSize: 8, letterSpacing: 2,
      color: "var(--text-dim)",
      textTransform: "uppercase",
    }}>
      {text}
    </div>
  );
}

/**
 * SectionDivider — horizontal rule with centred label.
 * Separates logical groups in the sidebar monitor panel.
 */
function SectionDivider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 0" }}>
      <div style={{ flex: 1, height: 1, background: C.border }} />
      <span style={{
        fontFamily: "var(--font-body)", fontSize: 11,
        fontWeight: 600, color: C.dim, flexShrink: 0,
        textTransform: "uppercase", letterSpacing: 0.5,
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  );
}

/**
 * aqiLabel — returns plain-English category for a given AQI value.
 */
function aqiLabel(aqi) {
  if (aqi <= 50)  return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Sensitive";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very Unhealthy";
  return "Hazardous";
}

/**
 * ShieldLogo — enterprise shield icon that replaced the neon hexagon.
 * Stroke colour uses the teal operational accent (#457B9D).
 */
function ShieldLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M16 2L4 7V16C4 21.5 9.5 26.5 16 30C22.5 26.5 28 21.5 28 16V7L16 2Z"
        stroke={C.teal} strokeWidth="1.5" fill="rgba(69,123,157,0.08)"
      />
      <path
        d="M16 6L8 10V16C8 19.8 11.6 23.2 16 25.5C20.4 23.2 24 19.8 24 16V10L16 6Z"
        stroke={C.teal} strokeWidth="0.75" fill="rgba(69,123,157,0.05)" opacity="0.7"
      />
      <circle cx="16" cy="16" r="2.2" fill={C.teal} />
    </svg>
  );
}
