import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/useAppStore';
import { authApi } from '../lib/api';
import {
  User,
  Bell,
  Palette,
  Clock,
  Shield,
  Download,
  Trash2,
  Moon,
  Sun,
  Save,
  Key,
  Globe,
  X,
  Check,
  Upload,
  Eye,
  EyeOff,
  Smartphone,
  Monitor,
  AlertTriangle,
} from 'lucide-react';

// Remap zoom: slider value to actual scale (quadratic for zoom > 1)
const getActualZoom = (val) => val <= 1 ? val : val * val;

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'scheduling', label: 'Scheduling', icon: Clock },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'data', label: 'Data & Export', icon: Download },
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
  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
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
    timezone: 'America/New_York',
    defaultPostTime: '09:00',
    autoSaveDrafts: true,
    notifications: {
      email: true,
      push: true,
      postReminders: true,
      weeklyReport: false,
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

  const previewAvatarPosition = avatarChanged ? { x: 0, y: 0 } : (user?.avatarPosition || { x: 0, y: 0 });
  const previewAvatarZoom = avatarChanged ? 1 : (user?.avatarZoom || 1);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-semibold text-dark-100 mb-2 uppercase tracking-widest">
          Settings
        </h1>
        <p className="text-dark-400">
          Manage your account preferences and application settings.
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Sidebar Tabs */}
        <div className="w-full flex-shrink-0 lg:w-48">
          <nav className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                  activeTab === tab.id
                    ? 'bg-dark-700 text-dark-100'
                    : 'text-dark-300 hover:bg-dark-700 hover:text-dark-100'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="text-sm">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 bg-dark-800 rounded-2xl border border-dark-700 p-5 sm:p-6">
          {/* Profile */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <h2 className="text-lg font-medium text-dark-100">Profile Settings</h2>

              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-dark-600 overflow-hidden relative">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Avatar"
                      className="absolute pointer-events-none"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        left: '50%',
                        top: '50%',
                        transformOrigin: 'center center',
                        transform: `translate(-50%, -50%) translate(${previewAvatarPosition.x * 0.3}px, ${previewAvatarPosition.y * 0.3}px) scale(${getActualZoom(previewAvatarZoom)})`,
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="w-8 h-8 text-white" />
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

          {/* Appearance */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <h2 className="text-lg font-medium text-dark-100">Appearance</h2>

              <div>
                <label className="input-label mb-3">Theme</label>
                <div className="flex gap-4">
                  <button
                    onClick={() => theme !== 'dark' && toggleTheme()}
                    className={`flex-1 p-4 rounded-xl border-2 transition-colors ${
                      theme === 'dark'
                        ? 'border-dark-100 bg-dark-700'
                        : 'border-dark-600 hover:border-dark-500'
                    }`}
                  >
                    <Moon className="w-6 h-6 text-dark-200 mx-auto mb-2" />
                    <p className="text-sm text-dark-200">Dark</p>
                  </button>
                  <button
                    onClick={() => theme !== 'light' && toggleTheme()}
                    className={`flex-1 p-4 rounded-xl border-2 transition-colors ${
                      theme === 'light'
                        ? 'border-dark-100 bg-dark-700'
                        : 'border-dark-600 hover:border-dark-500'
                    }`}
                  >
                    <Sun className="w-6 h-6 text-dark-200 mx-auto mb-2" />
                    <p className="text-sm text-dark-200">Light</p>
                  </button>
                </div>
              </div>

              <div>
                <label className="input-label">Accent Color</label>
                <div className="flex gap-2 mt-2">
                  {['#8b5cf6', '#3b82f6', '#10b981', '#f97316', '#ec4899'].map((color) => (
                    <button
                      key={color}
                      onClick={() => alert(`Accent color changed to ${color}`)}
                      className="w-8 h-8 rounded-full border-2 border-transparent hover:border-white/50 hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
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
                      className={`w-12 h-6 rounded-full transition-colors ${
                        formData.notifications[item.key] ? 'bg-dark-100' : 'bg-dark-600'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          formData.notifications[item.key] ? 'translate-x-6' : 'translate-x-0.5'
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
            <div className="space-y-6">
              <h2 className="text-lg font-medium text-dark-100">Scheduling Preferences</h2>

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

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-dark-200">Auto-save Drafts</p>
                  <p className="text-sm text-dark-500">Automatically save your work</p>
                </div>
                <button
                  onClick={() =>
                    setFormData({ ...formData, autoSaveDrafts: !formData.autoSaveDrafts })
                  }
                  className={`w-12 h-6 rounded-full transition-colors ${
                    formData.autoSaveDrafts ? 'bg-dark-100' : 'bg-dark-600'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      formData.autoSaveDrafts ? 'translate-x-6' : 'translate-x-0.5'
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

              <div className="space-y-4">
                <button
                  onClick={() => setShowPasswordModal(true)}
                  className="w-full flex items-center justify-between p-4 bg-dark-700 rounded-lg hover:bg-dark-600 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Key className="w-5 h-5 text-dark-400" />
                    <div className="text-left">
                      <p className="text-dark-200">Change Password</p>
                      <p className="text-sm text-dark-500">Update your password</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setShow2FAModal(true)}
                  className="w-full flex items-center justify-between p-4 bg-dark-700 rounded-lg hover:bg-dark-600 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-dark-400" />
                    <div className="text-left">
                      <p className="text-dark-200">Two-Factor Authentication</p>
                      <p className="text-sm text-dark-500">Add extra security to your account</p>
                    </div>
                  </div>
                  <span className="badge badge-orange">Off</span>
                </button>

                <button
                  onClick={() => setShowSessionsModal(true)}
                  className="w-full flex items-center justify-between p-4 bg-dark-700 rounded-lg hover:bg-dark-600 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-dark-400" />
                    <div className="text-left">
                      <p className="text-dark-200">Active Sessions</p>
                      <p className="text-sm text-dark-500">Manage your logged-in devices</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Data & Export */}
          {activeTab === 'data' && (
            <div className="space-y-6">
              <h2 className="text-lg font-medium text-dark-100">Data & Export</h2>

              <div className="space-y-4">
                <button
                  onClick={handleExportData}
                  className="w-full flex items-center justify-between p-4 bg-dark-700 rounded-lg hover:bg-dark-600 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Download className="w-5 h-5 text-dark-400" />
                    <div className="text-left">
                      <p className="text-dark-200">Export All Data</p>
                      <p className="text-sm text-dark-500">Download all your content and settings</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="w-full flex items-center justify-between p-4 bg-dark-700/50 rounded-lg hover:bg-dark-700/30 transition-colors border border-dark-600"
                >
                  <div className="flex items-center gap-3">
                    <Trash2 className="w-5 h-5 text-dark-300" />
                    <div className="text-left">
                      <p className="text-dark-300">Delete Account</p>
                      <p className="text-sm text-dark-300/70">Permanently delete your account and data</p>
                    </div>
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
                  <Save className="w-4 h-4" />
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
          <div className="bg-dark-800 rounded-2xl p-6 w-full max-w-md border border-dark-700" onClick={(e) => e.stopPropagation()}>
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
          <div className="bg-dark-800 rounded-2xl p-6 w-full max-w-md border border-dark-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-dark-100">Two-Factor Authentication</h3>
              <button onClick={() => setShow2FAModal(false)} className="text-dark-400 hover:text-dark-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-dark-700 flex items-center justify-center mx-auto mb-4">
                <Smartphone className="w-8 h-8 text-dark-100" />
              </div>
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
          <div className="bg-dark-800 rounded-2xl p-6 w-full max-w-lg border border-dark-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-dark-100">Active Sessions</h3>
              <button onClick={() => setShowSessionsModal(false)} className="text-dark-400 hover:text-dark-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {FAKE_SESSIONS.map((session) => (
                <div key={session.id} className="flex items-center justify-between p-3 bg-dark-700 rounded-lg">
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
          <div className="bg-dark-800 rounded-2xl p-6 w-full max-w-md border border-dark-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-dark-600/30 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-dark-300" />
              </div>
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
                className="flex-1 px-4 py-2 bg-dark-600/30 text-dark-300 rounded-lg hover:bg-dark-600/40 transition-colors"
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
