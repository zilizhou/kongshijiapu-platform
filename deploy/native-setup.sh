#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="${NODE_BIN:-/home/zlzhou/.nvm/versions/node/v24.14.0/bin}"
export PATH="$NODE_BIN:$PATH"

MYSQL_USER="${MYSQL_USER:-kongjp}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-kongjp_pass_2026}"
MYSQL_DB="${MYSQL_DB:-kzjp01}"
APP_PORT="${APP_PORT:-8090}"
APP_USER="${APP_USER:-zlzhou}"

echo "==> Using node: $(node -v) npm: $(npm -v)"

cd "$ROOT/web"
if [ ! -d node_modules ]; then
  echo "==> npm ci"
  npm ci
else
  echo "==> npm install"
  npm install
fi

cat > "$ROOT/web/.env.local" <<EOF
DATABASE_URL=mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@127.0.0.1:3306/${MYSQL_DB}
AUTH_SECRET=${AUTH_SECRET:-kong-jiapu-prod-secret-9f3a2c1b7e}
PORT=${APP_PORT}
EOF

echo "==> next build"
npm run build

echo "==> ensure pm2"
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

# Ensure pm2 can find node
mkdir -p /usr/local/bin
ln -sfn "$NODE_BIN/node" /usr/local/bin/node
ln -sfn "$NODE_BIN/npm" /usr/local/bin/npm
ln -sfn "$NODE_BIN/npx" /usr/local/bin/npx

echo "==> start with pm2"
cd "$ROOT/web"
pm2 delete kong-jiapu >/dev/null 2>&1 || true
PORT="$APP_PORT" pm2 start npm --name kong-jiapu -- start -- -p "$APP_PORT"
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

echo "==> done. open http://$(hostname -I | awk '{print $1}'):${APP_PORT}"
pm2 status kong-jiapu
