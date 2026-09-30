#!/usr/bin/env bash
# ============================================================
# Inscolar – Smoke tests de Fase 0
# Uso: bash test/smoke.sh [PORT]
# Levanta el servidor temporalmente, ejecuta verificaciones
# básicas y termina el proceso al finalizar.
# ============================================================

PORT="${1:-3000}"
BASE="http://localhost:${PORT}"
PASS=0; FAIL=0

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

ok()   { echo -e "  ${GREEN}PASS${NC} $1"; ((PASS++)); }
fail() { echo -e "  ${RED}FAIL${NC} $1"; ((FAIL++)); }
info() { echo -e "  ${YELLOW}INFO${NC} $1"; }

# --- arrancar servidor ---
COOKIE_ADMIN=$(mktemp); COOKIE_TUTOR=$(mktemp)
PORT=$PORT node server.js > /tmp/inscolar_smoke.log 2>&1 &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null; rm -f $COOKIE_ADMIN $COOKIE_TUTOR" EXIT
# Esperar a que el servidor esté listo (hasta 6s)
for i in $(seq 1 12); do
  curl -s "$BASE/api/auth/setup-needed" >/dev/null 2>&1 && break
  sleep 0.5
done

echo ""
echo "================================================================"
echo " Inscolar Smoke Tests  –  commit $(git rev-parse --short HEAD)"
echo " Servidor PID $SERVER_PID  →  $BASE"
echo "================================================================"

# ---- Helpers ----
get() {  curl -s -b "$2" "$BASE$1" 2>/dev/null; }
post() { curl -s -X POST "$BASE$1" -H "Content-Type: application/json" -d "$2" -c "$3" -b "$3" 2>/dev/null; }

# === 0. Servidor responde ===
echo ""
echo "[ Grupo 0 – Conectividad ]"
SETUP=$(curl -s "$BASE/api/auth/setup-needed" 2>/dev/null || echo "")
if echo "$SETUP" | grep -q '"needed"'; then ok "GET /api/auth/setup-needed responde JSON";
else fail "GET /api/auth/setup-needed no responde"; fi

# === 1. Autenticación ===
echo ""
echo "[ Grupo 1 – Autenticación ]"

ADMIN_LOGIN=$(post "/api/auth/login" '{"email":"maria.rosario@inscolar.do","password":"Inscolar#2026"}' "$COOKIE_ADMIN")
if echo "$ADMIN_LOGIN" | grep -q '"status":"ok"'; then ok "Login admin correcto";
else fail "Login admin falló: $ADMIN_LOGIN"; fi

BAD_LOGIN=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"maria.rosario@inscolar.do","password":"wrong"}' 2>/dev/null || echo '{"status":"err"}')
if echo "$BAD_LOGIN" | grep -q '"error"'; then ok "Login contraseña incorrecta devuelve error";
else fail "Login contraseña incorrecta no devuelve error"; fi

INACTIVE_LOGIN=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"y.sanchez@inscolar.do","password":"Inscolar#2026"}' 2>/dev/null || echo '{}')
if echo "$INACTIVE_LOGIN" | grep -q 'desactivada'; then ok "Login cuenta desactivada rechazado (Soporte)";
else fail "Login cuenta desactivada no rechazado"; fi

TUTOR_LOGIN=$(post "/api/auth/login" '{"email":"ana.beltre@correo.do","password":"Inscolar#2026"}' "$COOKIE_TUTOR")
if echo "$TUTOR_LOGIN" | grep -q '"role":"Tutor"'; then ok "Login tutor correcto";
else fail "Login tutor falló"; fi

NO_COOKIE=$(curl -s "$BASE/api/users" 2>/dev/null || echo '{"error":"No"}')
if echo "$NO_COOKIE" | grep -q '"error"'; then ok "Sin sesión → 401 en ruta protegida";
else fail "Sin sesión no devuelve error en ruta protegida"; fi

ME=$(get "/api/auth/me" "$COOKIE_ADMIN")
if echo "$ME" | grep -q '"email":"maria.rosario@inscolar.do"'; then ok "GET /api/auth/me devuelve usuario activo";
else fail "GET /api/auth/me no devuelve usuario"; fi

# === 2. Permisos por rol ===
echo ""
echo "[ Grupo 2 – Control de acceso por rol ]"

TUTOR_USERS=$(get "/api/users" "$COOKIE_TUTOR")
if echo "$TUTOR_USERS" | grep -q '"error"'; then ok "Tutor no puede listar /api/users";
else fail "Tutor PUEDE listar /api/users (fuga de datos)"; fi

TUTOR_CREATE_USER=$(curl -s -X POST "$BASE/api/users" -b "$COOKIE_TUTOR" \
  -H "Content-Type: application/json" -d '{"role":"Administrador","nombre":"Hacker","email":"hack@x.do"}' 2>/dev/null || echo '{}')
if echo "$TUTOR_CREATE_USER" | grep -q '"error"'; then ok "Tutor no puede crear usuarios";
else fail "Tutor PUEDE crear usuarios (escalada de privilegios)"; fi

TUTOR_CREATE_INST=$(curl -s -X POST "$BASE/api/institutions" -b "$COOKIE_TUTOR" \
  -H "Content-Type: application/json" -d '{"nombre":"X","provincia":"DN","distrito":"10-01"}' 2>/dev/null || echo '{}')
if echo "$TUTOR_CREATE_INST" | grep -q '"error"'; then ok "Tutor no puede crear instituciones";
else fail "Tutor PUEDE crear instituciones (escalada)"; fi

ADMIN_USERS=$(get "/api/users" "$COOKIE_ADMIN")
if echo "$ADMIN_USERS" | grep -q '"total"'; then ok "Admin puede listar /api/users";
else fail "Admin no puede listar /api/users"; fi

ADMIN_INSTS=$(get "/api/institutions" "$COOKIE_ADMIN")
if echo "$ADMIN_INSTS" | grep -q '"total":24'; then ok "Admin: 24 instituciones retornadas";
else fail "Admin: instituciones inesperadas – respuesta: ${ADMIN_INSTS:0:80}"; fi

# === 3. Módulos principales ===
echo ""
echo "[ Grupo 3 – Módulos ]"

ENROLLMENTS=$(get "/api/enrollments" "$COOKIE_ADMIN")
if echo "$ENROLLMENTS" | grep -q '"total"'; then ok "GET /api/enrollments responde";
else fail "GET /api/enrollments falla"; fi

APPOINTMENTS=$(get "/api/appointments" "$COOKIE_ADMIN")
if echo "$APPOINTMENTS" | grep -q '"total"'; then ok "GET /api/appointments responde";
else fail "GET /api/appointments falla"; fi

LOGS=$(get "/api/logs" "$COOKIE_ADMIN")
if echo "$LOGS" | grep -q '"total"'; then ok "GET /api/logs responde (admin)";
else fail "GET /api/logs falla para admin"; fi

ANALYTICS=$(get "/api/analytics/summary" "$COOKIE_ADMIN")
if echo "$ANALYTICS" | grep -q '"totalUsuarios"'; then ok "GET /api/analytics/summary responde";
else fail "GET /api/analytics/summary falla"; fi

NOTIF=$(get "/api/notifications" "$COOKIE_ADMIN")
if echo "$NOTIF" | grep -q '"notifications"'; then ok "GET /api/notifications responde";
else fail "GET /api/notifications falla"; fi

# Tutor audit log should be forbidden
TUTOR_LOGS=$(get "/api/logs" "$COOKIE_TUTOR")
if echo "$TUTOR_LOGS" | grep -q '"error"'; then ok "Tutor no puede acceder a /api/logs";
else fail "Tutor PUEDE acceder a /api/logs (fuga de auditoría)"; fi

# === 4. Resumen ===
echo ""
echo "================================================================"
TOTAL=$((PASS+FAIL))
echo " RESULTADOS: ${PASS}/${TOTAL} pasaron"
if [ $FAIL -gt 0 ]; then
  echo -e " ${RED}${FAIL} FALLO(S) detectado(s)${NC}"
  exit 1
else
  echo -e " ${GREEN}Todos los checks pasaron.${NC}"
fi
echo "================================================================"
echo ""
