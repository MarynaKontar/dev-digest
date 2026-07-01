import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PrIntentRecord } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { IntentService } from './service.js';

/**
 * Intent module routes.
 *
 *   GET  /pulls/:id/intent          → PrIntentRecord | null  (cached; no LLM call)
 *   POST /pulls/:id/intent/recompute → PrIntentRecord        (classify/re-classify)
 *
 * Zod `params` schemas are declared on each route so `fastify-type-provider-zod`
 * validates them and returns 422 on bad input — no hand-rolled `.parse()`.
 */
export default async function intentRoutes(appBase: FastifyInstance): Promise<void> {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new IntentService(container);

  // GET /pulls/:id/intent
  // Returns the stored intent for a PR, or null if none has been computed yet.
  // Never triggers an LLM call; clients should call /recompute to generate.
  app.get(
    '/pulls/:id/intent',
    {
      schema: {
        params: IdParams,
        response: { 200: PrIntentRecord.nullable() },
      },
    },
    async (req): Promise<z.infer<typeof PrIntentRecord> | null> => {
      const { workspaceId } = await getContext(container, req);
      const row = await container.intentRepo.getByPrId(req.params.id);
      if (!row) return null;

      // Only return intent that belongs to the right workspace (PR is scoped).
      const pull = await container.reviewRepo.getPull(workspaceId, req.params.id);
      if (!pull) return null;

      return {
        pr_id: row.prId,
        intent: row.intent,
        in_scope: row.inScope,
        out_of_scope: row.outOfScope,
        risk_areas: row.riskAreas,
      };
    },
  );

  // POST /pulls/:id/intent/recompute
  // Classify (or re-classify) the PR's intent. Uses the head-SHA cache: if the
  // stored intent was computed on the current commit, returns it without an LLM
  // call. Otherwise calls the flash-class model, persists, and returns.
  app.post(
    '/pulls/:id/intent/recompute',
    {
      schema: {
        params: IdParams,
        response: { 200: PrIntentRecord },
      },
    },
    async (req): Promise<z.infer<typeof PrIntentRecord>> => {
      const { workspaceId } = await getContext(container, req);
      return service.ensureIntent(workspaceId, req.params.id, req.log);
    },
  );
}
