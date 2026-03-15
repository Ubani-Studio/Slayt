import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/useAppStore';
import { contentApi, gridApi, youtubeApi, reelCollectionApi } from '../lib/api';
import {
  ArrowDownWideNarrow,
  CheckCircle2,
  Upload,
  Search,
  Grid,
  List,
  Image,
  Film,
  FolderOpen,
  Trash2,
  Plus,
  Loader2,
  RefreshCw,
  Link2,
  LayoutGrid,
  Smartphone,
  Youtube,
  Palette,
} from 'lucide-react';
import GallerySection from '../components/gallery/GallerySection';
import GalleryMediaCard from '../components/gallery/GalleryMediaCard';
import GalleryColorView from '../components/gallery/GalleryColorView';

const MEDIA_SORT_OPTIONS = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'title', label: 'A-Z' },
  { id: 'type', label: 'Media Type' },
  { id: 'portrait', label: 'Portrait First' },
];

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm']);

const getFileExtension = (filename = '') =>
  filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';

const inferFileMediaType = (file) => {
  const mimeType = file?.type || '';
  if (mimeType.startsWith('video/')) {
    return 'video';
  }

  return VIDEO_EXTENSIONS.has(getFileExtension(file?.name || '')) ? 'video' : 'image';
};

const getItemTitle = (item) => (item.title || item.caption || 'Untitled').trim().toLowerCase();

const getItemTimestamp = (item) => {
  const sourceDate = item.createdAt || item.updatedAt || item.scheduledDate || null;
  const timestamp = sourceDate ? new Date(sourceDate).getTime() : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const getItemOrientationRank = (item) => {
  const width = item.metadata?.width || 0;
  const height = item.metadata?.height || 0;

  if (!width || !height) return 3;
  if (height > width) return 0;
  if (width > height) return 1;
  return 2;
};

const getItemTypeRank = (item) => {
  if (item._isYouTube) return 2;
  if (item.mediaType === 'video') return 1;
  if (item.mediaType === 'carousel') return 3;
  return 0;
};

const compareTitles = (a, b) => getItemTitle(a).localeCompare(getItemTitle(b));

const sortMediaItems = (items, sortMode) => {
  const sortedItems = [...items];

  sortedItems.sort((a, b) => {
    if (sortMode === 'oldest') {
      return getItemTimestamp(a) - getItemTimestamp(b) || compareTitles(a, b);
    }

    if (sortMode === 'title') {
      return compareTitles(a, b) || getItemTimestamp(b) - getItemTimestamp(a);
    }

    if (sortMode === 'type') {
      return getItemTypeRank(a) - getItemTypeRank(b)
        || compareTitles(a, b)
        || getItemTimestamp(b) - getItemTimestamp(a);
    }

    if (sortMode === 'portrait') {
      return getItemOrientationRank(a) - getItemOrientationRank(b)
        || getItemTimestamp(b) - getItemTimestamp(a)
        || compareTitles(a, b);
    }

    return getItemTimestamp(b) - getItemTimestamp(a) || compareTitles(a, b);
  });

  return sortedItems;
};

function MediaLibrary() {
  const navigate = useNavigate();
  const addToGrid = useAppStore((state) => state.addToGrid);
  const selectPost = useAppStore((state) => state.selectPost);
  const user = useAppStore((state) => state.user);

  // Data sources
  const [content, setContent] = useState([]);
  const [grids, setGrids] = useState([]);
  const [youtubeVideos, setYoutubeVideos] = useState([]);
  const [reelCollections, setReelCollections] = useState([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [sortMode, setSortMode] = useState('newest');
  const [colorSortMode, setColorSortMode] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0 });
  const [clarosaSyncing, setClarosaSyncing] = useState(false);
  const [clarosaSyncMessage, setClarosaSyncMessage] = useState('');

  // Fetch all data sources in parallel
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [contentRes, gridRes, ytRes, reelRes] = await Promise.allSettled([
        contentApi.getAll({ limit: 500 }),
        gridApi.getAll(),
        youtubeApi.getVideos(),
        reelCollectionApi.getAll(),
      ]);

      // Content
      if (contentRes.status === 'fulfilled') {
        const data = contentRes.value;
        setContent(Array.isArray(data) ? data : data.content || data.contents || []);
      } else {
        console.error('Failed to fetch content:', contentRes.reason);
      }

      // Grids
      if (gridRes.status === 'fulfilled') {
        const data = gridRes.value;
        setGrids(Array.isArray(data) ? data : data.grids || []);
      }

      // YouTube
      if (ytRes.status === 'fulfilled') {
        const data = ytRes.value;
        setYoutubeVideos(Array.isArray(data) ? data : data.videos || []);
      }

      // Reel Collections
      if (reelRes.status === 'fulfilled') {
        const data = reelRes.value;
        setReelCollections(Array.isArray(data) ? data : []);
      }

      // Show error only if content (primary source) failed
      if (contentRes.status === 'rejected') {
        setError(contentRes.reason?.message || 'Failed to load content');
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Build set of content IDs in grids
  const gridContentIds = useMemo(() => {
    const ids = new Set();
    grids.forEach((grid) => {
      if (grid.cells) {
        grid.cells.forEach((cell) => {
          const cid = typeof cell.contentId === 'object' ? cell.contentId?._id : cell.contentId;
          if (cid) ids.add(cid);
        });
      }
      // Also check rows/columns format
      if (grid.rows) {
        grid.rows.forEach((row) => {
          row.forEach((cell) => {
            const cid = typeof cell.contentId === 'object' ? cell.contentId?._id : cell.contentId;
            if (cid) ids.add(cid);
          });
        });
      }
    });
    return ids;
  }, [grids]);

  // Build set of content IDs in reel collections
  const reelContentIds = useMemo(() => {
    const ids = new Set();
    reelCollections.forEach((col) => {
      if (col.reels) {
        col.reels.forEach((reel) => {
          const cid = typeof reel.contentId === 'object' ? reel.contentId?._id : reel.contentId;
          if (cid) ids.add(cid);
        });
      }
    });
    return ids;
  }, [reelCollections]);

  // Apply search + filter to content items
  const filterItem = useCallback(
    (item) => {
      const title = (item.title || item.caption || '').toLowerCase();
      if (searchQuery && !title.includes(searchQuery.toLowerCase())) return false;
      if (filterType === 'images' && item.mediaType === 'video') return false;
      if (filterType === 'videos' && item.mediaType !== 'video') return false;
      return true;
    },
    [searchQuery, filterType]
  );

  // Classify content into sections (priority order)
  const sections = useMemo(() => {
    const gridItems = [];
    const reelItems = [];
    const unsorted = [];

    content.forEach((item) => {
      if (!filterItem(item)) return;

      if (gridContentIds.has(item._id)) {
        gridItems.push(item);
      } else if (
        item.mediaType === 'video' &&
        (reelContentIds.has(item._id) || item.platform === 'instagram' || item.platform === 'tiktok')
      ) {
        reelItems.push(item);
      } else {
        unsorted.push(item);
      }
    });

    // YouTube items — filtered by search
    const ytItems = youtubeVideos
      .filter((v) => {
        if (!searchQuery) return true;
        const title = (v.title || '').toLowerCase();
        return title.includes(searchQuery.toLowerCase());
      })
      .map((v) => ({
        ...v,
        _id: v._id || v.id,
        mediaUrl: v.thumbnailUrl || v.thumbnail,
        thumbnailUrl: v.thumbnailUrl || v.thumbnail,
        _isYouTube: true,
      }));

    return {
      grid: sortMediaItems(gridItems, sortMode),
      reels: sortMediaItems(reelItems, sortMode),
      youtube: sortMediaItems(ytItems, sortMode),
      unsorted: sortMediaItems(unsorted, sortMode),
    };
  }, [content, youtubeVideos, gridContentIds, reelContentIds, filterItem, searchQuery, sortMode]);

  // All items flat (for color view)
  const allFilteredItems = useMemo(
    () => [...sections.grid, ...sections.reels, ...sections.youtube, ...sections.unsorted],
    [sections]
  );

  // Total counts
  const totalCount = allFilteredItems.length;
  const isUploading = uploadProgress.total > 0 && uploadProgress.completed < uploadProgress.total;
  const clarosaConnected = Boolean(user?.clarosa?.connected);
  const clarosaMatchedCount = content.filter((item) => item.clarosa?.status === 'matched').length;
  const summaryChips = [
    { id: 'all', label: 'All', value: totalCount },
    { id: 'grid', label: 'Grid', value: sections.grid.length },
    { id: 'reels', label: 'Reels', value: sections.reels.length },
    { id: 'youtube', label: 'YouTube', value: sections.youtube.length },
    { id: 'unsorted', label: 'Unsorted', value: sections.unsorted.length },
  ];

  // Toggle section collapse
  const toggleSection = (key) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Selection
  const toggleSelection = (id) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Actions
  const handleAddToGrid = () => {
    selectedItems.forEach((id) => {
      const item = content.find((c) => c._id === id);
      if (item) {
        addToGrid({
          id: item._id,
          image: item.mediaUrl,
          caption: item.caption || item.title,
          mediaType: item.mediaType,
          color: '#d4d4d8',
        });
      }
    });
    setSelectedItems([]);
  };

  const handleDelete = async (id) => {
    try {
      await contentApi.delete(id);
      setContent((prev) => prev.filter((c) => c._id !== id));
      setSelectedItems((prev) => prev.filter((i) => i !== id));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleDeleteSelected = async () => {
    for (const id of selectedItems) {
      await handleDelete(id);
    }
  };

  const handleEdit = (item) => {
    selectPost(item._id);
    navigate('/grid');
  };

  const handleOpenClarosaConnection = useCallback(() => {
    navigate('/connections');
  }, [navigate]);

  const handleSyncClarosa = useCallback(async () => {
    setClarosaSyncing(true);
    setClarosaSyncMessage('');
    setError(null);

    try {
      const result = await contentApi.syncClarosa();
      const summary = result.summary || {};
      setClarosaSyncMessage(
        `Matched ${summary.matched || 0} images. ${summary.skippedWithoutHash || 0} older items still need a stored hash.`,
      );
      await fetchAll();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to sync Clarosa insight');
    } finally {
      setClarosaSyncing(false);
    }
  }, [fetchAll]);

  const handleFileUpload = useCallback(
    async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      setError(null);
      setUploadProgress({ completed: 0, total: files.length });

      const failedUploads = [];
      let hasSuccessfulUpload = false;

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];

        try {
          await contentApi.upload(file, {
            title: file.name,
            mediaType: inferFileMediaType(file),
          });
          hasSuccessfulUpload = true;
        } catch (err) {
          const reason = err.response?.data?.error || err.message || 'Upload failed';
          console.error('Upload failed:', err);
          failedUploads.push(`${file.name}: ${reason}`);
        } finally {
          setUploadProgress({ completed: index + 1, total: files.length });
        }
      }

      if (hasSuccessfulUpload) {
        await fetchAll();
      }

      if (failedUploads.length > 0) {
        setError(
          failedUploads.length === 1
            ? failedUploads[0]
            : `${failedUploads.length} uploads failed. ${failedUploads[0]}`
        );
      }

      setUploadProgress({ completed: 0, total: 0 });

      if (e.target?.value) {
        e.target.value = '';
      }
    },
    [fetchAll]
  );

  // Grid classes for card layout
  const gridCols =
    viewMode === 'grid'
      ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
      : 'space-y-2';

  // Render a section's items
  const renderItems = (items, readOnly = false, isYouTube = false) => (
    <div className={gridCols}>
      {items.map((item) => (
        <GalleryMediaCard
          key={item._id}
          item={item}
          isSelected={selectedItems.includes(item._id)}
          onToggleSelect={toggleSelection}
          onEdit={handleEdit}
          onDelete={handleDelete}
          viewMode={viewMode}
          readOnly={readOnly}
          isYouTube={isYouTube}
        />
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-zinc-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="mb-6 rounded-[28px] border border-dark-700/50 bg-dark-900/45 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur-sm sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search media, titles, captions..."
                className="h-11 w-full rounded-2xl border border-dark-700/60 bg-dark-950/70 pl-10 pr-4 text-sm text-dark-100 outline-none transition-colors placeholder:text-dark-500 focus:border-dark-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dark-700/40 bg-dark-900/35 p-2">
              <div className="flex items-center gap-1 rounded-xl border border-dark-700/60 bg-dark-950/55 p-1">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'images', label: 'Images', icon: Image },
                  { id: 'videos', label: 'Videos', icon: Film },
                ].map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => setFilterType(filter.id)}
                    className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors ${
                      filterType === filter.id
                        ? 'bg-dark-700 text-dark-100'
                        : 'text-dark-400 hover:text-dark-200'
                    }`}
                  >
                    {filter.icon && <filter.icon className="h-3.5 w-3.5" />}
                    <span>{filter.label}</span>
                  </button>
                ))}
              </div>

              <label className="flex h-8 items-center gap-2 rounded-xl border border-dark-700/60 bg-dark-950/55 px-3 text-sm text-dark-300">
                <ArrowDownWideNarrow className="h-3.5 w-3.5 text-dark-400" />
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value)}
                  className="bg-transparent text-sm text-dark-200 outline-none"
                >
                  {MEDIA_SORT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id} className="bg-dark-900 text-dark-100">
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dark-700/40 bg-dark-900/35 p-2">
            <div className="flex items-center gap-1 rounded-xl border border-dark-700/60 bg-dark-950/55 p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-dark-700 text-dark-100'
                    : 'text-dark-400 hover:text-dark-200'
                }`}
              >
                <Grid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  viewMode === 'list'
                    ? 'bg-dark-700 text-dark-100'
                    : 'text-dark-400 hover:text-dark-200'
                }`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={() => setColorSortMode((prev) => !prev)}
              className={`flex h-8 items-center gap-2 rounded-xl border px-3 text-sm transition-colors ${
                colorSortMode
                  ? 'border-dark-500 bg-dark-700 text-dark-100'
                  : 'border-dark-700/60 bg-dark-950/55 text-dark-400 hover:text-dark-200'
              }`}
              title="AI Color Sort"
            >
              <Palette className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Color</span>
            </button>

            <button
              onClick={handleOpenClarosaConnection}
              className={`flex h-8 items-center gap-2 rounded-xl border px-3 text-sm transition-colors ${
                clarosaConnected
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:text-emerald-200'
                  : 'border-dark-700/60 bg-dark-950/55 text-dark-300 hover:text-dark-100'
              }`}
              title={clarosaConnected ? 'Manage Clarosa link' : 'Link Clarosa'}
            >
              <Link2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {clarosaConnected ? 'Clarosa Linked' : 'Link Clarosa'}
              </span>
            </button>

            {clarosaConnected && (
              <button
                onClick={handleSyncClarosa}
                disabled={clarosaSyncing || isUploading}
                className="flex h-8 items-center gap-2 rounded-xl border border-dark-700/60 bg-dark-950/55 px-3 text-sm text-dark-300 transition-colors hover:text-dark-100 disabled:cursor-not-allowed disabled:opacity-60"
                title="Sync Clarosa insight"
              >
                {clarosaSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{clarosaSyncing ? 'Syncing...' : 'Sync Clarosa'}</span>
              </button>
            )}

            <button
              onClick={fetchAll}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-dark-700/60 bg-dark-950/55 text-dark-400 transition-colors hover:text-dark-200"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>

            <label className={`inline-flex h-10 items-center gap-2 rounded-2xl border px-4 text-sm font-medium transition-colors ${
              isUploading
                ? 'cursor-wait border-dark-700/60 bg-dark-200 text-dark-900'
                : 'cursor-pointer border-white/20 bg-zinc-200 text-dark-900 hover:bg-white'
            }`}>
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span>{isUploading ? `Uploading ${uploadProgress.completed}/${uploadProgress.total}` : 'Upload'}</span>
              <input
                type="file"
                multiple
                accept="image/*,video/*,.heic,.heif"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isUploading}
              />
            </label>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {summaryChips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex items-center gap-2 rounded-full border border-dark-700/50 bg-dark-950/45 px-3 py-1 text-xs text-dark-300"
            >
              <span className="text-dark-500">{chip.label}</span>
              <span className="text-dark-100">{chip.value}</span>
            </span>
          ))}

          <span className="inline-flex items-center gap-2 rounded-full border border-dark-700/50 bg-dark-950/45 px-3 py-1 text-xs text-dark-300">
            <Smartphone className="h-3.5 w-3.5 text-dark-400" />
            <span>Phone-ready uploads</span>
          </span>

          {clarosaConnected && (
            <span className="inline-flex items-center gap-2 rounded-full border border-dark-700/50 bg-dark-950/45 px-3 py-1 text-xs text-dark-300">
              <Link2 className="h-3.5 w-3.5 text-dark-400" />
              <span>Clarosa {clarosaMatchedCount} matched</span>
            </span>
          )}

          {isUploading ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{uploadProgress.completed} of {uploadProgress.total} processed</span>
            </span>
          ) : (
            totalCount > 0 && (
              <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-dark-700/50 bg-dark-950/45 px-3 py-1 text-xs text-dark-400">
                <CheckCircle2 className="h-3.5 w-3.5 text-dark-500" />
                <span>Sorted {MEDIA_SORT_OPTIONS.find((option) => option.id === sortMode)?.label.toLowerCase()}</span>
              </span>
            )
          )}
        </div>
      </div>

      {/* Error State */}
      {clarosaSyncMessage && !error && (
        <div className="mb-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {clarosaSyncMessage}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-2xl border border-dark-600/70 bg-dark-800/55 px-4 py-3 text-sm text-dark-300">
          {error}
          <button onClick={fetchAll} className="ml-4 text-dark-100 underline underline-offset-4">
            Retry
          </button>
        </div>
      )}

      {/* Selection Bar */}
      {selectedItems.length > 0 && (
        <div className="mb-4 flex items-center gap-4 p-3 bg-dark-800 rounded-lg border border-dark-700">
          <span className="text-sm text-dark-200">
            {selectedItems.length} selected
          </span>
          <div className="flex items-center gap-2">
            <button onClick={handleAddToGrid} className="btn-secondary text-sm py-1.5">
              <Plus className="w-4 h-4" />
              Add to Grid
            </button>
            <button onClick={handleDeleteSelected} className="btn-danger text-sm py-1.5">
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
          <button
            onClick={() => setSelectedItems([])}
            className="ml-auto text-sm text-dark-400 hover:text-dark-200"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto">
        {totalCount === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <FolderOpen className="w-16 h-16 text-dark-500 mb-4" />
            <p className="text-dark-300 mb-2">No media found</p>
            <p className="text-sm text-dark-500 mb-4">
              {content.length > 0
                ? 'Try adjusting your search or filter'
                : 'Upload images, videos, or phone photos to get started'}
            </p>
            <label className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-zinc-200 px-4 py-2 text-sm font-medium text-dark-900 transition-colors hover:bg-white">
              <Upload className="w-4 h-4" />
              Upload Media
              <input
                type="file"
                multiple
                accept="image/*,video/*,.heic,.heif"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        ) : colorSortMode ? (
          <GalleryColorView
            allItems={allFilteredItems}
            viewMode={viewMode}
            selectedItems={selectedItems}
            onToggleSelect={toggleSelection}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ) : (
          <>
            {/* Grid Planner Section */}
            <GallerySection
              title="Grid Planner"
              icon={LayoutGrid}
              items={sections.grid}
              isCollapsed={!!collapsedSections.grid}
              onToggle={() => toggleSection('grid')}
            >
              {sections.grid.length > 0
                ? renderItems(sections.grid)
                : <p className="text-sm text-dark-500 py-2">No items in grid planner</p>}
            </GallerySection>

            {/* Reels & TikTok Section */}
            <GallerySection
              title="Reels & TikTok"
              icon={Film}
              items={sections.reels}
              isCollapsed={!!collapsedSections.reels}
              onToggle={() => toggleSection('reels')}
            >
              {sections.reels.length > 0
                ? renderItems(sections.reels)
                : <p className="text-sm text-dark-500 py-2">No reels or TikTok content</p>}
            </GallerySection>

            {/* YouTube Thumbnails Section */}
            <GallerySection
              title="YouTube Thumbnails"
              icon={Youtube}
              items={sections.youtube}
              isCollapsed={!!collapsedSections.youtube}
              onToggle={() => toggleSection('youtube')}
              readOnly
            >
              {sections.youtube.length > 0
                ? renderItems(sections.youtube, true, true)
                : <p className="text-sm text-dark-500 py-2">No YouTube thumbnails</p>}
            </GallerySection>

            {/* Unsorted Section */}
            <GallerySection
              title="Unsorted"
              icon={FolderOpen}
              items={sections.unsorted}
              isCollapsed={!!collapsedSections.unsorted}
              onToggle={() => toggleSection('unsorted')}
            >
              {sections.unsorted.length > 0
                ? renderItems(sections.unsorted)
                : <p className="text-sm text-dark-500 py-2">No unsorted items</p>}
            </GallerySection>
          </>
        )}
      </div>

    </div>
  );
}

export default MediaLibrary;
