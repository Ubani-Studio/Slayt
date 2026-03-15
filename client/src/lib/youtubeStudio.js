export const YOUTUBE_END_SCREENS_HELP_URL =
  'https://support.google.com/youtube/answer/6388789?hl=en';

export const END_SCREEN_TEMPLATE_OPTIONS = [
  {
    value: 'video_subscribe',
    label: '1 video + subscribe',
    description: 'Simple default for pushing the next watch and subscriber growth.',
  },
  {
    value: 'playlist_subscribe',
    label: '1 playlist + subscribe',
    description: 'Best when you want to drive deeper session time across a series.',
  },
  {
    value: 'series_push',
    label: 'Next video in series',
    description: 'Use when this upload is part of an ordered rollout or episode chain.',
  },
  {
    value: 'none',
    label: 'No default',
    description: 'Leave end-screen setup entirely for YouTube Studio.',
  },
];

export const getYoutubeStudioVideoEditUrl = (videoId = '') => {
  const cleanId = String(videoId || '').trim();
  if (!cleanId) {
    return '';
  }

  return `https://studio.youtube.com/video/${encodeURIComponent(cleanId)}/edit`;
};
