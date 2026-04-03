// Landing.jsx — Sentinel  |  Enterprise Disaster Command Platform
//
// v2 Updates:
//   - TopNav: smooth-scroll anchor links, logo scrolls to top,
//     auth-aware user dropdown (Profile / Dashboard / Logout)
//   - Hero: auth-aware CTAs, "Welcome back" greeting for logged-in users
//   - Final CTA: auth-aware buttons, removes Sign In when logged in
//   - Section id anchors: tech-stack, capabilities, architecture, status

import React, { useEffect, useRef, useState } from "react";
import { useNavigate }                         from "react-router-dom";
import {
  motion,
  useScroll,
  useTransform,
  useInView,
  AnimatePresence,
} from "framer-motion";
import { useAuth } from "./App";

// ─────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────
const T = {
  crimson: "#E63946",
  amber:   "#F4A261",
  teal:    "#457B9D",
  green:   "#2A9D8F",
  slate:   "#5A8499",
  navy:    "#0B1320",
  panel:   "#111C2D",
  card:    "#162237",
  text:    "#F0F4F8",
  muted:   "#8AABB8",
  dim:     "#4A6A7A",
  border:  "rgba(69,123,157,0.15)",
  borderH: "rgba(69,123,157,0.40)",
};

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────
const STATS = [
  { value: "150 km", label: "Seismic Radius",    tag: "USGS" },
  { value: "M 4.5+", label: "Mag Threshold",     tag: "FILTER" },
  { value: "< 2s",   label: "Fire Detection",    tag: "AI" },
  { value: "99.9%",  label: "Uptime SLA",        tag: "OPS" },
];

const TECH_STACK = [
  {
    name:  "MobileNetV2",
    role:  "Fire Detection AI",
    desc:  "6-stage heuristic pre-filter eliminates false positives before the MobileNetV2 inference gate. Sunset penalty, smoke pattern, spatial clustering.",
    color: T.crimson,
    icon:  "🔥",
  },
  {
    name:  "OpenCV",
    role:  "Video Processing",
    desc:  "cv2.VideoCapture extracts exactly 1 frame per second from .mp4 drone feeds. Each frame is scored independently and returned as a confidence timeline.",
    color: T.amber,
    icon:  "🎥",
  },
  {
    name:  "FastAPI",
    role:  "Backend Engine",
    desc:  "Async Python backend with JWT RBAC, Supabase integration, USGS seismic polling, SendGrid + Twilio alert dispatch, and Haversine proximity math.",
    color: T.teal,
    icon:  "⚡",
  },
  {
    name:  "Supabase",
    role:  "PostgreSQL Database",
    desc:  "Row-level incident lifecycle tracking. Users, incidents, and alert_log tables. All RBAC enforced at the FastAPI layer — no client-side trust.",
    color: T.green,
    icon:  "🗄️",
  },
];

const FEATURES = [
  {
    icon:   "🔥",
    tag:    "AI · MobileNetV2",
    title:  "Aerial Fire Detection",
    body:   "MobileNetV2 aerial analysis with a 6-stage heuristic pre-filter. Sunset penalty eliminates false positives before the ML gate. Smoke, texture, spatial clustering.",
    accent: T.crimson,
    dim:    "rgba(230,57,70,0.07)",
    border: "rgba(230,57,70,0.22)",
  },
  {
    icon:   "🌍",
    tag:    "SEISMIC · USGS Live",
    title:  "Seismic Intelligence",
    body:   "USGS live feed cross-referenced to 150 km proximity at Mag > 4.5. Zero noise — only actionable threats surface. User-centric messages, not raw USGS strings.",
    accent: T.amber,
    dim:    "rgba(244,162,97,0.07)",
    border: "rgba(244,162,97,0.22)",
  },
  {
    icon:   "📡",
    tag:    "ALERTS · Twilio · SendGrid",
    title:  "Targeted Alert Dispatch",
    body:   "Twilio SMS + SendGrid email dispatched exclusively to users registered in the affected city. Precision targeting over broadcast. Full delivery audit log.",
    accent: T.teal,
    dim:    "rgba(69,123,157,0.07)",
    border: "rgba(69,123,157,0.22)",
  },
  {
    icon:   "👥",
    tag:    "CROWDSOURCE · Verify",
    title:  "Field Incident Reports",
    body:   "Public operators submit geotagged incidents from the field. GPS auto-detect fills the city field. Two-tier admin verification gates every alert before dispatch.",
    accent: T.green,
    dim:    "rgba(42,157,143,0.07)",
    border: "rgba(42,157,143,0.22)",
  },
  {
    icon:   "📊",
    tag:    "ANALYTICS · Public",
    title:  "Transparency Analytics",
    body:   "Incident counts by type, severity, and month. Alert delivery telemetry. Publicly accessible — no login required. Radar threat profiling for command decisions.",
    accent: T.teal,
    dim:    "rgba(69,123,157,0.07)",
    border: "rgba(69,123,157,0.22)",
  },
  {
    icon:   "🛰️",
    tag:    "VIDEO · OpenCV",
    title:  "Drone Video Engine",
    body:   "Feed raw .mp4 footage. OpenCV samples 1 frame/second. The AI scores each frame independently and returns a full risk timeline chart with threshold markers.",
    accent: T.amber,
    dim:    "rgba(244,162,97,0.07)",
    border: "rgba(244,162,97,0.22)",
  },
];

const PIPELINE = [
  { id: "01", label: "Incident Detected",  sub: "Image · Video · Crowd Report",      color: T.crimson },
  { id: "02", label: "AI Analysis",        sub: "MobileNetV2 + Heuristic Filter",    color: T.amber   },
  { id: "03", label: "Admin Verification", sub: "Two-tier trust gate",               color: T.teal    },
  { id: "04", label: "Targeted Dispatch",  sub: "SMS + Email → affected city only",  color: T.green   },
];

const TICKER_ITEMS = [
  "SEISMIC FEED LIVE",
  "MobileNetV2 ARMED",
  "USGS SYNC: NOMINAL",
  "ALERT ENGINE: READY",
  "AQI SENSORS: ONLINE",
  "OpenCV ANALYSIS: ACTIVE",
  "SUPABASE CONNECTED",
  "JWT AUTH: HS256",
  "TWILIO SMS: READY",
  "SENDGRID EMAIL: ARMED",
  "FASTAPI: RUNNING",
];

// ─────────────────────────────────────────────────────────────
// ANIMATION VARIANTS
// ─────────────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } },
};

const stagger = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.09, delayChildren: 0.04 } },
};

const staggerFast = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.06 } },
};

// ─────────────────────────────────────────────────────────────
// SMOOTH SCROLL HELPER
// ─────────────────────────────────────────────────────────────
function scrollToId(id) {
  if (id === "top") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ─────────────────────────────────────────────────────────────
// ROOT COMPONENT
// ─────────────────────────────────────────────────────────────
export default function Landing() {
  const navigate            = useNavigate();
  const { user }            = useAuth();
  const canvasRef           = useRef(null);
  const heroRef             = useRef(null);
  const [scrolled, setScrolled] = useState(false);

  const { scrollYProgress }  = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY                = useTransform(scrollYProgress, [0, 1], ["0%", "22%"]);
  const heroOpacity          = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 56);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Particle canvas — enterprise palette: muted teal dots
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;

    const resize = () => {
      canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    const W = () => canvas.offsetWidth;
    const H = () => canvas.offsetHeight;

    const makeDot = () => ({
      x:     Math.random() * W(),
      y:     Math.random() * H(),
      vx:    (Math.random() - 0.5) * 0.22,
      vy:    (Math.random() - 0.5) * 0.22,
      r:     Math.random() * 1.2 + 0.4,
      alpha: Math.random() * 0.18 + 0.05,
    });

    const dots = Array.from({ length: 70 }, makeDot);

    const draw = () => {
      ctx.clearRect(0, 0, W(), H());
      dots.forEach((d) => {
        d.x += d.vx; d.y += d.vy;
        if (d.x < 0) d.x = W(); if (d.x > W()) d.x = 0;
        if (d.y < 0) d.y = H(); if (d.y > H()) d.y = 0;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(69,123,157,${d.alpha})`;
        ctx.fill();
      });
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const dx = dots[i].x - dots[j].x;
          const dy = dots[i].y - dots[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 110) {
            ctx.beginPath();
            ctx.moveTo(dots[i].x, dots[i].y);
            ctx.lineTo(dots[j].x, dots[j].y);
            ctx.strokeStyle = `rgba(69,123,157,${0.06 * (1 - dist / 110)})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <div style={{ background: T.navy, minHeight: "100vh", overflowX: "hidden" }}>

      {/* ══ NAV ══ */}
      <TopNav scrolled={scrolled} navigate={navigate} user={user} />

      {/* ══ HERO ══ */}
      <section ref={heroRef} style={{
        position: "relative", minHeight: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden", paddingTop: 64,
      }}>
        <canvas ref={canvasRef} style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%", pointerEvents: "none",
        }} />

        {/* Subtle grid */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `
            linear-gradient(rgba(69,123,157,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(69,123,157,0.04) 1px, transparent 1px)`,
          backgroundSize: "52px 52px",
          pointerEvents: "none",
        }} />

        {/* Radial glows */}
        <motion.div style={{
          position: "absolute", top: "25%", left: "50%",
          translateX: "-50%", translateY: "-50%",
          width: 800, height: 800, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(69,123,157,0.06) 0%, transparent 65%)",
          pointerEvents: "none", y: heroY,
        }} />
        <motion.div style={{
          position: "absolute", top: "12%", right: "-8%",
          width: 460, height: 460, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(230,57,70,0.04) 0%, transparent 65%)",
          pointerEvents: "none", y: heroY,
        }} />

        {/* Hero content */}
        <motion.div style={{
          position: "relative", zIndex: 1,
          textAlign: "center", maxWidth: 900, padding: "0 28px",
          y: heroY, opacity: heroOpacity,
        }}>

          {/* Live badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 9,
              background: "rgba(69,123,157,0.10)",
              border: `1px solid ${T.borderH}`,
              borderRadius: 99,
              padding: "6px 16px 6px 10px",
              marginBottom: 20,
            }}
          >
            <LivePulse color={T.green} />
            <span style={{
              fontFamily: "'Space Mono', monospace", fontSize: 9,
              letterSpacing: 2.5, color: T.teal, textTransform: "uppercase",
            }}>
              System Operational
            </span>
          </motion.div>

          {/* ── AUTH-AWARE: Welcome back greeting ── */}
          <AnimatePresence>
            {user && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 8, marginBottom: 18,
                }}
              >
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: T.green, boxShadow: `0 0 6px ${T.green}`,
                }} />
                <span style={{
                  fontFamily: "'Space Mono', monospace", fontSize: 10,
                  letterSpacing: 2, color: T.green, textTransform: "uppercase",
                }}>
                  Welcome back, {user.name}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Headline */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            style={{ marginBottom: 10 }}
          >
            <div style={{
              fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
              fontSize: "clamp(2.6rem, 6vw, 5rem)",
              lineHeight: 1.05, letterSpacing: "-1px",
              display: "flex", flexWrap: "wrap",
              justifyContent: "center", gap: "0 0.2em",
              marginBottom: "0.06em",
            }}>
              {["Disaster", "Response"].map((w) => (
                <motion.span key={w} variants={fadeUp} style={{ display: "inline-block", color: T.text }}>
                  {w}
                </motion.span>
              ))}
            </div>
            <div style={{
              fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
              fontSize: "clamp(2.6rem, 6vw, 5rem)",
              lineHeight: 1.05, letterSpacing: "-1px",
              display: "flex", flexWrap: "wrap",
              justifyContent: "center", gap: "0 0.2em",
            }}>
              {["Command", "Platform"].map((w) => (
                <motion.span
                  key={w}
                  variants={fadeUp}
                  style={{
                    display: "inline-block",
                    WebkitTextStroke: `1.5px rgba(69,123,157,0.65)`,
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {w}
                </motion.span>
              ))}
            </div>
          </motion.div>

          {/* Sub-headline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{
              color: T.muted, fontSize: 16,
              lineHeight: 1.75, maxWidth: 540,
              margin: "22px auto 36px", fontWeight: 400,
            }}
          >
            AI-powered fire detection, seismic proximity analysis, and precision
            citizen alerts — built for India's emergency response operators.
          </motion.p>

          {/* ── AUTH-AWARE CTA BUTTONS ── */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.55 }}
            style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}
          >
            {user ? (
              /* Logged-in state: Dashboard CTA only (no Login button) */
              <motion.button
                className="s-btn s-btn-primary"
                style={{ padding: "13px 36px", fontSize: 14, position: "relative", overflow: "hidden" }}
                onClick={() => navigate("/dashboard")}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
              >
                <ShimmerOverlay />
                Go to Command Dashboard →
              </motion.button>
            ) : (
              /* Guest state: Register + Login */
              <>
                <motion.button
                  className="s-btn s-btn-primary"
                  style={{ padding: "13px 36px", fontSize: 14, position: "relative", overflow: "hidden" }}
                  onClick={() => navigate("/register")}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <ShimmerOverlay />
                  Deploy Now →
                </motion.button>
                <motion.button
                  className="s-btn s-btn-ghost"
                  style={{ padding: "13px 32px", fontSize: 14 }}
                  onClick={() => navigate("/login")}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  Operator Login
                </motion.button>
              </>
            )}

            {/* Metrics — always visible */}
            <motion.button
              style={{
                padding: "13px 28px", fontSize: 13,
                background: "transparent",
                border: `1px solid rgba(42,157,143,0.35)`,
                borderRadius: "var(--radius-md)",
                color: T.green,
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.18s",
                display: "flex", alignItems: "center", gap: 7,
              }}
              onClick={() => navigate("/analytics")}
              whileHover={{ scale: 1.03, borderColor: T.green, background: "rgba(42,157,143,0.08)" }}
              whileTap={{ scale: 0.97 }}
            >
              <span style={{ fontSize: 15 }}>📊</span>
              View Live System Metrics
            </motion.button>
          </motion.div>

          {/* Stat row */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            style={{
              display: "flex", flexWrap: "wrap",
              justifyContent: "center",
              marginTop: 52,
              borderTop: `1px solid ${T.border}`,
              borderBottom: `1px solid ${T.border}`,
            }}
          >
            {STATS.map((s, i) => (
              <StatCell key={i} s={s} i={i} />
            ))}
          </motion.div>
        </motion.div>

        {/* Scroll cue */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.35 }}
          transition={{ delay: 2.2, duration: 1 }}
          style={{
            position: "absolute", bottom: 28, left: "50%",
            transform: "translateX(-50%)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          }}
        >
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, letterSpacing: 3, color: T.dim, textTransform: "uppercase" }}>
            Scroll
          </span>
          <motion.div
            animate={{ scaleY: [1, 0.35, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            style={{
              width: 1, height: 36,
              background: `linear-gradient(${T.teal}, transparent)`,
              transformOrigin: "top",
            }}
          />
        </motion.div>
      </section>

      {/* ══ TICKER ══ */}
      <StatusTicker />

      {/* ══ TECH STACK ══ — id anchor */}
      <TechStackSection />

      {/* ══ CAPABILITY MATRIX ══ — id anchor */}
      <CapabilityMatrix navigate={navigate} user={user} />

      {/* ══ PIPELINE ══ — id anchor */}
      <ThreatPipeline />

      {/* ══ LIVE STATUS ══ — id anchor */}
      <LiveStatusSection />

      {/* ══ FINAL CTA ══ */}
      <FinalCTA navigate={navigate} user={user} />

      {/* ══ FOOTER ══ */}
      <SiteFooter />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TOP NAV  — v2: anchor links + auth-aware user dropdown
// ─────────────────────────────────────────────────────────────
function TopNav({ scrolled, navigate, user }) {
  const { logout } = useAuth();
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const NAV_LINKS = [
    { label: "Tech Stack",    id: "tech-stack"   },
    { label: "Capabilities",  id: "capabilities" },
    { label: "Architecture",  id: "architecture" },
    { label: "Status",        id: "status"       },
  ];

  return (
    <motion.nav
      initial={{ y: -72, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 999,
        padding: "0 36px", height: 62,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: scrolled ? "rgba(11,19,32,0.96)" : "transparent",
        backdropFilter: scrolled ? "blur(22px)" : "none",
        borderBottom: scrolled ? `1px solid ${T.border}` : "none",
        transition: "background 0.3s, border 0.3s, backdrop-filter 0.3s",
      }}
    >
      {/* Logo — clicks to smooth-scroll top */}
      <motion.div
        onClick={() => scrollToId("top")}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
      >
        <ShieldLogo size={26} />
        <div>
          <div style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
            fontSize: 15, letterSpacing: 3, color: T.text,
          }}>
            SENTINEL
          </div>
          <div style={{
            fontFamily: "'Space Mono', monospace", fontSize: 7,
            letterSpacing: 2, color: T.teal, marginTop: -1,
          }}>
            DISASTER RESPONSE
          </div>
        </div>
      </motion.div>

      {/* Centre anchor links */}
      <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
        {NAV_LINKS.map((link) => (
          <motion.button
            key={link.id}
            onClick={() => scrollToId(link.id)}
            style={{
              background: "transparent", border: "none",
              color: T.dim, fontFamily: "'DM Sans', sans-serif",
              fontSize: 12, fontWeight: 500, cursor: "pointer",
              padding: "5px 11px", borderRadius: "var(--radius-sm)",
              letterSpacing: 0.2,
            }}
            whileHover={{ color: T.text }}
          >
            {link.label}
          </motion.button>
        ))}
      </div>

      {/* Right: Metrics + auth actions */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {/* Metrics — always visible */}
        <motion.button
          style={{
            background: "transparent", border: "none",
            color: T.muted, fontFamily: "'DM Sans', sans-serif",
            fontSize: 13, fontWeight: 500, cursor: "pointer",
            padding: "5px 10px", borderRadius: "var(--radius-sm)",
          }}
          onClick={() => navigate("/analytics")}
          whileHover={{ color: T.text }}
        >
          Metrics
        </motion.button>

        {user ? (
          /* ── Logged-in: User dropdown ── */
          <div ref={dropRef} style={{ position: "relative" }}>
            <motion.button
              onClick={() => setDropOpen((v) => !v)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "rgba(69,123,157,0.10)",
                border: `1px solid ${dropOpen ? T.teal : T.border}`,
                borderRadius: "var(--radius-md)",
                padding: "6px 12px 6px 9px",
                cursor: "pointer",
                transition: "border-color 0.2s",
              }}
            >
              {/* Avatar circle */}
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                background: `linear-gradient(135deg, ${T.teal}55, ${T.teal}22)`,
                border: `1px solid ${T.teal}55`,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <span style={{
                  fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
                  fontSize: 11, color: T.teal,
                }}>
                  {user.name?.[0]?.toUpperCase() ?? "O"}
                </span>
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                  fontWeight: 600, color: T.text,
                  maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {user.name}
                </div>
                <div style={{
                  fontFamily: "'Space Mono', monospace", fontSize: 7,
                  letterSpacing: 1.5, color: T.teal, textTransform: "uppercase",
                }}>
                  {user.role}
                </div>
              </div>
              {/* Chevron */}
              <svg
                width="10" height="10" viewBox="0 0 10 10" fill="none"
                style={{
                  transform: dropOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s", flexShrink: 0,
                }}
              >
                <path d="M2 3.5L5 6.5L8 3.5" stroke={T.muted} strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </motion.button>

            {/* Dropdown panel */}
            <AnimatePresence>
              {dropOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0,  scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    position: "absolute", top: "calc(100% + 8px)", right: 0,
                    width: 188,
                    background: T.card,
                    border: `1px solid ${T.borderH}`,
                    borderRadius: "var(--radius-md)",
                    boxShadow: "0 12px 36px rgba(0,0,0,0.55)",
                    overflow: "hidden",
                    zIndex: 1000,
                  }}
                >
                  {/* User info header */}
                  <div style={{
                    padding: "12px 14px 10px",
                    borderBottom: `1px solid ${T.border}`,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.text, fontFamily: "'DM Sans', sans-serif" }}>
                      {user.name}
                    </div>
                    <div style={{
                      fontFamily: "'Space Mono', monospace", fontSize: 8,
                      letterSpacing: 1.5, color: T.teal, textTransform: "uppercase", marginTop: 2,
                    }}>
                      {user.role} operator
                    </div>
                  </div>

                  {/* Menu items */}
                  {[
                    { label: "My Profile",  icon: "👤", action: () => { setDropOpen(false); navigate("/profile"); } },
                    { label: "Dashboard",   icon: "🛡️", action: () => { setDropOpen(false); navigate("/dashboard"); } },
                  ].map((item) => (
                    <DropdownItem key={item.label} {...item} />
                  ))}

                  <div style={{ height: 1, background: T.border, margin: "4px 0" }} />

                  {/* Logout */}
                  <DropdownItem
                    label="Sign Out"
                    icon="↩"
                    danger
                    action={() => {
                      setDropOpen(false);
                      logout();
                      navigate("/");
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          /* ── Guest: Login + Register ── */
          <>
            <motion.button
              className="s-btn s-btn-ghost"
              onClick={() => navigate("/login")}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              Login
            </motion.button>
            <motion.button
              className="s-btn s-btn-primary"
              onClick={() => navigate("/register")}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              Get Started
            </motion.button>
          </>
        )}
      </div>
    </motion.nav>
  );
}

function DropdownItem({ label, icon, action, danger = false }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={action}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 9,
        padding: "9px 14px", background: hov
          ? danger ? "rgba(230,57,70,0.08)" : "rgba(69,123,157,0.08)"
          : "transparent",
        border: "none", cursor: "pointer", textAlign: "left",
        transition: "background 0.15s",
      }}
    >
      <span style={{ fontSize: 13 }}>{icon}</span>
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
// STAT CELL
// ─────────────────────────────────────────────────────────────
function StatCell({ s, i }) {
  return (
    <motion.div
      variants={fadeUp}
      style={{
        flex: 1, minWidth: 120, textAlign: "center",
        padding: "20px 18px",
        borderRight: i < STATS.length - 1 ? `1px solid ${T.border}` : "none",
      }}
    >
      <div style={{
        fontFamily: "'Space Mono', monospace", fontSize: 8,
        letterSpacing: 2, color: T.teal, marginBottom: 6,
      }}>
        {s.tag}
      </div>
      <div style={{
        fontFamily: "'Space Mono', monospace", fontWeight: 700,
        fontSize: 26, color: T.text,
      }}>
        {s.value}
      </div>
      <div style={{
        fontFamily: "'Space Mono', monospace", fontSize: 9,
        letterSpacing: 1.5, color: T.dim, marginTop: 5,
        textTransform: "uppercase",
      }}>
        {s.label}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// STATUS TICKER
// ─────────────────────────────────────────────────────────────
function StatusTicker() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div style={{
      borderTop: `1px solid ${T.border}`,
      borderBottom: `1px solid ${T.border}`,
      background: "rgba(69,123,157,0.025)",
      overflow: "hidden", padding: "9px 0",
    }}>
      <motion.div
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 32, repeat: Infinity, ease: "linear" }}
        style={{ display: "flex", whiteSpace: "nowrap" }}
      >
        {items.map((item, i) => (
          <span key={i} style={{
            fontFamily: "'Space Mono', monospace", fontSize: 9,
            letterSpacing: 2.5, color: T.dim,
            padding: "0 28px",
            borderRight: `1px solid ${T.border}`,
            display: "inline-flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ color: T.teal, opacity: 0.5 }}>▸</span>
            {item}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TECH STACK SECTION  — id="tech-stack"
// ─────────────────────────────────────────────────────────────
function TechStackSection() {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section id="tech-stack" ref={ref} style={{
      padding: "100px 36px",
      maxWidth: 1280, margin: "0 auto",
    }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
        style={{ textAlign: "center", marginBottom: 60 }}
      >
        <SectionTag label="Technology Stack" />
        <h2 style={{
          fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
          fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)",
          color: T.text, marginBottom: 14, letterSpacing: "-0.3px",
        }}>
          Built on Battle-Tested Infrastructure
        </h2>
        <p style={{
          color: T.muted, fontSize: 15, maxWidth: 520,
          margin: "0 auto", lineHeight: 1.7,
        }}>
          Every component chosen for reliability in high-stakes environments.
          No abstractions that hide the critical path.
        </p>
      </motion.div>

      <motion.div
        variants={stagger}
        initial="hidden"
        animate={inView ? "show" : "hidden"}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        {TECH_STACK.map((tech, i) => (
          <TechCard key={i} tech={tech} />
        ))}
      </motion.div>
    </section>
  );
}

function TechCard({ tech }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div
      variants={fadeUp}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      style={{
        background: hovered ? T.card : "rgba(22,34,55,0.6)",
        border: `1px solid ${hovered ? tech.color + "44" : T.border}`,
        borderRadius: "var(--radius-lg)",
        padding: "26px 24px",
        transition: "background 0.25s, border-color 0.25s",
        position: "relative", overflow: "hidden",
      }}
    >
      <div style={{
        position: "absolute", top: 0, right: 0,
        width: 60, height: 60,
        background: `radial-gradient(circle at top right, ${tech.color}18, transparent 70%)`,
        opacity: hovered ? 1 : 0,
        transition: "opacity 0.3s",
        pointerEvents: "none",
      }} />
      <div style={{ fontSize: 28, marginBottom: 14 }}>{tech.icon}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
        <h3 style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 14, color: tech.color }}>
          {tech.name}
        </h3>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, letterSpacing: 1.5, color: T.dim, textTransform: "uppercase" }}>
          {tech.role}
        </span>
      </div>
      <p style={{ color: T.muted, fontSize: 13, lineHeight: 1.65 }}>{tech.desc}</p>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// CAPABILITY MATRIX  — id="capabilities"
// ─────────────────────────────────────────────────────────────
function CapabilityMatrix({ navigate, user }) {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section id="capabilities" ref={ref} style={{
      padding: "80px 36px 100px",
      background: T.panel,
      borderTop: `1px solid ${T.border}`,
      borderBottom: `1px solid ${T.border}`,
    }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          style={{ textAlign: "center", marginBottom: 60 }}
        >
          <SectionTag label="Capability Matrix" />
          <h2 style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
            fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)",
            color: T.text, letterSpacing: "-0.3px",
          }}>
            Six Pillars of Sentinel
          </h2>
          <p style={{
            color: T.muted, fontSize: 15, maxWidth: 480,
            margin: "14px auto 0", lineHeight: 1.7,
          }}>
            Every module battle-tested for India's threat landscape.
            Zero configuration. Immediate deployment.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          animate={inView ? "show" : "hidden"}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 1,
            background: T.border,
            border: `1px solid ${T.border}`,
            borderRadius: "var(--radius-xl)",
            overflow: "hidden",
          }}
        >
          {FEATURES.map((f, i) => (
            <FeatureCard key={i} f={f} />
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.7 }}
          style={{ marginTop: 36, textAlign: "center", display: "flex", justifyContent: "center", gap: 12 }}
        >
          <motion.button
            className="s-btn s-btn-ghost"
            style={{ padding: "11px 30px", fontSize: 13 }}
            onClick={() => user ? navigate("/dashboard") : navigate("/register")}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
          >
            {user ? "Open Command Dashboard →" : "Explore All Features →"}
          </motion.button>
          <motion.button
            style={{
              padding: "11px 26px", fontSize: 13,
              background: "transparent",
              border: `1px solid rgba(42,157,143,0.30)`,
              borderRadius: "var(--radius-md)",
              color: T.green, cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
            }}
            onClick={() => navigate("/analytics")}
            whileHover={{ scale: 1.04, borderColor: T.green }}
            whileTap={{ scale: 0.97 }}
          >
            📊 View Platform Metrics
          </motion.button>
        </motion.div>
      </div>
    </section>
  );
}

function FeatureCard({ f }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div
      variants={fadeUp}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      style={{
        padding: "36px 30px",
        background: hovered ? f.dim : T.card,
        position: "relative", overflow: "hidden",
        transition: "background 0.25s",
        cursor: "default",
      }}
    >
      <motion.div
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        style={{
          position: "absolute", inset: 0,
          border: `1px solid ${f.border}`,
          pointerEvents: "none",
        }}
      />
      <motion.div
        animate={{ scaleX: hovered ? 1 : 0, opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${f.accent}, transparent)`,
          transformOrigin: "left",
        }}
      />
      <div style={{
        fontFamily: "'Space Mono', monospace", fontSize: 8,
        letterSpacing: 2, color: f.accent, opacity: 0.75,
        marginBottom: 14, textTransform: "uppercase",
      }}>
        {f.tag}
      </div>
      <div style={{ fontSize: 30, marginBottom: 12 }}>{f.icon}</div>
      <h3 style={{
        fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
        fontSize: 17, color: T.text, marginBottom: 10,
      }}>
        {f.title}
      </h3>
      <p style={{ color: T.muted, fontSize: 13, lineHeight: 1.7 }}>{f.body}</p>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// THREAT PIPELINE  — id="architecture"
// ─────────────────────────────────────────────────────────────
function ThreatPipeline() {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section id="architecture" ref={ref} style={{
      padding: "100px 36px",
      maxWidth: 1280, margin: "0 auto",
    }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          style={{ textAlign: "center", marginBottom: 64 }}
        >
          <SectionTag label="Threat Pipeline" />
          <h2 style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
            fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)",
            color: T.text, letterSpacing: "-0.3px",
          }}>
            Detection to Dispatch — 4 Steps
          </h2>
          <p style={{
            color: T.muted, fontSize: 15, maxWidth: 480,
            margin: "14px auto 0", lineHeight: 1.7,
          }}>
            Every threat follows a deterministic path from raw input to verified alert.
            No ambiguity. No uncontrolled broadcasts.
          </p>
        </motion.div>

        <div style={{ display: "flex", gap: 40, alignItems: "flex-start", justifyContent: "center", flexWrap: "wrap" }}>
          {/* Animated connector line */}
          <div style={{ position: "relative", width: 2, flexShrink: 0, alignSelf: "stretch", minHeight: 260 }}>
            <div style={{
              position: "absolute", inset: 0,
              background: `linear-gradient(${T.border}, ${T.border})`,
            }} />
            <svg
              width="2"
              height="100%"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
              preserveAspectRatio="none"
            >
              <motion.line
                x1="1" y1="0" x2="1" y2="100%"
                stroke="url(#pg)"
                strokeWidth="2"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={inView ? { pathLength: 1, opacity: 1 } : {}}
                transition={{ duration: 1.8, delay: 0.3, ease: "easeInOut" }}
              />
              <defs>
                <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={T.crimson} />
                  <stop offset="33%"  stopColor={T.amber}   />
                  <stop offset="66%"  stopColor={T.teal}    />
                  <stop offset="100%" stopColor={T.green}   />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 0, position: "relative" }}>
            {PIPELINE.map((s, i) => (
              <PipelineStep key={i} s={s} i={i} inView={inView} last={i === PIPELINE.length - 1} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PipelineStep({ s, i, inView, last }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, x: 28 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.6, delay: 0.2 + i * 0.18, ease: [0.22, 1, 0.36, 1] }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "flex-start",
        gap: 18, paddingBottom: last ? 0 : 30,
        position: "relative", zIndex: 1,
      }}
    >
      <motion.div
        animate={{
          boxShadow: hovered ? `0 0 18px ${s.color}50` : "none",
          borderColor: hovered ? s.color : `${s.color}44`,
          scale: hovered ? 1.08 : 1,
        }}
        transition={{ duration: 0.25 }}
        style={{
          width: 44, height: 44, borderRadius: 10,
          background: `${s.color}14`,
          border: `1.5px solid ${s.color}44`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700, color: s.color }}>
          {s.id}
        </span>
      </motion.div>

      <div style={{ paddingTop: 4 }}>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16, color: T.text, marginBottom: 3 }}>
          {s.label}
        </div>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: T.muted, letterSpacing: 0.4 }}>
          {s.sub}
        </div>
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{
                marginTop: 7,
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 10px",
                background: `${s.color}14`,
                border: `1px solid ${s.color}38`,
                borderRadius: 99,
              }}
            >
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, boxShadow: `0 0 4px ${s.color}` }} />
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, letterSpacing: 1.5, color: s.color }}>
                STEP {s.id} ACTIVE
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// LIVE SYSTEM STATUS  — id="status"
// ─────────────────────────────────────────────────────────────
function LiveStatusSection() {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  const systems = [
    { name: "MobileNetV2 Fire Engine",    status: "Operational",  color: T.green   },
    { name: "USGS Seismic Feed",          status: "Live",         color: T.green   },
    { name: "OpenCV Video Processing",    status: "Standby",      color: T.teal    },
    { name: "Twilio SMS Gateway",         status: "Operational",  color: T.green   },
    { name: "SendGrid Email Engine",      status: "Operational",  color: T.green   },
    { name: "FastAPI Backend",            status: "Operational",  color: T.green   },
    { name: "Supabase PostgreSQL",        status: "Connected",    color: T.green   },
    { name: "JWT Auth (HS256)",           status: "Secure",       color: T.green   },
  ];

  return (
    <section id="status" ref={ref} style={{
      padding: "80px 36px",
      background: T.panel,
      borderTop: `1px solid ${T.border}`,
      borderBottom: `1px solid ${T.border}`,
    }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          style={{ textAlign: "center", marginBottom: 44 }}
        >
          <SectionTag label="System Health" />
          <h2 style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
            fontSize: "clamp(1.7rem, 3vw, 2.4rem)",
            color: T.text, marginBottom: 12, letterSpacing: "-0.3px",
          }}>
            All Systems Nominal
          </h2>
          <p style={{ color: T.muted, fontSize: 14 }}>
            Live infrastructure status across all platform components.
          </p>
        </motion.div>

        <motion.div
          variants={staggerFast}
          initial="hidden"
          animate={inView ? "show" : "hidden"}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
          }}
        >
          {systems.map((sys, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              style={{
                background: T.card,
                border: `1px solid ${T.border}`,
                borderRadius: "var(--radius-md)",
                padding: "14px 16px",
                display: "flex", alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 13, color: T.muted, fontFamily: "'DM Sans', sans-serif" }}>
                {sys.name}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <motion.div
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 2.2 + i * 0.3, repeat: Infinity, ease: "easeInOut" }}
                  style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: sys.color, boxShadow: `0 0 5px ${sys.color}`,
                  }}
                />
                <span style={{
                  fontFamily: "'Space Mono', monospace", fontSize: 8,
                  letterSpacing: 1, color: sys.color, textTransform: "uppercase",
                }}>
                  {sys.status}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// FINAL CTA  — auth-aware
// ─────────────────────────────────────────────────────────────
function FinalCTA({ navigate, user }) {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-70px" });

  return (
    <section ref={ref} style={{
      padding: "120px 36px",
      textAlign: "center",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        width: 700, height: 700, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(69,123,157,0.05) 0%, transparent 65%)",
        pointerEvents: "none",
      }} />

      <motion.div
        initial={{ opacity: 0, y: 36 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: "relative", zIndex: 1 }}
      >
        <SectionTag label="Ready to Deploy" />

        <h2 style={{
          fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
          fontSize: "clamp(2rem, 4.5vw, 3.8rem)",
          marginBottom: 18, color: T.text,
          letterSpacing: "-0.5px", lineHeight: 1.12,
        }}>
          Your Command Center<br />
          <span style={{
            WebkitTextStroke: `1.5px rgba(69,123,157,0.55)`,
            WebkitTextFillColor: "transparent",
          }}>
            Awaits Activation
          </span>
        </h2>

        <p style={{
          color: T.muted, maxWidth: 440,
          margin: "0 auto 40px", fontSize: 15, lineHeight: 1.75,
        }}>
          {user
            ? `Welcome back, ${user.name}. Your platform is live and ready.`
            : "Join the operators protecting India's cities with AI-powered disaster intelligence. Free to deploy."
          }
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 48 }}>
          {/* ── AUTH-AWARE primary CTA ── */}
          <motion.button
            className="s-btn s-btn-primary"
            style={{ padding: "14px 44px", fontSize: 14, position: "relative", overflow: "hidden" }}
            onClick={() => user ? navigate("/dashboard") : navigate("/register")}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
          >
            <ShimmerOverlay />
            {user ? "Go to Command Dashboard →" : "Activate Sentinel →"}
          </motion.button>

          {/* ── Only show Sign In button for guests ── */}
          {!user && (
            <motion.button
              className="s-btn s-btn-ghost"
              style={{ padding: "14px 30px", fontSize: 14 }}
              onClick={() => navigate("/login")}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              Already Deployed? Sign In
            </motion.button>
          )}

          {/* Metrics — always */}
          <motion.button
            style={{
              padding: "14px 26px", fontSize: 13,
              background: "transparent",
              border: `1px solid rgba(42,157,143,0.32)`,
              borderRadius: "var(--radius-md)",
              color: T.green, cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 500,
              display: "flex", alignItems: "center", gap: 7,
            }}
            onClick={() => navigate("/analytics")}
            whileHover={{ scale: 1.04, borderColor: T.green }}
            whileTap={{ scale: 0.97 }}
          >
            📊 View Live Metrics
          </motion.button>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.5, duration: 0.8 }}
          style={{ display: "flex", gap: 28, justifyContent: "center", flexWrap: "wrap" }}
        >
          {[
            "✦ JWT Role-Based Access",
            "✦ bcrypt Password Hashing",
            "✦ End-to-End Audit Log",
            "✦ 99.9% SLA",
          ].map((item, i) => (
            <span key={i} style={{
              fontFamily: "'Space Mono', monospace", fontSize: 9,
              letterSpacing: 1.5, color: T.dim,
            }}>
              {item}
            </span>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────────────────────
function SiteFooter() {
  return (
    <footer style={{
      borderTop: `1px solid ${T.border}`,
      padding: "24px 36px",
      background: T.panel,
      display: "flex", justifyContent: "space-between",
      alignItems: "center", flexWrap: "wrap", gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <ShieldLogo size={18} />
        <span style={{
          fontFamily: "'Space Mono', monospace", fontSize: 10,
          letterSpacing: 2, color: T.dim,
        }}>
          SENTINEL © 2025
        </span>
      </div>

      <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{
          fontFamily: "'Space Mono', monospace", fontSize: 8,
          letterSpacing: 2, color: T.dim, textTransform: "uppercase",
        }}>
          Final Year Engineering Project
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            style={{
              width: 5, height: 5, borderRadius: "50%",
              background: T.green, boxShadow: `0 0 5px ${T.green}`,
            }}
          />
          <span style={{
            fontFamily: "'Space Mono', monospace", fontSize: 8,
            letterSpacing: 2, color: T.green, textTransform: "uppercase",
          }}>
            All Systems Live
          </span>
        </div>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────
// UTILITY COMPONENTS
// ─────────────────────────────────────────────────────────────

function SectionTag({ label }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <div style={{ width: 20, height: 1, background: T.borderH }} />
      <span style={{
        fontFamily: "'Space Mono', monospace", fontSize: 9,
        letterSpacing: 2.5, color: T.teal, textTransform: "uppercase",
      }}>
        {label}
      </span>
      <div style={{ width: 20, height: 1, background: T.borderH }} />
    </div>
  );
}

function LivePulse({ color = T.green }) {
  return (
    <div style={{ position: "relative", width: 16, height: 16, flexShrink: 0 }}>
      <motion.div
        animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
        transition={{ duration: 1.9, repeat: Infinity, ease: "easeOut" }}
        style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          border: `1.5px solid ${color}`,
        }}
      />
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        width: 7, height: 7, borderRadius: "50%",
        background: color, boxShadow: `0 0 6px ${color}`,
      }} />
    </div>
  );
}

function ShimmerOverlay() {
  return (
    <motion.div
      animate={{ x: ["-100%", "200%"] }}
      transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.2 }}
      style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.14) 50%, transparent 60%)",
        pointerEvents: "none",
      }}
    />
  );
}

function ShieldLogo({ size = 32 }) {
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