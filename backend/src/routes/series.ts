import { seriesDocumentSchema, teamSchema } from '@cdf/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { MatchStore } from '../state/match-store.js';
import type { ClosedMapTeamEdit, SeriesStore } from '../state/series-store.js';
import type { ConfigStore } from '../persistence/config-store.js';

export interface SeriesRoutesOptions {
  series: SeriesStore;
  match: MatchStore;
  config: ConfigStore;
  /** Called after a close/reset/edit/delete changes the series so `MatchStore`'s PTS can catch up. */
  onSeriesChanged: () => void;
}

const errorSchema = z.object({ error: z.string() });

const editSchema = z.object({
  teams: z
    .array(
      z.object({
        teamNo: z.number().int().min(1).max(25),
        placement: z.number().int().min(1),
        eliminations: z.number().int().min(0),
      }),
    )
    .min(1),
});

/**
 * Multi-map series scoring (specs/SCORING-LOGIC-UPDATE.md): current standings plus the closed-map
 * history, and the operations the Series control admin page needs against it.
 */
export const seriesRoutes: FastifyPluginAsyncZod<SeriesRoutesOptions> = async (app, options) => {
  const { series, match, config, onSeriesChanged } = options;

  app.get(
    '/series',
    {
      schema: {
        summary: 'Read the series history and the live current-map standings',
        tags: ['series'],
        response: {
          200: z.object({ document: seriesDocumentSchema, standings: z.array(teamSchema) }),
        },
      },
    },
    async () => ({ document: series.getState(), standings: match.project().match.teams }),
  );

  app.post(
    '/series/close-map',
    {
      schema: {
        summary: 'Manually close the currently running map',
        tags: ['series'],
        response: { 200: seriesDocumentSchema },
      },
    },
    async () => {
      await series.closeMapNow(match.projectAsEnded(), Date.now());
      onSeriesChanged();
      return series.getState();
    },
  );

  app.post(
    '/series/reset',
    {
      schema: {
        summary: 'Reset the series: clears history, leaves the running map untouched',
        tags: ['series'],
        response: { 200: seriesDocumentSchema },
      },
    },
    async () => {
      const result = await series.resetSeries();
      onSeriesChanged();
      return result;
    },
  );

  app.put(
    '/series/maps/:mapId',
    {
      schema: {
        summary: "Correct a closed map's placements/eliminations",
        tags: ['series'],
        params: z.object({ mapId: z.string().min(1) }),
        body: editSchema,
        response: { 200: seriesDocumentSchema, 400: errorSchema },
      },
    },
    async (request, reply) => {
      const edits: ClosedMapTeamEdit[] = request.body.teams;
      try {
        const result = await series.editClosedMap(
          request.params.mapId,
          edits,
          config.scoring.current,
        );
        onSeriesChanged();
        return result;
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    },
  );

  app.delete(
    '/series/maps/:mapId',
    {
      schema: {
        summary: 'Delete a closed map and renumber the rest',
        tags: ['series'],
        params: z.object({ mapId: z.string().min(1) }),
        response: { 200: seriesDocumentSchema, 400: errorSchema },
      },
    },
    async (request, reply) => {
      try {
        const result = await series.deleteClosedMap(request.params.mapId);
        onSeriesChanged();
        return result;
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    },
  );
};
