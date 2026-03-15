import { useCallback, useState, useRef, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { useAppStore } from '../../stores/useAppStore';
import { youtubeApi } from '../../lib/api';
import YouTubeVideoCard from './YouTubeVideoCard';
import { Upload, ImagePlus, Youtube, Settings, X, Camera, ZoomIn, ZoomOut, RotateCcw, Save, Pencil, Move, GripVertical } from 'lucide-react';

// Remap zoom: slider 80%-200% maps to actual 80%-400%
const getActualZoom = (sliderValue) => {
  if (sliderValue <= 1) return sliderValue;
  return sliderValue * sliderValue;
};

function YouTubeGridView({ isLocked, onUpload }) {
  const youtubeVideos = useAppStore((state) => state.youtubeVideos);
  const reorderYoutubeVideos = useAppStore((state) => state.reorderYoutubeVideos);
  const selectedYoutubeVideoId = useAppStore((state) => state.selectedYoutubeVideoId);
  const selectYoutubeVideo = useAppStore((state) => state.selectYoutubeVideo);
  const deleteYoutubeVideo = useAppStore((state) => state.deleteYoutubeVideo);

  // Shared user profile (synced across IG, TikTok, YouTube)
  const user = useAppStore((state) => state.user);
  const setUser = useAppStore((state) => state.setUser);
  const profiles = useAppStore((state) => state.profiles);
  const currentProfileId = useAppStore((state) => state.currentProfileId);
  const currentProfile = profiles?.find(p => (p._id || p.id) === currentProfileId) || null;

  // Settings modal state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showGridControls, setShowGridControls] = useState(false);
  const [gridColumns] = useState(4); // Row size for swap logic
  const [rowDragSource, setRowDragSource] = useState(null);
  const [rowDragTarget, setRowDragTarget] = useState(null);

  // Avatar editing state (same as IG/TikTok)
  const [showAvatarEditor, setShowAvatarEditor] = useState(false);
  const [tempImage, setTempImage] = useState(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isSaving, setIsSaving] = useState(false);

  // Profile editing state
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editBrandName, setEditBrandName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editPronouns, setEditPronouns] = useState('');

  const avatarInputRef = useRef(null);
  const containerRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const currentYoutubeCollectionId = useAppStore((state) => state.currentYoutubeCollectionId);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;

    if (isLocked || !over || active.id === over.id) return;

    const oldIndex = youtubeVideos.findIndex((v) => v.id === active.id);
    const newIndex = youtubeVideos.findIndex((v) => v.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      // Swap the two videos in place
      const newVideos = [...youtubeVideos];
      [newVideos[oldIndex], newVideos[newIndex]] = [newVideos[newIndex], newVideos[oldIndex]];
      reorderYoutubeVideos(newVideos);
      // Persist reorder to backend
      if (currentYoutubeCollectionId) {
        const videoIds = newVideos.map(v => v.id || v._id);
        youtubeApi.reorderVideos(currentYoutubeCollectionId, videoIds).catch(err =>
          console.error('Failed to persist video reorder:', err)
        );
      }
    }

    // Clear drag state
    setActiveDragId(null);
    setOverItemId(null);
  }, [isLocked, youtubeVideos, reorderYoutubeVideos, currentYoutubeCollectionId]);

  const handleDelete = useCallback((id) => {
    if (window.confirm('Are you sure you want to delete this video?')) {
      deleteYoutubeVideo(id);
    }
  }, [deleteYoutubeVideo]);

  // Drag state for visual feedback
  const [activeDragId, setActiveDragId] = useState(null);
  const [overItemId, setOverItemId] = useState(null);

  const activeDragVideo = youtubeVideos.find((v) => v.id === activeDragId);

  const handleDragStart = useCallback((event) => {
    setActiveDragId(event.active.id);
  }, []);

  const handleDragOver = useCallback((event) => {
    const overId = event.over?.id || null;
    setOverItemId(overId !== activeDragId ? overId : null);
  }, [activeDragId]);

  // Move a row from one position to another (insert, not swap)
  const moveRow = useCallback((fromRow, toRow) => {
    if (fromRow === toRow) return;
    const numRows = Math.ceil(youtubeVideos.length / gridColumns);
    if (fromRow < 0 || fromRow >= numRows || toRow < 0 || toRow >= numRows) return;

    // Extract the source row
    const fromStart = fromRow * gridColumns;
    const rowVideos = youtubeVideos.slice(fromStart, fromStart + gridColumns);

    // Remove source row, then insert at target position
    const without = [
      ...youtubeVideos.slice(0, fromStart),
      ...youtubeVideos.slice(fromStart + gridColumns),
    ];
    const insertAt = toRow * gridColumns;
    const result = [
      ...without.slice(0, insertAt),
      ...rowVideos,
      ...without.slice(insertAt),
    ];

    reorderYoutubeVideos(result);

    if (currentYoutubeCollectionId) {
      const videoIds = result.map(v => v.id || v._id);
      youtubeApi.reorderVideos(currentYoutubeCollectionId, videoIds).catch(err =>
        console.error('Failed to persist row move:', err)
      );
    }
  }, [youtubeVideos, gridColumns, reorderYoutubeVideos, currentYoutubeCollectionId]);

  // Row drag via mouse events (no native HTML5 drag — nothing disappears)
  const handleRowMouseDown = useCallback((rowIndex) => {
    setRowDragSource(rowIndex);
    document.body.style.cursor = 'grabbing';
  }, []);

  const handleRowMouseEnter = useCallback((rowIndex) => {
    if (rowDragSource !== null && rowIndex !== rowDragSource) {
      setRowDragTarget(rowIndex);
    }
  }, [rowDragSource]);

  const handleRowMouseUp = useCallback(() => {
    if (rowDragSource !== null && rowDragTarget !== null) {
      moveRow(rowDragSource, rowDragTarget);
    }
    setRowDragSource(null);
    setRowDragTarget(null);
    document.body.style.cursor = '';
  }, [rowDragSource, rowDragTarget, moveRow]);

  // Cancel row drag if mouse leaves the controls area or mouseup anywhere
  useEffect(() => {
    if (rowDragSource === null) return;
    const cancel = () => {
      setRowDragSource(null);
      setRowDragTarget(null);
      document.body.style.cursor = '';
    };
    window.addEventListener('mouseup', cancel);
    return () => window.removeEventListener('mouseup', cancel);
  }, [rowDragSource]);

  // Open settings modal
  const openSettingsModal = () => {
    setShowSettingsModal(true);
  };

  // Open avatar editor with current avatar
  const handleAvatarClick = () => {
    const avatar = displayAvatar;
    if (avatar) {
      setTempImage(avatar);
      setPosition({ x: 0, y: 0 });
      setZoom(1);
    } else {
      setTempImage(null);
      setPosition({ x: 0, y: 0 });
      setZoom(1);
    }
    setShowAvatarEditor(true);
    setShowSettingsModal(false);
  };

  // Handle new avatar upload
  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setTempImage(event.target?.result);
      setPosition({ x: 0, y: 0 });
      setZoom(1);
      setShowAvatarEditor(true);
      setShowSettingsModal(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Avatar drag handlers
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;

    const maxOffset = 100 * zoom;
    const newX = Math.max(-maxOffset, Math.min(maxOffset, e.clientX - dragStart.x));
    const newY = Math.max(-maxOffset, Math.min(maxOffset, e.clientY - dragStart.y));

    setPosition({ x: newX, y: newY });
  }, [isDragging, dragStart, zoom]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Reset avatar position
  const handleReset = () => {
    setPosition({ x: 0, y: 0 });
    setZoom(1);
  };

  // Cancel avatar editing
  const handleCancelAvatar = () => {
    setShowAvatarEditor(false);
    setTempImage(null);
    setPosition({ x: 0, y: 0 });
    setZoom(1);
  };

  // Keyboard delete for selected video
  const handleKeyDown = useCallback((e) => {
    // Ignore when typing in any input/textarea/contenteditable
    const activeTag = document.activeElement?.tagName;
    const isTyping =
      activeTag === 'INPUT' ||
      activeTag === 'TEXTAREA' ||
      document.activeElement?.isContentEditable;
    if (isTyping) return;

    if (!selectedYoutubeVideoId) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (window.confirm('Delete this video?')) {
        deleteYoutubeVideo(selectedYoutubeVideoId);
      }
    }
  }, [selectedYoutubeVideoId, deleteYoutubeVideo]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Save avatar to user profile (syncs across all platforms)
  const handleSaveAvatar = () => {
    if (!tempImage) {
      handleCancelAvatar();
      return;
    }

    setIsSaving(true);

    // Update user in store - this syncs across IG, TikTok, YouTube
    setUser({
      ...user,
      avatar: tempImage,
      avatarPosition: position,
      avatarZoom: zoom
    });

    setTimeout(() => {
      setIsSaving(false);
      setShowAvatarEditor(false);
      setTempImage(null);
    }, 300);
  };

  // Open edit profile modal
  const handleEditProfile = () => {
    setEditBrandName(user?.brandName || user?.name || '');
    setEditBio(user?.bio || '');
    setEditPronouns(user?.pronouns || '');
    setShowEditProfile(true);
    setShowSettingsModal(false);
  };

  // Save profile changes (syncs across all platforms)
  const handleSaveProfile = () => {
    setIsSaving(true);

    setUser({
      ...user,
      brandName: editBrandName,
      name: editBrandName || user?.name,
      bio: editBio,
      pronouns: editPronouns
    });

    setTimeout(() => {
      setIsSaving(false);
      setShowEditProfile(false);
    }, 300);
  };

  // Cancel edit profile
  const handleCancelEditProfile = () => {
    setShowEditProfile(false);
    setEditBrandName('');
    setEditBio('');
    setEditPronouns('');
  };

  // Get display values — prefer selected profile
  const displayName = currentProfile?.name || user?.brandName || user?.name || 'Your Channel';
  const displayAvatar = currentProfile?.avatar || user?.avatar;

  // Empty state
  if (youtubeVideos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center py-16 px-8 border-2 border-dashed border-dark-600 rounded-xl max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 bg-dark-700 rounded-full flex items-center justify-center">
            <Youtube className="w-8 h-8 text-dark-100" />
          </div>
          <h3 className="text-lg font-semibold text-dark-100 mb-2">
            Plan Your YouTube Channel
          </h3>
          <p className="text-dark-400 mb-6">
            Upload videos or thumbnails to build a real publishing queue and control how the channel grid will look.
          </p>
          <label className="btn-primary cursor-pointer inline-flex">
            <Upload className="w-4 h-4" />
            <span>Upload Videos or Thumbnails</span>
            <input
              type="file"
              multiple
              accept="image/*,video/*"
              onChange={onUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dark-800 rounded-2xl p-6 border border-dark-700">
      {/* Channel Header Mock */}
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-dark-700">
        {/* Channel Avatar - Clickable to edit */}
        <div
          onClick={handleAvatarClick}
          className="w-12 h-12 rounded-full bg-gradient-to-br from-dark-500 to-dark-700 overflow-hidden flex-shrink-0 cursor-pointer group relative"
        >
          {displayAvatar ? (
            <img
              src={displayAvatar}
              alt="Channel"
              className="w-full h-full object-cover"
            />
          ) : null}
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera className="w-4 h-4 text-white" />
          </div>
        </div>

        <div className="flex-1">
          <p className="text-sm font-medium text-dark-100">{displayName}</p>
          <p className="text-xs text-dark-400">YouTube Grid Preview</p>
        </div>

        {/* Grid Controls Toggle */}
        <button
          onClick={() => setShowGridControls(!showGridControls)}
          className={`p-2 rounded-lg transition-colors ${
            showGridControls
              ? 'bg-blue-500/20 text-blue-400'
              : 'text-dark-400 hover:text-dark-200 hover:bg-dark-700'
          }`}
          title={showGridControls ? 'Hide row/column controls' : 'Show row/column controls'}
        >
          <Move className="w-5 h-5" />
        </button>

        {/* Settings Cog */}
        <button
          onClick={openSettingsModal}
          className="p-2 text-dark-400 hover:text-dark-200 hover:bg-dark-700 rounded-lg transition-colors"
          title="Channel Settings"
        >
          <Settings className="w-5 h-5" />
        </button>

        <Youtube className="w-5 h-5 text-dark-100" />
      </div>

      {/* Video Grid - 3-4 columns responsive */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={youtubeVideos.map((v) => v.id)}
          strategy={() => null}
        >
          <div className={showGridControls ? 'flex gap-2' : ''}>
            {/* Row Controls — thin strip on left, only when grid controls active */}
            {showGridControls && (() => {
              const numRows = Math.ceil(youtubeVideos.length / gridColumns);
              return (
                <div className="flex flex-col w-8 flex-shrink-0 select-none">
                  {Array.from({ length: numRows }).map((_, rowIndex) => (
                    <div
                      key={rowIndex}
                      onMouseDown={(e) => { e.preventDefault(); handleRowMouseDown(rowIndex); }}
                      onMouseEnter={() => handleRowMouseEnter(rowIndex)}
                      onMouseUp={() => handleRowMouseUp()}
                      className={`flex-1 flex items-center justify-center cursor-grab active:cursor-grabbing rounded transition-colors ${
                        rowDragSource === rowIndex
                          ? 'bg-dark-600 ring-1 ring-dark-300'
                          : rowDragTarget === rowIndex
                          ? 'bg-blue-500/20 ring-1 ring-blue-400'
                          : 'hover:bg-dark-700'
                      }`}
                      title="Drag to reorder row"
                    >
                      <GripVertical className={`w-4 h-4 ${
                        rowDragSource === rowIndex ? 'text-dark-100' : 'text-dark-500'
                      }`} />
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Video Grid — same responsive layout always */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 flex-1">
              {youtubeVideos.map((video, index) => (
                <YouTubeVideoCard
                  key={video.id}
                  video={video}
                  displayIndex={index}
                  isSelected={video.id === selectedYoutubeVideoId}
                  isLocked={isLocked}
                  isDropTarget={video.id === overItemId}
                  onClick={() => selectYoutubeVideo(video.id)}
                  onDelete={() => handleDelete(video.id)}
                />
              ))}

              {/* Add New Card */}
              <label className="relative aspect-video bg-dark-700 rounded-lg border-2 border-dashed border-dark-500 hover:border-dark-100 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2 text-dark-400 hover:text-dark-100">
                <ImagePlus className="w-8 h-8" />
                <span className="text-sm font-medium">Add Video</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={onUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeDragVideo ? (
            <div className="aspect-video bg-dark-600 rounded-lg overflow-hidden opacity-90 ring-2 ring-dark-300 shadow-2xl shadow-dark-900/30 scale-105">
              {activeDragVideo.thumbnail ? (
                <img
                  src={activeDragVideo.thumbnail}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-dark-600" />
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Channel Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-dark-800 rounded-2xl border border-dark-700 w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700">
              <h3 className="text-lg font-semibold text-dark-100">Channel Settings</h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-1.5 text-dark-400 hover:text-dark-200 hover:bg-dark-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Info Banner */}
              <div className="p-3 bg-dark-700 border border-dark-100/20 rounded-lg">
                <p className="text-sm text-dark-300">
                  Profile settings are synced across Instagram, TikTok, and YouTube.
                </p>
              </div>

              {/* Channel Avatar */}
              <div>
                <label className="block text-sm font-medium text-dark-200 mb-2">
                  Channel Photo
                </label>
                <div className="flex items-center gap-4">
                  <div
                    onClick={handleAvatarClick}
                    className="relative w-20 h-20 rounded-full bg-gradient-to-br from-dark-500 to-dark-700 overflow-hidden flex-shrink-0 cursor-pointer group"
                  >
                    {displayAvatar ? (
                      <img
                        src={displayAvatar}
                        alt="Channel"
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <button
                      onClick={() => avatarInputRef.current?.click()}
                      className="btn-secondary text-sm"
                    >
                      <Camera className="w-4 h-4" />
                      Upload Photo
                    </button>
                    <p className="text-xs text-dark-500 mt-1">Click photo to adjust position</p>
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Edit Profile Button */}
              <div>
                <label className="block text-sm font-medium text-dark-200 mb-2">
                  Profile Info
                </label>
                <div className="p-3 bg-dark-700 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-dark-100">{displayName}</p>
                      {user?.bio && (
                        <p className="text-xs text-dark-400 mt-1 line-clamp-2">{user.bio}</p>
                      )}
                    </div>
                    <button
                      onClick={handleEditProfile}
                      className="p-2 text-dark-400 hover:text-dark-200 hover:bg-dark-600 rounded-lg transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-dark-700">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="w-full btn-primary bg-dark-100 hover:bg-white text-dark-900"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Avatar Editor Modal - Same as IG/TikTok */}
      {showAvatarEditor && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div className="bg-dark-800 rounded-2xl border border-dark-700 w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700">
              <h3 className="text-lg font-medium text-dark-100">Edit Profile Photo</h3>
              <button onClick={handleCancelAvatar} className="text-dark-400 hover:text-dark-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {/* Preview Circle */}
              <div
                ref={containerRef}
                className="w-48 h-48 mx-auto rounded-full overflow-hidden bg-dark-700 relative cursor-move"
                onMouseDown={handleMouseDown}
              >
                {tempImage ? (
                  <img
                    src={tempImage}
                    alt="Preview"
                    draggable={false}
                    className="absolute pointer-events-none select-none"
                    style={{
                      width: `${100 * getActualZoom(zoom)}%`,
                      height: `${100 * getActualZoom(zoom)}%`,
                      objectFit: 'cover',
                      left: '50%',
                      top: '50%',
                      transformOrigin: 'center center',
                      transform: `translate(-50%, -50%) translate(${position.x * 0.5}px, ${position.y * 0.5}px)`,
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Camera className="w-12 h-12 text-dark-500" />
                  </div>
                )}
              </div>

              {/* Upload button if no image */}
              {!tempImage && (
                <div className="mt-4 text-center">
                  <label className="btn-primary cursor-pointer inline-flex">
                    <Upload className="w-4 h-4" />
                    <span>Upload Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              {/* Controls */}
              {tempImage && (
                <div className="mt-6 space-y-4">
                  <p className="text-center text-sm text-dark-400">
                    Drag to reposition, use slider to zoom
                  </p>

                  {/* Zoom Slider */}
                  <div className="flex items-center gap-3">
                    <ZoomOut className="w-4 h-4 text-dark-400" />
                    <input
                      type="range"
                      min="0.8"
                      max="2"
                      step="0.05"
                      value={zoom}
                      onChange={(e) => setZoom(parseFloat(e.target.value))}
                      className="flex-1 h-2 bg-dark-600 rounded-lg appearance-none cursor-pointer accent-white"
                    />
                    <ZoomIn className="w-4 h-4 text-dark-400" />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleReset}
                      className="flex-1 btn-secondary"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Reset
                    </button>
                    <button
                      onClick={handleSaveAvatar}
                      className="flex-1 btn-primary bg-dark-100 hover:bg-white text-dark-900"
                      disabled={isSaving}
                    >
                      <Save className="w-4 h-4" />
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {showEditProfile && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={handleCancelEditProfile}
        >
          <div
            className="bg-dark-800 rounded-2xl border border-dark-700 w-full max-w-md mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700">
              <h3 className="text-lg font-medium text-dark-100">Edit Profile</h3>
              <button onClick={handleCancelEditProfile} className="text-dark-400 hover:text-dark-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-dark-200 mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={editBrandName}
                  onChange={(e) => setEditBrandName(e.target.value)}
                  placeholder="Your channel name"
                  className="input w-full"
                />
              </div>

              {/* Pronouns */}
              <div>
                <label className="block text-sm font-medium text-dark-200 mb-1.5">
                  Pronouns
                </label>
                <input
                  type="text"
                  value={editPronouns}
                  onChange={(e) => setEditPronouns(e.target.value)}
                  placeholder="e.g. they/them"
                  className="input w-full"
                />
              </div>

              {/* Bio */}
              <div>
                <label className="block text-sm font-medium text-dark-200 mb-1.5">
                  Bio
                </label>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Tell viewers about your channel..."
                  rows={3}
                  className="input w-full resize-none"
                />
              </div>

              {/* Info */}
              <p className="text-xs text-dark-500 italic">
                Changes will sync to Instagram and TikTok previews.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="px-4 py-3 border-t border-dark-700 flex gap-3">
              <button onClick={handleCancelEditProfile} className="flex-1 btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                className="flex-1 btn-primary bg-dark-100 hover:bg-white text-dark-900"
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default YouTubeGridView;
