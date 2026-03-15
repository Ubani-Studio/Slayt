const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const padNumber = (value) => String(value).padStart(2, '0');

export const toDateInputValue = (value) => {
  if (!value) return '';

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  return `${parsed.getFullYear()}-${padNumber(parsed.getMonth() + 1)}-${padNumber(parsed.getDate())}`;
};

export const toTimeInputValue = (value) => {
  if (!value) return '12:00';

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '12:00';

  return `${padNumber(parsed.getHours())}:${padNumber(parsed.getMinutes())}`;
};

export const combineScheduleDateTime = (dateValue, timeValue = '12:00') => {
  if (!dateValue) return null;

  const [year, month, day] = String(dateValue).split('-').map(Number);
  const [hours, minutes] = String(timeValue || '12:00').split(':').map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const combined = new Date(
    year,
    month - 1,
    day,
    Number.isFinite(hours) ? hours : 12,
    Number.isFinite(minutes) ? minutes : 0,
    0,
    0,
  );

  return Number.isNaN(combined.getTime()) ? null : combined;
};

export const formatScheduleSummary = (value, options = {}) => {
  if (!value) {
    return 'Not scheduled';
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Not scheduled';
  }

  const formatOptions = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...options,
  };

  return parsed.toLocaleString('en-US', formatOptions);
};

export const formatScheduleDateOnly = (value) => {
  if (!value) return '';

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const getCalendarMonthLabel = (monthDate) => {
  const parsed = monthDate instanceof Date ? monthDate : new Date(monthDate);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${MONTH_LABELS[parsed.getMonth()]} ${parsed.getFullYear()}`;
};

const addDays = (value, amount) => {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
};

const startOfDay = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

const getCalendarGridStart = (monthDate) => {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  return addDays(firstDay, -firstDay.getDay());
};

export const getCalendarWeeks = (monthDate, { selectedDate, minDate } = {}) => {
  const month = monthDate instanceof Date ? monthDate : new Date(monthDate);
  const selectedKey = toDateInputValue(selectedDate);
  const minKey = toDateInputValue(minDate);
  const todayKey = toDateInputValue(new Date());
  const cursor = getCalendarGridStart(month);
  const weeks = [];

  for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
    const days = [];

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const current = addDays(cursor, weekIndex * 7 + dayIndex);
      const dateKey = toDateInputValue(current);

      days.push({
        date: current,
        dateKey,
        label: current.getDate(),
        isCurrentMonth: current.getMonth() === month.getMonth(),
        isSelected: dateKey === selectedKey,
        isToday: dateKey === todayKey,
        isDisabled: Boolean(minKey && dateKey < minKey),
      });
    }

    weeks.push(days);
  }

  return weeks;
};

const nextWeekdayOccurrence = (date, weekday) => {
  const next = startOfDay(date);
  const dayDifference = (weekday - next.getDay() + 7) % 7 || 7;
  return addDays(next, dayDifference);
};

const advanceScheduledDate = (date, cadence, intervalDays = 2) => {
  switch (cadence) {
    case 'same_day':
      return new Date(date);
    case 'weekly':
      return addDays(date, 7);
    case 'interval':
      return addDays(date, Math.max(1, Number(intervalDays) || 1));
    case 'weekdays': {
      let next = addDays(date, 1);
      while (next.getDay() === 0 || next.getDay() === 6) {
        next = addDays(next, 1);
      }
      return next;
    }
    case 'daily':
    default:
      return addDays(date, 1);
  }
};

export const buildCollectionScheduleEntries = (videos, config = {}) => {
  const startAt = combineScheduleDateTime(config.startDate, config.time);
  if (!startAt) return [];

  const cadence = config.cadence || 'daily';
  const intervalDays = config.intervalDays || 2;
  let cursor = new Date(startAt);

  return videos.map((video) => {
    const scheduledAt = new Date(cursor);
    const entry = {
      video,
      videoId: video.id || video._id,
      scheduledAt,
      scheduledDate: scheduledAt.toISOString(),
      summary: formatScheduleSummary(scheduledAt),
    };

    if (cadence !== 'same_day') {
      cursor = advanceScheduledDate(cursor, cadence, intervalDays);
    }

    return entry;
  });
};

export const getQuickSchedulePresets = (referenceDate = new Date()) => {
  const now = new Date(referenceDate);
  const tonight = new Date(now);
  tonight.setHours(18, 0, 0, 0);
  if (tonight <= now) {
    tonight.setDate(tonight.getDate() + 1);
  }

  const tomorrowMorning = addDays(startOfDay(now), 1);
  tomorrowMorning.setHours(9, 0, 0, 0);

  const nextMonday = nextWeekdayOccurrence(now, 1);
  nextMonday.setHours(9, 0, 0, 0);

  return [
    {
      id: 'tonight',
      label: 'Tonight',
      description: '6:00 PM',
      date: toDateInputValue(tonight),
      time: toTimeInputValue(tonight),
    },
    {
      id: 'tomorrow',
      label: 'Tomorrow',
      description: '9:00 AM',
      date: toDateInputValue(tomorrowMorning),
      time: toTimeInputValue(tomorrowMorning),
    },
    {
      id: 'next-monday',
      label: 'Next Monday',
      description: '9:00 AM',
      date: toDateInputValue(nextMonday),
      time: toTimeInputValue(nextMonday),
    },
  ];
};

export { WEEKDAY_LABELS };
