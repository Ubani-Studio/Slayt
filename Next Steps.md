# Slayt Grid Planner — Next Steps

## Why the Grid is Glitchy

The grid editor isn't broken by one bug — it's architecturally overloaded. Every fix creates a new side effect because everything is entangled in a single 2,159-line component with 34 state variables and 10 effects.

---

## Root Causes

### 1. PostDetails.jsx is a monolith (2,159 lines)
- **34 `useState` hooks** in one component (best practice: 5-8 max)
- **10 `useEffect` hooks** with complex dependency chains
- Tries to be 5 things at once: crop editor, platform previewer, upscaler, scheduler, conviction scorer

### 2. Re-render cascades on every interaction
Every slider drag, crop change, or post selection triggers 3+ sequential re-renders:
- State update → effect fires → another setState → another effect → another setState
- Switching posts triggers **13 sequential state updates**, each causing a full re-render

### 3. `updatePost` re-renders the entire grid
`useAppStore.js` `updatePost` creates a new `gridPosts` array every time. Editing a caption on one post re-renders all 9 grid items + dnd-kit recalculates. The grid "thrashes" while editing.

### 4. Cropper unmounts/remounts on platform switch
`key={editTarget-${counter}}` forces React to destroy and recreate the Cropper when switching Instagram → TikTok. Image reloads from scratch (200-500ms), zoom/position lost.

### 5. Memory leaks from event listeners
Compare slider attaches `window.addEventListener('mousemove')` but never cleans up on unmount. After extended use, zombie listeners accumulate and the browser slows down.

### 6. Multiple sources of truth
State lives in 3 places with no clear sync: local useState (34 of them), Zustand store, and backend DB. Race conditions happen when switching posts quickly.

### 7. No memoization
GridItem components aren't `React.memo`. No `useMemo` for derived state. Every parent re-render cascades to every child.

---

## The Refactor

Split PostDetails.jsx into isolated, focused components with proper memoization.

### New Component Structure

```
components/grid/
├── PostDetails.jsx            → thin shell, routes to sub-components
├── editor/
│   ├── CropEditor.jsx         → owns crop state, Cropper instance, save logic
│   ├── CropToolbar.jsx        → aspect ratio buttons, zoom slider, fit mode
│   └── PlatformSwitcher.jsx   → tab bar for IG / TikTok / Twitter
├── previews/
│   ├── PlatformPreviews.jsx   → container, reads crop via props, React.memo
│   ├── InstagramPreview.jsx   → IG-specific preview card
│   ├── TikTokPreview.jsx      → TikTok-specific preview card
│   └── TwitterPreview.jsx     → Twitter-specific preview card
├── metadata/
│   ├── PostMetadataEditor.jsx → caption, hashtags, scheduling — no visual editing
│   └── SchedulePanel.jsx      → date/time picker, platform toggles
├── conviction/
│   └── ConvictionScore.jsx    → async score fetch + display, fully isolated
└── GridItem.jsx               → wrap in React.memo
```

### State Ownership

| Component | Owns | Reads (props) |
|-----------|------|---------------|
| CropEditor | `cropBox`, `cropAspect`, `imageDims`, cropperRef | `post.image`, `editTarget` |
| CropToolbar | — | `cropAspect`, `scale`, `rotation` (callbacks up) |
| PlatformPreviews | — | `cropBox`, `editSettings` per platform |
| PostMetadataEditor | `caption`, `hashtags` | `post` |
| ConvictionScore | `baseConviction`, `cropConviction` | `postId`, `editSettings` |
| PostDetails (shell) | `editTarget`, `isQuickEditing`, `platformDrafts` | `post` from store |

### Key Rules
1. **One source of truth per piece of state** — crop state lives in CropEditor, caption state lives in PostMetadataEditor, never duplicated
2. **React.memo on every child** — GridItem, each Preview, ConvictionScore
3. **No effect cascades** — effects only set their own component's state, never trigger sibling effects
4. **Stable keys** — Cropper stays mounted across aspect ratio changes, only remounts on post switch
5. **Event listener cleanup** — every `addEventListener` has a matching cleanup in useEffect return or onMouseUp
6. **Selective store subscriptions** — `useAppStore(state => state.gridPosts)` replaced with `useAppStore(useShallow(state => ...))` or individual selectors per GridItem

### Save Strategy
- **No autosave** — saves happen on explicit Close or Save button
- **Platform drafts stay local** until save — `platformDrafts` object in PostDetails shell, passed down as props
- **Single save function** — `saveAllPlatformCrops()` in PostDetails shell, called on Close/Save, writes to backend + store once
- **Cloudinary URL transforms** for display — no rendered image uploads needed for preview

### Migration Path
1. Extract `ConvictionScore` first (most isolated, async, easy win)
2. Extract `PostMetadataEditor` (caption/hashtags — independent of visual editing)
3. Extract `PlatformPreviews` + individual preview cards (read-only, memoize)
4. Extract `CropEditor` + `CropToolbar` (the hard one — owns most state)
5. Wrap `GridItem` in `React.memo`
6. Add `useShallow` to store subscriptions in GridPlanner
7. Clean up PostDetails shell — should be <200 lines

---

## Immediate Fixes (Before Full Refactor)

These can be done now to reduce glitchiness without the full split:

1. **Wrap GridItem in React.memo** — prevents grid thrashing during edits
2. **Remove the Cropper key hack** — use `cropperRef.current.setCoordinates()` instead of remounting
3. **Batch state updates** in post-switch effect — use a single `setState` call or `useReducer`
4. **Add cleanup to compare slider** — return cleanup function from mousedown handler
5. **Selective store subscription** — `useAppStore(useShallow(...))` in GridPlanner
