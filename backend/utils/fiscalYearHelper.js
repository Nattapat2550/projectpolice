/**
 * Utility to calculate Fiscal Year (ปีงบประมาณ) and Round (รอบประเมิน 1 หรือ 2)
 * Based on Thai Bureaucracy Fiscal Calendar:
 * - Round 1 (รอบที่ 1): 1 Oct - 31 Dec (Months 10, 11, 12) -> Belongs to Fiscal Year = CE Year + 1
 * - Round 2 (รอบที่ 2): 1 Jan - 30 Sep (Months 1-9) -> Belongs to Fiscal Year = CE Year
 */

function calculateFiscalRoundAndYear(dateInput) {
    let d = dateInput;
    if (typeof d === 'string' && d.trim()) {
        const match = d.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
        if (match) {
            let y = parseInt(match[1], 10);
            if (y > 2400) y -= 543;
            d = `${y}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}${d.slice(match[0].length)}`;
        }
    }
    if (!(d instanceof Date)) {
        d = d ? new Date(d) : new Date();
    }

    if (isNaN(d.getTime())) {
        d = new Date();
    }

    const month = d.getMonth() + 1; // 1 - 12
    let calendarYear = d.getFullYear(); // e.g. 2026
    if (calendarYear > 2400) {
        calendarYear -= 543;
    }

    let round = 2;
    let fiscalYear = calendarYear;

    if (month >= 10 && month <= 12) {
        round = 1;
        fiscalYear = calendarYear + 1; // e.g. 2026-10 -> Fiscal Year 2027
    } else {
        round = 2;
        fiscalYear = calendarYear;    // e.g. 2027-02 -> Fiscal Year 2027
    }

    return {
        round,
        fiscalYear,
        calendarYear
    };
}

function getFormattedRoundString(round, fiscalYear) {
    const yearBE = (fiscalYear > 2400) ? fiscalYear : (fiscalYear + 543);
    return `รอบ ${round}/${yearBE}`;
}

module.exports = {
    calculateFiscalRoundAndYear,
    getFormattedRoundString
};
