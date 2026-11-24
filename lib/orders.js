// Money and rental periods for orders, shared by the cart, checkout and order pages.
//
// Rentals: the quantity is the number of machines (a rental listing's stock = machines available),
// and the dates say how long. Prices per Day count every day of the period (start and end included);
// prices per Hour count 8 working hours per day; Trip and Piece prices count once per day.

const HOURS_PER_DAY = 8;
const RENTAL_DAYS_MAX = 365;

// Money is added up in cents (whole numbers), so 0.1 + 0.2 never becomes 0.30000000000000004.
const toCents = (price) => Math.round(Number(price) * 100);

// A date typed in an <input type="date"> ("2026-12-01") -> a whole day number, or null if it is not a real date.
// Days are counted in UTC so that summer time never makes a day 23 or 25 hours long.
function dayNumber(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? ''));
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const time = Date.UTC(y, m - 1, d);
  const date = new Date(time);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null; // e.g. 2026-02-31
  return time / 86400000;
}

// "2026-12-01" for a day number (the format of <input type="date">).
const dayText = (n) => new Date(n * 86400000).toISOString().slice(0, 10);

// A DATE column from MySQL (a JavaScript Date at local midnight, or text) -> "2026-12-01".
function isoDay(value) {
  if (value instanceof Date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return String(value ?? '').slice(0, 10);
}

// Today as a day number (the server's calendar day).
function today() {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000;
}

// How many days a rental runs: both the first and the last day count (1 Dec - 3 Dec = 3 days).
const rentalDays = (start, end) => end - start + 1;

// How many price units a rental period costs per machine.
const billableUnits = (unit, days) => (unit === 'Hour' ? days * HOURS_PER_DAY : days);

// The cost of one line in cents. Rentals need the number of days.
function lineCents(line, days) {
  const base = toCents(line.price ?? line.unit_price) * Number(line.quantity);
  if (!Number(line.is_rentable)) return base;
  return base * billableUnits(line.unit, days ?? 1);
}

// "5 days x 8 h" / "5 days": how a rental's cost is counted, for the pages.
function rentalBasis(unit, days) {
  const dayWord = `${days} ${days === 1 ? 'day' : 'days'}`;
  return unit === 'Hour' ? `${dayWord} x ${HOURS_PER_DAY} h` : dayWord;
}

module.exports = {
  HOURS_PER_DAY, RENTAL_DAYS_MAX, toCents, dayNumber, dayText, isoDay, today, rentalDays, billableUnits, lineCents, rentalBasis,
};
