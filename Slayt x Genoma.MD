# Slayt x Genoma

## Core Model
- **Genoma = Intelligence + Governance Layer (System of Record).**
- **Atelio (Slayt) = Execution Layer (Operator Console).**
- Principle: **one brain, two products**.

## Product Boundary

### Genoma Owns
- Taste Memory and policy logic.
- Approval rules and governance controls.
- Decision ledger (audit trail).
- KPI definitions and reliability scoring model.
- Policy/version lifecycle.

### Atelio Owns
- Grid planning, rollout operations, scheduling, publishing UI.
- Campaign workflow UX and operator ergonomics.
- Action orchestration across channels.

### Non-Negotiable Rule
- Atelio never computes final gate decisions locally.
- Atelio always calls Genoma for authoritative decisions.

## Shared Contract
- Shared IDs across both systems:
  - `workspaceId`
  - `campaignId`
  - `assetId`
  - `policyVersion`
  - `decisionId`
- Every schedule/publish attempt must carry those IDs.

## API Surface (Authoritative in Genoma)

### `GET /policy/:workspaceId`
- Returns active policy for a workspace.
- Includes threshold, strictness, queue requirements, override permissions, and `policyVersion`.

### `POST /gate-check`
- Input: campaign/asset context + policy version + signals.
- Output: single gate decision object:
  - `allowed`
  - `reason`
  - `requiredActions`
  - `decisionId`
  - `policyVersion`

### `POST /decisions`
- Writes immutable decision events (allow/block/override).
- Required fields: actor, timestamp, reason, policyVersion, related IDs.

### `POST /scorecards/snapshot`
- Persists campaign reliability snapshots at key lifecycle points:
  - schedule attempt
  - publish attempt
  - override event

## Enforcement Model
- Atelio calls Genoma `gate-check` before:
  - schedule
  - publish
  - post-now
  - collection item publish
- If blocked, Atelio returns/uses structured remediation actions from Genoma.
- No endpoint is exempt; all posting paths use the same gate contract.

## KPI Contract (Defined Once in Genoma, Rendered in Atelio)
- First-pass usable rate.
- Off-brand iteration reduction.
- Approval cycle time compression.
- Gate block rate.

## Learning Loop
- Atelio emits outcome events to Genoma.
- Genoma updates Taste Memory and policy intelligence.
- Atelio consumes updated policy; no local policy drift allowed.

## Packaging Implication
- Atelio is sold as the operational control room.
- Genoma is positioned as the governance and intelligence moat.
- Premium tiers unlock stricter controls, deeper auditability, and reliability guarantees.

## Implementation Sequence
1. Centralize policy retrieval to Genoma (`/policy`).
2. Replace local gate logic with Genoma `gate-check` in all posting paths.
3. Write immutable decision logs (`/decisions`).
4. Store reliability snapshots (`/scorecards/snapshot`).
5. Remove duplicated local policy logic after migration.
