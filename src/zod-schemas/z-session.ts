import { z } from 'zod'
import { zJsonObject } from './z-json'

export interface AuthSession extends z.infer<typeof zAuthSession> {}
export interface RawAuthSession extends z.infer<typeof zRawAuthSession> {}

/**
 * Zod schema describing session data related to the session table with properties in camelCase.
 *
 * This schema does not strictly type the session `data` property other than requiring it to be a
 * JSON-serializable object as required by the postgres jsonb field type.
 *
 * Sessions and session data are managed by the `@mgcrea/fastify-session` package via the
 * `SlonikPgSessionStore` store.
 */
export const zAuthSession = z.object({
  id: z.number().int().nonnegative(),
  sid: z.string(),
  expiresAt: z.coerce.date().nullable(),
  data: zJsonObject.nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

/**
 * Zod schema describing session data related to the RAW session table with properties in lower_snake_case
 * per the default session table schema in postgres documented for this package.
 *
 * This schema does not strictly type the session `data` property other than requiring it to be a
 * JSON-serializable object as required by the postgres jsonb field type.
 *
 * Sessions and session data are managed by the `@mgcrea/fastify-session` package via the
 * `SlonikPgSessionStore` store.
 */
export const zRawAuthSession = z.object({
  id: z.number().int().nonnegative(),
  sid: z.string(),
  expires_at: z.coerce.date().nullable(),
  data: zJsonObject.nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
})

/**
 * Zod schema describing the query result for a session with properties in _either_ camelCase or
 * lower_snake_case.
 *
 * This reflects the fact that the session table and/or slonik pool can be configured to return either
 * camelCase or lower_snake_case field names.
 *
 * For the purposes of this package field names must be normalized to camelCase
 * for working in JS/TS and with `@mgcrea/fastify-session`.
 */
export const zRawSlonikAuthSessionQueryResult = zAuthSession.or(zRawAuthSession)

/**
 * Zod schema describing the return value of the session store's `get()` method.
 */
export const zSessionStoreGetValue = zAuthSession.pick({ data: true, expiresAt: true })

/**
 * Zod schema describing the raw value of the a query result for a given session with properties
 * that could be in either camelCase or lower_snake_case depending on table schema and slonik pool
 * configuration.
 */
export const zSessionStoreGetValueUniversal = zSessionStoreGetValue.or(
  zRawAuthSession.pick({ data: true, expires_at: true }),
)
