import {
  Check,
  Edit,
  Trash2,
  Film,
  Image,
  Youtube,
} from 'lucide-react';

const getDisplayTitle = (item) => item.title || item.caption || 'Untitled';

const getDisplayDate = (item) => {
  const value = item.createdAt || item.updatedAt || item.scheduledDate || null;
  if (!value) return 'Unknown date';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown date';

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const getMediaBadge = (item, isYouTube) => {
  if (isYouTube) return 'thumbnail';
  return item.mediaType || 'image';
};

const getClarosaLabel = (item) => {
  if (item.clarosa?.status !== 'matched') return null;
  if (typeof item.clarosa.rating === 'number') {
    return `Clarosa ${item.clarosa.rating.toFixed(1)}★`;
  }
  return 'Clarosa Match';
};

function GalleryMediaCard({
  item,
  isSelected,
  onToggleSelect,
  onEdit,
  onDelete,
  viewMode,
  readOnly,
  isYouTube,
}) {
  const imageUrl = item.thumbnailUrl || item.mediaUrl || null;
  const clarosaLabel = getClarosaLabel(item);

  if (viewMode === 'list') {
    return (
      <div
        className={`flex items-center gap-3 rounded-[20px] border border-dark-700/60 bg-dark-900/45 p-2.5 transition-all ${
          readOnly ? 'cursor-default' : 'cursor-pointer'
        } ${
          isSelected
            ? 'ring-2 ring-zinc-400 ring-offset-1 ring-offset-dark-950'
            : readOnly
              ? ''
              : 'hover:border-dark-500 hover:bg-dark-900/75'
        }`}
        onClick={() => !readOnly && onToggleSelect?.(item._id)}
      >
        {/* Selection Checkbox */}
        {!readOnly && (
          <div
            className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${
              isSelected
                ? 'bg-zinc-200 border-zinc-200'
                : 'border-dark-500 bg-dark-950/60'
            }`}
          >
            {isSelected && <Check className="w-3 h-3 text-dark-900" />}
          </div>
        )}

        {/* Thumbnail */}
        <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl border border-dark-700/70 bg-dark-800">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-dark-600">
              <Image className="w-6 h-6 text-dark-400" />
            </div>
          )}
          {isYouTube && (
            <div className="absolute bottom-0.5 right-0.5 w-5 h-5 rounded bg-dark-100 flex items-center justify-center">
              <Youtube className="w-3 h-3 text-white" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium text-dark-100">
            {getDisplayTitle(item)}
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-dark-500">
            {getDisplayDate(item)}
          </p>
        </div>

        {/* Badges + Actions */}
        <div className="flex items-center gap-2">
          {clarosaLabel && (
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300">
              {clarosaLabel}
            </span>
          )}
          <span className="rounded-full border border-dark-700/70 bg-dark-950/55 px-2.5 py-1 text-[11px] text-dark-400">
            {getMediaBadge(item, isYouTube)}
          </span>
          {!readOnly && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(item._id);
              }}
              className="btn-icon text-dark-400 hover:text-dark-200"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Grid view (default)
  return (
    <div
      className={`group relative aspect-square overflow-hidden rounded-[24px] border border-dark-700/60 bg-dark-800/90 shadow-[0_10px_30px_rgba(0,0,0,0.16)] transition-all ${
        readOnly ? 'cursor-default' : 'cursor-pointer'
      } ${
        isSelected
          ? 'ring-2 ring-zinc-400 ring-offset-2 ring-offset-dark-950'
          : readOnly
            ? ''
            : 'hover:-translate-y-0.5 hover:border-dark-500'
      }`}
      onClick={() => !readOnly && onToggleSelect?.(item._id)}
    >
      {/* Image */}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={item.title || ''}
          className="w-full h-full object-cover"
          onError={(e) => {
            e.target.style.display = 'none';
            e.target.nextSibling?.classList.remove('hidden');
          }}
        />
      ) : null}
      <div
        className={`w-full h-full flex flex-col items-center justify-center ${imageUrl ? 'hidden' : ''}`}
        style={{ backgroundColor: '#3f3f46' }}
      >
        <Image className="w-8 h-8 text-white/30 mb-2" />
        <span className="text-xs text-white/50 px-2 text-center truncate max-w-full">
          {item.title || 'Untitled'}
        </span>
      </div>

      {/* Selection Indicator */}
      {!readOnly && (
        <div
          className={`absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border transition-all ${
            isSelected
              ? 'bg-zinc-200 border-zinc-200'
              : 'border-white/30 bg-black/35 opacity-0 backdrop-blur-sm group-hover:opacity-100'
          }`}
        >
          {isSelected && <Check className="w-4 h-4 text-dark-900" />}
        </div>
      )}

      {/* Type Badge */}
      {item.mediaType === 'video' && !isYouTube && (
        <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/45 backdrop-blur-sm">
          <Film className="w-3 h-3 text-white" />
        </div>
      )}

      {/* YouTube Badge */}
      {isYouTube && (
        <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/45 backdrop-blur-sm">
          <Youtube className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Title Overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-white/70 backdrop-blur-sm">
              {getMediaBadge(item, isYouTube)}
            </span>
            {clarosaLabel && (
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/15 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-200 backdrop-blur-sm">
                {clarosaLabel}
              </span>
            )}
          </div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/55">
            {getDisplayDate(item)}
          </span>
        </div>
        <p className="truncate text-sm font-medium text-white">
          {getDisplayTitle(item)}
        </p>
      </div>

      {/* Hover Actions */}
      {!readOnly && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition-colors group-hover:bg-black/30 group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(item);
            }}
            className="rounded-2xl border border-white/10 bg-white/10 p-2.5 backdrop-blur-sm hover:bg-white/20"
          >
            <Edit className="w-4 h-4 text-white" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(item._id);
            }}
            className="rounded-2xl border border-white/10 bg-white/10 p-2.5 backdrop-blur-sm hover:bg-white/20"
          >
            <Trash2 className="w-4 h-4 text-white" />
          </button>
        </div>
      )}
    </div>
  );
}

export default GalleryMediaCard;
