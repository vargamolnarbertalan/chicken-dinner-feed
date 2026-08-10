import { customFontsDocumentSchema, customFontSchema } from '@cdf/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { ConfigStore } from '../persistence/config-store.js';
import { familyNameFrom, MAX_FONT_BYTES, type FontStore } from '../persistence/font-store.js';

export interface FontRoutesOptions {
  fonts: FontStore;
  config: ConfigStore;
}

const errorSchema = z.object({ error: z.string() });

/** Uploaded fonts: list, add, remove. */
export const fontRoutes: FastifyPluginAsyncZod<FontRoutesOptions> = async (app, options) => {
  const { fonts, config } = options;

  app.get(
    '/config/fonts',
    {
      schema: {
        summary: 'List the uploaded fonts',
        tags: ['config'],
        response: { 200: customFontsDocumentSchema },
      },
    },
    async () => config.fonts.current,
  );

  app.post(
    '/config/fonts',
    {
      schema: {
        summary: 'Upload a font',
        tags: ['config'],
        response: { 200: customFontSchema, 400: errorSchema },
      },
    },
    async (request, reply) => {
      const upload = await request.file({ limits: { fileSize: MAX_FONT_BYTES } });
      if (!upload) return reply.code(400).send({ error: 'No file was uploaded.' });

      const bytes = await upload.toBuffer();
      if (upload.file.truncated) {
        return reply
          .code(400)
          .send({ error: `That font is larger than ${MAX_FONT_BYTES / 1024 / 1024} MB.` });
      }

      const originalName = upload.filename || 'font';
      const existing = config.fonts.current.fonts;
      const family = familyNameFrom(originalName);

      /*
       * Uploading the same name again replaces that font rather than adding a second entry with an
       * identical family: CSS would pick one of them arbitrarily and the operator would have no way
       * to tell which. Re-uploading a corrected file is also the likelier intent.
       *
       * The previous file is deleted first, because a change of format leaves the old extension
       * behind as an orphan otherwise.
       */
      const previous = existing.find((entry) => entry.family === family);
      if (previous) await fonts.remove(previous.fileName);

      let stored;
      try {
        stored = await fonts.save(family, bytes);
      } catch (cause) {
        return reply.code(400).send({ error: (cause as Error).message });
      }

      const font = { family, fileName: stored.fileName, url: stored.url, originalName };
      await config.saveFonts([...existing.filter((entry) => entry.family !== family), font]);

      return reply.send(font);
    },
  );

  app.delete(
    '/config/fonts/:family',
    {
      schema: {
        summary: 'Remove an uploaded font',
        tags: ['config'],
        params: z.object({ family: z.string().min(1) }),
        response: { 200: customFontsDocumentSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { family } = request.params;
      const font = config.fonts.current.fonts.find((entry) => entry.family === family);
      if (!font) return reply.code(404).send({ error: `No font called “${family}”.` });

      await fonts.remove(font.fileName);

      // Overlays still using it are deliberately left alone: their stored value falls back to the
      // system font, which is visible and correctable, whereas silently rewriting their appearance
      // would change what goes on air without anyone asking.
      return reply.send(
        await config.saveFonts(
          config.fonts.current.fonts.filter((entry) => entry.family !== family),
        ),
      );
    },
  );
};
