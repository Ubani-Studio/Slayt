import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import GallerySection from './GallerySection';
import GalleryMediaCard from './GalleryMediaCard';
import { extractDominantColor, classifyColor, HUE_BUCKETS } from './colorUtils';

const BATCH_SIZE = 5;

function GalleryColorView({
  allItems,
  viewMode,
  selectedItems,
  onToggleSelect,
  onEdit,
  onDelete,
}) {
  const [colorMap, setColorMap] = useState({}); // { _id: hex }
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [collapsedBands, setCollapsedBands] = useState({});
  const abortRef = useRef(false);

  const toggleBand = (name) => {
    setCollapsedBands((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  // Extract colors in batches
  const extractColors = useCallback(async () => {
    abortRef.current = false;
    const itemsToProcess = allItems.filter((item) => {
      // Skip if already extracted
      if (colorMap[item._id]) return false;
      // Use metadata if available
      if (item.metadata?.dominantColors?.[0]) return false;
      // Need a URL to extract from
      return item.thumbnailUrl || item.mediaUrl;
    });

    // First, collect items with existing metadata
    const metaColors = {};
    allItems.forEach((item) => {
      if (item.metadata?.dominantColors?.[0]) {
        metaColors[item._id] = item.metadata.dominantColors[0];
      }
    });

    if (Object.keys(metaColors).length > 0) {
      setColorMap((prev) => ({ ...prev, ...metaColors }));
    }

    if (itemsToProcess.length === 0) return;

    setExtracting(true);
    setProgress({ done: 0, total: itemsToProcess.length });

    for (let i = 0; i < itemsToProcess.length; i += BATCH_SIZE) {
      if (abortRef.current) break;

      const batch = itemsToProcess.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (item) => {
          const url = item.thumbnailUrl || item.mediaUrl;
          const color = await extractDominantColor(url);
          return { id: item._id, color };
        })
      );

      const batchColors = {};
      results.forEach(({ id, color }) => {
        if (color) batchColors[id] = color;
      });

      setColorMap((prev) => ({ ...prev, ...batchColors }));
      setProgress((prev) => ({ ...prev, done: Math.min(i + BATCH_SIZE, itemsToProcess.length) }));
    }

    setExtracting(false);
  }, [allItems, colorMap]);

  useEffect(() => {
    extractColors();
    return () => { abortRef.current = true; };
  }, [allItems]); // Re-extract when items change

  // Group items by color bucket
  const groupedItems = {};
  HUE_BUCKETS.forEach((bucket) => {
    groupedItems[bucket.name] = [];
  });

  allItems.forEach((item) => {
    const hex = colorMap[item._id] || item.metadata?.dominantColors?.[0] || null;
    const bucket = classifyColor(hex);
    if (groupedItems[bucket]) {
      groupedItems[bucket].push(item);
    } else {
      groupedItems['Neutrals'].push(item);
    }
  });

  const gridCols =
    viewMode === 'grid'
      ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
      : 'space-y-2';

  return (
    <div>
      {/* Progress Indicator */}
      {extracting && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-dark-700/60 bg-dark-900/45 p-3">
          <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
          <span className="text-sm text-dark-300">
            Extracting colors... {progress.done}/{progress.total}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-dark-700">
            <div
              className="h-full bg-zinc-400 rounded-full transition-all"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Color Bands */}
      {HUE_BUCKETS.map((bucket) => {
        const items = groupedItems[bucket.name];
        if (items.length === 0) return null;

        return (
          <GallerySection
            key={bucket.name}
            title={bucket.name}
            icon={() => (
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: bucket.color }}
              />
            )}
            items={items}
            isCollapsed={!!collapsedBands[bucket.name]}
            onToggle={() => toggleBand(bucket.name)}
          >
            <div className={gridCols}>
              {items.map((item) => (
                <GalleryMediaCard
                  key={item._id}
                  item={item}
                  isSelected={selectedItems.includes(item._id)}
                  onToggleSelect={onToggleSelect}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  viewMode={viewMode}
                  readOnly={!!item._isYouTube}
                  isYouTube={!!item._isYouTube}
                />
              ))}
            </div>
          </GallerySection>
        );
      })}
    </div>
  );
}

export default GalleryColorView;
