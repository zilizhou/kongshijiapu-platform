#!/usr/bin/env bash
# 在部署机以运行用户执行：安装 systemd --user 开机自启
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_SRC="$ROOT/deploy/systemd/kong-jiapu.service"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT_DST="$UNIT_DIR/kong-jiapu.service"

mkdir -p "$UNIT_DIR" "$HOME/kong-jiapu/logs"
cp "$UNIT_SRC" "$UNIT_DST"

# 若仍用旧 start.sh 占着端口，先停掉
if [ -x "$HOME/kong-jiapu/bin/stop.sh" ]; then
  "$HOME/kong-jiapu/bin/stop.sh" 2>/dev/null || true
fi
if [ -f "$HOME/kong-jiapu/logs/web.pid" ]; then
  old=$(cat "$HOME/kong-jiapu/logs/web.pid" || true)
  if [ -n "${old:-}" ] && kill -0 "$old" 2>/dev/null; then
    kill "$old" 2>/dev/null || true
    sleep 1
  fi
fi
PORT=$(grep -E '^PORT=' "$HOME/kong-jiapu/web/.env.local" 2>/dev/null | cut -d= -f2 || echo 8100)
pids=$(ss -lntp 2>/dev/null | grep -E ":${PORT}\\b" | sed -n "s/.*pid=\\([0-9]\\+\\).*/\\1/p" | sort -u || true)
for pid in $pids; do
  kill "$pid" 2>/dev/null || true
done
sleep 1

systemctl --user daemon-reload
systemctl --user enable kong-jiapu.service
systemctl --user restart kong-jiapu.service
sleep 2
systemctl --user --no-pager status kong-jiapu.service || true

echo
echo "已启用开机自启（systemd --user）。需确保 Linger=yes（当前环境一般已开）："
echo "  loginctl show-user \$USER -p Linger"
echo "查看状态：systemctl --user status kong-jiapu"
echo "查看日志：journalctl --user -u kong-jiapu -f"
