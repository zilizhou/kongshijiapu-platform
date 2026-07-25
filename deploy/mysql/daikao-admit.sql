-- 待考入谱状态字段
USE kzjp01;

ALTER TABLE tb_daikao_people
  ADD COLUMN IF NOT EXISTS admit_status VARCHAR(20) NOT NULL DEFAULT 'none'
    COMMENT 'none|pending|admitted' AFTER created_at,
  ADD COLUMN IF NOT EXISTS admit_request_id BIGINT NULL
    COMMENT '进行中的入谱变更单' AFTER admit_status,
  ADD COLUMN IF NOT EXISTS admitted_people_id INT NULL
    COMMENT '正式库成员 ID' AFTER admit_request_id,
  ADD COLUMN IF NOT EXISTS admitted_at DATETIME NULL AFTER admitted_people_id;

CREATE INDEX IF NOT EXISTS idx_daikao_admit_status ON tb_daikao_people (admit_status);
CREATE INDEX IF NOT EXISTS idx_daikao_admitted_people ON tb_daikao_people (admitted_people_id);
