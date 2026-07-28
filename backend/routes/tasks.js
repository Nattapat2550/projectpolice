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
    createTask,
    getTaskLogs,
    reserveTask,
    getNextReserveNo,
    getSuggestions,
    overwriteTaskDocument,
    attachTaskDocument,
    deleteTaskAttachment,
    updateTaskAttachmentNote
} = require('../controllers/taskController');
const { upload } = require('../middleware/upload');

const router = express.Router();

router.get('/', getAllTasks);
router.get('/urgent', getUrgentTasks);
router.get('/suggestions', getSuggestions);
router.post('/', protect, createTask);
router.get('/next-reserve-no', protect, getNextReserveNo);
router.post('/reserve', protect, reserveTask);
router.post('/confirm', protect, confirmTasks); 

// 🚀 เพิ่มเส้นทางสำหรับเช็คหลอด Progress (ต้องอยู่ก่อน /:id)
router.get('/upload-progress/:jobId', protect, getUploadProgress);

// เส้นทางอัปโหลด Excel
router.post('/upload-excel', protect, uploadExcel.single('file'), uploadExcelTasks);

router.put('/:id/status', protect, updateTaskStatus);
router.get('/:id', getTaskById);
router.get('/:id/logs', protect, getTaskLogs);
router.put('/:id', protect, updateTaskDetail);
router.post('/:id/overwrite-doc', protect, upload.single('file'), overwriteTaskDocument);
router.post('/:id/attach-doc', protect, upload.array('files', 10), attachTaskDocument);
router.put('/:id/attach-doc/:docId/note', protect, updateTaskAttachmentNote);
router.put('/:id/attachments/:docId/note', protect, updateTaskAttachmentNote);
router.delete('/:id/attach-doc/:docId', protect, deleteTaskAttachment);
router.delete('/:id/attachments/:docId', protect, deleteTaskAttachment);
router.delete('/:id', protect, deleteTask);

module.exports = router;