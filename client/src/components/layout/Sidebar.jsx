import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAppStore } from '../../stores/useAppStore';
import ProfileSwitcher from '../profile/ProfileSwitcher';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';

const navSections = [
  {
    id: 'plan',
    label: 'Plan',
    items: [
      { path: '/grid', label: 'Grid' },
      { path: '/youtube', label: 'YouTube' },
      { path: '/calendar', label: 'Calendar' },
      { path: '/rollout', label: 'Rollout' },
    ],
  },
  {
    id: 'create',
    label: 'Create',
    items: [
      { path: '/library', label: 'Library' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { path: '/settings', label: 'Settings' },
      {
        id: 'more',
        label: 'More',
        children: [
          { path: '/learning', label: 'Learning' },
          { path: '/studio', label: 'Folio' },
          { path: '/profiles', label: 'Profiles' },
          { path: '/connections', label: 'Connections' },
        ],
      },
    ],
  },
];

function NavItem({ item, collapsed }) {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(() => {
    // Auto-open if any child is active
    if (item.children) {
      return item.children.some(child => location.pathname === child.path);
    }
    return false;
  });

  // Check if this item or any child is active
  const isActive = item.children
    ? item.children.some(child => location.pathname === child.path)
    : location.pathname === item.path;

  // Simple nav item (no children)
  if (!item.children) {
    return (
      <li>
        <NavLink
          to={item.path}
          className={({ isActive }) =>
            `h-8 flex items-center px-2.5 transition-colors ${
              isActive
                ? 'text-dark-100 font-medium'
                : 'text-dark-400 hover:text-dark-200'
            } ${collapsed ? 'justify-center' : ''}`
          }
          title={collapsed ? item.label : undefined}
        >
          {collapsed ? (
            <span className="text-xs font-medium">{item.label.charAt(0)}</span>
          ) : (
            <span className="text-sm">{item.label}</span>
          )}
        </NavLink>
      </li>
    );
  }

  // Grouped nav item with children
  return (
    <li>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`w-full h-8 flex items-center gap-2 px-2.5 transition-colors ${
          isActive
            ? 'text-dark-100 font-medium'
            : 'text-dark-400 hover:text-dark-200'
        } ${collapsed ? 'justify-center' : ''}`}
        title={collapsed ? item.label : undefined}
        type="button"
      >
        {collapsed ? (
          <span className="text-xs font-medium">{item.label.charAt(0)}</span>
        ) : (
          <>
            <span className="text-sm flex-1 text-left">{item.label}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </>
        )}
      </button>

      {/* Child items */}
      {!collapsed && isOpen && (
        <ul className="mt-1 ml-3 pl-3 border-l border-dark-700 space-y-0.5">
          {item.children.map((child) => (
            <li key={child.path}>
              <NavLink
                to={child.path}
                className={({ isActive }) =>
                  `h-8 flex items-center px-2.5 transition-colors text-sm ${
                    isActive
                      ? 'text-dark-100 font-medium'
                      : 'text-dark-500 hover:text-dark-200'
                  }`
                }
              >
                <span>{child.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Sidebar() {
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);

  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-dark-800 border-r border-dark-700 flex flex-col transition-all duration-300 z-[60] ${
        sidebarCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-dark-700">
        {!sidebarCollapsed && (
          <div className="flex items-center">
            <span className="font-display font-semibold text-[1.15rem] leading-none text-white tracking-[0.03em]">
              Slayt
            </span>
          </div>
        )}
        {sidebarCollapsed && (
          <div className="mx-auto">
            <span className="font-display font-semibold text-xs leading-none text-white tracking-[0.04em]">
              Slayt
            </span>
          </div>
        )}
      </div>

      {/* Profile Switcher */}
      <ProfileSwitcher collapsed={sidebarCollapsed} />

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <div className="px-2 space-y-3">
          {navSections.map((section, i) => (
            <div key={section.id} className={i > 0 ? 'pt-2 mt-2 border-t border-dark-700/50' : ''}>
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <NavItem
                    key={item.path || item.id}
                    item={item}
                    collapsed={sidebarCollapsed}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-dark-700">
        <button
          onClick={toggleSidebar}
          className="w-full h-9 flex items-center justify-center gap-2 px-3 text-dark-400 hover:bg-dark-700/30 hover:text-dark-200 transition-colors"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <>
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
