const { Router } = require('express');
const { upload } = require('../middleware/upload');
const { processDocuments, deleteTempFiles } = require('../controllers/documentController');
const { protect, authorize } = require('../middleware/auth');

const router = Router();

router.use(protect);
router.use(authorize('admin', 'superadmin'));

router.post('/process', upload.array('files', 50), processDocuments);
router.post('/clean-temp', deleteTempFiles);
router.delete('/temp', deleteTempFiles);

module.exports = router;