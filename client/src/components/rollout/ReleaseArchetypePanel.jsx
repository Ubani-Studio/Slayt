import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Zap, Target, Layers, Building2, Crown, Waves, AlertCircle } from 'lucide-react';
import { rolloutApi } from '../../lib/api';

const ARCHETYPE_ICONS = {
  velocity_dropper: Zap,
  deep_campaigner: Layers,
  precision_striker: Target,
  steady_builder: Building2,
  event_architect: Crown,
  adaptive_surfer: Waves,
};

/**
 * Release Archetype Panel
 *
 * Displays the user's classified release archetype from Twin OS + Subtaste signals.
 * Shows: archetype card, signal breakdown, strengths/risks, pacing config, runner-up.
 */
export default function ReleaseArchetypePanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadArchetype();
  }, []);

  const loadArchetype = async () => {
    try {
      setLoading(true);
      const result = await rolloutApi.getReleaseArchetype();
      setData(result);
      setError(null);
    } catch (err) {
      console.error('Failed to load release archetype:', err);
      setError('Failed to load archetype');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-dark-800 border border-dark-700 p-3">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-dark-100 border-t-transparent rounded-full animate-spin" />
          <span className="text-dark-400 text-sm">Classifying release archetype...</span>
        </div>
      </div>
    );
  }

  if (error || !data?.archetype) {
    return (
      <div className="bg-dark-800/60 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-xs text-dark-300 uppercase tracking-wider">Release Archetype</span>
          <span className="text-xs text-dark-500">Unavailable</span>
        </div>
      </div>
    );
  }

  const { archetype, confidence, runnerUp, signals } = data;
  const Icon = ARCHETYPE_ICONS[data.archetypeId] || Zap;

  return (
    <div className="bg-dark-800/60  overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-dark-800 transition-colors"
      >
        <span className="text-xs text-dark-300 uppercase tracking-wider">Release Archetype</span>

        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 bg-dark-600/30 text-dark-100 rounded text-xs flex items-center gap-1.5">
            <Icon className="w-3 h-3" />
            {archetype.label}
          </span>

          {expanded ? (
            <ChevronUp className="w-4 h-4 text-dark-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-dark-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 py-3 space-y-3 border-t border-dark-800">
          {/* Archetype Card */}
          <div className="bg-dark-800/50 rounded p-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8  bg-dark-700/80 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-dark-200" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-medium text-white">{archetype.label}</h4>
                  <span className="text-[10px] text-dark-500">
                    {Math.round(confidence * 100)}% confidence
                  </span>
                </div>
                <p className="text-xs text-dark-400 leading-relaxed">{archetype.description}</p>
                <p className="text-[10px] text-dark-500 mt-1.5">
                  Think: {archetype.examples.join(', ')}
                </p>
              </div>
            </div>
          </div>

          {/* Signal Breakdown */}
          <div>
            <h4 className="text-xs font-medium text-dark-300 mb-2">Signals</h4>
            <div className="grid grid-cols-4 gap-2">
              <SignalCard label="Energy" value={signals.energy} />
              <SignalCard label="Warmth" value={signals.warmth} />
              <SignalCard label="Coherence" value={signals.coherence} />
              <SignalCard label="Velocity" value={signals.velocity} suffix={`${signals.postsPerMonth}/mo`} />
            </div>
            {signals.subtasteConnected && (
              <div className="mt-2 flex items-center gap-1.5">
                <span className="text-[10px] text-dark-500">Subtaste:</span>
                <span className="text-[10px] text-dark-300">{signals.subtasteGlyph || signals.subtasteDesignation}</span>
              </div>
            )}
            {!signals.twinOsConnected && (
              <div className="mt-2 flex items-center gap-1.5 text-dark-500">
                <AlertCircle className="w-3 h-3" />
                <span className="text-[10px]">Connect Starforge for more accurate classification</span>
              </div>
            )}
          </div>

          {/* Pacing Config */}
          <div>
            <h4 className="text-xs font-medium text-dark-300 mb-2">Recommended Pacing</h4>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-dark-800/50 rounded p-2">
                <div className="text-[10px] text-dark-500 uppercase tracking-wider mb-0.5">Cadence</div>
                <div className="text-sm font-light text-dark-200">{archetype.pacing.optimalCadenceDays}d</div>
                <div className="text-[9px] text-dark-600">{archetype.pacing.minCadenceDays}-{archetype.pacing.maxCadenceDays}d range</div>
              </div>
              <div className="bg-dark-800/50 rounded p-2">
                <div className="text-[10px] text-dark-500 uppercase tracking-wider mb-0.5">Phases</div>
                <div className="text-sm font-light text-dark-200">{archetype.phases.optimal}</div>
                <div className="text-[9px] text-dark-600">{archetype.phases.min}-{archetype.phases.max} range</div>
              </div>
              <div className="bg-dark-800/50 rounded p-2">
                <div className="text-[10px] text-dark-500 uppercase tracking-wider mb-0.5">Threshold</div>
                <div className="text-sm font-light text-dark-200">{archetype.convictionThreshold}</div>
                <div className="text-[9px] text-dark-600">conviction min</div>
              </div>
            </div>
          </div>

          {/* Strengths & Risks */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <h4 className="text-xs font-medium text-dark-300 mb-1.5">Strengths</h4>
              <ul className="space-y-1">
                {archetype.strengths.map((s, i) => (
                  <li key={i} className="text-[11px] text-dark-400 leading-snug">+ {s}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-medium text-dark-300 mb-1.5">Risks</h4>
              <ul className="space-y-1">
                {archetype.risks.map((r, i) => (
                  <li key={i} className="text-[11px] text-dark-500 leading-snug">- {r}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Runner-up */}
          {runnerUp && (
            <div className="text-[10px] text-dark-600 pt-1 border-t border-dark-800">
              Runner-up: {runnerUp.archetype.label} ({Math.round(runnerUp.score * 100)}%)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SignalCard({ label, value, suffix }) {
  const displayValue = typeof value === 'number' ? Math.round(value * 100) : '—';
  return (
    <div className="bg-dark-800/50 rounded p-2 text-center">
      <div className="text-[10px] text-dark-500 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-sm font-light text-dark-200">
        {suffix || `${displayValue}%`}
      </div>
    </div>
  );
}
