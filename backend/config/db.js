const { Pool } = require("pg");

let connectionString = 
  process.env.projectpolice_POSTGRES_URL || 
  process.env.POSTGRES_URL || 
  process.env.DB;

if (connectionString) {
  // 💡 ป้องกันปัญหา pg-connection-string override ค่า ssl เมื่อมี ?sslmode=... ติดมาจาก Supabase/Vercel URL
  connectionString = connectionString.replace(/[\?&]sslmode=[^&]*/g, '');
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: { 
    rejectUnauthorized: false 
  } 
});

// 💡 FIX: รับ client มาเพื่อเช็คสถานะ จากนั้นทำการ release ทันทีเพื่อป้องกัน Connection Leak!
pool.connect()
  .then((client) => {
    console.log("PostgreSQL Connected");
    client.release();
  })
  .catch((err) => console.error("Connection error", err));

module.exports = pool;