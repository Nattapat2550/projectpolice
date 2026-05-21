const express = require("express");
const multer = require("multer");
const { scanPDF } = require("../controllers/pdf");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are allowed!"), false);
  },
});

// เปลี่ยนมาใช้ upload.any() เพื่อไม่จำกัดชื่อ Key
router.post("/scan", upload.any(), scanPDF);

module.exports = router;