import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { intelligenceApi, youtubeApi } from '../../lib/api';
import {
  Image,
  Type,
  Calendar,
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
  Sparkles,
  RefreshCw,
  ChevronDown,
  Star,
  Check,
  Dice5,
  ThumbsDown,
  SkipForward,
  X,
} from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft', color: 'bg-gray-500' },
  { value: 'scheduled', label: 'Scheduled', color: 'bg-blue-500' },
  { value: 'published', label: 'Published', color: 'bg-dark-100' },
];

// YouTube title character limits
const TITLE_MAX = 100;
const TITLE_VISIBLE = 60; // Characters visible in search results

function YouTubeVideoDetails({
  video,
  onThumbnailUpload,
  thumbnailClipboard,
  onCopyThumbnail,
  onCutThumbnail,
  onPasteThumbnail,
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
  const [scheduledDate, setScheduledDate] = useState(video?.scheduledDate || '');
  const [scheduledTime, setScheduledTime] = useState(video?.scheduledTime || '12:00');
  const [showTruncatePreview, setShowTruncatePreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showYoutubePreview, setShowYoutubePreview] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewVideoRef = useRef(null);
  const [showVideoFile, setShowVideoFile] = useState(true);
  const [showDescription, setShowDescription] = useState(true);
  const [showSchedule, setShowSchedule] = useState(true);

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
      setScheduledDate(video.scheduledDate || '');
      setScheduledTime(video.scheduledTime || '12:00');
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
      </div>
    );
  }

  // Persist updates to the backend and keep local state in sync
  const persistVideoUpdates = async (updates) => {
    if (!videoId) return;

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
      }
    } catch (error) {
      console.error('Failed to save YouTube video update:', error);
    }
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

  const handleStatusChange = (newStatus) => {
    setStatus(newStatus);
    persistVideoUpdates({ status: newStatus });
  };

  const handleScheduleChange = () => {
    const nextStatus = scheduledDate ? 'scheduled' : status;
    setStatus(nextStatus);
    persistVideoUpdates({
      scheduledDate,
      scheduledTime,
      status: nextStatus,
    });
  };

  const handleThumbnailChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onThumbnailUpload?.(file, videoId);
    }
    e.target.value = '';
  };

  const handleVideoFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // TODO: Upload video file to Cloudinary or storage
      // For now, just save the file name
      persistVideoUpdates({ videoFileName: file.name, videoFileSize: file.size });
      console.log('Video file selected:', file.name, file.size);
    }
    e.target.value = '';
  };

  const handleDelete = () => {
    deleteYoutubeVideo(videoId);
    setShowDeleteConfirm(false);
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

  return (
    <div className="h-full bg-dark-800 rounded-2xl border border-dark-700 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-dark-100">Video Details</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowAIPanel(true);
              const prompt = buildTastePrompt();
              if (!generating) {
                handleGenerateAI(prompt, true);
              }
            }}
            disabled={generating}
            className="p-1.5 text-dark-400 hover:text-dark-200 hover:bg-dark-700 rounded-lg transition-colors disabled:opacity-50"
            title="Quick generate"
          >
            <Sparkles className="w-4 h-4" />
          </button>
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onCopyThumbnail?.(video)}
            disabled={!video.thumbnail}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-dark-200 rounded-lg text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy</span>
          </button>
          <button
            type="button"
            onClick={() => onCutThumbnail?.(video)}
            disabled={!video.thumbnail}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-dark-200 rounded-lg text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Cut</span>
          </button>
          <button
            type="button"
            onClick={() => onPasteThumbnail?.(video)}
            disabled={!thumbnailClipboard?.thumbnail}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-100 hover:bg-white text-dark-900 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span>Paste</span>
          </button>
        </div>

        {thumbnailClipboard?.thumbnail && (
          <div className="rounded-lg border border-dark-600 bg-dark-700/60 px-3 py-2">
            <p className="text-xs text-dark-300">
              {thumbnailClipboard.mode === 'cut' ? 'Cut' : 'Copied'} thumbnail ready
              {thumbnailClipboard.sourceCollectionName ? ` from ${thumbnailClipboard.sourceCollectionName}` : ''}.
            </p>
            <p className="text-xs text-dark-500 truncate">
              {thumbnailClipboard.sourceVideoTitle || 'Untitled video'}
            </p>
          </div>
        )}

        {/* Video File Upload */}
        <div className="bg-dark-700 rounded-lg border border-dark-600">
          <button
            onClick={() => setShowVideoFile(!showVideoFile)}
            className="w-full flex items-center justify-between p-3 hover:bg-dark-650 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Youtube className="w-4 h-4 text-dark-300" />
              <span className="text-sm font-medium text-dark-200">Video File</span>
              {video.videoFileName && (
                <span className="text-xs text-dark-400">
                  ({(video.videoFileSize / 1024 / 1024).toFixed(1)} MB)
                </span>
              )}
            </div>
            <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${showVideoFile ? 'rotate-180' : ''}`} />
          </button>

          {showVideoFile && (
            <div className="p-3 pt-0">

          {video.videoFileName ? (
            <div className="flex items-center justify-between p-3 bg-dark-800 rounded-lg">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Check className="w-4 h-4 text-dark-100 flex-shrink-0" />
                <span className="text-sm text-dark-200 truncate">{video.videoFileName}</span>
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
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-dark-600 rounded-lg hover:border-dark-500/50 hover:bg-dark-600/50 transition-colors cursor-pointer group">
              <Upload className="w-8 h-8 text-dark-500 group-hover:text-dark-200 mb-2" />
              <span className="text-sm text-dark-300 group-hover:text-dark-200 mb-1">
                Upload Video File
              </span>
              <span className="text-xs text-dark-500">
                MP4, MOV, AVI (max 256GB)
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

        {/* Schedule */}
        <div>
          <button
            onClick={() => setShowSchedule(!showSchedule)}
            className="w-full flex items-center justify-between mb-2 hover:opacity-80 transition-opacity"
          >
            <label className="flex items-center gap-2 text-sm font-medium text-dark-200 cursor-pointer">
              <Calendar className="w-4 h-4" />
              Schedule
              {scheduledDate && (
                <span className="text-xs text-dark-400">
                  ({new Date(scheduledDate).toLocaleDateString()})
                </span>
              )}
            </label>
            <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${showSchedule ? 'rotate-180' : ''}`} />
          </button>
          {showSchedule && (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                onBlur={handleScheduleChange}
                className="input"
                min={new Date().toISOString().split('T')[0]}
              />
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                onBlur={handleScheduleChange}
                className="input"
              />
            </div>
          )}
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
              {previewPlaying && video.videoFileName ? (
                /* Playing state — real video with controls */
                <video
                  ref={previewVideoRef}
                  src={video.videoUrl || ''}
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
                  {/* Play button — clickable when video exists, decorative when thumbnail only */}
                  {(video.thumbnail || video.videoFileName) && (
                    <div
                      className={`absolute inset-0 flex items-center justify-center ${video.videoFileName ? 'cursor-pointer' : 'pointer-events-none'}`}
                      onClick={() => { if (video.videoFileName) setPreviewPlaying(true); }}
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
