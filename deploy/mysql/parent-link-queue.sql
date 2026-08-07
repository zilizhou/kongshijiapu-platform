-- kongtree1 导入：回退自动挂父 + 建立挂接队列
-- 已在生产 2026-08-07 执行；保留脚本供其他环境复用

START TRANSACTION;

CREATE TABLE IF NOT EXISTS tmp_parent_link_rollback_20260807 AS
SELECT r.F_PEOPLE_ID AS child_id, r.F_PARENT_ID, r.F_PARENT_NAME, NOW() AS snap_at
FROM tb_people_relation r
WHERE r.F_PEOPLE_ID IN (
  SELECT people_id FROM tmp_parent_id_repair_20260806
  UNION SELECT child_id FROM tmp_parent_repair_20260806_r2
);

UPDATE tb_people_relation r
JOIN tmp_parent_id_repair_20260806 t ON t.people_id = r.F_PEOPLE_ID
SET r.F_PARENT_ID = 0
WHERE r.F_PARENT_ID = t.new_parent_id;

UPDATE tb_people_relation r
JOIN tmp_parent_repair_20260806_r2 t ON t.child_id = r.F_PEOPLE_ID
SET r.F_PARENT_ID = 0
WHERE r.F_PARENT_ID = t.new_parent_id;

CREATE TABLE IF NOT EXISTS tb_parent_link_queue (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  people_id INT NOT NULL,
  parent_name_text VARCHAR(10) NOT NULL DEFAULT '',
  parent_no_text VARCHAR(20) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  chosen_parent_id INT NULL,
  match_hint VARCHAR(20) NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'kongtree1_import',
  operator_name VARCHAR(64) NULL,
  linked_at DATETIME NULL,
  note VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_plq_people (people_id),
  INDEX idx_plq_status (status),
  INDEX idx_plq_parent_name (parent_name_text)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO tb_parent_link_queue (people_id, parent_name_text, parent_no_text, status, source)
SELECT r.F_PEOPLE_ID, TRIM(r.F_PARENT_NAME), NULLIF(TRIM(r.F_PARENT_NO), ''), 'pending', 'kongtree1_import'
FROM tb_people_relation r
WHERE r.F_PEOPLE_ID IN (SELECT people_id FROM tmp_parent_id_repair_20260806);

INSERT IGNORE INTO tb_parent_link_queue (people_id, parent_name_text, parent_no_text, status, source)
SELECT r.F_PEOPLE_ID, TRIM(r.F_PARENT_NAME), NULLIF(TRIM(r.F_PARENT_NO), ''), 'pending', 'kongtree1_import'
FROM tb_people_relation r
WHERE r.F_PEOPLE_ID IN (SELECT child_id FROM tmp_parent_repair_20260806_r2);

INSERT IGNORE INTO tb_parent_link_queue (people_id, parent_name_text, parent_no_text, status, source)
SELECT r.F_PEOPLE_ID, TRIM(r.F_PARENT_NAME), NULLIF(TRIM(r.F_PARENT_NO), ''), 'pending', 'kongtree1_import'
FROM tb_people_relation r
WHERE IFNULL(r.F_PARENT_ID, 0) = 0
  AND r.F_PARENT_NAME IS NOT NULL AND TRIM(r.F_PARENT_NAME) <> '';

COMMIT;
