// ═══════════════════════════════════════════════════════════════════════════
// Dashboard.jsx  —  Sentinel  |  Enterprise Operational Command Center  v3.0
// ═══════════════════════════════════════════════════════════════════════════
//
//  Upgrades in this version:
//  ▸ Weather HUD: collapsible spring-physics modal (380 px expanded)
//      - Compact state: temp + icon + city only
//      - Expanded state: full weather command center (stats grid, hourly
//        6-slot forecast strip, UV index, pressure, visibility, wind dir)
//      - "Generate Situation Report" PDF button lives here
//      - Skeleton loader on data refresh
//  ▸ Incident History: true Accordion — one card open at a time
//      - Compact strip: icon · location · severity badge
//      - Expanded panel (AnimatePresence height:auto): timestamp,
//        AI confidence, notes, "Reported by" from joined DB column
//      - Critical cards: left crimson glow + pulsing ring indicator
//      - Hover states with border glow
//      - Skeleton loading (3 shimmer placeholders)
//      - Radar-icon empty state
//  ▸ Global: DM Sans body / Space Mono data, custom sidebar scrollbar,
//    per-button spinner+disabled states throughout
//
//  ── ALL EXISTING FEATURES RETAINED ───────────────────────────────────────
//  • Leaflet MapContainer + pulsing divIcon markers
//  • Reverse-geocoding map clicks (passive mode)
//  • Aerial Fire Intelligence (ALL roles) + MobileNetV2 result badge
//  • Drone Video Analysis panel (admin) + Recharts confidence timeline
//  • Public Report Incident modal (spring-physics animated)
//  • AQI HUD (top-left) + Seismic HUD (bottom-left)
//  • LayerDock weather overlay switcher + Shelters toggle
//  • Admin Approval Queue with per-button loading states
//  • authFetch / API_BASE imports — fetch logic unchanged
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
import { motion, AnimatePresence } from "framer-motion";

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

// Resolved colour literals (CSS vars cannot be used in Recharts / L.divIcon)
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

const TYPE_ICON = {
  fire: "🔥", earthquake: "🌍", flood: "🌊", cyclone: "🌀", other: "📋",
};

// Severity → resolved colour
const SEV_COLOR = {
  critical: C.crimson,
  high:     "#E07B3A",
  moderate: C.amber,
  low:      C.green,
};

// ═══════════════════════════════════════════════════════════════════
// LEAFLET ICON FACTORY
// Pulse classes defined in App.jsx GlobalStyles (enterprise palette)
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

// Created once at module scope
const PulseBlueIcon   = makePulseIcon("pulse-blue");
const PulseGreenIcon  = makePulseIcon("pulse-green");
const PulseRedIcon    = makePulseIcon("pulse-red");
const PulseOrangeIcon = makePulseIcon("pulse-orange");
const RedPinIcon      = makePngIcon("red");

// ═══════════════════════════════════════════════════════════════════
// SHARED GLASSMORPHISM OBJECT — deep navy, NOT neon-tinted
// ═══════════════════════════════════════════════════════════════════

const GLASS = {
  background:           "rgba(9, 16, 28, 0.88)",
  backdropFilter:       "blur(22px)",
  WebkitBackdropFilter: "blur(22px)",
  border:               `1px solid ${C.borderH}`,
  borderRadius:         "var(--radius-lg)",
  boxShadow:            "0 12px 48px rgba(0,0,0,0.60), inset 0 1px 0 rgba(255,255,255,0.04)",
  pointerEvents:        "auto",
};

// ═══════════════════════════════════════════════════════════════════
// SCOPED CSS — injected once on mount, cleaned up on unmount
// ═══════════════════════════════════════════════════════════════════

function DashboardStyles() {
  useEffect(() => {
    const ID = "sentinel-dashboard-v3-styles";
    const existing = document.getElementById(ID);
    if (existing) existing.remove();

    const style = document.createElement("style");
    style.id = ID;
    style.textContent = `
      /* ── Custom Scrollbar — sidebar ─────────────────────────────── */
      .sentinel-sidebar-scroll {
        scrollbar-width: thin;
        scrollbar-color: rgba(69,123,157,0.28) transparent;
      }
      .sentinel-sidebar-scroll::-webkit-scrollbar { width: 4px; }
      .sentinel-sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
      .sentinel-sidebar-scroll::-webkit-scrollbar-thumb {
        background: rgba(69,123,157,0.28);
        border-radius: 99px;
      }
      .sentinel-sidebar-scroll::-webkit-scrollbar-thumb:hover {
        background: rgba(69,123,157,0.52);
      }

      /* ── Accordion tactical card ─────────────────────────────────── */
      .tactical-card {
        position: relative;
        background: rgba(22,34,55,0.80);
        border: 1px solid rgba(69,123,157,0.12);
        border-radius: 10px;
        cursor: pointer;
        transition:
          transform 0.20s cubic-bezier(0.22,1,0.36,1),
          box-shadow 0.20s cubic-bezier(0.22,1,0.36,1),
          border-color 0.20s ease,
          background  0.20s ease;
        overflow: hidden;
        user-select: none;
      }
      .tactical-card:hover {
        transform: translateY(-2px);
        background: rgba(26,40,64,0.95);
      }

      /* Left-border severity colour variants + hover glow */
      .tactical-card.critical-card  { border-left: 3px solid #E63946 !important; }
      .tactical-card.critical-card:hover {
        border-color: rgba(230,57,70,0.60) !important;
        box-shadow: 0 8px 28px rgba(230,57,70,0.14), 0 3px 12px rgba(0,0,0,0.38);
      }
      .tactical-card.high-card      { border-left: 3px solid #E07B3A !important; }
      .tactical-card.high-card:hover {
        border-color: rgba(224,123,58,0.55) !important;
        box-shadow: 0 8px 28px rgba(224,123,58,0.12), 0 3px 12px rgba(0,0,0,0.38);
      }
      .tactical-card.moderate-card  { border-left: 3px solid #F4A261 !important; }
      .tactical-card.moderate-card:hover {
        border-color: rgba(244,162,97,0.55) !important;
        box-shadow: 0 8px 28px rgba(244,162,97,0.10), 0 3px 12px rgba(0,0,0,0.38);
      }
      .tactical-card.low-card       { border-left: 3px solid #2A9D8F !important; }
      .tactical-card.low-card:hover {
        border-color: rgba(42,157,143,0.50) !important;
        box-shadow: 0 8px 28px rgba(42,157,143,0.09), 0 3px 12px rgba(0,0,0,0.38);
      }

      /* Active / expanded highlight */
      .tactical-card.is-open {
        background: rgba(30,46,72,0.98) !important;
        box-shadow: 0 6px 24px rgba(0,0,0,0.35) !important;
      }

      /* ── Critical pulse ring ─────────────────────────────────────── */
      @keyframes critical-ring-pulse {
        0%, 100% { opacity: 0.90; transform: scale(1);    }
        50%      { opacity: 0.45; transform: scale(1.40); }
      }
      .critical-pulse-ring {
        display: inline-block;
        width: 8px; height: 8px;
        border-radius: 50%;
        background: #E63946;
        box-shadow: 0 0 8px #E63946;
        animation: critical-ring-pulse 1.1s ease-in-out infinite;
        flex-shrink: 0;
      }

      /* ── Skeleton shimmer ────────────────────────────────────────── */
      @keyframes skeleton-shimmer {
        0%   { background-position: -600px 0; }
        100% { background-position:  600px 0; }
      }
      .skeleton-block {
        background: linear-gradient(
          90deg,
          rgba(69,123,157,0.06) 25%,
          rgba(69,123,157,0.15) 50%,
          rgba(69,123,157,0.06) 75%
        );
        background-size: 1200px 100%;
        animation: skeleton-shimmer 1.6s infinite linear;
        border-radius: 5px;
      }

      /* ── Inline button spinner ───────────────────────────────────── */
      @keyframes btn-spin { to { transform: rotate(360deg); } }
      .btn-spinner {
        display: inline-block;
        width: 11px; height: 11px;
        border: 1.8px solid rgba(255,255,255,0.28);
        border-top-color: rgba(255,255,255,0.88);
        border-radius: 50%;
        animation: btn-spin 0.65s linear infinite;
        flex-shrink: 0;
      }

      /* ── Weather HUD expanded forecasts ─────────────────────────── */
      .forecast-slot {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex: 1;
        padding: 6px 2px;
        border-radius: 8px;
        transition: background 0.15s;
        cursor: default;
      }
      .forecast-slot:hover {
        background: rgba(69,123,157,0.10);
      }
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById(ID);
      if (el) el.remove();
    };
  }, []);
  return null;
}

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
 *   active=true  → incident-pinning mode → calls onCapture(lat, lng)
 *   active=false → reverse-geocode mode  → calls onGeocode("lat,lng")
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
      {/* Shield logo — navigates home */}
      <div
        onClick={onLogoClick}
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
        title="Return to Home"
      >
        <ShieldLogo size={22} />
        <span style={{
          fontFamily: "var(--font-display)", fontWeight: 700,
          fontSize: 14, letterSpacing: 3, color: C.text,
        }}>
          SENTINEL
        </span>
      </div>

      {/* Live indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span className="status-dot live" />
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 9,
          color: C.green, letterSpacing: 2, textTransform: "uppercase",
        }}>
          Live
        </span>
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

  // ── Fire image detection — ALL roles ──
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
  const [history, setHistory]               = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // ── Report PDF loading ──
  const [loadingReport, setLoadingReport] = useState(false);

  // ── Initial load ──────────────────────────────────────────────────
  useEffect(() => {
    const initializeDashboard = async () => {
      let startingCity = "Pune";
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

  // ── API helpers ───────────────────────────────────────────────────

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await authFetch("/history");
      const d   = await res.json();
      setHistory(Array.isArray(d) ? d : []);
    } catch { /* silent */ }
    finally { setHistoryLoading(false); }
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
    setLoadingReport(true);
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
    finally { setLoadingReport(false); }
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

  // ── Derived values ────────────────────────────────────────────────
  const mapCenter = data
    ? [data.weather.location.lat, data.weather.location.lon]
    : [20.5937, 78.9629];

  const seismic = data?.seismic_risk ?? null;
  const aqi     = data?.aqi_calculated ?? 0;

  const aqiColor =
    aqi <= 50  ? C.green  :
    aqi <= 100 ? "#A3BE8C" :
    aqi <= 150 ? C.amber  :
    aqi <= 200 ? C.crimson:
                 "#8B4A6B";

  // ── Framer Motion variants ────────────────────────────────────────
  const staggerContainer = {
    hidden: {},
    show: { transition: { staggerChildren: 0.09, delayChildren: 0.04 } },
  };
  const fadeUpChild = {
    hidden: { opacity: 0, y: 18 },
    show:   { opacity: 1, y: 0, transition: { type: "spring", stiffness: 280, damping: 26 } },
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <>
      <DashboardStyles />
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

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          style={{ display: "flex", flex: 1, overflow: "hidden" }}
        >
          {/* ══════════════════════════════════════════════════════════
              LEFT SIDEBAR — 380 px, always visible
              ══════════════════════════════════════════════════════════ */}
          <motion.aside
            variants={fadeUpChild}
            style={{
              width: 380, flexShrink: 0,
              background: "rgba(11,19,32,0.96)",
              borderRight: `1px solid ${C.border}`,
              display: "flex", flexDirection: "column",
              overflowY: "auto", overflowX: "hidden",
            }}
            className="sentinel-sidebar-scroll"
          >
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
                padding: "14px 14px 24px", gap: 12,
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
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
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

                {/* ══ INCIDENT HISTORY — ACCORDION TACTICAL CARDS ══ */}
                <SectionDivider label="Recent Verified Incidents" />

                <IncidentHistory
                  history={history}
                  loading={historyLoading}
                />

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
          </motion.aside>

          {/* ══════════════════════════════════════════════════════════
              MAP AREA — flex:1, position:relative
              All HUDs are absolutely-positioned children.
              ══════════════════════════════════════════════════════════ */}
          <motion.div
            variants={fadeUpChild}
            style={{ flex: 1, position: "relative", overflow: "hidden" }}
          >
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
                {/* AQI progress bar */}
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

            {/* ══ WEATHER HUD — top-right, collapsible ══ */}
            {data && (
              <WeatherHUD
                data={data}
                onDownloadReport={handleDownloadReport}
                loadingReport={loadingReport}
              />
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
                  active=true  → incident pin (public report flow)
                  active=false → reverse geocode any map click
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

              {/* Seismic epicentre — crimson pin + 150 km danger circle */}
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

              {/* Verified incidents — pulse crimson or amber */}
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
          </motion.div>
        </motion.div>

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
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// WEATHER HUD — collapsible spring-physics modal
//
// Compact state  (default) : 230 px wide — icon + temp + city
// Expanded state (on click): 390 px wide — full weather command center
//   • Humidity / Wind / Feels Like / UV Index / Pressure / Visibility
//   • 6-slot hourly forecast strip with large icons
//   • Wind direction badge
//   • "Generate Situation Report" PDF button with spinner
// ═══════════════════════════════════════════════════════════════════

function WeatherHUD({ data, onDownloadReport, loadingReport }) {
  const [expanded, setExpanded]   = useState(false);
  const [hudLoading, setHudLoading] = useState(true);

  const current  = data?.weather?.current;
  const loc      = data?.weather?.location;
  const condIcon = current ? `https:${current.condition.icon}` : null;

  // All hourly slots for the current day, sampled every 3 hours → 6 slots
  const forecast = data?.weather?.forecast?.forecastday?.[0]?.hour || [];
  const hours    = forecast.filter((_, i) => i % 3 === 0).slice(0, 6);

  // Brief skeleton on data refresh
  useEffect(() => {
    if (data) {
      setHudLoading(true);
      const t = setTimeout(() => setHudLoading(false), 550);
      return () => clearTimeout(t);
    }
  }, [data]);

  // Spring config — weighty but snappy
  const spring = { type: "spring", stiffness: 310, damping: 30, mass: 0.85 };

  // ── Skeleton ──
  if (hudLoading) {
    return (
      <div style={{
        ...GLASS,
        position: "absolute", top: 16, right: 16,
        zIndex: 1100, width: 232, padding: "14px 16px",
      }}>
        <div className="skeleton-block" style={{ width: 72, height: 8, marginBottom: 14 }} />
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div className="skeleton-block" style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton-block" style={{ width: "55%", height: 28, marginBottom: 7 }} />
            <div className="skeleton-block" style={{ width: "80%", height: 9, marginBottom: 5 }} />
            <div className="skeleton-block" style={{ width: "60%", height: 8 }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      layout
      transition={spring}
      style={{
        ...GLASS,
        position: "absolute", top: 16, right: 16,
        zIndex: 1100,
        width: expanded ? 390 : 232,
        padding: 0,
        overflow: "hidden",
        cursor: expanded ? "default" : "pointer",
      }}
      onClick={() => !expanded && setExpanded(true)}
    >
      {/* ── COMPACT HEADER — always visible ── */}
      <div style={{
        padding: expanded ? "14px 16px 8px" : "12px 14px",
        display: "flex", alignItems: "center",
        gap: 10, justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {condIcon && (
            <motion.img
              layout="position"
              src={condIcon} alt=""
              style={{ width: expanded ? 44 : 36, height: expanded ? 44 : 36, flexShrink: 0 }}
            />
          )}
          <div>
            <motion.div
              layout="position"
              style={{
                fontFamily: "var(--font-mono)", fontWeight: 700,
                fontSize: expanded ? 32 : 24, lineHeight: 1, color: C.text,
              }}
            >
              {Math.round(current?.temp_c ?? 0)}°
            </motion.div>
            <div style={{
              fontFamily: "var(--font-body)", fontSize: expanded ? 12 : 11,
              color: C.muted, marginTop: 2,
            }}>
              {current?.condition?.text}
            </div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 8,
              color: C.teal, letterSpacing: 1, marginTop: 1,
            }}>
              {loc?.name}, {loc?.country}
            </div>
          </div>
        </div>

        {/* Toggle button */}
        {expanded ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: `1px solid ${C.border}`,
              borderRadius: "50%",
              width: 26, height: 26,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: C.muted, fontSize: 12,
              flexShrink: 0, transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = C.text; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = C.muted; }}
            title="Collapse weather panel"
          >
            ✕
          </button>
        ) : (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 2, flexShrink: 0,
          }}>
            <div style={{ width: 12, height: 1.5, background: C.dim, borderRadius: 99 }} />
            <div style={{ width: 12, height: 1.5, background: C.dim, borderRadius: 99 }} />
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 7,
              color: C.dim, letterSpacing: 0.5, marginTop: 2,
            }}>
              expand
            </div>
          </div>
        )}
      </div>

      {/* ── EXPANDED BODY — spring height:0 → height:auto ── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="weather-expanded"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 32, mass: 0.7 }}
            style={{ overflow: "hidden" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: "0 16px 16px" }}>

              {/* Divider */}
              <div style={{ height: 1, background: C.border, marginBottom: 12 }} />

              {/* ── 6-stat grid ── */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                gap: 7, marginBottom: 14,
              }}>
                {[
                  { k: "Humidity",    v: `${current?.humidity ?? "—"}%`                         },
                  { k: "Wind",        v: `${current?.wind_kph ?? "—"} kph`                      },
                  { k: "Feels Like",  v: `${Math.round(current?.feelslike_c ?? 0)}°`             },
                  { k: "UV Index",    v: current?.uv ?? "—"                                      },
                  { k: "Pressure",    v: `${current?.pressure_mb ?? "—"} mb`                    },
                  { k: "Visibility",  v: `${current?.vis_km ?? "—"} km`                         },
                ].map(({ k, v }) => (
                  <div key={k} style={{
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${C.border}`,
                    borderRadius: "var(--radius-sm)",
                    padding: "7px 5px", textAlign: "center",
                  }}>
                    <div style={{
                      fontFamily: "var(--font-mono)", fontWeight: 700,
                      fontSize: 11, color: C.text, lineHeight: 1.2,
                    }}>{v}</div>
                    <div style={{
                      fontFamily: "var(--font-body)", fontSize: 9,
                      color: C.dim, marginTop: 3, lineHeight: 1.1,
                    }}>{k}</div>
                  </div>
                ))}
              </div>

              {/* ── Wind direction badge ── */}
              {current?.wind_dir && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "5px 10px",
                  background: "rgba(69,123,157,0.08)",
                  border: `1px solid ${C.border}`,
                  borderRadius: 99, marginBottom: 14,
                }}>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 9,
                    color: C.teal, letterSpacing: 1,
                  }}>
                    WIND DIR
                  </span>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 11,
                    fontWeight: 700, color: C.text,
                  }}>
                    {current.wind_dir}
                  </span>
                  <span style={{
                    fontFamily: "var(--font-body)", fontSize: 11,
                    color: C.muted,
                  }}>
                    {current.wind_degree}°
                  </span>
                </div>
              )}

              {/* ── 6-slot hourly forecast strip ── */}
              {hours.length > 0 && (
                <>
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: 8,
                    color: C.dim, letterSpacing: 2,
                    textTransform: "uppercase", marginBottom: 8,
                  }}>
                    Hourly Forecast
                  </div>
                  <div style={{
                    display: "flex", gap: 4,
                    borderTop: `1px solid ${C.border}`,
                    paddingTop: 10, marginBottom: 14,
                  }}>
                    {hours.map((h, i) => {
                      const hr   = new Date(h.time).getHours();
                      const ampm = hr < 12 ? "AM" : "PM";
                      const label = `${hr % 12 || 12}${ampm}`;
                      const isRainy = h.chance_of_rain > 40;
                      return (
                        <div
                          key={i}
                          className="forecast-slot"
                        >
                          <div style={{
                            fontFamily: "var(--font-mono)", fontSize: 8,
                            color: C.dim, marginBottom: 4,
                          }}>
                            {label}
                          </div>
                          <img
                            src={`https:${h.condition.icon}`} alt=""
                            style={{ width: 26, height: 26, marginBottom: 3 }}
                          />
                          <div style={{
                            fontFamily: "var(--font-mono)", fontSize: 11,
                            color: C.text, fontWeight: 700,
                          }}>
                            {Math.round(h.temp_c)}°
                          </div>
                          {isRainy && (
                            <div style={{
                              fontFamily: "var(--font-mono)", fontSize: 7,
                              color: C.teal, marginTop: 2,
                            }}>
                              {h.chance_of_rain}%
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* ── Generate Situation Report — PDF download ── */}
              <button
                className="s-btn s-btn-ghost"
                onClick={onDownloadReport}
                disabled={loadingReport}
                style={{
                  width: "100%", padding: "10px 0", fontSize: 12,
                  display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 8,
                  opacity: loadingReport ? 0.65 : 1,
                  cursor: loadingReport ? "not-allowed" : "pointer",
                  transition: "opacity 0.2s",
                }}
              >
                {loadingReport ? (
                  <>
                    <span className="btn-spinner" />
                    Generating report…
                  </>
                ) : (
                  <>⬇ Generate Situation Report</>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SEISMIC HUD — bottom-left
// ═══════════════════════════════════════════════════════════════════

function SeismicHUD({ seismic }) {
  const hasRisk = !!seismic;

  return (
    <div style={{
      ...GLASS,
      position: "absolute",
      bottom: 80, left: 16,
      zIndex: 1100, width: 250,
      padding: "12px 14px",
      borderLeft: `3px solid ${hasRisk ? C.crimson : C.green}`,
    }}>
      <MonoLabel text="Seismic Proximity" />

      {hasRisk ? (
        <div style={{ marginTop: 8 }}>
          {/* Alert header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{
              width: 28, height: 28,
              borderRadius: "var(--radius-sm)",
              background: "var(--crimson-dim)",
              display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 14, flexShrink: 0,
            }}>⚠</div>
            <div>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 9,
                color: C.crimson, letterSpacing: 1, textTransform: "uppercase",
              }}>
                Elevated Risk
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: C.dim }}>
                {new Date(seismic.time).toLocaleString("en-IN")}
              </div>
            </div>
          </div>

          {/* User message */}
          <div style={{
            background: "rgba(230,57,70,0.08)",
            border: "1px solid rgba(230,57,70,0.22)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 10px",
            fontFamily: "var(--font-body)",
            fontSize: 12, color: C.crimson, lineHeight: 1.5, marginBottom: 8,
          }}>
            {seismic.user_message}
          </div>

          {/* Magnitude + Distance stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <span style={{ fontSize: 18 }}>🛡</span>
          <div>
            <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, color: C.green, fontSize: 12 }}>
              Sector Safe
            </div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: C.dim }}>
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
          borderRadius: "var(--radius-lg)",
          cursor: loadingFire ? "not-allowed" : "pointer",
          background: "rgba(230,57,70,0.03)",
          transition: "background 0.2s, border-color 0.2s",
          opacity: loadingFire ? 0.72 : 1,
        }}
        onMouseEnter={e => {
          if (!loadingFire) {
            e.currentTarget.style.background   = "rgba(230,57,70,0.07)";
            e.currentTarget.style.borderColor  = "rgba(230,57,70,0.55)";
          }
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
        <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: C.dim, marginTop: 3 }}>
          JPG / PNG · MobileNetV2 model
        </span>
      </label>

      {loadingFire && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0" }}>
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
          borderRadius: "var(--radius-lg)",
          cursor: loadingVideo ? "not-allowed" : "pointer",
          background: "rgba(244,162,97,0.03)",
          transition: "background 0.2s, border-color 0.2s",
          opacity: loadingVideo ? 0.72 : 1,
        }}
        onMouseEnter={e => {
          if (!loadingVideo) {
            e.currentTarget.style.background  = "rgba(244,162,97,0.07)";
            e.currentTarget.style.borderColor = "rgba(244,162,97,0.55)";
          }
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
        <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: C.dim, marginTop: 3 }}>
          1 frame / second · OpenCV analysis
        </span>
      </label>

      {loadingVideo && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0" }}>
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
        color: C.muted, fontSize: 13, marginBottom: 10, lineHeight: 1.55,
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
          e.currentTarget.style.background  = "rgba(244,162,97,0.08)";
          e.currentTarget.style.borderColor = C.amber;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background  = "transparent";
          e.currentTarget.style.borderColor = "rgba(244,162,97,0.35)";
        }}
        onClick={onOpenReportModal}
      >
        📍 Pin Incident on Map →
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// INCIDENT HISTORY — ACCORDION TACTICAL MISSION CARDS
//
// Architecture:
//   • expandedIdx: only one card is open at a time (accordion logic)
//   • Compact strip (always visible): icon · location · severity badge
//   • Expanded body (AnimatePresence height:0→auto):
//       - Full timestamp
//       - AI confidence / prefilter score
//       - Incident notes
//       - Reported by: inc.reported_by?.name || "System"
//   • Critical severity: left crimson glow + pulsing ring
//   • Skeleton shimmer loading state (3 placeholders)
//   • Radar-icon empty state
// ═══════════════════════════════════════════════════════════════════

function IncidentHistory({ history, loading }) {
  const [expandedIdx, setExpandedIdx] = useState(null);

  const toggle = (i) => setExpandedIdx(prev => prev === i ? null : i);

  // ── Skeleton state ──
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[0, 1, 2].map((n) => (
          <div key={n} style={{
            padding: "11px 13px",
            background: "rgba(22,34,55,0.70)",
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            borderLeft: `3px solid rgba(69,123,157,0.18)`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 9 }}>
              <div className="skeleton-block" style={{ width: 65, height: 8 }} />
              <div className="skeleton-block" style={{ width: 42, height: 8 }} />
            </div>
            <div className="skeleton-block" style={{ width: "72%", height: 13, marginBottom: 8 }} />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div className="skeleton-block" style={{ width: 52, height: 8 }} />
              <div className="skeleton-block" style={{ width: 88, height: 8 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Empty state ──
  if (!history.length) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "28px 16px 22px",
        background: "rgba(22,34,55,0.38)",
        borderRadius: 12,
        border: `1px dashed rgba(69,123,157,0.17)`,
        gap: 10,
      }}>
        {/* Muted radar icon */}
        <svg width="42" height="42" viewBox="0 0 42 42" fill="none" aria-hidden="true">
          <circle cx="21" cy="21" r="19" stroke={C.border} strokeWidth="1.5" />
          <circle cx="21" cy="21" r="13" stroke={C.border} strokeWidth="1" />
          <circle cx="21" cy="21" r="7"  stroke={C.border} strokeWidth="1" />
          <circle cx="21" cy="21" r="2"  fill={C.dim} />
          <line x1="21" y1="21" x2="34" y2="8" stroke={C.dim} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 9,
          color: C.dim, letterSpacing: 2, textTransform: "uppercase",
          textAlign: "center", lineHeight: 1.7,
        }}>
          No active incidents detected<br />in the current sector
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: C.dim, textAlign: "center" }}>
          Monitoring all feeds — sector is clear.
        </div>
      </div>
    );
  }

  // ── Accordion cards ──
  const cardClass = (sev) => {
    switch (sev) {
      case "critical": return "tactical-card critical-card";
      case "high":     return "tactical-card high-card";
      case "moderate": return "tactical-card moderate-card";
      default:         return "tactical-card low-card";
    }
  };

  const borderColor = (inc) =>
    inc.type === "fire"       ? C.crimson :
    inc.type === "earthquake" ? C.amber   :
    inc.type === "flood"      ? C.teal    :
    inc.type === "cyclone"    ? C.purple  : C.dim;

  const sevColor = (sev) => SEV_COLOR[sev] || C.dim;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {history.slice(0, 8).map((inc, i) => {
        const isOpen     = expandedIdx === i;
        const isCritical = inc.severity === "critical";
        const bc         = borderColor(inc);
        const sc         = sevColor(inc.severity);
        // Reporter name from JOIN: reported_by?.name with optional chaining safety
        const reporter   = inc.reported_by?.name || null;

        return (
          <motion.div
            key={i}
            className={`${cardClass(inc.severity)}${isOpen ? " is-open" : ""}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.055, type: "spring", stiffness: 300, damping: 28 }}
            style={{ borderLeftColor: bc }}
            onClick={() => toggle(i)}
          >
            {/* ── Compact strip (always visible) ── */}
            <div style={{ padding: "10px 12px" }}>

              {/* Row 1: Type icon + label — date */}
              <div style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "center", marginBottom: 5,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {isCritical && <span className="critical-pulse-ring" />}
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 8,
                    color: bc, letterSpacing: 1.5, textTransform: "uppercase",
                  }}>
                    {TYPE_ICON[inc.type] || "📋"} {inc.type ?? "Incident"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 8, color: C.dim,
                  }}>
                    {inc.time
                      ? new Date(inc.time).toLocaleDateString("en-IN", {
                          day: "2-digit", month: "short",
                        })
                      : "—"}
                  </span>
                  {/* Chevron indicator */}
                  <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.22 }}
                    style={{
                      display: "inline-block",
                      fontFamily: "var(--font-mono)", fontSize: 8,
                      color: C.dim, lineHeight: 1, userSelect: "none",
                    }}
                  >
                    ▾
                  </motion.span>
                </div>
              </div>

              {/* Row 2: Location */}
              <div style={{
                fontFamily: "var(--font-display)", fontWeight: 600,
                fontSize: 13, color: C.text,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                marginBottom: 6,
              }}>
                {inc.location || "Unknown Location"}
              </div>

              {/* Row 3: Severity badge + reporter name */}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                {/* Severity chip */}
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "2px 7px", borderRadius: 99,
                  background: `${sc}18`, border: `1px solid ${sc}35`,
                }}>
                  <div style={{
                    width: 5, height: 5, borderRadius: "50%", background: sc,
                    flexShrink: 0,
                    boxShadow: isCritical ? `0 0 5px ${sc}` : "none",
                  }} />
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 8,
                    color: sc, letterSpacing: 1, textTransform: "uppercase",
                  }}>
                    {inc.severity || "Unknown"}
                  </span>
                </div>

                {/* Reporter (if available from JOIN) */}
                {reporter && (
                  <span style={{
                    fontFamily: "var(--font-body)", fontSize: 10, color: C.dim,
                    overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap", maxWidth: 130,
                  }}>
                    by <span style={{ color: C.muted }}>{reporter}</span>
                  </span>
                )}
              </div>
            </div>

            {/* ── Expanded body (accordion) ── */}
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key={`expanded-${i}`}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ type: "spring", stiffness: 360, damping: 34, mass: 0.65 }}
                  style={{ overflow: "hidden" }}
                  onClick={e => e.stopPropagation()}
                >
                  <div style={{
                    padding: "0 12px 12px",
                    borderTop: `1px solid rgba(69,123,157,0.12)`,
                    marginTop: 0,
                  }}>
                    <div style={{ height: 10 }} />

                    {/* Full timestamp */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 7, marginBottom: 8,
                    }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: C.dim, letterSpacing: 1 }}>
                        DETECTED
                      </span>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 9, color: C.muted,
                      }}>
                        {inc.time
                          ? new Date(inc.time).toLocaleString("en-IN", {
                              day: "2-digit", month: "short", year: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })
                          : "—"}
                      </span>
                    </div>

                    {/* AI Confidence / prefilter */}
                    {(inc.confidence || inc.prefilter_score) && (
                      <div style={{
                        background: "rgba(69,123,157,0.07)",
                        border: `1px solid ${C.border}`,
                        borderRadius: "var(--radius-sm)",
                        padding: "7px 10px", marginBottom: 8,
                      }}>
                        <div style={{
                          fontFamily: "var(--font-mono)", fontSize: 8,
                          color: C.dim, letterSpacing: 1,
                          textTransform: "uppercase", marginBottom: 4,
                        }}>
                          AI Metrics
                        </div>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                          {inc.confidence && (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: C.muted }}>
                              CONF: <strong style={{ color: C.text }}>{inc.confidence}</strong>
                            </span>
                          )}
                          {inc.prefilter_score && (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: C.muted }}>
                              PREFILTER: <strong style={{ color: C.text }}>{inc.prefilter_score}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {inc.notes && (
                      <div style={{
                        fontFamily: "var(--font-body)", fontSize: 12,
                        color: C.muted, lineHeight: 1.6, marginBottom: 8,
                        fontStyle: "italic",
                      }}>
                        "{inc.notes}"
                      </div>
                    )}

                    {/* Reporter — prominent in expanded view */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 7,
                      padding: "6px 10px",
                      background: "rgba(255,255,255,0.025)",
                      borderRadius: "var(--radius-sm)",
                      border: `1px solid ${C.border}`,
                    }}>
                      <span style={{ fontSize: 13 }}>👤</span>
                      <div>
                        <span style={{
                          fontFamily: "var(--font-body)", fontSize: 10, color: C.dim,
                        }}>
                          Reported by{" "}
                        </span>
                        <span style={{
                          fontFamily: "var(--font-body)", fontSize: 12,
                          fontWeight: 600, color: C.muted,
                        }}>
                          {inc.reported_by?.name || "System"}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
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
      background: isFire ? "rgba(230,57,70,0.10)" : "rgba(42,157,143,0.08)",
      border: `1px solid ${isFire ? "rgba(230,57,70,0.28)" : "rgba(42,157,143,0.25)"}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 18 }}>{isFire ? "🔥" : "✅"}</span>
        <span style={{
          fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13,
          color: isFire ? C.crimson : C.green,
        }}>
          {result.result}
        </span>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: C.muted, lineHeight: 1.7 }}>
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
// VIDEO TIMELINE — Recharts confidence chart
// ═══════════════════════════════════════════════════════════════════

function VideoTimeline({ result }) {
  const rawData = result.timeline || result.fire_frames || [];

  const chartData = rawData.map((t) => {
    let conf = 0;
    if (typeof t.confidence === "string") {
      conf = parseFloat(t.confidence.replace("%", "")) || 0;
    } else if (typeof t.confidence === "number") {
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
        <StatPill
          label="Frames"
          val={result.total_frames_sampled || result.total_frames_analysed || 0}
          color={C.teal}
        />
        <StatPill
          label="Peak"
          val={result.fire_detected ? "High" : "Low"}
          color={result.fire_detected ? C.crimson : C.green}
        />
        <StatPill
          label="Status"
          val={result.fire_detected ? "FIRE" : "CLEAR"}
          color={result.fire_detected ? C.crimson : C.green}
        />
      </div>

      {chartData.length > 0 && (
        <div style={{
          background: "rgba(0,0,0,0.25)",
          borderRadius: "var(--radius-md)", padding: "10px 4px 6px",
          border: `1px solid ${C.border}`,
        }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 8,
            letterSpacing: 1, color: C.dim,
            paddingLeft: 12, marginBottom: 6, textTransform: "uppercase",
          }}>
            Fire Confidence / Second (%)
          </div>
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={chartData} margin={{ left: 0, right: 6 }}>
              <Tooltip
                contentStyle={{
                  background: C.card, border: `1px solid ${C.borderH}`,
                  borderRadius: 6, fontFamily: "'Space Mono', monospace", fontSize: 9, color: C.text,
                }}
                labelFormatter={(s) => `Frame ${s}`}
                formatter={(v) => [`${v}%`, "Confidence"]}
              />
              <ReferenceLine y={55} stroke="rgba(230,57,70,0.45)" strokeDasharray="4 3" />
              <Line
                type="monotone" dataKey="confidence"
                stroke={C.amber} strokeWidth={2} isAnimationActive={false}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  return payload.fire
                    ? <circle key={`f${cx}`} cx={cx} cy={cy} r={3} fill={C.crimson} />
                    : <circle key={`s${cx}`} cx={cx} cy={cy} r={2} fill={C.teal} />;
                }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 8, color: C.dim,
            paddingLeft: 12, paddingTop: 3,
          }}>
            ● = fire threshold (55%)
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
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: C.dim, letterSpacing: 1 }}>
        {label}:{" "}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color, fontWeight: 700 }}>
        {val}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ADMIN APPROVAL QUEUE
// ═══════════════════════════════════════════════════════════════════

function ApprovalQueue({ incidents, onRefresh, onVerify }) {
  const [loadingId, setLoadingId]   = useState(null);
  const [loadingAct, setLoadingAct] = useState(null);

  const handleVerifyClick = async (id, status) => {
    setLoadingId(id);
    setLoadingAct(status);
    await onVerify(id, status);
    setLoadingId(null);
    setLoadingAct(null);
  };

  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
        <div style={{ textAlign: "center", padding: "36px 0", fontFamily: "var(--font-body)", fontSize: 13, color: C.dim }}>
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
          {/* Header row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
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
            <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: C.muted, marginBottom: 8, lineHeight: 1.5 }}>
              {inc.notes}
            </div>
          )}

          {inc.image_url && (
            <img
              src={inc.image_url} alt="Incident evidence"
              style={{
                width: "100%", height: 110,
                objectFit: "cover", borderRadius: "var(--radius-sm)", marginBottom: 10,
              }}
            />
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="s-btn s-btn-primary"
              style={{
                flex: 1, padding: "9px 0", fontSize: 12,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                opacity: loadingId === inc.id ? 0.72 : 1,
                cursor: loadingId === inc.id ? "not-allowed" : "pointer",
              }}
              disabled={loadingId === inc.id}
              onClick={() => handleVerifyClick(inc.id, "verified")}
            >
              {loadingId === inc.id && loadingAct === "verified"
                ? <><span className="btn-spinner" /> Verifying…</>
                : "✅ Verify & Alert"}
            </button>
            <button
              className="s-btn s-btn-danger"
              style={{
                flex: 1, padding: "9px 0", fontSize: 12,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                opacity: loadingId === inc.id ? 0.72 : 1,
                cursor: loadingId === inc.id ? "not-allowed" : "pointer",
              }}
              disabled={loadingId === inc.id}
              onClick={() => handleVerifyClick(inc.id, "rejected")}
            >
              {loadingId === inc.id && loadingAct === "rejected"
                ? <><span className="btn-spinner" /> Rejecting…</>
                : "❌ Reject"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// REPORT INCIDENT MODAL — public flow, spring-physics animated
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
      const res = await authFetch("/incidents", { method: "POST", body: fd });
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
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 14 }}
        transition={{ type: "spring", stiffness: 340, damping: 30 }}
        style={{
          background: C.card,
          border: `1px solid ${C.borderH}`,
          borderRadius: "var(--radius-xl)", padding: 28,
          width: "100%", maxWidth: 460,
          maxHeight: "90vh", overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
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
            style={{ background: "none", border: "none", color: C.dim, fontSize: 20, cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        {/* Pinned coords chip */}
        {capturedLatLon && (
          <div style={{
            padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: 14,
            background: "rgba(69,123,157,0.08)", border: `1px solid ${C.borderH}`,
            fontFamily: "var(--font-mono)", fontSize: 10, color: C.teal,
          }}>
            📍 Pinned: {capturedLatLon.lat.toFixed(4)}, {capturedLatLon.lon.toFixed(4)}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: "10px 12px", borderRadius: "var(--radius-sm)", marginBottom: 12,
            background: "var(--crimson-dim)", border: "1px solid rgba(230,57,70,0.28)",
            color: C.crimson, fontSize: 12,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 13 }}>
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
              onMouseEnter={e => e.currentTarget.style.background = "rgba(69,123,157,0.07)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(69,123,157,0.03)"}
            >
              <input type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => setImage(e.target.files[0])} />
              {image
                ? <span style={{ fontSize: 12, color: C.teal }}>📎 {image.name}</span>
                : <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 10,
                    color: C.dim, textTransform: "uppercase",
                  }}>
                    + Attach Photo
                  </span>
              }
            </label>
          </div>
          <button
            className="s-btn s-btn-primary"
            type="submit" disabled={loading}
            style={{
              padding: "13px 0", fontSize: 13,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              opacity: loading ? 0.72 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? (
              <><span className="btn-spinner" /> Submitting…</>
            ) : (
              "Submit for Review →"
            )}
          </button>
        </form>
      </motion.div>
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
      background: "rgba(9,16,28,0.94)",
      backdropFilter: "blur(18px)",
      WebkitBackdropFilter: "blur(18px)",
      border: `1px solid ${C.borderH}`,
      borderRadius: 99, padding: "7px 14px",
      display: "flex", gap: 3, zIndex: 1000,
      boxShadow: "0 8px 32px rgba(0,0,0,0.50)",
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

      <div style={{ width: 1, background: C.border, margin: "4px 4px" }} />

      <button
        onClick={() => setShowSafeZones(v => !v)}
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

/** MonoLabel — uppercase Space Mono category label */
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

/** SectionDivider — horizontal rule with centred label */
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

/** aqiLabel — plain-English AQI category */
function aqiLabel(aqi) {
  if (aqi <= 50)  return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Sensitive";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very Unhealthy";
  return "Hazardous";
}

/** ShieldLogo — enterprise shield replacing the neon hexagon */
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
