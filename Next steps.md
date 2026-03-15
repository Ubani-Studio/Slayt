# Slayt Platform Rollout Next Steps

Updated: March 15, 2026

## Current State

- YouTube, Instagram, and TikTok backend wiring has been pushed through the repo.
- Account connect flows now use backend callbacks instead of relying on `req.user` inside third-party OAuth callbacks.
- `post now` supports YouTube, Instagram, and TikTok.
- Scheduled single-content posting now runs through the scheduler worker.
- Multi-platform scheduling is now supported on `Content` via `scheduledPlatforms`.
- Instagram carousel publishing is implemented for image carousels.

## Still Not Done

- No live OAuth or publish smoke tests have been run yet with real app credentials.
- Instagram still needs real Meta app setup and a professional/business account.
- TikTok is still video-only in this repo.
- Instagram carousel is image-only right now.
- Pinterest is not part of the current live rollout.

## Resume Here Next Time

When reopening this project, continue in this order:

1. Verify env values in `.env` against [.env.example](/home/sphinxy/Slayt/.env.example#L1).
2. Hit `GET /api/auth/connections/audit` after logging in and confirm:
   - callback URLs are correct
   - no required env vars are missing
   - frontend/backend origins line up
3. Finish Instagram app setup and run one real connect + publish test.
4. Finish TikTok app setup and run one real connect + publish test.
5. Run a YouTube connect + upload smoke test.
6. Run one scheduled multi-platform post and confirm the worker drains every selected platform.

## Required Env

Fill these in local `.env`:

- `API_URL`
- `BACKEND_PUBLIC_URL`
- `CLIENT_URL`
- `FRONTEND_URL`
- `SESSION_SECRET`
- `JWT_SECRET`
- `INSTAGRAM_CLIENT_ID`
- `INSTAGRAM_CLIENT_SECRET`
- `INSTAGRAM_CONNECT_REDIRECT_URI`
- `INSTAGRAM_REDIRECT_URI`
- `TIKTOK_CLIENT_KEY`
- `TIKTOK_CLIENT_SECRET`
- `TIKTOK_REDIRECT_URI`
- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `YOUTUBE_REDIRECT_URI`

Recommended local callback values:

- Instagram connect: `http://localhost:3002/api/auth/instagram/connect/callback`
- Instagram login: `http://localhost:3002/api/auth/instagram/callback`
- TikTok: `http://localhost:3002/api/auth/tiktok/callback`
- YouTube: `http://localhost:3002/api/auth/youtube/callback`

## Instagram Setup

### What The Code Expects

- Backend callback route: `/api/auth/instagram/connect/callback`
- Frontend redirect target: `/connections`
- OAuth scopes currently requested:
  - `instagram_business_basic`
  - `instagram_business_content_publish`
  - `instagram_business_manage_comments`
  - `instagram_business_manage_insights`

### Setup Steps

1. Open the Meta developer app.
2. Make sure the Instagram API / Instagram Login product is enabled for the app.
3. Add the redirect URI:
   - `http://localhost:3002/api/auth/instagram/connect/callback`
4. Keep the login callback too if local Instagram login is still used:
   - `http://localhost:3002/api/auth/instagram/callback`
5. Use an Instagram professional/business account for testing.
6. If Meta requires additional app review or tester assignment, add the test account properly before trying to connect.

### First Test

1. Start server and client.
2. Log into Slayt.
3. Open `/connections`.
4. Connect Instagram.
5. Publish:
   - one image
   - one reel
   - one image carousel

### If It Fails

Check:

- `GET /api/auth/connections/audit`
- server logs during callback
- whether the redirect URI in Meta exactly matches the backend callback
- whether the test account is a professional/business IG account
- whether the app has the required permissions enabled for the test account

## TikTok Setup

### What The Code Expects

- Backend callback route: `/api/auth/tiktok/callback`
- Frontend redirect target: `/connections`
- Current requested scopes:
  - `user.info.basic`
  - `video.upload`
  - `video.publish`

### Setup Steps

1. Open the TikTok developer app.
2. Add the redirect URI:
   - `http://localhost:3002/api/auth/tiktok/callback`
3. Make sure the app has content posting access for the test environment.
4. Use a TikTok account allowed to test the app.

### First Test

1. Connect TikTok in `/connections`.
2. Publish one video.
3. Confirm creator info is returned and the upload completes.

### Notes

- Current TikTok path is video-only.
- If TikTok policy/access blocks direct publishing, re-check app approval before touching code again.

## YouTube Setup

### What The Code Expects

- Backend callback route: `/api/auth/youtube/callback`
- Frontend redirect target: `/connections`
- YouTube Data API v3 must be enabled in Google Cloud.

### Setup Steps

1. Open Google Cloud Console.
2. Enable YouTube Data API v3.
3. Configure the OAuth consent screen.
4. Add the redirect URI:
   - `http://localhost:3002/api/auth/youtube/callback`

### First Test

1. Connect YouTube in `/connections`.
2. Upload one video.
3. Confirm metadata and thumbnail path behave correctly.

## Smoke Test Matrix

- Instagram connect
- Instagram image publish
- Instagram reel publish
- Instagram carousel publish
- TikTok connect
- TikTok video publish
- YouTube connect
- YouTube upload
- One scheduled post to multiple selected platforms

## Repo Pointers

- Readiness audit endpoint: [authController.js](/home/sphinxy/Slayt/src/controllers/authController.js#L924)
- Instagram/TikTok OAuth setup: [authController.js](/home/sphinxy/Slayt/src/controllers/authController.js#L18)
- Profile-specific connect URLs: [profileController.js](/home/sphinxy/Slayt/src/controllers/profileController.js#L386)
- Immediate + scheduled posting: [postingController.js](/home/sphinxy/Slayt/src/controllers/postingController.js#L116)
- Scheduler worker: [schedulingService.js](/home/sphinxy/Slayt/src/services/schedulingService.js#L94)
- Instagram carousel publish: [socialMediaService.js](/home/sphinxy/Slayt/src/services/socialMediaService.js#L348)
- Supported scheduled platforms helper: [postingPlatforms.js](/home/sphinxy/Slayt/src/utils/postingPlatforms.js#L1)

## Codex Skills Installed In This Session

- `playwright`
- `screenshot`
- `security-best-practices`
- `security-threat-model`
- `figma`
- `figma-implement-design`
- `imagegen`

Restart Codex if those skills do not appear immediately in a future session.
