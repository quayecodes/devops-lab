#!/usr/bin/env bash
# ==========================================================================
# DevOps Lab - Mock Monitoring Script (monitor.sh)
# Continuously polls the FastAPI /api/status endpoint and prints
# a formatted live summary to the terminal every few seconds.
# Usage: chmod +x monitor.sh && ./monitor.sh [API_URL]
# ==========================================================================

API_URL="${1:-http://localhost:8000}"
POLL_INTERVAL=3
SEPARATOR="─────────────────────────────────────────────────────"

# ANSI colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

check_dependency() {
  command -v "$1" > /dev/null 2>&1 || { echo "Error: '$1' is required but not installed."; exit 1; }
}

check_dependency curl
check_dependency jq

print_header() {
  clear
  echo -e "${BOLD}${CYAN}"
  echo "  ██████╗ ███████╗██╗   ██╗ ██████╗ ██████╗ ███████╗"
  echo "  ██╔══██╗██╔════╝██║   ██║██╔═══██╗██╔══██╗██╔════╝"
  echo "  ██║  ██║█████╗  ██║   ██║██║   ██║██████╔╝███████╗"
  echo "  ██║  ██║██╔══╝  ╚██╗ ██╔╝██║   ██║██╔═══╝ ╚════██║"
  echo "  ██████╔╝███████╗ ╚████╔╝ ╚██████╔╝██║     ███████║"
  echo "  ╚═════╝ ╚══════╝  ╚═══╝   ╚═════╝ ╚═╝     ╚══════╝"
  echo -e "${RESET}${BOLD}  DevOps Lab — Live Monitor      Target: ${API_URL}${RESET}"
  echo -e "  ${CYAN}Polling every ${POLL_INTERVAL}s  |  Press Ctrl+C to exit${RESET}"
  echo ""
}

bar() {
  local val=$1 max=100 filled empty
  filled=$(( val * 30 / max ))
  empty=$(( 30 - filled ))
  local color="${GREEN}"
  (( val > 65 )) && color="${YELLOW}"
  (( val > 85 )) && color="${RED}"
  printf "${color}["
  printf "%${filled}s" | tr ' ' '█'
  printf "%${empty}s" | tr ' ' '░'
  printf "]${RESET} ${BOLD}%3d%%${RESET}" "$val"
}

while true; do
  print_header

  RESPONSE=$(curl -s --max-time 4 "${API_URL}/api/status" 2>/dev/null)
  EXIT_CODE=$?

  if [ $EXIT_CODE -ne 0 ] || [ -z "$RESPONSE" ]; then
    echo -e "  ${RED}✗ Cannot reach API at ${API_URL}${RESET}"
    echo -e "  Is the server running? (docker-compose up)"
    echo ""
  else
    ENV=$(echo "$RESPONSE" | jq -r '.environment // "Unknown"')
    CONTAINER=$(echo "$RESPONSE" | jq -r '.container_name // "Unknown"')
    CPU_PCT=$(echo "$RESPONSE" | jq -r '.telemetry.cpu_utilization_pct // 0' | xargs printf "%.0f")
    MEM_PCT=$(echo "$RESPONSE" | jq -r '.telemetry.memory_utilization_pct // 0' | xargs printf "%.0f")
    DB_STATUS=$(echo "$RESPONSE" | jq -r '.database.status // "Unknown"')
    DB_ENGINE=$(echo "$RESPONSE" | jq -r '.database.engine // "Unknown"')
    DB_LATENCY=$(echo "$RESPONSE" | jq -r '.database.connection_latency_seconds // 0')
    DB_LATENCY_MS=$(awk "BEGIN {printf \"%.2f\", $DB_LATENCY * 1000}")
    RECORDS=$(echo "$RESPONSE" | jq -r '.database.total_records // 0')

    echo -e "  ${BOLD}ENVIRONMENT${RESET}  →  ${CYAN}${ENV}${RESET}"
    echo -e "  ${BOLD}CONTAINER${RESET}    →  ${CYAN}${CONTAINER}${RESET}"
    echo ""
    echo -e "  ${SEPARATOR}"
    echo -e "  ${BOLD}TELEMETRY${RESET}"
    echo ""
    printf "  CPU Usage    →  "; bar "$CPU_PCT"; echo ""
    printf "  Memory Usage →  "; bar "$MEM_PCT"; echo ""
    echo ""
    echo -e "  ${SEPARATOR}"
    echo -e "  ${BOLD}DATABASE${RESET}"
    echo ""
    if [ "$DB_STATUS" = "Healthy" ]; then
      DB_ICON="${GREEN}●${RESET}"
    else
      DB_ICON="${RED}●${RESET}"
    fi
    echo -e "  Status       →  ${DB_ICON} ${DB_STATUS}"
    echo -e "  Engine       →  ${DB_ENGINE}"
    echo -e "  Latency      →  ${DB_LATENCY_MS}ms"
    echo -e "  Log Records  →  ${RECORDS}"
    echo ""

    # Fetch latest log
    LATEST_LOG=$(curl -s --max-time 3 "${API_URL}/api/logs?limit=1" 2>/dev/null)
    LOG_TYPE=$(echo "$LATEST_LOG" | jq -r '.[0].event_type // "—"')
    LOG_MSG=$(echo "$LATEST_LOG" | jq -r '.[0].message // "No events yet."')
    echo -e "  ${SEPARATOR}"
    echo -e "  ${BOLD}LATEST EVENT${RESET}"
    echo ""
    echo -e "  Type:  ${YELLOW}${LOG_TYPE}${RESET}"
    echo -e "  Msg:   ${LOG_MSG:0:72}"
    echo ""
  fi

  echo -e "  ${SEPARATOR}"
  echo -e "  ${CYAN}Last updated: $(date '+%H:%M:%S')${RESET}"
  sleep "$POLL_INTERVAL"
done
