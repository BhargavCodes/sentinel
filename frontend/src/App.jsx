// frontend/src/App.jsx
import React, { useState, useEffect, useRef } from 'react'; 
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const BlueIcon = L.icon({ iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png", shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
const RedIcon = L.icon({ iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png", shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });

const OWM_KEY = "0810f8af801a68b40b2a1aa5b5736f6e"; 
const CITIES_DB = ["New Delhi", "Mumbai", "Bangalore", "Hyderabad", "Chennai", "Kolkata", "Pune", "Jaipur", "Lucknow", "Kanpur", "Nagpur", "Indore", "Thane", "Bhopal", "Visakhapatnam", "Patna", "Vadodara", "Ghaziabad", "Ludhiana", "Agra", "Nashik", "Faridabad", "Meerut", "Rajkot", "Varanasi", "Srinagar", "Aurangabad", "Dhanbad", "Amritsar", "Navi Mumbai", "Allahabad", "Ranchi", "Guwahati", "Chandigarh", "Mysore", "Dehradun", "Jammu"];

const THEMES = {
  dark: { bg: "#0f172a", text: "#f8fafc", cardBg: "rgba(30, 41, 59, 0.85)", accent: "#38bdf8", border: "1px solid rgba(255,255,255,0.1)", mapUrl: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", inputBg: "rgba(255,255,255,0.1)", dropdownBg: "#1e293b" },
  light: { bg: "#f1f5f9", text: "#1e293b", cardBg: "rgba(255, 255, 255, 0.9)", accent: "#2563eb", border: "1px solid rgba(0,0,0,0.05)", mapUrl: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", inputBg: "white", dropdownBg: "white" }
};

function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.flyTo(center, 9, { duration: 1.5 }); }, [center, map]);
  return null;
}

function MapClickController({ onLocationSelect }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      onLocationSelect(`${lat},${lng}`);
    },
  });
  return null;
}

function App() {
  const [darkMode, setDarkMode] = useState(true);
  const theme = darkMode ? THEMES.dark : THEMES.light;
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => { window.addEventListener('resize', () => setIsMobile(window.innerWidth < 768)); }, []);

  const [inputValue, setInputValue] = useState("New Delhi");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [fireResult, setFireResult] = useState(null);
  const [loadingFire, setLoadingFire] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [activeLayer, setActiveLayer] = useState(null); 
  const suggestionBoxRef = useRef(null);

  useEffect(() => { handleSearch("New Delhi"); fetchHistory(); }, []);

  const fetchHistory = async () => { try { const res = await fetch("http://127.0.0.1:8000/history"); setHistory(await res.json()); } catch(e) {} };

  const handleSearch = async (query) => {
    if (!query) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/weather/${query}`);
      if (!res.ok) throw new Error("Location not found");
      const result = await res.json();
      setData(result);
      setInputValue(result.weather.location.name);
    } catch (err) { alert(err.message); }
  };

  const handleFireUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoadingFire(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("http://127.0.0.1:8000/predict-fire", { method: "POST", body: formData });
      const result = await res.json();
      setFireResult(result);
      if (result.result.includes("FIRE")) fetchHistory(); 
    } catch (err) { console.error(err); }
    setLoadingFire(false);
  };

  const downloadReport = async () => {
    if (!data) return;
    try {
        const res = await fetch("http://127.0.0.1:8000/download-report", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `Sentinel_Report_${data.weather.location.name}.pdf`;
        a.click();
    } catch(e) { alert("Error generating report"); }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);
    if (val.length > 0) {
      setSuggestions(CITIES_DB.filter(c => c.toLowerCase().startsWith(val.toLowerCase())));
      setShowSuggestions(true);
    } else setShowSuggestions(false);
  };

  const WeatherDetailView = () => {
    if (!data) return null;
    const current = data.weather.current;
    const location = data.weather.location;
    const forecast = data.weather.forecast.forecastday[0].hour; 
    
    const aqi = data.aqi_calculated || 0; 
    const aqiSource = data.aqi_source || "Unknown Station";
    const lastUpdated = current.last_updated || "Unknown";

    let aqiColor = "#00e400";
    let aqiLabel = "Good";
    if (aqi <= 50) { aqiColor = "#00e400"; aqiLabel = "Good"; }
    else if (aqi <= 100) { aqiColor = "#ffff00"; aqiLabel = "Moderate"; }
    else if (aqi <= 150) { aqiColor = "#ff7e00"; aqiLabel = "Sensitive"; }
    else if (aqi <= 200) { aqiColor = "#ff0000"; aqiLabel = "Unhealthy"; }
    else if (aqi <= 300) { aqiColor = "#8f3f97"; aqiLabel = "Very Unhealthy"; }
    else { aqiColor = "#7e0023"; aqiLabel = "Hazardous"; }

    const weatherIcon = `https:${current.condition.icon}`;

    return (
      <div style={{
        position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
        background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(8px)", zIndex: 99999,
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "fadeIn 0.3s ease"
      }} onClick={() => setShowDetail(false)}>
        <div style={{
          width: "90%", maxWidth: "850px", 
          background: darkMode ? "linear-gradient(145deg, #1e293b, #0f172a)" : "linear-gradient(145deg, #ffffff, #f1f5f9)",
          borderRadius: "24px", padding: "40px", border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)", position: "relative"
        }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowDetail(false)} style={{
                position: "absolute", top: "20px", right: "20px", background: "rgba(128,128,128,0.2)",
                border: "none", borderRadius: "50%", width: "40px", height: "40px", cursor: "pointer", 
                color: theme.text, fontSize: "1.2rem", display: "flex", alignItems: "center", justifyContent: "center"
            }}>✕</button>
            <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "40px", flexWrap: "wrap" }}>
                <div style={{ width: "100px", height: "100px", borderRadius: "50%", background: `linear-gradient(135deg, ${theme.accent}40, ${theme.accent}10)`, display: "flex", alignItems: "center", justifyContent: "center", border: theme.border }}>
                    <img src={weatherIcon} alt="weather" style={{ width: "80px" }} />
                </div>
                <div>
                    <h1 style={{ margin: 0, fontSize: "3rem", lineHeight: "1" }}>{location.name}</h1>
                    <p style={{ margin: "5px 0 0", fontSize: "1.2rem", opacity: 0.6 }}>{current.condition.text}</p>
                    <p style={{ margin: "5px 0 0", fontSize: "0.85rem", opacity: 0.5, fontStyle: "italic" }}>Last Updated: {lastUpdated}</p>
                </div>
                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <h1 style={{ margin: 0, fontSize: "4rem", fontWeight: "200" }}>{Math.round(current.temp_c)}°</h1>
                </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: "20px", marginBottom: "40px" }}>
                
                {/* UPDATED AQI CARD WITH SOURCE */}
                <div style={{ background: theme.cardBg, padding: "20px", borderRadius: "16px", border: theme.border, position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "4px", background: aqiColor }}></div>
                    <small style={{ opacity: 0.6, letterSpacing: "1px" }}>AIR QUALITY</small>
                    <h2 style={{ margin: "10px 0", color: aqiColor }}>{aqiLabel}</h2>
                    <p style={{ margin: 0, fontSize: "1.2rem", fontWeight: "bold" }}>AQI: {aqi > 0 ? aqi : "N/A"}</p>
                    <p style={{ margin: "5px 0 0", fontSize: "0.8rem", opacity: 0.5, fontStyle: "italic" }}>Source: {aqiSource}</p>
                </div>

                <div style={{ background: theme.cardBg, padding: "20px", borderRadius: "16px", border: theme.border }}>
                    <small style={{ opacity: 0.6, letterSpacing: "1px" }}>HUMIDITY</small>
                    <h2 style={{ margin: "10px 0" }}>{current.humidity}%</h2>
                </div>
                <div style={{ background: theme.cardBg, padding: "20px", borderRadius: "16px", border: theme.border }}>
                    <small style={{ opacity: 0.6, letterSpacing: "1px" }}>VISIBILITY</small>
                    <h2 style={{ margin: "10px 0" }}>{current.vis_km} km</h2>
                </div>
            </div>
            <div>
                <small style={{ opacity: 0.6, letterSpacing: "1px", display: "block", marginBottom: "15px" }}>HOURLY FORECAST</small>
                <div style={{ display: "flex", gap: "15px", overflowX: "auto", paddingBottom: "10px" }}>
                    {forecast.slice(0, 8).map((item, idx) => ( 
                        <div key={idx} style={{ minWidth: "90px", padding: "15px", borderRadius: "16px", background: theme.cardBg, border: theme.border, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>{new Date(item.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            <img src={`https:${item.condition.icon}`} alt="icon" style={{ width: "35px" }} />
                            <span style={{ fontWeight: "bold", fontSize: "1.1rem" }}>{Math.round(item.temp_c)}°</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column-reverse" : "row", height: "100vh", background: theme.bg, color: theme.text, fontFamily: "'Inter', sans-serif", transition: "all 0.3s ease" }}>
      
      {showDetail && <WeatherDetailView />}

      <div style={{ position: "relative", width: isMobile ? "100%" : "420px", height: isMobile ? "60%" : "100%", padding: "25px", display: "flex", flexDirection: "column", gap: "20px", background: darkMode ? "rgba(15, 23, 42, 0.95)" : "rgba(255,255,255,0.95)", backdropFilter: "blur(10px)", borderRight: theme.border, zIndex: 1000, overflowY: "auto" }}>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ margin: 0, fontSize: "1.5rem", background: "linear-gradient(to right, #38bdf8, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>SENTINEL <span style={{fontSize:"0.8rem", color:theme.text, WebkitTextFillColor:theme.text}}>INDIA</span></h1>
          <button onClick={() => setDarkMode(!darkMode)} style={{ background: "transparent", border: theme.border, color: theme.text, padding: "5px 10px", borderRadius: "15px", cursor: "pointer" }}>{darkMode ? "☀️" : "🌙"}</button>
        </div>

        <div style={{ position: "relative" }} ref={suggestionBoxRef}>
          <input type="text" placeholder="Monitor Sector..." value={inputValue} onChange={handleInputChange} onKeyDown={(e) => e.key==='Enter' && handleSearch(inputValue)} style={{ width: "100%", padding: "15px", borderRadius: "12px", border: "none", background: theme.inputBg, color: theme.text, outline: "none", boxShadow: "0 4px 15px rgba(0,0,0,0.05)" }} />
          {showSuggestions && suggestions.length > 0 && (
            <ul style={{ position: "absolute", top: "100%", left: 0, right: 0, background: theme.dropdownBg, borderRadius: "12px", padding: "5px 0", listStyle: "none", zIndex: 10, border: theme.border }}>
              {suggestions.map((s, i) => <li key={i} onClick={() => { setInputValue(s); setShowSuggestions(false); handleSearch(s); }} style={{ padding: "10px 20px", cursor: "pointer", borderBottom: "1px solid rgba(128,128,128,0.1)" }}>{s}</li>)}
            </ul>
          )}
        </div>

        {data && (
          <>
            <div onClick={() => setShowDetail(true)} style={{ background: theme.cardBg, borderRadius: "16px", padding: "20px", border: theme.border, cursor: "pointer", transition: "transform 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.02)"} onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                 <h3 style={{ margin: 0, opacity: 0.8 }}>METEOROLOGY</h3>
                 <small style={{ color: theme.accent, fontWeight: "bold" }}>VIEW HUD ↗</small>
              </div>
              <div style={{ display: "flex", alignItems: "center", marginTop: "15px", gap: "15px" }}>
                <h1 style={{ margin: 0, fontSize: "3.5rem", fontWeight: "300" }}>{Math.round(data.weather.current.temp_c)}°</h1>
                <div><p style={{ margin: 0, fontSize: "1.2rem" }}>{data.weather.current.condition.text}</p><p style={{ margin: 0, opacity: 0.6 }}>{data.weather.location.name}</p></div>
              </div>
            </div>

            <div style={{ background: theme.cardBg, borderRadius: "16px", padding: "20px", border: theme.border, borderLeft: data.seismic_risk ? "4px solid #f43f5e" : "4px solid #10b981" }}>
              <h3 style={{ margin: "0 0 10px 0", opacity: 0.8 }}>SEISMIC PROXIMITY</h3>
              {data.seismic_risk ? (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                    <span style={{ color: "#f43f5e", fontWeight: "bold" }}>⚠️ ALERT LEVEL: HIGH</span>
                    <span style={{ opacity: 0.6 }}>{new Date(data.seismic_risk.time).toLocaleDateString()}</span>
                  </div>
                  <p style={{ margin: "5px 0" }}>Activity near <b>{data.seismic_risk.location}</b></p>
                </div>
              ) : (
                <div style={{ color: "#10b981", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span>🛡️</span><span>Sector Safe. No activity in 1500km.</span>
                </div>
              )}
            </div>

            <div style={{ background: theme.cardBg, borderRadius: "16px", padding: "20px", border: theme.border }}>
              <h3 style={{ margin: "0 0 15px 0", opacity: 0.8 }}>AERIAL FIRE ANALYSIS</h3>
              <label style={{ display: "block", padding: "20px", border: "2px dashed " + theme.accent, borderRadius: "12px", textAlign: "center", cursor: "pointer", background: "rgba(56, 189, 248, 0.05)" }}>
                <input type="file" onChange={handleFireUpload} accept="image/*" style={{ display: "none" }} />
                <span style={{ fontSize: "2rem" }}>🚁</span> Upload Feed
              </label>
              {fireResult && (
                <div style={{ marginTop: "15px", padding: "15px", borderRadius: "12px", background: fireResult.result.includes("FIRE") ? "#ef4444" : "#10b981", color: "white" }}>
                  <h2 style={{ margin: 0, fontSize: "1.2rem" }}>{fireResult.result}</h2>
                  {fireResult.alert_channels && (
                    <small>📨 via: {fireResult.alert_channels.join(", ")}</small>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* MAP CONTAINER WITH FIXED DOCK OUTSIDE */}
      <div style={{ flex: 1, position: "relative" }}>
        <MapContainer center={[20.5937, 78.9629]} zoom={5} style={{ height: "100%", width: "100%", background: theme.bg }}>
          
          <TileLayer url={theme.mapUrl} />
          {activeLayer === 'clouds' && <TileLayer url={`https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`} />}
          {activeLayer === 'rain' && <TileLayer url={`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`} />}
          {activeLayer === 'temp' && <TileLayer url={`https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`} />}
          {activeLayer === 'wind' && <TileLayer url={`https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`} />}

          <MapClickController onLocationSelect={handleSearch} />

          {data && (
            <>
              {data.seismic_risk && (
                 <>
                    <Circle center={data.seismic_risk.coords} radius={50000} pathOptions={{ color: 'red', fillColor: '#f43f5e', fillOpacity: 0.4 }} />
                    <Marker position={data.seismic_risk.coords} icon={RedIcon}>
                        <Popup><b>⚠️ DANGER ZONE</b><br/>{data.seismic_risk.location}</Popup>
                    </Marker>
                 </>
              )}
              <Marker position={[data.weather.location.lat, data.weather.location.lon]} icon={BlueIcon}>
                <Popup><div style={{ textAlign: "center" }}><b>{data.weather.location.name}</b><br/>Current Sector</div></Popup>
              </Marker>
              <MapUpdater center={[data.weather.location.lat, data.weather.location.lon]} />
            </>
          )}
        </MapContainer>

        {/* FLOATING DOCK - NOW OUTSIDE MapContainer AS SIBLING */}
        <div 
          style={{
            position: "absolute", bottom: "40px", left: "50%", transform: "translateX(-50%)",
            background: theme.cardBg, backdropFilter: "blur(10px)",
            padding: "10px 20px", borderRadius: "50px", border: theme.border,
            display: "flex", gap: "15px", zIndex: 1000, boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
            pointerEvents: "auto"
          }}
        >
          {[
            { id: 'clouds', icon: '☁️', label: 'Clouds' },
            { id: 'rain', icon: '🌧️', label: 'Rain' },
            { id: 'temp', icon: '🌡️', label: 'Temp' },
            { id: 'wind', icon: '💨', label: 'Wind' }
          ].map(layer => (
            <button 
              key={layer.id}
              onClick={() => setActiveLayer(activeLayer === layer.id ? null : layer.id)}
              style={{
                background: activeLayer === layer.id ? theme.accent : "transparent",
                color: activeLayer === layer.id ? "white" : theme.text,
                border: "none", borderRadius: "30px", padding: "8px 15px",
                cursor: "pointer", fontWeight: "bold", transition: "all 0.2s",
                display: "flex", alignItems: "center", gap: "5px"
              }}
            >
              <span>{layer.icon}</span>
              {!isMobile && <span>{layer.label}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;