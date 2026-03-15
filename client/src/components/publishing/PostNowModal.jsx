import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import PostingStatus from './PostingStatus';
import './publishing.css';

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', icon: 'IG', color: '#E1306C' },
  { id: 'tiktok', label: 'TikTok', icon: 'TT', color: '#000000' },
  { id: 'youtube', label: 'YouTube', icon: 'YT', color: '#FF0000' },
];

function PostNowModal({ isOpen, content, onClose, onPublish }) {
  const [selectedPlatforms, setSelectedPlatforms] = useState(new Set());
  const [publishing, setPublishing] = useState(false);
  const [publishingStatus, setPublishingStatus] = useState({});
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedPlatforms(new Set());
      setPublishing(false);
      setPublishingStatus({});
      setCompleted(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const togglePlatform = (platformId) => {
    const newSelected = new Set(selectedPlatforms);
    if (newSelected.has(platformId)) {
      newSelected.delete(platformId);
    } else {
      newSelected.add(platformId);
    }
    setSelectedPlatforms(newSelected);
  };

  const handlePublish = async () => {
    if (selectedPlatforms.size === 0) return;

    setPublishing(true);
    const platforms = Array.from(selectedPlatforms);

    // Initialize status for all platforms
    const initialStatus = {};
    platforms.forEach(p => {
      initialStatus[p] = { status: 'pending', message: 'Waiting...' };
    });
    setPublishingStatus(initialStatus);

    // Publish to each platform sequentially
    for (const platform of platforms) {
      setPublishingStatus(prev => ({
        ...prev,
        [platform]: { status: 'publishing', message: 'Publishing...' }
      }));

      try {
        await onPublish({ contentId: content.id || content._id, platform });
        setPublishingStatus(prev => ({
          ...prev,
          [platform]: { status: 'success', message: 'Published successfully!' }
        }));
      } catch (error) {
        setPublishingStatus(prev => ({
          ...prev,
          [platform]: { status: 'error', message: error.message || 'Failed to publish' }
        }));
      }
    }

    setPublishing(false);
    setCompleted(true);
  };

  const allSucceeded = completed && Object.values(publishingStatus).every(s => s.status === 'success');
  const hasErrors = Object.values(publishingStatus).some(s => s.status === 'error');

  return (
    <div className="publishing-modal-overlay" onClick={onClose}>
      <div className="publishing-modal" onClick={e => e.stopPropagation()}>
        <div className="publishing-modal-header">
          <h3>Post Now</h3>
          <button type="button" className="publishing-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="publishing-modal-body">
          {content && (
            <div className="publishing-content-preview">
              {content.image || content.mediaUrl ? (
                <img
                  src={content.image || content.mediaUrl}
                  alt="Content preview"
                  className="publishing-preview-image"
                />
              ) : (
                <div className="publishing-preview-placeholder">
                  No image
                </div>
              )}
              <div className="publishing-preview-info">
                <p className="publishing-preview-caption">
                  {content.caption || 'No caption'}
                </p>
                {content.hashtags && content.hashtags.length > 0 && (
                  <p className="publishing-preview-hashtags">
                    {content.hashtags.map(h => `#${h}`).join(' ')}
                  </p>
                )}
              </div>
            </div>
          )}

          {!publishing && !completed && (
            <>
              <div className="publishing-platform-selection">
                <h4>Select Platforms</h4>
                <div className="publishing-platforms">
                  {PLATFORMS.map((platform) => (
                    <button
                      key={platform.id}
                      type="button"
                      className={`publishing-platform-btn ${selectedPlatforms.has(platform.id) ? 'selected' : ''}`}
                      onClick={() => togglePlatform(platform.id)}
                      style={{
                        '--platform-color': platform.color,
                      }}
                    >
                      <span className="publishing-platform-icon">{platform.icon}</span>
                      <span className="publishing-platform-label">{platform.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="publishing-actions">
                <button
                  type="button"
                  className="publishing-cancel-btn ghost"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="publishing-submit-btn primary"
                  onClick={handlePublish}
                  disabled={selectedPlatforms.size === 0}
                >
                  Post to {selectedPlatforms.size} Platform{selectedPlatforms.size !== 1 ? 's' : ''}
                </button>
              </div>
            </>
          )}

          {(publishing || completed) && (
            <div className="publishing-status-container">
              <PostingStatus
                platforms={Array.from(selectedPlatforms)}
                status={publishingStatus}
                completed={completed}
              />

              {completed && (
                <div className="publishing-completion-actions">
                  {allSucceeded && (
                    <p className="publishing-success-message">
                      All posts published successfully!
                    </p>
                  )}
                  {hasErrors && (
                    <button
                      type="button"
                      className="publishing-retry-btn secondary"
                      onClick={() => {
                        setCompleted(false);
                        setPublishing(false);
                      }}
                    >
                      Retry Failed
                    </button>
                  )}
                  <button
                    type="button"
                    className="publishing-done-btn primary"
                    onClick={onClose}
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

PostNowModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  content: PropTypes.shape({
    id: PropTypes.string,
    _id: PropTypes.string,
    image: PropTypes.string,
    mediaUrl: PropTypes.string,
    caption: PropTypes.string,
    hashtags: PropTypes.arrayOf(PropTypes.string),
  }),
  onClose: PropTypes.func.isRequired,
  onPublish: PropTypes.func.isRequired,
};

PostNowModal.defaultProps = {
  content: null,
};

export default PostNowModal;
