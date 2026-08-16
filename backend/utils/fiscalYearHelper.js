/**
 * Utility to calculate Fiscal Year (ปีงบประมาณ) and Round (รอบประเมิน 1 หรือ 2)
 * Based on Thai Bureaucracy Fiscal Calendar:
 * - Round 1 (รอบที่ 1): 1 Oct - 31 Dec (Months 10, 11, 12) -> Belongs to Fiscal Year = CE Year + 1 (พ.ศ. = ปีปัจจุบัน + 544 หรือ ปี พ.ศ. ของปีงบประมาณ)
 * - Round 2 (รอบที่ 2): 1 Jan - 30 Sep (Months 1-9) -> Belongs to Fiscal Year = CE Year (พ.ศ. = ปีปัจจุบัน + 543)
 */

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const THAI_MONTHS_ABBR = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const THAI_NUMERALS = { '๐':'0', '๑':'1', '๒':'2', '๓':'3', '๔':'4', '๕':'5', '๖':'6', '๗':'7', '๘':'8', '๙':'9' };

/**
 * Universal date parser that handles:
 * - Date objects
 * - YYYY-MM-DD or YYYY/MM/DD (CE or BE)
 * - DD/MM/YYYY or DD-MM-YYYY or D/M/YYYY (CE or BE)
 * - Thai text format: 25 มี.ค. 2569, 25 ธันวาคม 2568, 25 ธ.ค. 68
 * - Excel Serial Numbers (e.g. 45488, 244460)
 * - ISO string with time
 * Returns: YYYY-MM-DD (CE) string or null
 */
function parseAnyDateToIso(dateInput) {
    if (!dateInput) return null;

    if (dateInput instanceof Date) {
        if (isNaN(dateInput.getTime())) return null;
        let y = dateInput.getFullYear();
        if (y > 2400) y -= 543;
        const m = String(dateInput.getMonth() + 1).padStart(2, '0');
        const d = String(dateInput.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // Handle Excel serial date numbers (e.g. 45488 -> 2024-07-15)
    const num = Number(dateInput);
    if (!isNaN(num) && num > 20000 && num < 300000 && !String(dateInput).includes('-') && !String(dateInput).includes('/')) {
        const dateObj = new Date(Math.round((num - 25569) * 86400 * 1000));
        if (!isNaN(dateObj.getTime())) {
            let y = dateObj.getFullYear();
            if (y > 2400) y -= 543;
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const d = String(dateObj.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
    }

    let s = String(dateInput).trim();
    if (!s) return null;

    // Convert Thai numerals to Arabic numerals
    s = s.replace(/[๐-๙]/g, match => THAI_NUMERALS[match]);

    // Strip time part if present
    if (s.includes('T')) {
        s = s.split('T')[0].trim();
    } else if (s.includes(' ') && (s.includes(':') || s.match(/\d{1,2}:\d{1,2}/))) {
        s = s.split(' ')[0].trim();
    }

    // 1. YYYY-MM-DD or YYYY/MM/DD (4 digits first)
    const ymdMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (ymdMatch) {
        let year = parseInt(ymdMatch[1], 10);
        if (year > 2400) year -= 543;
        const month = parseInt(ymdMatch[2], 10);
        const day = parseInt(ymdMatch[3], 10);

        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2150) {
            const dObj = new Date(Date.UTC(year, month - 1, day));
            if (dObj.getUTCFullYear() === year && dObj.getUTCMonth() === month - 1 && dObj.getUTCDate() === day) {
                return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }
        }
        return null;
    }

    // 2. DD/MM/YYYY or DD-MM-YYYY or D/M/YYYY or DD/MM/YY
    const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (dmyMatch) {
        const day = parseInt(dmyMatch[1], 10);
        const month = parseInt(dmyMatch[2], 10);
        let year = parseInt(dmyMatch[3], 10);
        if (year < 100) year += 2500;
        if (year > 2400) year -= 543;

        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2150) {
            const dObj = new Date(Date.UTC(year, month - 1, day));
            if (dObj.getUTCFullYear() === year && dObj.getUTCMonth() === month - 1 && dObj.getUTCDate() === day) {
                return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }
        }
        return null;
    }

    // 3. Thai text date (e.g. 25 ธ.ค. 2568, 25 ธันวาคม 2568, 25 ธ.ค. 68)
    const thaiMatch = s.match(/^(\d{1,2})\s+([^\s\d]+)\s+(\d{2,4})$/);
    if (thaiMatch) {
        const day = parseInt(thaiMatch[1], 10);
        const monthStr = thaiMatch[2].trim();
        let year = parseInt(thaiMatch[3], 10);
        if (year < 100) year += 2500;
        if (year > 2400) year -= 543;

        let monthIndex = THAI_MONTHS.findIndex(m => m === monthStr);
        if (monthIndex === -1) monthIndex = THAI_MONTHS_ABBR.findIndex(m => m === monthStr || m.replace('.', '') === monthStr.replace('.', ''));
        if (monthIndex === -1) monthIndex = THAI_MONTHS.findIndex(m => monthStr.includes(m));
        if (monthIndex === -1) monthIndex = THAI_MONTHS_ABBR.findIndex(m => monthStr.includes(m.replace('.', '')));

        if (monthIndex !== -1) {
            const month = monthIndex + 1;
            if (day >= 1 && day <= 31 && year >= 1900 && year <= 2150) {
                const dObj = new Date(Date.UTC(year, monthIndex, day));
                if (dObj.getUTCFullYear() === year && dObj.getUTCMonth() === monthIndex && dObj.getUTCDate() === day) {
                    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                }
            }
        }
        return null;
    }

    // Reject all other non-date text
    return null;
}

function calculateFiscalRoundAndYear(dateInput) {
    const isoDate = parseAnyDateToIso(dateInput);
    let yearCE, month, day;

    if (isoDate) {
        const parts = isoDate.split('-');
        yearCE = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        day = parseInt(parts[2], 10);
    } else {
        const now = new Date();
        yearCE = now.getFullYear();
        if (yearCE > 2400) yearCE -= 543;
        month = now.getMonth() + 1;
        day = now.getDate();
    }

    let round = 2;
    let fiscalYear = yearCE;

    if (month >= 10 && month <= 12) {
        round = 1;
        fiscalYear = yearCE + 1; // e.g. Oct-Dec 2025 -> Fiscal Year 2026 (BE 2569)
    } else {
        round = 2;
        fiscalYear = yearCE;    // e.g. Jan-Sep 2026 -> Fiscal Year 2026 (BE 2569)
    }

    const fiscalYearBE = fiscalYear < 2400 ? fiscalYear + 543 : fiscalYear;
    const calendarYearBE = yearCE < 2400 ? yearCE + 543 : yearCE;

    return {
        round,
        fiscalYear,        // CE Year (e.g. 2026)
        fiscalYearBE,      // BE Year (e.g. 2569)
        calendarYear: yearCE,
        calendarYearBE,
        isoDate: isoDate || `${yearCE}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    };
}

function getFormattedRoundString(round, fiscalYear) {
    const yearBE = (fiscalYear > 2400) ? fiscalYear : (fiscalYear + 543);
    return `รอบ ${round}/${yearBE}`;
}

/**
 * Format any date input into Thai format: DD/MM/YYYY (วว/ดด/ปปปป)
 * Example: 2026-03-23 -> "23/03/2569"
 */
function formatDateTH(dateInput) {
    if (!dateInput) return '';
    const iso = parseAnyDateToIso(dateInput);
    if (!iso) {
        const s = String(dateInput).trim();
        const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (dmy) {
            const day = dmy[1].padStart(2, '0');
            const month = dmy[2].padStart(2, '0');
            let year = parseInt(dmy[3], 10);
            if (year < 100) year += 2500;
            const yearBE = year < 2400 ? year + 543 : year;
            return `${day}/${month}/${yearBE}`;
        }
        return '';
    }
    const [y, m, d] = iso.split('-');
    let yearNum = parseInt(y, 10);
    const yearBE = yearNum < 2400 ? yearNum + 543 : yearNum;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${yearBE}`;
}

module.exports = {
    parseAnyDateToIso,
    formatDateTH,
    calculateFiscalRoundAndYear,
    getFormattedRoundString
};
