#!/usr/bin/env bash
# Fiziksel cihaz için API'yi internet üzerinden açar (LAN/AP isolation'ı aşar).
# Kullanım: backend ayaktayken  →  npm run dev:tunnel
# Çıkan https://….trycloudflare.com adresini lingola-frontend/.env → API_BASE_URL yap.
set -euo pipefail

PORT="${PORT:-3001}"
echo "[tunnel] http://127.0.0.1:${PORT} → Cloudflare quick tunnel"
echo "[tunnel] URL'yi kopyalayıp frontend .env API_BASE_URL'e yapıştır, sonra flutter run."
exec cloudflared tunnel --url "http://127.0.0.1:${PORT}" --no-autoupdate
