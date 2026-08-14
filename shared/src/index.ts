/**
 * `@cdf/shared` — the single source of truth for every shape that crosses a boundary.
 *
 * Per ADR-0005, the Zod schemas defined here are the one definition behind four consumers:
 *   1. backend request/response validation (Fastify + fastify-type-provider-zod),
 *   2. the generated OpenAPI document,
 *   3. persistence validation on read and write (ADR-0004),
 *   4. frontend types and client-side parsing of WebSocket messages (ADR-0007).
 *
 * Rules for this package:
 *   - schemas and inferred types only — no business logic;
 *   - no Node-only and no DOM-only APIs, since both backend and browser import it;
 *   - it must never import from `@cdf/backend` or `@cdf/frontend`.
 *
 * The domain model deliberately does not mirror the PCOB API — see ADR-0006 and
 * specs/PCOB-FINDINGS.md. In particular: points and ranking are computed by us because the API does
 * not provide them, and after-match fields are modelled as absent rather than as zero.
 */

export { PROTOCOL_VERSION, CONFIG_SCHEMA_VERSION } from './versions.js';

export { playerLiveStateSchema, playerSchema } from './domain/player.js';
export type { PlayerLiveState, Player } from './domain/player.js';

export { teamSchema } from './domain/team.js';
export type { Team } from './domain/team.js';

export { matchPhaseSchema, matchStateSchema } from './domain/match.js';
export type { MatchPhase, MatchState } from './domain/match.js';

export { overlayVisibilitySchema } from './domain/overlay.js';
export type { OverlayVisibility } from './domain/overlay.js';

export {
  ingestSourceKindSchema,
  ingestConnectionStateSchema,
  ingestStatusSchema,
} from './domain/ingest.js';
export type { IngestSourceKind, IngestConnectionState, IngestStatus } from './domain/ingest.js';

export { liveSnapshotSchema, serverMessageSchema } from './protocol/live.js';
export type { LiveSnapshot, ServerMessage } from './protocol/live.js';

export {
  FEEDBACK_VERSION,
  overlayFeedbackSchema,
  feedbackDocumentSchema,
} from './protocol/feedback.js';
export type { OverlayFeedback, FeedbackDocument } from './protocol/feedback.js';

export { scoringRulesetSchema, DEFAULT_SCORING_RULESET } from './config/scoring.js';
export type { ScoringRuleset } from './config/scoring.js';

export {
  overlayColorsSchema,
  overlayAnimationSchema,
  overlayAnimationTypeSchema,
  overlayAnimationDirectionSchema,
  overlayRowAnimationSchema,
  overlayAppearanceSchema,
  overlayInstanceIdSchema,
  overlayInstanceSchema,
  overlayInstancesDocumentSchema,
  DEFAULT_OVERLAY_APPEARANCE,
  DEFAULT_OVERLAY_INSTANCES,
} from './config/overlay-instance.js';
export type {
  OverlayColors,
  OverlayAnimation,
  OverlayAnimationType,
  OverlayAnimationDirection,
  OverlayRowAnimation,
  OverlayAppearance,
  OverlayInstance,
  OverlayInstancesDocument,
} from './config/overlay-instance.js';

export {
  customFontSchema,
  customFontsDocumentSchema,
  DEFAULT_CUSTOM_FONTS,
  fontFamilyValue,
} from './config/fonts.js';
export type { CustomFont, CustomFontsDocument } from './config/fonts.js';

export {
  teamRosterEntrySchema,
  teamRosterDocumentSchema,
  DEFAULT_TEAM_ROSTER,
} from './config/team-roster.js';
export type { TeamRosterEntry, TeamRosterDocument } from './config/team-roster.js';
