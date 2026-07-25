#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export DOCKER_API_VERSION="${DOCKER_API_VERSION:-1.43}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-kongjp_root_2026}"

echo "==> Waiting for MySQL..."
for i in $(seq 1 60); do
  if docker exec kong-jiapu-db mysqladmin ping -h127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" --silent 2>/dev/null; then
    break
  fi
  sleep 2
done

echo "==> Importing genealogy dump (this may take 20-60 minutes)..."
docker exec -i kong-jiapu-db mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 kzjp01 < "$ROOT/kzjpF.sql"

echo "==> Applying app schema & seed users..."
docker exec -i kong-jiapu-db mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 < "$ROOT/deploy/mysql/app-schema.sql" || true

# Indexes may fail if already exist; re-run seed cleanly
docker exec -i kong-jiapu-db mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 kzjp01 <<'SQL'
INSERT INTO app_users (id, username, password_hash, display_name, role) VALUES
('u-editor', 'editor', '$2b$10$YajmT5jeJ2znCvoABYc8DOCa1j1PuaPMPCRViCfoiqGmElmhOYt5O', '录入员', 'editor'),
('u-first', 'first', '$2b$10$YajmT5jeJ2znCvoABYc8DOCa1j1PuaPMPCRViCfoiqGmElmhOYt5O', '一审人员', 'first'),
('u-second', 'second', '$2b$10$YajmT5jeJ2znCvoABYc8DOCa1j1PuaPMPCRViCfoiqGmElmhOYt5O', '二审人员', 'second'),
('u-final', 'final', '$2b$10$YajmT5jeJ2znCvoABYc8DOCa1j1PuaPMPCRViCfoiqGmElmhOYt5O', '终审人员', 'final'),
('u-admin', 'admin', '$2b$10$YajmT5jeJ2znCvoABYc8DOCa1j1PuaPMPCRViCfoiqGmElmhOYt5O', '管理员', 'admin')
ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), display_name=VALUES(display_name), role=VALUES(role);

-- Clear polluted temp rows with latin placeholder content (safe cleanup)
DELETE FROM tb_people_temp
WHERE F_DESCRIPTION LIKE '%voluptate%'
   OR F_DESCRIPTION LIKE '%pariatur%'
   OR F_ALIAS IN ('in','v','o')
   OR F_NAME REGEXP '^[A-Za-z]';

SELECT COUNT(*) AS people_count FROM tb_people;
SELECT username, role FROM app_users ORDER BY role;
SQL

echo "==> Import complete."
