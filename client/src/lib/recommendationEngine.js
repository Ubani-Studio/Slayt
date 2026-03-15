/**
 * Recommendation Engine - AI-powered suggestions for conviction optimization
 */

/**
 * Generate calendar recommendations based on scheduled posts
 * @param {Array} scheduledPosts - Array of scheduled posts with conviction data
 * @returns {Array} Array of recommendation objects
 */
export function generateCalendarRecommendations(scheduledPosts) {
  const recommendations = [];

  if (!scheduledPosts || scheduledPosts.length === 0) {
    return recommendations;
  }

  // Filter posts with conviction data
  const postsWithConviction = scheduledPosts.filter(p => p.conviction?.score !== null && p.conviction?.score !== undefined);

  if (postsWithConviction.length === 0) {
    return recommendations;
  }

  // 1. Find low-conviction posts (<50)
  const lowConvictionPosts = postsWithConviction.filter(p => p.conviction.score < 50);

  lowConvictionPosts.forEach(post => {
    const improvement = analyzeConvictionBreakdown(post.conviction);

    recommendations.push({
      type: 'content-quality',
      priority: 'high',
      icon: 'alert-triangle',
      title: 'Low-conviction content detected',
      description: `"${(post.caption || 'Untitled').slice(0, 30)}..." scores ${Math.round(post.conviction.score)}/100`,
      suggestion: improvement.suggestion,
      action: {
        type: 'edit',
        postId: post.id || post._id,
        contentId: post.contentId
      }
    });
  });

  // 2. Identify optimal posting patterns
  const dayPerformance = analyzeDayPerformance(postsWithConviction);
  const bestDay = Object.entries(dayPerformance).sort((a, b) => b[1].avgScore - a[1].avgScore)[0];
  const worstDay = Object.entries(dayPerformance).sort((a, b) => a[1].avgScore - b[1].avgScore)[0];

  if (bestDay && worstDay && bestDay[1].avgScore - worstDay[1].avgScore > 15) {
    recommendations.push({
      type: 'timing',
      priority: 'medium',
      icon: 'calendar',
      title: 'Posting pattern insight',
      description: `Your ${bestDay[0]} posts score ${Math.round(bestDay[1].avgScore - worstDay[1].avgScore)} points higher than ${worstDay[0]}`,
      suggestion: `Consider moving low-conviction posts to ${bestDay[0]} for better performance`,
      action: null
    });
  }

  // 3. Detect conviction decline over time
  const trend = analyzeConvictionTrend(postsWithConviction);

  if (trend.direction === 'declining' && trend.change < -10) {
    recommendations.push({
      type: 'trend',
      priority: 'high',
      icon: 'trending-down',
      title: 'Conviction score declining',
      description: `Average conviction dropped ${Math.abs(trend.change)} points over the past week`,
      suggestion: 'Review recent content strategy - brand alignment may have shifted',
      action: null
    });
  }

  // 4. Find scheduling gaps on high-conviction days
  const gaps = findSchedulingGaps(scheduledPosts, dayPerformance);

  gaps.forEach(gap => {
    recommendations.push({
      type: 'opportunity',
      priority: 'low',
      icon: 'sparkles',
      title: `${gap.day} has scheduling capacity`,
      description: `High-conviction day with only ${gap.count} posts scheduled`,
      suggestion: `Add 1-2 more posts to maximize ${gap.day}'s performance potential`,
      action: {
        type: 'schedule',
        suggestedDay: gap.dayIndex
      }
    });
  });

  return recommendations;
}

/**
 * Generate grid recommendations for improving aesthetic score
 * @param {Array} gridItems - Grid items with conviction data
 * @param {number} currentScore - Current aesthetic score
 * @returns {Array} Array of recommendation objects
 */
export function generateGridRecommendations(gridItems, currentScore) {
  const recommendations = [];

  if (!gridItems || gridItems.length === 0) return recommendations;

  const itemsWithConviction = gridItems.filter(item => item.conviction);

  if (itemsWithConviction.length < 3) return recommendations;

  // 1. Identify weak spots in grid
  const weakSpots = itemsWithConviction
    .map((item, index) => ({ item, index, score: item.conviction.score }))
    .filter(spot => spot.score < 60)
    .sort((a, b) => a.score - b.score);

  if (weakSpots.length > 0) {
    const weakest = weakSpots[0];
    recommendations.push({
      type: 'grid-quality',
      priority: 'high',
      icon: 'alert-circle',
      title: 'Low-scoring grid item detected',
      description: `Position ${weakest.index + 1} scores only ${Math.round(weakest.score)}/100`,
      suggestion: 'Replace with higher-conviction content to boost grid score',
      action: {
        type: 'replace',
        position: weakest.index,
        contentId: weakest.item._id || weakest.item.id
      }
    });
  }

  // 2. Score potential analysis
  const potential = calculateGridPotential(itemsWithConviction);

  if (potential.maxScore - currentScore > 10) {
    recommendations.push({
      type: 'grid-potential',
      priority: 'low',
      icon: 'trending-up',
      title: `Grid can reach ${potential.maxScore}/100`,
      description: `+${potential.maxScore - currentScore} points achievable with optimal arrangement`,
      suggestion: 'Use What-If mode to experiment with different row orders',
      action: {
        type: 'what-if',
        optimalArrangement: potential.optimalArrangement
      }
    });
  }

  return recommendations;
}

// Helper functions

function analyzeConvictionBreakdown(conviction) {
  const breakdown = conviction.breakdown || {};
  const scores = {
    performance: breakdown.performance || 0,
    brand: breakdown.brand || 0
  };

  const lowest = Object.entries(scores).sort((a, b) => a[1] - b[1])[0];

  const suggestions = {
    performance: 'Add trending hashtags or optimize caption for engagement',
    brand: 'Brand voice inconsistent - review tone and messaging'
  };

  return {
    weakest: lowest[0],
    score: lowest[1],
    suggestion: suggestions[lowest[0]]
  };
}

function analyzeDayPerformance(posts) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const performance = {};

  posts.forEach(post => {
    if (!post.scheduledAt) return;

    const date = new Date(post.scheduledAt);
    const day = days[date.getDay()];

    if (!performance[day]) {
      performance[day] = { scores: [], count: 0, avgScore: 0 };
    }

    performance[day].scores.push(post.conviction.score);
    performance[day].count++;
  });

  // Calculate averages
  Object.keys(performance).forEach(day => {
    const scores = performance[day].scores;
    performance[day].avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  });

  return performance;
}

function analyzeConvictionTrend(posts) {
  const sorted = [...posts].sort((a, b) =>
    new Date(a.scheduledAt) - new Date(b.scheduledAt)
  );

  if (sorted.length < 4) return { direction: 'neutral', change: 0 };

  const midpoint = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, midpoint);
  const secondHalf = sorted.slice(midpoint);

  const firstAvg = firstHalf.reduce((sum, p) => sum + p.conviction.score, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, p) => sum + p.conviction.score, 0) / secondHalf.length;

  const change = Math.round(secondAvg - firstAvg);

  return {
    direction: change < -5 ? 'declining' : change > 5 ? 'improving' : 'stable',
    change
  };
}

function findSchedulingGaps(posts, dayPerformance) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const gaps = [];

  const performanceEntries = Object.entries(dayPerformance)
    .filter(([, data]) => data.avgScore > 70)
    .sort((a, b) => b[1].avgScore - a[1].avgScore);

  performanceEntries.forEach(([day, data]) => {
    if (data.count < 3) {
      gaps.push({
        day,
        dayIndex: days.indexOf(day),
        count: data.count,
        avgScore: data.avgScore
      });
    }
  });

  return gaps.slice(0, 2);
}

function calculateGridPotential(items) {
  const sortedByScore = [...items].sort((a, b) => b.conviction.score - a.conviction.score);

  const avgConviction = sortedByScore.reduce((sum, item) => sum + item.conviction.score, 0) / items.length;
  const maxPossibleScore = Math.round(avgConviction * 0.5 + 100 * 0.3 + 100 * 0.2);

  return {
    maxScore: Math.min(100, maxPossibleScore),
    optimalArrangement: sortedByScore.map(item => item.id || item._id)
  };
}
