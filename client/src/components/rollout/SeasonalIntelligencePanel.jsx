import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Sun, AlertTriangle, Clock, TrendingUp } from 'lucide-react';
import { rolloutApi } from '../../lib/api';

/**
 * Seasonal Intelligence Panel
 *
 * Displays timing intelligence for releases:
 * - Active windows (green — release now for boost)
 * - Upcoming windows (neutral — release soon)
 * - Avoid zones (amber/red — low engagement periods)
 */
export default function SeasonalIntelligencePanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadWindows();
  }, []);

  const loadWindows = async () => {
    try {
      setLoading(true);
      const result = await rolloutApi.getSeasonalWindows();
      setData(result);
      setError(null);
    } catch (err) {
      console.error('Failed to load seasonal windows:', err);
      setError('Failed to load timing data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-dark-800 border border-dark-700 p-3">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-dark-100 border-t-transparent rounded-full animate-spin" />
          <span className="text-dark-400 text-sm">Loading timing intelligence...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-dark-800/60 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-xs text-dark-300 uppercase tracking-wider">Timing Intelligence</span>
          <span className="text-xs text-dark-500">Unavailable</span>
        </div>
      </div>
    );
  }

  const { current } = data;
  const activeCount = (current?.active?.length || 0);
  const avoidCount = (current?.avoid?.length || 0);

  return (
    <div className="bg-dark-800/60  overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-dark-800 transition-colors"
      >
        <span className="text-xs text-dark-300 uppercase tracking-wider">Timing Intelligence</span>

        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <span className="px-2 py-0.5 bg-dark-600/30 text-dark-100 rounded text-xs">
              {activeCount} active
            </span>
          )}
          {avoidCount > 0 && (
            <span className="px-2 py-0.5 bg-dark-600/30 text-dark-400 rounded text-xs">
              {avoidCount} avoid
            </span>
          )}

          {expanded ? (
            <ChevronUp className="w-4 h-4 text-dark-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-dark-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 py-3 space-y-3 border-t border-dark-800">
          {/* Active Windows */}
          {current?.active?.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-dark-300 mb-2 flex items-center gap-1.5">
                <Sun className="w-3 h-3" />
                Active Now
              </h4>
              <div className="space-y-1.5">
                {current.active.map((window, i) => (
                  <WindowCard key={i} window={window} variant="active" />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Windows */}
          {current?.upcoming?.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-dark-300 mb-2 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Upcoming
              </h4>
              <div className="space-y-1.5">
                {current.upcoming.map((window, i) => (
                  <WindowCard key={i} window={window} variant="upcoming" />
                ))}
              </div>
            </div>
          )}

          {/* Avoid Zones */}
          {current?.avoid?.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-dark-300 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" />
                Avoid Zones
              </h4>
              <div className="space-y-1.5">
                {current.avoid.map((window, i) => (
                  <WindowCard key={i} window={window} variant="avoid" />
                ))}
              </div>
            </div>
          )}

          {/* Optimal Release Dates */}
          {data.optimalWindows?.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-dark-300 mb-2 flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3" />
                Best Release Dates (Next 90 Days)
              </h4>
              <div className="space-y-1">
                {data.optimalWindows.filter(w => w.recommended).slice(0, 5).map((window, i) => (
                  <div key={i} className="flex items-center justify-between bg-dark-800/50 rounded px-2.5 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-dark-200">{window.date}</span>
                      <span className="text-[10px] text-dark-500">{window.dayOfWeek}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {window.activeWindows.length > 0 && (
                        <span className="text-[9px] text-dark-500 truncate max-w-[120px]">
                          {window.activeWindows[0]}
                        </span>
                      )}
                      <span className={`text-[10px] font-medium ${
                        window.score >= 1.2 ? 'text-white' : 'text-dark-300'
                      }`}>
                        {window.score}x
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!current?.active?.length && !current?.upcoming?.length && !current?.avoid?.length && (
            <p className="text-xs text-dark-500 text-center py-2">No notable timing windows right now</p>
          )}
        </div>
      )}
    </div>
  );
}

function WindowCard({ window, variant }) {
  const styles = {
    active: 'bg-dark-700/40 border-l-2 border-dark-300',
    upcoming: 'bg-dark-800/50',
    avoid: 'bg-dark-800/50 border-l-2 border-dark-600',
  };

  return (
    <div className={`rounded px-3 py-2 ${styles[variant]}`}>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs text-dark-200">{window.label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            window.category === 'music' ? 'bg-dark-700/60 text-dark-400'
              : window.category === 'content' ? 'bg-dark-700/60 text-dark-400'
              : 'bg-dark-700/60 text-dark-500'
          }`}>
            {window.category}
          </span>
          <span className={`text-[10px] font-medium ${
            window.boost >= 1.2 ? 'text-white'
              : window.boost >= 1 ? 'text-dark-300'
              : 'text-dark-500'
          }`}>
            {window.boost}x
          </span>
        </div>
      </div>
      <p className="text-[10px] text-dark-500 leading-relaxed">{window.description}</p>
      {window.daysUntil && (
        <span className="text-[9px] text-dark-600 mt-0.5 block">in {window.daysUntil} day(s)</span>
      )}
    </div>
  );
}
