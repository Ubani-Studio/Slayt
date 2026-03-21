import { ChevronDown, ChevronRight } from 'lucide-react';

function GallerySection({ title, items, isCollapsed, onToggle, children, readOnly }) {
  return (
    <div className="mb-4 border border-dark-800/80 bg-dark-900/25 px-3 py-2 sm:px-4">
      {/* Section Header */}
      <button
        onClick={onToggle}
        className="group flex w-full items-center gap-2.5 px-1 py-1.5 text-left"
      >
        {isCollapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-dark-400 transition-colors group-hover:text-dark-200" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-dark-400 transition-colors group-hover:text-dark-200" />
        )}
        <span className="text-sm font-medium text-dark-100">{title}</span>
        <span className="border border-dark-700/60 bg-dark-900/70 px-2 py-0.5 text-[11px] text-dark-400">
          {items.length}
        </span>
        {readOnly && (
          <span className="border border-dark-700/50 bg-dark-900/40 px-2 py-0.5 text-[11px] text-dark-500">
            Read-only
          </span>
        )}
      </button>

      {/* Section Content */}
      {!isCollapsed && (
        <div className="mt-2">
          {children}
        </div>
      )}
    </div>
  );
}

export default GallerySection;
