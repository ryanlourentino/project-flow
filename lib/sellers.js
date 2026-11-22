// Small helpers about sellers, shared by the item page and the seller page.

// "4800 Cedar Way, Parkside, TX 80569 (Suite 9)" -> "Parkside, TX". Buyers see the city and state,
// not the street address (contact details are shared only after an order).
function locationOf(address) {
  const match = /,\s*([^,]+),\s*([A-Z]{2})\b/.exec(String(address ?? ''));
  return match ? `${match[1]}, ${match[2]}` : '';
}

// Only Suppliers can be verified (they have a certificate); Rental partners have no verification yet.
const isVerified = (row) => row.verification_status === 'Approved';

module.exports = { locationOf, isVerified };
