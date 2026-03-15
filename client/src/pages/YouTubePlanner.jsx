import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { youtubeApi } from '../lib/api';
import CruciblaProjectPicker from '../components/CruciblaProjectPicker';
import { compressImage } from '../lib/imageUtils';
import { extractVideoFrame, hasPlannerVideoAttachment } from '../lib/videoUtils';
import { buildYoutubeUploadTitle } from '../lib/youtubeUploadTitle';
import {
  getCollectionDescriptionTemplate,
  renderYoutubeDescriptionTemplate,
} from '../lib/youtubeDescriptionTemplate';
import { getYoutubeThumbnailWarning } from '../lib/youtubeThumbnailWarnings';
import YouTubeGridView from '../components/youtube/YouTubeGridView';
import YouTubeSidebarView from '../components/youtube/YouTubeSidebarView';
import YouTubeVideoDetails from '../components/youtube/YouTubeVideoDetails';
import YouTubeThumbnailEditor from '../components/youtube/YouTubeThumbnailEditor';
import YouTubeCollectionsManager from '../components/youtube/YouTubeCollectionsManager';
import YouTubeBulkReplace from '../components/youtube/YouTubeBulkReplace';
import YouTubeCollectionScheduleModal from '../components/youtube/YouTubeCollectionScheduleModal';
import {
  Lock,
  Unlock,
  Upload,
  Loader2,
  LayoutGrid,
  List,
  Download,
  Youtube,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  FolderOpen,
  Copy,
  Palette,
  Link2,
  Unlink,
  RefreshCw,
  AlertCircle,
  History,
  Images,
  Package,
  Calendar,
} from 'lucide-react';

// Preset colors for collections
const COLLECTION_COLORS = [
  { id: 'purple', value: '#8b5cf6', name: 'Purple' },
  { id: 'blue', value: '#3b82f6', name: 'Blue' },
  { id: 'green', value: '#10b981', name: 'Green' },
  { id: 'orange', value: '#f97316', name: 'Orange' },
  { id: 'pink', value: '#ec4899', name: 'Pink' },
  { id: 'indigo', value: '#6366f1', name: 'Indigo' },
  { id: 'teal', value: '#14b8a6', name: 'Teal' },
  { id: 'amber', value: '#f59e0b', name: 'Amber' },
  { id: 'red', value: '#ef4444', name: 'Red' },
  { id: 'cyan', value: '#06b6d4', name: 'Cyan' },
];

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

const createUploadProgressState = () => ({
  current: 0,
  total: 0,
  percent: 0,
  fileName: '',
  details: '',
  label: 'Uploading',
});

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

function YouTubePlanner() {
  const youtubeVideos = useAppStore((state) => state.youtubeVideos);
  const addYoutubeVideo = useAppStore((state) => state.addYoutubeVideo);
  const updateYoutubeVideo = useAppStore((state) => state.updateYoutubeVideo);
  const selectedYoutubeVideoId = useAppStore((state) => state.selectedYoutubeVideoId);
  const youtubeViewMode = useAppStore((state) => state.youtubeViewMode);
  const setYoutubeViewMode = useAppStore((state) => state.setYoutubeViewMode);

  // Collections
  const youtubeCollections = useAppStore((state) => state.youtubeCollections);
  const currentYoutubeCollectionId = useAppStore((state) => state.currentYoutubeCollectionId);
  const setYoutubeCollections = useAppStore((state) => state.setYoutubeCollections);
  const addYoutubeCollection = useAppStore((state) => state.addYoutubeCollection);
  const renameYoutubeCollection = useAppStore((state) => state.renameYoutubeCollection);
  const duplicateYoutubeCollection = useAppStore((state) => state.duplicateYoutubeCollection);
  const deleteYoutubeCollection = useAppStore((state) => state.deleteYoutubeCollection);
  const setCurrentYoutubeCollection = useAppStore((state) => state.setCurrentYoutubeCollection);
  const setYoutubeVideos = useAppStore((state) => state.setYoutubeVideos);
  const updateCollectionColor = useAppStore((state) => state.updateCollectionColor);
  const assignCollectionToRollout = useAppStore((state) => state.assignCollectionToRollout);
  const unassignCollectionFromRollout = useAppStore((state) => state.unassignCollectionFromRollout);

  // Rollouts for assignment
  const rollouts = useAppStore((state) => state.rollouts);

  const [isLocked, setIsLocked] = useState(() => {
    // Load from localStorage, default to false (unlocked)
    const saved = localStorage.getItem('youtubeGridLocked');
    return saved === 'true';
  });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(createUploadProgressState);
  const [editingThumbnail, setEditingThumbnail] = useState(null);
  const [editingThumbnailSourceFilename, setEditingThumbnailSourceFilename] = useState('');
  const [editingVideoId, setEditingVideoId] = useState(null);
  const [showBulkReplace, setShowBulkReplace] = useState(false);
  const [showCollectionSchedule, setShowCollectionSchedule] = useState(false);
  const [collectionScheduling, setCollectionScheduling] = useState(false);
  const [bulkReplaceScope, setBulkReplaceScope] = useState('collection');
  const [collectionsCollapsed, setCollectionsCollapsed] = useState(false);
  const [videoClipboard, setVideoClipboard] = useState(null);
  const [thumbnailPreference, setThumbnailPreference] = useState(() => {
    return localStorage.getItem('youtubeThumbnailPreference') || 'custom';
  });
  const [plannerNotices, setPlannerNotices] = useState([]);
  const plannerNoticeTimeoutsRef = useRef(new Map());
  const videoStatusSnapshotRef = useRef(new Map());

  // Loading and error states for cloud sync
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);

  // Versions state
  const [showVersionsDropdown, setShowVersionsDropdown] = useState(false);
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionName, setVersionName] = useState('');
  const versionsDropdownRef = useRef(null);

  // Collections dropdown state
  const [showCollectionsDropdown, setShowCollectionsDropdown] = useState(false);
  const [editingCollectionId, setEditingCollectionId] = useState(null);
  const [editingCollectionName, setEditingCollectionName] = useState('');
  const [showColorPickerFor, setShowColorPickerFor] = useState(null);
  const [showRolloutPickerFor, setShowRolloutPickerFor] = useState(null);
  const [showCruciblaPickerFor, setShowCruciblaPickerFor] = useState(null);
  const [cruciblaPickerAnchorEl, setCruciblaPickerAnchorEl] = useState(null);
  const collectionsDropdownRef = useRef(null);

  // Get videos by collection for showing counts
  const youtubeVideosByCollection = useAppStore((state) => state.youtubeVideosByCollection);

  // Persist isLocked state to localStorage
  useEffect(() => {
    localStorage.setItem('youtubeGridLocked', isLocked.toString());
  }, [isLocked]);

  useEffect(() => {
    localStorage.setItem('youtubeThumbnailPreference', thumbnailPreference);
  }, [thumbnailPreference]);

  // Get current collection - use _id for backend collections
  const currentCollection = youtubeCollections?.find(c => (c._id || c.id) === currentYoutubeCollectionId)
    || youtubeCollections?.[0]
    || { id: 'default', name: 'My Videos' };

  const buildCollectionDescription = useCallback((videoMeta = {}) => (
    renderYoutubeDescriptionTemplate({
      template: getCollectionDescriptionTemplate(currentCollection),
      title: videoMeta.title || '',
      artistName: videoMeta.artistName || '',
      featuringArtists: videoMeta.featuringArtists || [],
      collectionName: currentCollection?.name || '',
    })
  ), [currentCollection]);

  const dismissPlannerNotice = useCallback((noticeId) => {
    setPlannerNotices((current) => current.filter((notice) => notice.id !== noticeId));
    const timeoutId = plannerNoticeTimeoutsRef.current.get(noticeId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      plannerNoticeTimeoutsRef.current.delete(noticeId);
    }
  }, []);

  const pushPlannerNotice = useCallback(({ title, message, tone = 'neutral' }) => {
    const noticeId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setPlannerNotices((current) => [
      ...current.slice(-2),
      { id: noticeId, title, message, tone },
    ]);

    const timeoutId = window.setTimeout(() => {
      setPlannerNotices((current) => current.filter((notice) => notice.id !== noticeId));
      plannerNoticeTimeoutsRef.current.delete(noticeId);
    }, 7000);

    plannerNoticeTimeoutsRef.current.set(noticeId, timeoutId);
  }, []);

  const maybeSendBrowserNotice = useCallback(({ title, message, tag }) => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    if (window.Notification.permission !== 'granted' || !document.hidden) {
      return;
    }

    try {
      new window.Notification(title, {
        body: message,
        tag,
      });
    } catch (error) {
      console.error('Failed to show browser notification:', error);
    }
  }, []);

  const syncPlannerVideoStatusSnapshot = useCallback((videos, { announceChanges = false } = {}) => {
    const previousSnapshot = videoStatusSnapshotRef.current;
    const nextSnapshot = new Map();

    videos.forEach((video) => {
      const videoId = video._id || video.id;
      if (!videoId) {
        return;
      }

      nextSnapshot.set(videoId, {
        status: video.status || 'draft',
        title: video.title || 'Untitled video',
        artistName: video.artistName || '',
        lastError: video.lastError || '',
        youtubeVideoUrl: video.youtubeVideoUrl || '',
      });

      if (!announceChanges) {
        return;
      }

      const previous = previousSnapshot.get(videoId);
      if (!previous || previous.status === video.status) {
        return;
      }

      if (previous.status === 'scheduled' && video.status === 'published') {
        const title = buildYoutubeUploadTitle({
          title: video.title,
          artistName: video.artistName,
          featuringArtists: video.featuringArtists,
          fallbackTitle: 'Untitled video',
        });
        const thumbnailWarning = getYoutubeThumbnailWarning(video.lastError);
        pushPlannerNotice({
          title: thumbnailWarning
            ? 'Published without custom thumbnail'
            : video.lastError
              ? 'YouTube upload complete with warning'
              : 'YouTube upload complete',
          message: thumbnailWarning
            ? `"${title}" uploaded, but YouTube did not apply the custom thumbnail.`
            : video.lastError
            ? `"${title}" uploaded, but ${video.lastError}`
            : `"${title}" is now on YouTube.`,
          tone: (video.lastError || thumbnailWarning) ? 'warning' : 'success',
        });
        maybeSendBrowserNotice({
          title: thumbnailWarning
            ? 'Slayt: Custom thumbnail not applied'
            : video.lastError
              ? 'Slayt: YouTube upload warning'
              : 'Slayt: YouTube upload complete',
          message: thumbnailWarning
            ? title
            : video.lastError ? `${title}: ${video.lastError}` : title,
          tag: `youtube-published-${videoId}`,
        });
      }

      if (previous.status === 'scheduled' && video.status === 'failed') {
        const title = buildYoutubeUploadTitle({
          title: video.title,
          artistName: video.artistName,
          featuringArtists: video.featuringArtists,
          fallbackTitle: 'Untitled video',
        });
        const reason = video.lastError || 'The upload could not be completed.';
        pushPlannerNotice({
          title: 'YouTube upload failed',
          message: `"${title}" failed: ${reason}`,
          tone: 'error',
        });
        maybeSendBrowserNotice({
          title: 'Slayt: YouTube upload failed',
          message: `${title}: ${reason}`,
          tag: `youtube-failed-${videoId}`,
        });
      }
    });

    videoStatusSnapshotRef.current = nextSnapshot;
  }, [maybeSendBrowserNotice, pushPlannerNotice]);

  // Fetch collections from backend
  const fetchCollections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await youtubeApi.getCollections();
      const collections = data.collections || [];

      // Transform backend data to local format
      const transformedCollections = collections.map(c => ({
        ...c,
        id: c._id, // Use _id as id for consistency
        videoCount: c.videoCount || 0,
      }));

      // Update Zustand store
      setYoutubeCollections(transformedCollections);

      // If we have collections and none is selected, select the first one
      if (transformedCollections.length > 0) {
        const currentId = currentYoutubeCollectionId;
        const exists = transformedCollections.some(c => c._id === currentId || c.id === currentId);
        if (!exists) {
          const firstCollection = transformedCollections[0];
          setCurrentYoutubeCollection(firstCollection._id || firstCollection.id);
        }
        // Load videos for current/first collection
        const targetId = exists ? currentId : (transformedCollections[0]._id || transformedCollections[0].id);
        await fetchVideosForCollection(targetId);
      } else {
        // No collections - create a default one
        await handleCreateCollection();
      }
    } catch (err) {
      console.error('Failed to fetch YouTube collections:', err);
      setError('Failed to load collections from cloud. Using local data.');
    } finally {
      setLoading(false);
    }
  }, [currentYoutubeCollectionId]);

  // Fetch videos for a specific collection
  const fetchVideosForCollection = useCallback(async (collectionId, options = {}) => {
    if (!collectionId) return;
    try {
      const data = await youtubeApi.getVideos(collectionId);
      const videos = data.videos || [];

      // Transform backend data
      const transformedVideos = videos.map(v => ({
        ...v,
        id: v._id,
      }));

      syncPlannerVideoStatusSnapshot(transformedVideos, options);
      setYoutubeVideos(transformedVideos);
    } catch (err) {
      console.error('Failed to fetch videos for collection:', err);
    }
  }, [setYoutubeVideos, syncPlannerVideoStatusSnapshot]);

  // Load data on mount
  useEffect(() => {
    fetchCollections();
  }, []);

  // Load videos when collection changes
  useEffect(() => {
    if (currentYoutubeCollectionId && !loading) {
      fetchVideosForCollection(currentYoutubeCollectionId);
    }
  }, [currentYoutubeCollectionId]);

  useEffect(() => {
    return () => {
      plannerNoticeTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      plannerNoticeTimeoutsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!currentYoutubeCollectionId) {
      return undefined;
    }

    const hasScheduledVideos = youtubeVideos.some((video) => video.status === 'scheduled');
    if (!hasScheduledVideos) {
      return undefined;
    }

    let cancelled = false;
    let inFlight = false;

    const pollScheduledVideos = async () => {
      if (cancelled || inFlight) {
        return;
      }

      inFlight = true;
      try {
        await fetchVideosForCollection(currentYoutubeCollectionId, { announceChanges: true });
      } finally {
        inFlight = false;
      }
    };

    const intervalId = window.setInterval(pollScheduledVideos, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [currentYoutubeCollectionId, fetchVideosForCollection, youtubeVideos]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      const clickedInsideCruciblaPicker =
        e.target instanceof Element && Boolean(e.target.closest('[data-crucibla-picker-root="true"]'));

      if (
        collectionsDropdownRef.current &&
        !collectionsDropdownRef.current.contains(e.target) &&
        !clickedInsideCruciblaPicker
      ) {
        setShowCollectionsDropdown(false);
        setEditingCollectionId(null);
        setShowCruciblaPickerFor(null);
        setCruciblaPickerAnchorEl(null);
      }
      if (versionsDropdownRef.current && !versionsDropdownRef.current.contains(e.target)) {
        setShowVersionsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Switch to different collection
  const handleSwitchCollection = useCallback(async (collectionId) => {
    if (collectionId === currentYoutubeCollectionId) {
      setShowCollectionsDropdown(false);
      setShowCruciblaPickerFor(null);
      setCruciblaPickerAnchorEl(null);
      return;
    }
    setCurrentYoutubeCollection(collectionId);
    setShowCollectionsDropdown(false);
    setShowCruciblaPickerFor(null);
    setCruciblaPickerAnchorEl(null);
    // Videos will be loaded by the useEffect
  }, [currentYoutubeCollectionId, setCurrentYoutubeCollection]);

  // Handle create new collection - saves to cloud
  const handleCreateCollection = useCallback(async () => {
    setSyncing(true);
    try {
      const data = await youtubeApi.createCollection({ name: 'New Collection' });
      const newCollection = {
        ...data.collection,
        id: data.collection._id,
        videoCount: 0,
      };

      // Update local state
      setYoutubeCollections([...youtubeCollections, newCollection]);
      setCurrentYoutubeCollection(newCollection._id);
      setYoutubeVideos([]);
      setShowCollectionsDropdown(false);
      setShowCruciblaPickerFor(null);
      setCruciblaPickerAnchorEl(null);
    } catch (err) {
      console.error('Failed to create collection:', err);
      setError('Failed to create collection. Please try again.');
    } finally {
      setSyncing(false);
    }
  }, [youtubeCollections, setYoutubeCollections, setCurrentYoutubeCollection, setYoutubeVideos]);

  // Handle rename collection
  const handleStartRename = useCallback((e, collection) => {
    e.stopPropagation();
    setEditingCollectionId(collection._id || collection.id);
    setEditingCollectionName(collection.name);
  }, []);

  const handleSaveRename = useCallback(async (e) => {
    e.stopPropagation();
    if (editingCollectionName.trim()) {
      setSyncing(true);
      try {
        await youtubeApi.updateCollection(editingCollectionId, { name: editingCollectionName.trim() });
        // Update local state
        setYoutubeCollections(youtubeCollections.map(c =>
          (c._id || c.id) === editingCollectionId ? { ...c, name: editingCollectionName.trim() } : c
        ));
      } catch (err) {
        console.error('Failed to rename collection:', err);
        setError('Failed to rename collection.');
      } finally {
        setSyncing(false);
      }
    }
    setEditingCollectionId(null);
    setEditingCollectionName('');
  }, [editingCollectionId, editingCollectionName, youtubeCollections, setYoutubeCollections]);

  const handleCancelRename = useCallback((e) => {
    e.stopPropagation();
    setEditingCollectionId(null);
    setEditingCollectionName('');
  }, []);

  // Handle duplicate collection - creates a copy in the cloud
  const handleDuplicateCollection = useCallback(async (e, collectionId) => {
    e.stopPropagation();
    setSyncing(true);
    try {
      const sourceCollection = youtubeCollections.find(c => (c._id || c.id) === collectionId);
      if (!sourceCollection) return;

      // Create new collection with copied name
      const data = await youtubeApi.createCollection({
        name: `${sourceCollection.name} (Copy)`,
        color: sourceCollection.color,
        tags: sourceCollection.tags || [],
        descriptionTemplate: sourceCollection.descriptionTemplate,
      });

      const newCollectionId = data.collection._id;

      // Fetch source videos from backend and duplicate them into the new collection
      const sourceData = await youtubeApi.getVideos(collectionId);
        const sourceVideos = sourceData.videos || [];

      for (let i = 0; i < sourceVideos.length; i++) {
        const v = sourceVideos[i];
        await youtubeApi.createVideo({
          title: v.title,
          description: v.description || '',
          thumbnail: v.thumbnail || '',
          thumbnailOriginalUrl: v.thumbnailOriginalUrl || null,
          thumbnailMode: v.thumbnailMode || 'custom',
          thumbnailStatus: v.thumbnailStatus || (v.thumbnail ? 'custom' : 'missing'),
          collectionId: newCollectionId,
          status: v.status || 'draft',
          scheduledDate: v.scheduledDate || null,
          tags: v.tags || [],
          ...buildVideoPersistencePayload(v),
          artistName: v.artistName || '',
          featuringArtists: v.featuringArtists || [],
          endScreenTemplate: v.endScreenTemplate || 'video_subscribe',
          originalFilename: v.originalFilename || '',
          thumbnailSourceFilename: v.thumbnailSourceFilename || '',
          position: i,
        });
      }

      const newCollection = {
        ...data.collection,
        id: newCollectionId,
        videoCount: sourceVideos.length,
      };

      setYoutubeCollections([...youtubeCollections, newCollection]);
      setShowCollectionsDropdown(false);
      setShowCruciblaPickerFor(null);
      setCruciblaPickerAnchorEl(null);
    } catch (err) {
      console.error('Failed to duplicate collection:', err);
      setError('Failed to duplicate collection.');
    } finally {
      setSyncing(false);
    }
  }, [youtubeCollections, setYoutubeCollections]);

  // Handle delete collection - removes from cloud
  const handleDeleteCollection = useCallback(async (e, collectionId) => {
    e.stopPropagation();
    if (youtubeCollections.length <= 1) {
      return; // Can't delete last collection
    }
    if (window.confirm('Are you sure you want to delete this collection? All videos in it will be lost.')) {
      setSyncing(true);
      try {
        await youtubeApi.deleteCollection(collectionId);

        // Update local state
        const newCollections = youtubeCollections.filter(c => (c._id || c.id) !== collectionId);
        setYoutubeCollections(newCollections);

        // If we deleted the current collection, switch to another
        if (currentYoutubeCollectionId === collectionId && newCollections.length > 0) {
          setCurrentYoutubeCollection(newCollections[0]._id || newCollections[0].id);
        }
      } catch (err) {
        console.error('Failed to delete collection:', err);
        setError('Failed to delete collection.');
      } finally {
        setSyncing(false);
      }
    }
  }, [youtubeCollections, setYoutubeCollections, currentYoutubeCollectionId, setCurrentYoutubeCollection]);

  // Handle color selection - saves to cloud
  const handleColorSelect = useCallback(async (e, collectionId, color) => {
    e.stopPropagation();
    try {
      await youtubeApi.updateCollection(collectionId, { color });
      setYoutubeCollections(youtubeCollections.map(c =>
        (c._id || c.id) === collectionId ? { ...c, color } : c
      ));
    } catch (err) {
      console.error('Failed to update collection color:', err);
    }
    setShowColorPickerFor(null);
  }, [youtubeCollections, setYoutubeCollections]);

  // Handle rollout assignment
  const handleAssignToRollout = useCallback((e, collectionId, rolloutId, sectionId) => {
    e.stopPropagation();
    assignCollectionToRollout(collectionId, rolloutId, sectionId);
    setShowRolloutPickerFor(null);
  }, [assignCollectionToRollout]);

  // Handle unassign from rollout
  const handleUnassignFromRollout = useCallback((e, collectionId) => {
    e.stopPropagation();
    unassignCollectionFromRollout(collectionId);
    setShowRolloutPickerFor(null);
  }, [unassignCollectionFromRollout]);

  // Get rollout and section info for a collection
  const getCollectionRolloutInfo = useCallback((collection) => {
    if (!collection.rolloutId || !collection.sectionId) return null;
    const rollout = rollouts.find(r => r.id === collection.rolloutId);
    if (!rollout) return null;
    const section = rollout.sections.find(s => s.id === collection.sectionId);
    if (!section) return null;
    return { rollout, section };
  }, [rollouts]);

  // Crucibla project handlers
  const handleAssignCruciblaProject = useCallback(async (e, collectionId, project, album) => {
    e.stopPropagation();
    try {
      const updates = {
        cruciblaProjectId: project.id,
        cruciblaProjectName: project.name,
        cruciblaProjectType: project.type,
        cruciblaEra: project.era || '',
        cruciblaAlbum: album?.name || null,
        cruciblaAlbumColor: album?.group_color || null,
      };
      await youtubeApi.updateCollection(collectionId, updates);
      setYoutubeCollections(youtubeCollections.map(c =>
        (c._id || c.id) === collectionId ? { ...c, ...updates } : c
      ));
    } catch (err) {
      console.error('Failed to assign Crucibla project:', err);
      setError('Failed to link project.');
    }
    setShowCruciblaPickerFor(null);
    setCruciblaPickerAnchorEl(null);
  }, [youtubeCollections, setYoutubeCollections]);

  const handleUnassignCruciblaProject = useCallback(async (e, collectionId) => {
    e.stopPropagation();
    try {
      const updates = {
        cruciblaProjectId: null,
        cruciblaProjectName: null,
        cruciblaProjectType: null,
        cruciblaEra: null,
        cruciblaAlbum: null,
        cruciblaAlbumColor: null,
      };
      await youtubeApi.updateCollection(collectionId, updates);
      setYoutubeCollections(youtubeCollections.map(c =>
        (c._id || c.id) === collectionId ? { ...c, ...updates } : c
      ));
    } catch (err) {
      console.error('Failed to unlink Crucibla project:', err);
      setError('Failed to unlink project.');
    }
    setShowCruciblaPickerFor(null);
    setCruciblaPickerAnchorEl(null);
  }, [youtubeCollections, setYoutubeCollections]);

  // Version handlers
  const fetchVersions = useCallback(async () => {
    if (!currentYoutubeCollectionId) return;
    setLoadingVersions(true);
    try {
      const data = await youtubeApi.getVersions(currentYoutubeCollectionId);
      setVersions(data.versions || []);
    } catch (err) {
      console.error('Failed to fetch versions:', err);
    } finally {
      setLoadingVersions(false);
    }
  }, [currentYoutubeCollectionId]);

  const handleSaveVersion = useCallback(async () => {
    if (!currentYoutubeCollectionId) return;
    setSyncing(true);
    try {
      await youtubeApi.saveVersion(currentYoutubeCollectionId, versionName.trim() || undefined);
      setVersionName('');
      await fetchVersions();
    } catch (err) {
      console.error('Failed to save version:', err);
      setError(err.response?.data?.error || 'Failed to save version.');
    } finally {
      setSyncing(false);
    }
  }, [currentYoutubeCollectionId, versionName, fetchVersions]);

  const handleRestoreVersion = useCallback(async (index) => {
    if (!currentYoutubeCollectionId) return;
    if (!window.confirm('Restore this version? Current video titles, descriptions, thumbnails, order, and statuses will be overwritten for videos that existed at snapshot time.')) return;
    setSyncing(true);
    try {
      const data = await youtubeApi.restoreVersion(currentYoutubeCollectionId, index);
      const videos = (data.videos || []).map(v => ({ ...v, id: v._id }));
      setYoutubeVideos(videos);
      setShowVersionsDropdown(false);
    } catch (err) {
      console.error('Failed to restore version:', err);
      setError('Failed to restore version.');
    } finally {
      setSyncing(false);
    }
  }, [currentYoutubeCollectionId, setYoutubeVideos]);

  const handleDeleteVersion = useCallback(async (index) => {
    if (!currentYoutubeCollectionId) return;
    setSyncing(true);
    try {
      await youtubeApi.deleteVersion(currentYoutubeCollectionId, index);
      await fetchVersions();
    } catch (err) {
      console.error('Failed to delete version:', err);
      setError('Failed to delete version.');
    } finally {
      setSyncing(false);
    }
  }, [currentYoutubeCollectionId, fetchVersions]);

  const handleToggleVersions = useCallback(() => {
    const next = !showVersionsDropdown;
    setShowVersionsDropdown(next);
    if (next) fetchVersions();
  }, [showVersionsDropdown, fetchVersions]);

  const selectedVideo = selectedYoutubeVideoId
    ? youtubeVideos.find((v) => v.id === selectedYoutubeVideoId)
    : null;

  // Process uploaded file and create compressed thumbnail
  const processImageFile = useCallback(async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          // Compress the image before storing
          const compressed = await compressImage(e.target.result);
          resolve(compressed);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const readImageFile = useCallback(async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const getBaseTitleFromFile = useCallback((fileName = '') => {
    return fileName
      .replace(/\.[^/.]+$/, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim()
      .slice(0, 100) || 'Untitled Video';
  }, []);

  const resolveThumbnailChoice = useCallback((videoCount) => {
    if (thumbnailPreference === 'auto') {
      return { thumbnailMode: 'auto', thumbnailStatus: 'auto' };
    }

    if (thumbnailPreference === 'custom') {
      return { thumbnailMode: 'auto', thumbnailStatus: 'needs_custom' };
    }

    const useAutoThumbnail = window.confirm(
      `Use auto-generated thumbnail${videoCount > 1 ? 's' : ''} for this upload?\n\n` +
      'Press Cancel to keep the generated frame as a fallback but mark the video as needing a custom thumbnail.'
    );

    return useAutoThumbnail
      ? { thumbnailMode: 'auto', thumbnailStatus: 'auto' }
      : { thumbnailMode: 'auto', thumbnailStatus: 'needs_custom' };
  }, [thumbnailPreference]);

  const uploadPlannerVideoFile = useCallback(async (file, options = {}) => {
    const [{ asset }, { thumbnailDataUrl, durationSeconds }] = await Promise.all([
      youtubeApi.uploadVideoAsset(file, options),
      extractVideoFrame(file),
    ]);

    return {
      ...asset,
      durationSeconds: asset.durationSeconds || durationSeconds || 0,
      thumbnailDataUrl,
    };
  }, []);

  // Handle file upload from input or drop - saves to cloud
  const handleFileUpload = useCallback(async (e) => {
    const files = e.target?.files || e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const allFiles = Array.from(files);
    const imageFiles = allFiles.filter((f) => f.type.startsWith('image/'));
    const videoFiles = allFiles.filter((f) => f.type.startsWith('video/'));
    if (imageFiles.length === 0 && videoFiles.length === 0) return;

    // Make sure we have a collection to add to
    if (!currentYoutubeCollectionId) {
      setError('Please create a collection first before uploading videos or thumbnails.');
      return;
    }

    setError(null);
    setUploading(true);
    setUploadProgress({
      ...createUploadProgressState(),
      current: allFiles.length > 0 ? 1 : 0,
      total: allFiles.length,
    });

    const newVideos = [];
    const totalFiles = allFiles.length;
    const totalBytes = allFiles.reduce((sum, file) => sum + Math.max(Number(file.size) || 0, 1), 0);
    let completedBytes = 0;
    let processedCount = 0;
    const selectedDraftVideo = selectedYoutubeVideoId
      ? youtubeVideos.find((v) => v.id === selectedYoutubeVideoId && !hasPlannerVideoAttachment(v))
      : null;

    const updateBatchUploadProgress = ({
      label = 'Uploading',
      fileName = '',
      details = '',
      loadedBytes = completedBytes,
      current = totalFiles > 0 ? Math.min(processedCount + 1, totalFiles) : 0,
    } = {}) => {
      const boundedLoadedBytes = Math.max(0, Math.min(totalBytes || 0, loadedBytes));
      const percent = totalBytes > 0 ? Math.min(100, (boundedLoadedBytes / totalBytes) * 100) : 0;

      setUploadProgress({
        current,
        total: totalFiles,
        percent,
        fileName,
        details,
        label,
      });
    };

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const fileSize = Math.max(Number(file.size) || 0, 1);

      updateBatchUploadProgress({
        label: 'Uploading',
        fileName: file.name,
        details: 'Preparing thumbnail',
      });

      try {
        const thumbnail = await processImageFile(file);
        const title = getBaseTitleFromFile(file.name);
        const description = buildCollectionDescription({ title });

        updateBatchUploadProgress({
          label: 'Uploading',
          fileName: file.name,
          details: 'Saving thumbnail',
          loadedBytes: completedBytes + fileSize,
        });

        const data = await youtubeApi.createVideo({
          title,
          description,
          thumbnail,
          collectionId: currentYoutubeCollectionId,
          status: 'draft',
          privacyStatus: 'public',
          originalFilename: file.name,
          thumbnailMode: 'custom',
          thumbnailStatus: 'custom',
        });

        const newVideo = {
          ...data.video,
          id: data.video._id,
        };
        newVideos.push(newVideo);
      } catch (err) {
        console.error('Failed to upload video:', file.name, err);
      } finally {
        completedBytes += fileSize;
        processedCount += 1;
      }
    }

    const thumbnailChoice = videoFiles.length > 0
      ? resolveThumbnailChoice(videoFiles.length)
      : null;

    for (let i = 0; i < videoFiles.length; i++) {
      const file = videoFiles[i];
      const fileSize = Math.max(Number(file.size) || 0, 1);

      updateBatchUploadProgress({
        label: 'Uploading',
        fileName: file.name,
        details: `0% • ${formatBytes(0)} of ${formatBytes(fileSize)}`,
      });

      try {
        const videoAsset = await uploadPlannerVideoFile(file, {
          onProgress: (progress) => {
            if (progress.phase === 'uploading') {
              const detailParts = [
                `${Math.round(progress.percent ?? 0)}%`,
                `${formatBytes(progress.loaded)} of ${formatBytes(progress.total || fileSize)}`,
              ];

              if (Number.isFinite(progress.etaSeconds) && progress.etaSeconds > 0) {
                detailParts.push(`about ${formatEta(progress.etaSeconds)} left`);
              }

              updateBatchUploadProgress({
                label: 'Uploading',
                fileName: file.name,
                details: detailParts.join(' • '),
                loadedBytes: completedBytes + Math.min(progress.loaded || 0, fileSize),
              });
              return;
            }

            if (progress.phase === 'processing') {
              updateBatchUploadProgress({
                label: 'Preparing video for playback',
                fileName: file.name,
                details: 'Finalizing upload.',
                loadedBytes: completedBytes + fileSize,
              });
              return;
            }

            if (progress.phase === 'ready') {
              updateBatchUploadProgress({
                label: 'Video ready',
                fileName: file.name,
                details: 'Upload complete.',
                loadedBytes: completedBytes + fileSize,
              });
            }
          },
        });
        const basePayload = {
          ...buildVideoPersistencePayload({
            ...videoAsset,
            videoFileName: videoAsset.videoFileName || file.name,
            videoFileSize: videoAsset.videoFileSize || file.size,
            videoMimeType: videoAsset.videoMimeType || file.type,
            durationSeconds: videoAsset.durationSeconds || undefined,
          }),
        };

        if (selectedDraftVideo && videoFiles.length === 1 && i === 0) {
          const attachUpdates = {
            ...basePayload,
            lastError: '',
            ...(selectedDraftVideo.status === 'failed' ? { status: 'draft' } : {}),
            ...(selectedDraftVideo.thumbnail
              ? {}
              : {
                  thumbnail: videoAsset.thumbnailDataUrl,
                  thumbnailMode: thumbnailChoice.thumbnailMode,
                  thumbnailStatus: thumbnailChoice.thumbnailStatus,
            }),
          };
          const { video: savedVideo } = await youtubeApi.updateVideo(selectedDraftVideo.id, attachUpdates);
          const nextAssetState = savedVideo ? (savedVideo.videoAssetState || (savedVideo.videoUrl ? 'ready' : 'processing')) : 'processing';
          updateYoutubeVideo(
            selectedDraftVideo.id,
            savedVideo ? { ...savedVideo, id: savedVideo._id || selectedDraftVideo.id } : attachUpdates
          );
          updateBatchUploadProgress({
            label: nextAssetState === 'ready' ? 'Video ready' : 'Preparing video for playback',
            fileName: file.name,
            details: nextAssetState === 'ready' ? 'Upload complete.' : 'Finalizing upload.',
            loadedBytes: completedBytes + fileSize,
          });
          continue;
        }

        const data = await youtubeApi.createVideo({
          title: getBaseTitleFromFile(file.name),
          description: buildCollectionDescription({
            title: getBaseTitleFromFile(file.name),
          }),
          thumbnail: videoAsset.thumbnailDataUrl,
          collectionId: currentYoutubeCollectionId,
          status: 'draft',
          privacyStatus: 'public',
          originalFilename: file.name,
          thumbnailMode: thumbnailChoice.thumbnailMode,
          thumbnailStatus: thumbnailChoice.thumbnailStatus,
          ...basePayload,
        });

        newVideos.push({
          ...data.video,
          id: data.video._id,
        });
        updateBatchUploadProgress({
          label: data.video?.videoAssetState === 'ready' ? 'Video ready' : 'Preparing video for playback',
          fileName: file.name,
          details: data.video?.videoAssetState === 'ready' ? 'Upload complete.' : 'Finalizing upload.',
          loadedBytes: completedBytes + fileSize,
        });
      } catch (err) {
        console.error('Failed to upload planner video:', file.name, err);
      } finally {
        completedBytes += fileSize;
        processedCount += 1;
      }
    }

    // Update local state with all new videos
    if (newVideos.length > 0) {
      setYoutubeVideos([...youtubeVideos, ...newVideos]);
    }

    setUploading(false);
    setUploadProgress(createUploadProgressState());

    // Reset input
    if (e.target?.value) {
      e.target.value = '';
    }
  }, [
    currentYoutubeCollectionId,
    buildCollectionDescription,
    getBaseTitleFromFile,
    processImageFile,
    resolveThumbnailChoice,
    selectedYoutubeVideoId,
    setYoutubeVideos,
    updateYoutubeVideo,
    uploadPlannerVideoFile,
    youtubeVideos,
  ]);

  // Handle thumbnail replacement for existing video
  const handleThumbnailUpload = useCallback(async (file, videoId) => {
    const rawImage = await readImageFile(file);
    // Open editor with the original upload so preview matches the saved crop
    setEditingThumbnail(rawImage);
    setEditingThumbnailSourceFilename(file.name || '');
    setEditingVideoId(videoId);
  }, [readImageFile]);

  // Save edited thumbnail - saves to cloud
  const handleSaveThumbnail = useCallback(async (croppedThumbnail) => {
    if (editingVideoId) {
      try {
        const updates = {
          thumbnail: croppedThumbnail,
          thumbnailMode: 'custom',
          thumbnailStatus: 'custom',
          ...(editingThumbnailSourceFilename ? { thumbnailSourceFilename: editingThumbnailSourceFilename } : {}),
        };
        const { video: savedVideo } = await youtubeApi.updateVideo(editingVideoId, updates);
        updateYoutubeVideo(
          editingVideoId,
          savedVideo ? { ...savedVideo, id: savedVideo._id || editingVideoId } : updates
        );
      } catch (err) {
        console.error('Failed to save thumbnail:', err);
        setError('Failed to save thumbnail.');
      }
    }
    setEditingThumbnail(null);
    setEditingThumbnailSourceFilename('');
    setEditingVideoId(null);
  }, [editingThumbnailSourceFilename, editingVideoId, updateYoutubeVideo]);

  const handleCopyVideo = useCallback((video) => {
    if (!video) return;

    setVideoClipboard({
      mode: 'copy',
      sourceVideoId: video._id || video.id,
      sourceCollectionId: currentYoutubeCollectionId,
      sourceCollectionName: currentCollection.name,
      sourceVideoTitle: video.title || 'Untitled video',
      payload: {
        title: video.title || 'Untitled video',
        description: video.description || '',
        thumbnail: video.thumbnail || '',
        thumbnailOriginalUrl: video.thumbnailOriginalUrl || null,
        thumbnailMode: video.thumbnailMode || 'custom',
        thumbnailStatus: video.thumbnailStatus || (video.thumbnail ? 'custom' : 'missing'),
        status: video.status || 'draft',
        privacyStatus: video.privacyStatus || 'public',
        scheduledDate: video.scheduledDate || null,
        tags: video.tags || [],
        originalFilename: video.originalFilename || '',
        thumbnailSourceFilename: video.thumbnailSourceFilename || video.originalFilename || '',
        ...buildVideoPersistencePayload(video),
        artistName: video.artistName || '',
        featuringArtists: video.featuringArtists || [],
        endScreenTemplate: video.endScreenTemplate || 'video_subscribe',
      },
    });
  }, [currentCollection.name, currentYoutubeCollectionId]);

  const handleCutVideo = useCallback((video) => {
    if (!video) return;

    setVideoClipboard({
      mode: 'cut',
      sourceVideoId: video._id || video.id,
      sourceCollectionId: currentYoutubeCollectionId,
      sourceCollectionName: currentCollection.name,
      sourceVideoTitle: video.title || 'Untitled video',
      payload: {
        title: video.title || 'Untitled video',
        description: video.description || '',
        thumbnail: video.thumbnail || '',
        thumbnailOriginalUrl: video.thumbnailOriginalUrl || null,
        thumbnailMode: video.thumbnailMode || 'custom',
        thumbnailStatus: video.thumbnailStatus || (video.thumbnail ? 'custom' : 'missing'),
        status: video.status || 'draft',
        privacyStatus: video.privacyStatus || 'public',
        scheduledDate: video.scheduledDate || null,
        tags: video.tags || [],
        originalFilename: video.originalFilename || '',
        thumbnailSourceFilename: video.thumbnailSourceFilename || video.originalFilename || '',
        ...buildVideoPersistencePayload(video),
        artistName: video.artistName || '',
        featuringArtists: video.featuringArtists || [],
        endScreenTemplate: video.endScreenTemplate || 'video_subscribe',
      },
    });
  }, [currentCollection.name, currentYoutubeCollectionId]);

  const handlePasteVideo = useCallback(async () => {
    if (!videoClipboard?.payload || !currentYoutubeCollectionId) return;

    try {
      if (videoClipboard.mode === 'cut') {
        if (videoClipboard.sourceCollectionId === currentYoutubeCollectionId) {
          setError('Open a different collection to move this video there.');
          return;
        }

        const { video: movedVideo } = await youtubeApi.updateVideo(videoClipboard.sourceVideoId, {
          collectionId: currentYoutubeCollectionId,
          position: youtubeVideos.length,
        });

        if (movedVideo) {
          addYoutubeVideo({ ...movedVideo, id: movedVideo._id || movedVideo.id });
        }
        setVideoClipboard(null);
      } else {
        const { video: createdVideo } = await youtubeApi.createVideo({
          ...videoClipboard.payload,
          collectionId: currentYoutubeCollectionId,
          position: youtubeVideos.length,
        });

        if (createdVideo) {
          addYoutubeVideo({ ...createdVideo, id: createdVideo._id || createdVideo.id });
        }
      }
    } catch (err) {
      console.error('Failed to paste video:', err);
      setError('Failed to paste video.');
    }
  }, [addYoutubeVideo, currentYoutubeCollectionId, videoClipboard, youtubeVideos.length]);

  // Bulk replace: update a single video's thumbnail
  const handleBulkReplaceSingle = useCallback(async (videoId, base64, extraUpdates = {}) => {
    try {
      const updates = {
        thumbnail: base64,
        thumbnailMode: 'custom',
        thumbnailStatus: 'custom',
        ...extraUpdates,
      };
      const { video: savedVideo } = await youtubeApi.updateVideo(videoId, updates);
      updateYoutubeVideo(
        videoId,
        savedVideo
          ? { ...savedVideo, id: savedVideo._id || videoId }
          : updates
      );
    } catch (err) {
      console.error('Failed to replace thumbnail:', err);
      throw err;
    }
  }, [updateYoutubeVideo]);

  // Export thumbnails as ZIP (placeholder for Phase 3)
  const handleExport = () => {
    console.log('Export functionality coming in Phase 3');
  };

  const handleApplyCollectionSchedule = useCallback(async ({ entries }) => {
    if (!currentYoutubeCollectionId || !Array.isArray(entries) || entries.length === 0) {
      return;
    }

    setCollectionScheduling(true);
    setSyncing(true);
    setError(null);

    try {
      const data = await youtubeApi.scheduleCollection(currentYoutubeCollectionId, entries);
      const videos = (data.videos || []).map((video) => ({
        ...video,
        id: video._id || video.id,
      }));
      setYoutubeVideos(videos);
      setShowCollectionSchedule(false);
    } catch (err) {
      console.error('Failed to schedule collection:', err);
      setError(err.response?.data?.error || 'Failed to schedule collection.');
    } finally {
      setCollectionScheduling(false);
      setSyncing(false);
    }
  }, [currentYoutubeCollectionId, setYoutubeVideos]);

  return (
    <div className="youtube-native h-full flex gap-6 relative">
      {/* Upload Progress Overlay */}
      {uploading && (
        <div className="absolute inset-0 z-50 bg-dark-900/90 backdrop-blur-sm flex items-center justify-center rounded-2xl">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-dark-300 mx-auto mb-4 animate-spin" />
            <p className="text-lg font-semibold text-dark-100 mb-2">
              {uploadProgress.label || 'Uploading'}
            </p>
            <p className="text-sm text-dark-400">
              {uploadProgress.current} of {uploadProgress.total}
              {' '}to <span className="text-dark-300">{currentCollection.name}</span>
            </p>
            {uploadProgress.fileName && (
              <p className="text-sm text-dark-500 mt-1 truncate max-w-[20rem]">
                {uploadProgress.fileName}
              </p>
            )}
            {uploadProgress.details && (
              <p className="text-sm text-dark-400 mb-3 mt-2">
                {uploadProgress.details}
              </p>
            )}
            <div className="w-64 h-2 bg-dark-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-dark-100 transition-[width] duration-500 ease-out"
                style={{ width: `${uploadProgress.percent || 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-40 bg-dark-900/80 backdrop-blur-sm flex items-center justify-center rounded-2xl">
          <div className="text-center">
            <Loader2 className="w-10 h-10 text-dark-300 mx-auto mb-3 animate-spin" />
            <p className="text-dark-200">Loading collections from cloud...</p>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="absolute top-4 left-4 right-4 z-40 bg-dark-800/90 border border-dark-600 rounded-lg px-4 py-3 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-dark-300 flex-shrink-0" />
          <span className="text-red-200 flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-dark-300 hover:text-dark-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Syncing Indicator */}
      {syncing && (
        <div className="absolute top-4 right-4 z-40 bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-dark-300 animate-spin" />
          <span className="text-sm text-dark-300">Syncing...</span>
        </div>
      )}

      {plannerNotices.length > 0 && (
        <div className="absolute top-16 right-4 z-40 flex w-[22rem] max-w-[calc(100%-2rem)] flex-col gap-2">
          {plannerNotices.map((notice) => {
            const toneClasses =
              notice.tone === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10'
                : notice.tone === 'error'
                  ? 'border-red-500/30 bg-red-500/10'
                  : notice.tone === 'warning'
                    ? 'border-amber-500/30 bg-amber-500/10'
                    : 'border-dark-600 bg-dark-800/95';

            return (
              <div
                key={notice.id}
                className={`rounded-xl border px-3 py-3 shadow-xl backdrop-blur-sm ${toneClasses}`}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-dark-100">{notice.title}</p>
                    <p className="mt-1 text-sm text-dark-300">{notice.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => dismissPlannerNotice(notice.id)}
                    className="rounded-md p-1 text-dark-500 transition-colors hover:bg-dark-700 hover:text-dark-200"
                    title="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Collections Sidebar */}
      <div className={`${collectionsCollapsed ? 'w-10' : 'w-72'} flex-shrink-0 h-full transition-all duration-200`}>
        <YouTubeCollectionsManager
          onSelectCollection={setCurrentYoutubeCollection}
          selectedCollectionId={currentYoutubeCollectionId}
          collapsed={collectionsCollapsed}
          onToggleCollapsed={() => setCollectionsCollapsed(c => !c)}
        />
      </div>

      {/* Main Grid Area */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="mb-4 rounded-2xl border border-dark-700/50 bg-dark-800/40 p-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:gap-2 rounded-xl border border-dark-700/40 bg-dark-900/20 p-2">
            {/* Collections Dropdown */}
            <div className="relative" ref={collectionsDropdownRef}>
              <button
                onClick={() => {
                  const nextOpen = !showCollectionsDropdown;
                  setShowCollectionsDropdown(nextOpen);
                  if (!nextOpen) {
                    setShowCruciblaPickerFor(null);
                    setCruciblaPickerAnchorEl(null);
                  }
                }}
                className="flex items-center gap-2 h-9 px-2.5 sm:px-3 whitespace-nowrap border border-dark-700/60 bg-dark-800 hover:bg-dark-700 rounded-lg transition-colors"
              >
                <FolderOpen className="w-4 h-4 text-dark-100" />
                <span className="text-sm font-medium text-dark-200 max-w-[100px] sm:max-w-[150px] 2xl:max-w-[220px] truncate">
                  {currentCollection.name}
                </span>
                <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${showCollectionsDropdown ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {showCollectionsDropdown && (
                <div className="absolute top-full left-0 mt-1 w-80 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-50 overflow-hidden">
                  <div className="max-h-80 overflow-y-auto">
                    {youtubeCollections?.map((collection) => {
                      const rolloutInfo = getCollectionRolloutInfo(collection);
                      return (
                        <div
                          key={collection._id || collection.id}
                          className={`relative ${
                            (collection._id || collection.id) === currentYoutubeCollectionId
                              ? 'bg-dark-600/30'
                              : 'hover:bg-dark-700'
                          }`}
                        >
                          <div
                            onClick={() => handleSwitchCollection(collection._id || collection.id)}
                            className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                              (collection._id || collection.id) === currentYoutubeCollectionId
                                ? 'text-dark-300'
                                : 'text-dark-200'
                            }`}
                          >
                            {editingCollectionId === (collection._id || collection.id) ? (
                              <div className="flex-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={editingCollectionName}
                                  onChange={(e) => setEditingCollectionName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveRename(e);
                                    if (e.key === 'Escape') handleCancelRename(e);
                                  }}
                                  className="flex-1 bg-dark-900 border border-dark-600 rounded px-2 py-1 text-sm text-dark-100 focus:outline-none focus:border-dark-300"
                                  autoFocus
                                />
                                <button onClick={handleSaveRename} className="p-1 text-dark-100 hover:bg-dark-600 rounded">
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={handleCancelRename} className="p-1 text-dark-400 hover:bg-dark-600 rounded">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <>
                                {/* Color dot */}
                                <div
                                  className="w-3 h-3 rounded-full flex-shrink-0 border border-dark-500"
                                  style={{ backgroundColor: collection.color || '#6b7280' }}
                                />
                                <FolderOpen className="w-4 h-4 flex-shrink-0" />
                                <span className="flex-1 text-sm truncate">{collection.name}</span>
                                <span className="text-xs text-dark-500">
                                  {(collection._id || collection.id) === currentYoutubeCollectionId ? youtubeVideos.length : (youtubeVideosByCollection?.[collection.id]?.length || 0)}
                                </span>
                                {/* Color picker button */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowColorPickerFor(showColorPickerFor === (collection._id || collection.id) ? null : collection.id);
                                    setShowRolloutPickerFor(null);
                                  }}
                                  className="p-1 text-dark-500 hover:text-dark-200 hover:bg-dark-600 rounded"
                                  title="Set Color"
                                >
                                  <Palette className="w-3.5 h-3.5" />
                                </button>
                                {/* Rollout assignment button */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowRolloutPickerFor(showRolloutPickerFor === (collection._id || collection.id) ? null : collection.id);
                                    setShowColorPickerFor(null);
                                    setShowCruciblaPickerFor(null);
                                    setCruciblaPickerAnchorEl(null);
                                  }}
                                  className={`p-1 hover:bg-dark-600 rounded ${
                                    collection.rolloutId ? 'text-dark-100' : 'text-dark-500 hover:text-dark-200'
                                  }`}
                                  title={collection.rolloutId ? 'Change Rollout' : 'Assign to Rollout'}
                                >
                                  {collection.rolloutId ? <Link2 className="w-3.5 h-3.5" /> : <Unlink className="w-3.5 h-3.5" />}
                                </button>
                                {/* Crucibla project button */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const collectionId = collection._id || collection.id;
                                    const pickerTarget = showCruciblaPickerFor === collectionId ? null : collectionId;
                                    setShowCruciblaPickerFor(pickerTarget);
                                    setCruciblaPickerAnchorEl(pickerTarget ? e.currentTarget : null);
                                    setShowColorPickerFor(null);
                                    setShowRolloutPickerFor(null);
                                  }}
                                  className={`p-1 hover:bg-dark-600 rounded ${
                                    collection.cruciblaProjectId ? 'text-dark-100' : 'text-dark-500 hover:text-dark-200'
                                  }`}
                                  title={collection.cruciblaProjectId ? `Linked: ${collection.cruciblaProjectName}` : 'Link to Crucibla Project'}
                                >
                                  <Package className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => handleStartRename(e, collection)}
                                  className="p-1 text-dark-500 hover:text-dark-200 hover:bg-dark-600 rounded"
                                  title="Rename"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => handleDuplicateCollection(e, collection.id)}
                                  className="p-1 text-dark-500 hover:text-dark-200 hover:bg-dark-600 rounded"
                                  title="Duplicate"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                {youtubeCollections.length > 1 && (
                                  <button
                                    onClick={(e) => handleDeleteCollection(e, collection.id)}
                                    className="p-1 text-dark-500 hover:text-dark-200 hover:bg-dark-600 rounded"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>

                          {/* Rollout info badge */}
                          {rolloutInfo && (
                            <div className="px-3 pb-1 -mt-1">
                              <div
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                                style={{ backgroundColor: `${rolloutInfo.section.color}20`, color: rolloutInfo.section.color }}
                              >
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: rolloutInfo.section.color }} />
                                {rolloutInfo.rollout.name} → {rolloutInfo.section.name}
                              </div>
                            </div>
                          )}

                          {/* Crucibla project badge */}
                          {collection.cruciblaProjectId && (
                            <div className="px-3 pb-2 -mt-1">
                              <div
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                                style={{
                                  backgroundColor: collection.cruciblaProjectId ? `${collection.group_color || '#6366f1'}20` : undefined,
                                  color: collection.group_color || '#6366f1',
                                }}
                              >
                                <Package className="w-3 h-3" />
                                <span>{collection.cruciblaProjectName}</span>
                                <span className="opacity-60">({collection.cruciblaProjectType})</span>
                                {collection.cruciblaEra && <span className="opacity-60">· {collection.cruciblaEra}</span>}
                              </div>
                            </div>
                          )}

                          {/* Color Picker Dropdown */}
                          {showColorPickerFor === (collection._id || collection.id) && (
                            <div className="absolute left-full top-0 ml-1 w-36 bg-dark-900 border border-dark-600 rounded-lg shadow-xl z-50 p-2" onClick={(e) => e.stopPropagation()}>
                              <p className="text-xs text-dark-400 mb-2 px-1">Select Color</p>
                              <div className="grid grid-cols-5 gap-1">
                                {COLLECTION_COLORS.map((color) => (
                                  <button
                                    key={color.id}
                                    onClick={(e) => handleColorSelect(e, collection.id, color.value)}
                                    className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                                      collection.color === color.value ? 'border-white' : 'border-transparent'
                                    }`}
                                    style={{ backgroundColor: color.value }}
                                    title={color.name}
                                  />
                                ))}
                              </div>
                              <button
                                onClick={(e) => handleColorSelect(e, collection.id, null)}
                                className="w-full mt-2 px-2 py-1 text-xs text-dark-400 hover:text-dark-200 hover:bg-dark-700 rounded"
                              >
                                Clear Color
                              </button>
                            </div>
                          )}

                          {/* Rollout Picker Dropdown */}
                          {showRolloutPickerFor === (collection._id || collection.id) && (
                            <div className="absolute left-full top-0 ml-1 w-56 bg-dark-900 border border-dark-600 rounded-lg shadow-xl z-50 p-2 max-h-64 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                              <p className="text-xs text-dark-400 mb-2 px-1">Assign to Phase</p>
                              {rollouts.length === 0 ? (
                                <p className="text-xs text-dark-500 px-1">No rollouts created yet</p>
                              ) : (
                                rollouts.map((rollout) => (
                                  <div key={rollout.id} className="mb-2">
                                    <p className="text-xs font-medium text-dark-300 px-1 mb-1">{rollout.name}</p>
                                    {rollout.sections.length === 0 ? (
                                      <p className="text-xs text-dark-500 px-1 ml-2">No phases</p>
                                    ) : (
                                      rollout.sections.map((section) => (
                                        <button
                                          key={section.id}
                                          onClick={(e) => handleAssignToRollout(e, collection.id, rollout.id, section.id)}
                                          className={`w-full flex items-center gap-2 px-2 py-1.5 text-left rounded hover:bg-dark-700 ${
                                            collection.sectionId === section.id ? 'bg-dark-700' : ''
                                          }`}
                                        >
                                          <span
                                            className="w-3 h-3 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: section.color || '#6b7280' }}
                                          />
                                          <span className="text-xs text-dark-200 truncate">{section.name}</span>
                                          {collection.sectionId === section.id && (
                                            <Check className="w-3 h-3 text-dark-100 ml-auto" />
                                          )}
                                        </button>
                                      ))
                                    )}
                                  </div>
                                ))
                              )}
                              {collection.rolloutId && (
                                <button
                                  onClick={(e) => handleUnassignFromRollout(e, collection._id || collection.id)}
                                  className="w-full mt-2 px-2 py-1.5 text-xs text-dark-300 hover:bg-dark-600/30 rounded flex items-center gap-2"
                                >
                                  <Unlink className="w-3 h-3" />
                                  Remove from Rollout
                                </button>
                              )}
                            </div>
                          )}

                          {/* Crucibla Project Picker Dropdown */}
                          <CruciblaProjectPicker
                            isOpen={showCruciblaPickerFor === (collection._id || collection.id)}
                            targetId={collection._id || collection.id}
                            currentProjectId={collection.cruciblaProjectId}
                            currentAlbumName={collection.cruciblaAlbum}
                            anchorElement={showCruciblaPickerFor === (collection._id || collection.id) ? cruciblaPickerAnchorEl : null}
                            preferredPlacement="right-start"
                            onAssign={handleAssignCruciblaProject}
                            onUnassign={handleUnassignCruciblaProject}
                            onClose={() => {
                              setShowCruciblaPickerFor(null);
                              setCruciblaPickerAnchorEl(null);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {/* Create New Collection */}
                  <div className="border-t border-dark-700">
                    <button
                      onClick={handleCreateCollection}
                      className="w-full flex items-center gap-2 px-3 py-2 text-dark-400 hover:text-dark-200 hover:bg-dark-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span className="text-sm">New Collection</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={(e) => handleDuplicateCollection(e, currentCollection._id || currentCollection.id)}
              disabled={syncing || !currentYoutubeCollectionId}
              className="flex shrink-0 items-center gap-2 h-9 px-2.5 sm:px-3 whitespace-nowrap border border-dark-700/60 bg-dark-800 hover:bg-dark-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              title={`Duplicate ${currentCollection.name}`}
            >
              <Copy className="w-4 h-4 text-dark-200" />
              <span className="hidden 2xl:inline text-sm font-medium text-dark-200">Duplicate Collection</span>
              <span className="hidden sm:inline 2xl:hidden text-sm font-medium text-dark-200">Duplicate</span>
            </button>

            {/* Crucibla Project Badge (toolbar) */}
            {currentCollection.cruciblaProjectId && (
              <div
                className="flex min-w-0 max-w-full items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-lg text-xs"
                style={{
                  backgroundColor: `${currentCollection.group_color || '#6366f1'}15`,
                  color: currentCollection.group_color || '#6366f1',
                }}
              >
                <Package className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="min-w-0 truncate font-medium">{currentCollection.cruciblaProjectName}</span>
                <span className="hidden lg:inline opacity-60 flex-shrink-0">{currentCollection.cruciblaProjectType}</span>
              </div>
            )}

            {/* Video Count */}
            <div className="flex shrink-0 items-center gap-2 h-9 px-2.5 sm:px-3 whitespace-nowrap border border-dark-700/60 bg-dark-800 rounded-lg" title={`${youtubeVideos.length} videos in this collection`}>
              <Youtube className="w-4 h-4 text-dark-100" />
              <span className="text-sm font-medium text-dark-200">{youtubeVideos.length}</span>
              <span className="hidden md:inline text-sm font-medium text-dark-200">Videos</span>
            </div>

            {/* Versions Button */}
            <div className="relative" ref={versionsDropdownRef}>
              <button
                onClick={handleToggleVersions}
                className="h-9 w-9 flex items-center justify-center border border-dark-700/60 bg-dark-800 hover:bg-dark-700 rounded-lg transition-colors"
                title="Versions"
              >
                <History className="w-4 h-4 text-dark-400" />
              </button>

              {showVersionsDropdown && (
                <div className="absolute top-full left-0 mt-1 w-72 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-50 overflow-hidden">
                  <div className="p-3 border-b border-dark-700">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={versionName}
                        onChange={(e) => setVersionName(e.target.value)}
                        placeholder="Version name (optional)"
                        className="flex-1 bg-dark-900 border border-dark-600 rounded px-2 py-1.5 text-sm text-dark-100 focus:outline-none focus:border-dark-300"
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveVersion()}
                      />
                      <button
                        onClick={handleSaveVersion}
                        disabled={syncing}
                        className="px-3 py-1.5 bg-dark-100 hover:bg-white text-dark-900 text-sm rounded-lg transition-colors disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {loadingVersions ? (
                      <div className="p-4 text-center text-dark-400 text-sm">Loading...</div>
                    ) : versions.length === 0 ? (
                      <div className="p-4 text-center text-dark-500 text-sm">No versions saved yet</div>
                    ) : (
                      versions.map((v) => (
                        <div key={v.index} className="flex items-center justify-between px-3 py-2 hover:bg-dark-700 transition-colors">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-dark-200 truncate">{v.name}</p>
                            <p className="text-xs text-dark-500">
                              {new Date(v.savedAt).toLocaleDateString()} &middot; {v.videoCount} videos
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                            <button
                              onClick={() => handleRestoreVersion(v.index)}
                              className="px-2 py-1 text-xs text-dark-300 hover:text-dark-100 hover:bg-dark-600 rounded transition-colors"
                            >
                              Restore
                            </button>
                            <button
                              onClick={() => handleDeleteVersion(v.index)}
                              className="p-1 text-dark-500 hover:text-dark-200 hover:bg-dark-600 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Refresh Button */}
            <button
              onClick={fetchCollections}
              disabled={loading || syncing}
              className="h-9 w-9 flex items-center justify-center border border-dark-700/60 bg-dark-800 hover:bg-dark-700 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh from cloud"
            >
              <RefreshCw className={`w-4 h-4 text-dark-400 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* Bulk Replace Button */}
            <button
              onClick={() => { setBulkReplaceScope('collection'); setShowBulkReplace(true); }}
              className="h-9 w-9 flex items-center justify-center border border-dark-700/60 bg-dark-800 hover:bg-dark-700 rounded-lg transition-colors"
              title="Bulk replace thumbnails"
            >
              <Images className="w-4 h-4 text-dark-400" />
            </button>

            <button
              onClick={() => setShowCollectionSchedule(true)}
              className="flex items-center gap-2 h-9 px-3 border border-dark-700/60 bg-dark-800 hover:bg-dark-700 rounded-lg transition-colors"
              title="Schedule this collection in order"
            >
              <Calendar className="w-4 h-4 text-dark-300" />
              <span className="text-sm text-dark-200">Schedule</span>
            </button>

            {/* View Mode Toggle */}
            <div className="flex items-center h-9 border border-dark-700/60 bg-dark-800 rounded-lg p-1 gap-0.5">
              <button
                onClick={() => setYoutubeViewMode('grid')}
                className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors ${
                  youtubeViewMode === 'grid'
                    ? 'bg-dark-100 text-dark-900'
                    : 'text-dark-400 hover:text-dark-200'
                }`}
                title="Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setYoutubeViewMode('sidebar')}
                className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors ${
                  youtubeViewMode === 'sidebar'
                    ? 'bg-dark-100 text-dark-900'
                    : 'text-dark-400 hover:text-dark-200'
                }`}
                title="List View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Lock Toggle */}
            <button
              onClick={() => setIsLocked(!isLocked)}
              className={`flex items-center gap-2 h-9 px-3 rounded-lg transition-colors ${
                isLocked
                  ? 'border border-amber-500/30 bg-amber-500/15 text-amber-400'
                  : 'border border-dark-700/60 bg-dark-800 text-dark-300 hover:bg-dark-700'
              }`}
              title={isLocked ? 'Click to enable drag & drop reordering' : 'Click to lock grid (prevent reordering)'}
            >
              {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              <span className="hidden 2xl:inline text-sm font-medium">{isLocked ? 'Locked' : 'Unlocked'}</span>
              <span className="hidden sm:inline 2xl:hidden text-sm font-medium">{isLocked ? 'Lock' : 'Unlock'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dark-700/40 bg-dark-900/20 p-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex items-center gap-2 rounded-xl border border-dark-700/70 bg-dark-950/90 px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <span className="text-[11px] font-medium text-dark-500">Thumbnail</span>
                <div className="relative">
                  <select
                    value={thumbnailPreference}
                    onChange={(e) => setThumbnailPreference(e.target.value)}
                    className="h-7 min-w-[9.5rem] appearance-none rounded-lg border border-dark-700/70 bg-black pl-2.5 pr-8 text-sm text-dark-100 focus:outline-none focus:border-dark-500"
                    style={{ colorScheme: 'dark' }}
                    title="Default thumbnail workflow for uploaded videos"
                  >
                    <option value="custom" style={{ backgroundColor: '#000000', color: '#f5f5f5' }}>Prefer custom</option>
                    <option value="auto" style={{ backgroundColor: '#000000', color: '#f5f5f5' }}>Video frame</option>
                    <option value="ask" style={{ backgroundColor: '#000000', color: '#f5f5f5' }}>Ask each time</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dark-500" />
                </div>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {/* Export */}
              <button
                onClick={handleExport}
                className="flex items-center gap-2 h-8 px-3 rounded-lg border border-dark-700/60 bg-dark-900/70 text-dark-400 hover:text-dark-100 hover:bg-dark-800 transition-colors disabled:opacity-60"
                disabled
                title="Coming in Phase 3"
              >
                <Download className="w-4 h-4" />
                <span className="text-sm">Export</span>
              </button>

              {/* Upload Button */}
              <label className="flex items-center gap-2 h-8 px-3.5 rounded-lg border border-[#f0ede8]/25 bg-[#f0ede8] text-[#111111] text-sm font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-colors hover:bg-white cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>Upload</span>
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
          </div>
        </div>

        {/* Grid Content */}
        <div className="flex-1 overflow-auto">
          {youtubeViewMode === 'grid' ? (
            <YouTubeGridView
              isLocked={isLocked}
              onUpload={handleFileUpload}
            />
          ) : (
            <YouTubeSidebarView
              isLocked={isLocked}
              onUpload={handleFileUpload}
            />
          )}
        </div>

        {/* Stats */}
        <div className="mt-4 flex items-center gap-6 text-sm text-dark-400">
          <span>{youtubeVideos.length} videos</span>
          <span>{youtubeVideos.filter((v) => v.status === 'draft').length} drafts</span>
          <span>{youtubeVideos.filter((v) => v.status === 'scheduled').length} scheduled</span>
          <span className="text-dark-300">
            {isLocked ? 'Grid locked' : 'Drag to reorder'}
          </span>
          <span className="ml-auto text-dark-100 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-dark-100"></span>
            Cloud synced
          </span>
        </div>
      </div>

      {/* Right Sidebar - Video Details */}
      <div className="w-80 flex-shrink-0">
        <YouTubeVideoDetails
          video={selectedVideo}
          onThumbnailUpload={handleThumbnailUpload}
          videoClipboard={videoClipboard}
          currentCollection={currentCollection}
          currentCollectionName={currentCollection.name}
          onCopyVideo={handleCopyVideo}
          onCutVideo={handleCutVideo}
          onPasteVideo={handlePasteVideo}
        />
      </div>

      {/* Thumbnail Editor Modal */}
      {editingThumbnail && (
        <YouTubeThumbnailEditor
          image={editingThumbnail}
          onSave={handleSaveThumbnail}
          onCancel={() => {
            setEditingThumbnail(null);
            setEditingThumbnailSourceFilename('');
            setEditingVideoId(null);
          }}
        />
      )}

      {/* Bulk Replace Modal */}
      <YouTubeBulkReplace
        isOpen={showBulkReplace}
        onClose={() => setShowBulkReplace(false)}
        videos={youtubeVideos}
        onReplace={handleBulkReplaceSingle}
        scope={bulkReplaceScope}
        onScopeChange={setBulkReplaceScope}
      />

      <YouTubeCollectionScheduleModal
        isOpen={showCollectionSchedule}
        collectionName={currentCollection.name}
        videos={youtubeVideos}
        selectedVideoId={selectedYoutubeVideoId}
        applying={collectionScheduling}
        onClose={() => setShowCollectionSchedule(false)}
        onApply={handleApplyCollectionSchedule}
      />
    </div>
  );
}

export default YouTubePlanner;
