import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Clock,
  Instagram,
  MoreHorizontal,
  Loader2,
  RefreshCw,
  X,
  Image,
  Flag,
  Target,
  Folder,
  Layers,
  Youtube,
  Film,
  BarChart3,
  TrendingUp,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { postingApi, collectionApi, contentApi, rolloutApi, gridApi, reelCollectionApi, convictionApi } from '../lib/api';
import { ConvictionBadge, ConvictionTrend, CalendarConvictionPanel } from '../components/conviction';

// TikTok icon component
function TikTokIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
    </svg>
  );
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function Calendar() {
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [rolloutEvents, setRolloutEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('month'); // 'day' | 'week' | 'month' | 'year'
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [availableContent, setAvailableContent] = useState([]);
  const [selectedContent, setSelectedContent] = useState(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('12:00');
  const [selectedPlatforms, setSelectedPlatforms] = useState(['instagram']);
  const [scheduling, setScheduling] = useState(false);

  // Multi-tab modal state
  const [modalTab, setModalTab] = useState('post'); // 'post' | 'collection' | 'rollout'

  // Collection scheduling state
  const [availableCollections, setAvailableCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [collectionEndDate, setCollectionEndDate] = useState('');
  const [postingInterval, setPostingInterval] = useState('daily');
  const [postingTimes, setPostingTimes] = useState(['12:00']);

  // Rollout scheduling state
  const [availableRollouts, setAvailableRollouts] = useState([]);
  const [selectedRollout, setSelectedRollout] = useState(null);
  const [rolloutEndDate, setRolloutEndDate] = useState('');
  const [activateRollout, setActivateRollout] = useState(false);

  // Show legend
  const [showLegend, setShowLegend] = useState(true);

  // Seasonal windows
  const [seasonalWindows, setSeasonalWindows] = useState([]);
  const [showSeasonalMarkers, setShowSeasonalMarkers] = useState(true);

  // Conviction features
  const [showConvictionInsights, setShowConvictionInsights] = useState(false);
  const [convictionGatingWarning, setConvictionGatingWarning] = useState(null);
  const [calculatingConviction, setCalculatingConviction] = useState(false);

  // Get conviction settings and cache from store
  const { calendarConvictionView, updateCalendarConvictionView, getCachedConviction, setCachedConviction, getCurrentProfile } = useAppStore();

  // Fetch scheduled posts from backend with conviction scores
  const fetchScheduledPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await postingApi.getScheduled();
      const posts = Array.isArray(data) ? data : data.posts || data.scheduled || [];

      // Batch calculate conviction scores for posts
      if (posts.length > 0 && calendarConvictionView.showScores) {
        const currentProfile = getCurrentProfile();
        const profileId = currentProfile?._id || currentProfile?.id;
        const contentIds = posts.map(p => p.contentId || p._id || p.id).filter(Boolean);

        if (contentIds.length > 0) {
          try {
            const convictionResults = await convictionApi.batchCalculate(contentIds, profileId);

            // Merge conviction data into posts
            const postsWithConviction = posts.map(post => {
              const postId = post.contentId || post._id || post.id;
              const convictionData = convictionResults.results?.find(r => r.contentId === postId);

              if (convictionData) {
                setCachedConviction(postId, convictionData.conviction);
                return {
                  ...post,
                  conviction: convictionData.conviction
                };
              }

              return post;
            });

            setScheduledPosts(postsWithConviction);
          } catch (convErr) {
            console.warn('Failed to batch calculate conviction:', convErr);
            setScheduledPosts(posts);
          }
        } else {
          setScheduledPosts(posts);
        }
      } else {
        setScheduledPosts(posts);
      }
    } catch (err) {
      console.error('Failed to fetch scheduled posts:', err);
      // Don't show error for empty/404 - just show empty calendar
      if (err.response?.status !== 404) {
        setError(err.message || 'Failed to load scheduled posts');
      }
      setScheduledPosts([]);
    } finally {
      setLoading(false);
    }
  }, [calendarConvictionView.showScores, getCachedConviction, setCachedConviction, getCurrentProfile]);

  // Fetch rollout events for calendar
  const fetchRolloutEvents = useCallback(async () => {
    try {
      const data = await rolloutApi.getScheduledRollouts();
      setRolloutEvents(data?.events || []);
    } catch (err) {
      // Silently fail - rollout events are optional
      console.error('Failed to fetch rollout events:', err);
      setRolloutEvents([]);
    }
  }, []);

  // Fetch seasonal windows for calendar overlay
  const fetchSeasonalWindows = useCallback(async () => {
    try {
      const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      const data = await rolloutApi.getSeasonalWindows(start.toISOString(), end.toISOString());
      setSeasonalWindows(data?.windowsInRange || []);
    } catch (err) {
      console.error('Failed to fetch seasonal windows:', err);
      setSeasonalWindows([]);
    }
  }, [currentDate]);

  // Fetch available content for scheduling
  const fetchAvailableContent = useCallback(async () => {
    try {
      const data = await contentApi.getAll();
      const content = Array.isArray(data) ? data : data.content || [];
      setAvailableContent(content);
    } catch (err) {
      console.error('Failed to fetch content:', err);
      setAvailableContent([]);
    }
  }, []);

  useEffect(() => {
    fetchScheduledPosts();
    fetchRolloutEvents();
    fetchSeasonalWindows();
  }, [fetchScheduledPosts, fetchRolloutEvents, fetchSeasonalWindows]);

  // Fetch available collections and rollouts
  const fetchCollectionsAndRollouts = useCallback(async () => {
    try {
      // Fetch grids, reel collections, and rollouts in parallel
      const [gridsData, reelCollectionsData, rolloutsData] = await Promise.all([
        gridApi.getAll().catch(() => ({ grids: [] })),
        reelCollectionApi.getAll().catch(() => []),
        rolloutApi.getAll().catch(() => ({ rollouts: [] })),
      ]);

      // Combine collections
      const grids = gridsData.grids || [];
      const reelCollections = reelCollectionsData || [];

      const collections = [
        ...grids.map(g => ({
          id: g._id,
          name: g.name,
          platform: g.platform || 'instagram',
          type: 'grid',
          itemCount: g.cells?.filter(c => !c.isEmpty).length || 0,
        })),
        ...reelCollections.map(rc => ({
          id: rc._id,
          name: rc.name,
          platform: rc.platform,
          type: 'reel',
          itemCount: rc.reels?.length || 0,
        })),
      ];

      setAvailableCollections(collections);
      setAvailableRollouts(rolloutsData.rollouts || []);
    } catch (err) {
      console.error('Failed to fetch collections/rollouts:', err);
    }
  }, []);

  // Handle opening schedule modal (from button - uses tomorrow's date)
  const handleOpenScheduleModal = useCallback(() => {
    fetchAvailableContent();
    fetchCollectionsAndRollouts();
    // Default to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setScheduleDate(tomorrow.toISOString().split('T')[0]);
    setCollectionEndDate('');
    setRolloutEndDate('');
    setScheduleTime('12:00');
    setSelectedContent(null);
    setSelectedCollection(null);
    setSelectedRollout(null);
    setSelectedPlatforms(['instagram']);
    setPostingInterval('daily');
    setPostingTimes(['12:00']);
    setActivateRollout(false);
    setModalTab('post');
    setShowScheduleModal(true);
  }, [fetchAvailableContent, fetchCollectionsAndRollouts]);

  // Handle clicking on a calendar day
  const handleDayClick = useCallback((date) => {
    fetchAvailableContent();
    fetchCollectionsAndRollouts();
    // Use clicked date
    setScheduleDate(date.toISOString().split('T')[0]);
    setCollectionEndDate('');
    setRolloutEndDate('');
    setScheduleTime('12:00');
    setSelectedContent(null);
    setSelectedCollection(null);
    setSelectedRollout(null);
    setSelectedPlatforms(['instagram']);
    setPostingInterval('daily');
    setPostingTimes(['12:00']);
    setActivateRollout(false);
    setModalTab('post');
    setShowScheduleModal(true);
  }, [fetchAvailableContent, fetchCollectionsAndRollouts]);

  // Handle scheduling a post with conviction check
  const handleSchedulePost = useCallback(async () => {
    if (!selectedContent || !scheduleDate || !scheduleTime) return;

    setScheduling(true);
    setConvictionGatingWarning(null);

    try {
      const contentId = selectedContent._id || selectedContent.id;
      const currentProfile = getCurrentProfile();
      const profileId = currentProfile?._id || currentProfile?.id;

      // Calculate conviction score before scheduling
      setCalculatingConviction(true);
      let conviction = getCachedConviction(contentId);

      if (!conviction) {
        try {
          const result = await convictionApi.calculateSingle(contentId, profileId);
          conviction = result.conviction;
          setCachedConviction(contentId, conviction);
        } catch (convErr) {
          console.warn('Failed to calculate conviction, proceeding without gating:', convErr);
          // Continue without conviction if API fails
        }
      }

      setCalculatingConviction(false);

      // Check gating if conviction was calculated
      if (conviction && conviction.score < 40) {
        setConvictionGatingWarning({
          score: conviction.score,
          tier: conviction.tier,
          message: `This content has low conviction (${Math.round(conviction.score)}/100). Consider reviewing before scheduling.`
        });
        setScheduling(false);
        return; // Block scheduling
      }

      // Proceed with scheduling
      const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`);
      await postingApi.schedulePost(contentId, selectedPlatforms, scheduledAt.toISOString());
      setShowScheduleModal(false);
      setConvictionGatingWarning(null);
      fetchScheduledPosts();
    } catch (err) {
      console.error('Failed to schedule post:', err);
      alert('Failed to schedule post. Please try again.');
    } finally {
      setScheduling(false);
      setCalculatingConviction(false);
    }
  }, [selectedContent, scheduleDate, scheduleTime, selectedPlatforms, fetchScheduledPosts, getCachedConviction, setCachedConviction, getCurrentProfile]);

  const togglePlatform = (platform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  };

  const { year, month, daysInMonth, firstDayOfMonth, today } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const today = new Date();

    return { year, month, daysInMonth, firstDayOfMonth, today };
  }, [currentDate]);

  const days = useMemo(() => {
    const result = [];
    // Previous month days
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      result.push({
        day: prevMonthDays - i,
        isCurrentMonth: false,
        date: new Date(year, month - 1, prevMonthDays - i),
      });
    }
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      result.push({
        day: i,
        isCurrentMonth: true,
        date: new Date(year, month, i),
      });
    }
    // Next month days
    const remainingDays = 42 - result.length;
    for (let i = 1; i <= remainingDays; i++) {
      result.push({
        day: i,
        isCurrentMonth: false,
        date: new Date(year, month + 1, i),
      });
    }
    return result;
  }, [year, month, daysInMonth, firstDayOfMonth]);

  const getPostsForDay = (date) => {
    return scheduledPosts.filter((post) => {
      const postDate = new Date(post.scheduledAt);
      return (
        postDate.getFullYear() === date.getFullYear() &&
        postDate.getMonth() === date.getMonth() &&
        postDate.getDate() === date.getDate()
      );
    });
  };

  // Get seasonal windows for a specific day
  const getSeasonalWindowsForDay = (date) => {
    if (!showSeasonalMarkers) return [];
    const dateStr = date.toISOString().split('T')[0];
    return seasonalWindows.filter((w) => {
      if (w.date) return w.date === dateStr;
      if (w.rangeStart && w.rangeEnd) return dateStr >= w.rangeStart && dateStr <= w.rangeEnd;
      return false;
    });
  };

  // Get rollout events for a specific day
  const getRolloutEventsForDay = (date) => {
    return rolloutEvents.filter((event) => {
      const eventDate = new Date(event.date);
      return (
        eventDate.getFullYear() === date.getFullYear() &&
        eventDate.getMonth() === date.getMonth() &&
        eventDate.getDate() === date.getDate()
      );
    });
  };

  // Handle scheduling a collection
  const handleScheduleCollection = useCallback(async () => {
    if (!selectedCollection || !scheduleDate) return;

    setScheduling(true);
    try {
      await collectionApi.schedule(selectedCollection.id, {
        startDate: new Date(scheduleDate).toISOString(),
        endDate: collectionEndDate ? new Date(collectionEndDate).toISOString() : null,
        interval: postingInterval,
        postingTimes: postingTimes,
        platforms: selectedPlatforms,
      });
      setShowScheduleModal(false);
      fetchScheduledPosts();
    } catch (err) {
      console.error('Failed to schedule collection:', err);
      alert('Failed to schedule collection. Please try again.');
    } finally {
      setScheduling(false);
    }
  }, [selectedCollection, scheduleDate, collectionEndDate, postingInterval, postingTimes, selectedPlatforms, fetchScheduledPosts]);

  // Handle scheduling a rollout
  const handleScheduleRollout = useCallback(async () => {
    if (!selectedRollout || !scheduleDate) return;

    setScheduling(true);
    try {
      await rolloutApi.scheduleRollout(selectedRollout._id || selectedRollout.id, {
        startDate: new Date(scheduleDate).toISOString(),
        endDate: rolloutEndDate ? new Date(rolloutEndDate).toISOString() : null,
        activate: activateRollout,
      });
      setShowScheduleModal(false);
      fetchRolloutEvents();
    } catch (err) {
      console.error('Failed to schedule rollout:', err);
      alert('Failed to schedule rollout. Please try again.');
    } finally {
      setScheduling(false);
    }
  }, [selectedRollout, scheduleDate, rolloutEndDate, activateRollout, fetchRolloutEvents]);

  // Week view: get days for current week
  const weekDays = useMemo(() => {
    const dayOfWeek = currentDate.getDay();
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - dayOfWeek);
    const result = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      result.push({ day: d.getDate(), isCurrentMonth: d.getMonth() === month, date: d });
    }
    return result;
  }, [currentDate, month]);

  // Day view hours
  const dayHours = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => i);
  }, []);

  // Year view: all 12 months mini grids
  const yearMonths = useMemo(() => {
    return Array.from({ length: 12 }, (_, m) => {
      const daysInM = new Date(year, m + 1, 0).getDate();
      const firstDay = new Date(year, m, 1).getDay();
      const monthDays = [];
      for (let i = 0; i < firstDay; i++) monthDays.push(null);
      for (let i = 1; i <= daysInM; i++) monthDays.push(new Date(year, m, i));
      return { month: m, name: MONTHS[m], days: monthDays };
    });
  }, [year]);

  const isToday = (date) => {
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  };

  // Navigate based on current view
  const navigate = (direction) => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev);
      if (view === 'day') {
        newDate.setDate(prev.getDate() + direction);
      } else if (view === 'week') {
        newDate.setDate(prev.getDate() + direction * 7);
      } else if (view === 'year') {
        newDate.setFullYear(prev.getFullYear() + direction);
      } else {
        newDate.setMonth(prev.getMonth() + direction);
      }
      return newDate;
    });
  };

  // Header label based on view
  const headerLabel = useMemo(() => {
    if (view === 'day') {
      return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    if (view === 'week') {
      const start = weekDays[0].date;
      const end = weekDays[6].date;
      const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `${startStr} — ${endStr}`;
    }
    if (view === 'year') {
      return `${year}`;
    }
    return `${MONTHS[month]} ${year}`;
  }, [view, currentDate, month, year, weekDays]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-sans font-medium text-dark-100 tracking-tight">
            {headerLabel}
          </h2>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => navigate(-1)}
              className="btn-icon h-7 w-7"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="btn-ghost text-xs px-2 py-1"
            >
              Today
            </button>
            <button
              onClick={() => navigate(1)}
              className="btn-icon h-7 w-7"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* View Toggle */}
          <div className="flex items-center gap-0.5 p-0.5 bg-dark-800">
            {['day', 'week', 'month', 'year'].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2.5 py-1 text-xs transition-colors capitalize ${
                  view === v
                    ? 'bg-dark-100 text-dark-900'
                    : 'text-dark-400 hover:text-dark-200'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <button onClick={fetchScheduledPosts} className="btn-icon h-7 w-7" title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Conviction controls */}
          <button
            onClick={() => updateCalendarConvictionView({ showScores: !calendarConvictionView.showScores })}
            className={`btn-ghost h-7 w-7 p-0 flex items-center justify-center ${calendarConvictionView.showScores ? 'text-dark-100' : 'text-dark-400'}`}
            title={calendarConvictionView.showScores ? 'Hide Conviction Scores' : 'Show Conviction Scores'}
          >
            {calendarConvictionView.showScores ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => setShowConvictionInsights(!showConvictionInsights)}
            className={`btn-ghost h-7 w-7 p-0 flex items-center justify-center ${showConvictionInsights ? 'text-dark-100' : 'text-dark-400'}`}
            title={showConvictionInsights ? 'Hide Insights' : 'Show Insights'}
          >
            <BarChart3 className="w-3.5 h-3.5" />
          </button>

          <button onClick={handleOpenScheduleModal} className="btn-primary text-xs h-7 px-2.5">
            <Plus className="w-3.5 h-3.5" />
            Schedule
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-2 px-3 py-2 bg-dark-700/50 border border-dark-600 text-dark-300 text-xs">
          {error}
          <button onClick={fetchScheduledPosts} className="ml-3 underline">
            Retry
          </button>
        </div>
      )}

      {/* Calendar Views */}
      <div className="flex-1 bg-dark-800 border border-dark-700 overflow-hidden">

        {/* ── MONTH VIEW ── */}
        {view === 'month' && (
          <>
            <div className="grid grid-cols-7 border-b border-dark-700">
              {DAYS.map((day) => (
                <div key={day} className="py-1.5 text-center text-[11px] font-medium text-dark-500 uppercase tracking-wider">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 grid-rows-6 flex-1">
              {days.map((day, index) => {
                const posts = getPostsForDay(day.date);
                const dayRolloutEvents = getRolloutEventsForDay(day.date);
                const daySeasonalWindows = getSeasonalWindowsForDay(day.date);
                const isTodayCell = isToday(day.date);
                const totalItems = posts.length + dayRolloutEvents.length;
                const hasBoost = daySeasonalWindows.some(w => !w.isAvoid);
                const hasAvoid = daySeasonalWindows.some(w => w.isAvoid);
                return (
                  <div
                    key={index}
                    onClick={() => handleDayClick(day.date)}
                    className={`min-h-[88px] border-b border-r border-dark-700/60 px-1.5 py-1 transition-colors hover:bg-dark-700/40 cursor-pointer relative group ${
                      !day.isCurrentMonth ? 'bg-dark-900/40' : ''
                    } ${isTodayCell ? 'bg-dark-100/5' : ''} ${hasBoost && !isTodayCell ? 'bg-green-900/8' : ''} ${hasAvoid && !isTodayCell ? 'bg-amber-900/10' : ''}`}
                  >
                    {/* Seasonal window tooltip */}
                    {daySeasonalWindows.length > 0 && (
                      <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block pointer-events-none">
                        <div className="bg-dark-900 border border-dark-600 px-2 py-1.5 shadow-lg whitespace-nowrap">
                          {daySeasonalWindows.slice(0, 2).map((w, i) => (
                            <div key={i} className="text-[10px] text-dark-300">
                              {w.label} <span className={w.isAvoid ? 'text-dark-500' : 'text-dark-200'}>{w.boost}x</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-xs leading-none ${!day.isCurrentMonth ? 'text-dark-600' : isTodayCell ? 'text-dark-100 font-semibold' : 'text-dark-400'}`}>
                        {day.day}
                      </span>
                      <div className="flex items-center gap-0.5">
                        {hasBoost && <span className="w-1.5 h-1.5 rounded-full bg-green-700/60" title="Boost window" />}
                        {hasAvoid && <span className="w-1.5 h-1.5 rounded-full bg-amber-700/60" title="Avoid zone" />}
                        {isTodayCell && <span className="text-[9px] bg-dark-100 text-dark-900 px-1 py-px font-medium">Today</span>}
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      {dayRolloutEvents.slice(0, 2).map((event) => (
                        <div key={event.id} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 px-1 py-0.5 text-[10px] truncate" style={{ backgroundColor: `${event.color}15`, borderLeft: `2px solid ${event.color}` }}>
                          {event.type.includes('start') ? <Flag className="w-2.5 h-2.5 flex-shrink-0" style={{ color: event.color }} /> : <Target className="w-2.5 h-2.5 flex-shrink-0" style={{ color: event.color }} />}
                          <span className="truncate flex-1" style={{ color: event.color }}>{event.type.includes('section') ? event.sectionName : event.rolloutName}</span>
                        </div>
                      ))}
                      {posts.slice(0, dayRolloutEvents.length > 1 ? 1 : 2).map((post) => (
                        <div key={post.id} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 px-1 py-0.5 text-[10px] truncate cursor-pointer hover:bg-dark-600 bg-dark-700/60">
                          {post.image ? <img src={post.image} alt="" className="w-4 h-4 object-cover flex-shrink-0" /> : <div className="w-4 h-4 flex-shrink-0" style={{ backgroundColor: post.color }} />}
                          <span className="text-dark-300 truncate flex-1">{post.caption?.slice(0, 16) || 'Untitled'}</span>
                          <Clock className="w-2.5 h-2.5 text-dark-500" />
                        </div>
                      ))}
                      {totalItems > 3 && <span className="text-[10px] text-dark-500 pl-1">+{totalItems - 3} more</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── WEEK VIEW ── */}
        {view === 'week' && (
          <>
            <div className="grid grid-cols-7 border-b border-dark-700">
              {weekDays.map((wd, i) => (
                <div key={i} className={`py-1.5 text-center border-r border-dark-700/60 last:border-r-0 ${isToday(wd.date) ? 'bg-dark-100/5' : ''}`}>
                  <div className="text-[10px] font-medium text-dark-500 uppercase tracking-wider">{DAYS[i]}</div>
                  <div className={`text-sm font-medium mt-0.5 ${isToday(wd.date) ? 'text-dark-100' : 'text-dark-300'}`}>{wd.day}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 flex-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
              {weekDays.map((wd, i) => {
                const posts = getPostsForDay(wd.date);
                const dayRolloutEvents = getRolloutEventsForDay(wd.date);
                return (
                  <div key={i} onClick={() => handleDayClick(wd.date)} className={`border-r border-dark-700/60 last:border-r-0 p-1.5 min-h-[200px] cursor-pointer hover:bg-dark-700/30 transition-colors ${isToday(wd.date) ? 'bg-dark-100/5' : ''}`}>
                    <div className="space-y-1">
                      {dayRolloutEvents.map((event) => (
                        <div key={event.id} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 px-1.5 py-1 text-[11px]" style={{ backgroundColor: `${event.color}15`, borderLeft: `2px solid ${event.color}` }}>
                          {event.type.includes('start') ? <Flag className="w-3 h-3 flex-shrink-0" style={{ color: event.color }} /> : <Target className="w-3 h-3 flex-shrink-0" style={{ color: event.color }} />}
                          <span className="truncate" style={{ color: event.color }}>{event.type.includes('section') ? event.sectionName : event.rolloutName}</span>
                        </div>
                      ))}
                      {posts.map((post) => (
                        <div key={post.id} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 px-1.5 py-1 text-[11px] bg-dark-700/60 hover:bg-dark-600 cursor-pointer">
                          {post.image ? <img src={post.image} alt="" className="w-5 h-5 object-cover flex-shrink-0" /> : <div className="w-5 h-5 flex-shrink-0" style={{ backgroundColor: post.color }} />}
                          <div className="min-w-0 flex-1">
                            <div className="text-dark-300 truncate">{post.caption?.slice(0, 24) || 'Untitled'}</div>
                            <div className="text-[9px] text-dark-500">{new Date(post.scheduledAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
                          </div>
                        </div>
                      ))}
                      {posts.length === 0 && dayRolloutEvents.length === 0 && (
                        <div className="text-[10px] text-dark-600 text-center pt-4">No events</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── DAY VIEW ── */}
        {view === 'day' && (
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 240px)' }}>
            {dayHours.map((hour) => {
              const hourStart = new Date(currentDate);
              hourStart.setHours(hour, 0, 0, 0);
              const hourEnd = new Date(currentDate);
              hourEnd.setHours(hour, 59, 59, 999);

              const hourPosts = scheduledPosts.filter((post) => {
                const postDate = new Date(post.scheduledAt);
                return postDate >= hourStart && postDate <= hourEnd &&
                  postDate.getFullYear() === currentDate.getFullYear() &&
                  postDate.getMonth() === currentDate.getMonth() &&
                  postDate.getDate() === currentDate.getDate();
              });

              const hourRollouts = rolloutEvents.filter((event) => {
                const eventDate = new Date(event.date);
                return eventDate >= hourStart && eventDate <= hourEnd &&
                  eventDate.getFullYear() === currentDate.getFullYear() &&
                  eventDate.getMonth() === currentDate.getMonth() &&
                  eventDate.getDate() === currentDate.getDate();
              });

              const timeLabel = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;

              return (
                <div key={hour} className="flex border-b border-dark-700/40 min-h-[48px] hover:bg-dark-700/20 transition-colors">
                  <div className="w-16 flex-shrink-0 py-1.5 px-2 text-right">
                    <span className="text-[10px] text-dark-500 font-medium">{timeLabel}</span>
                  </div>
                  <div className="flex-1 border-l border-dark-700/60 px-2 py-1 cursor-pointer" onClick={() => handleDayClick(currentDate)}>
                    <div className="space-y-0.5">
                      {hourRollouts.map((event) => (
                        <div key={event.id} className="flex items-center gap-1.5 px-2 py-1 text-xs" style={{ backgroundColor: `${event.color}15`, borderLeft: `2px solid ${event.color}` }}>
                          {event.type.includes('start') ? <Flag className="w-3 h-3" style={{ color: event.color }} /> : <Target className="w-3 h-3" style={{ color: event.color }} />}
                          <span style={{ color: event.color }}>{event.type.includes('section') ? event.sectionName : event.rolloutName}</span>
                        </div>
                      ))}
                      {hourPosts.map((post) => (
                        <div key={post.id} className="flex items-center gap-2 px-2 py-1.5 bg-dark-700/60 hover:bg-dark-600 cursor-pointer">
                          {post.image ? <img src={post.image} alt="" className="w-8 h-8 object-cover flex-shrink-0" /> : <div className="w-8 h-8 flex-shrink-0" style={{ backgroundColor: post.color }} />}
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-dark-200 truncate">{post.caption?.slice(0, 40) || 'Untitled'}</div>
                            <div className="text-[10px] text-dark-500">{new Date(post.scheduledAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── YEAR VIEW ── */}
        {view === 'year' && (
          <div className="grid grid-cols-4 gap-px bg-dark-700/40 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 240px)' }}>
            {yearMonths.map((m) => {
              const monthPostCount = scheduledPosts.filter(p => {
                const d = new Date(p.scheduledAt);
                return d.getFullYear() === year && d.getMonth() === m.month;
              }).length;

              return (
                <div
                  key={m.month}
                  className={`bg-dark-800 p-2.5 cursor-pointer hover:bg-dark-700/50 transition-colors ${m.month === month ? 'ring-1 ring-dark-300' : ''}`}
                  onClick={() => { setCurrentDate(new Date(year, m.month, 1)); setView('month'); }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium text-dark-300">{m.name.slice(0, 3)}</span>
                    {monthPostCount > 0 && <span className="text-[9px] text-dark-500">{monthPostCount}</span>}
                  </div>
                  <div className="grid grid-cols-7 gap-px">
                    {['S','M','T','W','T','F','S'].map((d, i) => (
                      <div key={i} className="text-[7px] text-dark-600 text-center leading-none pb-0.5">{d}</div>
                    ))}
                    {m.days.map((d, i) => {
                      if (!d) return <div key={`e-${i}`} className="h-3.5" />;
                      const isTd = isToday(d);
                      const hasPost = scheduledPosts.some(p => {
                        const pd = new Date(p.scheduledAt);
                        return pd.getFullYear() === d.getFullYear() && pd.getMonth() === d.getMonth() && pd.getDate() === d.getDate();
                      });
                      return (
                        <div
                          key={i}
                          className={`h-3.5 flex items-center justify-center text-[8px] ${
                            isTd ? 'bg-dark-100 text-dark-900 font-semibold' : hasPost ? 'bg-dark-600 text-dark-200' : 'text-dark-500'
                          }`}
                        >
                          {d.getDate()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Conviction Insights Panel */}
      {showConvictionInsights && scheduledPosts.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-3">
          <ConvictionTrend posts={scheduledPosts} metric="conviction" />
          <CalendarConvictionPanel
            dateRange={{ start: days[0]?.date, end: days[days.length - 1]?.date }}
            posts={scheduledPosts}
          />
        </div>
      )}

      {/* Quick Stats & Legend */}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 text-dark-500">
            <CalendarIcon className="w-3 h-3" />
            <span>{scheduledPosts.length} scheduled</span>
          </div>
          <div className="flex items-center gap-1.5 text-dark-500">
            <Layers className="w-3 h-3" />
            <span>{rolloutEvents.length} rollout events</span>
          </div>
          {calendarConvictionView.showScores && scheduledPosts.some(p => p.conviction) && (
            <>
              <div className="flex items-center gap-1.5 text-dark-300">
                <BarChart3 className="w-3 h-3" />
                <span>
                  {scheduledPosts.filter(p => p.conviction?.score >= 60).length} high-conviction
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-dark-500">
                <TrendingUp className="w-3 h-3" />
                <span>
                  Avg: {Math.round(
                    scheduledPosts
                      .filter(p => p.conviction?.score !== null && p.conviction?.score !== undefined)
                      .reduce((sum, p) => sum + p.conviction.score, 0) /
                    scheduledPosts.filter(p => p.conviction?.score !== null && p.conviction?.score !== undefined).length || 0
                  )}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Legend */}
        {showLegend && (
          <div className="flex items-center gap-3 text-[10px] text-dark-500">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-dark-700 flex items-center justify-center">
                <Image className="w-2 h-2" />
              </div>
              <span>Post</span>
            </div>
            <div className="flex items-center gap-1">
              <Flag className="w-3 h-3 text-dark-300" />
              <span>Start</span>
            </div>
            <div className="flex items-center gap-1">
              <Target className="w-3 h-3 text-dark-400" />
              <span>Deadline</span>
            </div>
            <button
              onClick={() => setShowSeasonalMarkers(!showSeasonalMarkers)}
              className={`flex items-center gap-1 px-1.5 py-0.5 ${showSeasonalMarkers ? 'bg-dark-700/60 text-dark-300' : 'text-dark-600'}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-700/60" />
              <span>Seasons</span>
            </button>
            <button
              onClick={() => setShowLegend(false)}
              className="text-dark-600 hover:text-dark-400"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        )}
      </div>

      {/* Multi-Tab Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-dark-800 border border-dark-700 w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-dark-700">
              <div>
                <h3 className="text-lg font-semibold text-dark-100">
                  Schedule for: {scheduleDate ? new Date(scheduleDate + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  }) : 'Select a date'}
                </h3>
              </div>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="btn-icon"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-dark-700">
              <button
                onClick={() => setModalTab('post')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  modalTab === 'post'
                    ? 'text-dark-100 border-b-2 border-dark-100 bg-dark-700'
                    : 'text-dark-400 hover:text-dark-200 hover:bg-dark-700/50'
                }`}
              >
                <Image className="w-4 h-4" />
                Post
              </button>
              <button
                onClick={() => setModalTab('collection')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  modalTab === 'collection'
                    ? 'text-dark-100 border-b-2 border-dark-100 bg-dark-700'
                    : 'text-dark-400 hover:text-dark-200 hover:bg-dark-700/50'
                }`}
              >
                <Folder className="w-4 h-4" />
                Collection
              </button>
              <button
                onClick={() => setModalTab('rollout')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  modalTab === 'rollout'
                    ? 'text-dark-100 border-b-2 border-dark-100 bg-dark-700'
                    : 'text-dark-400 hover:text-dark-200 hover:bg-dark-700/50'
                }`}
              >
                <Layers className="w-4 h-4" />
                Rollout
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {/* POST TAB */}
              {modalTab === 'post' && (
                <>
                  {/* Select Content */}
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-2">
                      Select Content
                    </label>
                    <div className="grid grid-cols-4 gap-2 max-h-48 overflow-auto">
                      {availableContent.length === 0 ? (
                        <p className="col-span-4 text-center text-dark-400 py-4">
                          No content available. Upload content first.
                        </p>
                      ) : (
                        availableContent.map((content) => (
                          <button
                            key={content._id || content.id}
                            onClick={() => setSelectedContent(content)}
                            className={`aspect-square overflow-hidden border-2 transition-colors ${
                              selectedContent?._id === content._id || selectedContent?.id === content.id
                                ? 'border-dark-100'
                                : 'border-transparent hover:border-dark-500'
                            }`}
                          >
                            {content.mediaUrl || content.image ? (
                              <img
                                src={content.mediaUrl || content.image}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-dark-700 flex items-center justify-center">
                                <Image className="w-8 h-8 text-dark-500" />
                              </div>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Time */}
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-2">
                      Time
                    </label>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="input w-full max-w-xs"
                    />
                  </div>

                  {/* Platforms */}
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-2">
                      Platforms
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {['instagram', 'tiktok', 'youtube'].map((platform) => (
                        <button
                          key={platform}
                          onClick={() => togglePlatform(platform)}
                          className={`px-3 py-1.5 text-sm capitalize transition-colors ${
                            selectedPlatforms.includes(platform)
                              ? 'bg-dark-100 text-dark-900'
                              : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                          }`}
                        >
                          {platform}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* COLLECTION TAB */}
              {modalTab === 'collection' && (
                <>
                  {/* Select Collection */}
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-2">
                      Select Collection
                    </label>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-auto">
                      {availableCollections.length === 0 ? (
                        <p className="col-span-2 text-center text-dark-400 py-4">
                          No collections available. Create a collection first.
                        </p>
                      ) : (
                        availableCollections.map((collection) => (
                          <button
                            key={collection.id}
                            onClick={() => setSelectedCollection(collection)}
                            className={`flex items-center gap-3 p-3 border-2 text-left transition-colors ${
                              selectedCollection?.id === collection.id
                                ? 'border-dark-100 bg-dark-600/50'
                                : 'border-dark-600 hover:border-dark-500'
                            }`}
                          >
                            <div className="w-8 h-8 bg-dark-600 flex items-center justify-center">
                              {collection.platform === 'youtube' && <Youtube className="w-4 h-4 text-dark-300" />}
                              {collection.platform === 'instagram' && <Instagram className="w-4 h-4 text-pink-400" />}
                              {collection.platform === 'tiktok' && <TikTokIcon className="w-4 h-4 text-cyan-400" />}
                              {collection.type === 'reel' && <Film className="w-4 h-4 text-purple-400" />}
                              {!['youtube', 'instagram', 'tiktok'].includes(collection.platform) && collection.type !== 'reel' && (
                                <Folder className="w-4 h-4 text-dark-400" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-white truncate">{collection.name}</div>
                              <div className="text-xs text-dark-400">{collection.itemCount} items</div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {/* End Date */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-dark-200 mb-2">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        className="input w-full"
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-dark-200 mb-2">
                        End Date (optional)
                      </label>
                      <input
                        type="date"
                        value={collectionEndDate}
                        onChange={(e) => setCollectionEndDate(e.target.value)}
                        className="input w-full"
                        min={scheduleDate}
                      />
                    </div>
                  </div>

                  {/* Posting Interval */}
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-2">
                      Posting Interval
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'daily', label: 'Daily' },
                        { id: 'every-other-day', label: 'Every Other Day' },
                        { id: 'weekly', label: 'Weekly' },
                        { id: 'custom', label: 'Custom' },
                      ].map((interval) => (
                        <button
                          key={interval.id}
                          onClick={() => setPostingInterval(interval.id)}
                          className={`px-3 py-1.5 text-sm transition-colors ${
                            postingInterval === interval.id
                              ? 'bg-dark-100 text-dark-900'
                              : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                          }`}
                        >
                          {interval.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Posting Times */}
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-2">
                      Posting Time(s)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={postingTimes[0] || '12:00'}
                        onChange={(e) => setPostingTimes([e.target.value, ...postingTimes.slice(1)])}
                        className="input"
                      />
                      <button
                        onClick={() => setPostingTimes([...postingTimes, '18:00'])}
                        className="btn-ghost text-sm"
                      >
                        + Add time
                      </button>
                    </div>
                  </div>

                  {/* Platforms */}
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-2">
                      Platforms
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {['instagram', 'tiktok', 'youtube'].map((platform) => (
                        <button
                          key={platform}
                          onClick={() => togglePlatform(platform)}
                          className={`px-3 py-1.5 text-sm capitalize transition-colors ${
                            selectedPlatforms.includes(platform)
                              ? 'bg-dark-100 text-dark-900'
                              : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                          }`}
                        >
                          {platform}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ROLLOUT TAB */}
              {modalTab === 'rollout' && (
                <>
                  {/* Select Rollout */}
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-2">
                      Select Rollout
                    </label>
                    <div className="space-y-2 max-h-40 overflow-auto">
                      {availableRollouts.length === 0 ? (
                        <p className="text-center text-dark-400 py-4">
                          No rollouts available. Create a rollout first.
                        </p>
                      ) : (
                        availableRollouts.map((rollout) => (
                          <button
                            key={rollout._id || rollout.id}
                            onClick={() => setSelectedRollout(rollout)}
                            className={`w-full flex items-center gap-3 p-3 border-2 text-left transition-colors ${
                              selectedRollout?._id === rollout._id || selectedRollout?.id === rollout.id
                                ? 'border-dark-100 bg-dark-600/50'
                                : 'border-dark-600 hover:border-dark-500'
                            }`}
                          >
                            <div className="w-10 h-10 bg-dark-600 flex items-center justify-center">
                              <Layers className="w-5 h-5 text-dark-100" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-white">{rollout.name}</div>
                              <div className="text-xs text-dark-400">
                                {rollout.sections?.length || 0} sections
                                <span className={`ml-2 px-1.5 py-0.5 ${
                                  rollout.status === 'active'
                                    ? 'bg-dark-600/30 text-dark-100'
                                    : rollout.status === 'completed'
                                    ? 'bg-blue-500/20 text-blue-400'
                                    : 'bg-dark-600 text-dark-400'
                                }`}>
                                  {rollout.status}
                                </span>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Rollout Dates */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-dark-200 mb-2">
                        <Flag className="w-4 h-4 inline mr-1" />
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        className="input w-full"
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-dark-200 mb-2">
                        <Target className="w-4 h-4 inline mr-1" />
                        Deadline (optional)
                      </label>
                      <input
                        type="date"
                        value={rolloutEndDate}
                        onChange={(e) => setRolloutEndDate(e.target.value)}
                        className="input w-full"
                        min={scheduleDate}
                      />
                    </div>
                  </div>

                  {/* Activate Toggle */}
                  <div className="flex items-center gap-3 p-3 bg-dark-700">
                    <input
                      type="checkbox"
                      id="activateRollout"
                      checked={activateRollout}
                      onChange={(e) => setActivateRollout(e.target.checked)}
                      className="w-4 h-4 border-dark-500"
                    />
                    <label htmlFor="activateRollout" className="text-sm text-dark-200">
                      Activate rollout immediately
                    </label>
                  </div>

                  {/* Section deadlines info */}
                  {selectedRollout && selectedRollout.sections?.length > 0 && (
                    <div className="text-xs text-dark-400 p-3 bg-dark-700/50">
                      <p className="mb-2">Sections in this rollout:</p>
                      <ul className="space-y-1">
                        {selectedRollout.sections.map((section) => (
                          <li key={section.id} className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: section.color || '#6366f1' }}
                            />
                            <span>{section.name}</span>
                            {section.deadline && (
                              <span className="text-dark-500">
                                (Due: {new Date(section.deadline).toLocaleDateString()})
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-dark-500">
                        Set section deadlines in the Rollout Planner.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Conviction Gating Warning */}
            {convictionGatingWarning && (
              <div className="mx-4 mb-4 p-4 bg-dark-700/50 border border-dark-600">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <ConvictionBadge score={convictionGatingWarning.score} size="md" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-dark-300 font-semibold text-sm mb-1">Low Conviction Score</h4>
                    <p className="text-dark-300 text-sm mb-3">{convictionGatingWarning.message}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConvictionGatingWarning(null)}
                        className="px-3 py-1.5 text-sm bg-dark-700 hover:bg-dark-600 text-dark-200"
                      >
                        Review Content
                      </button>
                      <button
                        onClick={async () => {
                          setConvictionGatingWarning(null);
                          const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`);
                          const contentId = selectedContent._id || selectedContent.id;
                          await postingApi.schedulePost(contentId, selectedPlatforms, scheduledAt.toISOString());
                          setShowScheduleModal(false);
                          fetchScheduledPosts();
                        }}
                        className="px-3 py-1.5 text-sm bg-dark-100 hover:bg-white text-dark-900 text-white"
                      >
                        Schedule Anyway
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="p-4 border-t border-dark-700 flex gap-2">
              <button
                onClick={() => setShowScheduleModal(false)}
                className="flex-1 btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={
                  modalTab === 'post'
                    ? handleSchedulePost
                    : modalTab === 'collection'
                    ? handleScheduleCollection
                    : handleScheduleRollout
                }
                disabled={
                  scheduling ||
                  calculatingConviction ||
                  (modalTab === 'post' && (!selectedContent || !scheduleTime)) ||
                  (modalTab === 'collection' && !selectedCollection) ||
                  (modalTab === 'rollout' && !selectedRollout)
                }
                className="flex-1 btn-primary disabled:opacity-50"
              >
                {calculatingConviction ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking conviction...
                  </>
                ) : scheduling ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Scheduling...
                  </>
                ) : (
                  <>
                    <CalendarIcon className="w-4 h-4" />
                    Schedule {modalTab === 'post' ? 'Post' : modalTab === 'collection' ? 'Collection' : 'Rollout'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Calendar;
