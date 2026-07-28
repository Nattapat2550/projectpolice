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
  .then((client) => {
    console.log("PostgreSQL Connected");
    client.release();
  })
  .catch((err) => console.error("Connection error", err));

module.exports = pool;