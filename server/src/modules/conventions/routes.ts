import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  JudgeConventionBody,
  JudgeConventionsBody,
  CreateConventionSkillBody,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ConventionsService } from './service.js';

/** `/repos/:id/conventions/:candidateId` — both are UUIDs. */
const RepoAndCandidateParams = z.object({
  id: z.string().uuid(),
  candidateId: z.string().uuid(),
});

/**
 * Conventions module routes.
 *
 *   POST  /repos/:id/conventions/extract         → ConventionsView  (run / re-scan)
 *   GET   /repos/:id/conventions                 → ConventionsView  (latest scan + candidates)
 *   PATCH /repos/:id/conventions/:candidateId    → ConventionCandidate  (accept/reject one)
 *   POST  /repos/:id/conventions/judge           → ConventionCandidate[] (bulk accept/reject)
 *   POST  /repos/:id/conventions/skill           → Skill  (materialise selected → skill)
 */
export default async function conventionsRoutes(appBase: FastifyInstance): Promise<void> {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  // POST /repos/:id/conventions/extract — run extraction pipeline ("Re-scan")
  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  // GET /repos/:id/conventions — latest scan + current candidates
  app.get(
    '/repos/:id/conventions',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.view(workspaceId, req.params.id);
    },
  );

  // PATCH /repos/:id/conventions/:candidateId — accept or reject one candidate
  app.patch(
    '/repos/:id/conventions/:candidateId',
    { schema: { params: RepoAndCandidateParams, body: JudgeConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.judge(
        workspaceId,
        req.params.id,
        req.params.candidateId,
        req.body.status,
      );
    },
  );

  // POST /repos/:id/conventions/judge — bulk accept/reject
  app.post(
    '/repos/:id/conventions/judge',
    { schema: { params: IdParams, body: JudgeConventionsBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.judgeBulk(workspaceId, req.params.id, req.body.ids, req.body.status);
    },
  );

  // POST /repos/:id/conventions/skill — materialise selected accepted candidates → skill
  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateConventionSkillBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.createSkill(workspaceId, req.params.id, req.body);
    },
  );
}
