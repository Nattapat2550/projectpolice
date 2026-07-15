const pool = require('../config/db');
const User = require('../models/User');

// @desc    Get all users
// @route   GET /api/v1/users
// @access  Public
exports.getUsers = async (req, res, next) => {
    try {
        const users = await User.find();
        res.status(200).json({ success: true, data: users });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// @desc    Update my profile (Name, Color)
// @route   PUT /api/v1/users/profile
// @access  Private
exports.updateMyProfile = async (req, res, next) => {
    try {
        const { name, color } = req.body;
        const updateData = {};

        // 1. จัดการเรื่องอัปเดตชื่อ
        if (name && name !== req.user.name) {
            // ถ้าพิมพ์ชื่อมาไม่ตรงกับชื่อตัวเอง (เปลี่ยนชื่อใหม่) ให้เช็คว่าชื่อใหม่นี้มีคนอื่นใช้หรือยัง
            const existingUser = await User.findOne({ name });
            if (existingUser) {
                return res.status(400).json({ success: false, message: "ชื่อนี้ถูกใช้งานแล้ว กรุณาใช้ชื่ออื่น" });
            }
            updateData.name = name;
        }

        // 2. จัดการเรื่องอัปเดตสี
        if (color) {
            updateData.color = color;
        }

        // ถ้าไม่มีอะไรเปลี่ยนแปลงเลย
        if (Object.keys(updateData).length === 0) {
            const currentUser = await User.findById(req.user.id);
            return res.status(200).json({ success: true, data: currentUser });
        }
            
        // 3. บันทึกข้อมูลลงฐานข้อมูล
        // (ลบ { new: true } ออกด้วยเพราะ Database ของคุณเป็น PostgreSQL ธรรมดา ไม่ใช่ MongoDB)
        const user = await User.findByIdAndUpdate(req.user.id, updateData);
        res.status(200).json({ success: true, data: user });
    } catch (err) {
        console.error(err);
        res.status(400).json({ success: false, message: err.message });
    }
};

// @desc    Change password
// @route   PUT /api/v1/users/password
// @access  Private
exports.changePassword = async (req, res, next) => {
    try {
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({ success: false, message: "Please provide a new password" });
        }
        await User.updatePassword(req.user.id, password);
        res.status(200).json({ success: true, message: "Password updated successfully" });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// @desc    Change user role (Superadmin only)
// @route   PUT /api/v1/users/:id/role
// @access  Private/Superadmin
exports.updateUserRole = async (req, res, next) => {
    try {
        const { role } = req.body;
        if (!role || !['user', 'admin', 'superadmin'].includes(role)) {
            return res.status(400).json({ success: false, message: "Invalid role specified" });
        }
        const user = await User.findByIdAndUpdate(req.params.id, { role });
        res.status(200).json({ success: true, data: user, message: "User role updated successfully" });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};