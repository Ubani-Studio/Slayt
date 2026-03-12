import { useState, useRef, useCallback } from 'react';
import { X, Check, ZoomIn, ZoomOut, RotateCw, Upload, Image } from 'lucide-react';

// YouTube thumbnail is 16:9 (1280x720 recommended)
const ASPECT_RATIO = 16 / 9;

function YouTubeThumbnailEditor({ image, onSave, onCancel }) {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);

  const containerRef = useRef(null);
  const imageRef = useRef(null);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  }, [position]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleZoomChange = (newZoom) => {
    setZoom(Math.max(0.5, Math.min(3, newZoom)));
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleSave = async () => {
    if (!imageRef.current || !containerRef.current) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // YouTube thumbnail dimensions (full HD for best quality)
    canvas.width = 1920;
    canvas.height = 1080;

    const img = new window.Image();
    img.crossOrigin = 'anonymous';

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = image;
    });

    // Calculate crop area based on zoom and position
    const container = containerRef.current.getBoundingClientRect();
    const scaleX = img.naturalWidth / (container.width * zoom);
    const scaleY = img.naturalHeight / (container.height * zoom);

    // Draw with transformations
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    ctx.drawImage(
      img,
      -position.x * scaleX,
      -position.y * scaleY,
      container.width * scaleX,
      container.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.restore();

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    onSave(dataUrl);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-dark-800 rounded-2xl border border-dark-700 w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-dark-100">Edit Thumbnail</h2>
          <button
            onClick={onCancel}
            className="p-2 text-dark-400 hover:text-dark-200 hover:bg-dark-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preview Area */}
        <div className="p-4">
          <div
            ref={containerRef}
            className="relative aspect-video bg-dark-900 rounded-lg overflow-hidden cursor-move"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {image ? (
              <img
                ref={imageRef}
                src={image}
                alt="Thumbnail preview"
                className="absolute select-none"
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: 'center center',
                  maxWidth: 'none',
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
                draggable={false}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Image className="w-16 h-16 text-dark-500" />
              </div>
            )}

            {/* 16:9 Frame Indicator */}
            <div className="absolute inset-0 border-2 border-white/30 pointer-events-none" />

            {/* Rule of thirds */}
            <div className="absolute inset-0 pointer-events-none opacity-50">
              <div className="absolute left-1/3 top-0 bottom-0 border-l border-white/20" />
              <div className="absolute left-2/3 top-0 bottom-0 border-l border-white/20" />
              <div className="absolute top-1/3 left-0 right-0 border-t border-white/20" />
              <div className="absolute top-2/3 left-0 right-0 border-t border-white/20" />
            </div>
          </div>

          {/* Controls */}
          <div className="mt-4 flex items-center justify-center gap-4">
            {/* Zoom */}
            <div className="flex items-center gap-2 bg-dark-700 rounded-lg p-2">
              <button
                onClick={() => handleZoomChange(zoom - 0.1)}
                className="p-1.5 text-dark-300 hover:text-white transition-colors"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={zoom}
                onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                className="w-24 accent-white"
              />
              <button
                onClick={() => handleZoomChange(zoom + 0.1)}
                className="p-1.5 text-dark-300 hover:text-white transition-colors"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <span className="text-xs text-dark-400 w-12 text-center">
                {Math.round(zoom * 100)}%
              </span>
            </div>

            {/* Rotate */}
            <button
              onClick={handleRotate}
              className="flex items-center gap-2 px-3 py-2 bg-dark-700 text-dark-300 hover:text-white rounded-lg transition-colors"
            >
              <RotateCw className="w-4 h-4" />
              <span className="text-sm">Rotate</span>
            </button>
          </div>

          {/* Tips */}
          <div className="mt-4 p-3 bg-dark-700 rounded-lg">
            <p className="text-xs text-dark-400">
              <strong className="text-dark-300">Tip:</strong> YouTube thumbnails are 1280x720 (16:9).
              Drag to position, zoom to crop. Text and faces should be in the center for best visibility.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-dark-700 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleSave} className="btn-primary bg-dark-100 hover:bg-white text-dark-900">
            <Check className="w-4 h-4" />
            Save Thumbnail
          </button>
        </div>
      </div>
    </div>
  );
}

export default YouTubeThumbnailEditor;
