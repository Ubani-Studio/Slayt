import { Check } from 'lucide-react';
import StarRating from './StarRating';

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

function GalleryMediaCard({
  item,
  isSelected,
  onToggleSelect,
  onEdit,
  onDelete,
  onRate,
  viewMode,
  readOnly,
  isYouTube,
}) {
  const imageUrl = item.thumbnailUrl || item.mediaUrl || null;
  const rating = typeof item.clarosa?.rating === 'number' ? item.clarosa.rating : 0;

  if (viewMode === 'list') {
    return (
      <div
        className={`flex items-center gap-3 border border-dark-700/60 bg-dark-900/45 p-2.5 transition-all ${
          readOnly ? 'cursor-default' : 'cursor-pointer'
        } ${
          isSelected
            ? 'ring-1 ring-dark-300 ring-offset-1 ring-offset-dark-950'
            : readOnly
              ? ''
              : 'hover:border-dark-500 hover:bg-dark-900/75'
        }`}
        onClick={() => !readOnly && onToggleSelect?.(item._id)}
      >
        {/* Selection Checkbox */}
        {!readOnly && (
          <div
            className={`flex h-5 w-5 flex-shrink-0 items-center justify-center border ${
              isSelected
                ? 'bg-dark-300 border-dark-300'
                : 'border-dark-500 bg-dark-950/60'
            }`}
          >
            {isSelected && <Check className="w-3 h-3 text-dark-900" />}
          </div>
        )}

        {/* Thumbnail */}
        <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden border border-dark-700/70 bg-dark-800">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-dark-700">
              <span className="text-[9px] text-dark-400">No img</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium text-dark-100">
            {getDisplayTitle(item)}
          </p>
          <p className="mt-0.5 text-xs text-dark-500">
            {getDisplayDate(item)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <div onClick={(e) => e.stopPropagation()}>
            <StarRating
              rating={rating}
              onChange={readOnly ? undefined : (r) => onRate?.(item._id, r)}
              size="sm"
              readOnly={readOnly}
            />
          </div>
          {!readOnly && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(item._id);
              }}
              className="text-xs text-dark-500 hover:text-dark-200 transition-colors px-1"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    );
  }

  // Grid view (default)
  return (
    <div
      className={`group relative aspect-square overflow-hidden border border-dark-700/60 bg-dark-800/90 transition-all ${
        readOnly ? 'cursor-default' : 'cursor-pointer'
      } ${
        isSelected
          ? 'ring-1 ring-dark-300 ring-offset-1 ring-offset-dark-950'
          : readOnly
            ? ''
            : 'hover:border-dark-500'
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
        <span className="text-xs text-white/40 px-2 text-center truncate max-w-full">
          {item.title || 'Untitled'}
        </span>
      </div>

      {/* Selection Indicator */}
      {!readOnly && (
        <div
          className={`absolute left-2.5 top-2.5 flex h-5 w-5 items-center justify-center border transition-all ${
            isSelected
              ? 'bg-dark-300 border-dark-300'
              : 'border-white/30 bg-black/35 opacity-0 group-hover:opacity-100'
          }`}
        >
          {isSelected && <Check className="w-3 h-3 text-dark-900" />}
        </div>
      )}

      {/* Bottom Overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2.5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div onClick={(e) => e.stopPropagation()}>
            <StarRating
              rating={rating}
              onChange={readOnly ? undefined : (r) => onRate?.(item._id, r)}
              size="sm"
              readOnly={readOnly}
            />
          </div>
          <span className="text-[10px] text-white/50 ml-auto">
            {getDisplayDate(item)}
          </span>
        </div>
        <p className="truncate text-sm font-medium text-white">
          {getDisplayTitle(item)}
        </p>
      </div>

      {/* Hover Actions */}
      {!readOnly && (
        <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/0 opacity-0 transition-colors group-hover:bg-black/30 group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(item);
            }}
            className="border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(item._id);
            }}
            className="border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default GalleryMediaCard;
