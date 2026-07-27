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

const formatDateTH = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const yearAD = date.getFullYear();
  const yearBE = yearAD < 2500 ? yearAD + 543 : yearAD; // Prevent double conversion
  return `${day}/${month}/${yearBE}`;
};

const cleanToOnlyName = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.split(',').map(item => {
    let s = item.trim();
    s = s.replace(/[\(\[\（].*?[\)\]\）]/g, '').trim();
    s = s.replace(/^(?:พล\.ต\.อ\.|พล\.ต\.ท\.|พล\.ต\.ต\.|พ\.ต\.อ\.|พ\.ต\.ท\.|พ\.ต\.ต\.|ร\.ต\.อ\.|ร\.ต\.ท\.|ร\.ต\.ต\.|ด\.ต\.|จ\.ส\.ต\.|ส\.ต\.อ\.|ส\.ต\.ท\.|ส\.ต\.ต\.|นาย|นางสาว|นาง|น\.ส\.)\s*/gi, '').trim();
    return s || item.trim();
  }).filter(Boolean).join(', ');
};

const getSheetName = (yearAD) => {
  if (!yearAD) {
      return `${new Date().getFullYear() + 543}`;
  }
  const year = parseInt(yearAD, 10);
  return year > 2500 ? `${year}` : `${year + 543}`;
};

async function ensureSheetExists(sheets, spreadsheetId, sheetName) {
  try {
      const response = await sheets.spreadsheets.get({ spreadsheetId });
      const exists = response.data.sheets.some(s => s.properties.title === sheetName);
      if (!exists) {
          // 1. Create the sheet
          await sheets.spreadsheets.batchUpdate({
              spreadsheetId,
              resource: {
                  requests: [{ addSheet: { properties: { title: sheetName } } }]
              }
          });
          console.log(`[Google Sheets] Created new sheet: ${sheetName}`);
          
          // 2. Add headers to the newly created sheet
          const headers = ['ID', 'เลขทะเบียน', 'ปีทะเบียน', 'วันที่รับ', 'ที่หนังสือ', 'ลงวันที่', 'จาก', 'ถึง', 'เรื่อง', 'ผู้ปฏิบัติ', 'วันที่', 'ข้อสั่งการ', 'วันที่ลงนาม', 'หมายเหตุ', 'เอกสารข้อมูลเพิ่มเติม'];
          await sheets.spreadsheets.values.append({
              spreadsheetId,
              range: `${sheetName}!A1:O1`,
              valueInputOption: 'USER_ENTERED',
              resource: { values: [headers] }
          });
          console.log(`[Google Sheets] Added headers to new sheet: ${sheetName}`);
      }
  } catch (e) {
      console.error("[Google Sheets] Error checking/creating sheet:", e.message);
  }
}

// Function to append a single task to Google Sheets
exports.appendTaskToSheet = async (taskData) => {
  if (!SPREADSHEET_ID) {
    console.warn("GOOGLE_SHEET_ID is not set. Skipping sheet sync.");
    return;
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
    
    const sheetName = getSheetName(taskData.receive_year);
    await ensureSheetExists(sheets, SPREADSHEET_ID, sheetName);

    const rowData = [
      taskData.id || '',
      taskData.receive_no || '',
      taskData.receive_year || '',
      formatDateTH(taskData.created_at) || '',
      taskData.memo_no || '',
      formatDateTH(taskData.memo_date) || '',
      taskData.sender || '',
      taskData.recipient_to || '',
      taskData.title || '',
      cleanToOnlyName(taskData.personInCharge) || '',
      formatDateTH(taskData.due_date) || '',
      taskData.task_detail || '',
      formatDateTH(taskData.sign_date) || '',
      taskData.notes || '',
      taskData.additional_docs || ''
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:O`,
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
    const groupedTasks = {};
    for (const task of tasksArray) {
        const sheetName = getSheetName(task.receive_year);
        if (!groupedTasks[sheetName]) groupedTasks[sheetName] = [];
        groupedTasks[sheetName].push(task);
    }

    for (const [sheetName, tasks] of Object.entries(groupedTasks)) {
        await ensureSheetExists(sheets, SPREADSHEET_ID, sheetName);

        const values = tasks.map(taskData => [
          taskData.id || '',
          taskData.receive_no || '',
          taskData.receive_year || '',
          formatDateTH(taskData.created_at) || '',
          taskData.memo_no || '',
          formatDateTH(taskData.memo_date) || '',
          taskData.sender || '',
          taskData.recipient_to || '',
          taskData.title || '',
          cleanToOnlyName(taskData.personInCharge) || '',
          formatDateTH(taskData.due_date) || '',
          taskData.task_detail || '',
          formatDateTH(taskData.sign_date) || '',
          taskData.notes || '',
          taskData.additional_docs || ''
        ]);

        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheetName}!A:O`,
          valueInputOption: 'USER_ENTERED',
          resource: { values },
        });
    }
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
    
    const sheetName = getSheetName(taskData.receive_year);
    
    // 1. Fetch all data to find the row index based on ID (Column A)
    let getRes;
    try {
        getRes = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheetName}!A:A`, 
        });
    } catch (err) {
        console.warn(`[Google Sheets] Could not read sheet ${sheetName}. It might not exist.`);
        return;
    }
    
    const rows = getRes.data.values;
    if (!rows || rows.length === 0) return;

    // Find the row index (0-based array index, so +1 for Sheet row)
    const rowIndex = rows.findIndex(row => row[0] === taskData.id);
    
    if (rowIndex === -1) {
      console.warn(`[Google Sheets] Task ID ${taskData.id} not found in sheet ${sheetName}. Appending to sheet instead.`);
      await exports.appendTaskToSheet(taskData);
      return;
    }

    const sheetRowNumber = rowIndex + 1; // Google Sheets is 1-indexed

    const rowData = [
      taskData.id || '',
      taskData.receive_no || '',
      taskData.receive_year || '',
      formatDateTH(taskData.created_at) || '',
      taskData.memo_no || '',
      formatDateTH(taskData.memo_date) || '',
      taskData.sender || '',
      taskData.recipient_to || '',
      taskData.title || '',
      cleanToOnlyName(taskData.personInCharge) || '',
      formatDateTH(taskData.due_date) || '',
      taskData.task_detail || '',
      formatDateTH(taskData.sign_date) || '',
      taskData.notes || '',
      taskData.additional_docs || ''
    ];

    // 2. Update the specific row
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A${sheetRowNumber}:O${sheetRowNumber}`,
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
