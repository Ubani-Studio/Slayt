# TikTok Review Video Script

Use this for the TikTok app review demo video for Slayt.

Important:
- Show the same website URL/domain in the video that you provide in TikTok Developer.
- Show real UI and real clicks.
- Show all requested products/scopes:
  - `Login Kit`
  - `Content Posting API`
  - `user.info.basic`
  - `video.upload`
  - `video.publish`

## Target Length

45 to 90 seconds.

## Before Recording

- Make sure TikTok is not already connected in Slayt so the video includes the full connect flow.
- Have one short test `.mp4` ready in Slayt.
- Keep the TikTok account you are testing with signed out or ready to authorize.
- Make sure the app URL shown in the browser matches the URL you plan to give TikTok.

## Script

### 1. Open the app

Open Slayt in the browser and pause briefly on the main interface so TikTok can see the website and branding.

Suggested voiceover:

`This is Slayt, a web app for planning, scheduling, and publishing social video content.`

### 2. Show TikTok connection

Go to `Connections`.

Point to the TikTok card and click `Connect`.

Suggested voiceover:

`Slayt uses TikTok Login Kit so a user can connect their own TikTok account.`

### 3. Show TikTok authorization

Show the TikTok authorization screen.

Pause long enough for the requested access to be visible.

Suggested voiceover:

`The user authorizes Slayt to access basic account information and TikTok video posting permissions.`

### 4. Return to Slayt connected state

After redirect back to Slayt, show that TikTok now appears connected and that the connected account is visible.

Suggested voiceover:

`After OAuth completes, Slayt stores the connection and displays the connected TikTok account inside the app. This demonstrates user.info.basic.`

### 5. Open a video to publish

Go to the Slayt publishing area or planner and open a video item.

Show the selected video clearly.

Suggested voiceover:

`The user selects their own video content inside Slayt.`

### 6. Show TikTok as the destination

Choose TikTok as the publishing destination.

If there is a post-now flow, use it. If there is a schedule flow, show the same TikTok destination there.

Suggested voiceover:

`Slayt uses the Content Posting API to upload and publish the user’s selected TikTok video.`

### 7. Show the publish action

Click the publish or schedule action.

Pause so TikTok can see the action being triggered from the real UI.

Suggested voiceover:

`This action uses video.upload and video.publish to send the selected video to the connected TikTok account.`

### 8. Show the result

Show the resulting status in Slayt:
- connected account
- posting state
- scheduled state
- or completed/published state

If the app is in a restricted testing mode, it is fine to say that the post is for testing/private visibility.

Suggested voiceover:

`Slayt only posts content that the user explicitly uploads and chooses to publish or schedule.`

## Short Spoken Version

If you want a single clean spoken script:

`This is Slayt, a web app for planning, scheduling, and publishing social video content. Here the user opens the Connections page and clicks Connect on TikTok. Slayt uses TikTok Login Kit so the user can authorize their own TikTok account. After authorization, Slayt returns to the app and shows the connected TikTok account, using user.info.basic to confirm identity. The user then opens a video in Slayt, selects TikTok as the destination, and publishes or schedules the video. Slayt uses TikTok Content Posting API with video.upload and video.publish only when the user explicitly chooses to post their own content.`

## Recording Notes

- Keep the browser zoom readable.
- Keep the cursor visible.
- Do not cut too aggressively between steps.
- Show the full browser window if possible.
- Avoid unrelated tabs, private content, or unrelated media.

## Submission Notes

- If you are using sandbox for the demo, make sure the sandbox environment and test account are the ones shown in the video.
- If you remove a product or scope from the TikTok app settings, remove it from the demo too.
- If TikTok asks for a revised video later, record the same flow again but slower and with the requested permission screens visible for longer.
