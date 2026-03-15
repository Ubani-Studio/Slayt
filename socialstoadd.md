# Socials To Add

## Recommended Build Order

1. YouTube
2. Instagram
3. TikTok
4. Pinterest
5. Threads
6. Douyin, only if Slayt gets a dedicated China lane

## Why This Order

- `YouTube` is closest to working end-to-end in the current repo.
- `Instagram` and `TikTok` already have partial auth and posting code, but both need OAuth and publishing fixes.
- `Pinterest` fits Slayt well, but is still backend-greenfield here.
- `Threads` looks like the best next platform after the big four.
- `Douyin` can matter, but it should be treated as a separate market expansion project.

## Repo Plan

### Foundation First

- Split auth and publishing into per-platform modules instead of keeping them mixed in shared controllers and services.
- Normalize token storage for every platform:
  - `accountId`
  - `username` or `channelTitle`
  - `accessToken`
  - `refreshToken`
  - `expiresAt`
  - `scopes`
  - `meta`
- Add a dedicated publish-job model instead of storing single-post scheduling state only on `Content`.
- Make the UI use one connection and publish-status model across platforms.

### Platform Sequence

#### YouTube

- Wire YouTube into the actual `post now` and scheduled publish routes.
- Support:
  - privacy status
  - scheduled publish time
  - tags
  - category
  - thumbnail upload
  - upload status and retries

#### Instagram

- Replace the current mixed auth flow with a real publishing connection flow.
- Add account qualification checks before publish.
- Finish support for:
  - feed images
  - reels
  - carousels
- Persist container IDs, polling status, final media IDs, permalinks, and API errors.

#### TikTok

- Rebuild TikTok against the current Content Posting API.
- Query creator info before publishing and use allowed privacy and interaction settings.
- Choose product mode explicitly:
  - draft upload
  - direct post
- Support both auth refresh and upload-state polling cleanly.

#### Pinterest

- Add Pinterest OAuth.
- Add board discovery and board selection.
- Start with static image pin creation plus destination URLs.
- Add video pins only after the first pass is stable.

## New Apps Worth Considering

### Add Soon

- `Threads`
  - Good fit for Slayt
  - Official API exists
  - Lower integration risk than region-specific networks

### Add Only With a Dedicated Market Strategy

- `Douyin`
  - Strong if Slayt expands into China
  - Requires a separate compliance and operations lane

### Not Worth Prioritizing Yet

- `LINE`
  - Strong for messaging, weak fit for scheduler-style publishing
- `KakaoTalk`
  - Better for sharing and messaging than scheduled publishing
- `Xiaohongshu / RED`
  - Not worth prioritizing without a clean official publishing path for this use case
- Africa-specific social apps
  - The practical distribution stack is still mainly Instagram, TikTok, YouTube, and WhatsApp sharing

## Immediate Focus

For now, get these three fully working in Slayt:

- `YouTube`
- `Instagram`
- `TikTok`
