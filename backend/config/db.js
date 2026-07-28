const { Pool } = require("pg");

let connectionString = 
  process.env.projectpolice_POSTGRES_URL || 
  process.env.POSTGRES_URL || 
  process.env.DB;

if (connectionString) {
  try {
    // 💡 ใช้ URL API ของ Node.js ลบ sslmode ออกอย่างปลอดภัยโดยไม่ทำให้ชื่อ Database หรือ URL พัง
    const parsedUrl = new URL(connectionString);
    parsedUrl.searchParams.delete('sslmode');
    connectionString = parsedUrl.toString();
  } catch (err) {
    console.warn("Could not parse DB connectionString URL:", err.message);
  }
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: { 
    rejectUnauthorized: false 
  } 
});

// 💡 FIX: รับ client มาเพื่อเช็คสถานะ และทำ auto-migration เพิ่มคอลัมน์ใหม่ถ้ายังไม่มี จากนั้นทำการ release ทันทีเพื่อป้องกัน Connection Leak!
pool.connect()
  .then(async (client) => {
    console.log("PostgreSQL Connected");
    try {
      await client.query(`
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recipient_to TEXT;
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS additional_docs TEXT;
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS round INT DEFAULT 1;
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
      `);
    } catch (migErr) {
      console.warn("Auto migration warning:", migErr.message);
    }
    client.release();
  })
  .catch((err) => console.error("Connection error", err));

module.exports = pool;