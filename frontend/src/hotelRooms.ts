/** Valid Flyers Hotel room numbers for shuttle bookings. */
export const HOTEL_ROOM_NUMBERS = [
  '101',
  '102',
  '103',
  '104',
  '105',
  '106',
  '107',
  '108',
  '109',
  '114',
  '115',
  '116',
  '117',
  '118',
  '120',
  '121',
  '122',
  '123',
  '124',
] as const;

export type HotelRoomNumber = (typeof HOTEL_ROOM_NUMBERS)[number];
