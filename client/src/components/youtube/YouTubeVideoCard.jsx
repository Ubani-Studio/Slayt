import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Trash2, GripVertical, Image } from 'lucide-react';
import { formatDuration, getPlannerVideoAssetState } from '../../lib/videoUtils';

const STATUS_COLORS = {
  draft: 'bg-gray-500',
  scheduled: 'bg-blue-500',
  published: 'bg-dark-100',
};

const STATUS_LABELS = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  published: 'Published',
};

function YouTubeVideoCard({ video, displayIndex, isSelected, isLocked, isDropTarget, onClick, onDelete }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: video.id,
    disabled: isLocked,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // YouTube title limits: 100 chars max, ~60 visible in search
  const titleLength = video.title?.length || 0;
  const isTitleTruncated = titleLength > 60;
  const durationLabel = formatDuration(video.durationSeconds);
  const assetState = getPlannerVideoAssetState(video);
  const queueNumber = Number.isFinite(displayIndex) ? displayIndex + 1 : (video.position ?? 0) + 1;
  const isFirstInQueue = queueNumber === 1;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(!isLocked ? { ...attributes, ...listeners } : {})}
      className={`relative bg-dark-700 rounded-lg overflow-hidden transition-all duration-200 group ${
        isDropTarget
          ? 'ring-2 ring-dark-400 ring-offset-2 ring-offset-dark-800 bg-dark-600/20 scale-[1.02]'
          : isSelected
            ? 'ring-2 ring-dark-300 ring-offset-2 ring-offset-dark-800'
            : 'hover:ring-2 hover:ring-dark-500'
      } ${isDragging ? 'z-10 cursor-grabbing opacity-30' : isLocked ? 'cursor-pointer' : 'cursor-grab'}`}
      onClick={onClick}
    >
      {/* 16:9 Thumbnail */}
      <div className="relative aspect-video bg-black">
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt={video.title || 'Video thumbnail'}
            className="w-full h-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-dark-600">
            <Image className="w-10 h-10 text-dark-400" />
          </div>
        )}

        {/* Status Badge */}
        {video.status && (
          <div className="absolute top-2 left-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium text-white ${STATUS_COLORS[video.status] || STATUS_COLORS.draft}`}>
              {STATUS_LABELS[video.status] || 'Draft'}
            </span>
          </div>
        )}

        <div className="absolute right-2 top-2 flex items-center gap-1">
          {isFirstInQueue && (
            <span className="rounded bg-dark-100/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-dark-900">
              Next up
            </span>
          )}
          <span className="rounded bg-black/80 px-2 py-0.5 text-xs font-semibold text-white">
            #{queueNumber}
          </span>
        </div>

        {/* Duration placeholder (if we add it later) */}
        {(video.duration || video.durationSeconds) && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 rounded text-xs text-white font-medium">
            {video.duration || durationLabel}
          </div>
        )}

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
          {!isLocked && (
            <div className="absolute top-2 left-2 p-1.5 bg-dark-800/80 rounded-lg text-dark-200 pointer-events-auto">
              <GripVertical className="w-4 h-4" />
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
            className="p-3 rounded-full bg-black/70 text-white hover:bg-dark-600/80 transition-colors pointer-events-auto"
            title="Delete"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Title Section */}
      <div className="p-3">
        <h3 className="text-sm font-medium text-dark-100 line-clamp-2 min-h-[2.5rem]">
          {video.artistName ? `${video.artistName} - ${video.title}` : video.title || 'Untitled Video'}
        </h3>

        {/* Character count indicator */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-dark-800 px-2 py-0.5 text-[10px] font-medium text-dark-300">
            {isFirstInQueue ? 'First in queue' : `Queue position #${queueNumber}`}
          </span>
          {assetState === 'missing' && (
            <span className="rounded-full bg-dark-600 px-2 py-0.5 text-[10px] text-dark-200">
              Thumbnail only
            </span>
          )}
          {assetState === 'processing' && (
            <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] text-blue-200">
              Processing
            </span>
          )}
          {assetState === 'errored' && (
            <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] text-red-200">
              Upload failed
            </span>
          )}
          {video.thumbnailStatus === 'needs_custom' && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-400">
              Needs custom thumb
            </span>
          )}
        </div>

        <div className="flex items-center justify-between mt-2">
          <span className={`text-xs ${isTitleTruncated ? 'text-amber-400' : 'text-dark-500'}`}>
            {titleLength}/100
          </span>
          {isTitleTruncated && (
            <span className="text-xs text-amber-400">Title may be cut off</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default YouTubeVideoCard;
