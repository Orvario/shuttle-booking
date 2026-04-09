export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const PRICE_TABLE_ISK: Record<number, number> = {
  1: 4400,
  2: 4400,
  3: 5100,
  4: 5800,
  5: 6500,
  6: 7200,
  7: 7900,
  8: 8000,
};

export const TIME_SLOTS = ['05:00', '06:00', '07:00', '14:00'];

export const CURRENCY = 'ISK';

export const ROUTE = {
  from: 'Keflavík International Airport (KEF)',
  to: 'Flyers Airport Hotel',
};
