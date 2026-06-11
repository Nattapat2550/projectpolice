const { Pool } = require("pg");

// 💡 ดึงค่าคอนฟิกแยกส่วนจาก environment variables เพื่อความแม่นยำสูงสุด
const pool = new Pool({
  user: process.env.DB_USER || "postgres.thlwwzvjjszjdykayufg",
  password: process.env.DB_PASSWORD || "Nattapatyan",
  host: process.env.DB_HOST || "aws-1-ap-southeast-1.pooler.supabase.com",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME || "postgres",
  
  // ตั้งค่าความปลอดภัยและการระบุตัวตน (Tenant Identifier) ผ่านโปรโตคอล TLS
  ssl: { 
    // ข้ามการตรวจสอบสิทธิ์ใบรับรองในระดับ Local Machine เพื่อแก้ปัญหา Self-signed cert
    rejectUnauthorized: false,
    
    // 💡 หัวใจสำคัญ: บังคับส่ง SNI ไปยังโฮสต์พูลเลอร์เพื่อยืนยันตัวตนโปรเจกต์ผ่าน Proxy ของ Supabase
    servername: process.env.DB_HOST || "aws-1-ap-southeast-1.pooler.supabase.com"
  } 
});

// ตรวจสอบและดึง Client ชั่วคราวมาทดสอบสถานะก่อน release ทันทีเพื่อป้องกัน Connection Leak
pool.connect()
  .then((client) => {
    console.log("🚀 Supabase PostgreSQL Connected via Session Pooler Successfully!");
    client.release();
  })
  .catch((err) => {
    console.error("❌ Supabase Connection error:", err.message);
  });

module.exports = pool;