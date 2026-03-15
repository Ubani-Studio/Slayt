import { useEffect, useState } from 'react';
import { Calendar, Clock, Package, Repeat, X } from 'lucide-react';
import { hasPlannerVideoAttachment } from '../../lib/videoUtils';
import {
  buildCollectionScheduleEntries,
  formatScheduleDateOnly,
  toDateInputValue,
} from '../../lib/youtubeSchedule';

const CADENCE_OPTIONS = [
  {
    value: 'daily',
    label: 'Daily',
    description: 'One release every day at the same time.',
  },
  {
    value: 'weekdays',
    label: 'Weekdays',
    description: 'Skip weekends and publish Monday to Friday.',
  },
  {
    value: 'weekly',
    label: 'Weekly',
    description: 'Release one video each week.',
  },
  {
    value: 'same_day',
    label: 'Same day',
    description: 'Give every selected video the same timestamp.',
  },
  {
    value: 'interval',
    label: 'Every X days',
    description: 'Choose your own gap between uploads.',
  },
];

const SCOPE_OPTIONS = [
  {
    value: 'all',
    label: 'All with video',
    description: 'Apply in collection order to every video with an upload attached.',
  },
  {
    value: 'unscheduled',
    label: 'Unscheduled only',
    description: 'Keep anything already scheduled as-is and fill the rest.',
  },
  {
    value: 'from_selected',
    label: 'From selected',
    description: 'Start at the currently open card and continue from there.',
  },
];

function YouTubeCollectionScheduleModal({
  isOpen,
  collectionName,
  videos,
  selectedVideoId,
  onClose,
  onApply,
  applying = false,
}) {
  const [cadence, setCadence] = useState('daily');
  const [scope, setScope] = useState('all');
  const [startDate, setStartDate] = useState(() => toDateInputValue(new Date()));
  const [time, setTime] = useState('09:00');
  const [intervalDays, setIntervalDays] = useState(3);

  useEffect(() => {
    if (!isOpen) return;

    setCadence('daily');
    setScope(selectedVideoId ? 'from_selected' : 'all');
    setStartDate(toDateInputValue(new Date()));
    setTime('09:00');
    setIntervalDays(3);
  }, [isOpen, selectedVideoId]);

  if (!isOpen) {
    return null;
  }

  const selectedVideoIndex = videos.findIndex((video) => (video.id || video._id) === selectedVideoId);
  const sourceVideos = videos.filter((video) => video.status !== 'published' && hasPlannerVideoAttachment(video));
  const scopedVideos = sourceVideos.filter((video) => {
    if (scope === 'unscheduled') {
      return video.status !== 'scheduled';
    }
    if (scope === 'from_selected' && selectedVideoIndex >= 0) {
      const currentIndex = videos.findIndex((item) => (item.id || item._id) === (video.id || video._id));
      return currentIndex >= selectedVideoIndex;
    }
    return true;
  });

  const previewEntries = buildCollectionScheduleEntries(scopedVideos, {
    startDate,
    time,
    cadence,
    intervalDays,
  });
  const skippedCount = videos.length - scopedVideos.length;
  const selectedScope = SCOPE_OPTIONS.find((option) => option.value === scope) || SCOPE_OPTIONS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-dark-600 bg-dark-800 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-dark-700 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-dark-500">Collection schedule</p>
            <h2 className="mt-1 text-xl font-semibold text-dark-100">{collectionName || 'Current collection'}</h2>
            <p className="mt-1 text-sm text-dark-400">
              Apply a repeat schedule in collection order. Preview updates as you change the cadence.
            </p>
            <p className="mt-2 text-xs text-dark-500">
              Queue order follows the planner sequence: left to right, top to bottom.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-dark-400 transition-colors hover:bg-dark-700 hover:text-dark-100"
            aria-label="Close collection schedule"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid flex-1 gap-6 overflow-hidden px-6 py-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-5 overflow-y-auto pr-1">
            <div className="rounded-2xl border border-dark-700 bg-dark-900/30 p-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-dark-300" />
                <p className="text-sm font-medium text-dark-100">Start point</p>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.16em] text-dark-500">Date</span>
                  <input
                    type="date"
                    value={startDate}
                    min={toDateInputValue(new Date())}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="input w-full"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.16em] text-dark-500">Time</span>
                  <div className="flex items-center gap-2 rounded-xl border border-dark-600 bg-dark-800 px-3 py-2">
                    <Clock className="h-4 w-4 text-dark-400" />
                    <input
                      type="time"
                      value={time}
                      onChange={(event) => setTime(event.target.value)}
                      className="w-full bg-transparent text-sm text-dark-100 outline-none"
                    />
                  </div>
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-dark-700 bg-dark-900/30 p-4">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-dark-300" />
                <p className="text-sm font-medium text-dark-100">Scope</p>
              </div>
              <div className="mt-3 space-y-2">
                {SCOPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setScope(option.value)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                      scope === option.value
                        ? 'border-dark-300 bg-dark-700 text-dark-100'
                        : 'border-dark-700 bg-dark-800/60 text-dark-300 hover:border-dark-500 hover:bg-dark-700/70'
                    }`}
                  >
                    <p className="text-sm font-medium">{option.label}</p>
                    <p className="mt-1 text-xs text-dark-400">{option.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-dark-700 bg-dark-900/30 p-4">
              <div className="flex items-center gap-2">
                <Repeat className="h-4 w-4 text-dark-300" />
                <p className="text-sm font-medium text-dark-100">Cadence</p>
              </div>
              <div className="mt-3 space-y-2">
                {CADENCE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setCadence(option.value)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                      cadence === option.value
                        ? 'border-dark-300 bg-dark-700 text-dark-100'
                        : 'border-dark-700 bg-dark-800/60 text-dark-300 hover:border-dark-500 hover:bg-dark-700/70'
                    }`}
                  >
                    <p className="text-sm font-medium">{option.label}</p>
                    <p className="mt-1 text-xs text-dark-400">{option.description}</p>
                  </button>
                ))}
              </div>

              {cadence === 'interval' && (
                <label className="mt-3 block space-y-1">
                  <span className="text-xs uppercase tracking-[0.16em] text-dark-500">Gap size</span>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={intervalDays}
                    onChange={(event) => setIntervalDays(event.target.value)}
                    className="input w-full"
                  />
                </label>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-dark-700 bg-dark-900/30">
            <div className="border-b border-dark-700 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-dark-300">
                <span>{previewEntries.length} videos ready to schedule</span>
                <span className="text-dark-600">•</span>
                <span>{selectedScope.label}</span>
                {skippedCount > 0 && (
                  <>
                    <span className="text-dark-600">•</span>
                    <span>{skippedCount} skipped</span>
                  </>
                )}
              </div>
              <p className="mt-1 text-sm text-dark-400">
                Thumbnail-only drafts and published videos stay untouched.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {previewEntries.length === 0 ? (
                <div className="flex h-full min-h-[14rem] items-center justify-center rounded-2xl border border-dashed border-dark-600 bg-dark-800/50 px-6 text-center">
                  <div>
                    <p className="text-sm font-medium text-dark-100">Nothing to schedule yet</p>
                    <p className="mt-1 text-sm text-dark-400">
                      Upload videos first, or adjust the scope if the current filter is too narrow.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {previewEntries.map((entry, index) => (
                    <div
                      key={entry.videoId}
                      className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 rounded-2xl border border-dark-700 bg-dark-800/70 p-3"
                    >
                      <div className="aspect-video overflow-hidden rounded-xl bg-dark-700">
                        {entry.video.thumbnail ? (
                          <img
                            src={entry.video.thumbnail}
                            alt={entry.video.title || 'Video thumbnail'}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-dark-500">
                            No thumb
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-medium text-dark-100">
                            {index + 1}. {entry.video.artistName ? `${entry.video.artistName} - ${entry.video.title}` : entry.video.title || 'Untitled video'}
                          </p>
                          <span className="rounded-full bg-dark-700 px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-dark-400">
                            {formatScheduleDateOnly(entry.scheduledAt)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-dark-300">{entry.summary}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-dark-700 px-6 py-4">
          <p className="text-sm text-dark-400">
            This updates the selected collection in its current order.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm text-dark-300 transition-colors hover:bg-dark-700 hover:text-dark-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={previewEntries.length === 0 || applying}
              onClick={() => onApply?.({
                entries: previewEntries.map((entry) => ({
                  videoId: entry.videoId,
                  scheduledDate: entry.scheduledDate,
                })),
              })}
              className="rounded-xl bg-dark-100 px-4 py-2 text-sm font-medium text-dark-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {applying ? 'Scheduling...' : `Schedule ${previewEntries.length} videos`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default YouTubeCollectionScheduleModal;
