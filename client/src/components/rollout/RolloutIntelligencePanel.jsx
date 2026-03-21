import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { rolloutApi } from '../../lib/api';

/**
 * Readiness Check Panel
 *
 * Displays conviction-based readiness:
 * - Section readiness (conviction gating)
 * - Overall stats (sections ready, total pieces, avg conviction)
 * - Blocked sections list
 */
export default function RolloutIntelligencePanel({ rolloutId, rollout }) {
  const [intelligence, setIntelligence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!rolloutId) return;
    loadIntelligence();
  }, [rolloutId]);

  const loadIntelligence = async () => {
    try {
      setLoading(true);
      const data = await rolloutApi.getIntelligence(rolloutId);
      setIntelligence(data.intelligence);
      setError(null);
    } catch (err) {
      console.error('Failed to load intelligence:', err);
      setError('Failed to load intelligence');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-dark-800 border border-dark-700 p-3">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-dark-100 border-t-transparent rounded-full animate-spin" />
          <span className="text-dark-400 text-sm">Analyzing readiness...</span>
        </div>
      </div>
    );
  }

  if (error || !intelligence) {
    return (
      <div className="bg-dark-800/60 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-xs text-dark-300 uppercase tracking-wider">Readiness</span>
          <span className="text-xs text-dark-500">Unavailable</span>
        </div>
      </div>
    );
  }

  const { overallReadiness, sections } = intelligence;
  const allReady = overallReadiness.ready;

  return (
    <div className="bg-dark-800/60  overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-dark-800 transition-colors"
      >
        <span className="text-xs text-dark-300 uppercase tracking-wider">Readiness</span>

        <div className="flex items-center gap-2">
          {allReady ? (
            <span className="px-2 py-0.5 bg-dark-600/30 text-dark-100 rounded text-xs">
              Ready to Launch
            </span>
          ) : (
            <span className="px-2 py-0.5 bg-dark-600/30 text-dark-300 rounded text-xs">
              {overallReadiness.readySections}/{overallReadiness.totalSections} Ready
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
          {/* Overall Readiness */}
          <div>
            <h4 className="text-xs font-medium text-dark-300 mb-2">
              Overall Readiness
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="Sections Ready"
                value={`${overallReadiness.readySections}/${overallReadiness.totalSections}`}
                color={allReady ? 'green' : 'orange'}
              />
              <StatCard
                label="Total Pieces"
                value={overallReadiness.totalPieces}
                color="neutral"
              />
              <StatCard
                label="Avg Conviction"
                value={overallReadiness.avgConviction}
                color={overallReadiness.avgConviction >= 70 ? 'green' : 'orange'}
              />
            </div>
          </div>

          {/* Section Readiness Details */}
          {sections && sections.some(s => !s.ready) && (
            <div>
              <h4 className="text-xs font-medium text-dark-300 mb-2">
                Sections Blocked
              </h4>
              <div className="space-y-2">
                {sections.filter(s => !s.ready).map((section, idx) => (
                  <div key={idx} className="bg-dark-800/50 rounded p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-white">{section.sectionName}</span>
                      <span className="text-[10px] text-dark-500">
                        {section.stats.belowThreshold} blocked
                      </span>
                    </div>
                    <p className="text-xs text-dark-400 mb-2">{section.message}</p>
                    {section.suggestions.length > 0 && (
                      <ul className="space-y-1">
                        {section.suggestions.slice(0, 2).map((suggestion, sIdx) => (
                          <li key={sIdx} className="text-xs text-dark-300">
                            {suggestion}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color = 'neutral' }) {
  const textColors = {
    green: 'text-white',
    orange: 'text-dark-300',
    neutral: 'text-dark-200',
  };

  return (
    <div className="bg-dark-800/50 rounded p-3">
      <div className="text-[10px] text-dark-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-lg font-light ${textColors[color]}`}>{value}</div>
    </div>
  );
}
