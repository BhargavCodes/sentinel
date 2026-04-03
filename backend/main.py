# =============================================================================
# SENTINEL DISASTER MANAGEMENT PLATFORM
# FastAPI Backend — Production Architecture v2.1
#
# Features:
#   - Supabase (PostgreSQL) via supabase-py
#   - JWT Auth with Role-Based Access Control (admin / public)
#   - Dynamic Targeted Alert Engine (Twilio SMS + SendGrid Email)
#   - Refined Seismic Logic (150km / Mag 4.5 threshold)
#   - Live Drone Video Analysis (OpenCV frame extraction)
#   - Crowdsourcing API (submit, verify, reject incidents)
#   - Analytics API (counts by type, severity, month)
#   - Full AQI multi-strategy fallback (preserved from v1)
#   - MobileNetV2 fire detection (preserved from v1)
#   - PDF report generation (preserved from v1)
#   - [v2.1 NEW] Secure Password Reset flow (JWT + SendGrid)
# =============================================================================

from __future__ import annotations

import asyncio
import datetime
import io
import math
import os
import shutil
import tempfile
import uuid
from contextlib import asynccontextmanager
from typing import List, Optional

import bcrypt
import cv2
import httpx
import numpy as np
import tensorflow as tf
from dotenv import load_dotenv
from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Security,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fpdf import FPDF
from jose import JWTError, jwt
from PIL import Image
from pydantic import BaseModel, EmailStr
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from supabase import Client, create_client
from twilio.rest import Client as TwilioClient

# =============================================================================
# ENVIRONMENT & CONFIGURATION
# =============================================================================

load_dotenv()

# --- Core APIs ---
WEATHER_API_KEY: str = os.getenv("WEATHER_API_KEY", "")
WAQI_TOKEN: str = os.getenv("WAQI_TOKEN", "")

# --- Supabase ---
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")

# --- JWT ---
JWT_SECRET: str = os.getenv("JWT_SECRET", "CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_IN_PROD")
JWT_ALGORITHM: str = "HS256"
JWT_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

# Password-reset tokens are short-lived and carry a distinct claim so they
# cannot be replayed as regular access tokens.
PASSWORD_RESET_EXPIRE_MINUTES: int = 15

# --- SendGrid ---
SENDGRID_API_KEY: str = os.getenv("SENDGRID_API_KEY", "")
EMAIL_SENDER: str = os.getenv("EMAIL_SENDER", "")

# --- Twilio ---
TWILIO_SID: str = os.getenv("TWILIO_SID", "")
TWILIO_AUTH_TOKEN: str = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER: str = os.getenv("TWILIO_FROM_NUMBER", "")

# --- Frontend base URL (used in reset-password email link) ---
FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")

# --- Metro city AQI search radius (km) ---
METRO_CITIES_DISTANCE: dict[str, int] = {
    "Mumbai": 150, "Delhi": 150, "Kolkata": 120, "Chennai": 120,
    "Bangalore": 120, "Hyderabad": 120, "Pune": 100, "Ahmedabad": 100,
}

# --- Known WAQI fallback stations ---
KNOWN_AQI_STATIONS: dict[str, list[str]] = {
    "Mumbai": ["Mumbai - Colaba", "Navi Mumbai", "Mumbai - Bandra Kurla Complex"],
    "Delhi": ["Delhi - Anand Vihar", "Delhi - RK Puram", "New Delhi - US Embassy"],
    "Bangalore": ["Bangalore - BWSSB Kadabesanahalli", "Bangalore - BTM Layout"],
    "Kolkata": ["Kolkata - Rabindra Bharati University", "Kolkata - Ballygunge"],
    "Chennai": ["Chennai - Manali", "Chennai - Alandur Bus Depot"],
    "Hyderabad": ["Hyderabad - Sanathnagar", "Hyderabad - Gachibowli"],
    "Pune": ["Pune - Karve Road", "Pune - Bhosari MIDC"],
}

# =============================================================================
# GLOBAL STATE
# =============================================================================

recent_quakes: list[dict] = []
model: tf.keras.Model | None = None
supabase: Client | None = None
security = HTTPBearer()

# =============================================================================
# PYDANTIC SCHEMAS
# =============================================================================


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None
    target_city: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class VerifyIncidentRequest(BaseModel):
    status: str  # "verified" | "rejected"
    notes: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    name: str


# =============================================================================
# DATABASE CLIENT
# =============================================================================


def get_supabase() -> Client:
    """Return the Supabase client. Raises on misconfiguration."""
    if supabase is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database client not initialised.",
        )
    return supabase


# =============================================================================
# JWT UTILITIES & RBAC DEPENDENCIES
# =============================================================================


def create_access_token(payload: dict) -> str:
    """Mint a signed JWT that expires in JWT_EXPIRE_MINUTES."""
    data = payload.copy()
    expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=JWT_EXPIRE_MINUTES)
    data["exp"] = expire
    return jwt.encode(data, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_password_reset_token(user_id: str) -> str:
    """
    Mint a short-lived (15 min) password-reset JWT.

    The token carries a 'type': 'password_reset' claim to prevent it from
    being accepted by any other endpoint that validates access tokens.
    """
    expire = datetime.datetime.utcnow() + datetime.timedelta(
        minutes=PASSWORD_RESET_EXPIRE_MINUTES
    )
    payload = {
        "sub": user_id,
        "type": "password_reset",
        "exp": expire,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and verify a JWT. Raises 401 on any failure."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def decode_password_reset_token(token: str) -> str:
    """
    Verify a password-reset JWT.

    Raises 400 with a user-facing message on any failure so the React page
    can surface it directly.  Returns the user_id (sub) on success.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired. Please request a new one.",
        )

    if payload.get("type") != "password_reset":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid token type.",
        )

    user_id: str = payload.get("sub", "")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed reset token.",
        )

    return user_id


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
    db: Client = Depends(get_supabase),
) -> dict:
    """
    FastAPI dependency — verifies JWT and fetches the full user row
    from Supabase. Attach to any protected endpoint.
    """
    payload = decode_token(credentials.credentials)
    user_id: str = payload.get("sub", "")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing subject.")

    result = db.table("users").select("*").eq("id", user_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="User not found.")
    return result.data


async def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """
    FastAPI dependency — allows access ONLY if the authenticated user's
    role is 'admin'. Returns the user dict on success.
    """
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required for this action.",
        )
    return current_user


# =============================================================================
# ALERT ENGINE — TARGETED DISPATCH (SendGrid + Twilio)
# =============================================================================


def _build_alert_html(
    incident_type: str,
    location: str,
    severity: str,
    confidence: str,
    timestamp: str,
    message: str,
) -> str:
    """Render the HTML body for the SendGrid alert email."""
    color = "#ef4444" if incident_type.lower() == "fire" else "#f59e0b"
    emoji = "🔥" if incident_type.lower() == "fire" else "🌍"
    return f"""
    <html>
    <body style="font-family:'Segoe UI',Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px;">
      <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1);">
        <div style="background:linear-gradient(135deg,{color},#dc2626);color:white;padding:30px 20px;text-align:center;">
          <h1 style="margin:0;font-size:26px;">{emoji} SENTINEL — {incident_type.upper()} ALERT</h1>
          <p style="margin:8px 0 0;opacity:.9;font-size:14px;">Disaster Management System — India</p>
        </div>
        <div style="padding:30px 25px;">
          <div style="background:#fee2e2;border-left:5px solid {color};padding:20px;border-radius:8px;margin-bottom:20px;">
            <h2 style="margin:0 0 8px;color:#dc2626;">⚠️ {message}</h2>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:10px;background:#f9fafb;border-radius:6px;font-weight:700;">📍 Location</td><td style="padding:10px;">{location}</td></tr>
            <tr><td style="padding:10px;font-weight:700;">🚨 Severity</td><td style="padding:10px;color:#dc2626;font-weight:700;">{severity.upper()}</td></tr>
            <tr><td style="padding:10px;background:#f9fafb;border-radius:6px;font-weight:700;">📊 Confidence</td><td style="padding:10px;">{confidence}</td></tr>
            <tr><td style="padding:10px;font-weight:700;">🕒 Detected At</td><td style="padding:10px;">{timestamp}</td></tr>
          </table>
          <div style="background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;padding:20px;margin-top:20px;">
            <h3 style="margin:0 0 10px;color:#92400e;">⚡ Immediate Actions</h3>
            <ul style="margin:0;padding-left:20px;color:#92400e;">
              <li>Alert local emergency services immediately</li>
              <li>Initiate evacuation procedures if necessary</li>
              <li>Monitor live dashboard for situation updates</li>
              <li>Notify all relevant district authorities</li>
            </ul>
          </div>
        </div>
        <div style="text-align:center;padding:20px;background:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#6b7280;font-size:12px;"><strong>Sentinel India</strong> — Automated AI Disaster Alert System</p>
        </div>
      </div>
    </body>
    </html>
    """


def _build_password_reset_html(reset_url: str, user_name: str) -> str:
    """Render the HTML body for the SendGrid password-reset email."""
    return f"""
    <html>
    <body style="font-family:'Segoe UI',Arial,sans-serif;background:#060B14;margin:0;padding:20px;">
      <div style="max-width:560px;margin:0 auto;background:#0F1929;border:1px solid rgba(77,255,180,0.2);
                  border-radius:12px;overflow:hidden;box-shadow:0 4px 40px rgba(0,0,0,0.6);">

        <!-- Header -->
        <div style="background:linear-gradient(135deg,#0A1120,#0F1929);
                    border-bottom:1px solid rgba(77,255,180,0.15);
                    padding:32px 30px;text-align:center;">
          <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:6px;">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <polygon points="16,2 28,9 28,23 16,30 4,23 4,9"
                       stroke="#4DFFB4" stroke-width="1.5" fill="rgba(77,255,180,0.08)"/>
              <circle cx="16" cy="16" r="2.5" fill="#4DFFB4"/>
            </svg>
            <span style="font-size:17px;font-weight:800;letter-spacing:4px;color:#E8F4FF;">
              SENTINEL
            </span>
          </div>
          <p style="margin:0;font-size:11px;letter-spacing:2px;color:#4DFFB4;">
            DISASTER RESPONSE PLATFORM
          </p>
        </div>

        <!-- Body -->
        <div style="padding:36px 30px;">
          <h2 style="margin:0 0 10px;color:#E8F4FF;font-size:22px;">
            🔐 Password Reset Request
          </h2>
          <p style="color:#8AAABB;font-size:15px;line-height:1.65;margin-bottom:24px;">
            Hello <strong style="color:#E8F4FF;">{user_name}</strong>,<br><br>
            We received a request to reset your Sentinel operator password.
            Click the button below to set a new password. This link expires in
            <strong style="color:#FFB84D;">15 minutes</strong>.
          </p>

          <!-- CTA Button -->
          <div style="text-align:center;margin:32px 0;">
            <a href="{reset_url}"
               style="display:inline-block;background:#4DFFB4;color:#060B14;
                      font-weight:700;font-size:13px;letter-spacing:2px;
                      text-decoration:none;padding:14px 36px;border-radius:6px;
                      text-transform:uppercase;">
              RESET PASSWORD →
            </a>
          </div>

          <!-- Security note -->
          <div style="background:rgba(255,184,77,0.08);border:1px solid rgba(255,184,77,0.25);
                      border-radius:8px;padding:16px 18px;margin-top:8px;">
            <p style="margin:0;color:#FFB84D;font-size:12px;line-height:1.6;">
              ⚠️ <strong>Security Notice:</strong> If you did not request a password reset,
              you can safely ignore this email. Your password will remain unchanged.
              Never share this link with anyone.
            </p>
          </div>

          <!-- Fallback URL -->
          <p style="margin-top:24px;color:#5A7A9A;font-size:12px;line-height:1.7;">
            If the button doesn't work, paste this URL into your browser:<br>
            <span style="color:#4DFFB4;word-break:break-all;">{reset_url}</span>
          </p>
        </div>

        <!-- Footer -->
        <div style="text-align:center;padding:18px;
                    border-top:1px solid rgba(77,255,180,0.08);
                    background:rgba(6,11,20,0.4);">
          <p style="margin:0;color:#3A5068;font-size:11px;">
            Sentinel India — Automated AI Disaster Alert System<br>
            This is an automated message. Do not reply.
          </p>
        </div>
      </div>
    </body>
    </html>
    """


async def dispatch_targeted_alerts(
    incident_id: str,
    incident_type: str,
    location: str,
    severity: str,
    confidence: str,
    db: Client,
) -> dict:
    """
    Core Alert Engine.
    1. Queries users whose target_city matches the incident location.
    2. Extracts emails and phone numbers.
    3. Dispatches SendGrid emails and Twilio SMS in parallel.
    4. Logs every dispatch to the alert_log table.

    Returns a summary dict with counts.
    """
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S IST")
    message = f"SENTINEL has detected a {incident_type.upper()} incident in {location}. Immediate attention required."

    # -- 1. Find affected users ------------------------------------------------
    result = (
        db.table("users")
        .select("id, email, phone")
        .ilike("target_city", location)          # case-insensitive city match
        .execute()
    )
    affected_users: list[dict] = result.data or []

    if not affected_users:
        print(f"ℹ️  No users subscribed to city '{location}'. No alerts dispatched.")
        return {"emails_sent": 0, "sms_sent": 0, "recipients": 0}

    emails: list[str] = [u["email"] for u in affected_users if u.get("email")]
    phones: list[str] = [u["phone"] for u in affected_users if u.get("phone")]

    print(f"🎯  Alert targeting {len(affected_users)} user(s) in {location}")
    print(f"   Emails: {emails}")
    print(f"   Phones: {phones}")

    html_body = _build_alert_html(
        incident_type=incident_type,
        location=location,
        severity=severity,
        confidence=confidence,
        timestamp=timestamp,
        message=message,
    )

    alert_rows: list[dict] = []
    emails_sent = 0
    sms_sent = 0

    # -- 2. SendGrid emails ----------------------------------------------------
    if emails and SENDGRID_API_KEY:
        sg = SendGridAPIClient(api_key=SENDGRID_API_KEY)
        subject = f"🚨 SENTINEL ALERT: {incident_type.upper()} in {location}"

        for recipient_email in emails:
            try:
                mail = Mail(
                    from_email=EMAIL_SENDER,
                    to_emails=recipient_email,
                    subject=subject,
                    html_content=html_body,
                )
                response = sg.send(mail)
                provider_id = response.headers.get("X-Message-Id", "unknown")
                alert_rows.append(
                    {
                        "incident_id": incident_id,
                        "channel": "email",
                        "recipient": recipient_email,
                        "status": "sent",
                        "provider_id": provider_id,
                    }
                )
                emails_sent += 1
                print(f"   ✅ Email sent → {recipient_email}")
            except Exception as exc:
                print(f"   ❌ Email failed → {recipient_email}: {exc}")
                alert_rows.append(
                    {
                        "incident_id": incident_id,
                        "channel": "email",
                        "recipient": recipient_email,
                        "status": "failed",
                    }
                )
    else:
        if not SENDGRID_API_KEY:
            print("⚠️  SENDGRID_API_KEY not set — email alerts skipped.")

    # -- 3. Twilio SMS ---------------------------------------------------------
    if phones and all([TWILIO_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER]):
        twilio = TwilioClient(TWILIO_SID, TWILIO_AUTH_TOKEN)
        sms_body = (
            f"🚨 SENTINEL: {incident_type.upper()} detected in {location}. "
            f"Severity: {severity.upper()}. Time: {timestamp}. "
            "Check your Sentinel dashboard immediately."
        )
        # Stay within 160-char SMS limit
        sms_body = sms_body[:157] + "..." if len(sms_body) > 160 else sms_body

        for phone_number in phones:
            try:
                msg = twilio.messages.create(
                    body=sms_body,
                    from_=TWILIO_FROM_NUMBER,
                    to=phone_number,
                )
                alert_rows.append(
                    {
                        "incident_id": incident_id,
                        "channel": "sms",
                        "recipient": phone_number,
                        "status": "sent",
                        "provider_id": msg.sid,
                    }
                )
                sms_sent += 1
                print(f"   ✅ SMS sent → {phone_number} (SID: {msg.sid})")
            except Exception as exc:
                print(f"   ❌ SMS failed → {phone_number}: {exc}")
                alert_rows.append(
                    {
                        "incident_id": incident_id,
                        "channel": "sms",
                        "recipient": phone_number,
                        "status": "failed",
                    }
                )
    else:
        if not all([TWILIO_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER]):
            print("⚠️  Twilio credentials incomplete — SMS alerts skipped.")

    # -- 4. Log to alert_log ---------------------------------------------------
    if alert_rows:
        db.table("alert_log").insert(alert_rows).execute()

    return {
        "emails_sent": emails_sent,
        "sms_sent": sms_sent,
        "recipients": len(affected_users),
    }


# =============================================================================
# AQI — MULTI-STRATEGY FALLBACK (preserved from v1)
# =============================================================================


async def fetch_aqi_with_fallbacks(city_name: str, lat: float, lon: float) -> tuple[int, str]:
    """Multi-strategy AQI fetching: geo → city name → known stations → WeatherAPI."""

    async with httpx.AsyncClient(timeout=10.0) as client:

        # Strategy 1: Geo-location
        try:
            r = await client.get(
                f"https://api.waqi.info/feed/geo:{lat};{lon}/",
                params={"token": WAQI_TOKEN},
            )
            if r.status_code == 200:
                d = r.json()
                if d.get("status") == "ok":
                    aqi = int(d["data"]["aqi"])
                    station = d["data"]["city"]
                    if aqi > 0:
                        print(f"AQI (geo): {aqi} from {station}")
                        return aqi, f"WAQI Geo ({station.get('name', 'nearby')})"
        except Exception as exc:
            print(f"AQI geo strategy failed: {exc}")

        # Strategy 2: City name search
        try:
            r = await client.get(
                f"https://api.waqi.info/feed/{city_name}/",
                params={"token": WAQI_TOKEN},
            )
            if r.status_code == 200:
                d = r.json()
                if d.get("status") == "ok":
                    aqi = int(d["data"]["aqi"])
                    if aqi > 0:
                        print(f"AQI (city name): {aqi}")
                        return aqi, f"WAQI ({city_name})"
        except Exception as exc:
            print(f"AQI city name strategy failed: {exc}")

        # Strategy 3: Known fallback stations
        for station_name in KNOWN_AQI_STATIONS.get(city_name, []):
            try:
                r = await client.get(
                    f"https://api.waqi.info/feed/{station_name}/",
                    params={"token": WAQI_TOKEN},
                )
                if r.status_code == 200:
                    d = r.json()
                    if d.get("status") == "ok":
                        aqi = int(d["data"]["aqi"])
                        if aqi > 0:
                            print(f"AQI (known station '{station_name}'): {aqi}")
                            return aqi, f"WAQI Station ({station_name})"
            except Exception:
                continue

        # Strategy 4: WeatherAPI air_quality field
        try:
            r = await client.get(
                "http://api.weatherapi.com/v1/current.json",
                params={"key": WEATHER_API_KEY, "q": city_name, "aqi": "yes"},
            )
            if r.status_code == 200:
                d = r.json()
                aq = d.get("current", {}).get("air_quality", {})
                # WeatherAPI US EPA index
                epa_index = aq.get("us-epa-index", 0)
                if epa_index and epa_index > 0:
                    # Map EPA category (1–6) to approximate AQI midpoint
                    epa_to_aqi = {1: 25, 2: 75, 3: 125, 4: 175, 5: 250, 6: 350}
                    approx_aqi = epa_to_aqi.get(int(epa_index), 0)
                    if approx_aqi > 0:
                        print(f"AQI (WeatherAPI EPA index {epa_index}): ~{approx_aqi}")
                        return approx_aqi, f"WeatherAPI (EPA index {epa_index})"
        except Exception as exc:
            print(f"AQI WeatherAPI strategy failed: {exc}")

    print(f"⚠️ All AQI strategies failed for {city_name}. Returning 0.")
    return 0, "Unavailable"


# =============================================================================
# HAVERSINE DISTANCE
# =============================================================================


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return the great-circle distance in km between two (lat, lon) points."""
    R = 6371.0
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    Δφ = math.radians(lat2 - lat1)
    Δλ = math.radians(lon2 - lon1)
    a = math.sin(Δφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(Δλ / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# =============================================================================
# FIRE ANALYSIS UTILITIES (preserved from v1)
# =============================================================================


def detect_smoke_pattern(image_pil: Image.Image) -> bool:
    """Return True if the image contains grey/white smoke-like regions."""
    img = np.array(image_pil.convert("RGB"))
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)

    S = hsv[:, :, 1]
    V = hsv[:, :, 2]

    # Smoke: low saturation, medium-high brightness
    smoke_mask = (S < 40) & (V > 100) & (V < 220)
    smoke_ratio = np.count_nonzero(smoke_mask) / smoke_mask.size

    # Texture in smoke region is typically smooth
    std_dev = cv2.Laplacian(gray.astype(np.float32), cv2.CV_32F)
    std_dev = np.abs(std_dev)
    if smoke_ratio > 0.05:
        smoke_texture = float(np.mean(std_dev[smoke_mask]))
        if smoke_texture < 15:
            return True

    return smoke_ratio > 0.12


def is_night_scene(image_pil: Image.Image) -> bool:
    """Return True if the overall brightness suggests a night scene."""
    img = np.array(image_pil.convert("L"))
    return float(np.mean(img)) < 60


def analyze_fire_characteristics(image_pil: Image.Image) -> dict:
    """
    Multi-stage fire analysis pipeline.
    Returns a dict with score, flags, and a confidence_level string.
    """
    img_rgb = np.array(image_pil.convert("RGB"))
    hsv = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2HSV)

    H = hsv[:, :, 0]
    S = hsv[:, :, 1]
    V = hsv[:, :, 2]

    # Stage 1 — colour range
    fire_mask = (
        ((H < 20) | (H > 160)) &
        (S > 100) &
        (V > 100)
    )
    fire_pixel_count = int(np.count_nonzero(fire_mask))
    fire_ratio = fire_pixel_count / fire_mask.size

    # Stage 2 — texture variance
    gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    std_dev = np.abs(cv2.Laplacian(gray, cv2.CV_32F))
    if fire_pixel_count > 0:
        avg_texture_variance = float(np.mean(std_dev[fire_mask]))
    else:
        avg_texture_variance = 0.0
    has_fire_texture = avg_texture_variance > 18

    # Stage 3 — brightness variation
    if fire_pixel_count > 0:
        v_fire = V[fire_mask].astype(np.float32)
        has_brightness_variation = float(np.std(v_fire)) > 25
    else:
        has_brightness_variation = False

    # Stage 4 — saturation
    avg_saturation = float(np.mean(S))
    high_saturation = avg_saturation > 80 or (avg_saturation > 60 and fire_ratio > 0.15)

    # Stage 5 — spatial clustering
    has_fire_clustering = False
    significant_clusters = 0
    if fire_pixel_count > 0:
        fire_uint8 = fire_mask.astype(np.uint8) * 255
        num_labels, _, stats, _ = cv2.connectedComponentsWithStats(
            fire_uint8, connectivity=8
        )
        significant_clusters = sum(
            1 for i in range(1, num_labels) if stats[i, cv2.CC_STAT_AREA] > 50
        )
        has_fire_clustering = 1 <= significant_clusters <= 8

    has_smoke = detect_smoke_pattern(image_pil)
    is_night  = is_night_scene(image_pil)

    # Stage 6 — sunset / smooth-sky penalty
    sunset_penalty    = 0
    is_sunset_pattern = False
    if fire_pixel_count > 100:
        height      = img_rgb.shape[0]
        sky_row_cut = max(1, int(height * 0.30))
        fire_in_sky   = int(np.count_nonzero(fire_mask[:sky_row_cut, :]))
        top_fire_ratio = fire_in_sky / fire_pixel_count
        fire_region_texture = float(np.mean(std_dev[fire_mask]))
        if top_fire_ratio >= 0.60 and fire_region_texture < 25.0:
            sunset_penalty    = 2
            is_sunset_pattern = True

    raw_score = 0
    if fire_ratio > 0.01:          raw_score += 1
    if has_fire_texture:           raw_score += 2
    if has_brightness_variation:   raw_score += 1
    if has_fire_clustering:        raw_score += 3
    if high_saturation:            raw_score += 1
    if has_smoke:                  raw_score += 2
    if is_night and fire_ratio > 0.15: raw_score += 1

    effective_score = max(0, raw_score - sunset_penalty)

    if effective_score >= 8:
        is_likely_fire, confidence_level = True, "HIGH"
    elif effective_score >= 5:
        is_likely_fire, confidence_level = True, "MODERATE"
    elif has_fire_clustering and has_smoke and not is_sunset_pattern:
        is_likely_fire, confidence_level = True, "OVERRIDE"
        effective_score = max(effective_score, 5)
    elif fire_ratio > 0.25 and has_fire_clustering and not is_sunset_pattern:
        is_likely_fire, confidence_level = True, "OVERRIDE"
        effective_score = max(effective_score, 5)
    else:
        is_likely_fire, confidence_level = False, "NOT FIRE"

    return {
        "fire_pixel_ratio":   fire_ratio,
        "has_fire_texture":   has_fire_texture,
        "texture_variance":   avg_texture_variance,
        "has_smoke":          has_smoke,
        "is_night":           is_night,
        "is_sunset_pattern":  is_sunset_pattern,
        "sunset_penalty":     sunset_penalty,
        "raw_score":          raw_score,
        "total_score":        effective_score,
        "max_score":          11,
        "confidence_level":   confidence_level,
        "is_likely_fire":     is_likely_fire,
    }


# =============================================================================
# PDF REPORT (preserved from v1, updated to use Supabase incident data)
# =============================================================================


class PDFReport(FPDF):
    def header(self):
        self.set_font("Arial", "B", 15)
        self.cell(0, 10, "SENTINEL — Situation Report", 0, 1, "C")
        self.ln(8)


def generate_pdf(
    weather: dict,
    seismic: dict | None,
    incidents: list[dict],
    aqi_val: int,
    aqi_source: str,
) -> str:
    pdf = PDFReport()
    pdf.add_page()
    pdf.set_font("Arial", size=12)

    loc = weather.get("location", {})
    current = weather.get("current", {})
    pdf.set_font("Arial", "B", 14)
    pdf.cell(200, 10, f"1. Sector Status: {loc.get('name')}, {loc.get('country')}", 0, 1)
    pdf.set_font("Arial", size=12)
    pdf.cell(200, 10, f"   Temp: {current.get('temp_c')} °C  |  Humidity: {current.get('humidity')}%", 0, 1)
    pdf.cell(200, 10, f"   Air Quality Index (AQI): {aqi_val if aqi_val > 0 else 'N/A'}", 0, 1)
    pdf.cell(200, 10, f"   AQI Source: {aqi_source}", 0, 1)
    pdf.cell(200, 10, f"   Last Updated: {current.get('last_updated', 'N/A')}", 0, 1)
    pdf.ln(5)

    pdf.set_font("Arial", "B", 14)
    pdf.cell(200, 10, "2. Seismic Risk Analysis", 0, 1)
    pdf.set_font("Arial", size=12)
    if seismic:
        pdf.cell(200, 10, f"   STATUS: ELEVATED — {seismic['user_message']}", 0, 1)
        pdf.cell(200, 10, f"   Magnitude: {seismic['magnitude']}  |  Distance: {seismic['distance_km']} km", 0, 1)
    else:
        pdf.cell(200, 10, "   Status: STABLE — No threats within 150 km (M > 4.5)", 0, 1)
    pdf.ln(5)

    pdf.set_font("Arial", "B", 14)
    pdf.cell(200, 10, "3. Recent Verified Incidents", 0, 1)
    pdf.set_font("Arial", size=10)
    for inc in incidents:
        ts = str(inc.get("time", ""))[:19]
        pdf.cell(200, 8, f"   [{ts}]  {inc.get('type','?').upper()}  —  {inc.get('location','?')}  ({inc.get('severity','?')})", 0, 1)

    filename = f"/tmp/sentinel_report_{uuid.uuid4().hex[:8]}.pdf"
    pdf.output(filename)
    return filename


# =============================================================================
# BACKGROUND TASK — USGS EARTHQUAKE FEED
# =============================================================================


async def fetch_global_quakes() -> None:
    """Poll USGS every 60 s for magnitude 2.5+ earthquakes from the past day."""
    global recent_quakes
    url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson"
    while True:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    recent_quakes = resp.json().get("features", [])
                    print(f"🌍 Seismic cache updated: {len(recent_quakes)} earthquakes")
        except Exception as exc:
            print(f"⚠️ USGS fetch failed: {exc}")
        await asyncio.sleep(60)


# =============================================================================
# APP LIFECYCLE
# =============================================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model, supabase

    # --- Supabase client ---
    if SUPABASE_URL and SUPABASE_KEY:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✅ Supabase client initialised.")
    else:
        print("❌ SUPABASE_URL / SUPABASE_KEY missing in .env — DB calls will fail.")

    # --- AI Model ---
    model_paths = [
        ("models/fire_model_enhanced.keras", "Enhanced Keras"),
        ("models/fire_model_enhanced.h5", "Enhanced H5"),
        ("models/fire_model.keras", "Original Keras"),
        ("models/fire_model.h5", "Original H5"),
    ]
    for path, label in model_paths:
        try:
            model = tf.keras.models.load_model(path)
            print(f"✅ {label} loaded from {path}")
            break
        except Exception:
            continue
    if model is None:
        print("❌ No fire detection model found. Run train_model.py first.")

    # --- Background USGS task ---
    task = asyncio.create_task(fetch_global_quakes())
    yield
    task.cancel()


# =============================================================================
# APP INSTANCE
# =============================================================================

app = FastAPI(
    title="Sentinel API",
    version="2.1.0",
    description="Production-grade disaster management backend.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# AUTH ENDPOINTS
# =============================================================================


@app.post("/register", response_model=TokenResponse, tags=["Auth"])
async def register(payload: RegisterRequest, db: Client = Depends(get_supabase)):
    """
    Register a new user (defaults to 'public' role).
    Returns a JWT on success.
    """
    existing = db.table("users").select("id").eq("email", payload.email).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="Email already registered.")

    hashed = bcrypt.hashpw(payload.password.encode(), bcrypt.gensalt(12)).decode()

    new_user = {
        "name": payload.name,
        "email": payload.email,
        "phone": payload.phone,
        "role": "public",
        "target_city": payload.target_city,
        "hashed_password": hashed,
    }
    result = db.table("users").insert(new_user).execute()
    user = result.data[0]

    token = create_access_token({"sub": user["id"], "role": user["role"]})
    return TokenResponse(access_token=token, role=user["role"], name=user["name"])


@app.post("/login", response_model=TokenResponse, tags=["Auth"])
async def login(payload: LoginRequest, db: Client = Depends(get_supabase)):
    """
    Authenticate with email + password.
    Returns a JWT containing the user's id and role.
    """
    result = db.table("users").select("*").eq("email", payload.email).single().execute()
    user = result.data
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials.")

    if not bcrypt.checkpw(payload.password.encode(), user["hashed_password"].encode()):
        raise HTTPException(status_code=401, detail="Invalid credentials.")

    token = create_access_token({"sub": user["id"], "role": user["role"]})
    return TokenResponse(access_token=token, role=user["role"], name=user["name"])


@app.get("/me", tags=["Auth"])
async def me(current_user: dict = Depends(get_current_user)):
    """Return the authenticated user's profile (excluding password hash)."""
    return {k: v for k, v in current_user.items() if k != "hashed_password"}


# =============================================================================
# PASSWORD RESET FLOW  [v2.1 NEW]
# =============================================================================


@app.post("/forgot-password", tags=["Auth"])
async def forgot_password(
    payload: ForgotPasswordRequest,
    db: Client = Depends(get_supabase),
):
    """
    Initiate a password reset.

    - Accepts { "email": "..." }
    - Always returns HTTP 200 with the same message regardless of whether
      the email exists (prevents user enumeration).
    - If the email IS registered, generates a 15-minute password-reset JWT
      and sends a SendGrid email containing the reset link.

    Reset link format:
        {FRONTEND_URL}/reset-password?token=<JWT>
    """
    GENERIC_RESPONSE = {
        "message": (
            "If that email is registered, you will receive a password reset "
            "link within a few minutes."
        )
    }

    # Lookup user — silently succeed if not found
    result = (
        db.table("users")
        .select("id, name, email")
        .eq("email", str(payload.email))
        .execute()
    )
    if not result.data:
        # Do NOT reveal whether the account exists
        return GENERIC_RESPONSE

    user = result.data[0]
    reset_token = create_password_reset_token(user["id"])
    reset_url = f"{FRONTEND_URL}/reset-password?token={reset_token}"

    if not SENDGRID_API_KEY:
        # In development, log the reset URL so engineers can test without email
        print(f"⚠️  SendGrid not configured. Dev reset URL for {user['email']}:")
        print(f"   {reset_url}")
        return GENERIC_RESPONSE

    try:
        sg = SendGridAPIClient(api_key=SENDGRID_API_KEY)
        mail = Mail(
            from_email=EMAIL_SENDER,
            to_emails=user["email"],
            subject="🔐 Sentinel — Password Reset Request",
            html_content=_build_password_reset_html(reset_url, user["name"]),
        )
        sg.send(mail)
        print(f"✅ Password reset email sent to {user['email']}")
    except Exception as exc:
        # Log the error server-side but still return the generic response so
        # the client cannot infer that the send failed (and therefore the
        # account exists).
        print(f"❌ Password reset email failed for {user['email']}: {exc}")

    return GENERIC_RESPONSE


@app.post("/reset-password", tags=["Auth"])
async def reset_password(
    payload: ResetPasswordRequest,
    db: Client = Depends(get_supabase),
):
    """
    Complete a password reset.

    - Accepts { "token": "<JWT>", "new_password": "..." }
    - Verifies the JWT (must have type='password_reset' and be unexpired).
    - Hashes the new password with bcrypt (cost 12).
    - Writes the new hash to the users table in Supabase.
    - Returns HTTP 200 on success.

    Frontend should redirect to /login after success.
    """
    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 8 characters.",
        )

    # Validate the reset token and extract the user ID
    user_id = decode_password_reset_token(payload.token)

    # Confirm the user still exists before writing
    result = db.table("users").select("id").eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User account not found. The reset link may have been invalidated.",
        )

    # Hash the new password and update the record
    new_hash = bcrypt.hashpw(payload.new_password.encode(), bcrypt.gensalt(12)).decode()
    db.table("users").update({"hashed_password": new_hash}).eq("id", user_id).execute()

    print(f"✅ Password successfully reset for user {user_id}")
    return {"message": "Password updated successfully. You can now log in."}


# =============================================================================
# WEATHER / SEISMIC ENDPOINT
# =============================================================================


@app.get("/weather/{city}", tags=["Intelligence"])
async def get_weather(city: str):
    """
    Fetch weather, AQI, and seismic data for a city or lat,lon coordinate.

    Accepts:
      - Named city:      /weather/Mumbai
      - Lat/lon pair:    /weather/19.0760,72.8777

    Seismic logic (REFINED):
    - Only flags 'seismic_risk' when nearest quake is within 150 km AND magnitude > 4.5.
    - Returns a user-centric message instead of the raw USGS place string.
    """
    weather_url = "http://api.weatherapi.com/v1/forecast.json"
    params = {"key": WEATHER_API_KEY, "q": city, "days": 3, "aqi": "no", "alerts": "yes"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(weather_url, params=params)
        if resp.status_code != 200:
            raise HTTPException(status_code=404, detail="City not found.")

        data = resp.json()
        lat: float = data["location"]["lat"]
        lon: float = data["location"]["lon"]
        city_name: str = data["location"]["name"]

        real_aqi, aqi_source = await fetch_aqi_with_fallbacks(city_name, lat, lon)

        # --- REFINED SEISMIC LOGIC ---
        SEISMIC_RADIUS_KM = 150
        SEISMIC_MAG_THRESHOLD = 4.5

        nearest_quake = None
        min_dist = float("inf")

        for quake in recent_quakes:
            q_lon, q_lat, _ = quake["geometry"]["coordinates"]
            dist = haversine(lat, lon, q_lat, q_lon)
            if dist < min_dist:
                min_dist = dist
                magnitude = quake["properties"].get("mag", 0)
                nearest_quake = {
                    "location": quake["properties"]["place"],
                    "magnitude": magnitude,
                    "distance_km": round(dist, 1),
                    "time": quake["properties"]["time"],
                    "coords": [q_lat, q_lon],
                    "user_message": (
                        f"Magnitude {magnitude} Earthquake detected "
                        f"{round(dist, 1)} km from your location."
                    ),
                }

        seismic_risk = None
        if (
            nearest_quake
            and min_dist <= SEISMIC_RADIUS_KM
            and nearest_quake["magnitude"] > SEISMIC_MAG_THRESHOLD
        ):
            seismic_risk = nearest_quake

        return {
            "weather": data,
            "aqi_calculated": real_aqi,
            "aqi_source": aqi_source,
            "seismic_risk": seismic_risk,
        }


# =============================================================================
# FIRE PREDICTION — IMAGE
# =============================================================================


@app.post("/predict-fire", tags=["Intelligence"])
async def predict_fire(
    file: UploadFile = File(...),
    location: str = Form(default="Aerial Drone Sector 4"),
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """
    Run the MobileNetV2 fire detection pipeline on an uploaded image.
    If fire is confirmed, a 'pending' incident is automatically logged.
    Admins can later verify it, which triggers targeted alerts.
    """
    if model is None:
        raise HTTPException(status_code=503, detail="Fire detection model not loaded.")

    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")
    analysis = analyze_fire_characteristics(image)

    max_score = analysis["max_score"]
    score_str = f"{analysis['total_score']}/{max_score}"

    if not analysis["is_likely_fire"]:
        reject_reason = (
            "Sunset/sky-glow pattern suppressed by spatial penalty."
            if analysis["is_sunset_pattern"]
            else "Pre-filter: Natural scene (score too low)."
        )
        return {
            "result": "Safe",
            "severity": "None",
            "confidence": f"{(1 - analysis['fire_pixel_ratio']) * 100:.2f}%",
            "reason": reject_reason,
            "prefilter_score": score_str,
            "sunset_penalty": analysis["sunset_penalty"],
        }

    img_arr = np.expand_dims(np.array(image.resize((224, 224))), axis=0) / 255.0
    ml_score = float(model.predict(img_arr, verbose=0)[0][0])
    ml_conf  = 1.0 - ml_score

    effective_score = analysis["total_score"]
    confidence_level = analysis["confidence_level"]

    if confidence_level == "OVERRIDE":
        ml_threshold = 0.50
    elif effective_score >= 8:
        ml_threshold = 0.40
    elif effective_score >= 6:
        ml_threshold = 0.25
    else:
        ml_threshold = 0.15

    prefilter_weight = min(0.8, 0.5 + (effective_score - 5) * 0.06)
    prefilter_conf   = effective_score / max_score
    combined_conf    = prefilter_conf * prefilter_weight + ml_conf * (1 - prefilter_weight)

    fire_confirmed = (
        ml_score < ml_threshold
        or confidence_level == "OVERRIDE"
    )

    if fire_confirmed:
        confidence_str = f"{combined_conf * 100:.2f}%"
        incident_row = {
            "type": "fire",
            "location": location,
            "severity": "critical",
            "confidence": confidence_str,
            "reported_by": current_user["id"],
            "status": "pending",
        }
        db.table("incidents").insert(incident_row).execute()

        return {
            "result": "FIRE DETECTED",
            "severity": "Critical",
            "confidence": confidence_str,
            "status": "Incident logged as PENDING — awaiting admin verification.",
            "ml_score": f"{ml_conf * 100:.2f}%",
            "prefilter_score": score_str,
            "ml_threshold_used": ml_threshold,
            "confidence_level": confidence_level,
        }

    return {
        "result": "Safe",
        "severity": "None",
        "confidence": f"{(1 - combined_conf) * 100:.2f}%",
        "reason": (
            f"ML model score {ml_conf * 100:.1f}% did not meet strict threshold "
            f"{ml_threshold * 100:.0f}% required for pre-filter score {effective_score}/{max_score}."
        ),
        "prefilter_score": score_str,
        "ml_threshold_used": ml_threshold,
        "confidence_level": confidence_level,
        "sunset_penalty": analysis["sunset_penalty"],
    }


# =============================================================================
# FIRE PREDICTION — DRONE VIDEO
# =============================================================================


@app.post("/analyze-drone", tags=["Intelligence"])
async def analyze_drone(
    file: UploadFile = File(...),
    location: str = Form(default="Drone Surveillance Zone"),
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """
    Extract key frames from a drone video and run fire analysis on each.
    Logs a pending incident if any frame triggers the fire detector.
    """
    if model is None:
        raise HTTPException(status_code=503, detail="Fire detection model not loaded.")

    contents = await file.read()
    tmp_dir = tempfile.mkdtemp()
    tmp_path = os.path.join(tmp_dir, f"drone_{uuid.uuid4().hex}.mp4")

    try:
        with open(tmp_path, "wb") as f:
            f.write(contents)

        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail="Could not open video file.")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        # Sample one frame per second, max 30 frames
        sample_interval = max(1, int(fps))
        max_frames = 30

        frame_results = []
        frame_idx = 0
        sampled = 0

        while cap.isOpened() and sampled < max_frames:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % sample_interval == 0:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                pil_img = Image.fromarray(rgb)
                analysis = analyze_fire_characteristics(pil_img)

                if analysis["is_likely_fire"]:
                    img_arr = np.expand_dims(
                        np.array(pil_img.resize((224, 224))), axis=0
                    ) / 255.0
                    ml_score = float(model.predict(img_arr, verbose=0)[0][0])
                    ml_conf = 1.0 - ml_score
                    effective_score = analysis["total_score"]
                    ml_threshold = 0.40 if effective_score >= 8 else (0.25 if effective_score >= 6 else 0.15)
                    fire_detected = ml_score < ml_threshold or analysis["confidence_level"] == "OVERRIDE"
                else:
                    fire_detected = False
                    ml_conf = 0.0

                frame_results.append({
                    "frame": frame_idx,
                    "fire_detected": fire_detected,
                    "score": analysis["total_score"],
                    "confidence": f"{ml_conf * 100:.1f}%" if fire_detected else "—",
                })
                sampled += 1
            frame_idx += 1

        cap.release()

        fire_frames = [r for r in frame_results if r["fire_detected"]]
        if fire_frames:
            best = max(fire_frames, key=lambda r: r["score"])
            incident_row = {
                "type": "fire",
                "location": location,
                "severity": "critical",
                "confidence": best["confidence"],
                "reported_by": current_user["id"],
                "status": "pending",
            }
            db.table("incidents").insert(incident_row).execute()

        return {
            "fire_detected": len(fire_frames) > 0,
            "fire_frame_count": len(fire_frames),
            "total_frames_sampled": sampled,
            "total_video_frames": total_frames,
            "fire_frames": fire_frames,
            "status": (
                "Incident logged as PENDING — awaiting admin verification."
                if fire_frames
                else "No fire detected in sampled frames."
            ),
        }

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# =============================================================================
# CROWDSOURCED INCIDENTS
# =============================================================================


@app.post("/incidents", tags=["Incidents"])
async def submit_incident(
    type: str = Form(...),
    location: str = Form(...),
    severity: str = Form(default="moderate"),
    description: str = Form(default=""),
    file: Optional[UploadFile] = File(default=None),
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """
    Submit a crowdsourced incident report.
    All submissions default to 'pending' status for admin review.
    Optional image attachment is stored in Supabase Storage.
    """
    image_url: Optional[str] = None

    if file and file.filename:
        contents = await file.read()
        ext = os.path.splitext(file.filename)[1] or ".jpg"
        storage_path = f"incidents/{uuid.uuid4().hex}{ext}"
        try:
            db.storage.from_("incident-images").upload(storage_path, contents)
            image_url = db.storage.from_("incident-images").get_public_url(storage_path)
        except Exception as exc:
            print(f"⚠️ Image upload failed: {exc}")

    incident_row = {
        "type": type,
        "location": location,
        "severity": severity,
        "description": description,
        "image_url": image_url,
        "reported_by": current_user["id"],
        "status": "pending",
        "time": datetime.datetime.utcnow().isoformat(),
    }
    result = db.table("incidents").insert(incident_row).execute()
    return {"message": "Incident submitted for review.", "incident": result.data[0]}


@app.get("/incidents/mine", tags=["Incidents"])
async def my_incidents(
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Return all incidents submitted by the authenticated user."""
    result = (
        db.table("incidents")
        .select("*")
        .eq("reported_by", current_user["id"])
        .order("time", desc=True)
        .execute()
    )
    return result.data


# =============================================================================
# ADMIN — INCIDENT MANAGEMENT
# =============================================================================


@app.get("/admin/incidents", tags=["Admin"])
async def list_all_incidents(
    status_filter: Optional[str] = None,
    _admin: dict = Depends(require_admin),
    db: Client = Depends(get_supabase),
):
    """
    Admin: list all incidents with optional status filter.
    Query param: ?status_filter=pending | verified | rejected
    """
    query = db.table("incidents").select("*, reported_by(name, email)").order("time", desc=True)
    if status_filter in ("pending", "verified", "rejected"):
        query = query.eq("status", status_filter)
    return query.execute().data


@app.patch("/admin/incidents/{incident_id}", tags=["Admin"])
async def review_incident(
    incident_id: str,
    payload: VerifyIncidentRequest,
    admin: dict = Depends(require_admin),
    db: Client = Depends(get_supabase),
):
    """
    Admin: verify or reject a pending incident.

    On VERIFICATION:
    - Status set to 'verified'
    - Targeted Alert Engine fires → SMS + Email to users in that city.

    On REJECTION:
    - Status set to 'rejected', no alerts sent.
    """
    if payload.status not in ("verified", "rejected"):
        raise HTTPException(status_code=400, detail="status must be 'verified' or 'rejected'.")

    inc_result = db.table("incidents").select("*").eq("id", incident_id).single().execute()
    if not inc_result.data:
        raise HTTPException(status_code=404, detail="Incident not found.")
    incident = inc_result.data

    update_payload: dict = {
        "status": payload.status,
        "verified_by": admin["id"],
        "verified_at": datetime.datetime.utcnow().isoformat(),
    }
    if payload.notes:
        update_payload["notes"] = payload.notes

    db.table("incidents").update(update_payload).eq("id", incident_id).execute()

    alert_summary = {}
    if payload.status == "verified":
        print(f"✅ Incident {incident_id} verified by admin. Dispatching targeted alerts…")
        alert_summary = await dispatch_targeted_alerts(
            incident_id=incident_id,
            incident_type=incident["type"],
            location=incident["location"],
            severity=incident["severity"],
            confidence=incident.get("confidence", "N/A"),
            db=db,
        )

    return {
        "message": f"Incident {payload.status}.",
        "incident_id": incident_id,
        "alerts": alert_summary,
    }


# =============================================================================
# HISTORY ENDPOINT (for legacy frontend compatibility)
# =============================================================================


@app.get("/history", tags=["Incidents"])
async def get_history(db: Client = Depends(get_supabase)):
    """
    Return the 10 most recent verified incidents.
    Maintains backward compatibility with the v1 React frontend.
    """
    result = (
        db.table("incidents")
        .select("id, type, location, severity, time")
        .eq("status", "verified")
        .order("time", desc=True)
        .limit(10)
        .execute()
    )
    return result.data


# =============================================================================
# ANALYTICS API
# =============================================================================


@app.get("/analytics-data", tags=["Analytics"])
async def analytics_data(
    _admin: dict = Depends(require_admin),
    db: Client = Depends(get_supabase),
):
    """
    Aggregate incident data for the admin dashboard.

    Returns:
    - counts_by_type:     {fire: N, earthquake: N, ...}
    - counts_by_severity: {low: N, moderate: N, high: N, critical: N}
    - counts_by_status:   {pending: N, verified: N, rejected: N}
    - counts_by_month:    [{month: "2025-01", count: N}, ...]
    - total:              int
    - alert_stats:        {total_sent: N, email: N, sms: N, failed: N}
    """
    all_incidents = db.table("incidents").select("type, severity, status, time").execute().data or []

    counts_by_type: dict[str, int] = {}
    counts_by_severity: dict[str, int] = {}
    counts_by_status: dict[str, int] = {}
    counts_by_month: dict[str, int] = {}

    for inc in all_incidents:
        t = inc.get("type", "other")
        s = inc.get("severity", "moderate")
        st = inc.get("status", "pending")
        time_str = str(inc.get("time", ""))

        counts_by_type[t] = counts_by_type.get(t, 0) + 1
        counts_by_severity[s] = counts_by_severity.get(s, 0) + 1
        counts_by_status[st] = counts_by_status.get(st, 0) + 1

        if len(time_str) >= 7:
            month = time_str[:7]
            counts_by_month[month] = counts_by_month.get(month, 0) + 1

    monthly_series = [
        {"month": k, "count": v}
        for k, v in sorted(counts_by_month.items())
    ]

    alert_rows = db.table("alert_log").select("channel, status").execute().data or []
    alert_stats = {"total_sent": 0, "email": 0, "sms": 0, "failed": 0}
    for row in alert_rows:
        if row.get("status") == "sent":
            alert_stats["total_sent"] += 1
            alert_stats[row.get("channel", "email")] = (
                alert_stats.get(row.get("channel", "email"), 0) + 1
            )
        else:
            alert_stats["failed"] += 1

    return {
        "total": len(all_incidents),
        "counts_by_type": counts_by_type,
        "counts_by_severity": counts_by_severity,
        "counts_by_status": counts_by_status,
        "counts_by_month": monthly_series,
        "alert_stats": alert_stats,
    }


# =============================================================================
# REPORT DOWNLOAD
# =============================================================================


@app.post("/download-report", tags=["Reports"])
async def download_report(
    data: dict,
    db: Client = Depends(get_supabase),
):
    """
    Generate and return a PDF situation report.
    Accepts the same payload shape as the v1 frontend.
    """
    result = (
        db.table("incidents")
        .select("*")
        .eq("status", "verified")
        .order("time", desc=True)
        .limit(5)
        .execute()
    )
    incidents = result.data or []

    aqi_val = data.get("aqi_calculated", 0)
    aqi_source = data.get("aqi_source", "Unknown")
    filename = generate_pdf(data["weather"], data.get("seismic_risk"), incidents, aqi_val, aqi_source)
    return FileResponse(filename, media_type="application/pdf", filename=os.path.basename(filename))


# =============================================================================
# HEALTH CHECK
# =============================================================================


@app.get("/health", tags=["System"])
async def health():
    """Quick health check — verifies DB connectivity and model state."""
    db_ok = False
    if supabase:
        try:
            supabase.table("users").select("id").limit(1).execute()
            db_ok = True
        except Exception:
            pass
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "db_connected": db_ok,
        "seismic_cache_size": len(recent_quakes),
        "timestamp": datetime.datetime.utcnow().isoformat(),
    }


# =============================================================================
# ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
