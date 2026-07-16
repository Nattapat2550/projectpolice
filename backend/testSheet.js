const { google } = require('googleapis');
require('dotenv').config({ path: './config/config.env' });
const { appendTaskToSheet } = require('./services/googleSheetsService');

async function test() {
  console.log("Testing Google Sheets API...");
  
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
  );
  oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

  try {
    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
    
    const dummyData = [ 'test', '001', '2566', '2023-01-01', 'มท', '2023-01-01', 'sender', 'title', 'person', '2023-01-01', 'detail', '2023-01-01' ];
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'A:L', // Try omitting sheet name
      valueInputOption: 'USER_ENTERED',
      resource: { values: [dummyData] },
    });
    console.log("Append successful without sheet name.");
  } catch (error) {
    console.error("API Error:", error.message);
  }
}

test();
