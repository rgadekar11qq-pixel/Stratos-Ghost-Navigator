# 👻 Stratos Ghost: Multimodal Autonomous UI Navigator

[![Deployed on Google Cloud Run](https://img.shields.io/badge/Hosted_on-Google_Cloud_Run-blue?logo=googlecloud)](https://cloud.google.com/run)
[![Powered by Gemini](https://img.shields.io/badge/Powered_by-Gemini_2.5_Flash-orange?logo=googlebard)](https://ai.google.dev/)

**Stratos Ghost** is a multimodal Robotic Process Automation (RPA) agent built for the Google Gemini Live Agent Challenge. It shatters the "text-box paradigm" by acting as a Human API—visually navigating complex, legacy B2B Single Page Applications (SPAs) without requiring backend integrations.

---

## 🏗️ Architecture & Technical Implementation

Stratos Ghost is a fully distributed, serverless architecture that separates the visual sensory layer from the AI decision engine.

1. **The Eyes & Hands (Manifest V3 Chrome Extension):** Operates securely inside the user's browser. It captures visual state and executes native DOM manipulations.
2. **The Brain (Node.js on Google Cloud Run):** A serverless decision engine that strictly enforces structured JSON outputs from the Gemini SDK.

### 🧠 Core Innovations
*   **Set-of-Mark (SoM) Vision:** Mathematically eliminates spatial hallucinations. Before taking a screenshot, the extension injects numbered bounding boxes over all interactive DOM elements, allowing Gemini to select 100% deterministic targets.
*   **React Fiber Bypass:** Defeats modern frontend security. Instead of relying on easily blocked synthetic `click()` events, the agent hooks directly into React Fiber nodes to trigger native execution states.
*   **Self-Healing ReAct Loop:** If Gemini encounters an API rate limit (`429 RESOURCE_EXHAUSTED`), the Cloud Run backend intercepts the failure, returning a graceful `WAIT` command. The agent recalibrates and resumes without crashing.

---

## ☁️ Proof of Google Cloud Deployment
The decision engine is containerized via Cloud Native Buildpacks and continuously deployed to Google Cloud Run. 

*   **Live Endpoint:** `https://stratos-ghost-navigator-[YOUR_PROJECT_ID].europe-west1.run.app`
*   **Proof of CI/CD:** See the `cloudbuild.yaml` file in this repository demonstrating our Infrastructure-as-Code automated deployment pipeline.
*   *(Visual proof of the Cloud Run dashboard and live traffic logs are included in the 4-minute demonstration video).*

---

## ⚙️ Spin-Up Instructions (Reproducibility)

### 1. Deploy the Brain (Backend)
1. Clone this repository: `git clone https://github.com/YOUR-USERNAME/Stratos-Ghost-Navigator.git`
2. Navigate to the backend: `cd brain`
3. Create a `.env` file and add your credentials:
   ```env
   GEMINI_API_KEY=your_google_ai_studio_key
   WEBHOOK_URL=your_make_dot_com_webhook_url


1. Install dependencies and start the server:
code
Bash
npm install
npm start
The server will run locally on port 8080 (or 3000).

2. Install the Operator (Chrome Extension)
  a. Open Google Chrome and navigate to chrome://extensions/.
  b. Toggle Developer mode ON in the top right corner.
  c. Click Load unpacked and select the /operator folder from this repository.
  d. Pin the Stratos Ghost extension to your toolbar.
Note: If running the backend locally, ensure serverUrl in background.js and popup.js points to your localhost. If using the Cloud Run backend, point it to your live .run.app URL.
