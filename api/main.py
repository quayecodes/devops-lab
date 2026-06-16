import os
import time
import random
import threading
from datetime import datetime
from typing import List

from fastapi import FastAPI, Depends, HTTPException, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

# Prometheus Metrics Client
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST, Counter, Gauge, Histogram

# ==========================================================================
# API App Initialization & CORS Setup
# ==========================================================================
app = FastAPI(
    title="DevOps Lab API",
    description="Backend API playground for simulating metrics, databases, and container lifecycle actions.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================================================
# Database Configuration (Dynamic: SQLITE vs POSTGRESQL)
# ==========================================================================
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./devops_lab.db")
IS_POSTGRES = DATABASE_URL.startswith("postgresql://") or DATABASE_URL.startswith("postgres://")

# If Postgres is used, enable connection configurations
connect_args = {} if IS_POSTGRES else {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Database Model
class EventLog(Base):
    __tablename__ = "event_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    event_type = Column(String, index=True)
    message = Column(String)

# Create tables
Base.metadata.create_all(bind=engine)

# DB Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Pydantic Schemas
class EventLogCreate(BaseModel):
    event_type: str
    message: str

class EventLogOut(BaseModel):
    id: int
    timestamp: datetime
    event_type: str
    message: str

    class Config:
        orm_mode = True

# ==========================================================================
# Prometheus Telemetry Metrics Definitions
# ==========================================================================
# Latency & Requests Counter
REQUEST_COUNT = Counter(
    "devops_lab_http_requests_total",
    "Total HTTP requests received",
    ["method", "endpoint", "status_code"]
)

REQUEST_LATENCY = Histogram(
    "devops_lab_http_request_latency_seconds",
    "HTTP request latency in seconds",
    ["method", "endpoint"]
)

# Simulated Hardware Telemetry Gauges
CPU_GAUGE = Gauge("devops_lab_cpu_utilization_ratio", "Simulated CPU utilization percentage (0-100)")
MEM_GAUGE = Gauge("devops_lab_memory_utilization_ratio", "Simulated memory utilization percentage (0-100)")
DB_LATENCY_GAUGE = Gauge("devops_lab_database_latency_seconds", "Database query response latency in seconds")
ERROR_COUNT = Counter("devops_lab_system_errors_total", "Total simulated system errors triggered")

# Initialize default values
CPU_GAUGE.set(15.2)
MEM_GAUGE.set(42.8)
DB_LATENCY_GAUGE.set(0.005)

# ==========================================================================
# Global Simulated Load Variables
# ==========================================================================
target_cpu = 15.0
target_mem = 42.0

# Background thread to smoothly fluctuate CPU/Memory values
def metrics_background_updater():
    global target_cpu, target_mem
    while True:
        try:
            # Gradually drift current values towards targets
            current_cpu = CPU_GAUGE._value.get()
            current_mem = MEM_GAUGE._value.get()

            # Random natural fluctuations
            noise_cpu = random.uniform(-1.5, 1.5)
            noise_mem = random.uniform(-0.5, 0.5)

            new_cpu = current_cpu + (target_cpu - current_cpu) * 0.15 + noise_cpu
            new_mem = current_mem + (target_mem - current_mem) * 0.10 + noise_mem

            # Clamp boundaries
            new_cpu = max(2.0, min(99.8, new_cpu))
            new_mem = max(5.0, min(95.0, new_mem))

            CPU_GAUGE.set(round(new_cpu, 2))
            MEM_GAUGE.set(round(new_mem, 2))

            # Simulate database check query latency
            db_noise = random.uniform(0.001, 0.008)
            DB_LATENCY_GAUGE.set(round(db_noise, 4))

            # If load simulation was high, cool it down slowly
            if target_cpu > 20.0:
                target_cpu -= 1.0  # slowly decay stress load
            if target_mem > 45.0:
                target_mem -= 0.2  # slowly decay memory

        except Exception as e:
            print("Telemetry update error: ", e)
        time.sleep(2.0)

# Start background daemon thread
threading.Thread(target=metrics_background_updater, daemon=True).start()

# ==========================================================================
# Middleware to track HTTP metrics
# ==========================================================================
@app.middleware("http")
async def track_metrics_middleware(request: Request, call_next):
    method = request.method
    endpoint = request.url.path
    
    # Avoid tracking metrics endpoint to prevent polling pollution
    if endpoint == "/metrics":
        return await call_next(request)

    start_time = time.time()
    
    # Process request
    response = await call_next(request)
    
    # Record metrics
    latency = time.time() - start_time
    status_code = str(response.status_code)
    
    REQUEST_COUNT.labels(method=method, endpoint=endpoint, status_code=status_code).inc()
    REQUEST_LATENCY.labels(method=method, endpoint=endpoint).observe(latency)
    
    return response

# ==========================================================================
# Core Routes
# ==========================================================================

@app.get("/")
def read_root():
    return {
        "message": "Welcome to the DevOps Lab API!",
        "documentation": "/docs",
        "metrics": "/metrics"
    }

# Prometheus endpoint
@app.get("/metrics")
def get_metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)

# Status Check
@app.get("/api/status")
def get_status(db: Session = Depends(get_db)):
    try:
        # Measure DB connection speed
        t_start = time.time()
        db_count = db.query(EventLog).count()
        db_latency = time.time() - t_start
        db_status = "Healthy"
    except Exception as e:
        db_status = f"Unreachable: {str(e)}"
        db_count = 0
        db_latency = 1.0

    return {
        "container_name": os.getenv("HOSTNAME", "localhost-dev-node"),
        "environment": "Production (Postgres)" if IS_POSTGRES else "Development (SQLite)",
        "database": {
            "status": db_status,
            "engine": "PostgreSQL" if IS_POSTGRES else "SQLite",
            "connection_latency_seconds": round(db_latency, 4),
            "total_records": db_count
        },
        "telemetry": {
            "cpu_utilization_pct": CPU_GAUGE._value.get(),
            "memory_utilization_pct": MEM_GAUGE._value.get()
        }
    }

# Fetch Logs
@app.get("/api/logs", response_model=List[EventLogOut])
def get_logs(limit: int = 20, db: Session = Depends(get_db)):
    logs = db.query(EventLog).order_by(EventLog.id.desc()).limit(limit).all()
    return logs

# Load Generator Simulation
@app.post("/api/simulate-load")
def simulate_load(db: Session = Depends(get_db)):
    global target_cpu, target_mem
    # Trigger heavy background CPU load spike
    target_cpu = 88.5
    target_mem = 68.2

    # Write log to DB
    new_log = EventLog(
        event_type="SYS_STRESS",
        message="Simulated system load test triggered. Spiking CPU & Memory gauges."
    )
    db.add(new_log)
    db.commit()
    db.refresh(new_log)

    # Short busy loop to cause a physical CPU lag spike
    t_end = time.time() + 0.1
    while time.time() < t_end:
        _ = 1234 * 5678  # math block

    return {"message": "CPU & Memory load stress test triggered successfully.", "target_cpu_pct": target_cpu}

# Error Simulation
@app.post("/api/simulate-error")
def simulate_error(db: Session = Depends(get_db)):
    ERROR_COUNT.inc()
    
    # Write error log to DB
    new_log = EventLog(
        event_type="SYS_ERROR",
        message="CRITICAL: Simulated Database socket failure in container gateway."
    )
    db.add(new_log)
    db.commit()
    db.refresh(new_log)

    raise HTTPException(
        status_code=500,
        detail="Internal Server Error: Simulated connection socket breakdown."
    )

# Traffic Generation Simulation
@app.post("/api/mock-traffic")
def mock_traffic(db: Session = Depends(get_db)):
    events = [
        ("API_REQ", "GET /v1/products - Response 200 OK"),
        ("API_REQ", "POST /v1/checkout - Response 201 Created"),
        ("AUTH_EVENT", "User account 'test-user@devops.com' signed in successfully."),
        ("SYS_INFO", "Garbage collection freed 42MB heap references."),
        ("DB_QUERY", "SELECT * FROM users WHERE status = 'active' (completed in 4ms)")
    ]
    
    event_type, message = random.choice(events)
    new_log = EventLog(event_type=event_type, message=message)
    db.add(new_log)
    db.commit()
    db.refresh(new_log)

    return {"message": "Traffic event registered.", "event": {"type": event_type, "message": message}}

# Health Check (Liveness/Readiness probe target)
@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    try:
        # Assert database select operates
        db.execute("SELECT 1")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unhealthy: Database verification query failed. Details: {str(e)}"
        )
