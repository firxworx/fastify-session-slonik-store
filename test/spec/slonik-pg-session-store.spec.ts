import type { SessionData } from '@mgcrea/fastify-session'
import type { DatabasePool, ListSqlToken } from 'slonik'
import { createPool } from 'slonik'
import { afterAll, beforeAll, afterEach, describe, expect, it } from 'vitest'

import { buildSqlColumnsList } from '../../src/slonik/query-helpers'
import { sql } from '../../src/slonik/sql-tag'
import {
  AuthSession,
  zAuthSession,
  zRawAuthSession,
  zRawSlonikAuthSessionQueryResult,
} from '../../src/zod-schemas/z-session'
import { sleepMs } from '../utils/sleep'
import {
  BASIC_SLONIK_POOL_CONFIG,
  PRESET_SLONIK_POOL_CONFIG,
  COMMON_SLONIK_POOL_CONFIG,
  TRANSFORM_SLONIK_POOL_CONFIG,
} from '../utils/slonik-pool-config'
import SlonikPgSessionStore, { DEFAULT_SESSION_TABLE_IDENTIFIER_TOKEN } from '../../src'
import { z } from 'zod'

const PG_CONNECTION_URI = process.env['DATABASE_URL'] || 'postgres://postgres:postgres@localhost:5432/postgres'

/**
 * Run this test suite using:
 *
 * ```ts
 * pnpm nx test fastify-api --testNamePattern=SlonikPgSessionStore
 * ```
 *
 * @todo add some more tests -- some inspo at https://github.com/oof2win2/fastify-session-sqlite-store/blob/master/test/index.test.ts
 */
describe('SlonikPgSessionStore', () => {
  const TTL_SECONDS = 120
  const SHORT_TTL_SECONDS = 12
  const WAIT_FOR_MS = 200

  let pools: Record<string, DatabasePool>

  const MIN_EXPIRY_JS_TIMESTAMP = Date.now()

  // the tests will create sessions with this sid suffixed by the connection pool name/key
  const TEST_SID = 'QLwqf4XJ1dmkiT41RB0fM'
  const TEST_DATA: SessionData = { foo: 'bar' }

  // triple the default timeout to support slow CI and accommodate slower cold starts of cloud databases
  const JEST_ASYNC_TIMEOUT_MS = 15000

  beforeAll(async () => {
    pools = {
      basic: await createPool(PG_CONNECTION_URI, BASIC_SLONIK_POOL_CONFIG),
      preset: await createPool(PG_CONNECTION_URI, PRESET_SLONIK_POOL_CONFIG),
      common: await createPool(PG_CONNECTION_URI, COMMON_SLONIK_POOL_CONFIG),
      transform: await createPool(PG_CONNECTION_URI, TRANSFORM_SLONIK_POOL_CONFIG),
    }
  }, JEST_ASYNC_TIMEOUT_MS)

  afterAll(async () => {
    // end the pools opened by this test suite
    const promises = Object.values(pools).map(async (pool) => await pool.end())
    await Promise.all(promises)
  }, JEST_ASYNC_TIMEOUT_MS)

  afterEach(async () => {
    // delete any sessions that may have been created during the test
    for await (const [name, pool] of Object.entries(pools)) {
      const testSid = `${TEST_SID}${name}`
      await deleteSessionBySid(pool, testSid)
    }
  })

  it('should be able to create an instance of itself', async () => {
    for await (const pool of Object.values(pools)) {
      const store = new SlonikPgSessionStore({ pool, ttlSeconds: TTL_SECONDS })
      expect(store).toBeInstanceOf(SlonikPgSessionStore)
    }
  })

  it('should set session data for a given session id with ttl set via constructor', async () => {
    for await (const [name, pool] of Object.entries(pools)) {
      const testSid = `${TEST_SID}${name}`
      const store = new SlonikPgSessionStore({ pool, ttlSeconds: TTL_SECONDS })
      const result = await store.set(testSid, TEST_DATA)

      const sessionData = await findSessionBySid(pool, testSid)
      const laterTtlMs = Date.now() + TTL_SECONDS * 1000

      // ensure void (undefined) return
      expect(result).toBeUndefined()

      // ensure session data and expiry ttl was set correctly
      expect(sessionData?.data).toEqual(TEST_DATA)
      expect(sessionData?.expiresAt).toBeInstanceOf(Date)
      expect(sessionData?.expiresAt?.getTime()).toBeLessThan(laterTtlMs)
    }
  })

  it('should set session data and ttl for a given session id and ttl value', async () => {
    for await (const [name, pool] of Object.entries(pools)) {
      const testSid = `${TEST_SID}${name}`
      const store = new SlonikPgSessionStore({ pool, ttlSeconds: TTL_SECONDS })

      const shorterExpiresAtMs = Date.now() + SHORT_TTL_SECONDS * 1000

      const result = await store.set(testSid, TEST_DATA, shorterExpiresAtMs)
      const sessionData = await findSessionBySid(pool, testSid)

      const laterShorterExpiresAtMs = Date.now() + SHORT_TTL_SECONDS * 1000

      expect(result).toBeUndefined()

      // ensure session data and expiry ttl checks out
      expect(sessionData?.data).toEqual(TEST_DATA)
      expect(sessionData?.expiresAt).toBeInstanceOf(Date)
      expect(sessionData?.expiresAt?.getTime()).toEqual(shorterExpiresAtMs)

      // ensure if a new session were set with the same ttl formula that it would be less than the previous
      expect(sessionData?.expiresAt?.getTime()).toBeLessThan(laterShorterExpiresAtMs)
    }
  })

  it('should get an existing session as a tuple given its session id', async () => {
    for await (const [name, pool] of Object.entries(pools)) {
      const testSid = `${TEST_SID}${name}`
      const store = new SlonikPgSessionStore({ pool, ttlSeconds: TTL_SECONDS })

      await store.set(testSid, TEST_DATA)
      const result = await store.get(testSid)

      const sessionData = result?.[0]
      const expiry = result?.[1]

      // ensure tuple is returned
      expect(Array.isArray(result) && result.length === 2).toBeTruthy()

      // ensure session data is correct and expiry ttl checks out
      expect(sessionData).toEqual(TEST_DATA)
      expect(Number.isInteger(expiry)).toBeTruthy()
      expect(Number(expiry) > MIN_EXPIRY_JS_TIMESTAMP).toBeTruthy()
    }
  })

  it('should destroy an existing session given its session id', async () => {
    for await (const [name, pool] of Object.entries(pools)) {
      const testSid = `${TEST_SID}${name}`
      const store = new SlonikPgSessionStore({ pool, ttlSeconds: TTL_SECONDS })

      await store.set(testSid, TEST_DATA)

      const preDestroyGetResult = await store.get(testSid)
      const destroyResult = await store.destroy(testSid)
      const postDestroyGetResult = await store.get(testSid)

      expect(destroyResult).toBeUndefined()
      expect(preDestroyGetResult).not.toBeNull()
      expect(postDestroyGetResult).toBeNull()
    }
  })

  it('should touch a session and update its ttl', async () => {
    for await (const [name, pool] of Object.entries(pools)) {
      const testSid = `${TEST_SID}${name}`
      const store = new SlonikPgSessionStore({ pool, ttlSeconds: TTL_SECONDS })

      await store.set(testSid, TEST_DATA)
      await sleepMs(WAIT_FOR_MS)

      const preTouchResult = await findSessionBySid(pool, testSid)
      const { expiresAt: preExpiresAt } = preTouchResult || {}

      const touchResult = await store.touch(testSid)

      const postTouchResult = await findSessionBySid(pool, testSid)
      const { expiresAt: postExpiresAt } = postTouchResult || {}

      expect(touchResult).toBeUndefined()
      expect(Number.isInteger(preExpiresAt?.getTime())).toBe(true)
      expect(Number.isInteger(postExpiresAt?.getTime())).toBe(true)
      expect(Number(postExpiresAt?.getTime())).toBeGreaterThan(Number(preExpiresAt?.getTime()) + WAIT_FOR_MS)
    }
  })

  it('should touch a session with a shorter ttl', async () => {
    for await (const [name, pool] of Object.entries(pools)) {
      const testSid = `${TEST_SID}${name}`
      const store = new SlonikPgSessionStore({ pool, ttlSeconds: TTL_SECONDS })

      await store.set(testSid, TEST_DATA)
      await sleepMs(WAIT_FOR_MS)

      const { expiresAt: preExpiresAt } = (await findSessionBySid(pool, testSid)) || {}

      const shorterExpiresAtMs = Date.now() + SHORT_TTL_SECONDS * 1000
      const result = await store.touch(testSid, shorterExpiresAtMs)

      const { expiresAt: postExpiresAt } = (await findSessionBySid(pool, testSid)) || {}

      // ensure touch returns void (undefined)
      expect(result).toBeUndefined()

      // ensure session expiry was updated and ttls check out
      expect(preExpiresAt instanceof Date).toBeTruthy()
      expect(postExpiresAt instanceof Date).toBeTruthy()
      expect(Number(postExpiresAt?.getTime())).toBeLessThan(Number(preExpiresAt?.getTime()))
      expect(Number(postExpiresAt?.getTime())).toEqual(shorterExpiresAtMs)
    }
  })
})

export function mapAndParseRawSlonikSessionResult(
  input: z.infer<typeof zRawSlonikAuthSessionQueryResult>,
): AuthSession {
  if ('expiresAt' in input) {
    return zAuthSession.parse(input)
  }

  if ('expires_at' in input) {
    const rawQueryResult = zRawAuthSession.parse(input)
    const mapped = {
      ...rawQueryResult,
      expiresAt: rawQueryResult.expires_at,
      createdAt: rawQueryResult.created_at,
      updatedAt: rawQueryResult.updated_at,
    }

    return zAuthSession.parse(mapped)
  }

  throw new Error('This should not be')
}

/**
 * Find a session given a DatabasePool and a session id.
 *
 * This test helper is configured to handle different cases of slonik pool configuration including _and_ excluding
 * the following cases:
 *
 * - slonik pool configured to parse the results with zod
 * - slonik pool configured to convert snake_case to camelCase
 *
 * To understand the code it is important to note that slonik `sql.type()` will NOT actually parse a result with
 * zod if a given slonik pool is not configured for it. Therefore the type of the query result when using `sql.type()`
 * will be incorrect at runtime in this case.
 *
 * @returns `AuthSession` or `null` if no session is found
 */
async function findSessionBySid(pool: DatabasePool, sid: string): Promise<AuthSession | null> {
  const result = await pool.connect(async (connection) => {
    const tableIdentifer = DEFAULT_SESSION_TABLE_IDENTIFIER_TOKEN
    const resultDtoSqlColumns: ListSqlToken = buildSqlColumnsList(zAuthSession)

    // the resulting type from this WILL BE WRONG if slonik is not configured to parse the result
    const query = sql.type(zAuthSession)`
      SELECT ${resultDtoSqlColumns} FROM ${tableIdentifer} WHERE sid = ${sid};
    `

    // transform the result to handle if slonik is not configured to convert snake_case to camelCase
    const rawResult = await connection.maybeOne(query)

    if (!rawResult) {
      return null
    }

    // map and run parse again manually in case slonik is not configured for parsing
    const result = mapAndParseRawSlonikSessionResult(rawResult)
    return result
  })

  return result
}

/**
 * Delete a session given a DatabasePool and a session id.
 *
 * @returns `true` if a session was deleted, `false` otherwise (e.g. session not found)
 */
async function deleteSessionBySid(pool: DatabasePool, sid: string): Promise<boolean> {
  const tableIdentifer = DEFAULT_SESSION_TABLE_IDENTIFIER_TOKEN

  const result = await pool.connect(async (connection) => {
    const query = sql.typeAlias('void')`
      DELETE FROM ${tableIdentifer} WHERE sid = ${sid};
    `

    return connection.query(query)
  })

  return result.rowCount === 1
}
