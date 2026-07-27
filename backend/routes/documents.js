const { Router } = require('express');
const { upload } = require('../middleware/upload');
const { processDocuments, deleteTempFiles } = require('../controllers/documentController');

const router = Router();

// รับหลายไฟล์พร้อมกัน
router.post('/process', upload.array('files', 50), processDocuments);
router.post('/clean-temp', deleteTempFiles);
router.delete('/temp', deleteTempFiles);

module.exports = router;