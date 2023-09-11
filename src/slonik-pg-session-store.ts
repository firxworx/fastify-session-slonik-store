import { SessionData, SessionStore } from '@mgcrea/fastify-session'
import { EventEmitter } from 'events'
import type { DatabasePool, IdentifierSqlToken } from 'slonik'
import { z } from 'zod'
import { getSlonikIdentifierSqlToken } from './slonik/query-helpers'
import { sql } from './slonik/sql-tag'
import { zJson } from './zod-schemas/z-json' // zJsonObject
import { zSessionStoreGetValue, zSessionStoreGetValueUniversal } from './zod-schemas/z-session'

// import createDebug from 'debug'
// export const debug = createDebug('slonik-pg-session-store')

export type SlonikPgSessionStoreOptions = {
  pool: DatabasePool
  tableIdentifier?: string | string[] | IdentifierSqlToken
  ttlSeconds?: number

  // unimplemented --
  // createTable?: boolean
}

export const DEFAULT_SESSION_TTL_SECONDS = 864e2 // one day

export const DEFAULT_SESSION_TABLE_SCHEMA = 'public'
export const DEFAULT_SESSION_TABLE_NAME = 'session'

export const DEFAULT_SESSION_TABLE_IDENTIFIER_TOKEN: IdentifierSqlToken = getSlonikIdentifierSqlToken([
  DEFAULT_SESSION_TABLE_SCHEMA,
  DEFAULT_SESSION_TABLE_NAME,
])

/**
 * Map the "universal" session result where fields can be either snake_case or camelCase (depending on slonik pool
 * configuration) to the normalized version with camelCase fields.
 */
function mapUniversalSessionResult(
  input: z.infer<typeof zSessionStoreGetValueUniversal>,
): z.infer<typeof zSessionStoreGetValue> {
  return {
    data: input.data,
    expiresAt: 'expiresAt' in input ? input.expiresAt : 'expires_at' in input ? input.expires_at : null,
  }
}

/**
 * Slonik-powered postgres session store for `@mgcrea/fastify-session`.
 *
 * Note that `@mgcrea/fastify-session` should not be confused with the now-unmaintained `fastify-session` nor
 * its official successor `@fastify/session`.
 *
 * @todo provide option for field names being transformed or not (expiresAt) or expires_at OR HANDLE
 */
export class SlonikPgSessionStore<T extends SessionData = SessionData> extends EventEmitter implements SessionStore {
  private readonly pool: DatabasePool

  readonly ttlSeconds: number
  readonly tableIdentifier: IdentifierSqlToken

  // @future mgcrea's PrismaStore adds an `extra` option that is not implemented here
  // readonly #extra: ExtraCreateInput<T> | undefined

  // it is interesting to note the following session store example adds a 'prefix' option (refer to `KnexStore`)
  // https://github.com/chriswk/fastify-session-knex-store

  // @future this store does not implement a `createTable` option
  // this may be a good idea for future as this is a common feature seen in other session stores

  constructor({
    pool,
    ttlSeconds = DEFAULT_SESSION_TTL_SECONDS,
    tableIdentifier = DEFAULT_SESSION_TABLE_IDENTIFIER_TOKEN,
  }: SlonikPgSessionStoreOptions) {
    super()

    this.pool = pool
    this.ttlSeconds = ttlSeconds
    this.tableIdentifier = getSlonikIdentifierSqlToken(tableIdentifier)
  }

  /**
   * Return a `Date` object for the given `expiresJsTimetamp` otherwise `now()` plus `this.ttlSeconds`
   * if the argument is not provided.
   */
  private getExpiresAtDate(expiresAtJsTimetamp?: number | null): Date {
    if (expiresAtJsTimetamp && typeof expiresAtJsTimetamp !== 'number') {
      console.error('invalid timestamp ', expiresAtJsTimetamp)
      throw new Error('session store received invalid js timestamp')
    }

    return new Date(expiresAtJsTimetamp ?? Date.now() + this.ttlSeconds * 1000)
  }

  /**
   * Get session from the store given a session ID.
   *
   * Key considerations for use with slonik:
   *
   * - slonik supports transformations of results (refer to `typeParsers` in slonik docs)
   * - by default slonik will transforms postgres timestamp/timestamptz fields to JS timestamps (in ms)
   * - many devs configure slonik to parse these to Date, unix timestamps (in s), ISO strings, etc.
   * - the `Date` constructor and therefore this code is cool with JS timestamps, Date, and ISO strings
   *
   * @throws {DataIntegrityError} if more than one row found for the given session ID
   */
  async get(sessionId: string): Promise<[T, number | null] | null> {
    const result: [T, number | null] | null = await this.pool.connect(async (connection) => {
      // universal value could have either expires_at or expiresAt (depends on table schema + pool configuration)
      const query = sql.type(zSessionStoreGetValueUniversal)`
        SELECT "data", "expires_at"
        FROM ${this.tableIdentifier}
        WHERE "sid" = ${sessionId};
      `

      const result = await connection.maybeOne(query)

      if (!result?.data) {
        return null
      }

      // normalize the universal value to required version with expiresAt property
      const mappedResult = mapUniversalSessionResult(result)

      // assume the slonik `typeParsers` output for timestamptz is compatible with the `Date` constructor
      return [result.data as T, mappedResult?.expiresAt ? new Date(mappedResult.expiresAt).getTime() : null]
    })

    return result
  }

  /**
   * Upsert a session in the store given a session ID (`sid`) and session (`session`) object of type
   * `SessionData` (a JSON object stored as a postgres `jsonb` type).
   *
   * The `SessionData` type is compatible with the zod schema `zJsonObject` included in this package.
   */
  async set(sessionId: string, sessionData: T, expiresAtJsTimestamp?: number | null): Promise<void> {
    const expiresAtDate = this.getExpiresAtDate(expiresAtJsTimestamp)
    const jsonSessionData = zJson.parse(sessionData)

    // @see https://github.com/gajus/slonik/pull/383 regarding inserting dates with slonik and `timestamp()`
    await this.pool.connect(async (connection) => {
      const query = sql.typeAlias('void')`
        INSERT INTO ${this.tableIdentifier} ("sid", "data", "expires_at")
          VALUES (${sessionId}, ${sql.jsonb(jsonSessionData)}, ${sql.timestamp(expiresAtDate)})
        ON CONFLICT ("sid")
        DO UPDATE SET "data" = ${sql.jsonb(jsonSessionData)}, "expires_at" = ${sql.timestamp(expiresAtDate)};
      `

      await connection.query(query)
    })
  }

  /**
   * Destroy the session with the given session ID (`sid`).
   */
  async destroy(sessionId: string): Promise<void> {
    await this.pool.connect(async (connection) => {
      const query = sql.typeAlias('void')`
        DELETE FROM ${this.tableIdentifier} WHERE sid = ${sessionId};
      `

      await connection.query(query)
    })
  }

  /**
   * Touch a session from the store given a session ID (`sid`) to reset the idle timer.
   */
  async touch(sessionId: string, expiresJsTimestamp?: number | null): Promise<void> {
    const expiresAt = this.getExpiresAtDate(expiresJsTimestamp)

    await this.pool.connect(async (connection) => {
      const query = sql.typeAlias('void')`
        UPDATE ${this.tableIdentifier}
        SET expires_at = ${sql.timestamp(expiresAt)}
        WHERE sid = ${sessionId};
      `

      await connection.query(query)
    })
  }

  // optional methods per the fastify-session SessionStore abstract class plus 'deleteExpired()'
  // tentative/wip implementations are commented out for now as they are pending tests...

  // /**
  //  * Returns all sessions in the store
  //  */
  // async all(): Promise<{ [sid: string]: T } | null> {
  //   try {
  //     const result = await this.pool.connect(async (connection) => {
  //       const query = sqlx.type(zSessionManyValue)`
  //         SELECT "sid", "data" FROM ${this.tableIdentifier};
  //       `

  //       return connection.many(query)
  //     })

  //     if (!result.length) {
  //       return null
  //     }

  //     const sessions: { [sid: string]: T } = {}

  //     for (const row of result) {
  //       sessions[row.sid] = row.data as T
  //     }

  //     return sessions
  //   } catch (error) {
  //     console.error('Error fetching all sessions:', error)
  //     throw error
  //   }
  // }

  // /**
  //  * Return a count of all sessions (including expired sessions) in the store.
  //  */
  // async length(): Promise<number> {
  //   try {
  //     const result = await this.pool.connect(async (connection) => {
  //       const query = sqlx.typeAlias('count')`
  //         SELECT COUNT(id) as count FROM ${this.tableIdentifier};
  //       `

  //       return connection.one(query)
  //     })

  //     return result.count
  //   } catch (error) {
  //     console.error('Error querying session count from pg store:', error)
  //     throw error
  //   }
  // }

  // /**
  //  * Delete all sessions from the store.
  //  */
  // async clear(): Promise<void> {
  //   try {
  //     await this.pool.connect(async (connection) => {
  //       const query = sqlx.typeAlias('void')`
  //         DELETE FROM ${this.tableIdentifier};
  //       `

  //       await connection.query(query)
  //     })
  //   } catch (error) {
  //     console.error('Error clearing sessions from pg store:', error)
  //     throw error
  //   }
  // }

  // /**
  //  * Delete expired sessions from the store.
  //  *
  //  * This method is not required to meet the `SessionStore` interface requirements of `@mgcrea/fastify-session`
  //  * however it is a common feature of session stores to delete expired sessions.
  //  */
  // async deleteExpired(daysExpired?: number): Promise<void> {
  //   try {
  //     await this.pool.connect(async (connection) => {
  //       const query =
  //         daysExpired && Number.isFinite(daysExpired)
  //           ? sqlx.typeAlias('void')`
  //             DELETE FROM ${this.tableIdentifier}
  //             WHERE "expires_at" < NOW() - INTERVAL '${daysExpired} days'
  //           `
  //           : sqlx.typeAlias('void')`
  //             DELETE FROM ${this.tableIdentifier}
  //             WHERE "expires_at" < NOW();
  //           `

  //       await connection.query(query)
  //     })
  //   } catch (error) {
  //     console.error('Error deleting expired sessions:', error)
  //     throw error
  //   }
  // }
}
