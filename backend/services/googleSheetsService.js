const { google } = require('googleapis');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

const oAuth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

if (GOOGLE_REFRESH_TOKEN) {
  oAuth2Client.setCredentials({
    refresh_token: GOOGLE_REFRESH_TOKEN
  });
}

// Function to append a single task to Google Sheets
exports.appendTaskToSheet = async (taskData) => {
  if (!SPREADSHEET_ID) {
    console.warn("GOOGLE_SHEET_ID is not set. Skipping sheet sync.");
    return;
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
    
    // Format date properly if it exists
    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? dateStr : date.toISOString().split('T')[0];
    };

    const rowData = [
      taskData.id || '',
      taskData.receive_no || '',
      taskData.receive_year || '',
      formatDate(taskData.created_at) || '',
      taskData.memo_no || '',
      formatDate(taskData.memo_date) || '',
      taskData.sender || '',
      taskData.title || '',
      taskData.personInCharge || '',
      formatDate(taskData.due_date) || '',
      taskData.task_detail || '',
      formatDate(taskData.sign_date) || ''
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A:L', // Omit sheet name to automatically use the first sheet
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [rowData],
      },
    });
    
    console.log(`[Google Sheets] Successfully appended task ${taskData.receive_no || taskData.title}`);
  } catch (error) {
    console.error("[Google Sheets] Sync Error:", error.message);
  }
};

exports.appendMultipleTasksToSheet = async (tasksArray) => {
  if (!SPREADSHEET_ID) return;
  if (!tasksArray || tasksArray.length === 0) return;

  try {
    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? dateStr : date.toISOString().split('T')[0];
    };

    const values = tasksArray.map(taskData => [
      taskData.id || '',
      taskData.receive_no || '',
      taskData.receive_year || '',
      formatDate(taskData.created_at) || '',
      taskData.memo_no || '',
      formatDate(taskData.memo_date) || '',
      taskData.sender || '',
      taskData.title || '',
      taskData.personInCharge || '',
      formatDate(taskData.due_date) || '',
      taskData.task_detail || '',
      formatDate(taskData.sign_date) || ''
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A:L',
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
    console.log(`[Google Sheets] Successfully appended ${tasksArray.length} tasks`);
  } catch (error) {
    console.error("[Google Sheets] Batch Sync Error:", error.message);
  }
};

exports.updateTaskInSheet = async (taskData) => {
  if (!SPREADSHEET_ID) return;
  if (!taskData || !taskData.id) return;

  try {
    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
    
    // 1. Fetch all data to find the row index based on ID (Column A)
    const getRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A:A', // Only fetch column A to find the ID
    });
    
    const rows = getRes.data.values;
    if (!rows || rows.length === 0) return;

    // Find the row index (0-based array index, so +1 for Sheet row)
    const rowIndex = rows.findIndex(row => row[0] === taskData.id);
    
    if (rowIndex === -1) {
      console.warn(`[Google Sheets] Task ID ${taskData.id} not found in sheet. Cannot update.`);
      return;
    }

    const sheetRowNumber = rowIndex + 1; // Google Sheets is 1-indexed

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? dateStr : date.toISOString().split('T')[0];
    };

    const rowData = [
      taskData.id || '',
      taskData.receive_no || '',
      taskData.receive_year || '',
      formatDate(taskData.created_at) || '',
      taskData.memo_no || '',
      formatDate(taskData.memo_date) || '',
      taskData.sender || '',
      taskData.title || '',
      taskData.personInCharge || '',
      formatDate(taskData.due_date) || '',
      taskData.task_detail || '',
      formatDate(taskData.sign_date) || ''
    ];

    // 2. Update the specific row
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `A${sheetRowNumber}:L${sheetRowNumber}`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [rowData],
      },
    });

    console.log(`[Google Sheets] Successfully updated task ${taskData.receive_no || taskData.title} at row ${sheetRowNumber}`);
  } catch (error) {
    console.error("[Google Sheets] Update Sync Error:", error.message);
  }
};
