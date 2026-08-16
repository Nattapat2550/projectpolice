const express = require('express');

const { uploadExcelTasks, getUploadProgress, downloadExcelTemplate } = require('../controllers/uploadExcelTaskController');
const { protect, authorize } = require('../middleware/auth');
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
    confirmOverwriteTaskDocument,
    attachTaskDocument,
    deleteTaskAttachment,
    updateTaskAttachmentNote
} = require('../controllers/taskController');
const { upload } = require('../middleware/upload');

const router = express.Router();

// Require authentication and admin/superadmin role for all task operations
router.use(protect);
router.use(authorize('admin', 'superadmin'));

router.get('/', getAllTasks);
router.get('/urgent', getUrgentTasks);
router.get('/suggestions', getSuggestions);
router.post('/', createTask);
router.get('/next-reserve-no', getNextReserveNo);
router.post('/reserve', reserveTask);
router.post('/confirm', confirmTasks); 

// 📥 ดาวน์โหลดไฟล์ตัวอย่าง Excel Template
router.get('/template-excel', downloadExcelTemplate);

// 🚀 เพิ่มเส้นทางสำหรับเช็คหลอด Progress (ต้องอยู่ก่อน /:id)
router.get('/upload-progress/:jobId', getUploadProgress);

// เส้นทางอัปโหลด Excel
router.post('/upload-excel', uploadExcel.single('file'), uploadExcelTasks);

router.put('/:id/status', updateTaskStatus);
router.get('/:id', getTaskById);
router.get('/:id/logs', getTaskLogs);
router.put('/:id', updateTaskDetail);
router.put('/:id/details', updateTaskDetail);
router.post('/:id/overwrite-doc', upload.single('file'), overwriteTaskDocument);
router.post('/:id/confirm-overwrite-doc', confirmOverwriteTaskDocument);
router.post('/:id/attach-doc', upload.array('files', 3), attachTaskDocument);
router.put('/:id/attach-doc/:docId/note', updateTaskAttachmentNote);
router.put('/:id/attachments/:docId/note', updateTaskAttachmentNote);
router.delete('/:id/attach-doc/:docId', deleteTaskAttachment);
router.delete('/:id/attachments/:docId', deleteTaskAttachment);
router.delete('/:id', deleteTask);

module.exports = router;