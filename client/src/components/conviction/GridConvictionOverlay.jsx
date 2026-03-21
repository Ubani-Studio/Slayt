import React from 'react';
import ConvictionBadge from './ConvictionBadge';

/**
 * GridConvictionOverlay - Overlay for grid items showing conviction score
 *
 * @param {number} score - Conviction score (0-100)
 * @param {string} tier - Conviction tier
 * @param {string} size - Badge size
 */
const GridConvictionOverlay = ({
  score,
  tier,
  size = 'sm'
}) => {
  // Tier-based glow effect
  const getGlowClass = () => {
    if (!score && score !== 0) return '';

    if (score >= 80) {
      return 'shadow-lg shadow-dark-300/30';
    } else if (score >= 60) {
      return 'shadow-md shadow-dark-400/30';
    } else if (score >= 40) {
      return 'shadow-md shadow-dark-400/40';
    } else {
      return 'shadow-md shadow-dark-600/40';
    }
  };

  return (
    <div className="absolute top-2 right-2 z-10">
      <div className={`backdrop-blur-md p-1 ${getGlowClass()}`}>
        <ConvictionBadge
          score={score}
          tier={tier}
          size={size}
        />
      </div>
    </div>
  );
};

export default GridConvictionOverlay;
