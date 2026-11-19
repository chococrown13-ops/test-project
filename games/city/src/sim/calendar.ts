/** The calendar month (1-12) of a game day; the game starts in March. */
export const calendarMonthOf = (day: number) => ((Math.floor(day / 30) + 2) % 12) + 1;
