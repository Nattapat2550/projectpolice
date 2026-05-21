const dotenv = require("dotenv");
const connectDB = require("./config/db");

// โหลด Environment Variables
dotenv.config({ path: "./config/config.env" });

// เชื่อมต่อ Database
connectDB();

const app = require("./app");

// ใช้ตัวแปร PORT จาก .env ตามที่คุณกำหนด
const PORT = process.env.PORT || 5555;

const server = app.listen(PORT, () => {
  console.log(
    "Server running in",
    process.env.NODE_ENV,
    "mode on port",
    PORT
  );
});

// จัดการกรณีเกิด Error ที่ไม่ได้ตั้งใจ (เช่น ต่อ DB หลุด)
process.on("unhandledRejection", (err, promise) => {
  console.log(`Error: ${err.message}`);
  // ปิดเซิร์ฟเวอร์แบบปลอดภัย
  server.close(() => process.exit(1));
});