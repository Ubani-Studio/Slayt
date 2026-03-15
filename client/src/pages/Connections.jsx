import { useState, useEffect } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { authApi, platformApi, profileApi, youtubeApi } from '../lib/api';
import {
  Instagram,
  Youtube,
  Linkedin,
  Twitter,
  Facebook,
  Link2,
  Check,
  Plus,
  RefreshCw,
  Trash2,
  ExternalLink,
  AlertCircle,
  Loader2,
  User,
  ChevronDown,
} from 'lucide-react';

// Platform configs with their colors and features
const PLATFORMS = [
  {
    id: 'instagram',
    name: 'Instagram',
    icon: Instagram,
    color: 'bg-dark-600',
    features: ['Feed Posts', 'Reels', 'Stories', 'Carousels', 'First Comment'],
    authUrl: '/api/auth/instagram',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" />
      </svg>
    ),
    color: 'bg-black',
    features: ['Video Posts', 'Auto-publish'],
    authUrl: '/api/auth/tiktok',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: Facebook,
    color: 'bg-[#1877F2]',
    features: ['Pages', 'Groups', 'Reels'],
    authUrl: '/api/auth/facebook',
    comingSoon: true,
  },
  {
    id: 'twitter',
    name: 'X (Twitter)',
    icon: Twitter,
    color: 'bg-black',
    features: ['Posts', 'Media', 'Threads'],
    authUrl: '/api/auth/twitter',
    comingSoon: true,
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: Linkedin,
    color: 'bg-[#0A66C2]',
    features: ['Personal', 'Company Pages'],
    authUrl: '/api/auth/linkedin',
    comingSoon: true,
  },
  {
    id: 'youtube',
    name: 'YouTube',
    icon: Youtube,
    color: 'bg-[#FF0000]',
    features: ['Video Uploads', 'Scheduled Publishing', 'Thumbnails'],
    authUrl: '/api/auth/youtube/connect',
    comingSoon: false,
  },
  {
    id: 'pinterest',
    name: 'Pinterest',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
      </svg>
    ),
    color: 'bg-[#E60023]',
    features: ['Pins', 'Destination Links'],
    authUrl: '/api/auth/pinterest',
    comingSoon: true,
  },
  {
    id: 'threads',
    name: 'Threads',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.182.408-2.256 1.33-3.022.88-.73 2.108-1.15 3.456-1.182 1.1-.026 2.14.107 3.105.323-.028-.767-.18-1.39-.46-1.874-.373-.646-1.012-1.006-1.9-1.07-1.079-.078-2.017.286-2.56.993l-1.613-1.28c.855-1.118 2.237-1.76 3.882-1.76.164 0 .333.007.503.022 1.466.107 2.597.64 3.363 1.586.707.874 1.074 2.078 1.092 3.584.396.17.77.368 1.118.596 1.143.745 1.979 1.737 2.42 2.87.603 1.546.655 4.16-1.51 6.283-1.872 1.835-4.174 2.63-7.478 2.655z" />
      </svg>
    ),
    color: 'bg-black',
    features: ['Text + Media Posts'],
    authUrl: '/api/auth/threads',
    comingSoon: true,
  },
];

const OAUTH_RESULT_PARAMS = [
  'youtube_success',
  'youtube_error',
  'instagram_success',
  'instagram_error',
  'tiktok_success',
  'tiktok_error',
];

const SWITCHABLE_PLATFORMS = new Set(['instagram', 'tiktok', 'youtube']);

const getOAuthNotice = (params) => {
  const youtubeError = params.get('youtube_error');
  if (youtubeError) {
    if (youtubeError === 'no_channel') {
      return {
        type: 'error',
        message: 'Google auth succeeded, but that Google account does not have a YouTube channel yet. Open YouTube with that account, create a channel, then try again.',
      };
    }

    if (youtubeError === 'no_user') {
      return {
        type: 'error',
        message: 'YouTube callback returned, but Slayt could not match it to your logged-in user. Start the connect flow again from this page.',
      };
    }

    return {
      type: 'error',
      message: `YouTube connection failed (${youtubeError}).`,
    };
  }

  if (params.get('youtube_success') === 'true') {
    return {
      type: 'success',
      message: 'YouTube connected successfully.',
    };
  }

  const instagramError = params.get('instagram_error');
  if (instagramError) {
    return {
      type: 'error',
      message: `Instagram connection failed (${instagramError}).`,
    };
  }

  if (params.get('instagram_success') === 'true') {
    return {
      type: 'success',
      message: 'Instagram connected successfully.',
    };
  }

  const tiktokError = params.get('tiktok_error');
  if (tiktokError) {
    return {
      type: 'error',
      message: `TikTok connection failed (${tiktokError}).`,
    };
  }

  if (params.get('tiktok_success') === 'true') {
    return {
      type: 'success',
      message: 'TikTok connected successfully.',
    };
  }

  return null;
};

function Connections() {
  const user = useAppStore((state) => state.user);
  const setUser = useAppStore((state) => state.setUser);
  const connectedPlatforms = useAppStore((state) => state.connectedPlatforms);
  const connectPlatform = useAppStore((state) => state.connectPlatform);
  const disconnectPlatform = useAppStore((state) => state.disconnectPlatform);
  const profiles = useAppStore((state) => state.profiles);
  const currentProfileId = useAppStore((state) => state.currentProfileId);
  const [connecting, setConnecting] = useState(null);
  const [refreshing, setRefreshing] = useState(null);
  const [refreshSuccess, setRefreshSuccess] = useState(null);
  const [profileSocialStatus, setProfileSocialStatus] = useState({});
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [showProfileConnections, setShowProfileConnections] = useState(true);
  const [clarosaBaseUrl, setClarosaBaseUrl] = useState('http://127.0.0.1:8000');
  const [clarosaWorkspaceId, setClarosaWorkspaceId] = useState('default');
  const [clarosaSaving, setClarosaSaving] = useState(false);
  const [clarosaIndexing, setClarosaIndexing] = useState(false);
  const [clarosaMessage, setClarosaMessage] = useState('');
  const [clarosaError, setClarosaError] = useState('');
  const [showClarosaAdvanced, setShowClarosaAdvanced] = useState(false);
  const [oauthNotice, setOauthNotice] = useState(null);

  const currentProfile = profiles.find(p => (p._id || p.id) === currentProfileId);
  const clarosaConnection = user?.clarosa;

  const applyPlatformConnections = (connections = {}) => {
    const normalizedConnections = {
      instagram: {
        connected: Boolean(connections.instagram?.connected),
        account: connections.instagram?.username ? { username: connections.instagram.username } : null,
      },
      tiktok: {
        connected: Boolean(connections.tiktok?.connected),
        account: connections.tiktok?.username ? { username: connections.tiktok.username } : null,
      },
      youtube: {
        connected: Boolean(connections.youtube?.connected),
        account: connections.youtube?.channelTitle ? { username: connections.youtube.channelTitle } : null,
      },
      pinterest: {
        connected: false,
        account: null,
      },
    };

    Object.entries(normalizedConnections).forEach(([platformId, connection]) => {
      if (connection.connected) {
        connectPlatform(platformId, connection.account);
      } else {
        disconnectPlatform(platformId);
      }
    });
  };

  const syncAccountConnections = async () => {
    try {
      const [connections, youtubeStatus] = await Promise.all([
        platformApi.getConnections(),
        youtubeApi.getStatus().catch(() => null),
      ]);

      applyPlatformConnections({
        ...connections,
        youtube: youtubeStatus?.connected
          ? {
              connected: true,
              channelTitle: youtubeStatus.channelTitle || connections.youtube?.channelTitle || null,
            }
          : connections.youtube,
      });
    } catch (error) {
      console.error('Failed to sync platform connections:', error);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hasOauthResult = OAUTH_RESULT_PARAMS.some((key) => params.has(key));

    if (!hasOauthResult) {
      return;
    }

    setOauthNotice(getOAuthNotice(params));

    const refreshUser = async () => {
      try {
        const me = await authApi.getMe();
        setUser(me.user || me);
        await syncAccountConnections();
      } catch (error) {
        console.error('Failed to refresh user after OAuth callback:', error);
      } finally {
        const nextUrl = new URL(window.location.href);
        OAUTH_RESULT_PARAMS.forEach((key) => nextUrl.searchParams.delete(key));
        const nextQuery = nextUrl.searchParams.toString();
        window.history.replaceState({}, '', `${nextUrl.pathname}${nextQuery ? `?${nextQuery}` : ''}${nextUrl.hash}`);
      }
    };

    refreshUser();
  }, [setUser]);

  useEffect(() => {
    if (!user) {
      return;
    }

    syncAccountConnections();
  }, [user]);

  // Load social status for current profile
  useEffect(() => {
    const loadProfileStatus = async () => {
      if (!currentProfileId) return;

      try {
        setLoadingStatus(true);
        const status = await profileApi.getSocialStatus(currentProfileId);
        setProfileSocialStatus(status);
      } catch (err) {
        console.error('Failed to load profile social status:', err);
      } finally {
        setLoadingStatus(false);
      }
    };

    loadProfileStatus();
  }, [currentProfileId]);

  useEffect(() => {
    setClarosaBaseUrl(clarosaConnection?.baseUrl || 'http://127.0.0.1:8000');
    setClarosaWorkspaceId(clarosaConnection?.workspaceId || 'default');
  }, [clarosaConnection?.baseUrl, clarosaConnection?.workspaceId]);

  useEffect(() => {
    const platformConnections = {
      instagram: {
        connected: Boolean(user?.socialAccounts?.instagram?.connected),
        account: user?.socialAccounts?.instagram?.username
          ? { username: user.socialAccounts.instagram.username }
          : null,
      },
      tiktok: {
        connected: Boolean(user?.socialAccounts?.tiktok?.connected),
        account: user?.socialAccounts?.tiktok?.username
          ? { username: user.socialAccounts.tiktok.username }
          : null,
      },
      youtube: {
        connected: Boolean(user?.socialAccounts?.youtube?.connected || user?.socialMedia?.youtube?.accessToken),
        account: (user?.socialAccounts?.youtube?.channelTitle || user?.socialMedia?.youtube?.channelTitle)
          ? { username: user.socialAccounts?.youtube?.channelTitle || user.socialMedia?.youtube?.channelTitle }
          : null,
      },
      pinterest: {
        connected: false,
        account: null,
      },
    };

    applyPlatformConnections({
      instagram: {
        connected: platformConnections.instagram.connected,
        username: platformConnections.instagram.account?.username || null,
      },
      tiktok: {
        connected: platformConnections.tiktok.connected,
        username: platformConnections.tiktok.account?.username || null,
      },
      youtube: {
        connected: platformConnections.youtube.connected,
        channelTitle: platformConnections.youtube.account?.username || null,
      },
    });
  }, [connectPlatform, disconnectPlatform, user]);

  const handleConnect = async (platform) => {
    if (platform.comingSoon) return;

    setConnecting(platform.id);
    try {
      let authUrl = platform.authUrl;

      if (platform.id === 'youtube') {
        authUrl = await youtubeApi.getAuthUrl();
      } else if (platform.id === 'instagram') {
        authUrl = await platformApi.getInstagramAuthUrl();
      } else if (platform.id === 'tiktok') {
        authUrl = await platformApi.getTikTokAuthUrl();
      }

      window.location.href = authUrl;
    } catch (error) {
      console.error('Connection failed:', error);
      alert(`Failed to connect ${platform.name}: ${error.response?.data?.error || error.message}`);
      setConnecting(null);
    }
  };

  const handleDisconnect = async (platformId) => {
    try {
      setConnecting(platformId);

      if (platformId === 'youtube') {
        await youtubeApi.disconnect();
      } else {
        await platformApi.disconnect(platformId);
      }

      const me = await authApi.getMe();
      setUser(me.user || me);

      if (currentProfileId && (platformId === 'instagram' || platformId === 'tiktok')) {
        const status = await profileApi.getSocialStatus(currentProfileId);
        setProfileSocialStatus(status);
      }
    } catch (error) {
      console.error('Disconnect failed:', error);
      alert(`Failed to disconnect ${platformId}. ${error.response?.data?.error || error.message}`);
    } finally {
      setConnecting(null);
    }
  };

  const handleRefresh = async (platformId) => {
    setRefreshing(platformId);
    setRefreshSuccess(null);
    try {
      await platformApi.refreshToken(platformId);
      const me = await authApi.getMe();
      setUser(me.user || me);
      setRefreshSuccess(platformId);
      setTimeout(() => setRefreshSuccess(null), 2000);
    } catch (error) {
      console.error('Failed to refresh token:', error);
      alert(`Failed to refresh ${platformId} token. You may need to reconnect.`);
    } finally {
      setRefreshing(null);
    }
  };

  const getAccountLabel = (platformId, account) => {
    if (!account?.username) {
      return null;
    }

    return platformId === 'youtube' ? account.username : `@${account.username}`;
  };

  // Profile-specific connection handlers
  const handleUseParentConnection = async (platform) => {
    if (!currentProfileId) return;

    try {
      setConnecting(platform);
      if (platform === 'instagram') {
        await profileApi.useParentInstagram(currentProfileId);
      } else if (platform === 'tiktok') {
        await profileApi.useParentTiktok(currentProfileId);
      }
      // Refresh status
      const status = await profileApi.getSocialStatus(currentProfileId);
      setProfileSocialStatus(status);
    } catch (error) {
      console.error('Failed to use parent connection:', error);
      alert(`Failed to set parent connection for ${platform}`);
    } finally {
      setConnecting(null);
    }
  };

  const handleConnectOwnAccount = async (platform) => {
    if (!currentProfileId) return;

    try {
      setConnecting(platform);
      let url;
      if (platform === 'instagram') {
        url = await profileApi.connectInstagram(currentProfileId);
      } else if (platform === 'tiktok') {
        url = await profileApi.connectTiktok(currentProfileId);
      }
      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error('Failed to start connection:', error);
      alert(`Failed to start ${platform} connection`);
    } finally {
      setConnecting(null);
    }
  };

  const connectedCount = Object.values(connectedPlatforms).filter(
    (p) => p.connected
  ).length;
  const availableCount = PLATFORMS.filter((platform) => !platform.comingSoon).length;
  const comingSoonCount = PLATFORMS.filter((platform) => platform.comingSoon).length;
  const clarosaIndexSummary = clarosaConnection?.lastIndexedSummary;

  const persistClarosaConnection = async ({
    baseUrl = clarosaBaseUrl,
    workspaceId = clarosaWorkspaceId,
    connected = true,
    successMessage,
  } = {}) => {
    setClarosaSaving(true);
    setClarosaMessage('');
    setClarosaError('');

    try {
      const result = await authApi.updateClarosaConnection({
        baseUrl,
        workspaceId,
        connected,
      });
      setUser(result.user || user);
      setClarosaMessage(successMessage || result.message || (connected ? 'Clarosa linked' : 'Clarosa disconnected'));
    } catch (error) {
      setClarosaError(error.response?.data?.error || error.message || 'Failed to update Clarosa link');
    } finally {
      setClarosaSaving(false);
    }
  };

  const handleSaveClarosa = async () => {
    await persistClarosaConnection({
      baseUrl: clarosaBaseUrl,
      workspaceId: clarosaWorkspaceId,
      connected: true,
      successMessage: 'Clarosa bridge saved',
    });
  };

  const handleQuickLinkClarosa = async () => {
    const nextBaseUrl = 'http://127.0.0.1:8000';
    const nextWorkspaceId = clarosaWorkspaceId || 'default';
    setClarosaBaseUrl(nextBaseUrl);
    setClarosaWorkspaceId(nextWorkspaceId);
    await persistClarosaConnection({
      baseUrl: nextBaseUrl,
      workspaceId: nextWorkspaceId,
      connected: true,
      successMessage: 'Local Clarosa linked',
    });
  };

  const handleDisconnectClarosa = async () => {
    await persistClarosaConnection({
      connected: false,
      successMessage: 'Clarosa disconnected',
    });
  };

  const handleIndexClarosa = async () => {
    setClarosaIndexing(true);
    setClarosaMessage('');
    setClarosaError('');

    try {
      const result = await authApi.indexClarosaLibrary();
      setUser(result.user || user);
      const indexed = result.result?.indexed ?? 0;
      const existing = result.result?.existing ?? 0;
      setClarosaMessage(`Indexed ${indexed} photos. ${existing} already had hashes.`);
    } catch (error) {
      setClarosaError(error.response?.data?.error || error.message || 'Failed to index Clarosa library');
    } finally {
      setClarosaIndexing(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-6">
      <div className="rounded-[28px] border border-dark-700/60 bg-dark-900/60 p-4 shadow-[0_18px_56px_rgba(0,0,0,0.24)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <h1 className="text-heading-lg text-[1.85rem] font-semibold tracking-[-0.02em] text-dark-100">
              Connections
            </h1>
            <p className="mt-1 text-sm leading-6 text-dark-400">
              Manage publishing accounts and the Clarosa bridge from one place.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:min-w-[300px]">
            {[
              { label: 'Connected', value: connectedCount },
              { label: 'Available', value: availableCount },
              { label: 'Coming soon', value: comingSoonCount },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex min-h-[84px] flex-col justify-between rounded-[20px] border border-dark-700/60 bg-dark-950/55 px-3 py-3"
              >
                <p className="whitespace-nowrap text-xs text-dark-500">{stat.label}</p>
                <p className="mt-1 text-2xl font-semibold leading-none tabular-nums text-dark-100">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {oauthNotice && (
        <div
          className={`rounded-[24px] border px-4 py-3 text-sm ${
            oauthNotice.type === 'error'
              ? 'border-red-500/30 bg-red-500/10 text-red-100'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
          }`}
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>{oauthNotice.message}</p>
          </div>
        </div>
      )}

      <div className="rounded-[28px] border border-dark-700/60 bg-dark-900/50 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.18)] sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-xl">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-dark-700/70 bg-dark-950/70 text-dark-100">
                <Link2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-dark-100">Clarosa</h2>
              </div>
            </div>
            <p className="mt-2 text-sm leading-6 text-dark-400">
              This is not a social login. Slayt talks directly to a running Clarosa workspace so it can reuse exact image insight without duplicating your photo library.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full border px-3 py-1 ${
                clarosaConnection?.connected
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                  : 'border-dark-700/60 bg-dark-950/50 text-dark-400'
              }`}>
                {clarosaConnection?.connected ? `Linked to ${clarosaConnection.workspaceId || 'default'}` : 'Bridge inactive'}
              </span>
              <span className="rounded-full border border-dark-700/60 bg-dark-950/50 px-3 py-1 text-dark-400">
                {clarosaBaseUrl.includes('127.0.0.1') || clarosaBaseUrl.includes('localhost') ? 'Local app' : 'Custom app'}
              </span>
              {clarosaConnection?.lastIndexedAt && (
                <span className="rounded-full border border-dark-700/60 bg-dark-950/50 px-3 py-1 text-dark-400">
                  Indexed {new Date(clarosaConnection.lastIndexedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          <div className="grid w-full gap-3 xl:max-w-xl">
            <div className="rounded-[24px] border border-dark-700/60 bg-dark-950/45 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-medium text-dark-100">Recommended setup</p>
                  <p className="mt-1 text-xs leading-5 text-dark-500">
                    If Clarosa is running on this machine, one click is enough. Only use advanced setup if the app lives elsewhere or you need a non-default workspace.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleQuickLinkClarosa}
                    disabled={clarosaSaving || clarosaIndexing}
                    className="btn-primary text-sm py-2"
                  >
                    {clarosaSaving ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Linking...
                      </>
                    ) : (
                      <>
                        <Check className="w-3 h-3" />
                        Use Local Clarosa
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => setShowClarosaAdvanced((current) => !current)}
                    className="inline-flex items-center gap-2 rounded-full border border-dark-700/60 bg-dark-950/55 px-4 py-2 text-sm text-dark-300 transition-colors hover:text-dark-100"
                  >
                    <span>{showClarosaAdvanced ? 'Hide Details' : 'Advanced Setup'}</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${showClarosaAdvanced ? 'rotate-180' : ''}`} />
                  </button>

                  {clarosaConnection?.connected && (
                    <button
                      onClick={handleIndexClarosa}
                      disabled={clarosaSaving || clarosaIndexing}
                      className="btn-secondary text-sm py-2"
                    >
                      {clarosaIndexing ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Indexing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3 h-3" />
                          Index Library
                        </>
                      )}
                    </button>
                  )}

                  {clarosaConnection?.connected && (
                    <a
                      href={clarosaConnection.baseUrl || clarosaBaseUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-dark-700/60 bg-dark-950/55 px-4 py-2 text-sm text-dark-300 transition-colors hover:text-dark-100"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open App
                    </a>
                  )}
                </div>
              </div>
            </div>

            {showClarosaAdvanced && (
              <div className="grid gap-3 rounded-[24px] border border-dark-700/60 bg-dark-950/45 p-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-xs text-dark-500">App address</span>
                  <input
                    type="text"
                    value={clarosaBaseUrl}
                    onChange={(e) => setClarosaBaseUrl(e.target.value)}
                    placeholder="http://127.0.0.1:8000"
                    className="h-11 rounded-2xl border border-dark-700/60 bg-dark-950/70 px-4 text-sm text-dark-100 outline-none transition-colors placeholder:text-dark-500 focus:border-dark-500"
                  />
                  <span className="text-xs text-dark-500">Use the address where the Clarosa app is running.</span>
                </label>

                <label className="grid gap-2">
                  <span className="text-xs text-dark-500">Workspace key</span>
                  <input
                    type="text"
                    value={clarosaWorkspaceId}
                    onChange={(e) => setClarosaWorkspaceId(e.target.value)}
                    placeholder="default"
                    className="h-11 rounded-2xl border border-dark-700/60 bg-dark-950/70 px-4 text-sm text-dark-100 outline-none transition-colors placeholder:text-dark-500 focus:border-dark-500"
                  />
                  <span className="text-xs text-dark-500">Usually `default` unless you keep multiple Clarosa workspaces.</span>
                </label>

                <div className="sm:col-span-2 flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={handleSaveClarosa}
                    disabled={clarosaSaving || clarosaIndexing}
                    className="btn-secondary text-sm py-2"
                  >
                    {clarosaSaving ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="w-3 h-3" />
                        Save Advanced Link
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleIndexClarosa}
                    disabled={!clarosaConnection?.connected || clarosaSaving || clarosaIndexing}
                    className="btn-secondary text-sm py-2"
                  >
                    {clarosaIndexing ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Indexing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3 h-3" />
                        Index Library
                      </>
                    )}
                  </button>

                  {clarosaConnection?.connected && (
                    <button
                      onClick={handleDisconnectClarosa}
                      disabled={clarosaSaving || clarosaIndexing}
                      className="btn-ghost text-sm py-2 text-dark-300 hover:text-dark-100"
                    >
                      <Trash2 className="w-3 h-3" />
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            )}

            {clarosaIndexSummary && (
              <div className="rounded-[24px] border border-dark-700/60 bg-dark-950/45 px-4 py-3 text-sm text-dark-300">
                Indexed {clarosaIndexSummary.indexed || 0} new photos, found {clarosaIndexSummary.existing || 0} already registered, and skipped {clarosaIndexSummary.failed || 0} unavailable files.
              </div>
            )}

            {clarosaMessage && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                {clarosaMessage}
              </div>
            )}
            {clarosaError && (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {clarosaError}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Current Profile Connections */}
      {currentProfile && (
        <div className="rounded-[28px] border border-dark-700/60 bg-dark-900/50 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.18)]">
          <button
            onClick={() => setShowProfileConnections(!showProfileConnections)}
            className="w-full flex items-center justify-between rounded-[24px] border border-dark-700/60 bg-dark-950/55 p-4 transition-colors hover:border-dark-600 hover:bg-dark-950/75"
          >
            <div className="flex items-center gap-3">
              <div
                className="h-11 w-11 rounded-full flex items-center justify-center border border-white/10"
                style={{ backgroundColor: currentProfile.color || '#8b5cf6' }}
              >
                {currentProfile.avatar ? (
                  <img
                    src={currentProfile.avatar}
                    alt={currentProfile.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <User className="w-5 h-5 text-white" />
                )}
              </div>
              <div className="text-left">
                <h3 className="font-medium text-dark-100">
                  {currentProfile.name} Connections
                </h3>
                <p className="text-sm text-dark-400">
                  Manage connections for this profile
                </p>
              </div>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-dark-400 transition-transform ${
                showProfileConnections ? 'rotate-180' : ''
              }`}
            />
          </button>

          {showProfileConnections && (
            <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {/* Instagram for Profile */}
              <div className="rounded-[20px] border border-dark-700/60 bg-dark-950/35 p-3.5">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[14px] bg-dark-600">
                    <Instagram className="w-4.5 h-4.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <h3 className="text-sm font-medium text-dark-100">Instagram</h3>
                      {profileSocialStatus.instagram?.connected && (
                        <span className="badge badge-green">Connected</span>
                      )}
                    </div>

                    {loadingStatus ? (
                      <Loader2 className="w-4 h-4 animate-spin text-dark-400" />
                    ) : profileSocialStatus.instagram?.connected ? (
                      <>
                        <p className="mb-2 text-sm leading-5 text-dark-400">
                          {profileSocialStatus.instagram.useParent
                            ? 'Using parent account'
                            : 'Using own account'}
                          {profileSocialStatus.instagram.username &&
                            `: @${profileSocialStatus.instagram.username}`}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {profileSocialStatus.instagram.useParent ? (
                            <button
                              onClick={() => handleConnectOwnAccount('instagram')}
                              className="inline-flex h-8 items-center rounded-full border border-dark-700/60 bg-dark-950/55 px-3 text-xs text-dark-200 transition-colors hover:text-white"
                              disabled={connecting === 'instagram'}
                            >
                              {connecting === 'instagram' ? 'Connecting...' : 'Connect own account'}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUseParentConnection('instagram')}
                              className="inline-flex h-8 items-center rounded-full border border-dark-700/60 bg-dark-950/55 px-3 text-xs text-dark-300 transition-colors hover:text-dark-100"
                              disabled={connecting === 'instagram'}
                            >
                              {connecting === 'instagram' ? 'Switching...' : 'Use parent account'}
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="mb-2 text-sm text-dark-500">Not connected</p>
                        <button
                          onClick={() => handleUseParentConnection('instagram')}
                          className="inline-flex h-8 items-center gap-2 rounded-full bg-zinc-200 px-3 text-xs font-medium text-dark-900 transition-colors hover:bg-white"
                          disabled={connecting === 'instagram'}
                        >
                          {connecting === 'instagram' ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            <>
                              <Link2 className="w-3 h-3" />
                              Use Parent Connection
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* TikTok for Profile */}
              <div className="rounded-[20px] border border-dark-700/60 bg-dark-950/35 p-3.5">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[14px] bg-black">
                    <svg className="w-4.5 h-4.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <h3 className="text-sm font-medium text-dark-100">TikTok</h3>
                      {profileSocialStatus.tiktok?.connected && (
                        <span className="badge badge-green">Connected</span>
                      )}
                    </div>

                    {loadingStatus ? (
                      <Loader2 className="w-4 h-4 animate-spin text-dark-400" />
                    ) : profileSocialStatus.tiktok?.connected ? (
                      <>
                        <p className="mb-2 text-sm leading-5 text-dark-400">
                          {profileSocialStatus.tiktok.useParent
                            ? 'Using parent account'
                            : 'Using own account'}
                          {profileSocialStatus.tiktok.username &&
                            `: @${profileSocialStatus.tiktok.username}`}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {profileSocialStatus.tiktok.useParent ? (
                            <button
                              onClick={() => handleConnectOwnAccount('tiktok')}
                              className="inline-flex h-8 items-center rounded-full border border-dark-700/60 bg-dark-950/55 px-3 text-xs text-dark-200 transition-colors hover:text-white"
                              disabled={connecting === 'tiktok'}
                            >
                              {connecting === 'tiktok' ? 'Connecting...' : 'Connect own account'}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUseParentConnection('tiktok')}
                              className="inline-flex h-8 items-center rounded-full border border-dark-700/60 bg-dark-950/55 px-3 text-xs text-dark-300 transition-colors hover:text-dark-100"
                              disabled={connecting === 'tiktok'}
                            >
                              {connecting === 'tiktok' ? 'Switching...' : 'Use parent account'}
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="mb-2 text-sm text-dark-500">Not connected</p>
                        <button
                          onClick={() => handleUseParentConnection('tiktok')}
                          className="inline-flex h-8 items-center gap-2 rounded-full bg-zinc-200 px-3 text-xs font-medium text-dark-900 transition-colors hover:bg-white"
                          disabled={connecting === 'tiktok'}
                        >
                          {connecting === 'tiktok' ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            <>
                              <Link2 className="w-3 h-3" />
                              Use Parent Connection
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Account-Level Platforms Grid */}
      <div className="pt-1">
        <h2 className="text-lg font-medium text-dark-100">Publishing accounts</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {PLATFORMS.map((platform) => {
          const connection = connectedPlatforms[platform.id];
          const isConnected = connection?.connected;
          const isConnecting = connecting === platform.id;
          const Icon = platform.icon;

          return (
            <div
              key={platform.id}
              className={`rounded-[24px] border border-dark-700/60 bg-dark-900/45 p-4 shadow-[0_10px_32px_rgba(0,0,0,0.12)] transition-all ${
                platform.comingSoon ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Platform Icon */}
                <div
                  className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl ${platform.color}`}
                >
                  <Icon className="h-5 w-5 text-white" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="font-medium text-dark-100">{platform.name}</h3>
                    {isConnected && (
                      <span className="badge badge-green">Connected</span>
                    )}
                    {platform.comingSoon && (
                      <span className="badge badge-purple">Coming Soon</span>
                    )}
                  </div>

                  {/* Account Info */}
                  {isConnected && connection.account && (
                    <p className="mb-2 break-words text-sm text-dark-400">
                      {getAccountLabel(platform.id, connection.account)}
                    </p>
                  )}

                  {/* Features */}
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {platform.features.map((feature) => (
                      <span
                        key={feature}
                        className="rounded-full border border-dark-700/50 bg-dark-950/55 px-2.5 py-1 text-[11px] text-dark-400"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {isConnected ? (
                      <>
                        {SWITCHABLE_PLATFORMS.has(platform.id) && (
                          <button
                            onClick={() => handleConnect(platform)}
                            disabled={isConnecting}
                            className="btn-secondary text-sm py-1.5"
                          >
                            {isConnecting ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                Switching...
                              </>
                            ) : (
                              <>
                                <User className="w-3 h-3" />
                                Switch account
                              </>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleRefresh(platform.id)}
                          disabled={refreshing === platform.id}
                          className="btn-secondary text-sm py-1.5"
                        >
                          {refreshing === platform.id ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Refreshing...
                            </>
                          ) : refreshSuccess === platform.id ? (
                            <>
                              <Check className="w-3 h-3 text-dark-100" />
                              Refreshed!
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3 h-3" />
                              Refresh
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleDisconnect(platform.id)}
                          className="btn-ghost text-sm py-1.5 text-dark-300 hover:text-dark-100"
                        >
                          <Trash2 className="w-3 h-3" />
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleConnect(platform)}
                        disabled={platform.comingSoon || isConnecting}
                        className="btn-primary text-sm py-1.5"
                      >
                        {isConnecting ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3" />
                            Connect
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Help Section */}
      <div className="rounded-[24px] border border-dark-700/60 bg-dark-900/45 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-dark-100 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-dark-200 mb-1">
              Need help connecting?
            </h4>
            <p className="text-sm text-dark-400">
              Make sure you have admin access to the accounts you want to connect.
              For business accounts, you may need to configure API access in each
              platform's developer portal.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Connections;
