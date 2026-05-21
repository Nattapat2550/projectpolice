const express = require("express");
const { register, login, getMe, logout } = require("../controllers/auth");
const router = express.Router();

const { protect } = require("../middleware/auth");

router.post("/register", register);
router.post("/login", login);
router.get("/logout", protect, logout);
router.get("/me", protect, getMe);

// บรรทัดนี้สำคัญมาก ห้ามลบเด็ดขาด!
module.exports = router;