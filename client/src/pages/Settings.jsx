import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/useAppStore';
import { authApi } from '../lib/api';
import {
  User,
  X,
  Check,
  Upload,
  Eye,
  EyeOff,
  Smartphone,
  Monitor,
  AlertTriangle,
} from 'lucide-react';

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'scheduling', label: 'Scheduling' },
  { id: 'security', label: 'Security' },
  { id: 'data', label: 'Data & Export' },
];

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
];

// Fake active sessions for demo
const FAKE_SESSIONS = [
  { id: 1, device: 'Chrome on MacOS', location: 'San Francisco, CA', current: true, lastActive: 'Now' },
  { id: 2, device: 'Safari on iPhone', location: 'San Francisco, CA', current: false, lastActive: '2 hours ago' },
  { id: 3, device: 'Firefox on Windows', location: 'New York, NY', current: false, lastActive: '3 days ago' },
];

function Settings() {
  const navigate = useNavigate();
  const user = useAppStore((state) => state.user);
  const setUser = useAppStore((state) => state.setUser);
  const logout = useAppStore((state) => state.logout);
  const fileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState('profile');
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    bio: user?.bio || '',
    brandName: user?.brandName || '',
    timezone: user?.timezone || 'America/New_York',
    defaultPostTime: user?.defaultPostTime || '09:00',
    autoSaveDrafts: user?.autoSaveDrafts ?? true,
    notifications: {
      email: user?.notifications?.email ?? true,
      push: user?.notifications?.push ?? true,
      postReminders: user?.notifications?.postReminders ?? true,
      weeklyReport: user?.notifications?.weeklyReport ?? false,
    },
  });

  // Modal states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [showSessionsModal, setShowSessionsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'saving' | 'saved' | 'error'

  // Password form
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    new: '',
    confirm: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  // Avatar state
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarChanged, setAvatarChanged] = useState(false); // Track if new avatar was uploaded

  // Sync form data when user state is hydrated from localStorage
  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        name: user.name || prev.name,
        email: user.email || prev.email,
        bio: user.bio || prev.bio,
        brandName: user.brandName || prev.brandName,
        timezone: user.timezone || prev.timezone,
        defaultPostTime: user.defaultPostTime || prev.defaultPostTime,
        autoSaveDrafts: user.autoSaveDrafts ?? prev.autoSaveDrafts,
        notifications: {
          email: user.notifications?.email ?? prev.notifications.email,
          push: user.notifications?.push ?? prev.notifications.push,
          postReminders: user.notifications?.postReminders ?? prev.notifications.postReminders,
          weeklyReport: user.notifications?.weeklyReport ?? prev.notifications.weeklyReport,
        },
      }));
      setAvatarPreview(user.avatar || null);
      setAvatarFile(null);
      setAvatarChanged(false);
    }
  }, [user]);

  // Handle avatar upload
  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be less than 2MB');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setAvatarPreview(event.target?.result);
      setAvatarFile(file);
      setAvatarChanged(true); // Mark that a new avatar was uploaded
    };
    reader.readAsDataURL(file);
  };

  // Handle save
  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      const nextAvatarPosition = avatarChanged ? { x: 0, y: 0 } : (user?.avatarPosition || { x: 0, y: 0 });
      const nextAvatarZoom = avatarChanged ? 1 : (user?.avatarZoom || 1);
      let resolvedAvatar = avatarPreview;

      // Build updated user object
      const updatedUser = {
        ...(user || {}),
        id: user?.id || 'demo-user',
        name: formData.name,
        email: formData.email,
        bio: formData.bio,
        brandName: formData.brandName,
        avatar: avatarPreview,
        avatarPosition: nextAvatarPosition,
        avatarZoom: nextAvatarZoom,
        timezone: formData.timezone,
        defaultPostTime: formData.defaultPostTime,
        autoSaveDrafts: formData.autoSaveDrafts,
        notifications: formData.notifications,
      };

      // Try to save to backend if authenticated
      const token = localStorage.getItem('token');
      if (token) {
        try {
          let uploadedAvatarUser = null;

          if (avatarChanged && avatarFile) {
            const avatarResult = await authApi.uploadAvatar(avatarFile);
            resolvedAvatar = avatarResult.avatar || avatarResult.user?.avatar || resolvedAvatar;
            uploadedAvatarUser = avatarResult.user || null;
          }

          const result = await authApi.updateProfile({
            name: formData.name,
            bio: formData.bio,
            brandName: formData.brandName,
            ...(avatarChanged ? { avatarPosition: nextAvatarPosition, avatarZoom: nextAvatarZoom } : {}),
          });

          const nextUser = {
            ...updatedUser,
            avatar: resolvedAvatar,
            ...(uploadedAvatarUser || {}),
            ...(result.user || {}),
          };

          setUser(nextUser);
          setAvatarPreview(resolvedAvatar);
          setAvatarFile(null);

          // Update user in store with data from server
        } catch (apiError) {
          console.error('API save failed, saving locally:', apiError);
          // Fall back to local save if API fails
          setUser({
            ...updatedUser,
            avatar: resolvedAvatar,
          });
        }
      } else {
        // No token - save locally only (demo mode)
        setUser(updatedUser);
      }

      setSaveStatus('saved');
      setAvatarChanged(false); // Reset flag after save
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      console.error('Save error:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 2000);
    }
  };

  // Handle password change
  const handlePasswordChange = async () => {
    if (passwordForm.new !== passwordForm.confirm) {
      alert('New passwords do not match');
      return;
    }
    if (passwordForm.new.length < 8) {
      alert('Password must be at least 8 characters');
      return;
    }

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    alert('Password changed successfully!');
    setShowPasswordModal(false);
    setPasswordForm({ current: '', new: '', confirm: '' });
  };

  // Handle export data
  const handleExportData = async () => {
    // Create a fake data export
    const exportData = {
      user: { name: formData.name, email: formData.email, bio: formData.bio },
      settings: formData,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slayt-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle delete account
  const handleDeleteAccount = async () => {
    // In production, this would call the API
    logout();
    navigate('/login');
  };

  // Handle logout session
  const handleLogoutSession = (sessionId) => {
    alert(`Session ${sessionId} has been logged out`);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="text-lg font-sans font-medium text-dark-100 tracking-tight">
          Settings
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Sidebar Tabs */}
        <div className="w-full flex-shrink-0 lg:w-48">
          <nav className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'bg-dark-700 text-dark-100'
                    : 'text-dark-400 hover:bg-dark-700/50 hover:text-dark-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 bg-dark-800 border border-dark-700 p-5 sm:p-6">
          {/* Profile */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <h2 className="text-lg font-medium text-dark-100">Profile Settings</h2>

              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-dark-800 overflow-hidden">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="w-8 h-8 text-dark-400" />
                    </div>
                  )}
                </div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-secondary text-sm"
                  >
                    <Upload className="w-4 h-4" />
                    Change Avatar
                  </button>
                  <p className="text-xs text-dark-500 mt-1">JPG, PNG. Max 2MB</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="input-label">Full Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="input-label">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="input"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="input-label">Bio</label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  className="input min-h-[100px]"
                  placeholder="Tell us about yourself..."
                />
              </div>

              <div>
                <label className="input-label">Brand Name</label>
                <input
                  type="text"
                  value={formData.brandName}
                  onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
                  className="input"
                  placeholder="Your Brand"
                />
                <p className="text-xs text-dark-500 mt-1">This name will be displayed in the grid preview</p>
              </div>
            </div>
          )}

          {/* Notifications */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <h2 className="text-lg font-medium text-dark-100">Notifications</h2>

              <div className="space-y-4">
                {[
                  { key: 'email', label: 'Email Notifications', desc: 'Receive updates via email' },
                  { key: 'push', label: 'Push Notifications', desc: 'Browser push notifications' },
                  { key: 'postReminders', label: 'Post Reminders', desc: 'Reminders before scheduled posts' },
                  { key: 'weeklyReport', label: 'Weekly Reports', desc: 'Weekly performance summary' },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-dark-200">{item.label}</p>
                      <p className="text-sm text-dark-500">{item.desc}</p>
                    </div>
                    <button
                      onClick={() =>
                        setFormData({
                          ...formData,
                          notifications: {
                            ...formData.notifications,
                            [item.key]: !formData.notifications[item.key],
                          },
                        })
                      }
                      className={`w-8 h-4 rounded-full transition-colors ${
                        formData.notifications[item.key] ? 'bg-dark-300' : 'bg-dark-600'
                      }`}
                    >
                      <div
                        className={`w-3 h-3 rounded-full bg-white transition-transform ${
                          formData.notifications[item.key] ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scheduling */}
          {activeTab === 'scheduling' && (
            <div className="space-y-4">
              <h2 className="text-lg font-medium text-dark-100">Scheduling</h2>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="input-label">Timezone</label>
                  <select
                    value={formData.timezone}
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                    className="input"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="input-label">Default Post Time</label>
                  <input
                    type="time"
                    value={formData.defaultPostTime}
                    onChange={(e) => setFormData({ ...formData, defaultPostTime: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm text-dark-200">Auto-save drafts</p>
                <button
                  onClick={() =>
                    setFormData({ ...formData, autoSaveDrafts: !formData.autoSaveDrafts })
                  }
                  className={`w-8 h-4 rounded-full transition-colors ${
                    formData.autoSaveDrafts ? 'bg-dark-300' : 'bg-dark-600'
                  }`}
                >
                  <div
                    className={`w-3 h-3 rounded-full bg-white transition-transform ${
                      formData.autoSaveDrafts ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* Security */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <h2 className="text-lg font-medium text-dark-100">Security</h2>

              <div className="space-y-2">
                <button
                  onClick={() => setShowPasswordModal(true)}
                  className="w-full flex items-center justify-between p-4 bg-dark-700 hover:bg-dark-600 transition-colors"
                >
                  <div className="text-left">
                    <p className="text-sm text-dark-200">Change Password</p>
                    <p className="text-xs text-dark-500 mt-0.5">Update your password</p>
                  </div>
                </button>

                <button
                  onClick={() => setShow2FAModal(true)}
                  className="w-full flex items-center justify-between p-4 bg-dark-700 hover:bg-dark-600 transition-colors"
                >
                  <div className="text-left">
                    <p className="text-sm text-dark-200">Two-Factor Authentication</p>
                    <p className="text-xs text-dark-500 mt-0.5">Add extra security to your account</p>
                  </div>
                  <span className="text-xs text-dark-500">Off</span>
                </button>

                <button
                  onClick={() => setShowSessionsModal(true)}
                  className="w-full flex items-center justify-between p-4 bg-dark-700 hover:bg-dark-600 transition-colors"
                >
                  <div className="text-left">
                    <p className="text-sm text-dark-200">Active Sessions</p>
                    <p className="text-xs text-dark-500 mt-0.5">Manage your logged-in devices</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Data & Export */}
          {activeTab === 'data' && (
            <div className="space-y-6">
              <h2 className="text-lg font-medium text-dark-100">Data & Export</h2>

              <div className="space-y-2">
                <button
                  onClick={handleExportData}
                  className="w-full flex items-center justify-between p-4 bg-dark-700 hover:bg-dark-600 transition-colors"
                >
                  <div className="text-left">
                    <p className="text-sm text-dark-200">Export All Data</p>
                    <p className="text-xs text-dark-500 mt-0.5">Download all your content and settings</p>
                  </div>
                </button>

                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="w-full flex items-center justify-between p-4 bg-dark-700/50 hover:bg-dark-700/30 transition-colors border border-dark-600"
                >
                  <div className="text-left">
                    <p className="text-sm text-dark-300">Delete Account</p>
                    <p className="text-xs text-dark-300/70 mt-0.5">Permanently delete your account and data</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="mt-8 pt-6 border-t border-dark-700 flex justify-end items-center gap-3">
            {saveStatus === 'saved' && (
              <span className="text-dark-100 text-sm flex items-center gap-1">
                <Check className="w-4 h-4" /> Saved!
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="text-dark-300 text-sm">Failed to save</span>
            )}
            <button
              onClick={handleSave}
              className="btn-primary"
              disabled={saveStatus === 'saving'}
            >
              {saveStatus === 'saving' ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Save Changes
</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowPasswordModal(false)}>
          <div className="bg-dark-800 p-6 w-full max-w-md border border-dark-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-dark-100">Change Password</h3>
              <button onClick={() => setShowPasswordModal(false)} className="text-dark-400 hover:text-dark-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="input-label">Current Password</label>
                <div className="relative">
                  <input
                    type={showPasswords.current ? 'text' : 'password'}
                    value={passwordForm.current}
                    onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                    className="input pr-10"
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400"
                  >
                    {showPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="input-label">New Password</label>
                <div className="relative">
                  <input
                    type={showPasswords.new ? 'text' : 'password'}
                    value={passwordForm.new}
                    onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
                    className="input pr-10"
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400"
                  >
                    {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="input-label">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={showPasswords.confirm ? 'text' : 'password'}
                    value={passwordForm.confirm}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                    className="input pr-10"
                    placeholder="Confirm new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400"
                  >
                    {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowPasswordModal(false)} className="flex-1 btn-secondary">
                Cancel
              </button>
              <button onClick={handlePasswordChange} className="flex-1 btn-primary">
                Update Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2FA Modal */}
      {show2FAModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShow2FAModal(false)}>
          <div className="bg-dark-800 p-6 w-full max-w-md border border-dark-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-dark-100">Two-Factor Authentication</h3>
              <button onClick={() => setShow2FAModal(false)} className="text-dark-400 hover:text-dark-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-center py-6">
              <h4 className="text-dark-100 font-medium mb-2">Secure Your Account</h4>
              <p className="text-dark-400 text-sm mb-4">
                Two-factor authentication adds an extra layer of security by requiring a code from your phone in addition to your password.
              </p>
              <button
                onClick={() => { alert('2FA setup would start here'); setShow2FAModal(false); }}
                className="btn-primary"
              >
                Enable 2FA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Sessions Modal */}
      {showSessionsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowSessionsModal(false)}>
          <div className="bg-dark-800 p-6 w-full max-w-lg border border-dark-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-dark-100">Active Sessions</h3>
              <button onClick={() => setShowSessionsModal(false)} className="text-dark-400 hover:text-dark-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {FAKE_SESSIONS.map((session) => (
                <div key={session.id} className="flex items-center justify-between p-3 bg-dark-700">
                  <div className="flex items-center gap-3">
                    {session.device.includes('iPhone') ? (
                      <Smartphone className="w-5 h-5 text-dark-400" />
                    ) : (
                      <Monitor className="w-5 h-5 text-dark-400" />
                    )}
                    <div>
                      <p className="text-dark-200 text-sm">
                        {session.device}
                        {session.current && <span className="ml-2 text-xs text-dark-100">(Current)</span>}
                      </p>
                      <p className="text-dark-500 text-xs">{session.location} • {session.lastActive}</p>
                    </div>
                  </div>
                  {!session.current && (
                    <button
                      onClick={() => handleLogoutSession(session.id)}
                      className="text-xs text-dark-300 hover:text-dark-100"
                    >
                      Logout
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-dark-700">
              <button
                onClick={() => { alert('All other sessions logged out'); setShowSessionsModal(false); }}
                className="w-full btn-secondary text-dark-300 hover:text-dark-100"
              >
                Logout All Other Sessions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-dark-800 p-6 w-full max-w-md border border-dark-700" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <h3 className="text-lg font-medium text-dark-100">Delete Account</h3>
            </div>

            <p className="text-dark-400 mb-4">
              This action cannot be undone. All your data, including posts, schedules, and settings will be permanently deleted.
            </p>

            <div className="flex gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                className="flex-1 px-4 py-2 bg-dark-600/30 text-dark-300 hover:bg-dark-600/40 transition-colors"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
