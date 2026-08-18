'use strict';

const { calendarRange, localDateKey, previousDayRange } = require('./report-time');
const { eventDevice } = require('./events');

function withinRange(event, range) {
  const timestamp = Date.parse(event.occurred_at);
  return Number.isFinite(timestamp)
    && timestamp >= Date.parse(range.from) && timestamp < Date.parse(range.to);
}

function aggregateChart(events, { days, now, timezone }) {
  const range = calendarRange(days, now, timezone);
  const byDate = new Map(range.dates.map((date) => [date, { date, opens: 0, alerts: 0 }]));
  for (const event of events) {
    if (!withinRange(event, range)) continue;
    const bucket = byDate.get(localDateKey(event.occurred_at, timezone));
    if (!bucket) continue;
    if (event.event_type === 'DOOR_OPENED') bucket.opens += 1;
    if (event.event_type === 'UNAUTHORIZED_OPEN') bucket.alerts += 1;
  }
  const buckets = [...byDate.values()];
  return {
    days, timezone, range: { from: range.from, to: range.to }, buckets,
    totals: {
      opens: buckets.reduce((sum, item) => sum + item.opens, 0),
      alerts: buckets.reduce((sum, item) => sum + item.alerts, 0),
    },
  };
}

function aggregateDailyReport(events, { now, timezone }) {
  const range = previousDayRange(now, timezone);
  const included = events.filter((event) => withinRange(event, range))
    .sort((left, right) => Date.parse(right.occurred_at) - Date.parse(left.occurred_at));
  const latestActivity = included.find((event) => eventDevice(String(event.event_type || '')) !== 'notification');
  return {
    timezone,
    report_date: range.reportDate,
    range: { from: range.from, to: range.to },
    opens: included.filter((event) => event.event_type === 'DOOR_OPENED').length,
    alerts: included.filter((event) => event.event_type === 'UNAUTHORIZED_OPEN').length,
    latest_activity: latestActivity ? {
      event_type: latestActivity.event_type,
      occurred_at: latestActivity.occurred_at,
      result: latestActivity.result,
    } : null,
  };
}

module.exports = { withinRange, aggregateChart, aggregateDailyReport };
