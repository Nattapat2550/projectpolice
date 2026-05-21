const dotenv = require("dotenv");

// เปลี่ยนจาก "./config/config.env" เป็น "./config/.env" (หรือเปลี่ยนตามชื่อไฟล์จริงของคุณ)
dotenv.config({ path: "./config/.env" }); 

const { connectDB } = require("./config/db");
connectDB(); // ทำการเชื่อมต่อและเช็ค/สร้างตาราง

const app = require("./app");
const PORT = process.env.PORT || 5555;

const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

process.on("unhandledRejection", (err, promise) => {
  console.log(`Error: ${err.message}`);
  server.close(() => process.exit(1));
});