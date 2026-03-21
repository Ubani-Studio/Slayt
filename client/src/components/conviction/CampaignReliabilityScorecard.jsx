import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import { ShieldCheck, AlertTriangle, FileCheck2 } from 'lucide-react';

/**
 * CampaignReliabilityScorecard
 * Focuses on decision-quality and governance signals (not vanity metrics).
 */
const CampaignReliabilityScorecard = ({ gridItems = [] }) => {
  const metrics = useMemo(() => {
    const totalAssets = gridItems.length;
    const scoredAssets = gridItems.filter(
      (item) => item?.conviction?.score !== null && item?.conviction?.score !== undefined
    );

    if (totalAssets === 0 || scoredAssets.length === 0) {
      return {
        reliabilityScore: 0,
        decisionReadyRate: 0,
        atRiskCount: 0,
        canonCoverage: 0,
        gateReady: false,
      };
    }

    const avgScore = Math.round(
      scoredAssets.reduce((sum, item) => sum + item.conviction.score, 0) / scoredAssets.length
    );
    const decisionReadyCount = scoredAssets.filter((item) => item.conviction.score >= 70).length;
    const atRiskCount = scoredAssets.filter((item) => item.conviction.score < 50).length;
    const canonTaggedCount = scoredAssets.filter(
      (item) => item?.conviction?.archetypeMatch?.designation
    ).length;

    const decisionReadyRate = Math.round((decisionReadyCount / scoredAssets.length) * 100);
    const canonCoverage = Math.round((canonTaggedCount / scoredAssets.length) * 100);
    const reliabilityScore = Math.round(
      avgScore * 0.45 + decisionReadyRate * 0.35 + canonCoverage * 0.2
    );

    return {
      reliabilityScore,
      decisionReadyRate,
      atRiskCount,
      canonCoverage,
      gateReady: atRiskCount === 0,
    };
  }, [gridItems]);

  return (
    <div className="w-full border border-dark-700 bg-dark-900/60 p-2">
      <div className="flex items-center justify-between mb-2">
        <span className="micro-label text-dark-400">Campaign Reliability</span>
        <span className="text-sm text-dark-100 tabular-nums">{metrics.reliabilityScore}</span>
      </div>

      <div className="space-y-1.5">
        <div className="h-7 px-2 border border-dark-700 bg-dark-800/70 flex items-center justify-between text-xs">
          <span className="text-dark-300">Decision-ready</span>
          <span className="text-dark-100 tabular-nums">{metrics.decisionReadyRate}%</span>
        </div>
        <div className="h-7 px-2 border border-dark-700 bg-dark-800/70 flex items-center justify-between text-xs">
          <span className="text-dark-300">Canon coverage</span>
          <span className="text-dark-100 tabular-nums">{metrics.canonCoverage}%</span>
        </div>
        <div className="h-7 px-2 border border-dark-700 bg-dark-800/70 flex items-center justify-between text-xs">
          <span className="text-dark-300">At-risk assets</span>
          <span className="text-dark-100 tabular-nums">
            {metrics.atRiskCount}
          </span>
        </div>
      </div>

      <div
        className={`mt-2 h-8 px-2 border text-xs flex items-center gap-1.5 ${
          metrics.gateReady
            ? 'border-dark-300/30 bg-dark-300/10 text-dark-200'
            : 'border-dark-600 bg-dark-800 text-dark-300'
        }`}
      >
        {metrics.gateReady ? (
          <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        )}
        <span className="truncate">
          {metrics.gateReady ? 'Approval gate ready' : 'Approval gate blocked'}
        </span>
        <FileCheck2 className="w-3.5 h-3.5 ml-auto opacity-70" />
      </div>
    </div>
  );
};

export default CampaignReliabilityScorecard;

CampaignReliabilityScorecard.propTypes = {
  gridItems: PropTypes.array,
};
