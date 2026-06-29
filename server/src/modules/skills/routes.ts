import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { SkillType, SkillSource } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { SkillsService } from './service.js';

/** `/skills/:id/versions/:version` — id is a uuid, version a positive integer. */
const SkillVersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  type: SkillType,
  source: SkillSource,
  body: z.string().min(1),
  enabled: z.boolean().optional(),
  evidence_files: z.array(z.string()).optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  type: SkillType.optional(),
  source: SkillSource.optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  evidence_files: z.array(z.string()).optional(),
  /** Optional human-readable change message stored in the new skill_versions row. */
  note: z.string().optional(),
});

/**
 * Skills module (A1).
 *
 *   GET    /skills                           → list (workspace-scoped)
 *   GET    /skills/:id                       → one
 *   POST   /skills                           → create (manual or confirmed import)
 *   PUT    /skills/:id                       → update / toggle enabled (versions body)
 *   DELETE /skills/:id                       → delete (cascade unlinks agent_skills)
 *   GET    /skills/:id/versions              → history (newest first, with note + date)
 *   GET    /skills/:id/versions/:version     → one snapshot (for Diff)
 *   POST   /skills/:id/versions/:version/restore → restore old body as a new version
 *   GET    /skills/:id/stats                 → Stats tab payload (SkillStats)
 *   POST   /skills/import                   → multipart upload → SkillImportPreview (no save)
 */
export default async function skillsRoutes(appBase: FastifyInstance): Promise<void> {
  // @fastify/multipart: scoped to this plugin (not global) for POST /skills/import.
  // Confirmed: app.ts does not register @fastify/multipart globally.
  await appBase.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB cap on skill file uploads
      files: 1,
    },
  });

  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  // ---- CRUD -----------------------------------------------------------------

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const b = req.body;
    const skill = await service.create(workspaceId, {
      name: b.name,
      description: b.description,
      type: b.type,
      source: b.source,
      body: b.body,
      ...(b.enabled !== undefined ? { enabled: b.enabled } : {}),
      ...(b.evidence_files !== undefined ? { evidenceFiles: b.evidence_files } : {}),
    });
    reply.status(201);
    return skill;
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: UpdateSkillBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const b = req.body;
    const skill = await service.update(workspaceId, req.params.id, {
      ...(b.name !== undefined ? { name: b.name } : {}),
      ...(b.description !== undefined ? { description: b.description } : {}),
      ...(b.type !== undefined ? { type: b.type } : {}),
      ...(b.source !== undefined ? { source: b.source } : {}),
      ...(b.body !== undefined ? { body: b.body } : {}),
      ...(b.enabled !== undefined ? { enabled: b.enabled } : {}),
      ...(b.evidence_files !== undefined ? { evidenceFiles: b.evidence_files } : {}),
      ...(b.note !== undefined ? { note: b.note } : {}),
    });
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  // ---- Versions -------------------------------------------------------------

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.get(
    '/skills/:id/versions/:version',
    { schema: { params: SkillVersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const version = await service.getVersion(workspaceId, req.params.id, req.params.version);
      if (!version) throw new NotFoundError('Skill version not found');
      return version;
    },
  );

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: SkillVersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restore(workspaceId, req.params.id, req.params.version);
      if (!skill) throw new NotFoundError('Skill or version not found');
      return skill;
    },
  );

  // ---- Stats ----------------------------------------------------------------

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const stats = await service.stats(workspaceId, req.params.id);
    if (!stats) throw new NotFoundError('Skill not found');
    return stats;
  });

  // ---- Import (multipart) --------------------------------------------------

  // POST /skills/import — file upload → SkillImportPreview (no DB write).
  // Registered on `appBase` (plain FastifyInstance) since this route uses
  // multipart body parsing instead of JSON/Zod body validation.
  // Static path is preferred by Fastify's router over `:id` parametric routes,
  // so registration order doesn't matter here.
  appBase.post('/skills/import', async (req, reply) => {
    const { workspaceId: _ } = await getContext(appBase.container, req);

    const data = await req.file();
    if (!data) {
      throw new ValidationError('No file uploaded. Attach a .md or .zip file as multipart/form-data.');
    }

    // Always consume the stream before any further validation to avoid
    // "Request is aborted" errors from unconsumed multipart streams.
    const buffer = await data.toBuffer();
    const filename = data.filename ?? 'upload.md';

    const preview = await service.importFromUpload(buffer, filename);
    reply.status(200);
    return preview;
  });
}
