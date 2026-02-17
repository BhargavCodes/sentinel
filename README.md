This is a crucial step. If someone clones your repository, **it will not work out of the box** because they will be missing two critical things:

1. **Environment Variables (`.env`)**: These contain your secret API keys, which are (correctly) ignored by Git.
2. **The AI Model**: Large model files are usually ignored or need to be generated locally.
3. **Dependencies**: They need to install the specific Python and Node libraries you used.

Here is the exact guide you should include as a `README.md` file in your repository. This tells any user (including your future self) exactly how to set it up from scratch.

---

### **Create a `README.md` file**

Create a file named `README.md` in your root folder (`X:\Nerd\disaster_system\`) and paste this content:

```markdown
# Sentinel Disaster Management System 🌍🔥

A full-stack disaster monitoring dashboard featuring real-time satellite weather, AI-powered fire detection, seismic risk analysis, and government-grade air quality monitoring.

## 🚀 Key Features
* **Live Weather & Maps:** Interactive Leaflet maps with Rain, Cloud, and Wind layers.
* **AI Fire Detection:** Custom MobileNetV2 Transfer Learning model to detect fire from aerial/drone imagery (filtering out false positives like red leaves).
* **Seismic Analysis:** Real-time earthquake data fetching (USGS) with proximity alerts.
* **Smart AQI:** Accurate Air Quality Index fetching using geo-location and distance validation (prevents incorrect city matching).
* **Alert System:** Automated Email & SMS alerts for critical events (Fire/Earthquake).

---

## 🛠️ Installation Guide

Follow these steps to run the project locally.

### 1. Clone the Repository
```bash
git clone [https://github.com/YOUR_USERNAME/sentinel-dashboard.git](https://github.com/YOUR_USERNAME/sentinel-dashboard.git)
cd sentinel-dashboard

```

### 2. Backend Setup (Python)

The backend powers the API, AI model, and alert system.

1. **Create a Virtual Environment (Recommended):**
```bash
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

```


2. **Install Python Dependencies:**
```bash
pip install -r requirements.txt

```


3. **Set Up Environment Variables:**
* Create a file named `.env` in the root directory.
* Add your API keys (Get free keys from [WeatherAPI]() and [WAQI]()).


**Content of `.env`:**
```env
WEATHER_API_KEY=your_weatherapi_key_here
WAQI_TOKEN=your_waqi_token_here

# Alert System (Optional)
EMAIL_SENDER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password
EMAIL_RECEIVER=admin_email@example.com

```


4. **Train the AI Model (First Run Only):**
You need to generate the fire detection model locally.
```bash
python train_model.py

```


*This will train the model using the `dataset/` folder and save it as `models/fire_model_enhanced.h5`.*
5. **Start the Backend Server:**
```bash
python main.py

```


*The server will start at `http://127.0.0.1:8000`.*

---

### 3. Frontend Setup (React)

The frontend is the visual dashboard.

1. **Navigate to the frontend folder:**
```bash
cd frontend

```


2. **Install Node Modules:**
```bash
npm install

```


3. **Start the Dashboard:**
```bash
npm run dev

```


*Click the link shown (usually `http://localhost:5173`) to open the app.*

---

## 📂 Project Structure

* `main.py`: FastAPI backend, Alert logic, and AI inference.
* `train_model.py`: Script to train the MobileNetV2 Fire Detection model.
* `frontend/`: React + Leaflet frontend code.
* `dataset/`: Training images for the AI (Fire vs. Non-Fire).
* `models/`: Directory where the trained `.h5` model is saved.

## ⚠️ Common Issues

* **"Model not found":** Make sure you ran `python train_model.py` successfully.
* **Map clicks interacting with buttons:** The UI uses `e.stopPropagation()` to prevent this.
* **AQI data mismatch:** The system rejects stations >50km away to ensure accuracy.

```

---
