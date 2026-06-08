// Shared helpers for the Accounts / Finance section.

export const CURRENCY_SYMBOL = '₦';

// Format a number as Naira, e.g. 150000 -> "₦150,000".
export const formatNaira = (value, { decimals = 0 } = {}) => {
  const n = Number(value) || 0;
  const sign = n < 0 ? '-' : '';
  return `${sign}${CURRENCY_SYMBOL}${Math.abs(n).toLocaleString('en-NG', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

// Account types — value sent to the API, label shown in the UI.
export const ACCOUNT_TYPES = [
  { value: 'BANK',   label: 'Bank' },
  { value: 'CASH',   label: 'Cash' },
  { value: 'MOBILE', label: 'Mobile Money' },
  { value: 'OTHER',  label: 'Other' },
];

export const accountTypeLabel = (value) =>
  ACCOUNT_TYPES.find(t => t.value === value)?.label || 'Other';

// Preset categories for the dropdown — users can still type their own.
export const INCOME_CATEGORIES = [
  'Sponsorship', 'Ticket Sales', 'Donations', 'Grants', 'Merchandise', 'Other Income',
];

export const EXPENSE_CATEGORIES = [
  'Venue', 'Catering', 'Marketing', 'Production', 'Speaker Costs',
  'Travel', 'Printing', 'Equipment', 'Software', 'Volunteers', 'Miscellaneous',
];

// Format an ISO date as e.g. "Jun 7, 2026".
export const formatDate = (d) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// Today's date as YYYY-MM-DD for <input type="date"> defaults.
export const todayInput = () => new Date().toISOString().slice(0, 10);
