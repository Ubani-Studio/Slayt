import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';
import {
  WEEKDAY_LABELS,
  combineScheduleDateTime,
  formatScheduleSummary,
  getCalendarMonthLabel,
  getCalendarWeeks,
  getQuickSchedulePresets,
  toDateInputValue,
} from '../../lib/youtubeSchedule';

function YouTubeSchedulePopover({
  isOpen,
  scheduledDate,
  scheduledTime,
  canSchedule,
  onApply,
  onClear,
  onClose,
}) {
  const popoverRef = useRef(null);
  const [draftDate, setDraftDate] = useState(scheduledDate || '');
  const [draftTime, setDraftTime] = useState(scheduledTime || '12:00');
  const [visibleMonth, setVisibleMonth] = useState(() => combineScheduleDateTime(scheduledDate, '12:00') || new Date());
  const minDate = toDateInputValue(new Date());

  useEffect(() => {
    if (!isOpen) return;

    setDraftDate(scheduledDate || '');
    setDraftTime(scheduledTime || '12:00');
    setVisibleMonth(combineScheduleDateTime(scheduledDate || minDate, '12:00') || new Date());
  }, [isOpen, minDate, scheduledDate, scheduledTime]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        onClose?.();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const calendarWeeks = getCalendarWeeks(visibleMonth, {
    selectedDate: draftDate,
    minDate,
  });
  const scheduleSummary = draftDate
    ? formatScheduleSummary(combineScheduleDateTime(draftDate, draftTime))
    : 'Choose a date';

  return (
    <div
      ref={popoverRef}
      className="absolute left-0 top-full z-30 mt-2 w-[19rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-dark-600 bg-dark-800 p-3 shadow-2xl"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-dark-100">Schedule video</p>
          <p className="text-xs text-dark-400">{scheduleSummary}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-dark-500 transition-colors hover:bg-dark-700 hover:text-dark-200"
          aria-label="Close schedule popover"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-3 flex gap-2">
        {getQuickSchedulePresets().map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => {
              setDraftDate(preset.date);
              setDraftTime(preset.time);
              setVisibleMonth(combineScheduleDateTime(preset.date, '12:00') || visibleMonth);
            }}
            className="flex-1 rounded-xl border border-dark-600 bg-dark-700/70 px-2 py-2 text-left transition-colors hover:border-dark-500 hover:bg-dark-700"
          >
            <p className="text-xs font-medium text-dark-100">{preset.label}</p>
            <p className="text-[11px] text-dark-400">{preset.description}</p>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-3">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
            className="rounded-lg p-1 text-dark-400 transition-colors hover:bg-dark-700 hover:text-dark-100"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-medium text-dark-100">{getCalendarMonthLabel(visibleMonth)}</p>
          <button
            type="button"
            onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
            className="rounded-lg p-1 text-dark-400 transition-colors hover:bg-dark-700 hover:text-dark-100"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-[0.14em] text-dark-500">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label}>{label.slice(0, 1)}</span>
          ))}
        </div>

        <div className="mt-2 space-y-1">
          {calendarWeeks.map((week, weekIndex) => (
            <div key={`${weekIndex}-${week[0]?.dateKey || weekIndex}`} className="grid grid-cols-7 gap-1">
              {week.map((day) => (
                <button
                  key={day.dateKey}
                  type="button"
                  disabled={day.isDisabled}
                  onClick={() => setDraftDate(day.dateKey)}
                  className={`h-9 rounded-lg text-sm transition-colors ${
                    day.isSelected
                      ? 'bg-dark-100 text-dark-900'
                      : day.isToday
                        ? 'border border-dark-400 text-dark-100'
                        : day.isCurrentMonth
                          ? 'text-dark-200 hover:bg-dark-700'
                          : 'text-dark-500 hover:bg-dark-700/50'
                  } ${day.isDisabled ? 'cursor-not-allowed opacity-30' : ''}`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl border border-dark-700 bg-dark-900/30 px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.16em] text-dark-500">Time</p>
          <p className="text-xs text-dark-400">Use local time for this upload slot.</p>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-dark-600 bg-dark-800 px-3 py-2">
          <Clock className="h-4 w-4 text-dark-400" />
          <input
            type="time"
            value={draftTime}
            onChange={(event) => setDraftTime(event.target.value)}
            className="bg-transparent text-sm text-dark-100 outline-none"
          />
        </label>
      </div>

      {!canSchedule && (
        <p className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Attach a video file before scheduling this YouTube item.
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            onClear?.();
            onClose?.();
          }}
          className="rounded-lg px-3 py-2 text-sm text-dark-400 transition-colors hover:bg-dark-700 hover:text-dark-100"
        >
          Clear
        </button>
        <button
          type="button"
          disabled={!draftDate || !canSchedule}
          onClick={() => {
            onApply?.({ scheduledDate: draftDate, scheduledTime: draftTime });
            onClose?.();
          }}
          className="rounded-lg bg-dark-100 px-3 py-2 text-sm font-medium text-dark-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Apply schedule
        </button>
      </div>
    </div>
  );
}

export default YouTubeSchedulePopover;
