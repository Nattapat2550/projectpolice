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
          const headers = ['ID', 'เลขทะเบียน', 'ปีทะเบียน', 'วันที่รับ', 'ที่หนังสือ', 'ลงวันที่', 'จาก', 'ถึง', 'เรื่อง', 'ผู้ปฏิบัติ', 'วันที่', 'ข้อสั่งการ', 'วันที่ลงนาม', 'หมายเหตุ', 'เอกสารข้อมูลเพิ่มเติม', 'ชั้นความเร็ว', 'ชั้นความลับ', 'ลิงก์ไฟล์ต้นฉบับ'];
          await sheets.spreadsheets.values.append({
              spreadsheetId,
              range: `${sheetName}!A1:R1`,
              valueInputOption: 'USER_ENTERED',
              resource: { values: [headers] }
          });
          console.log(`[Google Sheets] Added headers to new sheet: ${sheetName}`);
      }
  } catch (e) {
      console.error("[Google Sheets] Error checking/creating sheet:", e.message);
  }
}

const isMatchingRow = (row, taskData) => {
  if (!row || row.length === 0) return false;

  const rowId = row[0] ? String(row[0]).trim() : '';
  const rowReceiveNo = row[1] ? String(row[1]).trim() : '';
  const rowReceiveYear = row[2] ? String(row[2]).trim() : '';
  const rowMemoNo = row[4] ? String(row[4]).trim() : '';

  const targetId = taskData.id ? String(taskData.id).trim() : '';
  const targetReceiveNo = taskData.receive_no ? String(taskData.receive_no).trim() : '';
  const targetReceiveYear = taskData.receive_year ? String(taskData.receive_year).trim() : '';
  const targetMemoNo = taskData.memo_no ? String(taskData.memo_no).trim() : '';

  // 1. Check ID exact match first
  if (targetId && rowId && targetId === rowId) {
    return true;
  }

  // 2. Check receive_no + receive_year match
  if (targetReceiveNo && targetReceiveYear && rowReceiveNo === targetReceiveNo && rowReceiveYear === targetReceiveYear) {
    return true;
  }

  // 3. Check memo_no match (if receive_no is not available or as fallback)
  if (targetMemoNo && rowMemoNo === targetMemoNo) {
    if (targetReceiveYear && rowReceiveYear) {
      if (rowReceiveYear === targetReceiveYear) return true;
    } else {
      return true;
    }
  }

  return false;
};

const buildRowData = (taskData) => [
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
  taskData.additional_docs || '',
  taskData.urgency_level || 'ปกติ',
  taskData.secret_level || 'ปกติ',
  taskData.document_link || taskData.drive_web_view_link || ''
];

// Function to append or update a single task in Google Sheets
exports.appendTaskToSheet = async (taskData) => {
  if (!SPREADSHEET_ID) {
    console.warn("GOOGLE_SHEET_ID is not set. Skipping sheet sync.");
    return;
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
    
    const sheetName = getSheetName(taskData.receive_year);
    await ensureSheetExists(sheets, SPREADSHEET_ID, sheetName);

    let rows = [];
    try {
      const getRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:R`,
      });
      rows = getRes.data.values || [];
    } catch (e) {
      console.warn(`[Google Sheets] Could not fetch sheet ${sheetName}:`, e.message);
    }

    const rowIndex = rows.findIndex(row => isMatchingRow(row, taskData));
    const rowData = buildRowData(taskData);

    if (rowIndex !== -1) {
      // Update existing row
      const sheetRowNumber = rowIndex + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A${sheetRowNumber}:R${sheetRowNumber}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [rowData],
        },
      });
      console.log(`[Google Sheets] Successfully updated existing task (row ${sheetRowNumber}) ${taskData.receive_no || taskData.title}`);
    } else {
      // Append new row
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:R`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [rowData],
        },
      });
      console.log(`[Google Sheets] Successfully appended task ${taskData.receive_no || taskData.title}`);
    }
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

        let existingRows = [];
        try {
          const getRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A:R`,
          });
          existingRows = getRes.data.values || [];
        } catch (e) {
          console.warn(`[Google Sheets] Could not fetch sheet ${sheetName}:`, e.message);
        }

        const rowsToAppend = [];
        for (const taskData of tasks) {
          const rowIndex = existingRows.findIndex(row => isMatchingRow(row, taskData));
          const rowData = buildRowData(taskData);

          if (rowIndex !== -1) {
            const sheetRowNumber = rowIndex + 1;
            await sheets.spreadsheets.values.update({
              spreadsheetId: SPREADSHEET_ID,
              range: `${sheetName}!A${sheetRowNumber}:R${sheetRowNumber}`,
              valueInputOption: 'USER_ENTERED',
              resource: { values: [rowData] },
            });
            existingRows[rowIndex] = rowData;
          } else {
            rowsToAppend.push(rowData);
          }
        }

        if (rowsToAppend.length > 0) {
          await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A:R`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: rowsToAppend },
          });
        }
    }
    console.log(`[Google Sheets] Successfully synced ${tasksArray.length} tasks`);
  } catch (error) {
    console.error("[Google Sheets] Batch Sync Error:", error.message);
  }
};

exports.updateTaskInSheet = async (taskData) => {
  if (!SPREADSHEET_ID) return;
  if (!taskData) return;

  try {
    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
    
    const sheetName = getSheetName(taskData.receive_year);
    
    let getRes;
    try {
        getRes = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheetName}!A:R`, 
        });
    } catch (err) {
        console.warn(`[Google Sheets] Could not read sheet ${sheetName}. It might not exist.`);
        return;
    }
    
    const rows = getRes.data.values;
    if (!rows || rows.length === 0) return;

    const rowIndex = rows.findIndex(row => isMatchingRow(row, taskData));
    
    if (rowIndex === -1) {
      console.warn(`[Google Sheets] Task ${taskData.receive_no || taskData.id} not found in sheet ${sheetName}. Appending to sheet instead.`);
      await exports.appendTaskToSheet(taskData);
      return;
    }

    const sheetRowNumber = rowIndex + 1;
    const rowData = buildRowData(taskData);

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A${sheetRowNumber}:R${sheetRowNumber}`,
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

exports.deleteTaskFromSheet = async (taskId, receiveYear, receiveNo = '') => {
  if (!SPREADSHEET_ID) return;
  if (!taskId && !receiveNo) return;

  try {
    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
    const sheetName = getSheetName(receiveYear);

    const response = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheetObj = response.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheetObj) return;
    const sheetId = sheetObj.properties.sheetId;

    const getRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:R`,
    });

    const rows = getRes.data.values;
    if (!rows || rows.length === 0) return;

    const dummyTask = { id: taskId, receive_no: receiveNo, receive_year: receiveYear };
    const rowIndex = rows.findIndex(row => isMatchingRow(row, dummyTask));

    if (rowIndex === -1) {
      console.warn(`[Google Sheets] Delete task: ID ${taskId} / receive_no ${receiveNo} not found in sheet ${sheetName}.`);
      return;
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex,
              endIndex: rowIndex + 1
            }
          }
        }]
      }
    });

    console.log(`[Google Sheets] Successfully deleted row ${rowIndex + 1} for task ID ${taskId}`);
  } catch (error) {
    console.error("[Google Sheets] Delete Sync Error:", error.message);
  }
};

exports.clearTaskLinksInSheet = async (taskId, receiveYear, receiveNo = '') => {
  if (!SPREADSHEET_ID) return;
  if (!taskId && !receiveNo) return;

  try {
    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
    const sheetName = getSheetName(receiveYear);

    let getRes;
    try {
      getRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:R`,
      });
    } catch (err) {
      console.warn(`[Google Sheets] Could not read sheet ${sheetName}`);
      return;
    }

    const rows = getRes.data.values;
    if (!rows || rows.length === 0) return;

    const dummyTask = { id: taskId, receive_no: receiveNo, receive_year: receiveYear };
    const rowIndex = rows.findIndex(row => isMatchingRow(row, dummyTask));

    if (rowIndex === -1) {
      console.warn(`[Google Sheets] Clear links: Task ID ${taskId} / receive_no ${receiveNo} not found in sheet ${sheetName}.`);
      return;
    }

    const sheetRowNumber = rowIndex + 1;

    // Clear Column O (เอกสารข้อมูลเพิ่มเติม) and Column R (ลิงก์ไฟล์ต้นฉบับ)
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `${sheetName}!O${sheetRowNumber}`, values: [['']] },
          { range: `${sheetName}!R${sheetRowNumber}`, values: [['']] }
        ]
      }
    });

    console.log(`[Google Sheets] Successfully cleared document links (Col O & R) for task ID ${taskId} at row ${sheetRowNumber}`);
  } catch (error) {
    console.error("[Google Sheets] Clear Links Error:", error.message);
  }
};


