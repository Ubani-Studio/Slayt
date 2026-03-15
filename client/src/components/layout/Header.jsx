import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../stores/useAppStore';
import {
  Bell,
  Search,
  User,
  Plus,
} from 'lucide-react';

function Header() {
  const navigate = useNavigate();
  const user = useAppStore((state) => state.user);
  const profiles = useAppStore((state) => state.profiles);
  const currentProfileId = useAppStore((state) => state.currentProfileId);

  const currentProfile = profiles.find((profile) => (profile._id || profile.id) === currentProfileId) || null;
  const resolvedAvatar = currentProfile?.avatar || user?.avatar || null;
  const resolvedName = currentProfile?.name || user?.name || 'Profile';

  return (
    <header className="h-16 bg-dark-800/80 backdrop-blur-sm border-b border-dark-700 flex items-center justify-end px-6 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-64 pl-10 pr-4 py-2 bg-dark-700/50 border border-transparent rounded-md text-sm text-dark-100 placeholder-dark-400 focus:border-dark-500 focus:bg-dark-700 transition-colors"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-xs bg-dark-600 text-dark-400 rounded">
            /
          </kbd>
        </div>

        {/* New Post */}
        <button className="btn-primary">
          <Plus className="w-4 h-4" />
          <span>New Post</span>
        </button>

        {/* Divider */}
        <div className="w-px h-8 bg-dark-600" />

        {/* Notifications */}
        <button className="btn-icon relative">
          <Bell className="w-5 h-5" />
        </button>

        {/* User Menu */}
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-2 p-1.5 rounded-md hover:bg-dark-700 transition-colors"
          title="Profile Settings"
        >
          <div
            className="w-8 h-8 rounded-full bg-dark-600 overflow-hidden relative"
            style={currentProfile?.color ? { backgroundColor: currentProfile.color } : undefined}
          >
            {resolvedAvatar ? (
              <img
                src={resolvedAvatar}
                alt={resolvedName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="w-4 h-4 text-dark-300" />
              </div>
            )}
          </div>
        </button>
      </div>
    </header>
  );
}

export default Header;
