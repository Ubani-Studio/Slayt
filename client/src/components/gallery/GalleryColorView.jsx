import { useState, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import GallerySection from './GallerySection';
import GalleryMediaCard from './GalleryMediaCard';
import { classifyColor, HUE_BUCKETS } from './colorUtils';
import { contentApi } from '../../lib/api';

function GalleryColorView({
  allItems,
  viewMode,
  selectedItems,
  onToggleSelect,
  onEdit,
  onDelete,
  onRate,
  onRefresh,
}) {
  const [collapsedBands, setCollapsedBands] = useState({});
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  const toggleBand = (name) => {
    setCollapsedBands((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const missingCount = useMemo(
    () => allItems.filter((item) => !item.metadata?.dominantColors?.[0]).length,
    [allItems]
  );

  const handleScanColors = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const result = await contentApi.backfillColors();
      setScanResult(`Processed ${result.processed} images${result.failed ? `, ${result.failed} failed` : ''}`);
      onRefresh?.();
    } catch (err) {
      setScanResult('Scan failed');
    } finally {
      setScanning(false);
    }
  };

  // Group items by color bucket
  const groupedItems = useMemo(() => {
    const groups = {};
    HUE_BUCKETS.forEach((bucket) => {
      groups[bucket.name] = [];
    });

    allItems.forEach((item) => {
      const hex = item.metadata?.dominantColors?.[0] || null;
      const bucket = classifyColor(hex);
      if (groups[bucket]) {
        groups[bucket].push(item);
      } else {
        groups['Neutrals'].push(item);
      }
    });

    return groups;
  }, [allItems]);

  const gridCols =
    viewMode === 'grid'
      ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
      : 'space-y-2';

  return (
    <div>
      {/* Scan prompt for items missing color data */}
      {missingCount > 0 && (
        <div className="mb-4 flex items-center gap-3 border border-dark-700 bg-dark-800 p-3">
          {scanning ? (
            <>
              <Loader2 className="w-4 h-4 text-dark-400 animate-spin" />
              <span className="text-xs text-dark-300">Scanning colors...</span>
            </>
          ) : (
            <>
              <span className="text-xs text-dark-400">
                {missingCount} {missingCount === 1 ? 'item' : 'items'} without color data
              </span>
              <button
                onClick={handleScanColors}
                className="h-7 px-3 text-xs border border-dark-600 text-dark-300 hover:text-dark-100 transition-colors"
              >
                Scan colors
              </button>
            </>
          )}
        </div>
      )}

      {scanResult && (
        <div className="mb-4 border border-dark-700 bg-dark-800 px-4 py-2 text-xs text-dark-300">
          {scanResult}
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
                  onRate={onRate}
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
