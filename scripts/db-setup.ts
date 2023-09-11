import * as fs from 'fs/promises'
import * as path from 'path'
import { createPool, sql } from 'slonik'
import { raw } from 'slonik-sql-tag-raw'
import { z } from 'zod'

/*
 * Run this script from project root to setup the dev/test database: `pnpm dev:setup`
 *
 * Running this setup is a prerequisite to running the tests via `pnpm spec` or `pnpm test`.
 *
 * To start the dev database on port 5432 via `docker compose` run the script: `pnpm docker:postgres:up`
 * To turn off the dev database run: `pnpm docker:postgres:down`
 */

const PG_CONNECTION_URI = process.env['DATABASE_URL'] || 'postgres://postgres:postgres@localhost:5432/postgres'

main()
  .then(() => console.log('\nDone.'))
  .catch(console.error)

async function main(): Promise<void> {
  const pool = await createPool(PG_CONNECTION_URI, {
    captureStackTrace: true,
    connectionTimeout: 10000,
    idleTimeout: 10000,
    interceptors: [
      {
        afterPoolConnection: async (_connectionContext, connection) => {
          await connection.query(sql.type(z.null())`
          CREATE SCHEMA IF NOT EXISTS public;
          SET search_path TO public;

          SET TIME ZONE 'UTC';
        `)

          return null
        },
      },
    ],
  })

  try {
    // the paths assume this script is run via `pnpm dev:setup` from project root
    const sqlFunctions = await fs.readFile(path.join(process.cwd(), './database/functions.sql'), { encoding: 'utf-8' })
    const sqlSchema = await fs.readFile(path.join(process.cwd(), './database/schema.sql'), { encoding: 'utf-8' })

    await pool.connect(async (connection) => {
      console.log('Executing functions.sql query...')
      await connection.query(sql.unsafe`${raw(sqlFunctions)}`)

      console.log('Executing schema.sql query...')
      await connection.query(sql.unsafe`${raw(sqlSchema)}`)
    })
  } catch (error: unknown) {
    console.error(error)
  } finally {
    await pool.end()
  }
}
