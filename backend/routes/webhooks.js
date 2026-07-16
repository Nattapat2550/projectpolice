const express = require('express');
const { handleSheetUpdate } = require('../controllers/webhookController');

const router = express.Router();

// The Google Apps Script will send POST requests here when the sheet is edited
router.post('/sheets', handleSheetUpdate);

module.exports = router;
