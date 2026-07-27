-- สร้างตาราง Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user',
  color VARCHAR(7) DEFAULT '#3B82F6'
);

-- 1. เก็บไฟล์ต้นฉบับ
CREATE TABLE documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename            VARCHAR(255),
  content             TEXT,
  content_hash        VARCHAR(64) UNIQUE,
  keywords_found      JSONB,
  drive_file_id       VARCHAR(255),
  drive_web_view_link TEXT,
  status              VARCHAR(20) DEFAULT 'pending',
  created_at          TIMESTAMP DEFAULT NOW(),
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL
);


-- 2. ตารางเก็บงานติดตาม (Tasks) -- [ส่วนที่เพิ่มใหม่]
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  title TEXT,       -- ชื่อเรื่อง
  memo_no TEXT,     -- เลขที่เอกสาร
  memo_date DATE,   -- วันที่บนเอกสาร
  receive_no INT,   -- เลขรับ
  receive_year INT, -- ปีของเลขรับ
  sign_date DATE,   -- วันที่ลงนาม
  urgency_level VARCHAR(50), -- ระดับความด่วน
  secret_level VARCHAR(50),  -- ระดับความลับ
  task_detail TEXT,         -- รายละเอียดสิ่งที่ต้องดำเนินการรวม
  main_text TEXT,           -- เนื้อหารวมของงาน
  sender TEXT, -- เก็บฟิลด์ "จาก"
  recipient_to TEXT, -- เก็บฟิลด์ "ถึง"
  additional_docs TEXT, -- เก็บฟิลด์ "เอกสารข้อมูลเพิ่มเติม"
  status VARCHAR(50) DEFAULT 'following',
  notes TEXT,                -- บันทึก/รายละเอียด
  is_urgent BOOLEAN DEFAULT FALSE,
  due_date DATE,
  meeting_date TIMESTAMP,    -- วันเวลาที่ประชุม
  reply_due_date TIMESTAMP,  -- วันส่งแบบตอบรับ
  location TEXT,             -- สถานที่ประชุม
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- 3. ตาราง "ผู้รับผิดชอบ" (เชื่อมกับ Users)
CREATE TABLE task_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- เชื่อมโยงดึงข้อมูลมาจากตารางผู้ใช้งาน
  role_or_name TEXT, -- เก็บชื่อดิบที่แสกนได้ (เผื่อกรณีระบบหาตัว User ในตารางไม่เจอ)
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. ตาราง "Log การทำงาน" (เชื่อมกับ Tasks และ Users)
CREATE TABLE IF NOT EXISTS task_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL, -- e.g. 'created_task', 'assigned_user', 'updated_status'
  details TEXT, -- JSON or text format detailing the change
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. ตาราง "เอกสารประกอบเพิ่มเติม" (Attached Documents)
CREATE TABLE IF NOT EXISTS task_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  drive_file_id VARCHAR(255),
  drive_web_view_link TEXT,
  doc_type VARCHAR(50) DEFAULT 'attachment',
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- 6. คำสั่งอัปเดตโครงสร้างตารางเดิม (สำหรับฐานข้อมูลที่มีตารางอยู่แล้ว)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recipient_to TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS additional_docs TEXT;