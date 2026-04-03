// Auth.jsx — Sentinel  |  Enterprise Auth Pages
// Pages: LoginPage · RegisterPage · ForgotPasswordPage · ResetPasswordPage
//
// Design: "Enterprise Disaster Command" — clean, high-density, authoritative.
// Colors: Teal (#457B9D) accents, Crimson (#E63946) errors,
//         Amber (#F4A261) warnings, Green (#2A9D8F) success.
// Fonts: DM Sans for UI, Space Mono for data/labels.
import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "./App";

import { API_BASE } from './App';

const CITIES = [
  "New Delhi","Mumbai","Bangalore","Hyderabad","Chennai","Kolkata","Pune",
  "Jaipur","Lucknow","Kanpur","Nagpur","Indore","Thane","Bhopal","Visakhapatnam",
  "Patna","Vadodara","Ghaziabad","Ludhiana","Agra","Nashik","Faridabad","Meerut",
  "Rajkot","Varanasi","Srinagar","Aurangabad","Dhanbad","Amritsar","Navi Mumbai",
  "Allahabad","Ranchi","Guwahati","Chandigarh","Mysore","Dehradun","Jammu",
];

// ═══════════════════════════════════════════════════════════════
// SHARED AUTH LAYOUT
// Split-panel: left = branding + system status, right = form
// ═══════════════════════════════════════════════════════════════
function AuthLayout({ children, title, subtitle, switchText, switchLink, switchLabel }) {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-void)",
      display: "flex",
      position: "relative",
      overflow: "hidden",
    }}>

      {/* ── LEFT BRANDING PANEL ── */}
      <div
        className="grid-bg"
        style={{
          flex: "0 0 40%",
          background: "var(--bg-deep)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "56px 52px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div className="scan-line" />

        {/* Logo — click returns to landing */}
        <div
          onClick={() => navigate("/")}
          title="Return to Home"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 52,
            cursor: "pointer",
            width: "fit-content",
          }}
        >
          <SentinelShield size={28} />
          <div>
            <div style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: 3,
              color: "var(--text-primary)",
            }}>
              SENTINEL
            </div>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              letterSpacing: 2,
              color: "var(--teal)",
              marginTop: 1,
            }}>
              DISASTER RESPONSE PLATFORM
            </div>
          </div>
        </div>

        {/* Headline */}
        <div style={{ marginBottom: 40 }}>
          <h1 style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "clamp(1.7rem, 2.5vw, 2.6rem)",
            lineHeight: 1.15,
            color: "var(--text-primary)",
            marginBottom: 14,
            whiteSpace: "pre-line",
          }}>
            {title}
          </h1>
          <p style={{
            color: "var(--text-muted)",
            fontSize: 14,
            lineHeight: 1.65,
            maxWidth: 300,
          }}>
            {subtitle}
          </p>
        </div>

        {/* System status panel */}
        <div style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "16px 18px",
        }}>
          <p style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: 2,
            color: "var(--text-dim)",
            marginBottom: 12,
            textTransform: "uppercase",
          }}>
            System Status
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: "MobileNetV2 Fire Detection", status: "live" },
              { label: "USGS Seismic Feed",          status: "live" },
              { label: "Targeted Alert Engine",      status: "live" },
              { label: "OpenCV Video Processing",    status: "live" },
            ].map((item, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between",
              }}>
                <span style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-body)",
                }}>
                  {item.label}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className={`status-dot ${item.status}`} />
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    letterSpacing: 1,
                    color: "var(--green)",
                    textTransform: "uppercase",
                  }}>
                    Online
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Decorative corner element */}
        <svg
          style={{ position: "absolute", bottom: -1, right: -1, opacity: 0.05 }}
          width="180" height="180" viewBox="0 0 180 180"
        >
          <polygon points="180,0 180,180 0,180" fill="#457B9D" />
        </svg>
      </div>

      {/* ── RIGHT FORM PANEL ── */}
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 36px",
        overflowY: "auto",
      }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          {children}

          {switchText && (
            <p style={{
              textAlign: "center",
              marginTop: 28,
              color: "var(--text-muted)",
              fontSize: 13,
            }}>
              {switchText}{" "}
              <Link
                to={switchLink}
                style={{
                  color: "var(--teal)",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                {switchLabel}
              </Link>
            </p>
          )}
        </div>
      </div>

      {/* Ambient glow */}
      <div style={{
        position: "absolute", right: "18%", top: "28%",
        width: 480, height: 480, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(69,123,157,0.05) 0%, transparent 65%)",
        pointerEvents: "none",
      }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LOGIN PAGE
// ═══════════════════════════════════════════════════════════════
export function LoginPage() {
  const navigate  = useNavigate();
  const { login } = useAuth();

  const [form, setForm]       = useState({ email: "", password: "" });
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Authentication failed.");
      login(data.access_token, data.name, data.role);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={"Operator\nSign In"}
      subtitle="Access your Sentinel command dashboard, live threat feeds, and AI analysis tools."
      switchText="No account?"
      switchLink="/register"
      switchLabel="Register here →"
    >
      <div className="fade-up">
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9, letterSpacing: 3,
            color: "var(--teal)",
            textTransform: "uppercase",
            marginBottom: 6,
          }}>
            Authorised Personnel Only
          </div>
          <h2 style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700, fontSize: 22,
            color: "var(--text-primary)",
          }}>
            Sign In to Sentinel
          </h2>
        </div>

        {error && <AlertBanner type="error" msg={error} />}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <FormField label="Email Address">
            <input
              className="s-input"
              name="email" type="email"
              placeholder="operator@sentinel.gov"
              value={form.email}
              onChange={handleChange}
              required autoComplete="email"
            />
          </FormField>

          <FormField label="Password">
            <input
              className="s-input"
              name="password" type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={handleChange}
              required autoComplete="current-password"
            />
            <div style={{ textAlign: "right", marginTop: 5 }}>
              <Link
                to="/forgot-password"
                style={{
                  fontSize: 12,
                  color: "var(--text-dim)",
                  textDecoration: "none",
                  transition: "color 0.18s",
                }}
                onMouseEnter={e => e.target.style.color = "var(--teal)"}
                onMouseLeave={e => e.target.style.color = "var(--text-dim)"}
              >
                Forgot password?
              </Link>
            </div>
          </FormField>

          <button
            className="s-btn s-btn-primary"
            type="submit"
            disabled={loading}
            style={{ padding: "11px", marginTop: 4, width: "100%", fontSize: 14 }}
          >
            {loading ? "Authenticating…" : "Sign In →"}
          </button>
        </form>

        {/* Demo credentials */}
        <div style={{
          marginTop: 20, padding: "12px 14px",
          background: "var(--teal-dim)",
          border: "1px solid var(--border-hot)",
          borderRadius: "var(--radius-md)",
        }}>
          <p style={{
            fontFamily: "var(--font-mono)", fontSize: 9,
            letterSpacing: 1.5, color: "var(--teal)",
            marginBottom: 5, textTransform: "uppercase",
          }}>
            Demo Access
          </p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
            Admin:{" "}
            <code style={{ color: "var(--text-primary)", background: "rgba(255,255,255,0.05)", padding: "1px 5px", borderRadius: 3 }}>
              admin@sentinel.local
            </code>
            <br />
            Update password in Supabase after first login.
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}

// ═══════════════════════════════════════════════════════════════
// REGISTER PAGE  —  includes 📍 Geolocation detect
// ═══════════════════════════════════════════════════════════════
export function RegisterPage() {
  const navigate  = useNavigate();
  const { login } = useAuth();

  const [form, setForm] = useState({
    name: "", email: "", phone: "",
    password: "", confirmPassword: "", target_city: "",
  });
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg]     = useState({ type: "", text: "" });

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  // ── Geolocation: detect city via browser GPS + backend weather API ──
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setLocMsg({ type: "error", text: "Geolocation is not supported by your browser." });
      return;
    }
    setLocating(true);
    setLocMsg({ type: "", text: "" });

    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude, longitude } }) => {
        try {
          // WeatherAPI accepts "lat,lon" strings directly on the /weather/:city endpoint
          const res = await fetch(`${API_BASE}/weather/${latitude},${longitude}`);
          if (!res.ok) throw new Error("Could not resolve your location.");
          const data = await res.json();

          const detectedCity = data?.weather?.location?.name;
          if (!detectedCity) throw new Error("Could not identify your city.");

          // Try to match against our curated city list (case-insensitive)
          const matched = CITIES.find(
            (c) => c.toLowerCase() === detectedCity.toLowerCase()
          );

          if (matched) {
            setForm((prev) => ({ ...prev, target_city: matched }));
            setLocMsg({ type: "success", text: `Location detected: ${matched}` });
          } else {
            // Real city but not in our dropdown — tell user to select manually
            setLocMsg({
              type: "warn",
              text: `Detected "${detectedCity}" — not in our list. Please select manually.`,
            });
          }
        } catch (err) {
          setLocMsg({ type: "error", text: err.message || "Failed to detect city." });
        } finally {
          setLocating(false);
        }
      },
      (geoErr) => {
        setLocating(false);
        const messages = {
          [geoErr.PERMISSION_DENIED]:   "Location access denied. Allow it in your browser settings.",
          [geoErr.POSITION_UNAVAILABLE]:"Location information unavailable. Try again.",
          [geoErr.TIMEOUT]:             "Location request timed out. Try again.",
        };
        setLocMsg({
          type: "error",
          text: messages[geoErr.code] || "Unable to detect location.",
        });
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match."); return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters."); return;
    }
    setLoading(true);
    try {
      const payload = {
        name:        form.name,
        email:       form.email,
        password:    form.password,
        phone:       form.phone || null,
        target_city: form.target_city || null,
      };
      const res = await fetch(`${API_BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Registration failed.");
      login(data.access_token, data.name, data.role);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={"Join the\nResponse Network"}
      subtitle="Create your operator account. You'll receive targeted alerts for your registered city."
      switchText="Already registered?"
      switchLink="/login"
      switchLabel="Sign in →"
    >
      <div className="fade-up">
        <div style={{ marginBottom: 26 }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9,
            letterSpacing: 3, color: "var(--teal)",
            textTransform: "uppercase", marginBottom: 6,
          }}>
            Public Access
          </div>
          <h2 style={{
            fontFamily: "var(--font-display)", fontWeight: 700,
            fontSize: 22, color: "var(--text-primary)",
          }}>
            Create Account
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 5 }}>
            New accounts are assigned{" "}
            <strong style={{ color: "var(--amber)" }}>Public</strong>{" "}
            role. Admins are elevated by system administrators.
          </p>
        </div>

        {error && <AlertBanner type="error" msg={error} />}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <FormField label="Full Name">
            <input
              className="s-input" name="name"
              placeholder="Arjun Sharma"
              value={form.name} onChange={handleChange} required
            />
          </FormField>

          <FormField label="Email Address">
            <input
              className="s-input" name="email" type="email"
              placeholder="you@example.com"
              value={form.email} onChange={handleChange}
              required autoComplete="email"
            />
          </FormField>

          <FormField
            label="Phone Number"
            hint="(for SMS alerts)"
          >
            <input
              className="s-input" name="phone" type="tel"
              placeholder="+919876543210"
              value={form.phone} onChange={handleChange}
            />
          </FormField>

          {/* Target City + Geolocation */}
          <div>
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between", marginBottom: 5,
            }}>
              <label className="s-label" style={{ margin: 0 }}>
                Target City{" "}
                <span style={{ fontWeight: 400, textTransform: "none", color: "var(--text-dim)" }}>
                  (receive alerts)
                </span>
              </label>

              {/* 📍 Detect Location button */}
              <button
                type="button"
                onClick={handleDetectLocation}
                disabled={locating}
                title="Auto-detect your city via GPS"
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "4px 10px",
                  background: locating ? "var(--teal-dim)" : "transparent",
                  border: "1px solid var(--border-hot)",
                  borderRadius: "var(--radius-sm)",
                  cursor: locating ? "wait" : "pointer",
                  color: locating ? "var(--text-muted)" : "var(--teal)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9, letterSpacing: 1,
                  textTransform: "uppercase",
                  transition: "all 0.18s",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {locating ? (
                  <>
                    <span style={{
                      display: "inline-block", width: 8, height: 8,
                      border: "1.5px solid var(--border)",
                      borderTopColor: "var(--teal)",
                      borderRadius: "50%",
                      animation: "s-spin 0.75s linear infinite",
                    }} />
                    Locating…
                  </>
                ) : (
                  <>📍 Detect</>
                )}
              </button>
            </div>

            <select
              className="s-input" name="target_city"
              value={form.target_city} onChange={handleChange}
            >
              <option value="">Select a city…</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            {/* Geo feedback */}
            {locMsg.text && (
              <p style={{
                marginTop: 5, fontSize: 11,
                fontFamily: "var(--font-body)",
                lineHeight: 1.5,
                color: locMsg.type === "success"
                  ? "var(--green)"
                  : locMsg.type === "warn"
                    ? "var(--amber)"
                    : "var(--crimson)",
              }}>
                {locMsg.type === "success" ? "✓" : "⚠"} {locMsg.text}
              </p>
            )}
          </div>

          {/* Password row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="Password">
              <input
                className="s-input" name="password" type="password"
                placeholder="Min 8 chars"
                value={form.password} onChange={handleChange}
                required autoComplete="new-password"
              />
            </FormField>
            <FormField label="Confirm">
              <input
                className="s-input" name="confirmPassword" type="password"
                placeholder="Repeat"
                value={form.confirmPassword} onChange={handleChange}
                required autoComplete="new-password"
              />
            </FormField>
          </div>

          {form.password && <PasswordStrength password={form.password} />}

          <button
            className="s-btn s-btn-primary"
            type="submit" disabled={loading}
            style={{ padding: "11px", marginTop: 4, width: "100%", fontSize: 14 }}
          >
            {loading ? "Creating account…" : "Activate Account →"}
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}

// ═══════════════════════════════════════════════════════════════
// FORGOT PASSWORD PAGE
// ═══════════════════════════════════════════════════════════════
export function ForgotPasswordPage() {
  const [email, setEmail]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Request failed. Please try again.");
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={"Recover\nAccount Access"}
      subtitle="Enter your registered email and we'll send a secure reset link valid for 15 minutes."
      switchText="Remembered your password?"
      switchLink="/login"
      switchLabel="Back to sign in →"
    >
      <div className="fade-up">
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9,
            letterSpacing: 3, color: "var(--amber)",
            textTransform: "uppercase", marginBottom: 6,
          }}>
            Password Recovery
          </div>
          <h2 style={{
            fontFamily: "var(--font-display)", fontWeight: 700,
            fontSize: 22, color: "var(--text-primary)",
          }}>
            Reset Password
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 5 }}>
            We'll send a one-time reset link to your registered email address.
          </p>
        </div>

        {submitted ? (
          // ── SUCCESS STATE ──
          <div style={{
            padding: "28px 24px",
            background: "var(--green-dim)",
            border: "1px solid rgba(42,157,143,0.30)",
            borderRadius: "var(--radius-lg)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 38, marginBottom: 14 }}>📧</div>
            <p style={{
              fontFamily: "var(--font-mono)", fontSize: 10,
              letterSpacing: 2, color: "var(--green)",
              marginBottom: 10, textTransform: "uppercase",
            }}>
              Check Your Inbox
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.65 }}>
              If{" "}
              <strong style={{ color: "var(--text-primary)" }}>{email}</strong>{" "}
              is registered, a reset link has been sent. It expires in{" "}
              <strong style={{ color: "var(--amber)" }}>15 minutes</strong>.
            </p>
            <p style={{ marginTop: 16, fontSize: 12, color: "var(--text-dim)" }}>
              Didn't receive it? Check your spam folder or{" "}
              <span
                onClick={() => { setSubmitted(false); setEmail(""); }}
                style={{ color: "var(--teal)", cursor: "pointer", textDecoration: "underline" }}
              >
                try again
              </span>.
            </p>
          </div>
        ) : (
          <>
            {error && <AlertBanner type="error" msg={error} />}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <FormField label="Registered Email">
                <input
                  className="s-input" type="email"
                  placeholder="operator@sentinel.gov"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required autoComplete="email" autoFocus
                />
              </FormField>

              <button
                className="s-btn s-btn-primary"
                type="submit" disabled={loading}
                style={{ padding: "11px", width: "100%", fontSize: 14 }}
              >
                {loading ? "Sending reset link…" : "Send Reset Link →"}
              </button>
            </form>
          </>
        )}
      </div>
    </AuthLayout>
  );
}

// ═══════════════════════════════════════════════════════════════
// RESET PASSWORD PAGE
// Reads ?token= from the URL, validates + submits new password
// ═══════════════════════════════════════════════════════════════
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Read the token from the query string: /reset-password?token=<JWT>
  const token   = new URLSearchParams(location.search).get("token") || "";
  const noToken = !token.trim();

  const [form, setForm]       = useState({ newPassword: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.newPassword !== form.confirmPassword) {
      setError("Passwords do not match."); return;
    }
    if (form.newPassword.length < 8) {
      setError("Password must be at least 8 characters."); return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: form.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Password reset failed.");
      setSuccess(true);
      // Auto-redirect to /login after 2.8 s
      setTimeout(() => navigate("/login"), 2800);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={"Set New\nPassword"}
      subtitle="Choose a strong new password to secure your Sentinel operator account."
      switchText={null}
      switchLink={null}
      switchLabel={null}
    >
      <div className="fade-up">
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9,
            letterSpacing: 3, color: "var(--teal)",
            textTransform: "uppercase", marginBottom: 6,
          }}>
            Account Security
          </div>
          <h2 style={{
            fontFamily: "var(--font-display)", fontWeight: 700,
            fontSize: 22, color: "var(--text-primary)",
          }}>
            New Password
          </h2>
        </div>

        {/* Missing token error */}
        {noToken && (
          <AlertBanner type="error" msg={
            <>
              This reset link is missing a token. Please click the link in
              your email, or{" "}
              <Link to="/forgot-password" style={{ color: "var(--teal)" }}>
                request a new one
              </Link>.
            </>
          } />
        )}

        {/* Success state */}
        {success && (
          <div style={{
            padding: "28px 24px",
            background: "var(--green-dim)",
            border: "1px solid rgba(42,157,143,0.30)",
            borderRadius: "var(--radius-lg)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 38, marginBottom: 14 }}>✅</div>
            <p style={{
              fontFamily: "var(--font-mono)", fontSize: 10,
              letterSpacing: 2, color: "var(--green)",
              marginBottom: 10, textTransform: "uppercase",
            }}>
              Password Updated
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.65 }}>
              Your password has been changed successfully.
              Redirecting to sign in…
            </p>
          </div>
        )}

        {/* Form (hidden once success or no token) */}
        {!noToken && !success && (
          <>
            {error && <AlertBanner type="error" msg={error} />}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <FormField label="New Password">
                <input
                  className="s-input"
                  name="newPassword" type="password"
                  placeholder="Minimum 8 characters"
                  value={form.newPassword} onChange={handleChange}
                  required autoComplete="new-password" autoFocus
                />
              </FormField>

              <FormField label="Confirm New Password">
                <input
                  className="s-input"
                  name="confirmPassword" type="password"
                  placeholder="Repeat new password"
                  value={form.confirmPassword} onChange={handleChange}
                  required autoComplete="new-password"
                />
              </FormField>

              {form.newPassword && <PasswordStrength password={form.newPassword} />}

              {form.confirmPassword && (
                <p style={{
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  color: form.newPassword === form.confirmPassword
                    ? "var(--green)" : "var(--crimson)",
                }}>
                  {form.newPassword === form.confirmPassword
                    ? "✓ Passwords match"
                    : "✗ Passwords do not match"}
                </p>
              )}

              <button
                className="s-btn s-btn-primary"
                type="submit" disabled={loading}
                style={{ padding: "11px", marginTop: 4, width: "100%", fontSize: 14 }}
              >
                {loading ? "Updating password…" : "Set New Password →"}
              </button>
            </form>

            <p style={{ marginTop: 18, textAlign: "center", fontSize: 12, color: "var(--text-dim)" }}>
              <Link
                to="/forgot-password"
                style={{ color: "var(--text-muted)", textDecoration: "none" }}
              >
                Need a new reset link?
              </Link>
            </p>
          </>
        )}
      </div>
    </AuthLayout>
  );
}

// ═══════════════════════════════════════════════════════════════
// SHARED HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════

/**
 * AlertBanner
 * type: "error" | "warn" | "success"
 * msg: string or JSX
 */
function AlertBanner({ type = "error", msg }) {
  const palette = {
    error:   { bg: "var(--crimson-dim)", border: "rgba(230,57,70,0.30)", text: "var(--crimson)", icon: "⚠" },
    warn:    { bg: "var(--amber-dim)",   border: "rgba(244,162,97,0.30)", text: "var(--amber)",   icon: "⚠" },
    success: { bg: "var(--green-dim)",   border: "rgba(42,157,143,0.30)", text: "var(--green)",   icon: "✓" },
  };
  const p = palette[type] || palette.error;

  return (
    <div style={{
      padding: "11px 14px",
      background: p.bg,
      border: `1px solid ${p.border}`,
      borderRadius: "var(--radius-md)",
      marginBottom: 16,
      display: "flex", gap: 10, alignItems: "flex-start",
    }}>
      <span style={{ color: p.text, flexShrink: 0, fontSize: 14, marginTop: 1 }}>{p.icon}</span>
      <p style={{ color: p.text, fontSize: 13, lineHeight: 1.55 }}>{msg}</p>
    </div>
  );
}

/**
 * FormField — label + optional hint text + children
 */
function FormField({ label, hint, children }) {
  return (
    <div>
      <label className="s-label">
        {label}
        {hint && (
          <span style={{ fontWeight: 400, textTransform: "none", color: "var(--text-dim)", marginLeft: 4 }}>
            {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

/**
 * PasswordStrength — 4-segment bar + criteria dots
 */
function PasswordStrength({ password }) {
  const checks = [
    { label: "8+ chars",  ok: password.length >= 8 },
    { label: "Uppercase", ok: /[A-Z]/.test(password) },
    { label: "Number",    ok: /\d/.test(password) },
    { label: "Symbol",    ok: /[^a-zA-Z0-9]/.test(password) },
  ];
  const score  = checks.filter((c) => c.ok).length;
  const colors = ["var(--crimson)", "var(--amber)", "var(--amber)", "var(--green)"];
  const labels = ["Weak", "Fair", "Good", "Strong"];

  return (
    <div>
      {/* Segment bar */}
      <div style={{ display: "flex", gap: 5, marginBottom: 7 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i < score ? colors[score - 1] : "var(--border)",
            transition: "background 0.25s",
          }} />
        ))}
      </div>
      {/* Criteria + label */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 10 }}>
          {checks.map((c, i) => (
            <span key={i} style={{
              fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 0.4,
              color: c.ok ? "var(--green)" : "var(--text-dim)",
            }}>
              {c.ok ? "✓" : "·"} {c.label}
            </span>
          ))}
        </div>
        {score > 0 && (
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 9,
            color: colors[score - 1], letterSpacing: 1,
            textTransform: "uppercase",
          }}>
            {labels[score - 1]}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * SentinelShield — replaces the hexagon logo with an enterprise shield icon
 * that fits the military/FEMA aesthetic better than the neon hex.
 */
function SentinelShield({ size = 32 }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      {/* Shield outline */}
      <path
        d="M16 2L4 7V16C4 21.5 9.5 26.5 16 30C22.5 26.5 28 21.5 28 16V7L16 2Z"
        stroke="#457B9D"
        strokeWidth="1.5"
        fill="rgba(69,123,157,0.08)"
      />
      {/* Inner detail */}
      <path
        d="M16 6L8 10V16C8 19.8 11.6 23.2 16 25.5C20.4 23.2 24 19.8 24 16V10L16 6Z"
        stroke="#457B9D"
        strokeWidth="0.8"
        fill="rgba(69,123,157,0.05)"
        opacity="0.7"
      />
      {/* Centre dot */}
      <circle cx="16" cy="16" r="2.2" fill="#457B9D" />
    </svg>
  );
}
