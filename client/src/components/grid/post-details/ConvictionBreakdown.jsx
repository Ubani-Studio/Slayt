import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronDown, ChevronUp, Loader2, AlertTriangle, CheckCircle, XCircle,
  TrendingUp, Shield, Lightbulb, ArrowRight, RefreshCw,
  Bookmark, Share2, UserPlus, Eye, MessageCircle, Star
} from 'lucide-react';
import { convictionApi } from '../../../lib/api';
import ConvictionBadge from '../../conviction/ConvictionBadge';

// --- Pre-publish (prediction) view config ---

const COMPONENT_META = {
  performance: { label: 'Performance Potential', icon: TrendingUp, weight: '60%', color: 'blue', desc: 'Predicted engagement based on content analysis' },
  brand: { label: 'Brand Consistency', icon: Shield, weight: '40%', color: 'emerald', desc: 'Alignment with your brand voice and feed aesthetic' },
};

const BAR_COLORS = {
  blue: { bar: 'bg-blue-500', track: 'bg-blue-500/10' },
  emerald: { bar: 'bg-dark-100', track: 'bg-dark-100/10' },
  purple: { bar: 'bg-purple-500', track: 'bg-purple-500/10' },
  amber: { bar: 'bg-amber-500', track: 'bg-amber-500/10' },
  cyan: { bar: 'bg-cyan-500', track: 'bg-cyan-500/10' },
  rose: { bar: 'bg-rose-500', track: 'bg-rose-500/10' },
};

const TIER_LABELS = {
  exceptional: { label: 'Exceptional', class: 'text-dark-100' },
  high: { label: 'High', class: 'text-dark-100' },
  medium: { label: 'Needs Work', class: 'text-dark-300' },
  low: { label: 'Low', class: 'text-dark-300' },
};

const GATING_ICONS = {
  approved: CheckCircle,
  warning: AlertTriangle,
  blocked: XCircle,
  override: CheckCircle,
};

const GATING_COLORS = {
  approved: 'text-dark-100',
  warning: 'text-dark-300',
  blocked: 'text-dark-300',
  override: 'text-blue-400',
};

// --- ADS signal display config ---

const SIGNAL_META = {
  saveRate:     { label: 'Save Rate', icon: Bookmark, color: 'purple', meaning: 'I want to come back' },
  shareRate:    { label: 'Share Rate', icon: Share2, color: 'blue', meaning: 'Others need to see this' },
  conversion:   { label: 'Follower Conversion', icon: UserPlus, color: 'emerald', meaning: 'I want more from you' },
  watchDepth:   { label: 'Watch Depth', icon: Eye, color: 'cyan', meaning: 'I stayed for this' },
  commentDepth: { label: 'Comment Depth', icon: MessageCircle, color: 'amber', meaning: 'I have something to say' },
  cardCTR:      { label: 'Card Click Rate', icon: ArrowRight, color: 'rose', meaning: 'I followed the thread' },
};

function getCalibrationStatus(adsCount) {
  if (adsCount >= 20) return { label: 'Calibrated', class: 'text-dark-100 bg-dark-600/20', desc: 'Predictions are grounded in real performance data' };
  if (adsCount >= 5) return { label: 'Learning', class: 'text-amber-400 bg-amber-500/10', desc: `${20 - adsCount} more published posts to calibrate` };
  return { label: 'Uncalibrated', class: 'text-dark-500 bg-dark-700/50', desc: `${5 - adsCount} more published posts to start learning` };
}

function getAdsTier(score) {
  if (score >= 80) return { label: 'Deep', class: 'text-dark-100 bg-dark-600/25' };
  if (score >= 60) return { label: 'Engaged', class: 'text-dark-200 bg-dark-100/15' };
  if (score >= 40) return { label: 'Surface', class: 'text-dark-300 bg-dark-600/25' };
  return { label: 'Shallow', class: 'text-dark-300 bg-dark-600/25' };
}

function ScoreBar({ value, color }) {
  const colors = BAR_COLORS[color] || BAR_COLORS.blue;
  return (
    <div className={`h-1.5 rounded-full ${colors.track} overflow-hidden`}>
      <div
        className={`h-full rounded-full ${colors.bar} transition-all duration-500`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function getAccuracyLabel(accuracy) {
  if (accuracy >= 90) return { label: 'Spot on', class: 'bg-dark-600/25 text-dark-100' };
  if (accuracy >= 75) return { label: 'Close', class: 'bg-dark-600/20 text-dark-100' };
  if (accuracy >= 60) return { label: 'Fair', class: 'bg-dark-600/20 text-dark-300' };
  return { label: 'Off', class: 'bg-dark-600/20 text-dark-300' };
}

// --- ADS (post-publish) sub-component ---

function AudienceDepthView({ postId }) {
  const [adsData, setAdsData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchAds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await convictionApi.getAudienceDepth(postId);
      setAdsData(res);
    } catch (err) {
      console.error('[ADS] Fetch error:', err);
      setError('Could not load audience depth');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => { fetchAds(); }, [fetchAds]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await convictionApi.refreshAudienceDepth(postId);
      // Merge fresh data into state
      setAdsData(prev => ({ ...prev, ...res }));
    } catch (err) {
      console.error('[ADS] Refresh error:', err);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading && !adsData) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 text-dark-400 animate-spin" />
        <span className="text-xs text-dark-400 ml-2">Loading metrics...</span>
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-dark-300 py-2">{error}</p>;
  }

  const score = adsData?.audienceDepthScore;
  const breakdown = adsData?.audienceDepthBreakdown;
  const fetchHistory = adsData?.fetchHistory || [];

  // No data yet (just published)
  if (score == null && !breakdown) {
    return (
      <div className="flex items-center gap-2 px-3 py-3 bg-dark-900/50 rounded-lg">
        <Loader2 className="w-3.5 h-3.5 text-dark-500 animate-spin" />
        <p className="text-[11px] text-dark-400">Metrics collecting... check back in 24h</p>
      </div>
    );
  }

  const tier = getAdsTier(score);
  const platforms = breakdown?.platforms || {};

  // Collect all unique signals across platforms
  const allSignals = {};
  for (const [platformName, platformData] of Object.entries(platforms)) {
    if (!platformData?.signals) continue;
    for (const [signalKey, signalData] of Object.entries(platformData.signals)) {
      if (!allSignals[signalKey]) {
        allSignals[signalKey] = { ...signalData, platforms: [] };
      }
      allSignals[signalKey].platforms.push(platformName);
    }
  }

  // For single-platform posts, show that platform's signals directly
  const platformKeys = Object.keys(platforms);

  return (
    <div className="space-y-3">
      {/* ADS Score header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl font-bold text-dark-100 tabular-nums">{score}</span>
          <div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${tier.class}`}>
              {tier.label}
            </span>
            <p className="text-[10px] text-dark-500 mt-0.5">Audience Depth Score</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-1.5 rounded-md hover:bg-dark-700/50 transition-colors text-dark-400 hover:text-dark-200 disabled:opacity-50"
          title="Refresh metrics"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Platform sub-scores (if multi-platform) */}
      {platformKeys.length > 1 && (
        <div className="flex gap-2">
          {platformKeys.map(p => (
            <div key={p} className="flex items-center gap-1.5 px-2 py-1 bg-dark-800 rounded text-[10px]">
              <span className="text-dark-400 capitalize">{p}</span>
              <span className="text-dark-200 font-medium tabular-nums">{platforms[p].score}</span>
            </div>
          ))}
        </div>
      )}

      {/* Signal breakdown bars */}
      {platformKeys.map(platformName => {
        const platformData = platforms[platformName];
        if (!platformData?.signals) return null;
        const signals = platformData.signals;

        return (
          <div key={platformName} className="space-y-2.5">
            {platformKeys.length > 1 && (
              <span className="text-[10px] text-dark-500 uppercase tracking-wide capitalize">{platformName}</span>
            )}
            {Object.entries(signals).map(([signalKey, signalData]) => {
              const meta = SIGNAL_META[signalKey];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <div key={signalKey}>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-3 h-3 text-dark-400" />
                      <span className="text-[11px] text-dark-300">{meta.label}</span>
                    </div>
                    <span className="text-[11px] text-dark-200 font-medium tabular-nums">{signalData.normalized}</span>
                  </div>
                  <ScoreBar value={signalData.normalized} color={meta.color} />
                  <p className="text-[10px] text-dark-600 mt-0.5 italic">{meta.meaning}</p>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Trend sparkline (if multiple fetches) */}
      {fetchHistory.length > 1 && (
        <div className="border-t border-dark-700 pt-2">
          <span className="text-[10px] text-dark-500 uppercase tracking-wide">Trend</span>
          <div className="flex items-end gap-1 mt-1 h-6">
            {fetchHistory.map((entry, i) => {
              const s = entry.audienceDepthScore || 0;
              const height = Math.max(4, (s / 100) * 24);
              const isLatest = i === fetchHistory.length - 1;
              return (
                <div
                  key={i}
                  className={`rounded-sm flex-1 ${isLatest ? 'bg-blue-400' : 'bg-dark-600'}`}
                  style={{ height: `${height}px` }}
                  title={`${s} — ${new Date(entry.fetchedAt).toLocaleDateString()}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Fan Signal placeholder — StanVault teaser */}
      <div className="border-t border-dark-700/50 pt-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-900/30 border border-dashed border-dark-700/50">
          <Star className="w-3 h-3 text-dark-600" />
          <p className="text-[10px] text-dark-600">
            Fan Signals — superfan conversion tracking coming soon
          </p>
        </div>
      </div>
    </div>
  );
}

// --- Main component ---

const ConvictionBreakdown = React.memo(function ConvictionBreakdown({ postId, profileId, contentStatus: propContentStatus }) {
  const [report, setReport] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [contentStatus, setContentStatus] = useState(propContentStatus || null);
  const [wasUserOverride, setWasUserOverride] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [adsPostCount, setAdsPostCount] = useState(0);

  const isPublished = contentStatus === 'published' || propContentStatus === 'published';

  // Fetch ADS post count for calibration status
  useEffect(() => {
    convictionApi.getAudienceDepthStats()
      .then(res => setAdsPostCount(res?.stats?.total || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!postId) return;
    setReport(null);
    setValidationResult(null);
    if (!propContentStatus) setContentStatus(null);
    setWasUserOverride(false);
    setError(null);
  }, [postId, propContentStatus]);

  const fetchReport = async () => {
    if (report || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await convictionApi.getReport(postId, profileId);
      setReport(res.report);
      setValidationResult(res.validationResult || null);
      setContentStatus(res.contentStatus || propContentStatus || null);
      setWasUserOverride(res.wasUserOverride || false);
    } catch (err) {
      console.error('[ConvictionBreakdown] Failed to fetch report:', err);
      setError('Could not load conviction breakdown');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    if (!expanded && !report && !loading && !isPublished) {
      fetchReport();
    }
    setExpanded(!expanded);
  };

  const conviction = report?.conviction;
  const gating = report?.gating;
  const recommendations = report?.recommendations;

  const score = conviction?.score;
  const tier = conviction?.tier;
  const breakdown = conviction?.breakdown;
  const GatingIcon = gating ? GATING_ICONS[gating.status] || AlertTriangle : AlertTriangle;
  const gatingColor = gating ? GATING_COLORS[gating.status] || 'text-dark-400' : 'text-dark-400';
  const tierInfo = tier ? TIER_LABELS[tier] || TIER_LABELS.medium : null;

  // Post-performance validation data (legacy)
  const hasValidation = contentStatus === 'published' && validationResult?.validation?.accuracy != null;
  const predictedScore = validationResult?.predicted?.convictionScore;
  const actualScore = validationResult?.actual?.engagementScore;
  const accuracy = validationResult?.validation?.accuracy;
  const hadSuccessfulOverride = validationResult?.feedback?.signals?.some(
    s => s.type === 'successful_override'
  );

  return (
    <div className="border-t border-dark-700">
      {/* Collapsed header */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-dark-700/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-medium text-dark-300 uppercase tracking-wide">
            {isPublished ? 'Audience Depth' : 'Conviction'}
          </span>
          {!isPublished && score != null && (
            <ConvictionBadge score={score} tier={tier} size="xs" />
          )}
          {!isPublished && tierInfo && (
            <span className={`text-[11px] ${tierInfo.class}`}>{tierInfo.label}</span>
          )}
          {!isPublished && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${getCalibrationStatus(adsPostCount).class}`}>
              {getCalibrationStatus(adsPostCount).label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {loading && <Loader2 className="w-3.5 h-3.5 text-dark-400 animate-spin" />}
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5 text-dark-500" />
            : <ChevronDown className="w-3.5 h-3.5 text-dark-500" />
          }
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {error && (
            <p className="text-xs text-dark-300">{error}</p>
          )}

          {/* POST-PUBLISH: Show real ADS */}
          {isPublished && (
            <AudienceDepthView postId={postId} />
          )}

          {/* PRE-PUBLISH: Show prediction breakdown */}
          {!isPublished && (
            <>
              {loading && !report && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 text-dark-400 animate-spin" />
                  <span className="text-xs text-dark-400 ml-2">Analyzing...</span>
                </div>
              )}

              {breakdown && (
                <>
                  {/* AI estimate disclaimer with calibration */}
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-dark-900/50 border border-dark-700/50">
                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-dark-500" />
                    <p className="text-[10px] text-dark-500 leading-relaxed">
                      {getCalibrationStatus(adsPostCount).desc}
                    </p>
                  </div>

                  {/* Component scores */}
                  <div className="space-y-3">
                    {['performance', 'brand'].map((key) => {
                      const meta = COMPONENT_META[key];
                      const Icon = meta.icon;
                      const val = breakdown[key] ?? 0;
                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <Icon className="w-3 h-3 text-dark-400" />
                              <span className="text-[11px] text-dark-300">{meta.label}</span>
                              <span className="text-[10px] text-dark-500">({meta.weight})</span>
                            </div>
                            <span className="text-[11px] text-dark-200 font-medium tabular-nums">{val}</span>
                          </div>
                          <ScoreBar value={val} color={meta.color} />
                          <p className="text-[10px] text-dark-500 mt-0.5">{meta.desc}</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Gating status */}
                  {gating && (
                    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg ${
                      gating.status === 'approved' ? 'bg-dark-600/10' :
                      gating.status === 'warning' ? 'bg-dark-600/10' :
                      gating.status === 'blocked' ? 'bg-dark-600/10' :
                      'bg-blue-500/5'
                    }`}>
                      <GatingIcon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${gatingColor}`} />
                      <p className="text-[11px] text-dark-300">{gating.reason}</p>
                    </div>
                  )}

                  {/* Post-Performance Results (legacy validation data) */}
                  {hasValidation && (
                    <div className="space-y-2 border-t border-dark-700 pt-3">
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="w-3 h-3 text-dark-400" />
                        <span className="text-[11px] text-dark-400 uppercase tracking-wide">Post-Performance</span>
                      </div>

                      <div className="flex items-center gap-2 px-3 py-2.5 bg-dark-900/50 rounded-lg">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-dark-400">Predicted:</span>
                          <span className="text-[12px] text-dark-200 font-medium tabular-nums">{predictedScore}</span>
                        </div>
                        <ArrowRight className="w-3 h-3 text-dark-600" />
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-dark-400">Actual:</span>
                          <span className="text-[12px] text-dark-200 font-medium tabular-nums">{actualScore}</span>
                        </div>
                        {accuracy != null && (
                          <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getAccuracyLabel(accuracy).class}`}>
                            {accuracy}% {getAccuracyLabel(accuracy).label}
                          </span>
                        )}
                      </div>

                      {hadSuccessfulOverride && (
                        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-dark-600/20">
                          <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-dark-100" />
                          <p className="text-[11px] text-dark-100">
                            You were right — your override paid off
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Recommendations */}
                  {recommendations && recommendations.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Lightbulb className="w-3 h-3 text-dark-400" />
                        <span className="text-[11px] text-dark-400 uppercase tracking-wide">Suggestions</span>
                      </div>
                      {recommendations.map((rec, i) => (
                        <div key={i} className="pl-4">
                          <p className="text-[11px] text-dark-300 font-medium">{rec.message}</p>
                          {rec.actions && rec.actions.length > 0 && (
                            <ul className="mt-1 space-y-0.5">
                              {rec.actions.map((action, j) => (
                                <li key={j} className="text-[10px] text-dark-500 flex items-start gap-1.5">
                                  <span className="text-dark-600 mt-0.5">-</span>
                                  <span>{action}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default ConvictionBreakdown;
