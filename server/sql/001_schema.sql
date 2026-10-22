-- 同城教培撮合与拼团小程序 MVP 第一期 数据库结构
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 用户：一个账号可同时是家长和老师，role 为当前使用身份
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  openid        TEXT NOT NULL UNIQUE,          -- 开发期为 mock_xxx，生产为微信 openid
  nickname      TEXT NOT NULL DEFAULT '微信用户',
  avatar_url    TEXT,
  phone         TEXT,
  city          TEXT,
  lat           REAL,
  lng           REAL,
  role          TEXT NOT NULL DEFAULT 'parent'
                CHECK (role IN ('parent','teacher')),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- 后台管理员（独立账号体系）
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

-- 老师认证资料，一人一条；被驳回后可原地重新提交
CREATE TABLE IF NOT EXISTS teacher_profiles (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL UNIQUE REFERENCES users(id),
  real_name        TEXT NOT NULL,
  id_card_no       TEXT,                       -- 选填
  cert_type        TEXT NOT NULL
                   CHECK (cert_type IN ('teacher_certificate','degree')),
  cert_image_url   TEXT,                       -- 选填
  degree_image_url TEXT,
  subject          TEXT NOT NULL,              -- 授课科目（多选，逗号分隔）
  education        TEXT,                       -- 学历：大专/本科/硕士/博士/其他
  major            TEXT,                       -- 专业
  graduate_school  TEXT,                       -- 毕业院校
  teachable_grades TEXT,                       -- 可授年级（多选，逗号分隔）
  intro            TEXT,
  years_experience INTEGER NOT NULL DEFAULT 0,
  audit_status     TEXT NOT NULL DEFAULT 'pending'
                   CHECK (audit_status IN ('pending','approved','rejected')),
  reject_reason    TEXT,
  audited_by       INTEGER REFERENCES admins(id),
  audited_at       INTEGER,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

-- 拼好课课程
CREATE TABLE IF NOT EXISTS courses (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id               INTEGER NOT NULL REFERENCES users(id),
  title                    TEXT NOT NULL,
  subject                  TEXT NOT NULL,
  grade                    TEXT,
  cover_url                TEXT,
  outline                  TEXT NOT NULL,
  province                 TEXT NOT NULL DEFAULT '',
  city                     TEXT NOT NULL,
  address                  TEXT NOT NULL,
  lat                      REAL NOT NULL,
  lng                      REAL NOT NULL,
  start_time               INTEGER NOT NULL,   -- epoch ms
  end_time                 INTEGER NOT NULL,
  deadline_at              INTEGER NOT NULL,   -- 报名/成团判定截止，<= start_time
  min_students             INTEGER NOT NULL CHECK (min_students >= 2),
  max_students             INTEGER NOT NULL
                           CHECK (max_students >= min_students AND max_students <= 100),
  enrolled_count           INTEGER NOT NULL DEFAULT 0,
  current_unit_price_cents INTEGER NOT NULL DEFAULT 0,
  status                   TEXT NOT NULL DEFAULT 'recruiting'
                           CHECK (status IN ('recruiting','formed','failed','cancelled','finished')),
  cancel_reason            TEXT,
  formed_at                INTEGER,
  failed_at                INTEGER,
  finished_at              INTEGER,
  created_at               INTEGER NOT NULL,
  updated_at               INTEGER NOT NULL,
  CHECK (deadline_at <= start_time),
  CHECK (end_time >= start_time)
);

-- 阶梯档位：min_people 为“满 N 人”的 N，按升序解释
CREATE TABLE IF NOT EXISTS course_tiers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  min_people  INTEGER NOT NULL CHECK (min_people >= 1),
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  UNIQUE (course_id, min_people)
);

-- 参团记录
CREATE TABLE IF NOT EXISTS enrollments (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id             INTEGER NOT NULL REFERENCES courses(id),
  parent_id             INTEGER NOT NULL REFERENCES users(id),
  join_seq              INTEGER NOT NULL,      -- 第几个报名
  price_at_join_cents   INTEGER NOT NULL,      -- 入团价快照（最高阶梯价），只写一次
  current_price_cents   INTEGER NOT NULL,      -- 重算后的最新应付
  status                TEXT NOT NULL DEFAULT 'joined'
                        CHECK (status IN ('joined','expired','left')),
  expired_reason        TEXT,                  -- flow / teacher_cancel / admin_cancel
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  UNIQUE (course_id, parent_id),
  UNIQUE (course_id, join_seq)
);

-- 退差/退款台账
CREATE TABLE IF NOT EXISTS refund_records (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id        INTEGER NOT NULL REFERENCES courses(id),
  enrollment_id    INTEGER NOT NULL REFERENCES enrollments(id),
  parent_id        INTEGER NOT NULL REFERENCES users(id),
  type             TEXT NOT NULL
                   CHECK (type IN ('tier_diff','flow_refund','course_cancel_refund')),
  event_key        TEXT NOT NULL,              -- tier:3 / flow / cancel，幂等键
  amount_cents     INTEGER NOT NULL CHECK (amount_cents > 0),
  from_price_cents INTEGER,
  to_price_cents   INTEGER,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','paid','void')),
  wx_refund_no     TEXT,                       -- 预留微信退款单号
  remark           TEXT,
  created_at       INTEGER NOT NULL,
  paid_at          INTEGER,
  UNIQUE (enrollment_id, event_key)
);

-- 家长发单（C2B2C 撮合订单）
CREATE TABLE IF NOT EXISTS demand_orders (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id             INTEGER NOT NULL REFERENCES users(id),
  subject               TEXT NOT NULL,
  grade                 TEXT,
  hourly_rate_cents     INTEGER NOT NULL CHECK (hourly_rate_cents > 0),
  phone                 TEXT NOT NULL,              -- 家长电话：仅后台可见，老师端接口绝不返回
  province              TEXT NOT NULL DEFAULT '',
  city                  TEXT NOT NULL,              -- 市+区县
  address               TEXT NOT NULL,              -- 详细地址（含门牌号）
  address_display       TEXT NOT NULL DEFAULT '',   -- 脱敏地址：仅到 区/街道，无门牌号
  status                TEXT NOT NULL DEFAULT 'recruiting'
                        CHECK (status IN ('recruiting','locked','closed')),
  selected_teacher_id   INTEGER REFERENCES users(id),
  selected_application_id INTEGER REFERENCES demand_applications(id),
  locked_at             INTEGER,
  closed_at             INTEGER,
  remark                TEXT,                       -- 客服跟进备注（后台）
  remark_updated_at     INTEGER,
  remark_updated_by     INTEGER REFERENCES admins(id),
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

-- 老师投递简历
CREATE TABLE IF NOT EXISTS demand_applications (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id       INTEGER NOT NULL REFERENCES demand_orders(id),
  teacher_id     INTEGER NOT NULL REFERENCES users(id),
  note           TEXT,                             -- 投递留言：授课经历/自荐（选填）
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','selected','invalid')),
  invalid_reason TEXT,                             -- locked_by_other / order_closed
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  UNIQUE (order_id, teacher_id)                    -- 一个老师对一个订单只能投递一次
);

-- 站内信
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  type       TEXT NOT NULL,                        -- order_locked_by_other / order_closed / selected
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 首页 Banner
CREATE TABLE IF NOT EXISTS banners (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  image_url  TEXT NOT NULL,
  link_type  TEXT NOT NULL DEFAULT 'none'
             CHECK (link_type IN ('none','course')),
  link_value TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled    INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  start_at   INTEGER,
  end_at     INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_courses_hall        ON courses(status, city, deadline_at);
CREATE INDEX IF NOT EXISTS idx_courses_teacher     ON courses(teacher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_courses_sweep_dl    ON courses(status, deadline_at);
CREATE INDEX IF NOT EXISTS idx_courses_sweep_end   ON courses(status, end_time);
CREATE INDEX IF NOT EXISTS idx_tiers_course        ON course_tiers(course_id, min_people);
CREATE INDEX IF NOT EXISTS idx_enroll_course_state ON enrollments(course_id, status);
CREATE INDEX IF NOT EXISTS idx_enroll_parent       ON enrollments(parent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refund_course_state ON refund_records(course_id, status);
CREATE INDEX IF NOT EXISTS idx_refund_parent       ON refund_records(parent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_audit       ON teacher_profiles(audit_status, updated_at);
CREATE INDEX IF NOT EXISTS idx_banner_sort         ON banners(enabled, sort_order);
