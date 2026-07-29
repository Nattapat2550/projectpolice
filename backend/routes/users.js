const express = require('express');
const { updateMyProfile, changePassword, getUsers, updateUserRole } = require('../controllers/users');
const { protect, authorize } = require('../middleware/auth');
const router = express.Router();

// Require authentication and admin/superadmin role for user endpoints
router.use(protect);
router.use(authorize('admin', 'superadmin'));

router.get('/', getUsers); 
router.put('/profile', updateMyProfile);
router.put('/password', changePassword);
router.put('/:id/role', authorize('superadmin'), updateUserRole);

module.exports = router;