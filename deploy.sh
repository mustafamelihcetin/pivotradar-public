#!/usr/bin/env bash
# deploy.sh — Build ve sunucuya clean deploy
# Kullanım: bash deploy.sh
set -e

REMOTE="root@46.62.141.179"
REMOTE_ASSETS="/opt/pivotradar/backend/app/static/react/assets"
REMOTE_ROOT="/opt/pivotradar/backend/app/static/react"
DIST="frontend/dist"

echo "=== Build başlatılıyor ==="
cd frontend
npm run build
cd ..

echo "=== Tüm assets önce yükleniyor (index.html'den önce) ==="
scp "$DIST/assets/"* "$REMOTE:$REMOTE_ASSETS/"

echo "=== index.html güncelleniyor ==="
scp "$DIST/index.html" "$REMOTE:$REMOTE_ROOT/"

echo "=== Eski dosyalar temizleniyor ==="
NEW_FILES=$(ls "$DIST/assets/")
ssh "$REMOTE" bash << ENDSSH
cd "$REMOTE_ASSETS"
deleted=0
for f in *; do
  if ! echo "$NEW_FILES" | grep -qx "\$f"; then
    rm -f "\$f"
    deleted=\$((deleted+1))
  fi
done
echo "Silinen eski dosya: \$deleted"
echo "Kalan dosya: \$(ls | wc -l)"
ENDSSH

echo "=== Deploy tamamlandı ==="
