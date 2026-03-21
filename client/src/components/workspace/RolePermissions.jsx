import { useState } from 'react';
import PropTypes from 'prop-types';
import './workspace.css';

const PERMISSIONS = [
  { key: 'canCreateContent', label: 'Create Content', description: 'Upload and create new content' },
  { key: 'canEditContent', label: 'Edit Content', description: 'Edit existing content' },
  { key: 'canDeleteContent', label: 'Delete Content', description: 'Delete content from workspace' },
  { key: 'canPublish', label: 'Publish', description: 'Publish content to social platforms' },
  { key: 'canApprove', label: 'Approve', description: 'Approve or reject submissions' },
  { key: 'canInviteMembers', label: 'Invite Members', description: 'Invite new team members' },
  { key: 'canManageSettings', label: 'Manage Settings', description: 'Change workspace settings' }
];

const DEFAULT_ROLE_PERMISSIONS = {
  admin: {
    canCreateContent: true,
    canEditContent: true,
    canDeleteContent: true,
    canPublish: true,
    canApprove: true,
    canInviteMembers: true,
    canManageSettings: false
  },
  editor: {
    canCreateContent: true,
    canEditContent: true,
    canDeleteContent: false,
    canPublish: false,
    canApprove: false,
    canInviteMembers: false,
    canManageSettings: false
  },
  viewer: {
    canCreateContent: false,
    canEditContent: false,
    canDeleteContent: false,
    canPublish: false,
    canApprove: false,
    canInviteMembers: false,
    canManageSettings: false
  }
};

function RolePermissions({ member, onUpdatePermissions, isOwner }) {
  const [editing, setEditing] = useState(false);
  const [permissions, setPermissions] = useState(member.permissions || {});

  if (!member || member.role === 'owner') {
    return null;
  }

  const handleToggle = (key) => {
    setPermissions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSave = async () => {
    await onUpdatePermissions(member.userId?._id || member.userId, permissions);
    setEditing(false);
  };

  const handleReset = () => {
    setPermissions(DEFAULT_ROLE_PERMISSIONS[member.role] || DEFAULT_ROLE_PERMISSIONS.viewer);
  };

  const handleCancel = () => {
    setPermissions(member.permissions || {});
    setEditing(false);
  };

  return (
    <div className="role-permissions">
      <div className="permissions-header">
        <h4>Permissions for {member.name || member.email}</h4>
        {!editing && isOwner && (
          <button
            type="button"
            className="edit-btn"
            onClick={() => setEditing(true)}
          >
            Customize
          </button>
        )}
      </div>

      <div className="permissions-grid">
        {PERMISSIONS.map((perm) => (
          <div key={perm.key} className="permission-item">
            <div className="permission-info">
              <span className="permission-label">{perm.label}</span>
              <span className="permission-desc">{perm.description}</span>
            </div>
            <div className="permission-toggle">
              {editing ? (
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={permissions[perm.key] || false}
                    onChange={() => handleToggle(perm.key)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              ) : (
                <span className={`permission-status ${permissions[perm.key] ? 'enabled' : 'disabled'}`}>
                  {permissions[perm.key] ? 'Yes' : 'No'}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="permissions-actions">
          <button type="button" className="reset-btn" onClick={handleReset}>
            Reset to Default
          </button>
          <button type="button" className="cancel-btn" onClick={handleCancel}>
            Cancel
          </button>
          <button type="button" className="save-btn" onClick={handleSave}>
            Save Changes
          </button>
        </div>
      )}
    </div>
  );
}

RolePermissions.propTypes = {
  member: PropTypes.shape({
    userId: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    name: PropTypes.string,
    email: PropTypes.string,
    role: PropTypes.string,
    permissions: PropTypes.object
  }).isRequired,
  onUpdatePermissions: PropTypes.func.isRequired,
  isOwner: PropTypes.bool.isRequired
};

export default RolePermissions;
