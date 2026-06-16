// ==========================================================================
// DevOps Lab Dashboard - Frontend JS Controller
// ==========================================================================

const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:8000"
  : "/api-proxy"; // When running behind Nginx, proxy is /api-proxy

let logEntries = [];
let pollInterval = null;
const POLL_MS = 3000;

// ==========================================================================
// Clock
// ==========================================================================
const updateClock = () => {
  const now = new Date();
  const t = now.toTimeString().split(" ")[0];
  document.getElementById("clock").textContent = t;
};
setInterval(updateClock, 1000);
updateClock();

// ==========================================================================
// Toast Notifications
// ==========================================================================
const showToast = (message, type = "info", icon = "ℹ️", duration = 4000) => {
  const area = document.getElementById("notification-area");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg">${message}</span>`;
  area.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("out");
    setTimeout(() => toast.remove(), 350);
  }, duration);
};

// ==========================================================================
// Gauge + Bar Updater
// ==========================================================================
const updateGauge = (arcId, textId, barId, badgeId, pct) => {
  const totalDash = 157; // arc path dasharray (semicircle perimeter for r=50)
  const arc = document.getElementById(arcId);
  const txt = document.getElementById(textId);
  const bar = document.getElementById(barId);
  const badge = document.getElementById(badgeId);

  if (!arc || !txt) return;

  const offset = totalDash - (pct / 100) * totalDash;
  arc.style.strokeDashoffset = offset;
  txt.textContent = `${Math.round(pct)}%`;

  if (bar) bar.style.width = `${pct}%`;

  if (badge) {
    badge.className = "metric-badge";
    if (pct > 85) {
      badge.textContent = "Critical";
      badge.classList.add("danger");
      arc.style.stroke = "#ff1744";
    } else if (pct > 65) {
      badge.textContent = "High";
      badge.classList.add("warning");
      arc.style.stroke = "#ff9100";
    } else {
      badge.textContent = "Normal";
      badge.classList.add("success");
    }
  }
};

// ==========================================================================
// Fetch Status Metrics from API
// ==========================================================================
const fetchStatus = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Update CPU & Memory gauges
    const cpu = data.telemetry?.cpu_utilization_pct ?? 0;
    const mem = data.telemetry?.memory_utilization_pct ?? 0;
    updateGauge("cpu-gauge-arc", "cpu-gauge-text", "cpu-bar", "cpu-status-badge", cpu);
    updateGauge("mem-gauge-arc", "mem-gauge-text", "mem-bar", "mem-status-badge", mem);

    // DB Latency
    const latencyMs = Math.round((data.database?.connection_latency_seconds ?? 0) * 1000);
    const latencyEl = document.getElementById("db-latency");
    if (latencyEl) {
      latencyEl.textContent = latencyMs;
      latencyEl.style.color = latencyMs > 50 ? "#ff9100" : latencyMs > 200 ? "#ff1744" : "#00e5ff";
    }

    const dbBadge = document.getElementById("db-status-badge");
    if (dbBadge) {
      const isHealthy = data.database?.status === "Healthy";
      dbBadge.textContent = isHealthy ? "Online" : "Error";
      dbBadge.className = `metric-badge ${isHealthy ? "success" : "danger"}`;

      // Update service dots
      const apiDot = document.getElementById("svc-api-dot");
      const dbDot = document.getElementById("svc-db-dot");
      if (apiDot) apiDot.className = `svc-dot ${isHealthy ? "online" : "checking"}`;
      if (dbDot)  dbDot.className  = `svc-dot ${isHealthy ? "online" : "checking"}`;
    }

    // Engine label & records
    const engineEl = document.getElementById("db-engine-label");
    const recEl    = document.getElementById("db-records-label");
    if (engineEl) engineEl.textContent = `Engine: ${data.database?.engine ?? "--"}`;
    if (recEl)    recEl.textContent    = `Records: ${data.database?.total_records ?? 0}`;

    // Update DB name in architecture box
    const dbNameEl = document.getElementById("svc-db-name");
    if (dbNameEl) dbNameEl.textContent = `db (${data.database?.engine ?? "SQLite"})`;

    // Header badges
    const envLabel = document.getElementById("env-label");
    const cnLabel  = document.getElementById("container-label");
    if (envLabel) envLabel.textContent = data.environment ?? "Dev";
    if (cnLabel)  cnLabel.textContent  = data.container_name ?? "local";

  } catch (err) {
    console.warn("Status poll failed:", err.message);
    const apiDot = document.getElementById("svc-api-dot");
    if (apiDot) apiDot.className = "svc-dot checking";
  }
};

// ==========================================================================
// Fetch Recent Logs
// ==========================================================================
const fetchLogs = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/logs?limit=30`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const logs = await res.json();

    // Detect new entries by comparing IDs
    const existingIds = new Set(logEntries.map(l => l.id));
    const newLogs = logs.filter(l => !existingIds.has(l.id));

    if (newLogs.length > 0) {
      logEntries = [...logs];
      renderLogs(newLogs);

      const lastEvEl = document.getElementById("last-event-type");
      if (lastEvEl && logs.length > 0) lastEvEl.textContent = logs[0].event_type;
    }

    const totalEl = document.getElementById("total-logs");
    if (totalEl) totalEl.textContent = logs.length;

    const badgeEl = document.getElementById("log-count-badge");
    if (badgeEl) badgeEl.textContent = `${logs.length} events`;

  } catch (err) {
    console.warn("Logs poll failed:", err.message);
  }
};

// ==========================================================================
// Terminal Renderer
// ==========================================================================
const renderLogs = (newLogs) => {
  const terminal = document.getElementById("terminal-output");
  if (!terminal) return;

  // Remove placeholder if present
  const placeholder = terminal.querySelector(".terminal-placeholder");
  if (placeholder) placeholder.remove();

  newLogs.forEach(log => {
    const time = new Date(log.timestamp).toLocaleTimeString("en-GB");
    const line = document.createElement("div");
    line.className = "log-line";
    line.innerHTML = `
      <span class="log-time">[${time}]</span>
      <span class="log-type type-${log.event_type}">${log.event_type}</span>
      <span class="log-msg">${log.message}</span>
    `;
    // Prepend so newest is at top
    terminal.insertBefore(line, terminal.firstChild);
  });
};

const clearTerminal = () => {
  const terminal = document.getElementById("terminal-output");
  if (terminal) {
    terminal.innerHTML = `<div class="terminal-placeholder"><span class="blink-cursor">█</span> Terminal cleared. Awaiting events...</div>`;
    logEntries = [];
    const badgeEl = document.getElementById("log-count-badge");
    if (badgeEl) badgeEl.textContent = "0 events";
  }
};

// ==========================================================================
// Simulation Triggers
// ==========================================================================
const setButtonLoading = (id, loading) => {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.classList.toggle("active", loading);
};

const triggerLoad = async () => {
  setButtonLoading("btn-load", true);
  try {
    const res = await fetch(`${API_BASE}/api/simulate-load`, { method: "POST" });
    const data = await res.json();
    showToast(`🔥 Load test triggered! CPU target set to ~${data.target_cpu_pct?.toFixed(0) ?? 88}%`, "error", "🔥", 5000);
    await fetchStatus();
    await fetchLogs();
  } catch (err) {
    showToast("Failed to reach API. Is the server running?", "error", "❌");
  } finally {
    setTimeout(() => setButtonLoading("btn-load", false), 3000);
  }
};

const triggerTraffic = async () => {
  setButtonLoading("btn-traffic", true);
  try {
    const res = await fetch(`${API_BASE}/api/mock-traffic`, { method: "POST" });
    const data = await res.json();
    showToast(`📶 Traffic event logged: ${data.event?.type}`, "info", "📡", 3000);
    await fetchLogs();
  } catch (err) {
    showToast("Failed to reach API. Is the server running?", "error", "❌");
  } finally {
    setTimeout(() => setButtonLoading("btn-traffic", false), 1000);
  }
};

const triggerError = async () => {
  setButtonLoading("btn-error", true);
  try {
    await fetch(`${API_BASE}/api/simulate-error`, { method: "POST" });
  } catch (_) {
    // 500 errors always throw in fetch - expected
  }
  showToast("💥 Server error simulated! 500 Internal Server Error triggered.", "error", "💥", 4000);
  await fetchLogs();
  setTimeout(() => setButtonLoading("btn-error", false), 1500);
};

// ==========================================================================
// Manual Refresh Button
// ==========================================================================
document.getElementById("refresh-btn")?.addEventListener("click", async () => {
  const btn = document.getElementById("refresh-btn");
  btn?.classList.add("spinning");
  await Promise.all([fetchStatus(), fetchLogs()]);
  setTimeout(() => btn?.classList.remove("spinning"), 700);
  showToast("Metrics refreshed successfully.", "success", "✅", 2000);
});

// ==========================================================================
// Polling Loop - auto refresh every POLL_MS
// ==========================================================================
const startPolling = () => {
  fetchStatus();
  fetchLogs();
  pollInterval = setInterval(async () => {
    await fetchStatus();
    await fetchLogs();
  }, POLL_MS);
};

// ==========================================================================
// Init
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
  startPolling();
});
