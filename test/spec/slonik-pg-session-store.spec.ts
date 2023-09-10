import type { SessionData } from '@mgcrea/fastify-session'
import type { DatabasePool, ListSqlToken } from 'slonik'
import { createPool, sql } from 'slonik'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_SESSION_TABLE_IDENTIFIER_TOKEN, SlonikPgSessionStore } from '../../src/slonik-pg-session-store'
import { buildSqlColumnsList } from '../../src/slonik/query-helpers'
import { AuthSession, zAuthSession } from '../../src/zod-schemas/z-session'
import { sleepMs } from '../utils/sleep'
import { DEFAULT_SLONIK_POOL_CONFIG } from '../utils/slonik-pool-config'

const PG_CONNECTION_URI = process.env['DATABASE_URL'] || 'postgres://postgres:postgres@localhost:5432/postgres'

/**
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

  let pool: DatabasePool
  let store: SlonikPgSessionStore

  const MIN_EXPIRY_JS_TIMESTAMP = Date.now()

  const TEST_SID = 'QLwqf4XJ1dmkiT41RB0fM'
  const TEST_DATA: SessionData = { foo: 'bar' }

  // triple the default timeout to support slow CI and accommodate cold starts of cloud databases
  const JEST_ASYNC_TIMEOUT_MS = 15000

  beforeAll(async () => {
    pool = await createPool(PG_CONNECTION_URI, DEFAULT_SLONIK_POOL_CONFIG)
    store = new SlonikPgSessionStore({ pool, ttlSeconds: TTL_SECONDS })

    await deleteSessionBySid(pool, TEST_SID)
  }, JEST_ASYNC_TIMEOUT_MS)

  afterAll(async () => {
    await pool.end()
  }, JEST_ASYNC_TIMEOUT_MS)

  it('should be able to create an instance of itself', () => {
    const store = new SlonikPgSessionStore({ pool, ttlSeconds: TTL_SECONDS })
    expect(store).toBeInstanceOf(SlonikPgSessionStore)
  })

  it('should set session data for a given session id with ttl set via constructor', async () => {
    const result = await store.set(TEST_SID, TEST_DATA)

    const sessionData = await findSessionBySid(pool, TEST_SID)
    const laterTtlMs = Date.now() + TTL_SECONDS * 1000

    // ensure void (undefined) return
    expect(result).toBeUndefined()

    // ensure session data and expiry ttl was set correctly
    expect(sessionData?.data).toEqual(TEST_DATA)
    expect(sessionData?.expiresAt).toBeInstanceOf(Date)
    expect(sessionData?.expiresAt?.getTime()).toBeLessThan(laterTtlMs)
  })

  it('should set session data and ttl for a given session id and ttl value', async () => {
    const shorterExpiresAtMs = Date.now() + SHORT_TTL_SECONDS * 1000

    const result = await store.set(TEST_SID, TEST_DATA, shorterExpiresAtMs)
    const sessionData = await findSessionBySid(pool, TEST_SID)

    const laterShorterExpiresAtMs = Date.now() + SHORT_TTL_SECONDS * 1000

    expect(result).toBeUndefined()

    // ensure session data and expiry ttl checks out
    expect(sessionData?.data).toEqual(TEST_DATA)
    expect(sessionData?.expiresAt).toBeInstanceOf(Date)
    expect(sessionData?.expiresAt?.getTime()).toEqual(shorterExpiresAtMs)

    // ensure if a new session were set with the same ttl formula that it would be less than the previous
    expect(sessionData?.expiresAt?.getTime()).toBeLessThan(laterShorterExpiresAtMs)
  })

  it('should get an existing session as a tuple given its session id', async () => {
    const result = await store.get(TEST_SID)

    const sessionData = result?.[0]
    const expiry = result?.[1]

    // ensure tuple is returned
    expect(Array.isArray(result) && result.length === 2).toBeTruthy()

    // ensure session data is correct and expiry ttl checks out
    expect(sessionData).toEqual(TEST_DATA)
    expect(Number.isInteger(expiry)).toBeTruthy()
    expect(Number(expiry) > MIN_EXPIRY_JS_TIMESTAMP).toBeTruthy()
  })

  it('should destroy an existing session given its session id', async () => {
    const destroyResult = await store.destroy(TEST_SID)
    const getResult = await store.get(TEST_SID)

    expect(destroyResult).toBeUndefined()
    expect(getResult).toBeNull()
  })

  it('should touch a session and update its ttl', async () => {
    await store.set(TEST_SID, TEST_DATA)
    await sleepMs(WAIT_FOR_MS)

    const preTouchResult = await findSessionBySid(pool, TEST_SID)
    const { expiresAt: preExpiresAt } = preTouchResult || {}

    const touchResult = await store.touch(TEST_SID)

    const postTouchResult = await findSessionBySid(pool, TEST_SID)
    const { expiresAt: postExpiresAt } = postTouchResult || {}

    expect(touchResult).toBeUndefined()
    expect(Number.isInteger(preExpiresAt?.getTime())).toBe(true)
    expect(Number.isInteger(postExpiresAt?.getTime())).toBe(true)
    expect(Number(postExpiresAt?.getTime())).toBeGreaterThan(Number(preExpiresAt?.getTime()) + WAIT_FOR_MS)
  })

  it('should touch a session with a shorter ttl', async () => {
    await store.set(TEST_SID, TEST_DATA)
    await sleepMs(WAIT_FOR_MS)

    const { expiresAt: preExpiresAt } = (await findSessionBySid(pool, TEST_SID)) || {}

    const shorterExpiresAtMs = Date.now() + SHORT_TTL_SECONDS * 1000
    const result = await store.touch(TEST_SID, shorterExpiresAtMs)

    const { expiresAt: postExpiresAt } = (await findSessionBySid(pool, TEST_SID)) || {}

    // ensure touch returns void (undefined)
    expect(result).toBeUndefined()

    // ensure session expiry was updated and ttls check out
    expect(preExpiresAt instanceof Date).toBeTruthy()
    expect(postExpiresAt instanceof Date).toBeTruthy()
    expect(Number(postExpiresAt?.getTime())).toBeLessThan(Number(preExpiresAt?.getTime()))
    expect(Number(postExpiresAt?.getTime())).toEqual(shorterExpiresAtMs)
  })
})

async function findSessionBySid(pool: DatabasePool, sid: string): Promise<AuthSession | null> {
  const result = await pool.connect((connection) => {
    const tableIdentifer = DEFAULT_SESSION_TABLE_IDENTIFIER_TOKEN
    const resultDtoSqlColumns: ListSqlToken = buildSqlColumnsList(zAuthSession)

    const query = sql.type(zAuthSession)`
      SELECT ${resultDtoSqlColumns} FROM ${tableIdentifer} WHERE sid = ${sid};
    `

    return connection.maybeOne(query)
  })

  return result
}

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
