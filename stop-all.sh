#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "    DETENIENDO ECOSISTEMA SERVILLANTAS SYSTEM"
echo "=========================================================="

echo "Deteniendo servicios en puertos (4200, 8080-8089)..."
fuser -k -9 4200/tcp 8080/tcp 8081/tcp 8082/tcp 8083/tcp 8084/tcp 8085/tcp 8086/tcp 8087/tcp 8088/tcp 8089/tcp 2>/dev/null || true

echo "Deteniendo procesos Java y Node asociados..."
pkill -9 -f "spring-boot:run" 2>/dev/null || true
pkill -9 -f "ms-" 2>/dev/null || true
pkill -9 -f "ng serve" 2>/dev/null || true

echo "=========================================================="
echo "  [OK] Todo el ecosistema ha sido detenido de golpe."
echo "=========================================================="

