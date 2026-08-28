import { readFile } from 'node:fs/promises';
import { teamRosterDocumentSchema, teamRosterEntrySchema } from '@cdf/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { ConfigStore } from '../persistence/config-store.js';
import { MAX_LOGO_BYTES, type LogoStore } from '../persistence/logo-store.js';
import { parseTeamLogoIni } from '../persistence/team-logo-ini.js';

export interface LogoRoutesOptions {
  logos: LogoStore;
  config: ConfigStore;
}

const paramsSchema = z.object({
  teamNo: z.coerce.number().int().min(1).max(25),
});

const errorSchema = z.object({ error: z.string() });

/**
 * Team logo upload and removal.
 *
 * Uploading writes the file **and** links it into the roster in one step. Making the operator save
 * the roster afterwards would mean an uploaded logo that silently is not used, which looks exactly
 * like an upload that failed. Only the `logoUrl` of that one team is touched, so unsaved edits
 * elsewhere in the form survive.
 */
export const logoRoutes: FastifyPluginAsyncZod<LogoRoutesOptions> = async (app, options) => {
  const { logos, config } = options;

  app.post(
    '/teams/:teamNo/logo',
    {
      schema: {
        summary: 'Upload a team logo',
        tags: ['config'],
        params: paramsSchema,
        response: { 200: teamRosterEntrySchema, 400: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { teamNo } = request.params;

      const team = config.teams.current.teams.find((entry) => entry.teamNo === teamNo);
      if (!team) {
        return reply.code(404).send({ error: `No team with the number ${teamNo}.` });
      }

      const upload = await request.file({ limits: { fileSize: MAX_LOGO_BYTES } });
      if (!upload) {
        return reply.code(400).send({ error: 'No file was uploaded.' });
      }

      const bytes = await upload.toBuffer();
      if (upload.file.truncated) {
        return reply
          .code(400)
          .send({ error: `That image is larger than ${MAX_LOGO_BYTES / 1024 / 1024} MB.` });
      }

      let stored;
      try {
        stored = await logos.save(teamNo, bytes);
      } catch (cause) {
        return reply.code(400).send({ error: (cause as Error).message });
      }

      const updated = { ...team, logoUrl: stored.url };
      await config.saveTeams({
        ...config.teams.current,
        teams: config.teams.current.teams.map((entry) =>
          entry.teamNo === teamNo ? updated : entry,
        ),
      });

      return reply.send(updated);
    },
  );

  app.post(
    '/teams/import-ini',
    {
      schema: {
        summary: 'Import a TeamLogoAndColor.ini as the team roster',
        tags: ['config'],
        response: {
          200: z.object({
            teams: z.number().int(),
            logosCopied: z.number().int(),
            logosMissing: z.array(z.string()),
            document: teamRosterDocumentSchema,
          }),
          400: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const upload = await request.file({ limits: { fileSize: 1024 * 1024 } });
      if (!upload) return reply.code(400).send({ error: 'No file was uploaded.' });

      const entries = parseTeamLogoIni((await upload.toBuffer()).toString('utf8'));
      if (entries.length === 0) {
        return reply.code(400).send({
          error:
            'No teams found in that file. Expected a TeamLogoAndColor.ini from the PCOB client.',
        });
      }

      const existing = new Map(config.teams.current.teams.map((team) => [team.teamNo, team]));
      const logosMissing: string[] = [];
      let logosCopied = 0;

      const teams = await Promise.all(
        entries.map(async (entry) => {
          const previous = existing.get(entry.teamNo);
          let logoUrl = previous?.logoUrl ?? null;

          if (entry.logoPath) {
            /*
             * The ini points at files on this machine, and reading them is the point: it is what
             * turns the import from "names only" into "everything, done". It is also a local file
             * read driven by an uploaded file, which is only reasonable because the operator runs
             * this on their own machine over loopback (ADR-0008). Anything that does not sniff as
             * an image is skipped rather than copied.
             */
            const copied = await readLocalImage(entry.logoPath);
            if (copied) {
              logoUrl = (await logos.save(entry.teamNo, copied)).url;
              logosCopied += 1;
            } else {
              logosMissing.push(entry.logoPath);
            }
          }

          return {
            teamNo: entry.teamNo,
            name: entry.name,
            logoUrl,
          };
        }),
      );

      const document = await config.saveTeams({ ...config.teams.current, teams });
      return reply.send({ teams: teams.length, logosCopied, logosMissing, document });
    },
  );

  async function readLocalImage(filePath: string): Promise<Buffer | null> {
    try {
      const bytes = await readFile(filePath);
      return logos.detectFormat(bytes) ? bytes : null;
    } catch {
      // A path that no longer exists is ordinary — operators move their logo folders around.
      return null;
    }
  }

  app.delete(
    '/teams/:teamNo/logo',
    {
      schema: {
        summary: 'Remove a team logo',
        tags: ['config'],
        params: paramsSchema,
        response: { 200: teamRosterEntrySchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { teamNo } = request.params;

      const team = config.teams.current.teams.find((entry) => entry.teamNo === teamNo);
      if (!team) {
        return reply.code(404).send({ error: `No team with the number ${teamNo}.` });
      }

      await logos.remove(teamNo);

      const updated = { ...team, logoUrl: null };
      await config.saveTeams({
        ...config.teams.current,
        teams: config.teams.current.teams.map((entry) =>
          entry.teamNo === teamNo ? updated : entry,
        ),
      });

      return reply.send(updated);
    },
  );
};
