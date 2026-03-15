# Cross-Platform Posting Strategy

## Core Principle: One Source, Platform-Native Outputs

A single original image produces optimized renders for each platform. The user thinks in terms of "one post" — the system delivers platform-native assets from non-destructive per-platform transforms.

```
Original Image (horizontal, 4032x3024)
  ├─ Instagram  → 1:1 crop, subject centered        → POST via IG API
  ├─ TikTok     → 9:16 crop, zoomed to fill          → POST via TT API
  └─ Twitter/X  → 16:9 crop, wide framing            → POST via X API
```

## Scheduling Model

Each calendar/rollout entry is a single **post intent**:

| Field | Shared | Per-Platform |
|-------|--------|-------------|
| Caption | Base text | Platform-specific hashtags, length truncation |
| Image | `originalMediaUrl` (untouched source) | Rendered crop from `editSettings.[platform]` |
| Schedule time | Default same time | Optional per-platform offset (stagger) |
| Approval gate | One evaluation | One result gates all platforms |
| Conviction score | — | Per-platform score based on crop + platform context |

### Publish Flow

```
Schedule triggered
  → Approval gate check (conviction threshold, brand safety)
  → For each target platform:
      1. Read editSettings.[platform] (scale, pan, rotation, fitMode)
      2. Render optimized image from originalMediaUrl + transforms
      3. Apply platform-specific caption rules (hashtag limits, char limits)
      4. POST to platform API
      5. Record attribution in StanVault
```

### Staggered Posting

Some creators don't blast all platforms simultaneously. Support optional per-platform time offsets:

```
Base time: 9:00 AM
  Instagram: +0m  (9:00 AM — peak IG engagement)
  TikTok:    +3h  (12:00 PM — lunchtime scroll)
  Twitter/X: +6h  (3:00 PM — afternoon discourse)
```

## What Is and Isn't the Moat

### Not a moat (feature, table stakes)
- Per-platform cropping / non-destructive editing
- Multi-platform scheduling
- Preview simulations (IG feed, TikTok phone, Twitter card)
- Drag-to-reposition, scale, rotate

Any funded competitor (Buffer, Later, Canva) could build these in a sprint.

### The actual moat (taste-informed composition)

The editing surface becomes defensible when it's connected to the conviction scoring engine. No other scheduler has a taste genome underneath.

**Current state:** User manually chooses crop per platform.

**Moat state:** The system scores each crop in real-time and guides composition:

```
┌─────────────────────────────────────┐
│  TikTok Preview (9:16)              │
│  ┌─────────────────┐                │
│  │                  │  Conviction: 72│
│  │   [image crop]   │  ▲ +18 from   │
│  │                  │    reposition  │
│  └─────────────────┘                │
│                                     │
│  "Center subject for +12 conviction"│
│  "This crop matches your Artisan    │
│   archetype at 0.84 coherence"      │
└─────────────────────────────────────┘
```

The conviction score changes live as the user pans, zooms, and rotates. This requires:
1. The taste genome (archetype, aesthetic patterns, visual DNA)
2. The conviction scoring engine (evaluates crop against genome)
3. The cross-modal context from Twin OS (Starforge coherence)

**This is what competitors cannot replicate without rebuilding the entire taste infrastructure.**

### Investment Priority

```
DO NOT over-invest in:          INVEST in:
─────────────────────           ──────────
More filters/effects            Live conviction score per crop
Fancy slider UIs                Crop suggestion engine
Template marketplace            Taste-informed auto-crop
Canva-style editor features     Approval gate + governance workflow
                                Ecosystem feedback loop
```

## Per-Platform Conviction Scoring

Each platform has different visual language. A crop that scores high on Instagram (clean, centered, 1:1 harmony) may score poorly on TikTok (needs energy, vertical dynamism, face prominence).

### Platform Scoring Weights

| Signal | Instagram | TikTok | Twitter/X |
|--------|-----------|--------|-----------|
| Subject centering | 0.30 | 0.20 | 0.15 |
| Face prominence | 0.15 | 0.35 | 0.10 |
| Negative space | 0.20 | 0.05 | 0.25 |
| Color saturation | 0.15 | 0.15 | 0.10 |
| Archetype coherence | 0.20 | 0.25 | 0.20 |
| Text safe zone | 0.00 | 0.00 | 0.20 |

### Conviction Score in Quick Edit

The conviction badge updates live as the user adjusts transforms:

```javascript
// Debounced — fires 300ms after last transform change
onTransformChange(editSettings) →
  calculateCropConviction({
    originalImage,
    transforms: editSettings,
    platform: editTarget,
    tasteGenome: userGenome,
    twinOsContext: crossModalIdentity
  }) → score (0-100)
```

The score is displayed in the quick edit panel next to the platform preview. No server round-trip needed for basic scoring — the platform weights and archetype coherence can be computed client-side from the cached genome.

## Implementation Phases

### Phase 1: Live Conviction Badge (current sprint)
- Show conviction score in quick edit panel per platform
- Score updates on debounced transform changes
- Client-side scoring from cached taste genome

### Phase 2: Crop Suggestions
- "Pan left 15% for +12 conviction" hints
- Auto-crop button that maximizes conviction per platform
- Before/after conviction comparison

### Phase 3: Scheduled Multi-Platform Render
- At publish time, render each platform's image from source + transforms
- Server-side canvas render (sharp/node-canvas) from editSettings
- Per-platform caption adaptation (hashtag limits, char truncation)
- Staggered posting support in calendar/rollout

### Phase 4: Feedback Loop
- Track which crops drove highest engagement post-publish
- Feed back into conviction scoring weights
- "Your last 10 TikTok posts scored higher when subject was in upper third"
- Closes the loop: taste → crop → publish → measure → refine taste
