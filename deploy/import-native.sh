#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-kongjp_root_2026}"
MYSQL_DB="${MYSQL_DB:-kzjp01}"

echo "==> Importing dump into local MySQL (20-60 min)..."
mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 "$MYSQL_DB" < "$ROOT/kzjpF.sql"

echo "==> Applying app schema & seed users..."
# Indexes may already exist; ignore those errors
mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 < "$ROOT/deploy/mysql/app-schema.sql" || true

mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 "$MYSQL_DB" <<'SQL'
INSERT INTO app_users (id, username, password_hash, display_name, role) VALUES
('u-editor', 'editor', '$2b$10$YajmT5jeJ2znCvoABYc8DOCa1j1PuaPMPCRViCfoiqGmElmhOYt5O', '录入员', 'editor'),
('u-first', 'first', '$2b$10$YajmT5jeJ2znCvoABYc8DOCa1j1PuaPMPCRViCfoiqGmElmhOYt5O', '一审人员', 'first'),
('u-second', 'second', '$2b$10$YajmT5jeJ2znCvoABYc8DOCa1j1PuaPMPCRViCfoiqGmElmhOYt5O', '二审人员', 'second'),
('u-final', 'final', '$2b$10$YajmT5jeJ2znCvoABYc8DOCa1j1PuaPMPCRViCfoiqGmElmhOYt5O', '终审人员', 'final'),
('u-admin', 'admin', '$2b$10$YajmT5jeJ2znCvoABYc8DOCa1j1PuaPMPCRViCfoiqGmElmhOYt5O', '管理员', 'admin')
ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), display_name=VALUES(display_name), role=VALUES(role);

DELETE FROM tb_people_temp
WHERE F_DESCRIPTION LIKE '%voluptate%'
   OR F_DESCRIPTION LIKE '%pariatur%'
   OR F_ALIAS IN ('in','v','o')
   OR F_NAME REGEXP '^[A-Za-z]';

SELECT COUNT(*) AS people_count FROM tb_people;
SELECT username, role FROM app_users ORDER BY username;
SQL

echo "==> Import complete."
