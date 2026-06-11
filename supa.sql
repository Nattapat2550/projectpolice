-- เปิดใช้งาน Extension สำหรับจัดการ UUID (ปกติ Supabase เปิดให้อัตโนมัติอยู่แล้ว)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- สร้างตาราง Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user',
  color VARCHAR(7) DEFAULT '#3B82F6'
);

-- 1. ตารางเก็บไฟล์และข้อมูลเอกสารต้นฉบับ (ปรับปรุงฟิลด์ Storage)
CREATE TABLE documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename        VARCHAR(255),
  content         TEXT,
  content_hash    VARCHAR(64) UNIQUE,
  keywords_found  JSONB,
  -- 💡 ปรับชื่อฟิลด์ให้ตรงกับระบบ Supabase Storage เพื่อป้องกันความสับสน
  storage_path    VARCHAR(255), -- เก็บ path/name ไฟล์ใน Supabase bucket (แทน drive_file_id)
  public_url      TEXT,         -- เก็บลิงก์ Public URL ที่เปิดดูได้ทันที (แทน drive_web_view_link)
  status          VARCHAR(20) DEFAULT 'pending',
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- แนะนำให้ใช้ WITH TIME ZONE บน Cloud
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL
);

-- 2. ตารางเก็บงานติดตาม (Tasks)
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  title VARCHAR(255),       -- ชื่อเรื่อง
  memo_no VARCHAR(100),     -- เลขที่เอกสาร
  memo_date VARCHAR(100),   -- วันที่บนเอกสาร (ใช้ VARCHAR เพื่อรองรับ Text จาก OCR/AI)
  main_text TEXT,           -- เนื้อหารวมของงาน
  status VARCHAR(50) DEFAULT 'following',
  notes TEXT, 
  is_urgent BOOLEAN DEFAULT FALSE,
  due_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- 3. ตาราง "ผู้รับผิดชอบ" (เชื่อมกับ Users)
CREATE TABLE task_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  role_or_name VARCHAR(100), -- เก็บชื่อดิบที่แสกนได้ (กรณีไม่มีในระบบ)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. ตาราง "รายละเอียดย่อย" (งานที่ผู้รับผิดชอบต้องทำ)
CREATE TABLE task_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES task_assignments(id) ON DELETE CASCADE,
  detail TEXT NOT NULL,     -- ข้อความงานย่อย
  status VARCHAR(50) DEFAULT 'pending',
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);