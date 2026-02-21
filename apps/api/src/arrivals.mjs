const WEEKDAY_TO_CALENDAR_FIELD = {
  Sunday: 'sunday',
  Monday: 'monday',
  Tuesday: 'tuesday',
  Wednesday: 'wednesday',
  Thursday: 'thursday',
  Friday: 'friday',
  Saturday: 'saturday'
};

const TWO_DIGITS = (number) => String(number).padStart(2, '0');

const getHonoluluParts = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const pick = (type) => parts.find((entry) => entry.type === type)?.value || '';

  return {
    year: Number.parseInt(pick('year'), 10),
    month: Number.parseInt(pick('month'), 10),
    day: Number.parseInt(pick('day'), 10),
    weekday: pick('weekday'),
    hour: Number.parseInt(pick('hour'), 10),
    minute: Number.parseInt(pick('minute'), 10),
    second: Number.parseInt(pick('second'), 10)
  };
};

const serviceDateString = (parts) => `${parts.year}${TWO_DIGITS(parts.month)}${TWO_DIGITS(parts.day)}`;

const calendarFieldForWeekday = (weekday) => WEEKDAY_TO_CALENDAR_FIELD[weekday] || null;

const shiftDateInUtc = (date, days) => {
  const shifted = new Date(date.getTime());
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
};

const formatServiceTime = (secondsFromMidnight) => {
  const seconds = ((secondsFromMidnight % 86_400) + 86_400) % 86_400;
  const hh = Math.floor(seconds / 3600);
  const mm = Math.floor((seconds % 3600) / 60);
  return `${TWO_DIGITS(hh)}:${TWO_DIGITS(mm)}`;
};

const isServiceActive = ({ serviceId, serviceDate, weekdayField, calendarByService, calendarDatesByService }) => {
  const exceptions = calendarDatesByService[serviceId] || [];
  const exception = exceptions.find((entry) => entry.date === serviceDate);

  if (exception) {
    return exception.exception_type === 1;
  }

  const base = calendarByService[serviceId];
  if (!base || !weekdayField) {
    return false;
  }

  if (serviceDate < base.start_date || serviceDate > base.end_date) {
    return false;
  }

  return base[weekdayField] === 1;
};

const formatEpochForTimezone = (epochSeconds, timezone) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(epochSeconds * 1000));

const normalizeRealtimeArrivals = ({ updates, stopId, staticGtfs, limit, timezone }) => {
  const filtered = (updates?.[stopId] || [])
    .map((update) => {
      const etaEpoch = update.arrival_time ?? update.departure_time;
      if (!etaEpoch) {
        return null;
      }

      const trip = update.trip_id ? staticGtfs.getTrip(update.trip_id) : null;
      const direction = update.trip_id ? staticGtfs.getTripDirection(update.trip_id) : null;
      return {
        stop_id: stopId,
        trip_id: update.trip_id,
        route_id: update.route_id || trip?.route_id || null,
        headsign: trip?.trip_headsign || null,
        direction_id: direction?.direction_id ?? (Number.isInteger(trip?.direction_id) ? trip.direction_id : null),
        direction_code: direction?.direction_code || null,
        direction_label: direction?.direction_label || null,
        is_loop: Boolean(direction?.is_loop),
        arrival_epoch: etaEpoch,
        arrival_label: formatEpochForTimezone(etaEpoch, timezone),
        arrival_in_minutes: Math.max(0, Math.round((etaEpoch - Date.now() / 1000) / 60)),
        is_realtime: true,
        delay_seconds: update.delay_seconds ?? null
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.arrival_epoch - b.arrival_epoch)
    .slice(0, limit);

  return filtered;
};

const buildScheduledArrivals = ({ stopId, staticGtfs, limit, timezone }) => {
  const stopTimes = staticGtfs.getStopTimes(stopId);
  if (!stopTimes.length) {
    return [];
  }

  const calendar = staticGtfs.getCalendar();
  const calendarByService = calendar.calendarByService || {};
  const calendarDatesByService = calendar.calendarDatesByService || {};

  const now = new Date();
  const todayParts = getHonoluluParts(now, timezone);
  const nowSeconds = todayParts.hour * 3600 + todayParts.minute * 60 + todayParts.second;
  const results = [];

  for (const dayOffset of [0, 1]) {
    const shiftedDate = shiftDateInUtc(now, dayOffset);
    const dayParts = getHonoluluParts(shiftedDate, timezone);
    const dateKey = serviceDateString(dayParts);
    const weekdayField = calendarFieldForWeekday(dayParts.weekday);

    for (const stopTime of stopTimes) {
      if (
        !isServiceActive({
          serviceId: stopTime.service_id,
          serviceDate: dateKey,
          weekdayField,
          calendarByService,
          calendarDatesByService
        })
      ) {
        continue;
      }

      const candidateSeconds = stopTime.arrival_secs + dayOffset * 86_400;
      if (candidateSeconds < nowSeconds) {
        continue;
      }

      const etaMinutes = Math.max(0, Math.round((candidateSeconds - nowSeconds) / 60));
      const direction = staticGtfs.getTripDirection(stopTime.trip_id);
      results.push({
        stop_id: stopId,
        trip_id: stopTime.trip_id,
        route_id: stopTime.route_id,
        headsign: stopTime.headsign || null,
        direction_id: direction?.direction_id ?? (Number.isInteger(stopTime.direction_id) ? stopTime.direction_id : null),
        direction_code: direction?.direction_code || null,
        direction_label: direction?.direction_label || null,
        is_loop: Boolean(direction?.is_loop),
        arrival_epoch: null,
        arrival_label: formatServiceTime(stopTime.arrival_secs),
        arrival_in_minutes: etaMinutes,
        is_realtime: false,
        delay_seconds: null
      });
    }
  }

  return results
    .sort((a, b) => a.arrival_in_minutes - b.arrival_in_minutes)
    .slice(0, limit);
};

export const buildArrivalsForStop = ({ stopId, tripUpdatesFeed, staticGtfs, limit, timezone }) => {
  const realtimeArrivals = normalizeRealtimeArrivals({
    updates: tripUpdatesFeed?.by_stop,
    stopId,
    staticGtfs,
    limit,
    timezone
  });

  if (realtimeArrivals.length > 0) {
    return {
      source: 'realtime',
      arrivals: realtimeArrivals
    };
  }

  const scheduledArrivals = buildScheduledArrivals({
    stopId,
    staticGtfs,
    limit,
    timezone
  });

  return {
    source: 'scheduled',
    arrivals: scheduledArrivals
  };
};
