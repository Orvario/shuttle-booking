"""Valid Flyers Hotel room numbers for shuttle bookings."""

HOTEL_ROOM_NUMBERS: tuple[str, ...] = (
    "101",
    "102",
    "103",
    "104",
    "105",
    "106",
    "107",
    "108",
    "109",
    "114",
    "115",
    "116",
    "117",
    "118",
    "120",
    "121",
    "122",
    "123",
    "124",
)

HOTEL_ROOM_SET = frozenset(HOTEL_ROOM_NUMBERS)


def normalize_hotel_room_number(value: str) -> str:
    """Strip and validate that the room belongs to the hotel."""
    s = value.strip()
    if not s:
        raise ValueError("Room number is required")
    if s not in HOTEL_ROOM_SET:
        raise ValueError("Select a valid hotel room number")
    return s
