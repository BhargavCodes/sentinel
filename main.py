# main.py - ENHANCED WITH EMAIL & SMS ALERTS
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import tensorflow as tf
import numpy as np
from PIL import Image
import io
import asyncio
import httpx 
import math
import sqlite3
import datetime
from fpdf import FPDF
from contextlib import asynccontextmanager
import cv2

from dotenv import load_dotenv
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

load_dotenv()

# API Configuration
WEATHER_API_KEY = os.getenv("WEATHER_API_KEY")
WAQI_TOKEN = os.getenv("WAQI_TOKEN")

# Alert System Configuration
EMAIL_SENDER = os.getenv("EMAIL_SENDER")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")
EMAIL_RECEIVER = os.getenv("EMAIL_RECEIVER")

TWILIO_SID = os.getenv("TWILIO_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER")
TWILIO_TO_NUMBER = os.getenv("TWILIO_TO_NUMBER")

# Metro cities with extended AQI search radius
METRO_CITIES_DISTANCE = {
    "Mumbai": 150, "Delhi": 150, "Kolkata": 120, "Chennai": 120,
    "Bangalore": 120, "Hyderabad": 120, "Pune": 100, "Ahmedabad": 100
}

# Known WAQI station names for major cities (fallback)
KNOWN_AQI_STATIONS = {
    "Mumbai": ["Mumbai - Colaba", "Navi Mumbai", "Mumbai - Bandra Kurla Complex", "Mumbai - Worli"],
    "Delhi": ["Delhi - Anand Vihar", "Delhi - RK Puram", "New Delhi - US Embassy", "Delhi - Punjabi Bagh"],
    "Bangalore": ["Bangalore - BWSSB Kadabesanahalli", "Bangalore - Sanegurava Halli", "Bangalore - BTM Layout"],
    "Kolkata": ["Kolkata - Rabindra Bharati University", "Kolkata - Ballygunge", "Kolkata - Jadavpur"],
    "Chennai": ["Chennai - Manali", "Chennai - Alandur Bus Depot", "Chennai - US Consulate"],
    "Hyderabad": ["Hyderabad - Sanathnagar", "Hyderabad - Gachibowli", "Hyderabad - ICRISAT Patancheru"],
    "Pune": ["Pune - Karve Road", "Pune - Bhosari MIDC", "Pune - Hadapsar"]
}

# --- GLOBAL STATE ---
recent_quakes = [] 
model = None

# --- DATABASE ---
def init_db():
    conn = sqlite3.connect("sentinel.db")
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS incidents 
                 (id INTEGER PRIMARY KEY, type TEXT, location TEXT, severity TEXT, time TEXT)''')
    conn.commit()
    conn.close()

def log_incident(type, location, severity):
    conn = sqlite3.connect("sentinel.db")
    c = conn.cursor()
    time_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    c.execute("INSERT INTO incidents (type, location, severity, time) VALUES (?, ?, ?, ?)",
              (type, location, severity, time_str))
    conn.commit()
    conn.close()

# --- HELPERS ---
def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat/2) * math.sin(dLat/2) + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2) * math.sin(dLon/2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

# ======================================================================
# ENHANCED ALERT SYSTEM - EMAIL & SMS
# ======================================================================

def send_email_alert(subject, message, location="Unknown", severity="Critical", confidence="N/A"):
    """
    Send beautiful HTML email alert via Gmail
    """
    if not all([EMAIL_SENDER, EMAIL_PASSWORD, EMAIL_RECEIVER]):
        print("⚠️ Email credentials not configured in .env")
        return False
    
    try:
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S IST")
        
        # Create beautiful HTML email
        html_body = f"""
        <html>
        <head>
            <style>
                body {{ font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }}
                .container {{ max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }}
                .header {{ background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px 20px; text-align: center; }}
                .header h1 {{ margin: 0; font-size: 28px; font-weight: 700; }}
                .header p {{ margin: 10px 0 0; font-size: 14px; opacity: 0.95; }}
                .content {{ padding: 30px 25px; }}
                .alert-box {{ background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); border-left: 5px solid #ef4444; padding: 20px; margin: 0 0 25px; border-radius: 8px; }}
                .alert-box h2 {{ margin: 0 0 8px; color: #dc2626; font-size: 20px; }}
                .alert-box p {{ margin: 0; color: #374151; font-size: 15px; line-height: 1.6; }}
                .detail-card {{ background-color: #f9fafb; padding: 15px; margin: 12px 0; border-radius: 8px; border-left: 3px solid #3b82f6; }}
                .detail-card strong {{ color: #1f2937; font-size: 14px; }}
                .detail-card span {{ color: #4b5563; margin-left: 8px; }}
                .severity-critical {{ color: #dc2626; font-weight: 700; font-size: 16px; }}
                .actions-box {{ background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); padding: 20px; margin: 25px 0; border-radius: 8px; border: 1px solid #f59e0b; }}
                .actions-box h3 {{ margin: 0 0 15px; color: #92400e; font-size: 18px; }}
                .actions-box ul {{ margin: 0; padding-left: 20px; }}
                .actions-box li {{ margin: 10px 0; color: #92400e; font-size: 14px; line-height: 1.5; }}
                .footer {{ text-align: center; padding: 25px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; }}
                .footer p {{ margin: 5px 0; color: #6b7280; font-size: 12px; }}
                .badge {{ display: inline-block; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-top: 5px; }}
                .badge-critical {{ background-color: #fee2e2; color: #dc2626; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🚨 SENTINEL FIRE ALERT</h1>
                    <p>Disaster Management System - India</p>
                </div>
                
                <div class="content">
                    <div class="alert-box">
                        <h2>⚠️ {subject}</h2>
                        <p>{message}</p>
                        <span class="badge badge-critical">IMMEDIATE ACTION REQUIRED</span>
                    </div>
                    
                    <div class="detail-card">
                        <strong>🔥 Severity Level:</strong>
                        <span class="severity-critical">{severity}</span>
                    </div>
                    
                    <div class="detail-card">
                        <strong>📍 Incident Location:</strong>
                        <span>{location}</span>
                    </div>
                    
                    <div class="detail-card">
                        <strong>📊 Detection Confidence:</strong>
                        <span>{confidence}</span>
                    </div>
                    
                    <div class="detail-card">
                        <strong>🕒 Detection Timestamp:</strong>
                        <span>{timestamp}</span>
                    </div>
                    
                    <div class="actions-box">
                        <h3>⚡ Emergency Response Protocol</h3>
                        <ul>
                            <li><strong>Immediate:</strong> Alert local fire department and emergency services</li>
                            <li><strong>Evacuation:</strong> Initiate evacuation procedures for affected sector</li>
                            <li><strong>Resources:</strong> Deploy firefighting teams and equipment to location</li>
                            <li><strong>Monitoring:</strong> Track situation via Sentinel dashboard in real-time</li>
                            <li><strong>Communication:</strong> Notify all relevant stakeholders and authorities</li>
                        </ul>
                    </div>
                    
                    <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; border-left: 3px solid #3b82f6; margin-top: 20px;">
                        <p style="margin: 0; color: #1e40af; font-size: 13px;">
                            <strong>ℹ️ Note:</strong> This is an automated alert generated by AI-powered fire detection system. 
                            Response teams should verify the situation while initiating emergency protocols.
                        </p>
                    </div>
                </div>
                
                <div class="footer">
                    <p><strong>Sentinel India</strong> - Disaster Management System</p>
                    <p>Powered by Advanced AI Fire Detection Technology</p>
                    <p style="margin-top: 15px;">© 2026 Sentinel India. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Create email message
        msg = MIMEMultipart('alternative')
        msg["From"] = EMAIL_SENDER
        msg["To"] = EMAIL_RECEIVER
        msg["Subject"] = f"🚨 SENTINEL ALERT: {subject}"
        
        # Attach HTML content
        msg.attach(MIMEText(html_body, 'html'))
        
        # Send email via Gmail SMTP
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(EMAIL_SENDER, EMAIL_PASSWORD)
            server.send_message(msg)
        
        print(f"✅ EMAIL ALERT SENT to {EMAIL_RECEIVER}")
        return True
        
    except Exception as e:
        print(f"❌ Email alert failed: {e}")
        return False


def send_sms_alert(message, location="Unknown"):
    """
    Send SMS alert via Twilio (Optional)
    """
    # Check if Twilio is configured
    if not all([TWILIO_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, TWILIO_TO_NUMBER]):
        print("ℹ️ Twilio not configured - SMS alert skipped (optional)")
        return False
    
    try:
        from twilio.rest import Client
        
        client = Client(TWILIO_SID, TWILIO_AUTH_TOKEN)
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        
        # Create concise SMS (160 char limit for basic tier)
        sms_body = f"🚨 SENTINEL: {message} at {location}. Time: {timestamp}. Check dashboard immediately!"
        
        # Truncate if too long
        if len(sms_body) > 160:
            sms_body = sms_body[:157] + "..."
        
        # Send SMS
        sms_message = client.messages.create(
            body=sms_body,
            from_=TWILIO_FROM_NUMBER,
            to=TWILIO_TO_NUMBER
        )
        
        print(f"✅ SMS ALERT SENT to {TWILIO_TO_NUMBER} (SID: {sms_message.sid})")
        return True
        
    except ImportError:
        print("⚠️ Twilio library not installed (run: pip install twilio)")
        return False
    except Exception as e:
        print(f"⚠️ SMS alert failed: {e}")
        return False


def send_fire_alert(location="Aerial Drone Sector 4", confidence="High", prefilter_score="N/A", ml_score="N/A"):
    """
    Send comprehensive fire alert via all configured channels
    """
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S IST")
    
    print("\n" + "="*70)
    print("🚨 FIRE ALERT SYSTEM ACTIVATED")
    print("="*70)
    print(f"📍 Location: {location}")
    print(f"📊 Confidence: {confidence}")
    print(f"⏰ Timestamp: {timestamp}")
    print("="*70)
    
    # Send Email Alert (Primary channel)
    email_success = send_email_alert(
        subject="FIRE DETECTED - IMMEDIATE ACTION REQUIRED",
        message=f"AI fire detection system has identified active fire in {location}. Emergency response required.",
        location=location,
        severity="Critical - Level 5",
        confidence=f"{confidence} | Pre-filter: {prefilter_score} | ML Model: {ml_score}"
    )
    
    # Send SMS Alert (Optional - if Twilio configured)
    sms_success = send_sms_alert(
        message="FIRE DETECTED",
        location=location
    )
    
    # Compile results
    channels_sent = []
    if email_success:
        channels_sent.append("Email")
    if sms_success:
        channels_sent.append("SMS")
    
    if channels_sent:
        print(f"✅ Alerts successfully sent via: {', '.join(channels_sent)}")
    else:
        print("⚠️ No alerts sent - check .env configuration")
    
    print("="*70 + "\n")
    
    return {
        "email_sent": email_success,
        "sms_sent": sms_success,
        "timestamp": timestamp,
        "channels": channels_sent
    }

# ======================================================================
# END OF ALERT SYSTEM
# ======================================================================

# --- ENHANCED AQI FETCHING WITH MULTI-STRATEGY FALLBACKS ---

async def fetch_aqi_with_fallbacks(city_name, lat, lon):
    """Multi-strategy AQI fetching with progressive fallbacks"""
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        
        # Strategy 1: Geo-location Search
        try:
            waqi_url = f"https://api.waqi.info/feed/geo:{lat};{lon}/"
            waqi_resp = await client.get(waqi_url, params={"token": WAQI_TOKEN})
            
            if waqi_resp.status_code == 200:
                waqi_data = waqi_resp.json()
                if waqi_data.get('status') == 'ok':
                    real_aqi = int(waqi_data['data']['aqi'])
                    station_data = waqi_data['data']['city']
                    station_name = station_data.get('name', 'Unknown Station')
                    station_geo = station_data.get('geo', [])
                    
                    if len(station_geo) == 2:
                        station_lat, station_lng = station_geo
                        distance_km = haversine(lat, lon, station_lat, station_lng)
                        
                        max_distance = METRO_CITIES_DISTANCE.get(city_name, 100)
                        
                        if distance_km <= max_distance:
                            if distance_km > 5:
                                aqi_source = f"{station_name} ({distance_km:.1f}km away)"
                            else:
                                aqi_source = station_name
                            
                            print(f"✅ AQI for {city_name}: {real_aqi} from {aqi_source}")
                            return (real_aqi, aqi_source)
                    
        except Exception as e:
            print(f"⚠️ WAQI geo-search error for {city_name}: {e}")
        
        # Strategy 2: Direct City Name Search
        try:
            city_encoded = city_name.replace(" ", "%20")
            waqi_city_url = f"https://api.waqi.info/feed/{city_encoded}/"
            waqi_resp = await client.get(waqi_city_url, params={"token": WAQI_TOKEN})
            
            if waqi_resp.status_code == 200:
                waqi_data = waqi_resp.json()
                if waqi_data.get('status') == 'ok':
                    real_aqi = int(waqi_data['data']['aqi'])
                    station_name = waqi_data['data']['city'].get('name', city_name)
                    aqi_source = f"{station_name} (city search)"
                    
                    print(f"✅ AQI for {city_name}: {real_aqi} from {aqi_source}")
                    return (real_aqi, aqi_source)
                    
        except Exception as e:
            print(f"⚠️ WAQI city search error for {city_name}: {e}")
        
        # Strategy 3: Known Station Names
        if city_name in KNOWN_AQI_STATIONS:
            for station in KNOWN_AQI_STATIONS[city_name]:
                try:
                    station_encoded = station.replace(" ", "%20")
                    waqi_station_url = f"https://api.waqi.info/feed/{station_encoded}/"
                    waqi_resp = await client.get(waqi_station_url, params={"token": WAQI_TOKEN})
                    
                    if waqi_resp.status_code == 200:
                        waqi_data = waqi_resp.json()
                        if waqi_data.get('status') == 'ok':
                            real_aqi = int(waqi_data['data']['aqi'])
                            aqi_source = f"{station} (known station)"
                            
                            print(f"✅ AQI for {city_name}: {real_aqi} from {aqi_source}")
                            return (real_aqi, aqi_source)
                            
                except Exception as e:
                    continue
        
        # Strategy 4: WeatherAPI Built-in AQI
        try:
            weather_url = "http://api.weatherapi.com/v1/current.json"
            weather_params = {
                "key": WEATHER_API_KEY,
                "q": city_name,
                "aqi": "yes"
            }
            
            weather_resp = await client.get(weather_url, params=weather_params)
            
            if weather_resp.status_code == 200:
                weather_data = weather_resp.json()
                air_quality = weather_data['current'].get('air_quality', {})
                
                us_epa = air_quality.get('us-epa-index')
                if us_epa:
                    epa_to_aqi = {1: 25, 2: 75, 3: 125, 4: 175, 5: 250, 6: 400}
                    estimated_aqi = epa_to_aqi.get(us_epa, 50)
                    aqi_source = "WeatherAPI (US EPA estimate)"
                    
                    print(f"✅ AQI for {city_name}: {estimated_aqi} from {aqi_source}")
                    return (estimated_aqi, aqi_source)
                
        except Exception as e:
            print(f"⚠️ WeatherAPI AQI error for {city_name}: {e}")
        
        print(f"❌ No AQI data available for {city_name}")
        return (0, "No AQI data available for this location")


# --- FIRE DETECTION FUNCTIONS (Keep your existing code) ---

def detect_smoke_pattern(image_pil):
    """Detect smoke plumes"""
    img_hsv = np.array(image_pil.convert("HSV"))
    H, S, V = img_hsv[:, :, 0], img_hsv[:, :, 1], img_hsv[:, :, 2]
    
    smoke_mask = (S < 40) & (V > 100) & (V < 220)
    total_pixels = img_hsv.shape[0] * img_hsv.shape[1]
    smoke_ratio = np.count_nonzero(smoke_mask) / total_pixels
    
    if smoke_ratio > 0.05:
        upper_half_idx = img_hsv.shape[0] // 2
        smoke_in_upper = np.count_nonzero(smoke_mask[:upper_half_idx, :])
        total_smoke = np.count_nonzero(smoke_mask)
        
        if total_smoke > 0:
            upper_ratio = smoke_in_upper / total_smoke
            return upper_ratio > 0.4
    
    return False


def is_night_scene(image_pil):
    """Detect night scenes"""
    img_hsv = np.array(image_pil.convert("HSV"))
    V = img_hsv[:, :, 2]
    
    avg_brightness = np.mean(V)
    has_bright_spots = np.count_nonzero(V > 150) > (V.size * 0.05)
    
    return avg_brightness < 90 and has_bright_spots


def analyze_fire_characteristics(image_pil):
    """Balanced fire detection for day/night fires"""
    img_rgb = np.array(image_pil.convert("RGB"))
    img_hsv = np.array(image_pil.convert("HSV"))
    
    H, S, V = img_hsv[:, :, 0], img_hsv[:, :, 1], img_hsv[:, :, 2]
    R, G, B = img_rgb[:, :, 0], img_rgb[:, :, 1], img_rgb[:, :, 2]
    
    fire_color_mask = (H < 30) & (S > 80) & (V > 120)
    red_dominance = (R > G + 10) & (R > B + 10)
    fire_mask = fire_color_mask & red_dominance
    
    fire_pixel_count = np.count_nonzero(fire_mask)
    total_pixels = img_rgb.shape[0] * img_rgb.shape[1]
    fire_ratio = fire_pixel_count / total_pixels
    
    img_gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
    kernel_size = 15
    mean = cv2.blur(img_gray, (kernel_size, kernel_size))
    mean_sq = cv2.blur(img_gray ** 2, (kernel_size, kernel_size))
    variance = mean_sq - (mean ** 2)
    std_dev = np.sqrt(np.abs(variance))
    avg_texture_variance = np.mean(std_dev)
    has_fire_texture = avg_texture_variance > 20
    
    brightness_std = np.std(V)
    has_brightness_variation = brightness_std > 30
    
    has_fire_clustering = False
    significant_clusters = 0
    if fire_pixel_count > 0:
        fire_mask_uint8 = fire_mask.astype(np.uint8) * 255
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(fire_mask_uint8, connectivity=8)
        significant_clusters = sum(1 for i in range(1, num_labels) if stats[i, cv2.CC_STAT_AREA] > 50)
        has_fire_clustering = 1 <= significant_clusters <= 8
    
    avg_saturation = np.mean(S)
    if avg_saturation > 80:
        high_saturation = True
    elif avg_saturation > 60 and fire_ratio > 0.15:
        high_saturation = True
    else:
        high_saturation = False
    
    has_smoke = detect_smoke_pattern(image_pil)
    is_night = is_night_scene(image_pil)
    
    score = 0
    if fire_ratio > 0.01: score += 1
    if has_fire_texture: score += 2
    if has_brightness_variation: score += 1
    if has_fire_clustering: score += 3
    if high_saturation: score += 1
    if has_smoke: score += 2
    if is_night and fire_ratio > 0.15: score += 1
    
    if score >= 6:
        is_likely_fire = True
        confidence_level = "HIGH"
    elif score >= 3:
        is_likely_fire = True
        confidence_level = "MODERATE"
    elif has_fire_clustering and has_smoke:
        is_likely_fire = True
        confidence_level = "OVERRIDE"
        score = max(score, 5)
    elif fire_ratio > 0.25 and has_fire_clustering:
        is_likely_fire = True
        confidence_level = "OVERRIDE"
        score = max(score, 5)
    else:
        is_likely_fire = False
        confidence_level = "NOT FIRE"
    
    return {
        'fire_pixel_ratio': fire_ratio,
        'has_fire_texture': has_fire_texture,
        'has_smoke': has_smoke,
        'is_night': is_night,
        'total_score': score,
        'max_score': 13,
        'confidence_level': confidence_level,
        'is_likely_fire': is_likely_fire
    }

# --- PDF REPORT ---
class PDFReport(FPDF):
    def header(self):
        self.set_font('Arial', 'B', 15)
        self.cell(0, 10, 'SENTINEL - Detailed Situation Report', 0, 1, 'C')
        self.ln(10)

def generate_pdf(weather, seismic, incidents, aqi_val, aqi_source):
    pdf = PDFReport()
    pdf.add_page()
    pdf.set_font("Arial", size=12)
    
    current = weather.get('current', {})
    loc = weather.get('location', {})
    pdf.set_font("Arial", 'B', 14)
    pdf.cell(200, 10, f"1. Sector Status: {loc.get('name')}, {loc.get('country')}", 0, 1)
    pdf.set_font("Arial", size=12)
    pdf.cell(200, 10, f"   Temp: {current.get('temp_c')} C | Humidity: {current.get('humidity')}%", 0, 1)
    pdf.cell(200, 10, f"   Official Air Quality (AQI): {aqi_val if aqi_val > 0 else 'N/A'}", 0, 1)
    pdf.cell(200, 10, f"   AQI Measurement Source: {aqi_source}", 0, 1)
    pdf.cell(200, 10, f"   Last Updated: {current.get('last_updated', 'N/A')}", 0, 1)
    pdf.ln(5)

    pdf.set_font("Arial", 'B', 14)
    pdf.cell(200, 10, "2. Seismic Risk Analysis", 0, 1)
    pdf.set_font("Arial", size=12)
    if seismic:
        pdf.cell(200, 10, f"   CRITICAL: Activity Detected near {seismic['location']}", 0, 1)
        pdf.cell(200, 10, f"   Magnitude: {seismic['magnitude']} | Distance: {seismic['distance_km']} km", 0, 1)
    else:
        pdf.cell(200, 10, "   Status: Stable (No threats within 1500km)", 0, 1)
    pdf.ln(5)

    pdf.set_font("Arial", 'B', 14)
    pdf.cell(200, 10, "3. Recent Incident Logs", 0, 1)
    pdf.set_font("Arial", size=10)
    for inc in incidents:
        pdf.cell(200, 8, f"   [{inc[4]}] {inc[1]} - {inc[2]} ({inc[3]})", 0, 1)

    filename = "report.pdf"
    pdf.output(filename)
    return filename

# --- BACKGROUND TASKS ---
async def fetch_global_quakes():
    global recent_quakes
    url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson"
    while True:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    recent_quakes = resp.json().get("features", [])
        except: pass
        await asyncio.sleep(60)

# --- LIFECYCLE ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    init_db()
    
    model_paths = [
        ('models/fire_model_enhanced.keras', 'Enhanced Fire Model (Keras format)'),
        ('models/fire_model_enhanced.h5', 'Enhanced Fire Model (H5 format)'),
        ('models/fire_model.keras', 'Original Fire Model (Keras format)'),
        ('models/fire_model.h5', 'Original Fire Model (H5 format)')
    ]
    
    model = None
    for path, description in model_paths:
        try:
            model = tf.keras.models.load_model(path)
            print(f"✅ {description} loaded from: {path}")
            break
        except Exception as e:
            print(f"⚠️ Could not load {path}: {str(e)[:50]}...")
            continue
    
    if model is None:
        print("❌ CRITICAL ERROR: No fire detection model found!")
        print("📋 Please run: python3 train_model.py")
    
    task = asyncio.create_task(fetch_global_quakes())
    yield
    task.cancel()

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# --- ENDPOINTS ---

@app.get("/weather/{city}")
async def get_weather(city: str):
    weather_url = "http://api.weatherapi.com/v1/forecast.json"
    weather_params = {
        "key": WEATHER_API_KEY,
        "q": city,
        "days": 3,
        "aqi": "no",
        "alerts": "yes"
    }

    async with httpx.AsyncClient() as client:
        resp = await client.get(weather_url, params=weather_params)
        if resp.status_code != 200:
             raise HTTPException(status_code=404, detail="City not found")
        
        data = resp.json()
        lat = data['location']['lat']
        lon = data['location']['lon']
        city_name = data['location']['name']

        real_aqi, aqi_source = await fetch_aqi_with_fallbacks(city_name, lat, lon)

        nearest_quake, min_dist = None, 10000 
        for quake in recent_quakes:
            q_lon, q_lat, _ = quake["geometry"]["coordinates"]
            dist = haversine(lat, lon, q_lat, q_lon)
            if dist < min_dist:
                min_dist = dist
                nearest_quake = {
                    "location": quake["properties"]["place"],
                    "magnitude": quake["properties"]["mag"],
                    "distance_km": round(dist, 1),
                    "time": quake["properties"]["time"],
                    "coords": [q_lat, q_lon]
                }

        return {
            "weather": data,
            "aqi_calculated": real_aqi,
            "aqi_source": aqi_source,
            "seismic_risk": nearest_quake if min_dist < 1500 else None 
        }

@app.post("/predict-fire")
async def predict_fire(file: UploadFile = File(...)):
    if model is None: 
        return {"result": "System Error", "severity": "Unknown", "confidence": "0%"}
    
    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")
    
    analysis = analyze_fire_characteristics(image)
    
    if not analysis['is_likely_fire']:
        return {
            "result": "Safe", 
            "severity": "None", 
            "confidence": f"{(1 - analysis['fire_pixel_ratio']) * 100:.2f}%",
            "reason": "Pre-filter: Natural scene (not fire)",
            "prefilter_score": f"{analysis['total_score']}/13"
        }
    
    img_arr = np.array(image.resize((128, 128)))
    img_arr = np.expand_dims(img_arr, axis=0) / 255.0
    ml_score = float(model.predict(img_arr, verbose=0)[0][0])
    
    if analysis['confidence_level'] == "HIGH":
        ml_threshold = 0.4
    elif analysis['confidence_level'] == "OVERRIDE":
        ml_threshold = 0.5
    else:
        ml_threshold = 0.3
    
    prefilter_conf = analysis['total_score'] / analysis['max_score']
    ml_conf = 1 - ml_score
    
    if analysis['confidence_level'] == "HIGH":
        combined_conf = prefilter_conf * 0.7 + ml_conf * 0.3
    else:
        combined_conf = prefilter_conf * 0.5 + ml_conf * 0.5
    
    if ml_score < ml_threshold or analysis['confidence_level'] == "OVERRIDE":
        # Log incident to database
        log_incident("FIRE", "Aerial Drone Sector 4", "Critical")
        
        # === SEND COMPREHENSIVE ALERTS ===
        alert_result = send_fire_alert(
            location="Aerial Drone Sector 4",
            confidence=f"{combined_conf * 100:.2f}%",
            prefilter_score=f"{analysis['total_score']}/13",
            ml_score=f"{ml_conf*100:.2f}%"
        )
        
        return {
            "result": "FIRE DETECTED", 
            "severity": "Critical", 
            "confidence": f"{combined_conf * 100:.2f}%",
            "alert": "Sent",
            "alert_channels": alert_result['channels'],
            "ml_score": f"{ml_conf*100:.2f}%",
            "prefilter_score": f"{analysis['total_score']}/13",
            "confidence_level": analysis['confidence_level']
        }
    else:
        return {
            "result": "Safe", 
            "severity": "None", 
            "confidence": f"{(1 - combined_conf) * 100:.2f}%",
            "reason": "ML model uncertain (likely false positive)",
            "prefilter_score": f"{analysis['total_score']}/13"
        }

@app.get("/history")
def get_history():
    conn = sqlite3.connect("sentinel.db")
    c = conn.cursor()
    c.execute("SELECT * FROM incidents ORDER BY time DESC LIMIT 5")
    data = c.fetchall()
    conn.close()
    return data

@app.post("/download-report")
async def download_report(data: dict):
    conn = sqlite3.connect("sentinel.db")
    c = conn.cursor()
    c.execute("SELECT * FROM incidents ORDER BY time DESC LIMIT 5")
    incidents = c.fetchall()
    conn.close()
    
    aqi_val = data.get("aqi_calculated", "N/A")
    aqi_source = data.get("aqi_source", "Unknown")
    
    filename = generate_pdf(data['weather'], data['seismic_risk'], incidents, aqi_val, aqi_source)
    return FileResponse(filename, media_type='application/pdf', filename=filename)

# === TEST ENDPOINT FOR ALERTS ===
@app.post("/test-alerts")
async def test_alerts():
    """Test endpoint to verify alert system is working"""
    result = send_fire_alert(
        location="Test Sector (Alert System Verification)",
        confidence="99.9%",
        prefilter_score="10/13 (TEST)",
        ml_score="99.9% (TEST)"
    )
    
    return {
        "status": "Test alerts triggered",
        "email_configured": EMAIL_SENDER is not None and EMAIL_SENDER != "",
        "sms_configured": TWILIO_SID is not None and TWILIO_SID != "",
        "result": result
    }

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)