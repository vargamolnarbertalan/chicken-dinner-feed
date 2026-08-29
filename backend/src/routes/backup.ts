import { backupManifestSchema, backupSummarySchema } from '@cdf/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { buildExportZip, type ExportDependencies } from '../backup/export.js';
import { applyImport, validateImportZip } from '../backup/import.js';

export interface BackupRoutesOptions extends ExportDependencies {
  /** Called once an import has actually been written, so the live pipeline (series totals, open
   * browser sources) catches up the same way it already does after a Series control action. */
  onImported: () => void;
}

const MAX_IMPORT_BYTES = 64 * 1024 * 1024;

const importErrorSchema = z.object({ error: z.string(), errors: z.array(z.string()) });

const importPreviewSchema = z.object({
  imported: z.literal(false),
  manifest: backupManifestSchema,
  summary: backupSummarySchema,
});
const importAppliedSchema = z.object({ imported: z.literal(true), summary: backupSummarySchema });
const importResponseSchema = z.discriminatedUnion('imported', [
  importPreviewSchema,
  importAppliedSchema,
]);

/**
 * Import & Export (specs, "Import & Export"): carry every setting from one machine to another as a
 * single ZIP. See `backend/src/backup/export.ts` for exactly what that does and does not include.
 */
export const backupRoutes: FastifyPluginAsyncZod<BackupRoutesOptions> = async (app, options) => {
  const { onImported, ...deps } = options;

  app.get(
    '/backup/export',
    {
      schema: {
        summary: 'Download everything as one backup ZIP',
        tags: ['backup'],
      },
    },
    async (_request, reply) => {
      const zip = await buildExportZip(deps);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      reply.header(
        'content-disposition',
        `attachment; filename="chicken-dinner-feed-backup-${stamp}.zip"`,
      );
      return reply.type('application/zip').send(zip);
    },
  );

  app.post(
    '/backup/import',
    {
      schema: {
        summary: 'Validate (and, once confirmed, apply) a backup ZIP',
        tags: ['backup'],
        querystring: z.object({
          /**
           * Two-step by design: the first call (confirm absent/false) only validates and reports
           * what the backup contains, so the admin can show the operator a confirmation dialog
           * before anything is overwritten. The second call, with confirm=true, is what actually
           * writes it — re-uploading the same small file rather than staging it server-side between
           * the two calls.
           */
          confirm: z.coerce.boolean().default(false),
        }),
        response: { 200: importResponseSchema, 400: importErrorSchema },
      },
    },
    async (request, reply) => {
      const upload = await request.file({ limits: { fileSize: MAX_IMPORT_BYTES } });
      if (!upload) {
        return reply.code(400).send({ error: 'No file was uploaded.', errors: [] });
      }

      const bytes = await upload.toBuffer();
      if (upload.file.truncated) {
        return reply.code(400).send({
          error: `The backup is larger than ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`,
          errors: [],
        });
      }

      const result = validateImportZip(bytes);
      if (!result.ok) {
        return reply
          .code(400)
          .send({ error: 'The backup could not be imported.', errors: result.errors });
      }

      if (!request.query.confirm) {
        return reply.send({
          imported: false,
          manifest: result.value.manifest,
          summary: result.value.summary,
        });
      }

      await applyImport(result.value, deps);
      onImported();
      return reply.send({ imported: true, summary: result.value.summary });
    },
  );
};
