const { google } = require('googleapis');
const { calculateFiscalRoundAndYear, parseAnyDateToIso, formatDateTH } = require('../utils/fiscalYearHelper');

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
      const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
      const headers = ['ID', 'เลขทะเบียน', 'ปีทะเบียน', 'วันที่รับ', 'ที่หนังสือ', 'ลงวันที่', 'จาก', 'ถึง', 'เรื่อง', 'ผู้ปฏิบัติ', 'วันที่', 'ข้อสั่งการ', 'วันที่ลงนาม', 'วันประชุม', 'กำหนดส่งตอบรับ', 'หมายเหตุ', 'เอกสารข้อมูลเพิ่มเติม', 'ชั้นความเร็ว', 'ชั้นความลับ', 'ลิงก์ไฟล์ต้นฉบับ'];
      if (!sheet) {
          // 1. Create the sheet
          await sheets.spreadsheets.batchUpdate({
              spreadsheetId,
              resource: {
                  requests: [{ addSheet: { properties: { title: sheetName } } }]
              }
          });
          console.log(`[Google Sheets] Created new sheet: ${sheetName}`);
          
          // 2. Add headers to the newly created sheet
          await sheets.spreadsheets.values.append({
              spreadsheetId,
              range: `${sheetName}!A1:T1`,
              valueInputOption: 'RAW',
              resource: { values: [headers] }
          });
          console.log(`[Google Sheets] Added headers to new sheet: ${sheetName}`);
      } else {
          // 3. Check if existing sheet header needs update to 20 columns
          try {
              const headerRes = await sheets.spreadsheets.values.get({
                  spreadsheetId,
                  range: `${sheetName}!A1:T1`
              });
              const existingHeaders = (headerRes.data.values && headerRes.data.values[0]) || [];
              if (existingHeaders.length < headers.length || !existingHeaders.includes('วันประชุม')) {
                  await sheets.spreadsheets.values.update({
                      spreadsheetId,
                      range: `${sheetName}!A1:T1`,
                      valueInputOption: 'RAW',
                      resource: { values: [headers] }
                  });
                  console.log(`[Google Sheets] Auto-updated header for sheet ${sheetName} to 20 columns.`);
              }
          } catch (err) {
              console.warn(`[Google Sheets] Header check warning for ${sheetName}:`, err.message);
          }
      }
  } catch (e) {
      console.error("[Google Sheets] Error checking/creating sheet:", e.message);
  }
}

const normalizeDateString = (str) => {
  if (!str) return '';
  let s = String(str).trim();
  if (!s) return '';

  if (s.includes('T')) {
    s = s.split('T')[0];
  } else if (s.includes(' ')) {
    s = s.split(' ')[0];
  }

  // 1. DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    let day = parseInt(dmyMatch[1], 10);
    let month = parseInt(dmyMatch[2], 10);
    let year = parseInt(dmyMatch[3], 10);
    if (year > 2500) year -= 543;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // 2. YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymdMatch) {
    let year = parseInt(ymdMatch[1], 10);
    let month = parseInt(ymdMatch[2], 10);
    let day = parseInt(ymdMatch[3], 10);
    if (year > 2500) year -= 543;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    let year = d.getFullYear();
    if (year > 2500) year -= 543;
    return `${year}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  return s;
};

const normalizeReceiveNo = (noInput) => {
  if (noInput === null || noInput === undefined || noInput === '') return '';
  const num = parseInt(String(noInput).replace(/[๐-๙]/g, d => '0123456789'['๐๑๒๓๔๕๖๗๘๙'.indexOf(d)]), 10);
  return isNaN(num) ? String(noInput).trim() : num;
};

const normalizeYear = (yearInput) => {
  if (!yearInput) return '';
  const num = parseInt(String(yearInput).replace(/[๐-๙]/g, d => '0123456789'['๐๑๒๓๔๕๖๗๘๙'.indexOf(d)]), 10);
  if (isNaN(num)) return String(yearInput).trim();
  return num < 2500 ? (num + 543) : num;
};

const isMatchingRow = (row, taskData) => {
  if (!row || row.length === 0) return false;

  const rowId = row[0] ? String(row[0]).trim() : '';
  const rowReceiveNo = row[1] ? String(row[1]).trim() : '';
  const rowReceiveYear = normalizeYear(row[2]);
  const rowReceivedDate = row[3] ? String(row[3]).trim() : '';
  const rowMemoNo = row[4] ? String(row[4]).trim() : '';

  const targetId = taskData.id ? String(taskData.id).trim() : '';
  const targetReceiveNo = taskData.receive_no ? String(taskData.receive_no).trim() : '';
  const targetReceiveYear = normalizeYear(taskData.receive_year);
  const targetReceivedDate = taskData.created_at || taskData.received_date || '';
  const targetMemoNo = taskData.memo_no ? String(taskData.memo_no).trim() : '';

  // 1. Strict ID match first (If both IDs exist, they MUST match exactly)
  if (targetId && rowId) {
    if (targetId === rowId) {
      return true;
    }
    // 🔒 Critical Fix: If both IDs exist and do not match, they belong to different DB records!
    // Never overwrite a row that has a different database ID.
    return false;
  }

  // 2. Check receive_no + receive_year match (when ID is missing on either side)
  if (targetReceiveNo && targetReceiveYear && rowReceiveNo === targetReceiveNo && rowReceiveYear === targetReceiveYear) {
    // 🔒 Check Evaluation Round (รอบที่ 1 ต.ค.-ธ.ค. vs รอบที่ 2 ม.ค.-ก.ย.)
    if (rowReceivedDate && targetReceivedDate) {
      const rowRound = calculateFiscalRoundAndYear(rowReceivedDate).round;
      const targetRound = calculateFiscalRoundAndYear(targetReceivedDate).round;
      if (rowRound !== targetRound) {
        // Different rounds: DO NOT MATCH, DO NOT OVERWRITE (e.g. 556 Round 1 vs 556 Round 2)
        return false;
      }
    }

    // Check memo_no (ที่หนังสือ) if both exist
    if (rowMemoNo && targetMemoNo && rowMemoNo !== targetMemoNo) {
      return false;
    }

    return true;
  }

  // 3. Check memo_no match (if receive_no is not available or as fallback)
  if (targetMemoNo && rowMemoNo === targetMemoNo) {
    if (targetReceiveYear && rowReceiveYear) {
      if (rowReceiveYear === targetReceiveYear) {
        if (rowReceivedDate && targetReceivedDate) {
          const rowRound = calculateFiscalRoundAndYear(rowReceivedDate).round;
          const targetRound = calculateFiscalRoundAndYear(targetReceivedDate).round;
          if (rowRound !== targetRound) {
            return false;
          }
        }
        return true;
      }
    } else {
      return true;
    }
  }

  return false;
};

const buildRowData = (taskData) => [
  taskData.id || '',
  normalizeReceiveNo(taskData.receive_no),
  normalizeYear(taskData.receive_year),
  formatDateTH(taskData.created_at || taskData.received_date) || '',
  taskData.memo_no || '',
  formatDateTH(taskData.memo_date) || '',
  taskData.sender || '',
  taskData.recipient_to || '',
  taskData.title || '',
  cleanToOnlyName(taskData.personInCharge) || '',
  formatDateTH(taskData.due_date) || '',
  taskData.task_detail || '',
  formatDateTH(taskData.sign_date) || '',
  formatDateTH(taskData.meeting_date) || '',
  formatDateTH(taskData.reply_due_date) || '',
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
        range: `${sheetName}!A:T`,
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
        range: `${sheetName}!A${sheetRowNumber}:T${sheetRowNumber}`,
        valueInputOption: 'RAW',
        resource: {
          values: [rowData],
        },
      });
      console.log(`[Google Sheets] Successfully updated existing task (row ${sheetRowNumber}) ${taskData.receive_no || taskData.title}`);
    } else {
      // Append new row
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:T`,
        valueInputOption: 'RAW',
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
            range: `${sheetName}!A:T`,
          });
          existingRows = getRes.data.values || [];
        } catch (e) {
          console.warn(`[Google Sheets] Could not fetch sheet ${sheetName}:`, e.message);
        }

        const rowsToAppend = [];
        const updateData = [];

        for (const taskData of tasks) {
          const rowIndex = existingRows.findIndex(row => isMatchingRow(row, taskData));
          const rowData = buildRowData(taskData);

          if (rowIndex !== -1) {
            const sheetRowNumber = rowIndex + 1;
            updateData.push({
              range: `${sheetName}!A${sheetRowNumber}:T${sheetRowNumber}`,
              values: [rowData]
            });
            existingRows[rowIndex] = rowData;
          } else {
            rowsToAppend.push(rowData);
          }
        }

        if (updateData.length > 0) {
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
              valueInputOption: 'RAW',
              data: updateData
            }
          });
        }

        if (rowsToAppend.length > 0) {
          await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A:T`,
            valueInputOption: 'RAW',
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
          range: `${sheetName}!A:T`, 
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
      range: `${sheetName}!A${sheetRowNumber}:T${sheetRowNumber}`,
      valueInputOption: 'RAW',
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
      range: `${sheetName}!A:T`,
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
        range: `${sheetName}!A:T`,
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

    // Clear Column Q (เอกสารข้อมูลเพิ่มเติม) and Column T (ลิงก์ไฟล์ต้นฉบับ)
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        valueInputOption: 'RAW',
        data: [
          { range: `${sheetName}!Q${sheetRowNumber}`, values: [['']] },
          { range: `${sheetName}!T${sheetRowNumber}`, values: [['']] }
        ]
      }
    });

    console.log(`[Google Sheets] Successfully cleared document links (Col Q & T) for task ID ${taskId} at row ${sheetRowNumber}`);
  } catch (error) {
    console.error("[Google Sheets] Clear Links Error:", error.message);
  }
};


