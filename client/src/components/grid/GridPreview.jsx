import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { User, Upload, ZoomIn, ZoomOut, X, Check, Camera, RotateCcw, Save, GripVertical, Replace, Layers, Trash2, Eye, EyeOff, Play, ChevronDown, FolderPlus, Pencil, LayoutGrid, Loader2, CalendarPlus, ChevronRight, ChevronLeft, Heart, MessageCircle, Bookmark, Send, Share2, MoreHorizontal, Plus, Gauge, TrendingUp, Bug } from 'lucide-react';
import PostAIGenerator from './PostAIGenerator';
import { setInternalDragActive } from '../../utils/dragState';
import { generateVideoThumbnail, formatDuration } from '../../utils/videoUtils';
import { contentApi, gridApi, reelCollectionApi, rolloutApi, convictionApi, templateApi } from '../../lib/api';
import api from '../../lib/api';
import { GridConvictionOverlay, GridAestheticScore, CampaignReliabilityScorecard } from '../conviction';
import ReelPlayer from './ReelPlayer';
import ReelThumbnailSelector from './ReelThumbnailSelector';
import ReelEditor from './ReelEditor';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { useAppStore } from '../../stores/useAppStore';

// Remap zoom: slider 80%-200% maps to actual 80%-400%
// Uses quadratic scaling for zoom > 1 so 2.0 → 4.0
const getActualZoom = (sliderValue) => {
  if (sliderValue <= 1) return sliderValue;
  // Quadratic: 1→1, 1.5→2.25, 2→4
  return sliderValue * sliderValue;
};

// Helper function to calculate grid aesthetic score
function calculateAestheticScore(gridItems, columns = 3) {
  if (!gridItems || gridItems.length === 0) return null;

  const itemsWithConviction = gridItems.filter(
    item => item.conviction?.score !== null && item.conviction?.score !== undefined
  );

  if (itemsWithConviction.length === 0) return null;

  // 1. Average conviction score
  const avgConviction = Math.round(
    itemsWithConviction.reduce((sum, item) => sum + item.conviction.score, 0) / itemsWithConviction.length
  );

  // 2. Archetype consistency
  const archetypes = itemsWithConviction
    .map(item => item.conviction?.archetypeMatch?.designation)
    .filter(Boolean);

  let archetypeConsistency = 0;
  if (archetypes.length > 0) {
    const counts = {};
    archetypes.forEach(arch => {
      counts[arch] = (counts[arch] || 0) + 1;
    });
    const mostCommon = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    archetypeConsistency = Math.round((mostCommon[1] / archetypes.length) * 100);
  }

  // 3. Visual flow (adjacent pairs with similar scores)
  const adjacentPairs = [];
  itemsWithConviction.forEach((item, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;

    // Right neighbor
    if (col < columns - 1 && itemsWithConviction[index + 1]) {
      adjacentPairs.push([item, itemsWithConviction[index + 1]]);
    }

    // Bottom neighbor
    if (row < Math.floor(itemsWithConviction.length / columns) && itemsWithConviction[index + columns]) {
      adjacentPairs.push([item, itemsWithConviction[index + columns]]);
    }
  });

  const flowScore = adjacentPairs.length > 0
    ? adjacentPairs.filter(([i1, i2]) => {
        if (!i1?.conviction?.score || !i2?.conviction?.score) return false;
        return Math.abs(i1.conviction.score - i2.conviction.score) < 20;
      }).length / adjacentPairs.length
    : 0;

  const visualFlow = Math.round(flowScore * 100);

  // 4. Calculate weighted overall score
  const overallScore = Math.round(
    avgConviction * 0.5 +
    archetypeConsistency * 0.3 +
    visualFlow * 0.2
  );

  return {
    overallScore,
    avgConviction,
    archetypeConsistency,
    visualFlow
  };
}

// Sortable row component with drag handle
function SortableRow({ rowId, rowIndex, children, showHandle = true }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: rowId,
    disabled: !showHandle, // Disable sorting when handle is hidden
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center">
      {/* Drag Handle - conditionally visible */}
      {showHandle && (
        <div
          {...attributes}
          {...listeners}
          className="flex items-center justify-center px-2 py-4 cursor-grab active:cursor-grabbing hover:bg-dark-700/50 rounded-l transition-colors"
          title="Drag to reorder row"
        >
          <GripVertical className="w-5 h-5 text-dark-500 hover:text-dark-300" />
        </div>
      )}
      {/* Row Content */}
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}

// Draggable grid item with drop zone (handles both internal drags AND file drops from explorer)
// Default drag = rearrange, Shift+drag = replace/carousel, File drop = replace/carousel
function DraggableGridItem({ post, postId, onDragStart, onDragEnd, onFileDrop, onReorder, onReplaceOrCarousel, isSelected, onSelect, onDelete, showConvictionOverlays }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isOver, setIsOver] = useState(false);
  const [isFileOver, setIsFileOver] = useState(false);
  const [isShiftDrag, setIsShiftDrag] = useState(false);
  const dragCounterRef = useRef(0); // Counter to handle nested element drag events

  // Get all images for this post (for carousel support)
  const images = post.images || (post.image ? [post.image] : []);
  const isCarousel = images.length > 1;

  // Handle click to select
  const handleClick = (e) => {
    e.stopPropagation();
    onSelect?.(postId);
  };

  // Handle trash icon click
  const handleDeleteClick = (e) => {
    e.stopPropagation();
    onDelete?.(postId);
  };

  const handleDragStart = (e) => {
    e.stopPropagation();

    // Set global flag IMMEDIATELY to prevent file drop overlay
    setInternalDragActive(true);

    // Check if shift is held - store in dataTransfer for the drop handler
    const shiftHeld = e.shiftKey;
    setIsShiftDrag(shiftHeld);

    setIsDragging(true);
    e.dataTransfer.setData('application/slayt-item', postId);
    e.dataTransfer.setData('application/slayt-shift', shiftHeld ? 'true' : 'false');
    e.dataTransfer.effectAllowed = 'move';

    // Create a custom drag image
    const dragImage = e.target.cloneNode(true);
    dragImage.style.width = '80px';
    dragImage.style.height = '80px';
    dragImage.style.borderRadius = '8px';
    dragImage.style.opacity = '0.9';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 40, 40);
    setTimeout(() => document.body.removeChild(dragImage), 0);

    onDragStart?.(postId, post);
  };

  const handleDragEnd = (e) => {
    e.stopPropagation();
    setIsDragging(false);
    setIsShiftDrag(false);
    dragCounterRef.current = 0;

    // Clear global flag
    setInternalDragActive(false);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Increment counter - this handles nested elements
    dragCounterRef.current++;

    // Set global flag for file drags to block parent overlay
    if (e.dataTransfer.types.includes('Files')) {
      setInternalDragActive(true);
      setIsFileOver(true);
      setIsOver(false);
    } else if (e.dataTransfer.types.includes('application/slayt-item')) {
      setIsOver(true);
      setIsFileOver(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if it's an internal item drag
    if (e.dataTransfer.types.includes('application/slayt-item')) {
      e.dataTransfer.dropEffect = 'move';
    }
    // Check if it's a file drag from outside (Windows Explorer)
    else if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
      // Keep setting the flag to ensure overlay stays hidden
      setInternalDragActive(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Decrement counter - only clear highlights when truly leaving
    dragCounterRef.current--;

    if (dragCounterRef.current === 0) {
      setIsOver(false);
      setIsFileOver(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Reset state
    dragCounterRef.current = 0;
    setIsOver(false);
    setIsFileOver(false);

    // Check for internal item drag first
    const sourceId = e.dataTransfer.getData('application/slayt-item');

    if (sourceId && sourceId !== postId) {
      // Check if shift was held during drag
      const wasShiftDrag = e.dataTransfer.getData('application/slayt-shift') === 'true';

      if (wasShiftDrag) {
        // Shift+drag = show replace/carousel modal
        onReplaceOrCarousel?.(sourceId, postId);
      } else {
        // Normal drag = reorder
        onReorder?.(sourceId, postId);
      }
      return;
    }

    // Check for file drop from Windows Explorer - always show modal
    const files = Array.from(e.dataTransfer.files || []);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));

    if (imageFiles.length > 0 && onFileDrop) {
      onFileDrop(postId, post, imageFiles);
    }
  };

  return (
    <div
      draggable
      onClick={handleClick}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`aspect-square bg-dark-700 overflow-hidden cursor-grab active:cursor-grabbing relative select-none ${
        isDragging ? 'opacity-40' : ''
      } ${isSelected ? 'ring-4 ring-dark-300' : ''} ${isOver ? 'ring-4 ring-dark-300 scale-105 transition-all duration-150' : ''} ${isFileOver ? 'ring-4 ring-dark-300 scale-105 transition-all duration-150' : ''}`}
    >
      {images.length > 0 ? (
        <>
          {(() => {
            // Apply non-destructive CSS crop from saved Instagram platform draft
            const igDraft = post?.editSettings?.platformDrafts?.instagram;
            const cb = igDraft?.cropBox;
            const hasCrop = cb && (cb.x !== 0 || cb.y !== 0 || cb.width < 100 || cb.height < 100);
            const brightness = igDraft?.brightness ?? 100;
            const contrast = igDraft?.contrast ?? 100;
            const rotation = igDraft?.rotation || 0;
            const flipH = igDraft?.flipH;
            const flipV = igDraft?.flipV;
            const hasAdjustments = rotation || flipH || flipV || brightness !== 100 || contrast !== 100;

            // Use object-position to center on crop region (no distortion)
            const style = {};
            if (hasCrop) {
              style.objectPosition = `${cb.x + cb.width / 2}% ${cb.y + cb.height / 2}%`;
            }
            if (hasAdjustments) {
              const transforms = [];
              if (rotation) transforms.push(`rotate(${rotation}deg)`);
              if (flipH) transforms.push('scaleX(-1)');
              if (flipV) transforms.push('scaleY(-1)');
              if (brightness !== 100 || contrast !== 100) {
                style.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
              }
              if (transforms.length) {
                style.transform = transforms.join(' ');
                style.transformOrigin = 'center center';
              }
            }

            return (
              <img
                src={images[0]}
                alt=""
                className="w-full h-full object-cover pointer-events-none"
                style={Object.keys(style).length ? style : undefined}
                draggable={false}
              />
            );
          })()}
          {/* Carousel indicator */}
          {isCarousel && (
            <div className="absolute top-2 right-2 bg-dark-900/70 rounded px-1.5 py-0.5 flex items-center gap-1 pointer-events-none">
              <Layers className="w-3 h-3 text-white" />
              <span className="text-xs text-white font-medium">{images.length}</span>
            </div>
          )}

          {/* Conviction Overlay - Show based on toggle state */}
          {showConvictionOverlays && post.conviction && (
            <GridConvictionOverlay
              score={post.conviction.score}
              tier={post.conviction.tier}
              size="sm"
            />
          )}
        </>
      ) : post.color ? (
        <div
          className="w-full h-full pointer-events-none"
          style={{ backgroundColor: post.color }}
        />
      ) : (
        <div className="w-full h-full bg-dark-600 pointer-events-none" />
      )}

      {/* Selected state - show trash icon */}
      {isSelected && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
          <button
            onClick={handleDeleteClick}
            className="p-3 bg-dark-600 hover:bg-dark-500 rounded-full transition-colors pointer-events-auto shadow-lg shadow-dark-900/40"
            title="Delete image"
          >
            <Trash2 className="w-5 h-5 text-white" />
          </button>
        </div>
      )}

      {/* File drop indicator overlay */}
      {isFileOver && (
        <div className="absolute inset-0 bg-dark-600/50 flex items-center justify-center pointer-events-none">
          <div className="bg-dark-900/90 rounded-lg px-3 py-2">
            <span className="text-sm text-white font-medium">Drop to add</span>
          </div>
        </div>
      )}

      {/* Internal drag indicator overlay */}
      {isOver && (
        <div className="absolute inset-0 bg-dark-600/50 flex items-center justify-center pointer-events-none">
          <div className="bg-dark-900/90 rounded-lg px-3 py-2">
            <span className="text-sm text-white font-medium">Drop here</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Sortable reel row component with drag handle
function SortableReelRow({ rowId, rowIndex, children, showHandle = true }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: rowId,
    disabled: !showHandle, // Disable sorting when handle is hidden
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center">
      {/* Drag Handle */}
      {showHandle && (
        <div
          {...attributes}
          {...listeners}
          className="flex items-center justify-center px-2 py-8 cursor-grab active:cursor-grabbing hover:bg-dark-700/50 rounded-l transition-colors"
          title="Drag to reorder row"
        >
          <GripVertical className="w-5 h-5 text-dark-500 hover:text-dark-300" />
        </div>
      )}
      {/* Row Content */}
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}

// Draggable reel grid item component
function DraggableReelItem({ reel, reelId, onEdit, onPlay, onReorder }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isOver, setIsOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragStart = (e) => {
    e.stopPropagation();
    setIsDragging(true);
    e.dataTransfer.setData('application/slayt-reel', reelId);
    e.dataTransfer.effectAllowed = 'move';

    // Create a custom drag image
    const dragImage = e.target.cloneNode(true);
    dragImage.style.width = '60px';
    dragImage.style.height = '107px';
    dragImage.style.borderRadius = '8px';
    dragImage.style.opacity = '0.9';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 30, 53);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  const handleDragEnd = (e) => {
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    // Only handle internal reel drags, let file drops bubble up
    if (e.dataTransfer.types.includes('application/slayt-reel')) {
      e.stopPropagation();
      dragCounterRef.current++;
      setIsOver(true);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    // Only handle internal reel drags, let file drops bubble up
    if (e.dataTransfer.types.includes('application/slayt-reel')) {
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    // Only handle internal reel drags
    if (e.dataTransfer.types.includes('application/slayt-reel')) {
      e.stopPropagation();
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setIsOver(false);
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();

    // Only handle internal reel drags, let file drops bubble up to parent
    const sourceId = e.dataTransfer.getData('application/slayt-reel');
    if (sourceId && sourceId !== reelId) {
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsOver(false);
      onReorder?.(sourceId, reelId);
    }
    // File drops will bubble up to the parent container for video upload
  };

  const handleClick = (e) => {
    // Don't open editor if we just finished dragging
    if (!isDragging) {
      onEdit?.(reel);
    }
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`aspect-[9/16] bg-dark-700 relative overflow-hidden cursor-grab active:cursor-grabbing group select-none ${
        isDragging ? 'opacity-40' : ''
      } ${isOver ? 'ring-4 ring-dark-300 scale-105 transition-all duration-150' : ''}`}
    >
      <img
        src={reel.thumbnailUrl || reel.mediaUrl}
        alt=""
        className="w-full h-full object-cover transition-transform group-hover:scale-105 pointer-events-none"
        draggable={false}
      />

      {/* Overlay with play button */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors pointer-events-none">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlay?.(reel);
          }}
          className="w-12 h-12 bg-white/20 group-hover:bg-white/40 rounded-full flex items-center justify-center transition-all opacity-70 group-hover:opacity-100 pointer-events-auto"
        >
          <Play className="w-6 h-6 text-white fill-white ml-0.5" />
        </button>
      </div>

      {/* Duration badge */}
      {reel.metadata?.duration && (
        <div className="absolute bottom-1 right-1 bg-black/70 px-1.5 py-0.5 rounded text-xs text-white pointer-events-none">
          {formatDuration(reel.metadata.duration)}
        </div>
      )}

      {/* Edit indicator on hover */}
      <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="bg-black/70 px-2 py-1 rounded text-xs text-white">
          Click to edit
        </div>
      </div>

      {/* Drop indicator overlay */}
      {isOver && (
        <div className="absolute inset-0 bg-dark-600/50 flex items-center justify-center pointer-events-none">
          <div className="bg-dark-900/90 rounded-lg px-3 py-2">
            <span className="text-sm text-white font-medium">Drop here</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Rollout Picker Modal - for adding collections to rollouts
function RolloutPickerModal({ collectionId, collectionName, platform, rollouts, onSelect, onClose }) {
  const [expandedRolloutId, setExpandedRolloutId] = useState(null);

  // Get platform color for badge
  const getPlatformColor = () => {
    switch (platform) {
      case 'instagram-reels':
        return '#c13584';
      case 'tiktok-reels':
        return '#ff0050';
      default:
        return '#8b5cf6';
    }
  };

  const platformColor = getPlatformColor();

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-dark-800 rounded-xl w-full max-w-md border border-dark-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-white">Add to Rollout</h3>
            <p className="text-sm text-dark-400 mt-0.5">
              Adding "<span style={{ color: platformColor }}>{collectionName}</span>" to a rollout
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-dark-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Rollout List */}
        <div className="max-h-80 overflow-y-auto">
          {rollouts.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-dark-400 mb-2">No rollouts created yet</p>
              <p className="text-xs text-dark-500">Create a rollout in the Rollout Planner first</p>
            </div>
          ) : (
            rollouts.map((rollout) => (
              <div key={rollout.id} className="border-b border-dark-700 last:border-b-0">
                {/* Rollout Header */}
                <button
                  onClick={() => setExpandedRolloutId(expandedRolloutId === rollout.id ? null : rollout.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-dark-750 transition-colors"
                >
                  <ChevronRight
                    className={`w-4 h-4 text-dark-400 transition-transform ${
                      expandedRolloutId === rollout.id ? 'rotate-90' : ''
                    }`}
                  />
                  <div className="flex-1">
                    <span className="font-medium text-white">{rollout.name}</span>
                    <span className="text-xs text-dark-500 ml-2">
                      {rollout.sections?.length || 0} sections
                    </span>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      rollout.status === 'active'
                        ? 'bg-dark-600/30 text-dark-100'
                        : rollout.status === 'completed'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-dark-600 text-dark-300'
                    }`}
                  >
                    {rollout.status}
                  </span>
                </button>

                {/* Sections List */}
                {expandedRolloutId === rollout.id && (
                  <div className="bg-dark-750 px-4 py-2">
                    {rollout.sections?.length === 0 ? (
                      <p className="text-sm text-dark-500 py-2 text-center">No sections in this rollout</p>
                    ) : (
                      rollout.sections
                        .sort((a, b) => a.order - b.order)
                        .map((section, idx) => {
                          const isAlreadyAdded = section.collectionIds?.includes(collectionId);
                          return (
                            <button
                              key={section.id}
                              onClick={() => !isAlreadyAdded && onSelect(rollout.id, section.id)}
                              disabled={isAlreadyAdded}
                              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg mb-1 last:mb-0 transition-colors ${
                                isAlreadyAdded
                                  ? 'bg-dark-600/50 cursor-not-allowed'
                                  : 'hover:bg-dark-600'
                              }`}
                            >
                              <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: section.color || '#8b5cf6' }}
                              />
                              <span className="flex-1 text-sm text-left">
                                <span className="text-dark-400">Phase {idx + 1}:</span>{' '}
                                <span className={isAlreadyAdded ? 'text-dark-500' : 'text-dark-200'}>
                                  {section.name}
                                </span>
                              </span>
                              {isAlreadyAdded ? (
                                <span className="text-xs text-dark-500">Already added</span>
                              ) : (
                                <span className="text-xs text-dark-100 opacity-0 group-hover:opacity-100">
                                  Add here
                                </span>
                              )}
                            </button>
                          );
                        })
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-dark-700 bg-dark-750">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm text-dark-300 hover:text-white hover:bg-dark-600 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Post Preview Modal - for viewing/editing posts in locked mode
function PostPreviewModal({ post, onClose, onSave }) {
  const user = useAppStore((state) => state.user);
  const profiles = useAppStore((state) => state.profiles);
  const currentProfileId = useAppStore((state) => state.currentProfileId);
  const currentProfile = profiles.find(p => (p._id || p.id) === currentProfileId);

  const [activeTab, setActiveTab] = useState('edit'); // 'edit' | 'instagram' | 'tiktok'
  const [caption, setCaption] = useState(post?.caption || '');
  const [hashtags, setHashtags] = useState(post?.hashtags?.join(' ') || '');
  const [isSaving, setIsSaving] = useState(false);
  const [showAIGenerator, setShowAIGenerator] = useState(false);

  // Carousel state
  const initialImages = post?.images || (post?.image ? [post.image] : []);
  const [carouselImages, setCarouselImages] = useState(initialImages);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const isCarousel = carouselImages.length > 1;
  const currentImage = carouselImages[currentIndex] || carouselImages[0];

  // Get usernames from connected social accounts - prefer profile data
  const instagramUsername = currentProfile?.username || user?.socialAccounts?.instagram?.username || user?.name || 'username';
  const tiktokUsername = currentProfile?.username || user?.socialAccounts?.tiktok?.username || user?.name || 'username';
  const userAvatar = currentProfile?.avatar || user?.avatar;

  // Carousel navigation
  const goToPrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : carouselImages.length - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev < carouselImages.length - 1 ? prev + 1 : 0));
  };

  const goToIndex = (index) => {
    setCurrentIndex(index);
  };

  // Drag and drop handlers for reordering carousel images
  const handleDragStart = (e, index) => {
    e.stopPropagation();
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    // Set a custom drag image
    const target = e.currentTarget;
    if (target) {
      e.dataTransfer.setDragImage(target, 32, 32);
    }
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = (e) => {
    e.stopPropagation();
    // Only clear if we're leaving the element entirely
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverIndex(null);
    }
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    e.stopPropagation();

    const sourceIndex = draggedIndex;

    if (sourceIndex === null || sourceIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // Swap images (not insert - swap positions)
    const newImages = [...carouselImages];
    const temp = newImages[sourceIndex];
    newImages[sourceIndex] = newImages[targetIndex];
    newImages[targetIndex] = temp;
    setCarouselImages(newImages);

    // Update current index if it was one of the swapped items
    if (currentIndex === sourceIndex) {
      setCurrentIndex(targetIndex);
    } else if (currentIndex === targetIndex) {
      setCurrentIndex(sourceIndex);
    }

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = (e) => {
    e.stopPropagation();
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const hashtagArray = hashtags
        .split(/[\s,]+/)
        .filter(h => h.startsWith('#') || h.length > 0)
        .map(h => h.startsWith('#') ? h : `#${h}`)
        .filter(h => h.length > 1);

      // Include carousel images in the save if order changed
      const updates = {
        caption,
        hashtags: hashtagArray,
      };

      // Check if carousel order changed
      const originalImages = post?.images || (post?.image ? [post.image] : []);
      const orderChanged = carouselImages.length !== originalImages.length ||
        carouselImages.some((img, idx) => img !== originalImages[idx]);

      if (orderChanged && carouselImages.length > 0) {
        updates.carouselImages = carouselImages;
        updates.images = carouselImages; // Also update local state format
        updates.image = carouselImages[0]; // Update main image
      }

      await onSave(updates);
      onClose();
    } catch (err) {
      console.error('Failed to save post:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }

    if (!gridId) {
      alert('No active grid to save as template');
      return;
    }

    try {
      setSavingTemplate(true);

      await templateApi.createFromGrid(gridId, {
        name: templateName.trim(),
        description: templateDescription.trim(),
        isPublic: false // Can add a checkbox for this later
      });

      alert('Template saved successfully!');
      setShowTemplateModal(false);
      setTemplateName('');
      setTemplateDescription('');
    } catch (error) {
      console.error('Failed to save template:', error);
      alert('Failed to save template: ' + error.message);
    } finally {
      setSavingTemplate(false);
    }
  };

  // Simulated engagement numbers (for preview purposes)
  const likes = Math.floor(Math.random() * 5000) + 500;
  const comments = Math.floor(Math.random() * 200) + 20;

  // Carousel navigation component
  const CarouselNav = ({ showArrows = true, className = '' }) => (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      {showArrows && isCarousel && (
        <button
          onClick={goToPrev}
          className="p-1.5 rounded-full bg-dark-700/80 hover:bg-dark-600 text-white transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
        </button>
      )}
      {isCarousel && (
        <div className="flex items-center gap-1.5">
          {carouselImages.map((_, idx) => (
            <button
              key={idx}
              onClick={() => goToIndex(idx)}
              className={`w-2 h-2 rounded-full transition-all ${
                idx === currentIndex
                  ? 'bg-dark-100 w-4'
                  : 'bg-dark-500 hover:bg-dark-400'
              }`}
            />
          ))}
        </div>
      )}
      {showArrows && isCarousel && (
        <button
          onClick={goToNext}
          className="p-1.5 rounded-full bg-dark-700/80 hover:bg-dark-600 text-white transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex items-start justify-end pointer-events-none">
      <div
        className="bg-dark-800 pointer-events-auto rounded-l-2xl w-full max-w-3xl h-full overflow-hidden border border-dark-700 flex flex-col shadow-2xl"
      >
        {/* Header with tabs */}
        <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('edit')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'edit'
                  ? 'bg-dark-100 text-dark-900'
                  : 'text-dark-300 hover:text-white hover:bg-dark-700'
              }`}
            >
              Edit
            </button>
            <button
              onClick={() => setActiveTab('instagram')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'instagram'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                  : 'text-dark-300 hover:text-white hover:bg-dark-700'
              }`}
            >
              Instagram Post
            </button>
            <button
              onClick={() => setActiveTab('tiktok')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'tiktok'
                  ? 'bg-black text-white border border-dark-500'
                  : 'text-dark-300 hover:text-white hover:bg-dark-700'
              }`}
            >
              TikTok Feed
            </button>
          </div>
          <button onClick={onClose} className="p-2 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'edit' && (
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Image Preview with carousel navigation */}
              <div className="space-y-4">
                <div className="aspect-square bg-dark-900 rounded-lg overflow-hidden relative">
                  {currentImage ? (
                    <>
                      <img
                        src={currentImage}
                        alt="Post preview"
                        className="w-full h-full object-cover"
                      />
                      {/* Overlay navigation arrows for carousel */}
                      {isCarousel && (
                        <>
                          <button
                            onClick={goToPrev}
                            className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                          >
                            <ChevronRight className="w-5 h-5 rotate-180" />
                          </button>
                          <button
                            onClick={goToNext}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                          >
                            <ChevronRight className="w-5 h-5" />
                          </button>
                          {/* Dot indicators */}
                          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/50">
                            {carouselImages.map((_, idx) => (
                              <button
                                key={idx}
                                onClick={() => goToIndex(idx)}
                                className={`w-2 h-2 rounded-full transition-all ${
                                  idx === currentIndex
                                    ? 'bg-white'
                                    : 'bg-white/50 hover:bg-white/70'
                                }`}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-dark-500">
                      No image
                    </div>
                  )}
                </div>
                {/* Draggable thumbnail strip for carousel */}
                {isCarousel && (
                  <div className="space-y-2">
                    <p className="text-xs text-dark-400 flex items-center gap-1">
                      <GripVertical className="w-3 h-3" />
                      Drag thumbnails to swap positions
                    </p>
                    <div className="flex gap-3 overflow-x-auto pb-2 px-1">
                      {carouselImages.map((img, idx) => (
                        <div
                          key={`carousel-thumb-${idx}-${img.substring(0, 20)}`}
                          draggable="true"
                          onDragStart={(e) => handleDragStart(e, idx)}
                          onDragOver={(e) => handleDragOver(e, idx)}
                          onDragLeave={(e) => handleDragLeave(e)}
                          onDrop={(e) => handleDrop(e, idx)}
                          onDragEnd={(e) => handleDragEnd(e)}
                          onClick={() => goToIndex(idx)}
                          className={`w-20 h-20 flex-shrink-0 rounded-lg border-3 cursor-grab active:cursor-grabbing transition-all relative select-none ${
                            dragOverIndex === idx
                              ? 'border-dark-100 scale-110 ring-4 ring-dark-300/50 z-10'
                              : idx === currentIndex
                              ? 'border-dark-100 ring-2 ring-dark-300/50'
                              : 'border-dark-500 hover:border-dark-300'
                          } ${draggedIndex === idx ? 'opacity-40 scale-90' : ''}`}
                          style={{ touchAction: 'none' }}
                        >
                          {/* Image - no pointer events so parent handles drag */}
                          <img
                            src={img}
                            alt={`Slide ${idx + 1}`}
                            className="w-full h-full object-cover rounded-md pointer-events-none"
                            draggable="false"
                            onDragStart={(e) => e.preventDefault()}
                          />
                          {/* Position number badge */}
                          <div className="absolute top-1 left-1 w-6 h-6 rounded-full bg-black/80 flex items-center justify-center text-xs text-white font-bold pointer-events-none">
                            {idx + 1}
                          </div>
                          {/* Drag handle indicator */}
                          <div className="absolute bottom-1 right-1 p-1 rounded bg-black/60 pointer-events-none">
                            <GripVertical className="w-3 h-3 text-white/80" />
                          </div>
                          {/* Drop indicator overlay */}
                          {dragOverIndex === idx && draggedIndex !== idx && (
                            <div className="absolute inset-0 bg-dark-600/50 rounded-md flex items-center justify-center pointer-events-none">
                              <span className="text-white text-xs font-bold bg-dark-100 text-dark-900 px-2 py-1 rounded">SWAP</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Edit Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Caption
                  </label>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Write a caption..."
                    rows={6}
                    maxLength={2200}
                    className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:border-dark-300 focus:ring-1 focus:ring-dark-300 outline-none resize-none"
                  />
                  <p className="text-xs text-dark-500 mt-1 text-right">{caption.length}/2200</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Hashtags
                  </label>
                  <textarea
                    value={hashtags}
                    onChange={(e) => setHashtags(e.target.value)}
                    placeholder="#photography #nature #travel"
                    rows={3}
                    className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:border-dark-300 focus:ring-1 focus:ring-dark-300 outline-none resize-none"
                  />
                  <p className="text-xs text-dark-500 mt-1">
                    {hashtags.split(/[\s,]+/).filter(h => h.length > 0).length} hashtags
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'instagram' && (
            <div className="p-6 flex justify-center">
              {/* Instagram Post Preview */}
              <div className="w-full max-w-[470px] bg-black rounded-lg overflow-hidden border border-dark-700">
                {/* Header */}
                <div className="flex items-center gap-3 p-3">
                  <div className="w-8 h-8 rounded-full bg-dark-600 p-0.5">
                    <div className="w-full h-full rounded-full bg-dark-800 flex items-center justify-center overflow-hidden">
                      {userAvatar ? (
                        <img src={userAvatar} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-4 h-4 text-dark-400" />
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-white">{instagramUsername}</span>
                  <div className="ml-auto">
                    <MoreHorizontal className="w-5 h-5 text-white" />
                  </div>
                </div>

                {/* Image with carousel navigation */}
                <div className="aspect-square bg-dark-900 relative">
                  {currentImage ? (
                    <>
                      <img src={currentImage} alt="Post" className="w-full h-full object-cover" />
                      {/* Carousel navigation overlay */}
                      {isCarousel && (
                        <>
                          <button
                            onClick={goToPrev}
                            className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white/90 hover:bg-white text-black transition-colors shadow-lg"
                          >
                            <ChevronRight className="w-4 h-4 rotate-180" />
                          </button>
                          <button
                            onClick={goToNext}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white/90 hover:bg-white text-black transition-colors shadow-lg"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          {/* Instagram-style dot indicators */}
                          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1">
                            {carouselImages.map((_, idx) => (
                              <div
                                key={idx}
                                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                                  idx === currentIndex ? 'bg-blue-500' : 'bg-white/50'
                                }`}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-dark-500">
                      No image
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="p-3">
                  <div className="flex items-center gap-4 mb-2">
                    <Heart className="w-6 h-6 text-white cursor-pointer hover:text-dark-300" />
                    <MessageCircle className="w-6 h-6 text-white cursor-pointer hover:text-dark-300" />
                    <Send className="w-6 h-6 text-white cursor-pointer hover:text-dark-300" />
                    {/* Carousel indicator in actions row */}
                    {isCarousel && (
                      <div className="flex-1 flex justify-center">
                        <div className="flex items-center gap-1">
                          {carouselImages.map((_, idx) => (
                            <div
                              key={idx}
                              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                                idx === currentIndex ? 'bg-blue-500' : 'bg-dark-500'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="ml-auto">
                      <Bookmark className="w-6 h-6 text-white cursor-pointer hover:text-dark-300" />
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-white mb-1">{likes.toLocaleString()} likes</p>
                  <p className="text-sm text-white">
                    <span className="font-semibold">{instagramUsername}</span>{' '}
                    {caption || <span className="text-dark-500 italic">No caption</span>}
                  </p>
                  {hashtags && (
                    <p className="text-sm text-blue-400 mt-1">
                      {hashtags.split(/[\s,]+/).filter(h => h.length > 0).slice(0, 5).join(' ')}
                      {hashtags.split(/[\s,]+/).filter(h => h.length > 0).length > 5 && '...'}
                    </p>
                  )}
                  <p className="text-xs text-dark-500 mt-2">View all {comments} comments</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tiktok' && (
            <div className="p-6 flex justify-center">
              {/* TikTok Feed Preview */}
              <div className="w-full max-w-[320px] bg-black rounded-2xl overflow-hidden border border-dark-700 relative" style={{ aspectRatio: '9/16' }}>
                {/* Background Image */}
                <div className="absolute inset-0">
                  {currentImage ? (
                    <img src={currentImage} alt="Post" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-dark-900 flex items-center justify-center text-dark-500">
                      No image
                    </div>
                  )}
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                </div>

                {/* Carousel navigation for TikTok */}
                {isCarousel && (
                  <>
                    <button
                      onClick={goToPrev}
                      className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors"
                    >
                      <ChevronRight className="w-5 h-5 rotate-180" />
                    </button>
                    <button
                      onClick={goToNext}
                      className="absolute right-14 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    {/* Carousel dots */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/30">
                      {carouselImages.map((_, idx) => (
                        <div
                          key={idx}
                          className={`w-1.5 h-1.5 rounded-full transition-colors ${
                            idx === currentIndex ? 'bg-white' : 'bg-white/40'
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}

                {/* Right side actions */}
                <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full bg-dark-800 border-2 border-white flex items-center justify-center overflow-hidden">
                      {userAvatar ? (
                        <img src={userAvatar} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-5 h-5 text-white" />
                      )}
                    </div>
                    <div className="w-5 h-5 -mt-2 rounded-full bg-dark-100 flex items-center justify-center">
                      <Plus className="w-3 h-3 text-white" />
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    <Heart className="w-8 h-8 text-white" />
                    <span className="text-xs text-white mt-1">{(likes / 1000).toFixed(1)}K</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <MessageCircle className="w-8 h-8 text-white" />
                    <span className="text-xs text-white mt-1">{comments}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <Bookmark className="w-8 h-8 text-white" />
                    <span className="text-xs text-white mt-1">Save</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <Share2 className="w-8 h-8 text-white" />
                    <span className="text-xs text-white mt-1">Share</span>
                  </div>
                </div>

                {/* Bottom content */}
                <div className="absolute left-3 right-16 bottom-4">
                  <p className="text-sm font-semibold text-white mb-1">{tiktokUsername}</p>
                  <p className="text-sm text-white line-clamp-2">
                    {caption || <span className="text-dark-400 italic">No caption</span>}
                  </p>
                  {hashtags && (
                    <p className="text-sm text-white mt-1 line-clamp-1">
                      {hashtags.split(/[\s,]+/).filter(h => h.length > 0).slice(0, 3).join(' ')}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-4 h-4 rounded bg-dark-700 animate-spin" style={{ animationDuration: '3s' }} />
                    <span className="text-xs text-white">Original Sound - {tiktokUsername}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-dark-700 flex items-center justify-between">
          <button
            onClick={() => setShowAIGenerator(true)}
            className="px-4 py-2 text-sm bg-dark-700 text-white rounded-lg hover:bg-dark-600 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4 text-dark-100" />
            AI Generate
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-dark-300 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 text-sm bg-dark-100 text-dark-900 rounded-lg hover:bg-white transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* AI Generator Modal */}
      {showAIGenerator && (
        <PostAIGenerator
          post={post}
          onClose={() => setShowAIGenerator(false)}
          onApplyCaption={(newCaption) => setCaption(newCaption)}
        />
      )}
    </div>
  );
}

function GridPreview({ posts, layout, showRowHandles = true, onDeletePost, gridId, onGridChange }) {
  const cols = layout?.cols || 3;
  const user = useAppStore((state) => state.user);
  const setUser = useAppStore((state) => state.setUser);
  const setGridPosts = useAppStore((state) => state.setGridPosts);
  const selectPost = useAppStore((state) => state.selectPost);

  // Get current profile for profile-specific avatar/bio
  const profiles = useAppStore((state) => state.profiles);
  const currentProfileId = useAppStore((state) => state.currentProfileId);
  const updateProfile = useAppStore((state) => state.updateProfile);
  const currentProfile = profiles.find(p => (p._id || p.id) === currentProfileId);

  // Use profile data if available, otherwise fall back to user data
  const displayData = {
    name: currentProfile?.name || user?.name || 'username',
    username: currentProfile?.username || user?.socialAccounts?.instagram?.username || user?.name || 'username',
    avatar: currentProfile?.avatar || user?.avatar,
    avatarPosition: currentProfile?.avatarPosition || user?.avatarPosition || { x: 0, y: 0 },
    avatarZoom: currentProfile?.avatarZoom || user?.avatarZoom || 1,
    bio: currentProfile?.bio || user?.bio,
    brandName: currentProfile?.brandName || currentProfile?.name || user?.brandName || user?.name || 'Your Name',
    pronouns: currentProfile?.pronouns || user?.pronouns,
    instagramHighlights: currentProfile?.instagramHighlights || user?.instagramHighlights || [],
  };

  // FORCE conviction scores on ALL posts immediately (demo scores for testing)
  const postsWithConviction = useMemo(() => {
    console.log('[Conviction MEMO] Processing', posts?.length || 0, 'posts');
    if (!posts || posts.length === 0) {
      console.log('[Conviction MEMO] No posts to process');
      return posts;
    }

    const processed = posts.map((post, index) => {
      if (post.conviction) {
        console.log('[Conviction MEMO] Post', index, 'already has conviction:', post.conviction.score);
        return post;
      }

      // Generate demo score (50-90)
      const demoScore = 50 + Math.floor(Math.random() * 40);
      console.log('[Conviction MEMO] Adding demo score', demoScore, 'to post', index);

      return {
        ...post,
        conviction: {
          score: demoScore,
          tier: demoScore >= 80 ? 'exceptional' : demoScore >= 70 ? 'high' : demoScore >= 50 ? 'medium' : 'low',
          archetypeMatch: {
            designation: 'Visionary',
            glyph: 'SG',
            confidence: 0.85
          },
          breakdown: {
            performance: demoScore - 5,
            taste: demoScore + 5,
            brand: demoScore
          },
          weights: { performance: 0.3, taste: 0.5, brand: 0.2 },
          calculatedAt: new Date()
        }
      };
    });

    console.log('[Conviction MEMO] Processed:', processed.filter(p => p.conviction).length, 'posts with conviction');
    return processed;
  }, [posts]);

  // Group posts into rows (use postsWithConviction instead of posts)
  const rows = [];
  for (let i = 0; i < postsWithConviction.length; i += cols) {
    rows.push(postsWithConviction.slice(i, i + cols));
  }

  // Row IDs for sortable context
  const rowIds = rows.map((_, index) => `row-${index}`);

  // Drag and drop state for rows
  const [activeRowId, setActiveRowId] = useState(null);
  const rowSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Handle row drag start
  const handleRowDragStart = (event) => {
    setActiveRowId(event.active.id);
  };

  // Handle row drag end
  const handleRowDragEnd = async (event) => {
    const { active, over } = event;
    setActiveRowId(null);

    if (over && active.id !== over.id) {
      const oldIndex = rowIds.indexOf(active.id);
      const newIndex = rowIds.indexOf(over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        // Reorder the rows
        const newRows = arrayMove([...rows], oldIndex, newIndex);
        // Flatten back to single array
        const newPosts = newRows.flat();
        setGridPosts(newPosts);

        // What-If Mode: Calculate new score after drag
        if (whatIfMode && showAestheticScore) {
          const gridItems = newPosts.filter(p => p.conviction);
          if (gridItems.length > 0) {
            const newScore = calculateAestheticScore(gridItems, cols);
            setWhatIfScore(newScore);
            console.log('[What-If] Score changed:', originalScore?.overallScore, '→', newScore?.overallScore);
          }
        }

        // Persist to backend
        if (gridId) {
          try {
            await gridApi.reorder(gridId, newPosts.map((p, i) => ({
              contentId: p.id || p._id,
              position: i,
            })));
            // Notify parent to refresh grid data
            onGridChange?.();
          } catch (err) {
            console.error('Failed to save row reorder:', err);
          }
        }
      }
    }
  };

  // Get active row for drag overlay
  const activeRowIndex = activeRowId ? parseInt(activeRowId.replace('row-', '')) : null;
  const activeRow = activeRowIndex !== null ? rows[activeRowIndex] : null;

  // Item drag and drop state (for replace/carousel)
  const [showDropModal, setShowDropModal] = useState(false);
  const [dropSource, setDropSource] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  // Selection and delete state
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  // Post preview modal state (for locked mode)
  const [showPostPreview, setShowPostPreview] = useState(false);
  const [previewPost, setPreviewPost] = useState(null);

  // Tab state for Posts/Reels/Tagged
  const [activeTab, setActiveTab] = useState('posts');

  // Get conviction functions from store
  const {
    gridConvictionView,
    updateGridConvictionView,
    getCachedConviction,
    setCachedConviction,
    getCurrentProfile
  } = useAppStore();

  // Conviction features - initialize from store
  const [showConvictionOverlays, setShowConvictionOverlays] = useState(gridConvictionView?.showOverlays ?? true);
  const [showAestheticScore, setShowAestheticScore] = useState(gridConvictionView?.showAestheticScore ?? true);
  const [whatIfMode, setWhatIfMode] = useState(gridConvictionView?.whatIfMode ?? false);
  const [originalScore, setOriginalScore] = useState(null);
  const [whatIfScore, setWhatIfScore] = useState(null);
  const [loadingConviction, setLoadingConviction] = useState(false);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [aestheticPanelExpanded, setAestheticPanelExpanded] = useState(true);
  const [controlPanelExpanded, setControlPanelExpanded] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Reels state
  const reels = useAppStore((state) => state.reels);
  const setReels = useAppStore((state) => state.setReels);
  const addReel = useAppStore((state) => state.addReel);
  const reorderReels = useAppStore((state) => state.reorderReels);
  const [isVideoDragOver, setIsVideoDragOver] = useState(false);
  const [uploadingReel, setUploadingReel] = useState(false);
  const videoDragCounterRef = useRef(0);

  // Reel Collections state
  const reelCollections = useAppStore((state) => state.reelCollections);
  const setReelCollections = useAppStore((state) => state.setReelCollections);
  const addReelCollection = useAppStore((state) => state.addReelCollection);
  const updateReelCollection = useAppStore((state) => state.updateReelCollection);
  const deleteReelCollection = useAppStore((state) => state.deleteReelCollection);
  const currentReelCollectionId = useAppStore((state) => state.currentReelCollectionId);
  const setCurrentReelCollection = useAppStore((state) => state.setCurrentReelCollection);
  const [showReelCollectionSelector, setShowReelCollectionSelector] = useState(false);
  const [editingReelCollectionId, setEditingReelCollectionId] = useState(null);
  const [editingReelCollectionName, setEditingReelCollectionName] = useState('');
  const [showDeleteReelCollectionConfirm, setShowDeleteReelCollectionConfirm] = useState(null);
  const [isLoadingCollections, setIsLoadingCollections] = useState(true);

  // Rollout picker state (for adding reel collections to rollouts)
  const [showRolloutPicker, setShowRolloutPicker] = useState(false);
  const [rolloutPickerCollectionId, setRolloutPickerCollectionId] = useState(null);
  const rollouts = useAppStore((state) => state.rollouts);
  const setRollouts = useAppStore((state) => state.setRollouts);

  // Fetch reel collections on mount (always fetch fresh data to ensure populated content)
  useEffect(() => {
    const fetchReelCollections = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setIsLoadingCollections(false);
        return;
      }
      try {
        console.log('[Instagram] Fetching fresh collections from backend...');
        setIsLoadingCollections(true);
        const collections = await reelCollectionApi.getAll(); // Get all collections with populated contentId
        console.log('[Instagram] Fetched collections:', collections.length);
        if (collections.length > 0) {
          console.log('[Instagram] First collection reels:', collections[0]?.reels?.length);
        }
        setReelCollections(collections);
      } catch (err) {
        console.error('Failed to fetch reel collections:', err);
      } finally {
        setIsLoadingCollections(false);
      }
    };
    // Always fetch fresh data on mount to ensure contentId is populated
    fetchReelCollections();
  }, [setReelCollections]);

  // Filter collections for Instagram platform
  const instagramCollections = reelCollections.filter(c => c.platform === 'instagram' || c.platform === 'both');

  // Auto-select first Instagram collection if none selected
  useEffect(() => {
    if (instagramCollections.length > 0 && !currentReelCollectionId) {
      setCurrentReelCollection(instagramCollections[0]._id);
    }
  }, [instagramCollections.length, currentReelCollectionId, setCurrentReelCollection]);

  // Get current reel collection (must be an instagram collection)
  // If current selection isn't an instagram collection, fall back to first instagram collection
  let currentReelCollection = instagramCollections.find(c => (c._id || c.id) === currentReelCollectionId);
  if (!currentReelCollection && instagramCollections.length > 0) {
    currentReelCollection = instagramCollections[0];
  }

  // Reel collection handlers
  const handleCreateReelCollection = async () => {
    try {
      const collection = await reelCollectionApi.create({
        name: `Reels ${instagramCollections.length + 1}`,
        platform: 'instagram'
      });
      addReelCollection(collection);
      setCurrentReelCollection(collection._id);
      setShowReelCollectionSelector(false);
    } catch (err) {
      console.error('Failed to create reel collection:', err);
    }
  };

  const handleSelectReelCollection = (collection) => {
    setCurrentReelCollection(collection._id || collection.id);
    setShowReelCollectionSelector(false);
  };

  const handleStartRenameReelCollection = (e, collection) => {
    e.stopPropagation();
    setEditingReelCollectionId(collection._id || collection.id);
    setEditingReelCollectionName(collection.name);
  };

  const handleSaveRenameReelCollection = async (e, collectionId) => {
    e.stopPropagation();
    if (!editingReelCollectionName.trim()) {
      setEditingReelCollectionId(null);
      return;
    }
    try {
      await reelCollectionApi.update(collectionId, { name: editingReelCollectionName.trim() });
      updateReelCollection(collectionId, { name: editingReelCollectionName.trim() });
      setEditingReelCollectionId(null);
    } catch (err) {
      console.error('Failed to rename reel collection:', err);
    }
  };

  const handleCancelRenameReelCollection = (e) => {
    e.stopPropagation();
    setEditingReelCollectionId(null);
    setEditingReelCollectionName('');
  };

  const handleDeleteReelCollection = async (e, collectionId) => {
    e.stopPropagation();
    try {
      await reelCollectionApi.delete(collectionId);
      deleteReelCollection(collectionId);
      // Select another Instagram collection if we deleted the current one
      if (currentReelCollectionId === collectionId && instagramCollections.length > 1) {
        const remaining = instagramCollections.filter(c => (c._id || c.id) !== collectionId);
        if (remaining.length > 0) {
          setCurrentReelCollection(remaining[0]._id || remaining[0].id);
        }
      }
      setShowDeleteReelCollectionConfirm(null);
    } catch (err) {
      console.error('Failed to delete reel collection:', err);
    }
  };

  // Reel player, editor, and thumbnail selector state
  const [selectedReel, setSelectedReel] = useState(null);
  const [showReelPlayer, setShowReelPlayer] = useState(false);
  const [showReelEditor, setShowReelEditor] = useState(false);
  const [showThumbnailSelector, setShowThumbnailSelector] = useState(false);
  const [pendingReelUpload, setPendingReelUpload] = useState(null); // Stores video file for thumbnail selection after upload
  const [reelRowDragActiveId, setReelRowDragActiveId] = useState(null);

  // Get reels for current collection only (populated contentId objects)
  // Handle both populated objects and raw ObjectId strings
  const collectionReels = currentReelCollection?.reels
    ?.map((r, index) => {
      // If contentId is a populated object with mediaUrl, return it
      if (r.contentId && typeof r.contentId === 'object' && r.contentId.mediaUrl) {
        return r.contentId;
      }
      // Log why this reel is being skipped
      console.log(`[Instagram Display] Skipping reel ${index}:`, {
        hasContentId: !!r.contentId,
        contentIdType: typeof r.contentId,
        hasMediaUrl: r.contentId?.mediaUrl ? 'yes' : 'no',
        contentId: r.contentId
      });
      return null;
    })
    ?.filter(Boolean) || [];

  // Debug logging
  if (currentReelCollection) {
    console.log('[Instagram Display] Current collection:', currentReelCollection.name, 'ID:', currentReelCollection._id);
    console.log('[Instagram Display] Total reels in collection:', currentReelCollection.reels?.length || 0);
    console.log('[Instagram Display] Displayable reels (with mediaUrl):', collectionReels.length);
    if (currentReelCollection.reels?.length !== collectionReels.length) {
      console.warn('[Instagram Display] WARNING: Some reels are not displayable!');
    }
  }

  // Group reels into rows of 3
  const reelRows = [];
  for (let i = 0; i < collectionReels.length; i += 3) {
    reelRows.push(collectionReels.slice(i, i + 3));
  }
  const reelRowIds = reelRows.map((_, index) => `reel-row-${index}`);

  // Reel row drag sensors
  const reelRowSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Handle item selection - in locked mode, open preview modal instead
  const handleSelectItem = useCallback((postId) => {
    // Support both grid posts and reels when previewing
    const allItems = [...posts, ...collectionReels];
    const post = allItems.find(p => (p.id || p._id) === postId);
    const nextId = post ? postId : null;
    setSelectedItemId(prev => (prev === nextId ? null : nextId));
    selectPost(nextId || null);
    setPreviewPost(post || null);
    setShowPostPreview(false); // keep editing in side panel instead of modal
  }, [posts, collectionReels, selectPost]);

  // Handle delete request (from trash icon or keyboard)
  const handleDeleteRequest = useCallback((postId) => {
    const post = posts.find(p => (p.id || p._id) === postId);
    if (post) {
      setItemToDelete(post);
      setShowDeleteConfirm(true);
    }
  }, [posts]);

  // Confirm delete
  const handleConfirmDelete = useCallback(() => {
    if (itemToDelete) {
      const itemId = itemToDelete.id || itemToDelete._id;
      // Call the parent's delete handler which persists to backend
      if (onDeletePost) {
        onDeletePost(itemId);
      } else {
        // Fallback to local-only delete if no handler provided
        const newPosts = posts.filter(p => (p.id || p._id) !== itemId);
        setGridPosts(newPosts);
      }
      setSelectedItemId(null);
      selectPost(null);
    }
    setShowDeleteConfirm(false);
    setItemToDelete(null);
  }, [itemToDelete, posts, setGridPosts, onDeletePost, selectPost]);

  // Cancel delete
  const handleCancelDelete = useCallback(() => {
    setShowDeleteConfirm(false);
    setItemToDelete(null);
  }, []);

  // Save post preview changes (caption, hashtags, carousel images)
  const handleSavePostPreview = useCallback(async (updates) => {
    if (!previewPost) return;

    const postId = previewPost.id || previewPost._id;

    try {
      // Prepare API updates (convert images array to carouselImages for backend)
      const apiUpdates = { ...updates };
      if (updates.images) {
        apiUpdates.carouselImages = updates.images;
        apiUpdates.mediaUrl = updates.images[0]; // Update main media URL
        delete apiUpdates.images; // Remove frontend-specific field
        delete apiUpdates.image; // Remove frontend-specific field
      }

      // Update via API
      await contentApi.update(postId, apiUpdates);

      // Update local state with frontend format
      const localUpdates = { ...updates };
      if (updates.images) {
        localUpdates.image = updates.images[0];
      }

      const updatedPosts = posts.map(p =>
        (p.id || p._id) === postId
          ? { ...p, ...localUpdates }
          : p
      );
      setGridPosts(updatedPosts);
    } catch (err) {
      console.error('Failed to save post:', err);
      throw err;
    }
  }, [previewPost, posts, setGridPosts]);

  // Keyboard listener for Delete/Backspace and Enter to confirm delete
  useEffect(() => {
    const handleKeyDown = (e) => {
      // If delete modal is open, Enter confirms delete, Escape cancels
      if (showDeleteConfirm) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleConfirmDelete();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancelDelete();
        }
        return;
      }

      // Normal selection mode
      if (selectedItemId && (e.key === 'Delete' || e.key === 'Backspace')) {
        // Don't trigger if user is typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
          return;
        }
        e.preventDefault();
        handleDeleteRequest(selectedItemId);
      }
      // Escape to deselect
      if (e.key === 'Escape') {
        setSelectedItemId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItemId, handleDeleteRequest, showDeleteConfirm, handleConfirmDelete, handleCancelDelete]);

  // Batch calculate conviction scores for grid posts
  useEffect(() => {
    const calculateGridConvictions = async () => {
      console.log('[Conviction] useEffect triggered. Posts:', posts?.length);

      if (!posts || posts.length === 0) {
        console.log('[Conviction] No posts to process');
        return;
      }

      // Check if any posts already have conviction data
      const postsWithConviction = posts.filter(p => p.conviction);
      console.log('[Conviction] Posts with conviction:', postsWithConviction.length, '/', posts.length);

      if (postsWithConviction.length === posts.length) {
        console.log('[Conviction] All posts already have conviction data');
        // Calculate aesthetic score even if all posts have conviction
        if (showAestheticScore && postsWithConviction.length > 0) {
          const score = calculateAestheticScore(postsWithConviction, cols);
          setOriginalScore(score);
          console.log('[Conviction] Aesthetic score calculated from existing data:', score);
        }
        return; // All posts already have data
      }

      setLoadingConviction(true);
      console.log('[Conviction] Starting calculation for', posts.length, 'posts');

      // IMMEDIATE FALLBACK: Add demo scores right away for testing
      console.log('[Conviction] Applying demo scores for UI testing...');
      const postsWithDemoScores = posts.map(post => {
        if (post.conviction) {
          console.log('[Conviction] Post', post._id || post.id, 'already has conviction');
          return post;
        }

        const demoScore = 50 + Math.floor(Math.random() * 40); // Random 50-90
        const demoConviction = {
          score: demoScore,
          tier: demoScore >= 80 ? 'exceptional' : demoScore >= 70 ? 'high' : demoScore >= 50 ? 'medium' : 'low',
          archetypeMatch: {
            designation: 'Visionary',
            glyph: 'SG',
            confidence: 0.85
          },
          breakdown: {
            performance: demoScore - 5,
            taste: demoScore + 5,
            brand: demoScore
          },
          weights: { performance: 0.3, taste: 0.5, brand: 0.2 },
          calculatedAt: new Date()
        };

        console.log('[Conviction] Added demo score', demoScore, 'to post', post._id || post.id);

        return {
          ...post,
          conviction: demoConviction
        };
      });

      setGridPosts(postsWithDemoScores);
      console.log('[Conviction] Applied demo scores to all posts');

      // Calculate initial aesthetic score from demo data
      if (showAestheticScore) {
        const gridItems = postsWithDemoScores.filter(p => p.conviction);
        if (gridItems.length > 0) {
          const score = calculateAestheticScore(gridItems, cols);
          setOriginalScore(score);
          console.log('[Conviction] Initial aesthetic score from demo data:', score);
        }
      }

      // Now try the real API (this will override demo scores if successful)
      const currentProfile = getCurrentProfile();
      const profileId = currentProfile?._id || currentProfile?.id;

      // Get content IDs
      const contentIds = posts
        .map(p => p._id || p.id)
        .filter(Boolean);

      if (contentIds.length === 0) {
        setLoadingConviction(false);
        console.log('[Conviction] No valid content IDs');
        return;
      }

      // Initialize finalPosts with demo scores (will be updated if API succeeds)
      let finalPosts = postsWithDemoScores;

      try {
        console.log('[Conviction] Calling API for', contentIds.length, 'items');
        const results = await convictionApi.batchCalculate(contentIds, profileId);
        console.log('[Conviction] API Response:', results);

        // ONLY update if API returned valid results
        if (results?.results && results.results.length > 0) {
          console.log('[Conviction] API returned', results.results.length, 'conviction scores');

          // Merge REAL conviction data from API (overrides demo scores)
          finalPosts = postsWithDemoScores.map(post => {
            const postId = post._id || post.id;
            const convictionData = results.results?.find(r => r.contentId === postId);

            if (convictionData) {
              console.log('[Conviction] Replacing demo score with real API score for post', postId);
              setCachedConviction(postId, convictionData.conviction);
              return {
                ...post,
                conviction: convictionData.conviction
              };
            }

            // Keep demo score if API didn't have data for this post
            return post;
          });

          setGridPosts(finalPosts);
          console.log('[Conviction] Updated with API data:', finalPosts.filter(p => p.conviction).length, 'with conviction data');
        } else {
          console.log('[Conviction] API returned no results - keeping demo scores');
          // Don't update posts - keep the demo scores we already applied
        }
      } catch (err) {
        console.error('[Conviction] API call failed:', err);
        console.error('[Conviction] Error details:', err.response?.data || err.message);
        console.log('[Conviction] Keeping demo scores due to API error');
        // finalPosts already set to postsWithDemoScores
      }

      // Calculate initial aesthetic score using finalPosts (either API data or demo scores)
      if (showAestheticScore) {
        const gridItems = finalPosts.filter(p => p.conviction);
        if (gridItems.length > 0) {
          const score = calculateAestheticScore(gridItems, cols);
          setOriginalScore(score);
          console.log('[Conviction] Initial aesthetic score:', score);
        }
      }

      setLoadingConviction(false);
    };

    calculateGridConvictions();
  }, [posts.length]);

  // Click outside to deselect
  const handleBackgroundClick = useCallback(() => {
    setSelectedItemId(null);
    selectPost(null);
  }, [selectPost]);

  // Video drag handlers for Reels tab - stop propagation to prevent GridPlanner from handling
  const handleVideoDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    videoDragCounterRef.current++;
    console.log('[Instagram Drag] Enter - counter:', videoDragCounterRef.current, 'types:', e.dataTransfer?.types);
    if (e.dataTransfer?.types?.includes('Files')) {
      setIsVideoDragOver(true);
    }
  };

  const handleVideoDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleVideoDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    videoDragCounterRef.current--;
    if (videoDragCounterRef.current === 0) {
      setIsVideoDragOver(false);
    }
  };

  const handleVideoDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[Instagram Drop] Drop event received');
    setIsVideoDragOver(false);
    videoDragCounterRef.current = 0;

    // Check if user is authenticated
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('Please log in to upload reels');
      alert('Please log in to upload reels');
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    const videoFile = files.find(f => f.type.startsWith('video/'));

    if (!videoFile) {
      console.error('No video file found in drop');
      return;
    }

    setUploadingReel(true);

    try {
      // Generate initial thumbnail
      console.log('[Instagram Drop] Generating thumbnail...');
      const { thumbnailBlob, duration, width, height, isVertical } =
        await generateVideoThumbnail(videoFile);
      console.log('[Instagram Drop] Thumbnail generated:', { duration, width, height, isVertical });

      // Upload video with thumbnail
      console.log('[Instagram Drop] Uploading to server...');
      const result = await contentApi.uploadReel(videoFile, thumbnailBlob, {
        title: videoFile.name.replace(/\.[^/.]+$/, ''),
        mediaType: 'video',
        duration,
        width,
        height,
        isReel: true,
        recommendedType: isVertical ? 'reel' : 'video'
      });
      console.log('[Instagram Drop] Upload response:', result);

      // Add to reels state - the response contains both message and content
      const uploadedReel = result.content || result;
      console.log('[Instagram Drop] Uploaded reel ID:', uploadedReel._id || uploadedReel.id);
      console.log('[Instagram Drop] Uploaded reel mediaUrl:', uploadedReel.mediaUrl);
      addReel(uploadedReel);

      // Add reel to current collection - use the displayed collection (with fallback) or create one
      // Get the currently displayed collection (same logic as display)
      const displayedInstaCollections = reelCollections.filter(c => c.platform === 'instagram' || c.platform === 'both');
      let targetCollection = displayedInstaCollections.find(c => (c._id || c.id) === currentReelCollectionId);
      if (!targetCollection && displayedInstaCollections.length > 0) {
        targetCollection = displayedInstaCollections[0];
      }

      let collectionId = targetCollection?._id || targetCollection?.id;
      console.log('[Instagram Upload] Target collection:', targetCollection?.name, 'ID:', collectionId);

      // If no collection exists, create one first
      if (!collectionId) {
        console.log('[Instagram Upload] No collection exists, creating new one...');
        try {
          const newCollection = await reelCollectionApi.create({
            name: `Reels ${displayedInstaCollections.length + 1}`,
            platform: 'instagram'
          });
          addReelCollection(newCollection);
          setCurrentReelCollection(newCollection._id);
          collectionId = newCollection._id;
        } catch (createErr) {
          console.error('Failed to create collection:', createErr);
        }
      }

      // Now add the reel to the collection
      if (collectionId) {
        try {
          const updatedCollection = await reelCollectionApi.addReel(collectionId, uploadedReel._id || uploadedReel.id);
          // Update the collection in state so the video shows immediately
          updateReelCollection(collectionId, updatedCollection);

          // Also refetch all collections to ensure state is synced
          const freshCollections = await reelCollectionApi.getAll();
          setReelCollections(freshCollections);
        } catch (collErr) {
          console.error('Failed to add reel to collection:', collErr);
        }
      }

      // Show thumbnail selector for the newly uploaded reel
      console.log('[Instagram Upload] SUCCESS! Reel uploaded and added to collection. Opening thumbnail selector...');
      setSelectedReel(uploadedReel);
      setPendingReelUpload(videoFile);
      setShowThumbnailSelector(true);
    } catch (err) {
      console.error('[Instagram Upload] Reel upload failed:', err);
      if (err.response?.status === 401) {
        alert('Please log in to upload reels');
      } else {
        alert('Upload failed: ' + (err.response?.data?.error || err.message));
      }
    } finally {
      setUploadingReel(false);
    }
  };

  // Fetch reels on component mount (only if authenticated)
  useEffect(() => {
    const fetchReels = async () => {
      // Only fetch if user is authenticated (has token)
      const token = localStorage.getItem('token');
      if (!token) {
        return;
      }

      try {
        const response = await api.get('/api/content', {
          params: { mediaType: 'video' }
        });
        const data = response.data;
        // Filter for reels (vertical videos or those marked as reel)
        const reelContent = (data.content || data).filter(c =>
          c.aiSuggestions?.recommendedType === 'reel' ||
          c.metadata?.isReel === true ||
          (c.metadata?.height && c.metadata?.width && c.metadata.height > c.metadata.width)
        );
        setReels(reelContent);
      } catch (err) {
        console.error('Failed to fetch reels:', err);
      }
    };
    fetchReels();
  }, [setReels, user]);

  // Handle clicking on a reel to edit it
  const handleReelEdit = (reel) => {
    setSelectedReel(reel);
    setShowReelEditor(true);
  };

  // Handle playing a reel
  const handleReelPlay = (reel) => {
    setSelectedReel(reel);
    setShowReelPlayer(true);
  };

  // Handle reordering reels by dragging
  const handleReelReorder = async (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    if (!currentReelCollection) return;

    const collectionId = currentReelCollection._id || currentReelCollection.id;
    const currentReels = currentReelCollection.reels || [];

    // Normalize IDs to strings for comparison
    const normalizeId = (id) => (id?._id || id?.id || id || '').toString();
    const sourceIdStr = normalizeId(sourceId);
    const targetIdStr = normalizeId(targetId);

    console.log('[Instagram Reorder] Starting reorder:', { sourceId: sourceIdStr, targetId: targetIdStr });
    console.log('[Instagram Reorder] Current reels count:', currentReels.length);

    // Find indices in the collection's reels array
    const sourceIndex = currentReels.findIndex(r => {
      const contentIdStr = normalizeId(r.contentId);
      return contentIdStr === sourceIdStr;
    });
    const targetIndex = currentReels.findIndex(r => {
      const contentIdStr = normalizeId(r.contentId);
      return contentIdStr === targetIdStr;
    });

    if (sourceIndex === -1 || targetIndex === -1) {
      console.error('[Instagram Reorder] Could not find reels in collection:', { sourceId, targetId, sourceIndex, targetIndex });
      return;
    }

    // Create new reels array with swapped positions
    const newReels = [...currentReels];
    [newReels[sourceIndex], newReels[targetIndex]] = [newReels[targetIndex], newReels[sourceIndex]];

    // Update local state immediately for instant UI feedback
    const updatedCollection = { ...currentReelCollection, reels: newReels };
    updateReelCollection(collectionId, updatedCollection);
    console.log('[Instagram Reorder] Local state updated, swapped:', sourceIndex, '<->', targetIndex);

    // Persist to backend and update with returned data
    try {
      const reelIds = newReels.map(r => normalizeId(r.contentId));
      console.log('[Instagram Reorder] Sending reelIds to backend:', reelIds);
      const returnedCollection = await reelCollectionApi.reorderReels(collectionId, reelIds);
      console.log('[Instagram Reorder] Backend returned collection with', returnedCollection?.reels?.length, 'reels');
      // Update with the populated collection from backend
      if (returnedCollection) {
        updateReelCollection(collectionId, returnedCollection);
      }
    } catch (err) {
      console.error('[Instagram Reorder] Failed to persist:', err);
      console.error('[Instagram Reorder] Error details:', err.response?.data || err.message);
      // Revert local state on error
      updateReelCollection(collectionId, currentReelCollection);
    }
  };

  // Handle opening thumbnail selector from editor
  const handleOpenThumbnailSelector = () => {
    setShowReelEditor(false);
    setShowReelPlayer(false);
    setShowThumbnailSelector(true);
  };

  // Handle saving reel edits
  const handleSaveReelEdits = async (updates) => {
    if (!selectedReel) return;

    const reelId = selectedReel._id || selectedReel.id;

    try {
      await api.put(`/api/content/${reelId}`, updates);

      // Update the reel in local state
      const updatedReels = reels.map(r =>
        (r._id || r.id) === reelId
          ? { ...r, ...updates }
          : r
      );
      setReels(updatedReels);

      // Close the editor
      setShowReelEditor(false);
      setSelectedReel(null);
    } catch (err) {
      console.error('Failed to save reel:', err);
      throw err;
    }
  };

  // Handle deleting a reel
  const handleDeleteReel = async () => {
    if (!selectedReel) return;

    const reelId = selectedReel._id || selectedReel.id;

    // Helper to normalize IDs for comparison
    const normalizeId = (id) => (id?._id || id?.id || id || '').toString();
    const reelIdStr = normalizeId(reelId);

    try {
      await api.delete(`/api/content/${reelId}`);

      // Remove from global reels state
      const updatedReels = reels.filter(r => (r._id || r.id) !== reelId);
      setReels(updatedReels);

      // Also update the current collection's reels for instant UI update
      if (currentReelCollection) {
        const collectionId = currentReelCollection._id || currentReelCollection.id;
        const updatedCollectionReels = currentReelCollection.reels?.filter(r => {
          const contentIdStr = normalizeId(r.contentId);
          return contentIdStr !== reelIdStr;
        }) || [];

        // Re-order remaining reels
        updatedCollectionReels.forEach((r, i) => { r.order = i; });

        updateReelCollection(collectionId, { ...currentReelCollection, reels: updatedCollectionReels });
      }

      // Close the editor
      setShowReelEditor(false);
      setSelectedReel(null);
    } catch (err) {
      console.error('Failed to delete reel:', err);
      throw err;
    }
  };

  // Handle reel row drag start
  const handleReelRowDragStart = (event) => {
    setReelRowDragActiveId(event.active.id);
  };

  // Handle reel row drag end - reorder rows
  const handleReelRowDragEnd = (event) => {
    const { active, over } = event;
    setReelRowDragActiveId(null);

    if (!over || active.id === over.id) return;

    const oldRowIndex = parseInt(active.id.replace('reel-row-', ''));
    const newRowIndex = parseInt(over.id.replace('reel-row-', ''));

    if (isNaN(oldRowIndex) || isNaN(newRowIndex)) return;

    // Swap the rows by reordering the reels array and persist atomically
    const newReelRows = arrayMove(reelRows, oldRowIndex, newRowIndex);
    const newReels = newReelRows.flat();
    reorderReels(newReels);
  };

  // Handle saving thumbnail
  const handleSaveThumbnail = async (thumbnailBlob) => {
    if (!selectedReel) return;

    const reelId = selectedReel._id || selectedReel.id;

    try {
      // Upload the new thumbnail
      const formData = new FormData();
      formData.append('thumbnail', thumbnailBlob, 'thumbnail.jpg');

      const response = await api.put(`/api/content/${reelId}/thumbnail`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      // Use the server-returned URL instead of local data URL
      const serverThumbnailUrl = response.data.content?.thumbnailUrl || response.data.thumbnailUrl;
      console.log('[Instagram Thumbnail] New thumbnail URL:', serverThumbnailUrl);

      // Helper to normalize IDs for comparison
      const normalizeId = (id) => (id?._id || id?.id || id || '').toString();
      const reelIdStr = normalizeId(reelId);

      // Update the reel in global state
      const updatedReels = reels.map(r =>
        normalizeId(r) === reelIdStr
          ? { ...r, thumbnailUrl: serverThumbnailUrl }
          : r
      );
      setReels(updatedReels);

      // Also update the thumbnail in the current collection's reels for instant UI update
      if (currentReelCollection) {
        const collectionId = currentReelCollection._id || currentReelCollection.id;
        const updatedCollectionReels = currentReelCollection.reels?.map(r => {
          const contentIdStr = normalizeId(r.contentId);
          if (contentIdStr === reelIdStr && r.contentId) {
            return { ...r, contentId: { ...r.contentId, thumbnailUrl: serverThumbnailUrl } };
          }
          return r;
        });
        updateReelCollection(collectionId, { ...currentReelCollection, reels: updatedCollectionReels });
        console.log('[Instagram Thumbnail] Updated collection state');
      }

      // Close the thumbnail selector
      setShowThumbnailSelector(false);
      setPendingReelUpload(null);
    } catch (err) {
      console.error('Failed to save thumbnail:', err);
      alert('Failed to save thumbnail. Please try again.');
    }
  };

  // Handle closing thumbnail selector
  const handleCloseThumbnailSelector = () => {
    setShowThumbnailSelector(false);
    setPendingReelUpload(null);
    // Don't clear selectedReel - might want to go back to editor
  };

  // Handle closing reel player
  const handleCloseReelPlayer = () => {
    setShowReelPlayer(false);
    setSelectedReel(null);
  };

  // Handle closing reel editor
  const handleCloseReelEditor = () => {
    setShowReelEditor(false);
    setSelectedReel(null);
  };

  // Handle item drag start (just for tracking)
  const handleItemDragStart = (postId, post) => {
    // Could track dragging state here if needed
  };

  // Handle reorder (default drag without shift) - just swap positions, no modal
  const handleReorder = async (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;

    const sourceIndex = posts.findIndex(p => (p.id || p._id) === sourceId);
    const targetIndex = posts.findIndex(p => (p.id || p._id) === targetId);

    if (sourceIndex === -1 || targetIndex === -1) return;

    // Swap the posts
    const newPosts = [...posts];
    [newPosts[sourceIndex], newPosts[targetIndex]] = [newPosts[targetIndex], newPosts[sourceIndex]];
    setGridPosts(newPosts);

    // Persist to backend
    if (gridId) {
      try {
        await gridApi.reorder(gridId, newPosts.map((p, i) => ({
          contentId: p.id || p._id,
          position: i,
        })));
        // Notify parent to refresh grid data
        onGridChange?.();
      } catch (err) {
        console.error('Failed to save reorder:', err);
      }
    }
  };

  // Handle replace/carousel drag (shift+drag) - show modal
  const handleReplaceOrCarouselDrag = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;

    const sourcePost = posts.find(p => (p.id || p._id) === sourceId);
    const targetPost = posts.find(p => (p.id || p._id) === targetId);

    if (sourcePost && targetPost) {
      setDropSource(sourcePost);
      setDropTarget(targetPost);
      setShowDropModal(true);
    }
  };

  // Handle replace action
  const handleReplace = async () => {
    if (!dropSource || !dropTarget) return;

    const sourceId = dropSource.id || dropSource._id;
    const targetId = dropTarget.id || dropTarget._id;

    // Get source images
    const sourceImages = dropSource.images || (dropSource.image ? [dropSource.image] : []);

    // Replace target with source content
    const newPosts = posts.map(p => {
      const postId = p.id || p._id;
      if (postId === targetId) {
        return {
          ...p,
          image: sourceImages[0] || dropSource.image,
          images: sourceImages.length > 1 ? sourceImages : undefined,
        };
      }
      return p;
    }).filter(p => (p.id || p._id) !== sourceId); // Remove source post

    setGridPosts(newPosts);

    // Persist to backend
    if (gridId) {
      try {
        // Reorder grid to remove the source
        await gridApi.reorder(gridId, newPosts.map((p, i) => ({
          contentId: p.id || p._id,
          position: i,
        })));
        // Notify parent to refresh grid data
        onGridChange?.();
      } catch (err) {
        console.error('Failed to save replace to backend:', err);
      }
    }

    setShowDropModal(false);
    setDropSource(null);
    setDropTarget(null);
  };

  // Handle carousel action
  const handleCreateCarousel = async () => {
    if (!dropSource || !dropTarget) return;

    const sourceId = dropSource.id || dropSource._id;
    const targetId = dropTarget.id || dropTarget._id;

    // Collect all images from both posts
    const sourceImages = dropSource.images || (dropSource.image ? [dropSource.image] : []);
    const targetImages = dropTarget.images || (dropTarget.image ? [dropTarget.image] : []);
    const combinedImages = [...targetImages, ...sourceImages];

    // Update target to be a carousel and remove source
    const newPosts = posts.map(p => {
      const postId = p.id || p._id;
      if (postId === targetId) {
        return {
          ...p,
          image: combinedImages[0], // First image for backwards compatibility
          images: combinedImages,
        };
      }
      return p;
    }).filter(p => (p.id || p._id) !== sourceId); // Remove source post

    setGridPosts(newPosts);

    // Persist to backend
    try {
      // Save carousel images to the target content
      if (targetId && targetId !== 'file-drop') {
        await contentApi.update(targetId, {
          carouselImages: combinedImages,
          mediaUrl: combinedImages[0],
        });
      }

      // Reorder grid to remove the source
      if (gridId && sourceId !== 'file-drop') {
        await gridApi.reorder(gridId, newPosts.map((p, i) => ({
          contentId: p.id || p._id,
          position: i,
        })));
      }

      // Notify parent to refresh grid data
      onGridChange?.();
    } catch (err) {
      console.error('Failed to save carousel to backend:', err);
    }

    setShowDropModal(false);
    setDropSource(null);
    setDropTarget(null);
  };

  // Cancel drop action
  const handleCancelDrop = () => {
    setShowDropModal(false);
    setDropSource(null);
    setDropTarget(null);
    setDroppedFiles(null);
    setDroppedFileObjects(null);
  };

  // State for file drops from Windows Explorer
  const [droppedFiles, setDroppedFiles] = useState(null);
  const [droppedFileObjects, setDroppedFileObjects] = useState(null); // Store actual File objects for upload

  // Handle file drop from Windows Explorer onto a grid item
  const handleFileDrop = async (targetPostId, targetPost, files) => {
    // Store actual file objects for later upload
    setDroppedFileObjects(Array.from(files));

    // Convert files to data URLs for preview
    const imagePromises = files.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
    });

    const imageDataUrls = await Promise.all(imagePromises);

    // Create a fake "source" post representing the dropped files
    const fakeSource = {
      id: 'file-drop',
      images: imageDataUrls,
      image: imageDataUrls[0],
    };

    setDropSource(fakeSource);
    setDropTarget(targetPost);
    setDroppedFiles(imageDataUrls);
    setShowDropModal(true);
  };

  // Modified replace handler to handle file drops
  const handleReplaceWithCheck = async () => {
    if (!dropSource || !dropTarget) return;

    const targetId = dropTarget.id || dropTarget._id;

    // Check if this is a file drop (source id is 'file-drop')
    if (dropSource.id === 'file-drop') {
      // Replace target with dropped file - update UI immediately for responsiveness
      const newPosts = posts.map(p => {
        const postId = p.id || p._id;
        if (postId === targetId) {
          return {
            ...p,
            image: dropSource.images[0],
            images: dropSource.images.length > 1 ? dropSource.images : undefined,
            originalImage: null,
            editSettings: null,
          };
        }
        return p;
      });
      setGridPosts(newPosts);

      // Upload the file to the server properly
      try {
        if (targetId && droppedFileObjects && droppedFileObjects.length > 0) {
          // Upload the first file as the new media for this content
          const file = droppedFileObjects[0];
          await contentApi.updateMedia(targetId, file);
          // Notify parent to refresh grid data to get the new URL
          onGridChange?.();
        }
      } catch (err) {
        console.error('Failed to upload file to backend:', err);
      }
    } else {
      // Original behavior for internal drags
      handleReplace();
      return;
    }

    setShowDropModal(false);
    setDropSource(null);
    setDropTarget(null);
    setDroppedFiles(null);
    setDroppedFileObjects(null);
  };

  // Modified carousel handler to handle file drops
  const handleCreateCarouselWithCheck = async () => {
    if (!dropSource || !dropTarget) return;

    const targetId = dropTarget.id || dropTarget._id;

    // Collect all images
    const sourceImages = dropSource.images || (dropSource.image ? [dropSource.image] : []);
    const targetImages = dropTarget.images || (dropTarget.image ? [dropTarget.image] : []);
    const combinedImages = [...targetImages, ...sourceImages];

    // Check if this is a file drop
    if (dropSource.id === 'file-drop') {
      // For file drops, upload the file first then add to carousel
      // Update UI immediately for responsiveness
      const newPosts = posts.map(p => {
        const postId = p.id || p._id;
        if (postId === targetId) {
          return {
            ...p,
            image: combinedImages[0],
            images: combinedImages,
            originalImage: null,
            editSettings: null,
          };
        }
        return p;
      });
      setGridPosts(newPosts);

      // Upload the dropped file(s) and update carousel
      try {
        if (targetId && droppedFileObjects && droppedFileObjects.length > 0) {
          // Upload the first dropped file as the new media
          const file = droppedFileObjects[0];
          const result = await contentApi.updateMedia(targetId, file);

          // If successful, the content now has the uploaded URL
          // The existing target images are lost when we replace media
          // For true carousel support, we'd need to store multiple media files
          // For now, just refresh to get the new URL
          onGridChange?.();
        }
      } catch (err) {
        console.error('Failed to upload file for carousel:', err);
      }
    } else {
      // Original behavior for internal drags
      handleCreateCarousel();
      return;
    }

    setShowDropModal(false);
    setDropSource(null);
    setDropTarget(null);
    setDroppedFiles(null);
    setDroppedFileObjects(null);
  };

  // Avatar editor state
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [tempImage, setTempImage] = useState(null);
  const [tempImageFile, setTempImageFile] = useState(null); // Store the actual file for upload
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Edit profile state
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editBrandName, setEditBrandName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editPronouns, setEditPronouns] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Highlights state - loaded from cloud
  const [highlights, setHighlights] = useState([
    { id: '1', name: 'Highlights', cover: null, coverPosition: { x: 0, y: 0 }, coverZoom: 1, stories: [] },
    { id: '2', name: 'DJ Sets', cover: null, coverPosition: { x: 0, y: 0 }, coverZoom: 1, stories: [] },
    { id: '3', name: 'Studio', cover: null, coverPosition: { x: 0, y: 0 }, coverZoom: 1, stories: [] },
  ]);
  const [highlightsLoaded, setHighlightsLoaded] = useState(false);
  const [showHighlightModal, setShowHighlightModal] = useState(false);
  const [editingHighlight, setEditingHighlight] = useState(null);
  const [highlightName, setHighlightName] = useState('');
  const [highlightCover, setHighlightCover] = useState(null);
  const [highlightPosition, setHighlightPosition] = useState({ x: 0, y: 0 });
  const [highlightZoom, setHighlightZoom] = useState(1);
  const [isHighlightDragging, setIsHighlightDragging] = useState(false);
  const [highlightDragStart, setHighlightDragStart] = useState({ x: 0, y: 0 });
  const [isHighlightUploading, setIsHighlightUploading] = useState(false);
  const highlightInputRef = useRef(null);
  const highlightPreviewRef = useRef(null);

  // Highlight drag-to-reorder state
  const [draggingHighlightId, setDraggingHighlightId] = useState(null);
  const [highlightDragOverId, setHighlightDragOverId] = useState(null);

  // Verified badge state
  const [isVerified, setIsVerified] = useState(false);

  // Load highlights and verified status from cloud on mount or when profile changes
  useEffect(() => {
    const loadHighlightsFromCloud = async () => {
      try {
        // First check if profile has highlights
        if (currentProfile?.instagramHighlights && currentProfile.instagramHighlights.length > 0) {
          // Map from database format to component format
          const profileHighlights = currentProfile.instagramHighlights.map(h => ({
            id: h.highlightId || h.id,
            name: h.name,
            cover: h.cover,
            coverPosition: h.coverPosition || { x: 0, y: 0 },
            coverZoom: h.coverZoom || 1,
            stories: h.stories || []
          }));
          setHighlights(profileHighlights);
          setHighlightsLoaded(true);
          return;
        }

        // Fall back to user highlights from API
        const response = await api.get('/api/auth/highlights');
        if (response.data.highlights && response.data.highlights.length > 0) {
          // Map from database format to component format
          const cloudHighlights = response.data.highlights.map(h => ({
            id: h.highlightId,
            name: h.name,
            cover: h.cover,
            coverPosition: h.coverPosition || { x: 0, y: 0 },
            coverZoom: h.coverZoom || 1,
            stories: h.stories || []
          }));
          setHighlights(cloudHighlights);
        }
        if (response.data.isVerified !== undefined) {
          setIsVerified(response.data.isVerified);
        }
        setHighlightsLoaded(true);
        // Clear old localStorage data after successful cloud load
        localStorage.removeItem('instagram-highlights');
        localStorage.removeItem('instagram-verified');
      } catch (err) {
        console.error('Failed to load highlights from cloud:', err);
        setHighlightsLoaded(true);
      }
    };
    loadHighlightsFromCloud();
  }, [currentProfile]);

  const fileInputRef = useRef(null);

  // Open modal with current avatar (use original if available for non-destructive editing)
  const handleAvatarClick = () => {
    if (displayData.avatar) {
      // Always use the original image for editing
      setTempImage(displayData.avatar);
      // Load existing position if stored
      setPosition(displayData.avatarPosition || { x: 0, y: 0 });
      setZoom(displayData.avatarZoom || 1);
    } else {
      setTempImage(null);
      setPosition({ x: 0, y: 0 });
      setZoom(1);
    }
    setShowAvatarModal(true);
  };

  // Handle file upload
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      alert('Image must be less than 15MB');
      return;
    }

    // Store the file for upload
    setTempImageFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      setTempImage(event.target?.result);
      setPosition({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);
  };

  // Drag handling
  const handleMouseDown = (e) => {
    if (!tempImage) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;

    // Limit movement based on zoom - allow more movement at higher zoom
    const maxOffset = Math.max(50, 128 * (zoom - 0.5));
    setPosition({
      x: Math.max(-maxOffset, Math.min(maxOffset, newX)),
      y: Math.max(-maxOffset, Math.min(maxOffset, newY))
    });
  }, [isDragging, dragStart, zoom]);

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch handling for mobile
  const handleTouchStart = (e) => {
    if (!tempImage) return;
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({
      x: touch.clientX - position.x,
      y: touch.clientY - position.y
    });
  };

  const handleTouchMove = useCallback((e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const newX = touch.clientX - dragStart.x;
    const newY = touch.clientY - dragStart.y;

    // Limit movement based on zoom - allow more movement at higher zoom
    const maxOffset = Math.max(50, 128 * (zoom - 0.5));
    setPosition({
      x: Math.max(-maxOffset, Math.min(maxOffset, newX)),
      y: Math.max(-maxOffset, Math.min(maxOffset, newY))
    });
  }, [isDragging, dragStart, zoom]);

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Save avatar - non-destructive: upload original image and save position/zoom separately
  // Saves to current profile if one is selected, otherwise saves to user
  const handleSave = async () => {
    if (!tempImage) {
      setShowAvatarModal(false);
      return;
    }

    setIsUploadingAvatar(true);

    try {
      let avatarUrl = tempImage;

      // If we have a new file, upload it to the server
      if (tempImageFile) {
        const formData = new FormData();
        formData.append('avatar', tempImageFile);

        const response = await api.put('/api/auth/avatar', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        avatarUrl = response.data.avatar;
        console.log('Avatar uploaded successfully:', avatarUrl);
      }

      // Save position/zoom settings for non-destructive editing
      const avatarData = {
        avatar: avatarUrl,
        avatarPosition: position,
        avatarZoom: zoom
      };

      // If we have a current profile, save to profile instead of user
      if (currentProfileId && currentProfile) {
        await api.put(`/api/profile/${currentProfileId}`, avatarData);
        // Update profile in local state
        updateProfile(currentProfileId, avatarData);
        console.log('Avatar saved to profile:', currentProfileId);
      } else {
        // Fall back to saving to user
        await api.put('/api/auth/profile', {
          avatarPosition: position,
          avatarZoom: zoom
        });
        setUser({
          ...user,
          ...avatarData
        });
      }

      setShowAvatarModal(false);
      setTempImageFile(null);
    } catch (err) {
      console.error('Failed to save avatar:', err);
      alert('Failed to upload avatar. Please try again.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Cancel and close modal
  const handleCancel = () => {
    setShowAvatarModal(false);
    setTempImage(null);
    setTempImageFile(null);
    setPosition({ x: 0, y: 0 });
    setZoom(1);
  };

  // Open edit profile modal
  const handleEditProfile = () => {
    setEditBrandName(displayData.brandName || '');
    setEditBio(displayData.bio || '');
    setEditPronouns(displayData.pronouns || '');
    setShowEditProfile(true);
  };

  // Save profile changes
  const handleSaveProfile = async () => {
    setIsSaving(true);

    const profileData = {
      brandName: editBrandName,
      bio: editBio,
      pronouns: editPronouns,
    };

    try {
      // If we have a current profile, save to it
      if (currentProfileId && currentProfile) {
        await api.put(`/api/profile/${currentProfileId}`, profileData);
        updateProfile(currentProfileId, profileData);
      } else {
        // Fall back to saving to user
        setUser({
          ...user,
          ...profileData,
        });
      }
    } catch (error) {
      console.error('Failed to save profile:', error);
    }

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

  // Save highlights to cloud (debounced to avoid too many API calls)
  const saveHighlightsTimeoutRef = useRef(null);
  useEffect(() => {
    // Don't save until initial load is complete
    if (!highlightsLoaded) return;

    // Debounce the save to avoid too many API calls
    if (saveHighlightsTimeoutRef.current) {
      clearTimeout(saveHighlightsTimeoutRef.current);
    }

    saveHighlightsTimeoutRef.current = setTimeout(async () => {
      try {
        // Filter out any data URLs or blob URLs - only save Cloudinary URLs
        const highlightsToSave = highlights.map(h => ({
          id: h.id,
          name: h.name,
          cover: h.cover && !h.cover.startsWith('data:') && !h.cover.startsWith('blob:') ? h.cover : null,
          coverPosition: h.coverPosition || { x: 0, y: 0 },
          coverZoom: h.coverZoom || 1,
          stories: h.stories || []
        }));

        // Save to profile if one is selected, otherwise save to user
        if (currentProfileId) {
          await api.put(`/api/profile/${currentProfileId}`, {
            instagramHighlights: highlightsToSave
          });
          updateProfile(currentProfileId, { instagramHighlights: highlightsToSave });
          console.log('[Highlights] Saved to profile successfully');
        } else {
          await api.put('/api/auth/highlights', {
            highlights: highlightsToSave,
            isVerified
          });
          console.log('[Highlights] Saved to user successfully');
        }
      } catch (err) {
        console.error('Failed to save highlights to cloud:', err);
      }
    }, 1000); // Wait 1 second before saving

    return () => {
      if (saveHighlightsTimeoutRef.current) {
        clearTimeout(saveHighlightsTimeoutRef.current);
      }
    };
  }, [highlights, isVerified, highlightsLoaded, currentProfileId, updateProfile]);

  // Highlight handlers
  const highlightDragOccurredRef = useRef(false);

  const handleHighlightClick = (highlight) => {
    // Don't open modal if we just finished dragging
    if (highlightDragOccurredRef.current) {
      highlightDragOccurredRef.current = false;
      return;
    }
    setEditingHighlight(highlight);
    setHighlightName(highlight.name);
    setHighlightCover(highlight.cover);
    setHighlightPosition(highlight.coverPosition || { x: 0, y: 0 });
    setHighlightZoom(highlight.coverZoom || 1);
    setShowHighlightModal(true);
  };

  const handleAddHighlight = () => {
    const newHighlight = {
      id: Date.now().toString(),
      name: 'New',
      cover: null,
      coverPosition: { x: 0, y: 0 },
      coverZoom: 1,
      stories: [],
    };
    setHighlights([...highlights, newHighlight]);
    handleHighlightClick(newHighlight);
  };

  const handleHighlightCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset position and zoom for new upload
    setHighlightPosition({ x: 0, y: 0 });
    setHighlightZoom(1);

    // Show immediate preview with blob URL
    const previewUrl = URL.createObjectURL(file);
    setHighlightCover(previewUrl);
    setIsHighlightUploading(true);

    // Helper to upload blob/file to Cloudinary
    const uploadToCloudinary = async (blob) => {
      const formData = new FormData();
      formData.append('cover', blob, 'highlight-cover.jpg');
      try {
        const response = await api.post('/api/auth/highlight-cover', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data.coverUrl;
      } catch (err) {
        console.error('Failed to upload highlight cover:', err);
        return null;
      }
    };

    if (file.type.startsWith('video/')) {
      // Generate thumbnail from video then upload
      const video = document.createElement('video');
      video.src = previewUrl;
      video.onloadedmetadata = () => {
        video.currentTime = 1;
      };
      video.onseeked = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);

        // Show video frame preview immediately
        const frameDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setHighlightCover(frameDataUrl);

        // Convert canvas to blob and upload
        canvas.toBlob(async (blob) => {
          if (blob) {
            const coverUrl = await uploadToCloudinary(blob);
            setIsHighlightUploading(false);
            if (coverUrl) {
              setHighlightCover(coverUrl);
            }
            URL.revokeObjectURL(previewUrl);
          }
        }, 'image/jpeg', 0.8);
      };
    } else if (file.type.startsWith('image/')) {
      // Upload image to Cloudinary
      const coverUrl = await uploadToCloudinary(file);
      setIsHighlightUploading(false);
      if (coverUrl) {
        setHighlightCover(coverUrl);
      }
      URL.revokeObjectURL(previewUrl);
    }
  };

  // Highlight drag handlers for repositioning
  const handleHighlightMouseDown = (e) => {
    if (!highlightCover) return;
    e.preventDefault();
    setIsHighlightDragging(true);
    setHighlightDragStart({
      x: e.clientX - highlightPosition.x,
      y: e.clientY - highlightPosition.y,
    });
  };

  const handleHighlightMouseMove = (e) => {
    if (!isHighlightDragging) return;
    const newX = e.clientX - highlightDragStart.x;
    const newY = e.clientY - highlightDragStart.y;
    // Limit movement based on zoom
    const maxMove = 50 * highlightZoom;
    setHighlightPosition({
      x: Math.max(-maxMove, Math.min(maxMove, newX)),
      y: Math.max(-maxMove, Math.min(maxMove, newY)),
    });
  };

  const handleHighlightMouseUp = () => {
    setIsHighlightDragging(false);
  };

  const handleSaveHighlight = () => {
    // Don't save if still uploading
    if (isHighlightUploading) return;

    // Only save proper URLs (not data URLs or blob URLs to avoid localStorage quota issues)
    const coverToSave = highlightCover && !highlightCover.startsWith('data:') && !highlightCover.startsWith('blob:')
      ? highlightCover
      : null;

    const updatedHighlights = highlights.map(h =>
      h.id === editingHighlight.id
        ? { ...h, name: highlightName, cover: coverToSave, coverPosition: highlightPosition, coverZoom: highlightZoom }
        : h
    );
    setHighlights(updatedHighlights);
    setShowHighlightModal(false);
    setEditingHighlight(null);
  };

  const handleDeleteHighlight = () => {
    setHighlights(highlights.filter(h => h.id !== editingHighlight.id));
    setShowHighlightModal(false);
    setEditingHighlight(null);
  };

  // Highlight drag-to-reorder handlers
  const handleHighlightDragStart = (e, highlightId) => {
    highlightDragOccurredRef.current = true;
    setDraggingHighlightId(highlightId);
    e.dataTransfer.setData('text/plain', highlightId); // Use text/plain for better compatibility
    e.dataTransfer.effectAllowed = 'move';

    // Set a custom drag image (optional, improves UX)
    if (e.target) {
      e.dataTransfer.setDragImage(e.target, 33, 33); // Center of 66px highlight
    }
  };

  const handleHighlightDragOver = (e, highlightId) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    // Only set drag over if it's a different highlight than the one being dragged
    if (draggingHighlightId && highlightId !== draggingHighlightId) {
      setHighlightDragOverId(highlightId);
    }
  };

  const handleHighlightDragLeave = (e) => {
    // Only clear if we're actually leaving the element (not entering a child)
    const relatedTarget = e.relatedTarget;
    if (!e.currentTarget.contains(relatedTarget)) {
      setHighlightDragOverId(null);
    }
  };

  const handleHighlightDrop = (e, targetId) => {
    e.preventDefault();
    e.stopPropagation();

    const sourceId = draggingHighlightId || e.dataTransfer.getData('text/plain');
    console.log('[Highlight Drop] Source:', sourceId, 'Target:', targetId);

    if (sourceId && sourceId !== targetId) {
      const sourceIndex = highlights.findIndex(h => h.id === sourceId);
      const targetIndex = highlights.findIndex(h => h.id === targetId);

      console.log('[Highlight Drop] Source Index:', sourceIndex, 'Target Index:', targetIndex);

      if (sourceIndex !== -1 && targetIndex !== -1) {
        // Swap the highlights
        const newHighlights = [...highlights];
        const temp = newHighlights[sourceIndex];
        newHighlights[sourceIndex] = newHighlights[targetIndex];
        newHighlights[targetIndex] = temp;

        console.log('[Highlight Drop] Swapped! New order:', newHighlights.map(h => h.name));
        setHighlights(newHighlights);
      }
    }

    setDraggingHighlightId(null);
    setHighlightDragOverId(null);
  };

  const handleHighlightDragEnd = () => {
    // Reset drag state
    setDraggingHighlightId(null);
    setHighlightDragOverId(null);

    // Reset the drag occurred flag after a short delay to allow click to be prevented
    setTimeout(() => {
      highlightDragOccurredRef.current = false;
    }, 100);
  };

  return (
    <div className="relative min-h-screen">
      {/* Floating Aesthetic Score Panel */}
      {activeTab === 'posts' && showAestheticScore && postsWithConviction.some(p => p.conviction) && (
        <div
          className={`absolute left-4 bottom-24 z-10 transition-all duration-300 ease-in-out ${
            aestheticPanelExpanded ? 'w-72' : 'w-14'
          }`}
        >
          <div className="bg-dark-800/95 backdrop-blur-md rounded-xl border border-dark-700/50 shadow-2xl overflow-hidden">
            {/* Collapse/Expand Button */}
            <button
              onClick={() => setAestheticPanelExpanded(!aestheticPanelExpanded)}
              className="absolute right-2 top-2 w-7 h-7 bg-dark-700 hover:bg-dark-600 border border-dark-600 rounded-md flex items-center justify-center transition-colors z-20"
              title={aestheticPanelExpanded ? 'Collapse Panel' : 'Expand Panel'}
            >
              {aestheticPanelExpanded ? (
                <ChevronLeft className="w-4 h-4 text-dark-300" />
              ) : (
                <ChevronRight className="w-4 h-4 text-dark-300" />
              )}
            </button>

            {/* Panel Content */}
            <div className={`transition-opacity duration-300 ${aestheticPanelExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              {aestheticPanelExpanded && (
                <div className="p-3">
                  <GridAestheticScore gridItems={postsWithConviction} columns={cols} />
                </div>
              )}
            </div>

            {/* Collapsed State */}
            {!aestheticPanelExpanded && (
              <div className="h-36 flex items-center justify-center py-4">
                <div className="text-[10px] text-dark-300 font-medium tracking-widest transform -rotate-90 whitespace-nowrap uppercase">
                  Grid Score
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detached Controls Panel */}
      {activeTab === 'posts' && (
        <div
          className={`absolute right-4 top-24 z-20 transition-all duration-300 ease-in-out ${
            controlPanelExpanded ? 'w-48' : 'w-11'
          }`}
        >
          <div className="bg-dark-800/95 backdrop-blur-md rounded-xl border border-dark-700/50 shadow-2xl overflow-hidden">
            <button
              onClick={() => setControlPanelExpanded(!controlPanelExpanded)}
              className="w-full h-11 flex items-center justify-center border-b border-dark-700/60 hover:bg-dark-700/40 transition-colors"
              title={controlPanelExpanded ? 'Collapse Controls' : 'Expand Controls'}
            >
              {controlPanelExpanded ? (
                <ChevronRight className="w-4 h-4 text-dark-300" />
              ) : (
                <Layers className="w-4 h-4 text-dark-300" />
              )}
            </button>

            {controlPanelExpanded && (
              <div className="p-2 space-y-2">
                <button
                  onClick={() => setShowConvictionOverlays(!showConvictionOverlays)}
                  className={`w-full h-8 px-2 text-xs rounded-lg transition-colors flex items-center gap-1.5 ${
                    showConvictionOverlays
                      ? 'bg-dark-600/30 text-dark-100 border border-dark-500/30'
                      : 'bg-dark-700 text-dark-400 border border-dark-600 hover:border-dark-500'
                  }`}
                  title={showConvictionOverlays ? 'Hide Conviction Scores' : 'Show Conviction Scores'}
                >
                  {showConvictionOverlays ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  <span>Scores</span>
                </button>

                <button
                  onClick={() => setShowAestheticScore(!showAestheticScore)}
                  className={`w-full h-8 px-2 text-xs rounded-lg transition-colors flex items-center gap-1.5 ${
                    showAestheticScore
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'bg-dark-700 text-dark-400 border border-dark-600 hover:border-dark-500'
                  }`}
                  title={showAestheticScore ? 'Hide Grid Score' : 'Show Grid Score'}
                >
                  <Gauge className="w-3 h-3" />
                  <span>Grid Score</span>
                </button>

                <button
                  onClick={() => {
                    setWhatIfMode(!whatIfMode);
                    if (!whatIfMode && originalScore) {
                      const gridItems = postsWithConviction.filter(p => p.conviction);
                      const currentScore = calculateAestheticScore(gridItems, cols);
                      setOriginalScore(currentScore);
                      setWhatIfScore(null);
                    } else {
                      setWhatIfScore(null);
                    }
                  }}
                  className={`w-full h-8 px-2 text-xs rounded-lg transition-colors flex items-center gap-1.5 ${
                    whatIfMode
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'bg-dark-700 text-dark-400 border border-dark-600 hover:border-dark-500'
                  }`}
                  title={whatIfMode ? 'Exit What-If Mode' : 'Enable What-If Mode'}
                  disabled={!showAestheticScore || !postsWithConviction.some(p => p.conviction)}
                >
                  <LayoutGrid className="w-3 h-3" />
                  <span>What-If</span>
                </button>

                <button
                  onClick={() => setShowTemplateModal(true)}
                  className="w-full h-8 px-2 text-xs rounded-lg transition-colors flex items-center gap-1.5 bg-dark-100 text-dark-900 border border-dark-300/30 hover:bg-white disabled:opacity-50"
                  title="Save current grid as a reusable template"
                  disabled={!gridId || postsWithConviction.length === 0}
                >
                  <FolderPlus className="w-3 h-3" />
                  <span>Save Template</span>
                </button>

                <button
                  onClick={() => setShowDebugInfo(!showDebugInfo)}
                  className={`w-full h-8 px-2 text-xs rounded-lg transition-colors flex items-center gap-1.5 ${
                    showDebugInfo
                      ? 'bg-dark-600/30 text-dark-300 border border-dark-500/30'
                      : 'bg-dark-700 text-dark-400 border border-dark-600 hover:border-dark-500'
                  }`}
                  title={showDebugInfo ? 'Hide Debug Info' : 'Show Debug Info'}
                >
                  <Bug className="w-3 h-3" />
                  <span>Debug</span>
                </button>

                {loadingConviction && (
                  <div className="w-full h-8 px-2 text-xs rounded-lg border border-dark-600 bg-dark-700 text-dark-300 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Calculating...</span>
                  </div>
                )}

                <CampaignReliabilityScorecard gridItems={postsWithConviction} />
              </div>
            )}
          </div>
        </div>
      )}

      <div
        className="max-w-md mx-auto bg-dark-800 rounded-2xl overflow-hidden border border-dark-700"
        onDragEnter={handleVideoDragEnter}
        onDragOver={handleVideoDragOver}
        onDragLeave={handleVideoDragLeave}
        onDrop={handleVideoDrop}
      >
      {/* Top Bar - Username with Verified Badge (like Instagram) */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <div className="flex items-center gap-1">
          <span className="text-sm font-semibold text-dark-100">
            {displayData.username}
          </span>
          {isVerified && (
            <svg className="w-3.5 h-3.5" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="20" fill="#0095F6" />
              <path d="M17.5 27L12 21.5L14.5 19L17.5 22L26.5 13L29 15.5L17.5 27Z" fill="white" />
            </svg>
          )}
          <svg className="w-3 h-3 text-dark-100 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <button
          onClick={() => setIsVerified(!isVerified)}
          className={`text-[10px] px-1.5 py-0.5 rounded ${isVerified ? 'bg-blue-500/20 text-blue-400' : 'bg-dark-700 text-dark-400'} hover:opacity-80 transition-opacity`}
          title="Toggle verified badge"
        >
          {isVerified ? '✓ Verified' : 'Add ✓'}
        </button>
      </div>

      {/* Profile Header - Instagram Style */}
      <div className="px-4 pt-2 pb-3">
        {/* Avatar and Stats Row */}
        <div className="flex items-center gap-7">
          {/* Clickable Avatar */}
          <button
            onClick={handleAvatarClick}
            className="relative w-[86px] h-[86px] rounded-full bg-dark-600 p-[3px] group cursor-pointer flex-shrink-0"
          >
            <div className="w-full h-full rounded-full bg-dark-800 overflow-hidden relative">
              {displayData.avatar ? (
                <img
                  src={displayData.avatar}
                  alt={displayData.brandName || displayData.name || 'Profile'}
                  className="absolute pointer-events-none"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    left: '50%',
                    top: '50%',
                    transformOrigin: 'center center',
                    // Scale position by ratio of container sizes (86/256 ≈ 0.336)
                    transform: `translate(-50%, -50%) translate(${(displayData.avatarPosition?.x || 0) * 0.336}px, ${(displayData.avatarPosition?.y || 0) * 0.336}px) scale(${getActualZoom(displayData.avatarZoom || 1)})`,
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="w-8 h-8 text-dark-200" />
                </div>
              )}
            </div>
            {/* Hover overlay */}
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="w-5 h-5 text-white" />
            </div>
          </button>

          {/* Stats Row - Posts, Followers, Following */}
          <div className="flex-1 flex justify-around text-center">
            <div>
              <p className="text-base font-semold text-dark-100">{postsWithConviction.length}</p>
              <p className="text-xs text-dark-400">posts</p>
            </div>
            <div>
              <p className="text-base font-semibold text-dark-100">12.4K</p>
              <p className="text-xs text-dark-400">followers</p>
            </div>
            <div>
              <p className="text-base font-semibold text-dark-100">892</p>
              <p className="text-xs text-dark-400">following</p>
            </div>
          </div>
        </div>

        {/* Name, Pronouns & Bio */}
        <div className="mt-3">
          <div className="flex items-center gap-1">
            <span className="text-sm font-semibold text-dark-100">{displayData.brandName}</span>
            {displayData.pronouns && (
              <span className="text-dark-500 text-xs">· {displayData.pronouns}</span>
            )}
          </div>
          {displayData.bio && (
            <p className="text-sm text-dark-300 whitespace-pre-line mt-0.5 leading-tight">{displayData.bio}</p>
          )}
        </div>

        {/* Action Buttons - Follow & Message (Instagram style) */}
        <div className="flex gap-1.5 mt-3">
          <button className="flex-1 py-[7px] bg-[#0095F6] hover:bg-[#1877F2] text-white text-[13px] font-semibold rounded-lg transition-colors">
            Follow
          </button>
          <button className="flex-1 py-[7px] bg-dark-700 hover:bg-dark-600 text-dark-100 text-[13px] font-semibold rounded-lg transition-colors">
            Message
          </button>
          <button
            onClick={handleEditProfile}
            className="w-9 py-[7px] bg-dark-700 hover:bg-dark-600 text-dark-200 rounded-lg transition-colors flex items-center justify-center"
            title="Edit Profile"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
        </div>

        {/* Highlights (Instagram style - draggable, with gradient ring when has content) */}
        <div className="mt-4 -mx-4 px-4 overflow-x-auto scrollbar-hide">
          <div className="flex gap-3 pb-1">
            {highlights.map((highlight) => (
              <div
                key={highlight.id}
                draggable
                onDragStart={(e) => handleHighlightDragStart(e, highlight.id)}
                onDragOver={(e) => handleHighlightDragOver(e, highlight.id)}
                onDragLeave={(e) => handleHighlightDragLeave(e)}
                onDrop={(e) => handleHighlightDrop(e, highlight.id)}
                onDragEnd={handleHighlightDragEnd}
                onClick={() => handleHighlightClick(highlight)}
                className={`flex flex-col items-center gap-1 flex-shrink-0 cursor-grab active:cursor-grabbing select-none transition-all ${
                  draggingHighlightId === highlight.id ? 'opacity-50 scale-95' : ''
                } ${highlightDragOverId === highlight.id ? 'scale-110' : ''}`}
              >
                <div className={`w-[66px] h-[66px] rounded-full p-[3px] transition-all ${
                  highlight.cover
                    ? 'bg-dark-600'
                    : 'border-[2px] border-dark-600'
                } ${highlightDragOverId === highlight.id ? 'ring-2 ring-dark-300 ring-offset-2 ring-offset-dark-800' : ''}`}>
                  <div className="w-full h-full rounded-full bg-dark-800 overflow-hidden border-[2px] border-dark-800 relative">
                    {highlight.cover ? (
                      <img
                        src={highlight.cover}
                        alt=""
                        className="absolute pointer-events-none"
                        draggable={false}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          left: '50%',
                          top: '50%',
                          transformOrigin: 'center center',
                          transform: `translate(-50%, -50%) translate(${(highlight.coverPosition?.x || 0) * 0.5}px, ${(highlight.coverPosition?.y || 0) * 0.5}px) scale(${getActualZoom(highlight.coverZoom || 1)})`,
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-dark-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-[11px] text-dark-300 max-w-[62px] truncate">{highlight.name}</span>
              </div>
            ))}
            {/* Add New Highlight */}
            <button
              onClick={handleAddHighlight}
              className="flex flex-col items-center gap-1 flex-shrink-0"
            >
              <div className="w-[66px] h-[66px] rounded-full border-[2px] border-dashed border-dark-600 flex items-center justify-center hover:border-dark-400 transition-colors">
                <svg className="w-5 h-5 text-dark-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="text-[11px] text-dark-400">New</span>
            </button>
          </div>
        </div>
      </div>

      {/* Debug Info */}
      {activeTab === 'posts' && showDebugInfo && (
        <>
          {/* Success Banner */}
          {postsWithConviction.length > 0 && postsWithConviction.every(p => p.conviction) && (
            <div className="px-4 py-3 bg-dark-700/50 border-b border-dark-600 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-accent-purple animate-pulse"></div>
              <span className="text-sm font-medium text-dark-100">
                ✓ Conviction Scores Active - {postsWithConviction.length} posts scored
              </span>
            </div>
          )}

          {/* Debug Bar */}
          <div className="px-4 py-2 bg-dark-700/50 border-b border-dark-600 text-xs text-dark-300">
            Debug: {postsWithConviction.length} posts | {postsWithConviction.filter(p => p.conviction).length} with conviction |
            Overlays: {showConvictionOverlays ? 'ON' : 'OFF'} |
            Grid Score: {showAestheticScore ? 'ON' : 'OFF'} |
            What-If: {whatIfMode ? 'ON' : 'OFF'}
          </div>
        </>
      )}

      {/* Grid Aesthetic Score Panel - floating side panel */}

      {/* What-If Mode Comparison */}
      {activeTab === 'posts' && whatIfMode && whatIfScore && originalScore && (
        <div className="mx-4 mt-2 mb-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-blue-400">What-If Mode Active</span>
            </div>
            <button
              onClick={() => {
                setWhatIfMode(false);
                setWhatIfScore(null);
              }}
              className="text-xs text-dark-400 hover:text-dark-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-3">
            <div className="text-center">
              <p className="text-xs text-dark-400 mb-1">Original</p>
              <p className="text-2xl font-bold text-dark-200">{originalScore.overallScore}</p>
            </div>

            <div className="flex items-center justify-center">
              {whatIfScore.overallScore > originalScore.overallScore ? (
                <div className="flex flex-col items-center">
                  <TrendingUp className="w-6 h-6 text-dark-100 mb-1" />
                  <span className="text-lg font-bold text-dark-100">
                    +{whatIfScore.overallScore - originalScore.overallScore}
                  </span>
                </div>
              ) : whatIfScore.overallScore < originalScore.overallScore ? (
                <div className="flex flex-col items-center">
                  <ChevronDown className="w-6 h-6 text-dark-300 mb-1" />
                  <span className="text-lg font-bold text-dark-300">
                    {whatIfScore.overallScore - originalScore.overallScore}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <span className="text-2xl text-dark-400 mb-1">=</span>
                  <span className="text-sm text-dark-400">No change</span>
                </div>
              )}
            </div>

            <div className="text-center">
              <p className="text-xs text-dark-400 mb-1">New</p>
              <p className={`text-2xl font-bold ${
                whatIfScore.overallScore > originalScore.overallScore ? 'text-dark-100' :
                whatIfScore.overallScore < originalScore.overallScore ? 'text-dark-300' :
                'text-dark-200'
              }`}>
                {whatIfScore.overallScore}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                // Keep changes - update original score
                setOriginalScore(whatIfScore);
                setWhatIfScore(null);
                setWhatIfMode(false);
              }}
              className="flex-1 py-2 bg-dark-100 hover:bg-white text-dark-900 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Keep Changes
            </button>
            <button
              onClick={() => {
                // Undo changes - restore original grid order
                // This would require storing original post order
                setWhatIfScore(null);
                setWhatIfMode(false);
              }}
              className="flex-1 py-2 bg-dark-700 hover:bg-dark-600 text-dark-200 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex border-b border-dark-700">
        <button
          onClick={() => setActiveTab('posts')}
          className={`flex-1 py-3 transition-colors ${activeTab === 'posts' ? 'border-b-2 border-dark-100 text-dark-100' : 'text-dark-500 hover:text-dark-300'}`}
        >
          <svg className="w-6 h-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        </button>
        <button
          onClick={() => setActiveTab('reels')}
          className={`flex-1 py-3 transition-colors ${activeTab === 'reels' ? 'border-b-2 border-dark-100 text-dark-100' : 'text-dark-500 hover:text-dark-300'}`}
        >
          <svg className="w-6 h-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
        <button
          onClick={() => setActiveTab('tagged')}
          className={`flex-1 py-3 transition-colors ${activeTab === 'tagged' ? 'border-b-2 border-dark-100 text-dark-100' : 'text-dark-500 hover:text-dark-300'}`}
        >
          <svg className="w-6 h-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </button>
      </div>

      {/* Posts Tab Content */}
      {activeTab === 'posts' && (
        <>
          {/* Grid with Row Drag (via grip handle) and Item Drag (for replace/carousel) */}
          {/* This wrapper blocks parent overlay by setting flag, but lets items handle their own drops */}
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Set flag when entering preview grid - blocks parent overlay
              setInternalDragActive(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Keep flag set while dragging over preview grid
              setInternalDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Only clear flag if actually leaving the grid container entirely
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX;
              const y = e.clientY;
              if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                setInternalDragActive(false);
              }
            }}
            onDrop={(e) => {
              // This catches drops that miss all grid items (dropped on empty space)
              e.preventDefault();
              e.stopPropagation();
              setInternalDragActive(false);
              // Don't do anything else - drop was on empty space, not an item
            }}
          >
        {/* Row Drag and Drop */}
        <DndContext
          sensors={rowSensors}
          collisionDetection={closestCenter}
          onDragStart={handleRowDragStart}
          onDragEnd={handleRowDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col">
              {rows.map((row, rowIndex) => (
                <SortableRow key={`row-${rowIndex}`} rowId={`row-${rowIndex}`} rowIndex={rowIndex} showHandle={showRowHandles}>
                  <div
                    className="grid gap-0.5"
                    style={{
                      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                    }}
                  >
                    {row.map((post) => (
                      <DraggableGridItem
                        key={post.id || post._id}
                        post={post}
                        postId={post.id || post._id}
                        onDragStart={handleItemDragStart}
                        onReorder={handleReorder}
                        onReplaceOrCarousel={handleReplaceOrCarouselDrag}
                        onFileDrop={handleFileDrop}
                        isSelected={selectedItemId === (post.id || post._id)}
                        onSelect={handleSelectItem}
                        onDelete={handleDeleteRequest}
                        showConvictionOverlays={showConvictionOverlays}
                      />
                    ))}
                  </div>
                </SortableRow>
              ))}
            </div>
          </SortableContext>

          {/* Row Drag Overlay */}
          <DragOverlay>
            {activeRow ? (
              <div className="flex items-center bg-dark-800/90 shadow-2xl rounded-lg border border-dark-600">
                <div className="flex items-center justify-center px-2 py-4">
                  <GripVertical className="w-5 h-5 text-dark-400" />
                </div>
                <div
                  className="grid gap-0.5 flex-1"
                  style={{
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  }}
                >
                  {activeRow.map((post) => {
                    const images = post.images || (post.image ? [post.image] : []);
                    return (
                      <div
                        key={post.id || post._id}
                        className="aspect-square bg-dark-700 overflow-hidden relative"
                      >
                        {images.length > 0 ? (
                          <>
                            {(() => {
                              const igDraft = post?.editSettings?.platformDrafts?.instagram;
                              const cb = igDraft?.cropBox;
                              const hasCrop = cb && (cb.x !== 0 || cb.y !== 0 || cb.width < 100 || cb.height < 100);
                              const style = {};
                              if (hasCrop) {
                                style.objectPosition = `${cb.x + cb.width / 2}% ${cb.y + cb.height / 2}%`;
                              }
                              return (
                                <img
                                  src={images[0]}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  style={Object.keys(style).length ? style : undefined}
                                />
                              );
                            })()}
                            {images.length > 1 && (
                              <div className="absolute top-1 right-1 bg-dark-900/70 rounded px-1 py-0.5 flex items-center gap-0.5">
                                <Layers className="w-2.5 h-2.5 text-white" />
                                <span className="text-[10px] text-white font-medium">{images.length}</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div
                            className="w-full h-full"
                            style={{ backgroundColor: post.color || '#3f3f46' }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

          {/* Empty State for Posts */}
          {postsWithConviction.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-dark-400">No posts to preview</p>
            </div>
          )}
        </>
      )}

      {/* Reels Tab Content */}
      {activeTab === 'reels' && (
        <div
          className={`min-h-[300px] transition-colors relative ${
            isVideoDragOver
              ? 'bg-dark-700 border-2 border-dashed border-dark-100'
              : ''
          }`}
          onDragEnter={handleVideoDragEnter}
          onDragOver={handleVideoDragOver}
          onDragLeave={handleVideoDragLeave}
          onDrop={handleVideoDrop}
        >
          {/* Drop Overlay */}
          {isVideoDragOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-dark-900/80 z-10">
              <div className="text-center">
                <svg className="w-16 h-16 text-dark-100 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xl font-medium text-dark-100">Drop Video to Upload</p>
                <p className="text-sm text-dark-400 mt-2">MP4, MOV, AVI, or WebM</p>
              </div>
            </div>
          )}

          {/* Upload Progress */}
          {uploadingReel && (
            <div className="py-8 text-center">
              <div className="w-12 h-12 border-4 border-dark-600 border-t-dark-100 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-dark-200">Uploading reel...</p>
            </div>
          )}

          {/* Reel Collection Selector */}
          <div className="px-4 py-3 border-b border-dark-700">
            <div className="relative">
              <button
                onClick={() => setShowReelCollectionSelector(!showReelCollectionSelector)}
                className="flex items-center gap-2 px-3 py-2 bg-dark-700 rounded-lg text-dark-200 hover:bg-dark-600 transition-colors w-full"
              >
                <LayoutGrid className="w-4 h-4 text-dark-100" />
                <span className="text-sm flex-1 text-left truncate">
                  {currentReelCollection?.name || 'Select Collection'}
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showReelCollectionSelector ? 'rotate-180' : ''}`} />
              </button>

              {showReelCollectionSelector && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-dark-700 rounded-lg shadow-xl border border-dark-600 z-20">
                  <div className="p-2 border-b border-dark-600">
                    <p className="text-xs text-dark-400 uppercase tracking-wide">Reel Collections ({instagramCollections.length})</p>
                  </div>
                  <div className="max-h-48 overflow-auto">
                    {instagramCollections.map((collection) => (
                      <div
                        key={collection._id || collection.id}
                        className={`group relative ${
                          currentReelCollectionId === (collection._id || collection.id)
                            ? 'bg-dark-700'
                            : 'hover:bg-dark-600'
                        }`}
                      >
                        {editingReelCollectionId === (collection._id || collection.id) ? (
                          <div className="px-3 py-2 flex items-center gap-2">
                            <input
                              type="text"
                              value={editingReelCollectionName}
                              onChange={(e) => setEditingReelCollectionName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveRenameReelCollection(e, collection._id || collection.id);
                                if (e.key === 'Escape') handleCancelRenameReelCollection(e);
                              }}
                              className="flex-1 bg-dark-800 border border-dark-500 rounded px-2 py-1 text-sm text-dark-100 focus:outline-none focus:border-dark-300"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button
                              onClick={(e) => handleSaveRenameReelCollection(e, collection._id || collection.id)}
                              className="p-1 text-dark-100 hover:bg-dark-500 rounded"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={handleCancelRenameReelCollection}
                              className="p-1 text-dark-400 hover:bg-dark-500 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : showDeleteReelCollectionConfirm === (collection._id || collection.id) ? (
                          <div className="px-3 py-2">
                            <p className="text-sm text-dark-200 mb-2">Delete "{collection.name}"?</p>
                            <div className="flex gap-2">
                              <button
                                onClick={(e) => handleDeleteReelCollection(e, collection._id || collection.id)}
                                className="flex-1 px-2 py-1 text-xs bg-dark-600/30 text-dark-300 rounded hover:bg-dark-600/40"
                              >
                                Delete
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowDeleteReelCollectionConfirm(null); }}
                                className="flex-1 px-2 py-1 text-xs bg-dark-600 text-dark-300 rounded hover:bg-dark-500"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleSelectReelCollection(collection)}
                            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                              currentReelCollectionId === (collection._id || collection.id)
                                ? 'text-dark-100'
                                : 'text-dark-200'
                            }`}
                          >
                            <LayoutGrid className="w-4 h-4 flex-shrink-0" />
                            <span className="flex-1 truncate">{collection.name}</span>
                            <span className="text-xs text-dark-500 mr-1">
                              {collection.reels?.length || 0}
                            </span>
                            <div className="hidden group-hover:flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRolloutPickerCollectionId(collection._id || collection.id);
                                  setShowRolloutPicker(true);
                                  setShowReelCollectionSelector(false);
                                }}
                                className="p-1 text-dark-400 hover:text-dark-100 hover:bg-dark-500 rounded"
                                title="Add to Rollout"
                              >
                                <CalendarPlus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => handleStartRenameReelCollection(e, collection)}
                                className="p-1 text-dark-400 hover:text-dark-100 hover:bg-dark-500 rounded"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowDeleteReelCollectionConfirm(collection._id || collection.id); }}
                                className="p-1 text-dark-400 hover:text-dark-200 hover:bg-dark-500 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </button>
                        )}
                      </div>
                    ))}
                    {instagramCollections.length === 0 && (
                      <p className="px-3 py-4 text-sm text-dark-400 text-center">No collections yet</p>
                    )}
                  </div>
                  <div className="p-2 border-t border-dark-600">
                    <button
                      onClick={handleCreateReelCollection}
                      className="w-full px-3 py-2 text-sm text-dark-100 hover:bg-dark-600 rounded-md flex items-center gap-2"
                    >
                      <FolderPlus className="w-4 h-4" />
                      Create New Collection
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Reels Grid with Row Drag and Drop */}
          {!uploadingReel && collectionReels.length > 0 && (
            <DndContext
              sensors={reelRowSensors}
              collisionDetection={closestCenter}
              onDragStart={handleReelRowDragStart}
              onDragEnd={handleReelRowDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext items={reelRowIds} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col">
                  {reelRows.map((row, rowIndex) => (
                    <SortableReelRow
                      key={`reel-row-${rowIndex}`}
                      rowId={`reel-row-${rowIndex}`}
                      rowIndex={rowIndex}
                      showHandle={showRowHandles}
                    >
                      <div className="grid grid-cols-3 gap-0.5">
                        {row.map((reel) => (
                          <DraggableReelItem
                            key={reel._id || reel.id}
                            reel={reel}
                            reelId={reel._id || reel.id}
                            onEdit={handleReelEdit}
                            onPlay={handleReelPlay}
                            onReorder={handleReelReorder}
                          />
                        ))}
                        {/* Fill empty cells in incomplete rows */}
                        {row.length < 3 &&
                          Array.from({ length: 3 - row.length }).map((_, i) => (
                            <div
                              key={`empty-reel-${rowIndex}-${i}`}
                              className="aspect-[9/16] bg-dark-700/30 rounded-lg border border-dashed border-dark-600"
                            />
                          ))}
                      </div>
                    </SortableReelRow>
                  ))}
                </div>
              </SortableContext>

              {/* Row Drag Overlay */}
              <DragOverlay>
                {reelRowDragActiveId ? (
                  <div className="flex items-center bg-dark-800/90 rounded-lg ring-2 ring-dark-300 shadow-xl">
                    <div className="px-2 py-8">
                      <GripVertical className="w-5 h-5 text-dark-100" />
                    </div>
                    <div className="grid grid-cols-3 gap-0.5 flex-1">
                      {(() => {
                        const rowIndex = parseInt(reelRowDragActiveId.replace('reel-row-', ''));
                        const draggedRow = reelRows[rowIndex] || [];
                        return draggedRow.map((reel) => (
                          <div key={reel._id || reel.id} className="aspect-[9/16] bg-dark-700 overflow-hidden rounded">
                            <img
                              src={reel.thumbnailUrl || reel.mediaUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}

          {/* Empty State */}
          {!uploadingReel && collectionReels.length === 0 && !isVideoDragOver && (
            <div className="py-16 text-center">
              <svg className="w-16 h-16 text-dark-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {currentReelCollection ? (
                <>
                  <p className="text-dark-400 text-lg font-medium mt-3">No Reels Yet</p>
                  <p className="text-dark-500 text-sm">Drag a video here to upload to "{currentReelCollection.name}"</p>
                </>
              ) : (
                <>
                  <p className="text-dark-400 text-lg font-medium mt-3">No Collection Selected</p>
                  <p className="text-dark-500 text-sm">Create a collection first using the dropdown above</p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tagged Tab Content */}
      {activeTab === 'tagged' && (
        <div className="py-16 text-center">
          <div className="flex flex-col items-center gap-3">
            <svg className="w-16 h-16 text-dark-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <p className="text-dark-400 text-lg font-medium">No Tagged Photos</p>
            <p className="text-dark-500 text-sm">Photos you're tagged in will appear here</p>
          </div>
        </div>
      )}

      {/* Avatar Edit Modal */}
      {showAvatarModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={handleCancel}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="bg-dark-800 rounded-2xl p-6 w-full max-w-md border border-dark-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-dark-100">Edit Profile Photo</h3>
              <button onClick={handleCancel} className="text-dark-400 hover:text-dark-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Preview Area */}
            <div className="relative mb-4">
              {/* Circular crop viewport */}
              <div
                className="w-64 h-64 mx-auto rounded-full overflow-hidden bg-dark-700 relative cursor-move border-2 border-dark-600"
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
              >
                {tempImage ? (
                  <img
                    src={tempImage}
                    alt="Preview"
                    className="absolute pointer-events-none select-none"
                    draggable={false}
                    style={{
                      // Use transform scale for zoom - more reliable
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      left: '50%',
                      top: '50%',
                      transformOrigin: 'center center',
                      transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px) scale(${getActualZoom(zoom)})`,
                      transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-dark-400">
                    <User className="w-16 h-16 mb-2" />
                    <p className="text-sm">No photo selected</p>
                  </div>
                )}
              </div>

              {/* Drag hint */}
              {tempImage && (
                <p className="text-center text-dark-500 text-xs mt-2">
                  Drag to reposition
                </p>
              )}
            </div>

            {/* Zoom Control */}
            {tempImage && (
              <div className="flex items-center gap-3 mb-4 px-4">
                <ZoomOut className="w-4 h-4 text-dark-400" />
                <input
                  type="range"
                  min="0.8"
                  max="2"
                  step="0.02"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="flex-1 h-2 bg-dark-600 rounded-lg appearance-none cursor-pointer accent-white"
                />
                <ZoomIn className="w-4 h-4 text-dark-400" />
                {/* Reset button */}
                <button
                  onClick={() => { setPosition({ x: 0, y: 0 }); setZoom(1); }}
                  className="p-1.5 rounded-lg hover:bg-dark-600 text-dark-400 hover:text-dark-200 transition-colors"
                  title="Reset position and zoom"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <span className="text-xs text-dark-500 w-12 text-right">{Math.round(getActualZoom(zoom) * 100)}%</span>
              </div>
            )}

            {/* Upload Button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full btn-secondary mb-3"
            >
              <Upload className="w-4 h-4" />
              {tempImage ? 'Choose Different Photo' : 'Upload Photo'}
            </button>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button onClick={handleCancel} className="flex-1 btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 btn-primary"
                disabled={!tempImage || isUploadingAvatar}
              >
                {isUploadingAvatar ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Save
                  </>
                )}
              </button>
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
            className="bg-dark-800 rounded-2xl p-6 w-full max-w-md border border-dark-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-dark-100">Edit Profile</h3>
              <button onClick={handleCancelEditProfile} className="text-dark-400 hover:text-dark-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Brand Name */}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={editBrandName}
                  onChange={(e) => setEditBrandName(e.target.value)}
                  placeholder="Your Name"
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-500 focus:border-dark-300 focus:ring-1 focus:ring-dark-300 outline-none transition-colors"
                />
              </div>

              {/* Pronouns */}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">
                  Pronouns
                </label>
                <input
                  type="text"
                  value={editPronouns}
                  onChange={(e) => setEditPronouns(e.target.value)}
                  placeholder="e.g. he/him, she/her, they/them"
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-500 focus:border-dark-300 focus:ring-1 focus:ring-dark-300 outline-none transition-colors"
                />
              </div>

              {/* Bio */}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">
                  Bio
                </label>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Write your bio..."
                  rows={3}
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-500 focus:border-dark-300 focus:ring-1 focus:ring-dark-300 outline-none transition-colors resize-none"
                />
                <p className="text-xs text-dark-500 mt-1">{editBio.length}/150 characters</p>
              </div>

              {/* Preview */}
              <div className="p-3 bg-dark-700/50 rounded-lg">
                <p className="text-xs text-dark-400 mb-2">Preview</p>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-dark-100">{editBrandName || 'Your Name'}</p>
                  {editPronouns && <span className="text-dark-400 text-sm">{editPronouns}</span>}
                </div>
                {editBio && <p className="text-sm text-dark-300 whitespace-pre-line mt-1">{editBio}</p>}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-6">
              <button onClick={handleCancelEditProfile} className="flex-1 btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                className="flex-1 btn-primary"
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Highlight Edit Modal */}
      {showHighlightModal && editingHighlight && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => setShowHighlightModal(false)}
          onMouseMove={handleHighlightMouseMove}
          onMouseUp={handleHighlightMouseUp}
          onMouseLeave={handleHighlightMouseUp}
        >
          <div
            className="bg-dark-800 rounded-2xl p-6 w-full max-w-sm border border-dark-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-dark-100">Edit Highlight</h3>
              <button onClick={() => setShowHighlightModal(false)} className="text-dark-400 hover:text-dark-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cover Preview - Draggable, shows exactly what will be saved */}
            <div className="flex justify-center mb-4">
              <div
                ref={highlightPreviewRef}
                className={`w-32 h-32 rounded-full bg-dark-600 p-[3px] ${
                  highlightCover ? 'cursor-grab active:cursor-grabbing' : ''
                }`}
                onMouseDown={handleHighlightMouseDown}
              >
                <div className="w-full h-full rounded-full bg-dark-800 overflow-hidden border-[3px] border-dark-800 relative">
                  {highlightCover ? (
                    <img
                      src={highlightCover}
                      alt=""
                      className="absolute pointer-events-none select-none"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        left: '50%',
                        top: '50%',
                        transformOrigin: 'center center',
                        transform: `translate(-50%, -50%) translate(${highlightPosition.x}px, ${highlightPosition.y}px) scale(${getActualZoom(highlightZoom)})`,
                      }}
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-10 h-10 text-dark-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {highlightCover && (
              <p className="text-xs text-dark-500 text-center mb-3">Drag to reposition</p>
            )}

            {/* Zoom Slider - only show when there's a cover */}
            {highlightCover && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-dark-400">Zoom</label>
                  <span className="text-xs text-dark-500">{Math.round(getActualZoom(highlightZoom) * 100)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <ZoomOut className="w-4 h-4 text-dark-500" />
                  <input
                    type="range"
                    min="0.8"
                    max="2"
                    step="0.05"
                    value={highlightZoom}
                    onChange={(e) => setHighlightZoom(parseFloat(e.target.value))}
                    className="flex-1 h-1 bg-dark-600 rounded-lg appearance-none cursor-pointer slider-accent"
                  />
                  <ZoomIn className="w-4 h-4 text-dark-500" />
                </div>
                <button
                  onClick={() => {
                    setHighlightPosition({ x: 0, y: 0 });
                    setHighlightZoom(1);
                  }}
                  className="w-full mt-2 py-1 text-xs text-dark-400 hover:text-dark-200 transition-colors"
                >
                  Reset Position & Zoom
                </button>
              </div>
            )}

            {/* Upload Cover Button */}
            <div className="mb-4">
              <input
                ref={highlightInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleHighlightCoverUpload}
                className="hidden"
                disabled={isHighlightUploading}
              />
              <button
                onClick={() => highlightInputRef.current?.click()}
                disabled={isHighlightUploading}
                className="w-full py-2 bg-dark-700 hover:bg-dark-600 text-dark-200 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isHighlightUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  highlightCover ? 'Change Cover' : 'Upload Cover (Image or Video)'
                )}
              </button>
            </div>

            {/* Highlight Name */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-dark-300 mb-1">
                Highlight Name
              </label>
              <input
                type="text"
                value={highlightName}
                onChange={(e) => setHighlightName(e.target.value)}
                placeholder="Highlight name"
                maxLength={15}
                className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-500 focus:border-dark-300 focus:ring-1 focus:ring-dark-300 outline-none transition-colors"
              />
              <p className="text-xs text-dark-500 mt-1">{highlightName.length}/15 characters</p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleDeleteHighlight}
                disabled={isHighlightUploading}
                className="px-4 py-2 text-dark-300 hover:bg-dark-600/30 rounded-lg transition-colors text-sm disabled:opacity-50"
              >
                Delete
              </button>
              <div className="flex-1" />
              <button
                onClick={() => setShowHighlightModal(false)}
                className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-dark-200 rounded-lg transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveHighlight}
                disabled={isHighlightUploading}
                className="px-4 py-2 bg-dark-100 hover:bg-white text-dark-900 text-white rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isHighlightUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  'Save'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Replace/Carousel Modal */}
      {showDropModal && dropSource && dropTarget && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={handleCancelDrop}
        >
          <div
            className="bg-dark-800 rounded-2xl p-6 w-full max-w-sm border border-dark-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-dark-100">What would you like to do?</h3>
              <button onClick={handleCancelDrop} className="text-dark-400 hover:text-dark-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Preview of the two posts */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="text-center">
                <div className="w-20 h-20 rounded-lg overflow-hidden bg-dark-700 mb-2">
                  {(dropSource.images?.[0] || dropSource.image) ? (
                    <img
                      src={dropSource.images?.[0] || dropSource.image}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full"
                      style={{ backgroundColor: dropSource.color || '#3f3f46' }}
                    />
                  )}
                </div>
                <p className="text-xs text-dark-400">{dropSource?.id === 'file-drop' ? 'New Image' : 'Dragged'}</p>
              </div>
              <div className="text-dark-500">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </div>
              <div className="text-center">
                <div className="w-20 h-20 rounded-lg overflow-hidden bg-dark-700 mb-2 relative">
                  {(dropTarget.images?.[0] || dropTarget.image) ? (
                    <>
                      <img
                        src={dropTarget.images?.[0] || dropTarget.image}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      {dropTarget.images?.length > 1 && (
                        <div className="absolute top-1 right-1 bg-dark-900/70 rounded px-1 py-0.5 flex items-center gap-0.5">
                          <Layers className="w-2.5 h-2.5 text-white" />
                          <span className="text-[10px] text-white font-medium">{dropTarget.images.length}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div
                      className="w-full h-full"
                      style={{ backgroundColor: dropTarget.color || '#3f3f46' }}
                    />
                  )}
                </div>
                <p className="text-xs text-dark-400">Target</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleReplaceWithCheck}
                className="w-full flex items-center justify-center gap-3 py-3 bg-dark-700 hover:bg-dark-600 text-dark-100 rounded-lg transition-colors"
              >
                <Replace className="w-5 h-5" />
                <span className="font-medium">Replace Image</span>
              </button>
              <button
                onClick={handleCreateCarouselWithCheck}
                className="w-full flex items-center justify-center gap-3 py-3 bg-dark-100 hover:bg-white text-dark-900 text-white rounded-lg transition-colors"
              >
                <Layers className="w-5 h-5" />
                <span className="font-medium">Create Carousel</span>
              </button>
              <button
                onClick={handleCancelDrop}
                className="w-full py-2 text-dark-400 hover:text-dark-200 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && itemToDelete && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={handleCancelDelete}
        >
          <div
            className="bg-dark-800 rounded-2xl p-6 w-full max-w-sm border border-dark-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-dark-100">Delete Image?</h3>
              <button onClick={handleCancelDelete} className="text-dark-400 hover:text-dark-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Preview of the image to delete */}
            <div className="flex justify-center mb-4">
              <div className="w-24 h-24 rounded-lg overflow-hidden bg-dark-700">
                {(itemToDelete.images?.[0] || itemToDelete.image) ? (
                  <img
                    src={itemToDelete.images?.[0] || itemToDelete.image}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full"
                    style={{ backgroundColor: itemToDelete.color || '#3f3f46' }}
                  />
                )}
              </div>
            </div>

            <p className="text-dark-300 text-center mb-6">
              Are you sure you want to delete this image? This action cannot be undone.
            </p>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleCancelDelete}
                className="flex-1 py-2.5 bg-dark-700 hover:bg-dark-600 text-dark-200 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 bg-dark-100 hover:bg-white text-dark-900 rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reel Editor Modal */}
      {showReelEditor && selectedReel && (
        <ReelEditor
          reel={selectedReel}
          onSave={handleSaveReelEdits}
          onDelete={handleDeleteReel}
          onClose={handleCloseReelEditor}
          onChangeThumbnail={handleOpenThumbnailSelector}
          onPlay={() => {
            setShowReelEditor(false);
            setShowReelPlayer(true);
          }}
        />
      )}

      {/* Reel Player Modal */}
      {showReelPlayer && selectedReel && (
        <ReelPlayer
          reel={selectedReel}
          onClose={handleCloseReelPlayer}
          onSelectThumbnail={handleOpenThumbnailSelector}
        />
      )}

      {/* Reel Thumbnail Selector Modal */}
      {showThumbnailSelector && selectedReel && (
        <ReelThumbnailSelector
          reel={selectedReel}
          videoFile={pendingReelUpload}
          onSave={handleSaveThumbnail}
          onClose={handleCloseThumbnailSelector}
        />
      )}

      {/* Rollout Picker Modal */}
      {showRolloutPicker && rolloutPickerCollectionId && (
        <RolloutPickerModal
          collectionId={rolloutPickerCollectionId}
          collectionName={instagramCollections.find(c => (c._id || c.id) === rolloutPickerCollectionId)?.name || 'Collection'}
          platform="instagram-reels"
          rollouts={rollouts}
          onSelect={async (rolloutId, sectionId) => {
            try {
              const data = await rolloutApi.addCollectionToSection(rolloutId, sectionId, rolloutPickerCollectionId);
              // Update rollouts in store
              setRollouts(rollouts.map(r =>
                (r._id || r.id) === rolloutId
                  ? { ...data.rollout, id: data.rollout._id }
                  : r
              ));
            } catch (err) {
              console.error('Failed to add collection to rollout:', err);
            }
            setShowRolloutPicker(false);
            setRolloutPickerCollectionId(null);
          }}
          onClose={() => {
            setShowRolloutPicker(false);
            setRolloutPickerCollectionId(null);
          }}
        />
      )}

      {/* Save as Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6">
          <div className="bg-dark-800 rounded-lg max-w-md w-full border border-dark-700">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <FolderPlus className="w-6 h-6 text-dark-100" />
                  Save as Template
                </h2>
                <button
                  onClick={() => {
                    setShowTemplateModal(false);
                    setTemplateName('');
                    setTemplateDescription('');
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Template Name *
                  </label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g., Summer Vibes Grid"
                    className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-dark-300"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description (Optional)
                  </label>
                  <textarea
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="Describe what makes this grid template special..."
                    rows={3}
                    className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-dark-300 resize-none"
                  />
                </div>

                {/* Template Info */}
                <div className="bg-dark-900 rounded-lg p-4 border border-dark-700">
                  <div className="text-sm text-gray-400 space-y-2">
                    <div className="flex items-center justify-between">
                      <span>Grid Size:</span>
                      <span className="text-white font-medium">{cols}x{rows}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Total Slots:</span>
                      <span className="text-white font-medium">{postsWithConviction.length}</span>
                    </div>
                    {postsWithConviction.length > 0 && postsWithConviction.some(p => p.conviction) && (
                      <div className="flex items-center justify-between">
                        <span>Avg Conviction:</span>
                        <span className="text-dark-100 font-medium">
                          {Math.round(
                            postsWithConviction.reduce((sum, p) => sum + (p.conviction?.score || 0), 0) /
                            postsWithConviction.filter(p => p.conviction).length
                          )}/100
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => {
                      setShowTemplateModal(false);
                      setTemplateName('');
                      setTemplateDescription('');
                    }}
                    className="flex-1 px-4 py-2 bg-dark-700 text-gray-300 rounded-lg hover:bg-dark-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveAsTemplate}
                    disabled={savingTemplate || !templateName.trim()}
                    className="flex-1 px-4 py-2 bg-dark-100 text-dark-900 rounded-lg hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {savingTemplate ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save Template
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Post Preview Modal disabled in favour of right-hand panel */}
      </div>
    </div>
  );
}

export default GridPreview;
