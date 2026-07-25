const { Pool } = require("pg");

// รองรับทั้ง Supabase Environment Variables จาก Vercel และ DB เดิม
const connectionString = 
  process.env.projectpolice_POSTGRES_URL || 
  process.env.POSTGRES_URL || 
  process.env.DB;

const pool = new Pool({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false } 
});

// 💡 FIX: รับ client มาเพื่อเช็คสถานะ จากนั้นทำการ release ทันทีเพื่อป้องกัน Connection Leak!
pool.connect()
  .then((client) => {
    console.log("PostgreSQL Connected");
    client.release();
  })
  .catch((err) => console.error("Connection error", err));

module.exports = pool;