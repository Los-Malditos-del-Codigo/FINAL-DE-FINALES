#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "     INICIANDO ECOSISTEMA SERVILLANTAS SYSTEM"
echo "=========================================================="

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$ROOT_DIR/data" "$ROOT_DIR/logs"

# 1. Configurar PATH para Node y npm si no estan en el entorno
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  NVM_NODE_BIN="$(find "$HOME/.nvm/versions/node" -maxdepth 2 -name "bin" 2>/dev/null | sort -V | tail -n 1)"
  if [ -n "$NVM_NODE_BIN" ]; then
    export PATH="$NVM_NODE_BIN:$PATH"
    echo "[OK] Node/npm configurado desde NVM: $(node -v)"
  fi
fi

# 2. Cargar variables de entorno desde .env
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
  echo "[OK] Variables de entorno cargadas desde .env"
else
  echo "[WARN] No se encontro archivo .env"
fi

# 3. Validar conexion a Base de Datos (fallback a H2 unificado si PostgreSQL local no esta activo)
DB_HOST="localhost"
DB_PORT="5432"
if [[ "$DB_URL" == *"localhost:5432"* ]] || [[ -z "$DB_URL" ]]; then
  if ! timeout 1 bash -c "cat < /dev/null > /dev/tcp/$DB_HOST/$DB_PORT" 2>/dev/null; then
    echo "[INFO] PostgreSQL no detectado en $DB_HOST:$DB_PORT."
    echo "[INFO] Activando base de datos unificada H2 (AUTO_SERVER=TRUE) en $ROOT_DIR/data/servillantas_db..."
    export DB_URL="jdbc:h2:file:$ROOT_DIR/data/servillantas_db;AUTO_SERVER=TRUE;DB_CLOSE_DELAY=-1;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH"
    export DB_DRIVER="org.h2.Driver"
    export DB_USER="sa"
    export DB_USERNAME="sa"
    export DB_PASSWORD=""
    export JPA_DDL_AUTO="update"
  fi
fi

# 4. Asegurar permisos de ejecucion en wrappers Maven
chmod +x "$ROOT_DIR"/ms-*/mvnw 2>/dev/null || true

SERVICES=(
  "ms-productos:8082"
  "ms-autenticacion-usuarios:8081"
  "ms-inventario:8083"
  "ms-compras:8084"
  "ms-ventas:8085"
  "ms-servicios:8086"
  "ms-alertas-notificaciones:8087"
  "ms-reportes:8088"
  "ms-asistente-ia:8089"
  "ms-api-gateway:8080"
)

echo ""
echo ">>> Iniciando microservicios en segundo plano..."
for item in "${SERVICES[@]}"; do
  SVC="${item%%:*}"
  PORT="${item##*:}"
  echo "Iniciando $SVC (puerto $PORT)..."
  (
    cd "$ROOT_DIR/$SVC"
    MVN_CMD="./mvnw"
    [ ! -f "$MVN_CMD" ] && MVN_CMD="mvn"
    nohup setsid $MVN_CMD spring-boot:run -Dspring-boot.run.jvmArguments="-Xmx160m" </dev/null > "$ROOT_DIR/logs/$SVC.log" 2>&1 &
  )
  sleep 3
done

echo ""
echo ">>> Iniciando Frontend Angular (puerto 4200)..."
(
  cd "$ROOT_DIR/frontend"
  nohup setsid npm start </dev/null > "$ROOT_DIR/logs/frontend.log" 2>&1 &
)

echo ""
echo "=========================================================="
echo "  Todos los servicios arrancados en segundo plano."
echo "  - Frontend:     http://localhost:4200"
echo "  - API Gateway:  http://localhost:8080"
echo "  - Asistente IA: http://localhost:8089"
echo "  - Credenciales demo:"
echo "      admin@servillantas.pe    / admin123  (PROPIETARIO)"
echo "      operador@servillantas.pe / operador123 (PERSONAL)"
echo "=========================================================="
echo "Para apagar todo de golpe ejecuta: ./stop-all.sh"
echo "O con comando directo: fuser -k -9 4200/tcp 8080/tcp 8081/tcp 8082/tcp 8083/tcp 8084/tcp 8085/tcp 8086/tcp 8087/tcp 8088/tcp 8089/tcp 2>/dev/null; pkill -9 -f 'spring-boot|ng serve'"
echo "=========================================================="

if [ "$1" = "--wait" ] || [ "$1" = "-w" ] || [ "$DAEMON" = "true" ]; then
  echo ""
  echo "[DAEMON] Ecosistema Servillantas activo en segundo plano. Monitoreando..."
  while true; do
    sleep 15
  done
fi
