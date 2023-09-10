import { z } from 'zod'
import { zJsonObject } from './z-json'

export interface AuthSession extends z.infer<typeof zAuthSession> {}

/**
 * Zod schema describing raw session data related to the session table.
 * This schema does not strictly type `data` other than requiring it to be a JSON-serializable object.
 *
 * Sessions and session data are managed by `@mgcrea/fastify-session` via the `SlonikPgSessionStore` store.
 */
export const zAuthSession = z.object({
  id: z.number().int().nonnegative(),
  sid: z.string(),
  expiresAt: z.coerce.date().nullable(),
  data: zJsonObject.nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
