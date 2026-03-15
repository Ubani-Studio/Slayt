import { useState } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { postingApi } from '../../lib/api';
import { Image, Send, Calendar, Loader2 } from 'lucide-react';
import { PLATFORMS, resolvePrimaryImageSource } from './post-details/constants';
import { usePostPersistence } from './post-details/usePostPersistence';
import { useQuickEdit } from './post-details/useQuickEdit';
import ScheduleModal from './post-details/ScheduleModal';
import BestTimeModal from './post-details/BestTimeModal';
import InstagramPreview from './post-details/InstagramPreview';
import TikTokPreviewCard from './post-details/TikTokPreviewCard';
import TwitterPreviewCard from './post-details/TwitterPreviewCard';
import UpscaleControls from './post-details/UpscaleControls';
import PostMetadataEditor from './post-details/PostMetadataEditor';
import QuickEditPanel from './post-details/QuickEditPanel';
import CropEditor from './post-details/CropEditor';
import ConvictionBreakdown from './post-details/ConvictionBreakdown';

function PostDetails({ post }) {
  const user = useAppStore((s) => s.user);
  const profiles = useAppStore((s) => s.profiles);
  const currentProfileId = useAppStore((s) => s.currentProfileId);
  const currentProfile = profiles?.find((p) => (p._id || p.id) === currentProfileId) || null;

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showBestTimeModal, setShowBestTimeModal] = useState(false);
  const [posting, setPosting] = useState(false);

  const persistence = usePostPersistence(post);
  const qe = useQuickEdit(post);

  const displayName = currentProfile?.name || user?.name || 'Your Name';
  const username = currentProfile?.username || user?.name?.toLowerCase().replace(/\s+/g, '_') || 'your_username';
  const userAvatar = currentProfile?.avatar || user?.avatar;
  const primaryImageSrc = resolvePrimaryImageSource(post);
  const originalImageSrc = post?.originalImage || primaryImageSrc;
  const postId = post?.id || post?._id || null;
  const supportedPostPlatforms = ['instagram', 'tiktok', 'youtube'];
  const postNowPlatform = supportedPostPlatforms.includes(qe.activeTab)
    ? qe.activeTab
    : (supportedPostPlatforms.includes(post?.platform) ? post.platform : 'instagram');

  const handlePostNow = async () => {
    setPosting(true);
    try {
      await postingApi.postNow(postId, [postNowPlatform], {
        caption: persistence.caption,
        hashtags: persistence.parseHashtagsText(persistence.hashtags),
        profileId: currentProfileId || undefined,
      });
      alert('Post published successfully!');
    } catch (error) {
      console.error('Failed to post:', error);
      alert('Failed to publish post. Please check your platform connections.');
    } finally {
      setPosting(false);
    }
  };

  if (!post) {
    return (
      <div className="h-full bg-dark-800 rounded-2xl border border-dark-700 p-6 flex flex-col items-center justify-center text-center">
        <Image className="w-12 h-12 text-dark-500 mb-4" />
        <p className="text-dark-300 mb-2">No post selected</p>
        <p className="text-sm text-dark-500">Click on a grid item to view and edit its details</p>
      </div>
    );
  }

  const cropEditor = qe.editing ? (
    <CropEditor
      cropperKey={qe.cropperKey}
      cropperRef={qe.cropperRef}
      src={qe.editedImage || primaryImageSrc}
      onChange={qe.handleCropperChange}
      defaultCoordinates={qe.getDefaultCoordinates}
      aspectRatio={qe.cropperAspect}
    />
  ) : null;

  const platformLabel = qe.platform === 'twitter'
    ? 'X/Twitter'
    : qe.platform.charAt(0).toUpperCase() + qe.platform.slice(1);

  return (
    <div className="h-full bg-dark-800 rounded-2xl border border-dark-700 flex flex-col overflow-visible relative">

      {/* Floating Quick Edit Panel */}
      {qe.editing && (
        <QuickEditPanel
          platform={qe.platform}
          currentDraft={qe.currentDraft}
          saving={qe.saving}
          cropperRef={qe.cropperRef}
          cropEditor={cropEditor}
          onSwitchPlatform={qe.switchPlatform}
          onSetActiveTab={qe.setActiveTab}
          onSetCropAspect={qe.setCropAspect}
          onRotate={qe.rotate}
          onFlip={qe.flip}
          onReset={qe.reset}
          onSave={qe.save}
          onClose={qe.close}
        />
      )}

      {/* Platform Tabs */}
      <div className="flex border-b border-dark-700 flex-shrink-0">
        {(qe.editing ? PLATFORMS.filter(t => t.id !== 'details') : PLATFORMS).map((p) => (
          <button
            key={p.id}
            onClick={() => qe.handleTabChange(p.id)}
            className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
              qe.activeTab === p.id
                ? 'text-dark-100 border-b-2 border-dark-100 bg-dark-700/50'
                : 'text-dark-400 hover:text-dark-200'
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Quick Edit Bar */}
      {qe.editing && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-dark-700 bg-dark-900/80 flex-shrink-0">
          <span className="text-[11px] text-dark-400 uppercase tracking-wide">
            Editing: {platformLabel}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={qe.save}
              disabled={qe.saving}
              className="h-7 px-3 text-[11px] bg-dark-100 text-white hover:bg-white disabled:opacity-50 transition-colors"
            >
              {qe.saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={qe.close}
              className="h-7 px-3 text-[11px] border border-dark-600 text-dark-300 hover:text-dark-100 hover:border-dark-400 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Tab Content */}
      <div className="flex-1 overflow-auto flex flex-col">
        {qe.activeTab === 'details' && (
          <>
            <UpscaleControls
              post={post}
              primaryImageSrc={primaryImageSrc}
              originalImageSrc={originalImageSrc}
              isQuickEditing={qe.editing}
              cropEditor={null}
              onStartQuickEdit={qe.open}
              getTransformedMediaStyle={qe.getTransformedMediaStyle}
            />
            <ConvictionBreakdown postId={postId} profileId={currentProfileId} />
            <PostMetadataEditor
              postId={postId}
              caption={persistence.caption}
              hashtags={persistence.hashtags}
              onCaptionChange={persistence.setCaption}
              onCaptionBlur={persistence.handleCaptionBlur}
              onHashtagsChange={persistence.setHashtags}
              onHashtagsBlur={persistence.handleHashtagsBlur}
              onOpenScheduleModal={() => setShowScheduleModal(true)}
              onOpenBestTimeModal={() => setShowBestTimeModal(true)}
              persistPost={persistence.persistPost}
            />
          </>
        )}

        {qe.activeTab === 'instagram' && (
          <div className="p-4 flex-1">
            <InstagramPreview
              croppedSrc={qe.getCroppedSrc('instagram')}
              cropStyles={qe.getCroppedPreviewStyles('instagram')}
              caption={persistence.caption}
              displayName={displayName}
              userAvatar={userAvatar}
              postColor={post.color}
              isEditing={qe.editing && qe.platform === 'instagram'}
              saving={qe.saving}
              onSave={qe.save}
            />
          </div>
        )}

        {qe.activeTab === 'tiktok' && (
          <div className="p-4 flex flex-col items-center flex-1">
            <div className="w-full max-w-[280px]">
              <TikTokPreviewCard
                croppedSrc={qe.getCroppedSrc('tiktok')}
                cropStyles={qe.getCroppedPreviewStyles('tiktok')}
                caption={persistence.caption}
                hashtags={persistence.hashtags}
                displayName={displayName}
                userAvatar={userAvatar}
                postColor={post.color}
              />
            </div>
          </div>
        )}

        {qe.activeTab === 'twitter' && (
          <div className="p-4 flex-1">
            <TwitterPreviewCard
              croppedSrc={qe.getCroppedSrc('twitter')}
              cropStyles={qe.getCroppedPreviewStyles('twitter')}
              caption={persistence.caption}
              displayName={displayName}
              username={username}
              userAvatar={userAvatar}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-dark-700 flex gap-2 flex-shrink-0">
        <button onClick={() => setShowScheduleModal(true)} className="flex-1 btn-secondary">
          <Calendar className="w-4 h-4" /> Schedule
        </button>
        <button onClick={handlePostNow} disabled={posting} className="flex-1 btn-primary disabled:opacity-50">
          {posting
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Posting...</>
            : <><Send className="w-4 h-4" /> Post Now</>
          }
        </button>
      </div>

      {showScheduleModal && (
        <ScheduleModal
          postId={postId}
          caption={persistence.caption}
          hashtags={persistence.hashtags}
          profileId={currentProfileId || undefined}
          defaultPlatform={postNowPlatform}
          onClose={() => setShowScheduleModal(false)}
        />
      )}
      {showBestTimeModal && (
        <BestTimeModal onClose={() => setShowBestTimeModal(false)} />
      )}
    </div>
  );
}

export default PostDetails;
