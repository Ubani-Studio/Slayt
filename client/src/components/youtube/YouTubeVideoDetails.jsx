import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { intelligenceApi, youtubeApi } from '../../lib/api';
import YouTubeSchedulePopover from './YouTubeSchedulePopover';
import {
  extractVideoFrame,
  formatDuration,
  getPlannerVideoAssetState,
  hasPlannerVideoAttachment,
} from '../../lib/videoUtils';
import {
  formatScheduleSummary,
  toDateInputValue,
  toTimeInputValue,
} from '../../lib/youtubeSchedule';
import {
  Image,
  Type,
  Trash2,
  Upload,
  Copy,
  Scissors,
  ClipboardPaste,
  Eye,
  EyeOff,
  Youtube,
  AlertCircle,
  FileText,
  Clock,
  RefreshCw,
  ChevronDown,
  Check,
  ThumbsDown,
  SkipForward,
  X,
} from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft', color: 'bg-gray-500' },
  { value: 'scheduled', label: 'Scheduled', color: 'bg-blue-500' },
  { value: 'published', label: 'Published', color: 'bg-dark-100' },
];

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'unlisted', label: 'Unlisted' },
  { value: 'private', label: 'Private' },
];

// YouTube title character limits
const TITLE_MAX = 100;
const TITLE_VISIBLE = 60; // Characters visible in search results

const buildVideoPersistencePayload = (video = {}) => ({
  storageProvider: video.storageProvider || (video.muxAssetId || video.muxUploadId ? 'mux' : 'legacy'),
  videoUrl: video.videoUrl || '',
  videoFileName: video.videoFileName || '',
  videoFileSize: video.videoFileSize || undefined,
  videoMimeType: video.videoMimeType || '',
  durationSeconds: video.durationSeconds || undefined,
  muxUploadId: video.muxUploadId || '',
  muxUploadStatus: video.muxUploadStatus || '',
  muxAssetId: video.muxAssetId || '',
  muxAssetStatus: video.muxAssetStatus || '',
  muxMasterStatus: video.muxMasterStatus || '',
  muxMasterAccessExpiresAt: video.muxMasterAccessExpiresAt || null,
});

const isVideoFile = (file) => {
  if (!file) return false;
  if (typeof file.type === 'string' && file.type.startsWith('video/')) {
    return true;
  }
  return /\.(mp4|mov|avi|webm|m4v|mkv)$/i.test(file.name || '');
};

const dragEventHasFiles = (event) => {
  const types = Array.from(event.dataTransfer?.types || []);
  return types.includes('Files');
};

const dragEventHasVideoFiles = (event) => {
  const items = Array.from(event.dataTransfer?.items || []);
  if (items.length > 0) {
    return items.some((item) => item.kind === 'file' && item.type.startsWith('video/'));
  }

  const files = Array.from(event.dataTransfer?.files || []);
  return files.some(isVideoFile);
};

const formatBytes = (value) => {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const decimals = unitIndex === 0 ? 0 : size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(decimals)} ${units[unitIndex]}`;
};

const formatEta = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 1) {
    return 'under 1s';
  }

  const rounded = Math.ceil(seconds);
  if (rounded < 60) {
    return `${rounded}s`;
  }

  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
};

function YouTubeVideoDetails({
  video,
  onThumbnailUpload,
  videoClipboard,
  currentCollectionName,
  onCopyVideo,
  onCutVideo,
  onPasteVideo,
}) {
  const updateYoutubeVideo = useAppStore((state) => state.updateYoutubeVideo);
  const deleteYoutubeVideo = useAppStore((state) => state.deleteYoutubeVideo);
  const currentProfileId = useAppStore((state) => state.currentProfileId);
  const activeFolioId = useAppStore((state) => state.activeFolioId);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const user = useAppStore((state) => state.user);
  const profiles = useAppStore((state) => state.profiles);
  const currentProfile = profiles?.find(p => (p._id || p.id) === currentProfileId) || null;

  const videoId = video?.id || video?._id;

  const youtubeVideos = useAppStore((state) => state.youtubeVideos);

  const [title, setTitle] = useState(video?.title || '');
  const [description, setDescription] = useState(video?.description || '');
  const [artistName, setArtistName] = useState(video?.artistName || '');
  const [showArtistSuggestions, setShowArtistSuggestions] = useState(false);
  const artistInputRef = useRef(null);
  const [status, setStatus] = useState(video?.status || 'draft');
  const [privacyStatus, setPrivacyStatus] = useState(video?.privacyStatus || 'public');
  const [scheduledDate, setScheduledDate] = useState(toDateInputValue(video?.scheduledDate));
  const [scheduledTime, setScheduledTime] = useState(toTimeInputValue(video?.scheduledDate));
  const [showTruncatePreview, setShowTruncatePreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showYoutubePreview, setShowYoutubePreview] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewVideoRef = useRef(null);
  const [showVideoFile, setShowVideoFile] = useState(true);
  const [showSchedulePopover, setShowSchedulePopover] = useState(false);
  const [isDraggingVideoFile, setIsDraggingVideoFile] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(null);
  const [showDescription, setShowDescription] = useState(true);

  // AI Generation state
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiVideoType, setAiVideoType] = useState('standard');
  const [generating, setGenerating] = useState(false);
  const [aiVariants, setAiVariants] = useState([]);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [tasteProfile, setTasteProfile] = useState(null);

  const fileInputRef = useRef(null);
  const videoFileInputRef = useRef(null);
  const videoFileDragCounterRef = useRef(0);
  const autosaveTimer = useRef(null);
  const lastSavedRef = useRef({
    title: video?.title || '',
    description: video?.description || '',
  });

  // Update local state when video changes
  useEffect(() => {
    if (video) {
      setTitle(video.title || '');
      setDescription(video.description || '');
      setArtistName(video.artistName || '');
      setStatus(video.status || 'draft');
      setPrivacyStatus(video.privacyStatus || 'public');
      setScheduledDate(toDateInputValue(video.scheduledDate));
      setScheduledTime(toTimeInputValue(video.scheduledDate));
      setIsDraggingVideoFile(false);
      setShowSchedulePopover(false);
      setVideoUploadProgress(null);
      videoFileDragCounterRef.current = 0;
      lastSavedRef.current = {
        title: video.title || '',
        description: video.description || '',
        artistName: video.artistName || '',
      };
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
      }
    }
  }, [video?.id]);

  useEffect(() => {
    if (!videoId || videoUploadProgress?.phase !== 'processing') {
      return undefined;
    }

    let cancelled = false;
    let timeoutId = null;

    const pollUntilReady = async () => {
      try {
        const { video: latestVideo } = await youtubeApi.getVideo(videoId);
        if (cancelled || !latestVideo) {
          return;
        }

        updateYoutubeVideo(videoId, { ...latestVideo, id: latestVideo._id || videoId });
        const latestAssetState = getPlannerVideoAssetState(latestVideo);

        if (latestAssetState === 'ready') {
          setVideoUploadProgress({
            phase: 'done',
            percent: 100,
            label: 'Video ready',
            details: 'Upload complete.',
          });

          timeoutId = setTimeout(() => {
            if (!cancelled) {
              setVideoUploadProgress(null);
            }
          }, 1200);
          return;
        }

        if (latestAssetState === 'errored') {
          setVideoUploadProgress({
            phase: 'error',
            percent: 0,
            label: 'Upload failed',
            details: latestVideo.lastError || 'The uploaded video could not be prepared.',
          });
          return;
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to refresh video processing status:', error);
        }
      }

      if (!cancelled) {
        timeoutId = setTimeout(pollUntilReady, 5000);
      }
    };

    timeoutId = setTimeout(pollUntilReady, 3000);

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [videoId, videoUploadProgress?.phase, updateYoutubeVideo]);

  // Debounced autosave for title/description so refresh/collection switch doesn't lose edits
  useEffect(() => {
    if (!video) return undefined;
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
    }
    autosaveTimer.current = setTimeout(() => {
      const dirtyTitle = title !== lastSavedRef.current.title;
      const dirtyDescription = description !== lastSavedRef.current.description;
      const dirtyArtist = artistName !== lastSavedRef.current.artistName;
      // Only save if title is not empty (required field) and something changed
      if ((dirtyTitle || dirtyDescription || dirtyArtist) && title.trim()) {
        persistVideoUpdates({ title, description, artistName });
        lastSavedRef.current = { title, description, artistName };
      }
    }, 700);

    return () => {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
      }
    };
  }, [title, description, artistName, video?.id]);

  // Load taste profile for richer prompts
  useEffect(() => {
    const loadTaste = async () => {
      try {
        const res = await intelligenceApi.getProfile(currentProfileId || null);
        if (res?.tasteProfile) setTasteProfile(res.tasteProfile);
      } catch (err) {
        console.error('Failed to load taste profile for YouTube dice:', err);
      }
    };
    loadTaste();
  }, [currentProfileId]);

  // Final flush on unmount
  useEffect(() => () => {
    if (videoId) {
      const dirtyTitle = title !== lastSavedRef.current.title;
      const dirtyDescription = description !== lastSavedRef.current.description;
      const dirtyArtist = artistName !== lastSavedRef.current.artistName;
      // Only save if title is not empty and something changed
      if ((dirtyTitle || dirtyDescription || dirtyArtist) && title.trim()) {
        persistVideoUpdates({ title, description, artistName });
        lastSavedRef.current = { title, description, artistName };
      }
    }
  }, [videoId, title, description, artistName]);

  if (!video) {
    return (
      <div className="h-full bg-dark-800 rounded-2xl border border-dark-700 p-6 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 mb-4 bg-dark-600/30 rounded-full flex items-center justify-center">
          <Youtube className="w-8 h-8 text-dark-300" />
        </div>
        <p className="text-dark-300 mb-2">No video selected</p>
        <p className="text-sm text-dark-500">
          Click on a video to view and edit its details
        </p>
        {videoClipboard?.payload && (
          <div className="mt-5 w-full max-w-[240px] rounded-xl border border-dark-600 bg-dark-700/60 p-3 text-left">
            <p className="text-xs text-dark-300 mb-1">
              {videoClipboard.mode === 'cut' ? 'Cut' : 'Copied'} video ready
            </p>
            <p className="text-xs text-dark-500 truncate mb-3">
              {videoClipboard.sourceVideoTitle}
            </p>
            <button
              type="button"
              onClick={() => onPasteVideo?.()}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-dark-100 hover:bg-white text-dark-900 rounded-lg text-xs font-medium transition-colors"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>Paste to {currentCollectionName || 'This Collection'}</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // Persist updates to the backend and keep local state in sync
  const persistVideoUpdates = async (updates) => {
    if (!videoId) return null;

    // Optimistic local update
    updateYoutubeVideo(videoId, updates);

    try {
      const { video: savedVideo } = await youtubeApi.updateVideo(videoId, updates);
      if (savedVideo) {
        updateYoutubeVideo(videoId, { ...savedVideo, id: savedVideo._id || videoId });
        if (typeof updates.title === 'string' || typeof updates.description === 'string') {
          lastSavedRef.current = {
            title: updates.title ?? lastSavedRef.current.title,
            description: updates.description ?? lastSavedRef.current.description,
          };
        }
        return savedVideo;
      }
    } catch (error) {
      console.error('Failed to save YouTube video update:', error);
    }
    return null;
  };

  const handleTitleChange = (value) => {
    if (value.length <= TITLE_MAX) {
      setTitle(value);
    }
  };

  const handleTitleBlur = () => {
    persistVideoUpdates({ title });
    lastSavedRef.current = { ...lastSavedRef.current, title };
  };

  const handleDescriptionChange = (value) => {
    setDescription(value);
  };

  const handleDescriptionBlur = () => {
    persistVideoUpdates({ description });
    lastSavedRef.current = { ...lastSavedRef.current, description };
  };

  // Taste feedback signals — removed (genome stripped)
  const sendTasteSignal = async () => {};

  const assetState = getPlannerVideoAssetState(video);
  const hasVideoAsset = hasPlannerVideoAttachment(video);
  const isVideoReady = assetState === 'ready';
  const durationLabel = formatDuration(video.durationSeconds);

  const handleStatusChange = (newStatus) => {
    if (newStatus === 'scheduled' && !hasVideoAsset) {
      setShowSchedulePopover(true);
      return;
    }
    if (newStatus === 'scheduled' && !scheduledDate) {
      setShowSchedulePopover(true);
      return;
    }
    setStatus(newStatus);
    persistVideoUpdates({ status: newStatus });
  };

  const handleVisibilityChange = (nextVisibility) => {
    setPrivacyStatus(nextVisibility);
    persistVideoUpdates({ privacyStatus: nextVisibility });
  };

  const handleScheduleApply = ({ scheduledDate: nextDate, scheduledTime: nextTime }) => {
    if (!hasVideoAsset) {
      return;
    }

    const resolvedDate = nextDate || '';
    const resolvedTime = nextTime || '12:00';
    const nextStatus = resolvedDate ? 'scheduled' : status === 'scheduled' ? 'draft' : status;
    const scheduledAt = resolvedDate
      ? new Date(`${resolvedDate}T${resolvedTime}`)
      : null;

    setStatus(nextStatus);
    setScheduledDate(resolvedDate);
    setScheduledTime(resolvedTime);
    persistVideoUpdates({
      scheduledDate: scheduledAt ? scheduledAt.toISOString() : null,
      status: nextStatus,
    });
  };

  const handleScheduleClear = () => {
    const nextStatus = status === 'scheduled' ? 'draft' : status;
    setStatus(nextStatus);
    setScheduledDate('');
    setScheduledTime('12:00');
    persistVideoUpdates({
      scheduledDate: null,
      ...(status === 'scheduled' ? { status: 'draft' } : {}),
    });
  };

  const handleThumbnailChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onThumbnailUpload?.(file, videoId);
    }
    e.target.value = '';
  };

  const uploadVideoFileToCurrentCard = async (file) => {
    if (!isVideoFile(file)) {
      alert('Drop or upload a video file here.');
      return;
    }

    try {
      setVideoUploadProgress({
        phase: 'preparing',
        percent: 0,
        label: 'Uploading',
        details: file.name,
      });

      const [{ asset }, frameData] = await Promise.all([
        youtubeApi.uploadVideoAsset(file, {
          onProgress: (progress) => {
            if (progress.phase === 'uploading') {
              const roundedPercent = Math.round(progress.percent ?? 0);
              setVideoUploadProgress({
                phase: 'uploading',
                percent: progress.percent ?? 0,
                label: 'Uploading',
                details: `${roundedPercent}% • ${formatBytes(progress.loaded)} of ${formatBytes(progress.total)}${progress.etaSeconds ? ` • about ${formatEta(progress.etaSeconds)} left` : ''}`,
              });
              return;
            }

            if (progress.phase === 'processing') {
              setVideoUploadProgress({
                phase: 'processing',
                percent: 100,
                label: 'Preparing video for playback',
                details: 'Finalizing the uploaded file.',
              });
              return;
            }

            if (progress.phase === 'ready') {
              setVideoUploadProgress({
                phase: 'done',
                percent: 100,
                label: 'Video ready',
                details: 'Upload complete.',
              });
            }
          },
        }),
        extractVideoFrame(file),
      ]);

      const savedVideo = await persistVideoUpdates({
        ...buildVideoPersistencePayload({
          ...asset,
          videoFileName: asset.videoFileName || file.name,
          videoFileSize: asset.videoFileSize || file.size,
          videoMimeType: asset.videoMimeType || file.type,
          durationSeconds: asset.durationSeconds || frameData.durationSeconds || 0,
        }),
        lastError: '',
        ...(status === 'failed' ? { status: 'draft' } : {}),
        ...(video.thumbnail
          ? {}
          : {
              thumbnail: frameData.thumbnailDataUrl,
              thumbnailMode: 'auto',
              thumbnailStatus: 'auto',
            }),
      });

      const nextAssetState = getPlannerVideoAssetState(savedVideo || asset);
      if (nextAssetState === 'ready') {
        setVideoUploadProgress({
          phase: 'done',
          percent: 100,
          label: 'Video ready',
          details: 'Upload complete.',
        });

        window.setTimeout(() => {
          setVideoUploadProgress((current) => current?.phase === 'done' ? null : current);
        }, 1200);
      } else {
        setVideoUploadProgress({
          phase: 'processing',
          percent: 100,
          label: 'Preparing video for playback',
          details: 'Finalizing the uploaded file.',
        });
      }
    } catch (error) {
      console.error('Failed to upload planner video asset:', error);
      setVideoUploadProgress({
        phase: 'error',
        percent: 0,
        label: 'Upload failed',
        details: error.message || 'Failed to upload video file. Please try again.',
      });
      alert('Failed to upload video file. Please try again.');
    }
  };

  const handleVideoFileChange = async (e) => {
    const file = Array.from(e.target.files || []).find(isVideoFile);
    if (file) {
      await uploadVideoFileToCurrentCard(file);
    }
    e.target.value = '';
  };

  const handleVideoFileDragEnter = (e) => {
    if (!dragEventHasFiles(e)) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    videoFileDragCounterRef.current += 1;

    if (dragEventHasVideoFiles(e)) {
      setIsDraggingVideoFile(true);
    }
  };

  const handleVideoFileDragOver = (e) => {
    if (!dragEventHasFiles(e)) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';

    if (dragEventHasVideoFiles(e)) {
      setIsDraggingVideoFile(true);
    }
  };

  const handleVideoFileDragLeave = (e) => {
    if (!dragEventHasFiles(e)) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    videoFileDragCounterRef.current = Math.max(0, videoFileDragCounterRef.current - 1);

    if (videoFileDragCounterRef.current === 0) {
      setIsDraggingVideoFile(false);
    }
  };

  const handleVideoFileDrop = async (e) => {
    if (!dragEventHasFiles(e)) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    setIsDraggingVideoFile(false);
    videoFileDragCounterRef.current = 0;

    const file = Array.from(e.dataTransfer?.files || []).find(isVideoFile);
    if (!file) {
      alert('Drop a video file here to attach or replace the current video.');
      return;
    }

    await uploadVideoFileToCurrentCard(file);
  };

  const handleDelete = () => {
    deleteYoutubeVideo(videoId);
    setShowDeleteConfirm(false);
  };

  const handleRemoveVideoAttachment = async () => {
    setIsDraggingVideoFile(false);
    videoFileDragCounterRef.current = 0;
    setVideoUploadProgress(null);

    if (status === 'scheduled') {
      setStatus('draft');
    }

    const savedVideo = await persistVideoUpdates({
      storageProvider: 'legacy',
      videoUrl: '',
      videoFileName: '',
      videoFileSize: null,
      videoMimeType: '',
      durationSeconds: null,
      muxUploadId: '',
      muxUploadStatus: '',
      muxAssetId: '',
      muxAssetStatus: '',
      muxMasterStatus: '',
      muxMasterAccessExpiresAt: null,
      lastError: '',
      ...(status === 'scheduled' ? { status: 'draft' } : {}),
    });

    if (savedVideo && getPlannerVideoAssetState(savedVideo) !== 'ready') {
      setPreviewPlaying(false);
    }
  };

  // Compose a richer topic for taste-aligned rolls
  const buildTastePrompt = () => {
    const baseTitle = title || video?.title || 'untitled video';
    const desc = description || video?.description || '';
    const glyph = tasteProfile?.glyph ? `Glyph ${tasteProfile.glyph}` : null;
    const tones = tasteProfile?.aestheticPatterns?.dominantTones?.slice(0, 3) || [];
    const hooks = tasteProfile?.performancePatterns?.hooks?.slice(0, 2) || [];

    const styleBits = [
      glyph && `style: ${glyph}`,
      hooks.length ? `hooks: ${hooks.join(', ')}` : null,
      tones.length ? `tones: ${tones.join(', ')}` : null,
      'avoid generic intros; lead with a sharp, specific hook',
      'keep description concise but vivid; no fluff',
    ].filter(Boolean).join(' · ');

    const base = desc ? `${baseTitle} — ${desc}` : baseTitle;
    return `${base} || ${styleBits}`;
  };

  // AI Generation
  const handleGenerateAI = async (topicOverride = null, highSignal = false) => {
    const topic =
      topicOverride ??
      (aiTopic.trim() || title || description || 'taste-aligned ideas');
    if (!topic) return;
    setGenerating(true);
    try {
      const result = await intelligenceApi.generateYouTube(topic, {
        videoType: aiVideoType,
        count: highSignal ? 7 : 5,
        profileId: currentProfileId || undefined,
        folioId: activeFolioId || undefined,
        projectId: activeProjectId || undefined,
        tasteContext: tasteProfile ? {
          glyph: tasteProfile.glyph,
          tones: tasteProfile?.aestheticPatterns?.dominantTones,
          hooks: tasteProfile?.performancePatterns?.hooks,
          confidence: tasteProfile?.confidence,
        } : undefined,
        directives: highSignal
          ? [
              'Avoid generic YouTube intros',
              'Lead with a specific, high-signal hook',
              'Match glyph/archetype voice; keep titles tight',
              'Descriptions should be vivid, concise, and reflect saved collections taste',
            ]
          : undefined,
        avant: highSignal, // use avant stack for dice/high-signal runs
      });
      const variants = result.variants || [];
      setAiVariants(variants);

      // Auto-apply the first (best) variant
      if (variants.length > 0) {
        const best = variants[0];
        setTitle(best.title);
        setDescription(best.description);
        persistVideoUpdates({
          title: best.title,
          description: best.description,
        });
      }
    } catch (error) {
      console.error('AI generation error:', error);
    } finally {
      setGenerating(false);
    }
  };

  const applyAIVariant = (variant) => {
    setTitle(variant.title);
    setDescription(variant.description);
    persistVideoUpdates({
      title: variant.title,
      description: variant.description,
    });
    setShowAIPanel(false);
    setAiVariants([]);
  };

  const handleRateVariant = async (variant, rating) => {
    try {
      await intelligenceApi.rate(
        {
          variant: variant.title,
          hookType: variant.hookType,
          tone: variant.tone,
          performanceScore: variant.performanceScore,
          tasteScore: variant.tasteScore,
        },
        rating,
        {},
        {
          topic: aiTopic,
          platform: 'youtube',
          source: 'local',
          folioId: activeFolioId || undefined,
          projectId: activeProjectId || undefined,
        },
        false,
        currentProfileId || null
      );
    } catch (error) {
      console.error('Failed to save rating:', error);
    }
  };

  const titleLength = title.length;
  const isTitleLong = titleLength > TITLE_VISIBLE;
  const truncatedTitle = isTitleLong ? title.slice(0, TITLE_VISIBLE) + '...' : title;
  const scheduledSummary = scheduledDate
    ? formatScheduleSummary(new Date(`${scheduledDate}T${scheduledTime || '12:00'}`))
    : null;
  const visibilityLabel = VISIBILITY_OPTIONS.find((option) => option.value === privacyStatus)?.label || 'Public';

  return (
    <div className="h-full bg-dark-800 rounded-2xl border border-dark-700 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-dark-100">Video Details</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 text-dark-400 hover:text-dark-200 hover:bg-dark-700 rounded-lg transition-colors"
            title="Delete video"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Thumbnail Preview */}
        <div className="relative aspect-video bg-black rounded-lg overflow-hidden group">
          {video.thumbnail ? (
            <img
              src={video.thumbnail}
              alt={video.title || 'Video thumbnail'}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Image className="w-12 h-12 text-dark-500" />
            </div>
          )}

          {/* Hover Overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <button
              onClick={() => setShowYoutubePreview(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors"
            >
              <Eye className="w-4 h-4 text-white" />
              <span className="text-white font-medium text-sm">Preview</span>
            </button>
            <label className="flex items-center gap-2 px-4 py-2 bg-white/20 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors cursor-pointer">
              <Upload className="w-4 h-4 text-white" />
              <span className="text-white font-medium text-sm">
                {video.thumbnail ? 'Replace' : 'Upload'}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleThumbnailChange}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-1 ${
            assetState === 'ready'
              ? 'bg-dark-100/15 text-dark-100'
              : assetState === 'processing'
                ? 'bg-blue-500/15 text-blue-200'
                : assetState === 'errored'
                  ? 'bg-red-500/15 text-red-200'
                  : 'bg-dark-700 text-dark-300'
          }`}>
            {assetState === 'ready'
              ? `Video ready${durationLabel !== '0:00' ? ` • ${durationLabel}` : ''}`
              : assetState === 'processing'
                ? 'Video processing'
                : assetState === 'errored'
                  ? 'Video failed'
                  : 'Thumbnail-only draft'}
          </span>
          <span className={`rounded-full px-2 py-1 ${
            video.thumbnailStatus === 'custom'
              ? 'bg-dark-100/15 text-dark-100'
              : video.thumbnailStatus === 'needs_custom'
                ? 'bg-amber-500/15 text-amber-300'
                : 'bg-dark-700 text-dark-300'
          }`}>
            {video.thumbnailStatus === 'custom'
              ? 'Custom thumbnail'
              : video.thumbnailStatus === 'needs_custom'
                ? 'Custom thumbnail recommended'
                : video.thumbnailStatus === 'auto'
                  ? 'Video-frame thumbnail'
                  : 'Thumbnail missing'}
          </span>
        </div>

        <div className="relative rounded-2xl border border-dark-700 bg-dark-900/30 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.16em] text-dark-500">Release</p>
              <p className="mt-1 text-sm font-medium text-dark-100">
                {scheduledSummary || 'Not scheduled'}
              </p>
              <p className="mt-1 text-xs text-dark-300">
                Visibility: <span className="text-dark-100">{visibilityLabel}</span>
              </p>
              <p className="mt-1 text-xs text-dark-400">
                {scheduledSummary
                  ? `This is when Slayt will send the upload as ${visibilityLabel.toLowerCase()}.`
                  : hasVideoAsset
                    ? `Pick a day and time for this ${visibilityLabel.toLowerCase()} upload.`
                    : 'Attach a video to unlock scheduling.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {scheduledSummary && (
                <button
                  type="button"
                  onClick={handleScheduleClear}
                  className="rounded-lg px-3 py-2 text-xs text-dark-300 transition-colors hover:bg-dark-700 hover:text-dark-100"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowSchedulePopover((current) => !current)}
                className="rounded-lg bg-dark-100 px-3 py-2 text-xs font-medium text-dark-900 transition-colors hover:bg-white"
              >
                {scheduledSummary ? 'Reschedule' : 'Schedule'}
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-dark-700/60 bg-black/40 px-3 py-2">
            <span className="text-xs font-medium text-dark-400">Visibility</span>
            <select
              value={privacyStatus}
              onChange={(event) => handleVisibilityChange(event.target.value)}
              className="min-w-[8.5rem] appearance-none rounded-lg border border-dark-700/70 bg-black px-2.5 py-1.5 text-sm text-dark-100 focus:outline-none focus:border-dark-500"
              style={{ colorScheme: 'dark' }}
              title="Choose how this video will appear on YouTube"
            >
              {VISIBILITY_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  style={{ backgroundColor: '#000000', color: '#f5f5f5' }}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <YouTubeSchedulePopover
            isOpen={showSchedulePopover}
            scheduledDate={scheduledDate}
            scheduledTime={scheduledTime}
            canSchedule={hasVideoAsset}
            onApply={handleScheduleApply}
            onClear={handleScheduleClear}
            onClose={() => setShowSchedulePopover(false)}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => onCopyVideo?.(video)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-dark-200 rounded-lg text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Video</span>
          </button>
          <button
            type="button"
            onClick={() => onCutVideo?.(video)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-dark-200 rounded-lg text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Cut Video</span>
          </button>
          <button
            type="button"
            onClick={() => onPasteVideo?.()}
            disabled={!videoClipboard?.payload}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-100 hover:bg-white text-dark-900 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span>Paste to Collection</span>
          </button>
        </div>

        {videoClipboard?.payload && (
          <div className="rounded-lg border border-dark-600 bg-dark-700/60 px-3 py-2">
            <p className="text-xs text-dark-300">
              {videoClipboard.mode === 'cut' ? 'Cut' : 'Copied'} video ready
              {videoClipboard.sourceCollectionName ? ` from ${videoClipboard.sourceCollectionName}` : ''}.
            </p>
            <p className="text-xs text-dark-500 truncate">
              {videoClipboard.sourceVideoTitle || 'Untitled video'}
            </p>
          </div>
        )}

        {/* Video File Upload */}
        <div
          className={`bg-dark-700 rounded-lg border transition-colors ${
            isDraggingVideoFile ? 'border-dark-100 bg-dark-650' : 'border-dark-600'
          }`}
          onDragEnter={handleVideoFileDragEnter}
          onDragOver={handleVideoFileDragOver}
          onDragLeave={handleVideoFileDragLeave}
          onDrop={handleVideoFileDrop}
        >
          <button
            onClick={() => setShowVideoFile(!showVideoFile)}
            className="w-full flex items-center justify-between p-3 hover:bg-dark-650 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Youtube className="w-4 h-4 text-dark-300" />
              <span className="text-sm font-medium text-dark-200">Video File</span>
              {video.videoFileName && (
                <span className="text-xs text-dark-400">
                  ({video.videoFileSize ? `${(video.videoFileSize / 1024 / 1024).toFixed(1)} MB` : 'Uploaded'}{video.durationSeconds ? ` • ${durationLabel}` : ''}{assetState === 'processing' ? ' • Processing' : ''})
                </span>
              )}
            </div>
            <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${showVideoFile ? 'rotate-180' : ''}`} />
          </button>

          {showVideoFile && (
            <div className="p-3 pt-0">
              <div className="relative">
                {video.videoFileName ? (
                  <div className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                    isDraggingVideoFile ? 'bg-dark-700' : 'bg-dark-800'
                  }`}>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Check className="w-4 h-4 text-dark-100 flex-shrink-0" />
                      <span className="text-sm text-dark-200 truncate">
                        {video.videoFileName}
                        {assetState === 'processing' ? ' (processing)' : ''}
                      </span>
                    </div>
                    <label className="ml-2 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 rounded-lg transition-colors cursor-pointer flex-shrink-0">
                      <span className="text-xs text-dark-300">Replace</span>
                      <input
                        ref={videoFileInputRef}
                        type="file"
                        accept="video/*"
                        onChange={handleVideoFileChange}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleRemoveVideoAttachment}
                      className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-dark-700 text-dark-300 transition-colors hover:bg-dark-600 hover:text-dark-100"
                      title="Remove uploaded video"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg transition-colors cursor-pointer group ${
                    isDraggingVideoFile
                      ? 'border-dark-100 bg-dark-700/70'
                      : 'border-dark-600 hover:border-dark-500/50 hover:bg-dark-600/50'
                  }`}>
                    <Upload className="w-8 h-8 text-dark-500 group-hover:text-dark-200 mb-2" />
                    <span className="text-sm text-dark-300 group-hover:text-dark-200 mb-1">
                      {video.thumbnail ? 'Attach video to this thumbnail' : 'Upload Video File'}
                    </span>
                    <span className="text-xs text-dark-500">
                      Click or drag a video here. Large files upload directly when available.
                    </span>
                    <input
                      ref={videoFileInputRef}
                      type="file"
                      accept="video/*"
                      onChange={handleVideoFileChange}
                      className="hidden"
                    />
                  </label>
                )}

                {video.videoFileName && (
                  <p className="mt-2 text-xs text-dark-500">
                    Click <span className="text-dark-300">Replace</span> or drag a new video onto this panel to swap the current file.
                  </p>
                )}

                {videoUploadProgress && (
                  <div className={`mt-3 rounded-lg border px-3 py-2 ${
                    videoUploadProgress.phase === 'error'
                      ? 'border-red-500/30 bg-red-500/10'
                      : 'border-dark-600 bg-dark-800/80'
                  }`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${
                          videoUploadProgress.phase === 'error' ? 'text-red-200' : 'text-dark-100'
                        }`}>
                          {videoUploadProgress.label}
                        </p>
                        <p className={`text-xs ${
                          videoUploadProgress.phase === 'error' ? 'text-red-300/80' : 'text-dark-400'
                        }`}>
                          {videoUploadProgress.details}
                        </p>
                      </div>
                      {videoUploadProgress.phase === 'uploading' && (
                        <span className="text-xs text-dark-300 tabular-nums">
                          {Math.round(videoUploadProgress.percent || 0)}%
                        </span>
                      )}
                      {videoUploadProgress.phase === 'processing' && (
                        <RefreshCw className="w-4 h-4 text-dark-300 animate-spin" />
                      )}
                    </div>
                    {videoUploadProgress.phase !== 'error' && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-dark-700">
                        <div
                          className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                            videoUploadProgress.phase === 'processing'
                              ? 'w-full animate-pulse bg-dark-300'
                              : 'bg-dark-100'
                          }`}
                          style={videoUploadProgress.phase === 'processing'
                            ? undefined
                            : { width: `${Math.max(6, videoUploadProgress.percent || 0)}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {isDraggingVideoFile && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-dark-100 bg-dark-900/90 backdrop-blur-sm">
                    <div className="text-center px-4">
                      <Upload className="w-8 h-8 text-dark-100 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-dark-100">
                        {video.videoFileName
                          ? 'Drop to replace video'
                          : video.thumbnail
                            ? 'Drop to attach video'
                            : 'Drop to add video'}
                      </p>
                      <p className="text-xs text-dark-400 mt-1">
                        This drop zone only updates the current video card.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Artist Name */}
        <div className="relative">
          <label className="flex items-center gap-2 text-xs font-medium text-dark-400 mb-1.5">
            Artist
          </label>
          <input
            ref={artistInputRef}
            type="text"
            value={artistName}
            onChange={(e) => {
              setArtistName(e.target.value);
              setShowArtistSuggestions(true);
              if (videoId) updateYoutubeVideo(videoId, { artistName: e.target.value });
            }}
            onFocus={() => setShowArtistSuggestions(true)}
            onBlur={() => {
              // Delay so click on suggestion registers before blur hides it
              setTimeout(() => setShowArtistSuggestions(false), 150);
              persistVideoUpdates({ artistName });
              lastSavedRef.current = { ...lastSavedRef.current, artistName };
            }}
            placeholder="Artist name (optional)"
            className="input w-full text-sm"
          />
          {/* Artist suggestions dropdown */}
          {showArtistSuggestions && (() => {
            const uniqueNames = [...new Set(
              youtubeVideos
                .map(v => v.artistName)
                .filter(n => n && n.trim() && n !== artistName)
            )];
            const filtered = artistName
              ? uniqueNames.filter(n => n.toLowerCase().includes(artistName.toLowerCase()))
              : uniqueNames;
            if (filtered.length === 0) return null;
            return (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-dark-800 border border-dark-600 rounded-lg shadow-xl overflow-hidden max-h-32 overflow-y-auto">
                {filtered.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setArtistName(name);
                      setShowArtistSuggestions(false);
                      if (videoId) updateYoutubeVideo(videoId, { artistName: name });
                      persistVideoUpdates({ artistName: name });
                      lastSavedRef.current = { ...lastSavedRef.current, artistName: name };
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm text-dark-200 hover:bg-dark-700 transition-colors truncate"
                  >
                    {name}
                  </button>
                ))}
              </div>
            );
          })()}
          {artistName && title && (
            <p className="text-xs text-dark-400 mt-1 truncate">
              Preview: <span className="text-dark-200">{artistName} - {title}</span>
            </p>
          )}
        </div>

        {/* Title */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-sm font-medium text-dark-200">
              <Type className="w-4 h-4" />
              Title
            </label>
            <button
              onClick={() => setShowTruncatePreview(!showTruncatePreview)}
              className={`flex items-center gap-1 text-xs transition-colors ${
                showTruncatePreview ? 'text-dark-300' : 'text-dark-400 hover:text-dark-200'
              }`}
              title="Preview how title appears in search"
            >
              {showTruncatePreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              <span>Search preview</span>
            </button>
          </div>

          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            onBlur={handleTitleBlur}
            placeholder="Enter video title..."
            className="input w-full"
            maxLength={TITLE_MAX}
          />

          {/* Character Count */}
          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-2">
              <span className={`text-xs ${titleLength > TITLE_VISIBLE ? 'text-amber-400' : 'text-dark-500'}`}>
                {titleLength}/{TITLE_MAX}
              </span>
              {isTitleLong && (
                <span className="text-xs text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Title will be truncated in search
                </span>
              )}
            </div>
          </div>

          {/* Truncated Preview */}
          {showTruncatePreview && isTitleLong && (
            <div className="mt-2 p-3 bg-dark-700 rounded-lg">
              <p className="text-xs text-dark-400 mb-1">How it appears in search results:</p>
              <p className="text-sm text-dark-100">{truncatedTitle}</p>
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <button
            onClick={() => setShowDescription(!showDescription)}
            className="w-full flex items-center justify-between mb-2 hover:opacity-80 transition-opacity"
          >
            <label className="flex items-center gap-2 text-sm font-medium text-dark-200 cursor-pointer">
              <FileText className="w-4 h-4" />
              Description
            </label>
            <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${showDescription ? 'rotate-180' : ''}`} />
          </button>
          {showDescription && (
            <textarea
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              onBlur={handleDescriptionBlur}
              placeholder="Add a description (optional)..."
              className="input w-full min-h-[200px] resize-y"
            />
          )}
        </div>

        {/* Taste Feedback */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-dark-400">Feedback to Taste Genome:</span>
          <button
            type="button"
            onClick={() => sendTasteSignal('dislike', 'dislike')}
            disabled={sendingFeedback}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-dark-700 hover:bg-dark-600 text-xs text-white disabled:opacity-50"
            title="Dislike this suggestion"
          >
            <ThumbsDown className="w-3.5 h-3.5" />
            Dislike
          </button>
          <button
            type="button"
            onClick={() => sendTasteSignal('skip', 'skip')}
            disabled={sendingFeedback}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-dark-700 hover:bg-dark-600 text-xs text-white disabled:opacity-50"
            title="Skip this video"
          >
            <SkipForward className="w-3.5 h-3.5" />
            Skip
          </button>
        </div>

        {/* AI Generation */}
        <div className="border-t border-dark-700 pt-4">
          <button
            onClick={() => setShowAIPanel(!showAIPanel)}
            className="w-full flex items-center justify-between px-3 py-2 bg-dark-700 hover:bg-dark-600 border border-dark-600 rounded-lg transition-colors"
          >
            <span className="text-sm font-medium text-dark-200">AI Generate</span>
            <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${showAIPanel ? 'rotate-180' : ''}`} />
          </button>

          {showAIPanel && (
            <div className="mt-2 p-3 bg-dark-750 rounded-lg space-y-2">
              <input
                type="text"
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                placeholder="Topic or keywords..."
                className="input w-full text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleGenerateAI()}
              />
              <div className="flex gap-2">
                <select
                  value={aiVideoType}
                  onChange={(e) => setAiVideoType(e.target.value)}
                  className="input text-sm flex-1"
                >
                  <option value="short">Short</option>
                  <option value="standard">Standard</option>
                  <option value="long">Long-form</option>
                  <option value="tutorial">Tutorial</option>
                  <option value="vlog">Vlog</option>
                </select>
                <button
                  onClick={() => handleGenerateAI()}
                  disabled={generating || (!aiTopic.trim() && !title && !description)}
                  className="px-3 py-1.5 bg-dark-600 hover:bg-dark-500 text-dark-200 rounded-lg transition-colors disabled:opacity-50 text-sm font-medium"
                >
                  {generating ? 'Generating...' : 'Generate'}
                </button>
              </div>

              {/* AI Results */}
              {aiVariants.length > 0 && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto mt-2">
                  <p className="text-xs text-dark-400 mb-1">Select a variant:</p>
                  {aiVariants.map((variant, i) => (
                    <div
                      key={i}
                      className="p-2 bg-dark-700 hover:bg-dark-600 rounded border border-dark-600 hover:border-dark-500 transition-colors cursor-pointer"
                      onClick={() => applyAIVariant(variant)}
                    >
                      <p className="text-sm text-dark-100 font-medium mb-0.5 line-clamp-1">{variant.title}</p>
                      <p className="text-xs text-dark-400 line-clamp-1">{variant.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-1.5 py-0.5 bg-dark-600 text-dark-300 rounded text-xs">
                          {variant.hookType}
                        </span>
                        <span className="text-xs text-dark-500">{variant.performanceScore}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-dark-200 mb-2">
            <Clock className="w-4 h-4" />
            Status
          </label>
          <div className="flex gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleStatusChange(opt.value)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  status === opt.value
                    ? `${opt.color} text-white`
                    : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-dark-800 rounded-xl border border-dark-700 w-full max-w-sm mx-4 p-4">
            <h3 className="text-lg font-semibold text-dark-100 mb-2">Delete Video</h3>
            <p className="text-dark-400 text-sm mb-4">
              Are you sure you want to delete "{title || 'this video'}"? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-dark-600/30 text-dark-300 rounded-lg hover:bg-dark-600/40 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* YouTube Preview Modal */}
      {showYoutubePreview && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center overflow-y-auto"
          onClick={() => { setShowYoutubePreview(false); setPreviewPlaying(false); }}
        >
          {/* YouTube watch page container — matches real YT main column width */}
          <div
            className="w-full max-w-[854px] my-6 bg-[#0f0f0f] rounded-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Player — 16:9 at 854px = 480px, same as YouTube 480p player */}
            <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>
              {previewPlaying && isVideoReady ? (
                /* Playing state — real video with controls */
                <video
                  ref={previewVideoRef}
                  src={isVideoReady ? video.videoUrl || '' : ''}
                  poster={video.thumbnail || undefined}
                  controls
                  autoPlay
                  className="w-full h-full bg-black"
                />
              ) : (
                /* Thumbnail state — click to play if video exists */
                <>
                  {video.thumbnail ? (
                    <img
                      src={video.thumbnail}
                      alt={title || 'Video'}
                      className="w-full h-full object-contain bg-black"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#1a1a1a]">
                      <Youtube className="w-20 h-20 text-[#ff0000]/30" />
                    </div>
                  )}
                  {/* Play button — clickable when a playable preview is ready */}
                  {(video.thumbnail || isVideoReady) && (
                    <div
                      className={`absolute inset-0 flex items-center justify-center ${isVideoReady ? 'cursor-pointer' : 'pointer-events-none'}`}
                      onClick={() => { if (isVideoReady) setPreviewPlaying(true); }}
                    >
                      <div className="w-[68px] h-[48px] rounded-xl bg-[#ff0000]/90 flex items-center justify-center hover:bg-[#ff0000] transition-colors">
                        <div className="w-0 h-0 ml-1 border-t-[10px] border-t-transparent border-b-[10px] border-b-transparent border-l-[18px] border-l-white" />
                      </div>
                    </div>
                  )}
                </>
              )}
              {/* Progress bar */}
              {!previewPlaying && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#3d3d3d]">
                  <div className="h-full w-0 bg-[#ff0000]" />
                </div>
              )}
            </div>

            {/* Video Info */}
            <div className="px-4 pt-3 pb-4">
              <h1 className="text-xl font-semibold text-white leading-snug mb-3">
                {artistName ? `${artistName} - ${title}` : title || 'Untitled Video'}
              </h1>

              {/* Channel Row */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#3d3d3d] overflow-hidden flex-shrink-0">
                  {(currentProfile?.avatar || user?.avatar) ? (
                    <img
                      src={currentProfile?.avatar || user?.avatar}
                      alt="Channel"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#aaa] text-sm font-bold">
                      {(currentProfile?.name || user?.brandName || user?.name || 'Y').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {currentProfile?.name || user?.brandName || user?.name || 'Your Channel'}
                  </p>
                  <p className="text-xs text-[#aaa]">1.2K subscribers</p>
                </div>
                <button className="px-4 py-2 bg-white text-[#0f0f0f] rounded-full text-sm font-medium flex-shrink-0">
                  Subscribe
                </button>
              </div>

              {/* Description Card */}
              <div className="bg-[#272727] rounded-xl p-3">
                <div className="flex items-center gap-2 text-xs text-[#aaa] mb-1.5">
                  <span>0 views</span>
                  <span>&middot;</span>
                  <span>{video.scheduledDate ? new Date(video.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Just now'}</span>
                  {video.status === 'scheduled' && (
                    <>
                      <span>&middot;</span>
                      <span className="text-blue-400">Scheduled</span>
                    </>
                  )}
                </div>
                {description ? (
                  <p className="text-sm text-[#e0e0e0] whitespace-pre-wrap">
                    {description}
                  </p>
                ) : (
                  <p className="text-sm text-[#717171] italic">No description</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default YouTubeVideoDetails;
