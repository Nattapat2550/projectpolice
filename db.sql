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
  main_text TEXT,           -- เนื้อหารวมของงาน
  department TEXT, -- เก็บชื่อ Sheet/สำนักงาน
  sender TEXT, -- เก็บฟิลด์ "จาก"
  status VARCHAR(50) DEFAULT 'following',
  notes TEXT, 
  is_urgent BOOLEAN DEFAULT FALSE,
  due_date DATE,
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

-- 4. ตาราง "รายละเอียดย่อย" (งานที่ผู้รับผิดชอบต้องทำ)
CREATE TABLE task_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES task_assignments(id) ON DELETE CASCADE,
  detail TEXT NOT NULL,     -- ข้อความงานย่อย
  status VARCHAR(50) DEFAULT 'pending',
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
