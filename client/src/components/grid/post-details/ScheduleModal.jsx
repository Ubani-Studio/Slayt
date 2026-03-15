import { useState } from 'react';
import { X, Loader2, Calendar } from 'lucide-react';
import { postingApi } from '../../../lib/api';

function ScheduleModal({ postId, caption, hashtags, profileId, defaultPlatform = 'instagram', onClose }) {
  const [scheduleDate, setScheduleDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [scheduleTime, setScheduleTime] = useState('12:00');
  const [selectedPlatforms, setSelectedPlatforms] = useState([defaultPlatform]);
  const [scheduling, setScheduling] = useState(false);

  const togglePlatform = (platform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  };

  const handleSchedulePost = async () => {
    if (!scheduleDate || !scheduleTime) return;
    setScheduling(true);
    try {
      const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`);
      await postingApi.schedulePost(postId, selectedPlatforms, scheduledAt.toISOString(), {
        caption,
        hashtags: `${hashtags || ''}`.split(/[\s,#]+/).filter(t => t),
        profileId,
      });
      onClose();
      alert('Post scheduled successfully!');
    } catch (error) {
      console.error('Failed to schedule post:', error);
      alert('Failed to schedule post. Please try again.');
    } finally {
      setScheduling(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-dark-800 rounded-2xl border border-dark-700 w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-dark-700">
          <h3 className="text-lg font-semibold text-dark-100">Schedule Post</h3>
          <button onClick={onClose} className="btn-icon">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-200 mb-2">Date</label>
              <input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="input w-full"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-200 mb-2">Time</label>
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="input w-full"
              />
            </div>
          </div>

          {/* Platforms */}
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-2">Platforms</label>
            <div className="flex flex-wrap gap-2">
              {['instagram', 'tiktok', 'youtube'].map((platform) => (
                <button
                  key={platform}
                  onClick={() => togglePlatform(platform)}
                  className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                    selectedPlatforms.includes(platform)
                      ? 'bg-dark-100 text-white'
                      : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                  }`}
                >
                  {platform}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-dark-700 flex gap-2">
          <button onClick={onClose} className="flex-1 btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSchedulePost}
            disabled={!scheduleDate || !scheduleTime || scheduling}
            className="flex-1 btn-primary disabled:opacity-50"
          >
            {scheduling ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Scheduling...
              </>
            ) : (
              <>
                <Calendar className="w-4 h-4" />
                Schedule
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ScheduleModal;
