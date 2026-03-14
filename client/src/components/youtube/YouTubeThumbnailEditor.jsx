import React, { useState, useRef, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { X, Check, ZoomIn, ZoomOut, RotateCw, Image } from 'lucide-react';

const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;
const MAX_ZOOM = 3;
const MIN_ZOOM = 1;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getRotatedSize(imageSize, rotation) {
  if (!imageSize.width || !imageSize.height) {
    return { width: 0, height: 0 };
  }

  const normalized = ((rotation % 360) + 360) % 360;
  const isQuarterTurn = normalized === 90 || normalized === 270;

  return isQuarterTurn
    ? { width: imageSize.height, height: imageSize.width }
    : imageSize;
}

function getFrameMetrics(imageSize, frameSize, rotation, zoom) {
  if (!imageSize.width || !imageSize.height || !frameSize.width || !frameSize.height) {
    return {
      coverScale: 1,
      scaledWidth: 0,
      scaledHeight: 0,
      maxOffsetX: 0,
      maxOffsetY: 0,
    };
  }

  const rotated = getRotatedSize(imageSize, rotation);
  const coverScale = Math.max(
    frameSize.width / rotated.width,
    frameSize.height / rotated.height
  );
  const scaledWidth = rotated.width * coverScale * zoom;
  const scaledHeight = rotated.height * coverScale * zoom;

  return {
    coverScale,
    scaledWidth,
    scaledHeight,
    maxOffsetX: Math.max(0, (scaledWidth - frameSize.width) / 2),
    maxOffsetY: Math.max(0, (scaledHeight - frameSize.height) / 2),
  };
}

function YouTubeThumbnailEditor({ image, onSave, onCancel }) {
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const containerRef = useRef(null);
  const dragStateRef = useRef({ pointerId: null, startX: 0, startY: 0 });

  const clampPosition = useCallback((nextPosition, nextZoom = zoom, nextRotation = rotation) => {
    const metrics = getFrameMetrics(imageSize, containerSize, nextRotation, nextZoom);

    return {
      x: clamp(nextPosition.x, -metrics.maxOffsetX, metrics.maxOffsetX),
      y: clamp(nextPosition.y, -metrics.maxOffsetY, metrics.maxOffsetY),
    };
  }, [containerSize, imageSize, rotation, zoom]);

  useEffect(() => {
    if (!image) {
      setImageSize({ width: 0, height: 0 });
      return;
    }

    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (cancelled) return;
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
      setZoom(MIN_ZOOM);
      setPosition({ x: 0, y: 0 });
      setRotation(0);
      setIsDragging(false);
    };
    img.src = image;

    return () => {
      cancelled = true;
    };
  }, [image]);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const updateContainerSize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
    };

    updateContainerSize();

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateContainerSize)
      : null;

    observer?.observe(containerRef.current);
    window.addEventListener('resize', updateContainerSize);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateContainerSize);
    };
  }, []);

  useEffect(() => {
    setPosition((current) => clampPosition(current));
  }, [clampPosition]);

  const handlePointerDown = useCallback((e) => {
    if (!imageSize.width || !imageSize.height) return;

    e.preventDefault();
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX - position.x,
      startY: e.clientY - position.y,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setIsDragging(true);
  }, [imageSize, position]);

  const handlePointerMove = useCallback((e) => {
    if (!isDragging || dragStateRef.current.pointerId !== e.pointerId) return;

    setPosition(clampPosition({
      x: e.clientX - dragStateRef.current.startX,
      y: e.clientY - dragStateRef.current.startY,
    }));
  }, [clampPosition, isDragging]);

  const handlePointerUp = useCallback((e) => {
    if (dragStateRef.current.pointerId !== e.pointerId) return;

    e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragStateRef.current = { pointerId: null, startX: 0, startY: 0 };
    setIsDragging(false);
  }, []);

  const handleZoomChange = useCallback((nextZoom) => {
    const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    setZoom(clampedZoom);
    setPosition((current) => clampPosition(current, clampedZoom, rotation));
  }, [clampPosition, rotation]);

  const handleRotate = useCallback(() => {
    const nextRotation = (rotation + 90) % 360;
    setRotation(nextRotation);
    setPosition((current) => clampPosition(current, zoom, nextRotation));
  }, [clampPosition, rotation, zoom]);

  const handleSave = useCallback(async () => {
    if (!image || !containerSize.width || !containerSize.height || !imageSize.width || !imageSize.height) {
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_WIDTH;
    canvas.height = OUTPUT_HEIGHT;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

    const img = new window.Image();
    img.crossOrigin = 'anonymous';

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = image;
    });

    const canvasMetrics = getFrameMetrics(
      imageSize,
      { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT },
      rotation,
      zoom
    );
    const scaledPosition = {
      x: position.x * (OUTPUT_WIDTH / containerSize.width),
      y: position.y * (OUTPUT_HEIGHT / containerSize.height),
    };

    ctx.save();
    ctx.translate((OUTPUT_WIDTH / 2) + scaledPosition.x, (OUTPUT_HEIGHT / 2) + scaledPosition.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(canvasMetrics.coverScale * zoom, canvasMetrics.coverScale * zoom);
    ctx.drawImage(img, -imageSize.width / 2, -imageSize.height / 2, imageSize.width, imageSize.height);
    ctx.restore();

    onSave(canvas.toDataURL('image/jpeg', 0.95));
  }, [containerSize, image, imageSize, onSave, position, rotation, zoom]);

  const previewMetrics = getFrameMetrics(imageSize, containerSize, rotation, zoom);
  const previewScale = previewMetrics.coverScale * zoom;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-dark-800 rounded-2xl border border-dark-700 w-full max-w-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-dark-100">Edit Thumbnail</h2>
          <button
            onClick={onCancel}
            className="p-2 text-dark-400 hover:text-dark-200 hover:bg-dark-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <div
            ref={containerRef}
            className={`relative aspect-video bg-dark-900 rounded-lg overflow-hidden ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{ touchAction: 'none' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {image ? (
              <div
                className="absolute left-1/2 top-1/2 pointer-events-none"
                style={{
                  transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
                }}
              >
                <img
                  src={image}
                  alt="Thumbnail preview"
                  className="block select-none max-w-none"
                  style={{
                    width: imageSize.width || undefined,
                    height: imageSize.height || undefined,
                    transform: `rotate(${rotation}deg) scale(${previewScale})`,
                    transformOrigin: 'center center',
                  }}
                  draggable={false}
                />
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Image className="w-16 h-16 text-dark-500" />
              </div>
            )}

            <div className="absolute inset-0 border-2 border-white/30 pointer-events-none" />
            <div className="absolute inset-0 pointer-events-none opacity-50">
              <div className="absolute left-1/3 top-0 bottom-0 border-l border-white/20" />
              <div className="absolute left-2/3 top-0 bottom-0 border-l border-white/20" />
              <div className="absolute top-1/3 left-0 right-0 border-t border-white/20" />
              <div className="absolute top-2/3 left-0 right-0 border-t border-white/20" />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-4">
            <div className="flex items-center gap-2 bg-dark-700 rounded-lg p-2">
              <button
                onClick={() => handleZoomChange(zoom - 0.1)}
                className="p-1.5 text-dark-300 hover:text-white transition-colors"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
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

            <button
              onClick={handleRotate}
              className="flex items-center gap-2 px-3 py-2 bg-dark-700 text-dark-300 hover:text-white rounded-lg transition-colors"
            >
              <RotateCw className="w-4 h-4" />
              <span className="text-sm">Rotate</span>
            </button>
          </div>

          <div className="mt-4 p-3 bg-dark-700 rounded-lg">
            <p className="text-xs text-dark-400">
              <strong className="text-dark-300">Tip:</strong> Keep thumbnails at 16:9.
              YouTube recommends at least 1280x720; this editor exports a sharper 1920x1080 JPEG
              and locks the crop so black edges never show.
            </p>
          </div>
        </div>

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

YouTubeThumbnailEditor.propTypes = {
  image: PropTypes.string,
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};
