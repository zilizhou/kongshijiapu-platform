#!/usr/bin/env bash
set -euo pipefail

CONF_SRC="$HOME/kong-jiapu/deploy/mysql/zz-kongjp-perf.cnf"
CONF_DST="/etc/mysql/mysql.conf.d/zz-kongjp-perf.cnf"

echo "==> install MySQL conf"
sudo cp "$CONF_SRC" "$CONF_DST"
sudo chmod 644 "$CONF_DST"

mysql_root() {
  # Ubuntu/Debian: use maintenance account via sudo (avoids root@localhost password)
  if sudo test -r /etc/mysql/debian.cnf; then
    sudo mysql --defaults-file=/etc/mysql/debian.cnf "$@"
  else
    sudo mysql "$@"
  fi
}

echo "==> try online buffer pool resize to 2G"
mysql_root -e "SET GLOBAL innodb_buffer_pool_size = 2147483648; SHOW VARIABLES LIKE 'innodb_buffer_pool_size';" || true

echo "==> restart mysql to apply config"
sudo systemctl restart mysql
sleep 3
sudo systemctl is-active mysql

echo "==> verify"
mysql_root -e "SHOW VARIABLES LIKE 'innodb_buffer_pool_size'; SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_pages_free';"

echo "==> analyze tables"
mysql --defaults-file="$HOME/.my.cnf" --default-character-set=utf8mb4 kzjp01 -e \
  "ANALYZE TABLE tb_people, tb_people_info, tb_people_relation; SELECT COUNT(*) AS people FROM tb_people;"

echo "done"
