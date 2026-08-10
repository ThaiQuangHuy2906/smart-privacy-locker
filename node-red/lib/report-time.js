'use strict';

function validTimezone(timezone) {
  if (typeof timezone !== 'string' || timezone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(0);
    return true;
  } catch {
    return false;
  }
}

function partsAt(value, timezone) {
  if (!validTimezone(timezone)) throw new Error('INVALID_TIMEZONE');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const parsed = Object.fromEntries(parts
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]));
  return {
    year: parsed.year, month: parsed.month, day: parsed.day,
    hour: parsed.hour, minute: parsed.minute, second: parsed.second,
  };
}

function addDays(date, amount) {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + amount));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function zonedDateTimeToUtc(date, timezone) {
  const desiredAsUtc = Date.UTC(date.year, date.month - 1, date.day,
    date.hour || 0, date.minute || 0, date.second || 0);
  let guess = desiredAsUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = partsAt(guess, timezone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day,
      actual.hour, actual.minute, actual.second);
    const correction = desiredAsUtc - actualAsUtc;
    if (correction === 0) break;
    guess += correction;
  }
  return new Date(guess).toISOString();
}

function dateKey(date) {
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

function calendarRange(days, now, timezone) {
  if (![7, 30, 1].includes(days)) throw new Error('INVALID_RANGE_DAYS');
  const localToday = partsAt(now, timezone);
  const startDate = addDays(localToday, -(days - 1));
  const endDate = addDays(localToday, 1);
  return {
    from: zonedDateTimeToUtc(startDate, timezone),
    to: zonedDateTimeToUtc(endDate, timezone),
    dates: Array.from({ length: days }, (_value, index) => dateKey(addDays(startDate, index))),
  };
}

function previousDayRange(now, timezone) {
  const localToday = partsAt(now, timezone);
  const todayDate = { year: localToday.year, month: localToday.month, day: localToday.day };
  const startDate = addDays(localToday, -1);
  return {
    from: zonedDateTimeToUtc(startDate, timezone),
    to: zonedDateTimeToUtc(todayDate, timezone),
    reportDate: dateKey(startDate),
  };
}

function localDateKey(value, timezone) {
  return dateKey(partsAt(value, timezone));
}

function localTime(value, timezone) {
  const local = partsAt(value, timezone);
  return `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`;
}

module.exports = {
  validTimezone, partsAt, addDays, zonedDateTimeToUtc, dateKey,
  calendarRange, previousDayRange, localDateKey, localTime,
};
