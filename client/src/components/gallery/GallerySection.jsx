import { ChevronDown, ChevronRight } from 'lucide-react';

function GallerySection({ title, icon: Icon, items, isCollapsed, onToggle, children, readOnly }) {
  return (
    <div className="mb-5 rounded-[24px] border border-dark-800/80 bg-dark-900/25 px-3 py-2 sm:px-4">
      {/* Section Header */}
      <button
        onClick={onToggle}
        className="group flex w-full items-center gap-3 rounded-2xl px-1 py-2 text-left"
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4 text-dark-400 transition-colors group-hover:text-dark-200" />
        ) : (
          <ChevronDown className="h-4 w-4 text-dark-400 transition-colors group-hover:text-dark-200" />
        )}
        {Icon && <Icon className="h-4 w-4 text-dark-300" />}
        <span className="text-sm font-medium tracking-[0.02em] text-dark-100">{title}</span>
        <span className="inline-flex items-center rounded-full border border-dark-700/60 bg-dark-900/70 px-2.5 py-1 text-[11px] text-dark-400">
          {items.length} items
        </span>
        {readOnly && (
          <span className="inline-flex items-center rounded-full border border-dark-700/50 bg-dark-900/40 px-2.5 py-1 text-[11px] text-dark-500">
            Read-only
          </span>
        )}
      </button>

      {/* Section Content */}
      {!isCollapsed && (
        <div className="mt-3">
          {children}
        </div>
      )}
    </div>
  );
}

export default GallerySection;
