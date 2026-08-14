import path from 'node:path';
import type {
  CustomFont,
  CustomFontsDocument,
  OverlayInstance,
  OverlayInstancesDocument,
  ScoringRuleset,
  TeamRosterDocument,
} from '@cdf/shared';
import {
  customFontsDocumentSchema,
  DEFAULT_CUSTOM_FONTS,
  DEFAULT_OVERLAY_INSTANCES,
  DEFAULT_SCORING_RULESET,
  DEFAULT_TEAM_ROSTER,
  overlayInstancesDocumentSchema,
  scoringRulesetSchema,
  teamRosterDocumentSchema,
} from '@cdf/shared';
import { JsonDocument } from './json-document.js';
import { migrateOverlayInstances, migrateSchemaVersionOnly } from './migrations.js';

export type ConfigChange = 'instances' | 'teams' | 'scoring' | 'fonts';
export type ConfigListener = (change: ConfigChange) => void;

export interface ConfigStoreOptions {
  dataDir: string;
  onWarn?: (message: string, detail: unknown) => void;
}

/**
 * Everything an operator has configured, as three documents.
 *
 * Split by aggregate rather than kept as one blob so that saving overlay appearance cannot corrupt
 * the team roster, and so an operator can copy just the piece they want between machines — which is
 * a large part of why file-based configuration was chosen at all (ADR-0004).
 *
 * Listeners exist because a configuration change has to reach the live path: a new scoring ruleset
 * changes the standings immediately, and an appearance change has to reach every open browser
 * source without a reload.
 */
export class ConfigStore {
  private readonly listeners = new Set<ConfigListener>();

  readonly instances: JsonDocument<OverlayInstancesDocument>;
  readonly teams: JsonDocument<TeamRosterDocument>;
  readonly scoring: JsonDocument<ScoringRuleset>;
  readonly fonts: JsonDocument<CustomFontsDocument>;

  constructor(options: ConfigStoreOptions) {
    const { dataDir, onWarn } = options;

    this.instances = new JsonDocument({
      filePath: path.join(dataDir, 'overlay-instances.json'),
      schema: overlayInstancesDocumentSchema,
      createDefault: () => DEFAULT_OVERLAY_INSTANCES,
      migrate: migrateOverlayInstances,
      onWarn,
    });

    this.teams = new JsonDocument({
      filePath: path.join(dataDir, 'team-roster.json'),
      schema: teamRosterDocumentSchema,
      createDefault: () => DEFAULT_TEAM_ROSTER,
      migrate: migrateSchemaVersionOnly,
      onWarn,
    });

    this.scoring = new JsonDocument({
      filePath: path.join(dataDir, 'scoring-ruleset.json'),
      schema: scoringRulesetSchema,
      createDefault: () => DEFAULT_SCORING_RULESET,
      migrate: migrateSchemaVersionOnly,
      onWarn,
    });

    this.fonts = new JsonDocument({
      filePath: path.join(dataDir, 'custom-fonts.json'),
      schema: customFontsDocumentSchema,
      createDefault: () => DEFAULT_CUSTOM_FONTS,
      migrate: migrateSchemaVersionOnly,
      onWarn,
    });
  }

  /**
   * Load every document. Called once at startup, before the server accepts connections, so a
   * malformed file stops the app with a readable message rather than surfacing mid-broadcast.
   */
  async load(): Promise<void> {
    await this.instances.load();
    await this.teams.load();
    await this.scoring.load();
    await this.fonts.load();
  }

  findInstance(instanceId: string): OverlayInstance | null {
    return this.instances.current.instances.find((instance) => instance.id === instanceId) ?? null;
  }

  async saveInstances(instances: OverlayInstance[]): Promise<OverlayInstancesDocument> {
    const saved = await this.instances.write({
      ...this.instances.current,
      instances,
    });
    this.emit('instances');
    return saved;
  }

  async saveTeams(document: TeamRosterDocument): Promise<TeamRosterDocument> {
    const saved = await this.teams.write(document);
    this.emit('teams');
    return saved;
  }

  async saveScoring(ruleset: ScoringRuleset): Promise<ScoringRuleset> {
    const saved = await this.scoring.write(ruleset);
    this.emit('scoring');
    return saved;
  }

  async saveFonts(fonts: CustomFont[]): Promise<CustomFontsDocument> {
    const saved = await this.fonts.write({ ...this.fonts.current, fonts });
    this.emit('fonts');
    return saved;
  }

  subscribe(listener: ConfigListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(change: ConfigChange): void {
    for (const listener of this.listeners) listener(change);
  }
}
