const User = require("../models/User");

// Get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
  const token = User.getSignedJwtToken(user.id, user.role);

  const expireDays = parseInt(process.env.JWT_COOKIE_EXPIRE, 10) || 30;

  const options = {
    expires: new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000),
    httpOnly: true,
    sameSite: "strict" // 🔒 เพิ่ม SameSite ช่วยป้องกัน CSRF 
  };

  if (process.env.NODE_ENV === "production") {
    options.secure = true; // 🔒 บังคับใช้ Secure Cookie บน HTTPS เท่านั้น
  }

  res.status(statusCode).cookie("token", token, options).json({
    success: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      role: user.role
    }
  });
};

// @desc    Register user
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { name, password } = req.body;

    if (!name || !password) {
      return res.status(400).json({ success: false, msg: "Please provide a name and password" });
    }

    const existingUser = await User.findOne({ name });
    if (existingUser) {
      return res.status(400).json({ success: false, msg: "Name already in use" });
    }

    const user = await User.create({ name, password });
    sendTokenResponse(user, 200, res);
  } catch (err) {
    console.log(err.stack);
    res.status(400).json({ success: false, msg: err.message });
  }
};

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { name, password } = req.body;

    if (!name || !password) {
      return res.status(400).json({ success: false, msg: "Please provide a name and password" });
    }

    const user = await User.findOne({ name });
    if (!user) {
      return res.status(400).json({ success: false, msg: "Invalid credentials" });
    }

    const isMatch = await User.matchPassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, msg: "Invalid credentials" });
    }

    sendTokenResponse(user, 200, res);
  } catch (err) {
    return res.status(500).json({ success: false, msg: "Server error" });
  }
};

// @desc    Log user out / clear cookie
// @route   GET /api/v1/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  res.cookie("token", "none", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // 🔒 ป้องกัน Insecure Cookie 
    sameSite: "strict" // 🔒 ช่วยป้องกัน CSRF 
  });

  res.status(200).json({ success: true, data: {} });
};

// @desc    Get current logged in user
// @route   GET /api/v1/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, msg: "User not found" });
    }
    
    // ซ่อนรหัสผ่านไม่ให้ส่งกลับไป
    delete user.password; 

    res.status(200).json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
};