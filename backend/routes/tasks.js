const express = require('express');

// 💡 1. นำเข้า Controller ใหม่ (เพิ่ม getUploadProgress เข้ามาด้วย)
const { uploadExcelTasks, getUploadProgress } = require('../controllers/uploadExcelTaskController');

// 💡 2. นำเข้า Middleware 
const { protect } = require('../middleware/auth');
const multer = require('multer');
const uploadExcel = multer({ storage: multer.memoryStorage() });

const { 
    getAllTasks, 
    getUrgentTasks, 
    updateTaskStatus, 
    confirmTasks, 
    getTaskById,
    updateTaskDetail,
    deleteTask,
    createTask
} = require('../controllers/taskController');

const router = express.Router();

router.get('/', getAllTasks);
router.get('/urgent', getUrgentTasks);
router.post('/', createTask);
router.post('/confirm', confirmTasks); 

// 🚀 เพิ่มเส้นทางสำหรับเช็คหลอด Progress (ต้องอยู่ก่อน /:id)
router.get('/upload-progress/:jobId', getUploadProgress);

// เส้นทางอัปโหลด Excel
router.post('/upload-excel', protect, uploadExcel.single('file'), uploadExcelTasks);

router.put('/:id/status', updateTaskStatus);
router.get('/:id', getTaskById);
router.put('/:id', updateTaskDetail);
router.delete('/:id', deleteTask);

module.exports = router;