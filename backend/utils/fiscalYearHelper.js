/**
 * Utility to calculate Fiscal Year (ปีงบประมาณ) and Round (รอบประเมิน 1 หรือ 2)
 * Based on Thai Bureaucracy Fiscal Calendar:
 * - Round 1 (รอบที่ 1): 1 Oct - 31 Dec (Months 10, 11, 12) -> Belongs to Fiscal Year = CE Year + 1
 * - Round 2 (รอบที่ 2): 1 Jan - 30 Sep (Months 1-9) -> Belongs to Fiscal Year = CE Year
 */

function calculateFiscalRoundAndYear(dateInput) {
    let d = dateInput;
    if (!(d instanceof Date)) {
        if (!d) {
            d = new Date();
        } else {
            d = new Date(d);
        }
    }

    if (isNaN(d.getTime())) {
        d = new Date();
    }

    const month = d.getMonth() + 1; // 1 - 12
    const calendarYear = d.getFullYear(); // e.g. 2026

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
