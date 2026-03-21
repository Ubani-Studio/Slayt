import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import './workspace.css';

const STATUS_LABELS = {
  pending: { label: 'Pending', color: '#ecc94b' },
  in_review: { label: 'In Review', color: '#4299e1' },
  approved: { label: 'Approved', color: '#48bb78' },
  rejected: { label: 'Rejected', color: '#f56565' },
  revision_requested: { label: 'Needs Revision', color: '#ed8936' },
  published: { label: 'Published', color: '#9f7aea' }
};

const PRIORITY_LABELS = {
  low: { label: 'Low', color: '#a0aec0' },
  normal: { label: 'Normal', color: '#4299e1' },
  high: { label: 'High', color: '#ed8936' },
  urgent: { label: 'Urgent', color: '#f56565' }
};

function ApprovalQueue({
  workspaceId,
  canApprove,
  onApprove,
  onReject,
  onRequestRevision,
  fetchQueue
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [feedback, setFeedback] = useState('');
  const [showFeedbackFor, setShowFeedbackFor] = useState(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchQueue(workspaceId, filter);
      setItems(data.items || []);
    } catch (error) {
      console.error('Failed to load queue:', error);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, filter, fetchQueue]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleApprove = async (itemId) => {
    await onApprove(itemId, feedback);
    setFeedback('');
    setShowFeedbackFor(null);
    loadQueue();
  };

  const handleReject = async (itemId) => {
    if (!feedback.trim()) {
      alert('Please provide feedback when rejecting');
      return;
    }
    await onReject(itemId, feedback);
    setFeedback('');
    setShowFeedbackFor(null);
    loadQueue();
  };

  const handleRequestRevision = async (itemId) => {
    if (!feedback.trim()) {
      alert('Please provide feedback when requesting revision');
      return;
    }
    await onRequestRevision(itemId, feedback);
    setFeedback('');
    setShowFeedbackFor(null);
    loadQueue();
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="approval-queue">
      <div className="queue-header">
        <h3>Approval Queue</h3>
        <div className="queue-filters">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="pending">Pending</option>
            <option value="in_review">In Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="revision_requested">Needs Revision</option>
            <option value="">All</option>
          </select>
          <button type="button" onClick={loadQueue} className="refresh-btn">
            ↻ Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="queue-loading">Loading...</div>
      ) : items.length === 0 ? (
        <div className="queue-empty">
          <p>No items in queue</p>
        </div>
      ) : (
        <div className="queue-list">
          {items.map((item) => {
            const status = STATUS_LABELS[item.status] || STATUS_LABELS.pending;
            const priority = PRIORITY_LABELS[item.priority] || PRIORITY_LABELS.normal;

            return (
              <div
                key={item._id}
                className={`queue-item ${selectedItem?._id === item._id ? 'selected' : ''}`}
                onClick={() => setSelectedItem(item)}
              >
                <div className="queue-item-preview">
                  {item.metadata?.thumbnailUrl ? (
                    <img src={item.metadata.thumbnailUrl} alt="" />
                  ) : (
                    <div className="no-preview">No Preview</div>
                  )}
                </div>

                <div className="queue-item-info">
                  <div className="queue-item-header">
                    <span className="submitter-name">
                      {item.submitterName || 'Unknown'}
                    </span>
                    <span
                      className="status-badge"
                      style={{ backgroundColor: status.color }}
                    >
                      {status.label}
                    </span>
                  </div>

                  <p className="queue-item-caption">
                    {item.caption?.substring(0, 100) || 'No caption'}
                    {item.caption?.length > 100 ? '...' : ''}
                  </p>

                  <div className="queue-item-meta">
                    <span className="submitted-date">
                      {formatDate(item.submittedAt)}
                    </span>
                    <span
                      className="priority-badge"
                      style={{ color: priority.color }}
                    >
                      {priority.label}
                    </span>
                    {item.platforms?.length > 0 && (
                      <span className="platforms">
                        {item.platforms.join(', ')}
                      </span>
                    )}
                  </div>
                </div>

                {canApprove && item.status === 'pending' && (
                  <div className="queue-item-actions">
                    {showFeedbackFor === item._id ? (
                      <div className="feedback-form" onClick={(e) => e.stopPropagation()}>
                        <textarea
                          placeholder="Feedback (required for reject/revision)"
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                        />
                        <div className="action-buttons">
                          <button
                            type="button"
                            className="approve-btn"
                            onClick={() => handleApprove(item._id)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="revision-btn"
                            onClick={() => handleRequestRevision(item._id)}
                          >
                            Revision
                          </button>
                          <button
                            type="button"
                            className="reject-btn"
                            onClick={() => handleReject(item._id)}
                          >
                            Reject
                          </button>
                        </div>
                        <button
                          type="button"
                          className="cancel-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowFeedbackFor(null);
                            setFeedback('');
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="review-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowFeedbackFor(item._id);
                        }}
                      >
                        Review
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedItem && (
        <div className="queue-detail-panel">
          <div className="detail-header">
            <h4>Submission Details</h4>
            <button
              type="button"
              className="close-btn"
              onClick={() => setSelectedItem(null)}
            >
              ×
            </button>
          </div>

          <div className="detail-content">
            {selectedItem.metadata?.thumbnailUrl && (
              <img
                src={selectedItem.metadata.thumbnailUrl}
                alt=""
                className="detail-image"
              />
            )}

            <div className="detail-section">
              <label>Caption</label>
              <p>{selectedItem.caption || 'No caption'}</p>
            </div>

            {selectedItem.hashtags?.length > 0 && (
              <div className="detail-section">
                <label>Hashtags</label>
                <p>{selectedItem.hashtags.join(' ')}</p>
              </div>
            )}

            {selectedItem.scheduledFor && (
              <div className="detail-section">
                <label>Scheduled For</label>
                <p>{formatDate(selectedItem.scheduledFor)}</p>
              </div>
            )}

            {selectedItem.notes && (
              <div className="detail-section">
                <label>Notes</label>
                <p>{selectedItem.notes}</p>
              </div>
            )}

            {selectedItem.reviews?.length > 0 && (
              <div className="detail-section">
                <label>Review History</label>
                <div className="review-history">
                  {selectedItem.reviews.map((review, i) => (
                    <div key={i} className="review-item">
                      <div className="review-header">
                        <span>{review.reviewerName}</span>
                        <span
                          className="review-status"
                          style={{ color: STATUS_LABELS[review.status]?.color }}
                        >
                          {STATUS_LABELS[review.status]?.label}
                        </span>
                      </div>
                      {review.feedback && (
                        <p className="review-feedback">{review.feedback}</p>
                      )}
                      <span className="review-date">
                        {formatDate(review.reviewedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

ApprovalQueue.propTypes = {
  workspaceId: PropTypes.string.isRequired,
  canApprove: PropTypes.bool.isRequired,
  onApprove: PropTypes.func.isRequired,
  onReject: PropTypes.func.isRequired,
  onRequestRevision: PropTypes.func.isRequired,
  fetchQueue: PropTypes.func.isRequired
};

export default ApprovalQueue;
