const express = require("express");
const multer = require("multer");
const { scanPDF } = require("../controllers/pdf");

const router = express.Router();

// ใช้ MemoryStorage เพื่อเก็บไฟล์ใน RAM ชั่วคราว ไม่ต้องบันทึกลงฮาร์ดดิสก์ให้รกเซิร์ฟเวอร์
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // จำกัดขนาดไฟล์ PDF สูงสุด 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed!"), false);
    }
  },
});

// ดักจับ Error จาก Multer ในกรณีที่อัปโหลดไฟล์ผิดประเภทหรือใหญ่เกินไป
router.post("/scan", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: err.message });
    } else if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
}, scanPDF);

module.exports = router;