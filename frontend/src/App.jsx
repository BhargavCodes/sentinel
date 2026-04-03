// App.jsx — Sentinel  |  Enterprise Disaster Command Platform
// Theme: Military-grade enterprise (Palantir / FEMA aesthetic)
// Colors: Slate-navy backgrounds, Crimson alerts, Amber warnings,
//         Operational Teal, Safe Green. Zero neon. Zero cyberpunk.
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Landing   from "./Landing";
import { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage } from "./Auth";
import Dashboard from "./Dashboard";
import Analytics from "./Analytics";
import Profile   from "./Profile";

// ─────────────────────────────────────────────
// AUTH CONTEXT
// ─────────────────────────────────────────────

export const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export const API_BASE = "http://127.0.0.1:8000";

export function authFetch(url, options = {}) {
  const token = localStorage.getItem("sentinel_token");
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${API_BASE}${url}`, { ...options, headers });
}

function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("sentinel_token");
    const name  = localStorage.getItem("sentinel_name");
    const role  = localStorage.getItem("sentinel_role");
    if (token && name && role) setUser({ token, name, role });
    setLoading(false);
  }, []);

  const login = useCallback((token, name, role) => {
    localStorage.setItem("sentinel_token", token);
    localStorage.setItem("sentinel_name",  name);
    localStorage.setItem("sentinel_role",  role);
    setUser({ token, name, role });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("sentinel_token");
    localStorage.removeItem("sentinel_name");
    localStorage.removeItem("sentinel_role");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─────────────────────────────────────────────
// ROUTE GUARDS
// ─────────────────────────────────────────────

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user)   return <Navigate to="/login" replace />;
  return children;
}

function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (user)    return <Navigate to="/dashboard" replace />;
  return children;
}

function FullPageLoader() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0B1320",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ textAlign: "center" }}>
        <div className="s-spinner" />
        <p style={{
          color: "#457B9D",
          fontFamily: "'Space Mono', monospace",
          marginTop: 18, letterSpacing: 3, fontSize: 11,
          textTransform: "uppercase",
        }}>
          Sentinel — Initialising
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ROOT APP
// Analytics is a PUBLIC route — no auth required
// ─────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <GlobalStyles />
        <Routes>
          {/* Public */}
          <Route path="/"                element={<Landing />} />

          {/* Guest-only (redirect if already logged in) */}
          <Route path="/login"           element={<GuestRoute><LoginPage /></GuestRoute>} />
          <Route path="/register"        element={<GuestRoute><RegisterPage /></GuestRoute>} />

          {/* Password reset — always accessible (token is the guard) */}
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password"  element={<ResetPasswordPage />} />

          {/* Analytics — PUBLIC: unauthenticated users see the transparency report */}
          <Route path="/analytics"       element={<Analytics />} />

          {/* Protected */}
          <Route path="/dashboard"       element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/profile"         element={<PrivateRoute><Profile /></PrivateRoute>} />

          {/* Catch-all */}
          <Route path="*"                element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// GLOBAL STYLES
//
// THEME: "Enterprise Disaster Command"
// Inspired by Palantir Gotham, FEMA operational dashboards, and high-stakes
// military C2 software. No neon. No glitchy effects. Every visual choice
// communicates authority, clarity, and trust.
//
// Palette:
//   Background void:   #0B1320  (deep navy-slate)
//   Background raised: #111C2D  (slightly lighter panel layer)
//   Background card:   #162237  (content card surface)
//   Primary accent:    #457B9D  (Operational Teal — links, active states)
//   Alert/danger:      #E63946  (Emergency Crimson — fire, critical)
//   Warning:           #F4A261  (Amber — moderate threats, pending)
//   Safe/success:      #2A9D8F  (Safe Green — verified, clear status)
//   Text primary:      #F0F4F8  (near-white, cool)
//   Text secondary:    #8AABB8  (muted steel blue)
//   Text dim:          #4A6A7A  (very muted)
//   Border subtle:     rgba(69,123,157,0.15)
//   Border active:     rgba(69,123,157,0.40)
// ─────────────────────────────────────────────────────────────────────────
function GlobalStyles() {
  useEffect(() => {
    const existing = document.getElementById("sentinel-global-styles");
    if (existing) existing.remove();

    const style = document.createElement("style");
    style.id = "sentinel-global-styles";
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap');

      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      /* ══════════════════════════════════════════
         DESIGN TOKENS
         ══════════════════════════════════════════ */
      :root {
        /* Backgrounds */
        --bg-void:    #0B1320;
        --bg-deep:    #111C2D;
        --bg-card:    #162237;
        --bg-raised:  #1A2840;

        /* Borders */
        --border:     rgba(69, 123, 157, 0.15);
        --border-hot: rgba(69, 123, 157, 0.40);
        --border-dim: rgba(69, 123, 157, 0.08);

        /* Accents */
        --teal:       #457B9D;
        --teal-dim:   rgba(69, 123, 157, 0.15);
        --teal-glow:  rgba(69, 123, 157, 0.08);

        --crimson:    #E63946;
        --crimson-dim:rgba(230, 57, 70, 0.15);

        --amber:      #F4A261;
        --amber-dim:  rgba(244, 162, 97, 0.15);

        --green:      #2A9D8F;
        --green-dim:  rgba(42, 157, 143, 0.15);

        /* Aliases for legacy component refs */
        --accent:     var(--teal);
        --accent-dim: var(--teal-dim);
        --alert:      var(--crimson);
        --alert-dim:  var(--crimson-dim);
        --warn:       var(--amber);
        --warn-dim:   var(--amber-dim);

        /* Text */
        --text-primary: #F0F4F8;
        --text-muted:   #8AABB8;
        --text-dim:     #4A6A7A;

        /* Typography */
        --font-display: 'DM Sans', 'Inter', sans-serif;
        --font-body:    'DM Sans', 'Inter', sans-serif;
        --font-mono:    'Space Mono', 'Courier New', monospace;

        /* Radius */
        --radius-sm: 6px;
        --radius-md: 8px;
        --radius-lg: 12px;
        --radius-xl: 16px;
      }

      html { scroll-behavior: smooth; }

      body {
        background: var(--bg-void);
        color: var(--text-primary);
        font-family: var(--font-body);
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        overflow-x: hidden;
      }

      /* ══════════════════════════════════════════
         SCROLLBAR — enterprise dark
         ══════════════════════════════════════════ */
      ::-webkit-scrollbar       { width: 5px; height: 5px; }
      ::-webkit-scrollbar-track { background: var(--bg-void); }
      ::-webkit-scrollbar-thumb { background: var(--border-hot); border-radius: 99px; }

      /* ══════════════════════════════════════════
         BUTTONS
         ══════════════════════════════════════════ */
      .s-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        padding: 9px 20px;
        border-radius: var(--radius-md);
        font-family: var(--font-body);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: background 0.18s, color 0.18s, box-shadow 0.18s, transform 0.12s;
        white-space: nowrap;
        text-decoration: none;
      }
      .s-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
        pointer-events: none;
      }

      /* Primary — operational teal */
      .s-btn-primary {
        background: var(--teal);
        color: #fff;
      }
      .s-btn-primary:hover {
        background: #5591b4;
        box-shadow: 0 0 18px rgba(69,123,157,0.35);
      }

      /* Ghost — outline variant */
      .s-btn-ghost {
        background: transparent;
        color: var(--text-muted);
        border: 1px solid var(--border-hot);
      }
      .s-btn-ghost:hover {
        color: var(--text-primary);
        border-color: var(--teal);
        background: var(--teal-glow);
      }

      /* Danger — crimson */
      .s-btn-danger {
        background: var(--crimson);
        color: #fff;
      }
      .s-btn-danger:hover {
        background: #f04550;
        box-shadow: 0 0 18px rgba(230,57,70,0.35);
      }

      /* Success */
      .s-btn-success {
        background: var(--green);
        color: #fff;
      }
      .s-btn-success:hover {
        background: #33b5a6;
        box-shadow: 0 0 18px rgba(42,157,143,0.35);
      }

      /* ══════════════════════════════════════════
         SPINNER
         ══════════════════════════════════════════ */
      .s-spinner {
        width: 28px; height: 28px;
        border: 2.5px solid var(--border);
        border-top-color: var(--teal);
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
        margin: 0 auto;
      }
      @keyframes spin { to { transform: rotate(360deg); } }

      /* ══════════════════════════════════════════
         FORM INPUTS
         ══════════════════════════════════════════ */
      .s-input {
        display: block;
        width: 100%;
        padding: 10px 13px;
        background: var(--bg-raised);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        color: var(--text-primary);
        font-family: var(--font-body);
        font-size: 14px;
        outline: none;
        transition: border-color 0.18s, box-shadow 0.18s;
        appearance: none;
      }
      .s-input:focus {
        border-color: var(--teal);
        box-shadow: 0 0 0 3px rgba(69,123,157,0.12);
      }
      .s-input::placeholder { color: var(--text-dim); }
      .s-input option { background: var(--bg-card); color: var(--text-primary); }

      .s-label {
        display: block;
        font-family: var(--font-body);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.4px;
        text-transform: uppercase;
        color: var(--text-muted);
        margin-bottom: 5px;
      }

      /* ══════════════════════════════════════════
         CARDS
         ══════════════════════════════════════════ */
      .s-card {
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: 20px;
      }

      /* ══════════════════════════════════════════
         BACKGROUNDS & DECORATIVE
         ══════════════════════════════════════════ */
      .grid-bg {
        background-image:
          linear-gradient(rgba(69,123,157,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(69,123,157,0.04) 1px, transparent 1px);
        background-size: 48px 48px;
      }

      .scan-line {
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent 0%, var(--teal) 50%, transparent 100%);
        animation: scan-move 4s ease-in-out infinite;
        opacity: 0.35;
        pointer-events: none;
      }
      @keyframes scan-move {
        0%   { top: 0%;   opacity: 0; }
        8%   { opacity: 0.35; }
        92%  { opacity: 0.35; }
        100% { top: 100%; opacity: 0; }
      }

      /* ══════════════════════════════════════════
         ANIMATIONS
         ══════════════════════════════════════════ */
      .fade-up {
        opacity: 0;
        transform: translateY(20px);
        animation: fade-up-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
      }
      .fade-up-delay-1 { animation-delay: 0.08s; }
      .fade-up-delay-2 { animation-delay: 0.16s; }
      .fade-up-delay-3 { animation-delay: 0.24s; }
      .fade-up-delay-4 { animation-delay: 0.32s; }
      @keyframes fade-up-in {
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes status-pulse {
        0%, 100% { opacity: 1;   transform: scale(1); }
        50%       { opacity: 0.6; transform: scale(0.85); }
      }

      @keyframes float {
        0%, 100% { transform: translateY(0); }
        50%       { transform: translateY(-8px); }
      }

      /* ══════════════════════════════════════════
         PULSING LEAFLET MAP MARKERS
         ══════════════════════════════════════════ */
      .pulse-marker {
        position: relative;
        width: 16px; height: 16px;
      }
      .pulse-marker::before {
        content: '';
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        width: 10px; height: 10px;
        border-radius: 50%;
        z-index: 2;
      }
      .pulse-marker::after {
        content: '';
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%) scale(1);
        width: 16px; height: 16px;
        border-radius: 50%;
        opacity: 0.7;
        animation: marker-pulse 2.2s ease-out infinite;
        z-index: 1;
      }
      @keyframes marker-pulse {
        0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.7; }
        100% { transform: translate(-50%,-50%) scale(3.8); opacity: 0;   }
      }

      .pulse-red::before    { background: #E63946; box-shadow: 0 0 7px #E63946; }
      .pulse-red::after     { background: #E63946; }
      .pulse-orange::before { background: #F4A261; box-shadow: 0 0 7px #F4A261; }
      .pulse-orange::after  { background: #F4A261; }
      .pulse-blue::before   { background: #457B9D; box-shadow: 0 0 7px #457B9D; }
      .pulse-blue::after    { background: #457B9D; }
      .pulse-green::before  { background: #2A9D8F; box-shadow: 0 0 7px #2A9D8F; }
      .pulse-green::after   { background: #2A9D8F; animation-duration: 3.2s; }

      /* ══════════════════════════════════════════
         LEAFLET POPUP OVERRIDES
         ══════════════════════════════════════════ */
      .leaflet-container { font-family: var(--font-body) !important; }
      .leaflet-popup-content-wrapper {
        background: var(--bg-card) !important;
        border: 1px solid var(--border-hot) !important;
        border-radius: var(--radius-lg) !important;
        color: var(--text-primary) !important;
        box-shadow: 0 8px 32px rgba(0,0,0,0.55) !important;
      }
      .leaflet-popup-tip { background: var(--bg-card) !important; }
      .leaflet-popup-content {
        margin: 12px 16px !important;
        font-size: 13px;
        line-height: 1.6;
        color: var(--text-primary);
      }

      /* ══════════════════════════════════════════
         TYPOGRAPHY HELPERS
         ══════════════════════════════════════════ */
      .mono { font-family: var(--font-mono) !important; }
      .text-crimson { color: var(--crimson) !important; }
      .text-amber   { color: var(--amber)   !important; }
      .text-teal    { color: var(--teal)    !important; }
      .text-green   { color: var(--green)   !important; }
      .text-muted   { color: var(--text-muted) !important; }
      .text-dim     { color: var(--text-dim)   !important; }

      /* ══════════════════════════════════════════
         STATUS BADGE
         ══════════════════════════════════════════ */
      .status-dot {
        display: inline-block;
        width: 7px; height: 7px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .status-dot.live  { background: var(--green);   box-shadow: 0 0 6px var(--green);   animation: status-pulse 2.4s ease infinite; }
      .status-dot.alert { background: var(--crimson); box-shadow: 0 0 6px var(--crimson);  animation: status-pulse 1.2s ease infinite; }
      .status-dot.warn  { background: var(--amber);   box-shadow: 0 0 6px var(--amber);   animation: status-pulse 1.8s ease infinite; }
      .status-dot.idle  { background: var(--text-dim); }

      /* ══════════════════════════════════════════
         DIVIDER
         ══════════════════════════════════════════ */
      .s-divider {
        height: 1px;
        background: var(--border);
        margin: 0;
      }

      /* ══════════════════════════════════════════
         RECHARTS TOOLTIP — enterprise dark
         ══════════════════════════════════════════ */
      .sentinel-chart-tooltip {
        background: var(--bg-card) !important;
        border: 1px solid var(--border-hot) !important;
        border-radius: var(--radius-md) !important;
        padding: 10px 14px !important;
        font-family: var(--font-mono) !important;
        font-size: 11px !important;
        color: var(--text-primary) !important;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4) !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById("sentinel-global-styles");
      if (el) el.remove();
    };
  }, []);
  return null;
}