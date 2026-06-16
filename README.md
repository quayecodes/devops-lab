# DevOps Lab 🧪

An **interactive, multi-service DevOps playground** demonstrating containerization, orchestration, observability, and CI/CD pipelines — all in one repo.

---

## 🏗️ Architecture

```
Browser
  └─▶ Nginx (Port 80)           ← Frontend Dashboard + Reverse Proxy
        └─▶ FastAPI (Port 8000)  ← REST API + Prometheus Metrics
              └─▶ PostgreSQL / SQLite  ← Persistent Event Log Database
```

---

## ✨ Features

| Feature | Details |
|---|---|
| **Live Monitoring Dashboard** | Real-time CPU, memory, and DB latency gauges with auto-refresh |
| **Event Simulator** | Trigger CPU load spikes, HTTP 500 errors, and mock API traffic from the browser |
| **Live Terminal** | Scrolling log terminal showing all server-side events |
| **Prometheus Metrics** | `/metrics` endpoint exposing counters, gauges, and histograms |
| **Health Probes** | `/api/health` used by K8s liveness & readiness probes |
| **Docker Compose** | Full 3-service stack with health checks and volume persistence |
| **Kubernetes Manifests** | PVC, Deployments, Services, ConfigMaps, and Ingress |
| **GitHub Actions CI/CD** | Lint → Test → Build Docker pipeline on every push |
| **Monitoring Script** | `monitor.sh` — CLI dashboard with ASCII banner and progress bars |

---

## 🚀 Quick Start

### Option A: Local Dev (SQLite — no Docker needed)

```bash
cd api
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Then open `web/index.html` in your browser. The dashboard auto-connects to `http://localhost:8000`.

---

### Option B: Full Docker Compose Stack (PostgreSQL)

```bash
docker-compose up --build
```

| Service | URL |
|---|---|
| Dashboard | http://localhost |
| FastAPI docs | http://localhost:8000/docs |
| Prometheus metrics | http://localhost/metrics |

> **Stop & remove volumes:** `docker-compose down -v`

---

### Option C: Kubernetes (Minikube)

```bash
# Build images first
docker build -f Dockerfile.api -t devops-lab-api:latest ./api
docker build -f Dockerfile.web -t devops-lab-web:latest .

# Load images into Minikube
minikube image load devops-lab-api:latest
minikube image load devops-lab-web:latest

# Apply all manifests
kubectl apply -f k8s/

# Access the dashboard
minikube service web
```

---

## 📊 CLI Monitoring Script

```bash
chmod +x monitor.sh
./monitor.sh http://localhost:8000
```

Displays a live ASCII dashboard with CPU/memory progress bars, database status, and the latest event log — polling every 3 seconds.

---

## 🔬 DevOps Lab Exercises

### Exercise 1 — Scale the API
```bash
kubectl scale deployment/api --replicas=3
kubectl get pods -w
```

### Exercise 2 — Simulate a Crash & Watch Recovery
```bash
# Delete a pod manually
kubectl delete pod <api-pod-name>
# Watch Kubernetes recreate it automatically
kubectl get pods -w
```

### Exercise 3 — Verify Volume Persistence
```bash
docker-compose down        # Stop all containers
docker-compose up -d       # Restart them
# Open the dashboard → event logs from before should still be there
```

### Exercise 4 — Inspect Prometheus Metrics
```bash
curl http://localhost:8000/metrics | grep devops_lab
```

### Exercise 5 — Rolling Update
```bash
# After rebuilding the API image with changes:
kubectl set image deployment/api api=devops-lab-api:v2
kubectl rollout status deployment/api
```

---

## 📁 Project Structure

```
devops-lab/
├── api/
│   ├── main.py             # FastAPI app with DB, metrics, simulators
│   └── requirements.txt    # Python dependencies
├── web/
│   ├── index.html          # Monitoring dashboard UI
│   ├── style.css           # Cyber-terminal design system
│   └── app.js              # Real-time polling and simulation logic
├── k8s/
│   ├── postgres.yaml       # PostgreSQL PVC + Deployment + Service
│   ├── api.yaml            # FastAPI Deployment + ConfigMap + Service
│   ├── web.yaml            # Nginx Deployment + NodePort Service
│   └── ingress.yaml        # Ingress routing rules
├── .github/workflows/
│   └── ci.yml              # GitHub Actions: lint → test → docker build
├── Dockerfile.api          # Multi-stage Python image for FastAPI
├── Dockerfile.web          # Nginx image serving the dashboard
├── nginx.conf              # Nginx reverse proxy + gzip config
├── docker-compose.yml      # 3-service local stack definition
├── monitor.sh              # CLI monitoring script (bash)
└── .dockerignore           # Docker build exclusions
```

---

## 🔑 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Root welcome message |
| GET | `/api/status` | CPU, memory, DB status telemetry |
| GET | `/api/logs?limit=N` | Fetch latest N event logs |
| POST | `/api/simulate-load` | Trigger CPU & memory spike |
| POST | `/api/simulate-error` | Trigger a 500 server error |
| POST | `/api/mock-traffic` | Inject a random API/DB/Auth event |
| GET | `/api/health` | Health probe (K8s liveness/readiness) |
| GET | `/metrics` | Prometheus exposition format metrics |
| GET | `/docs` | Swagger UI interactive documentation |