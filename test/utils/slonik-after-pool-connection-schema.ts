import type { ConnectionContext, DatabasePoolConnection } from 'slonik/dist/types'
import { sql } from '../../src/slonik/sql-tag'

/**
 * Slonik `afterPoolConnection` configuration related to slonik pool `ClientConfiguration` object.
 *
 * This function executes a query on every connection to ensure:
 * - "public" schema exists
 * - `search_path` is "public"
 * - `TIME ZONE` is "UTC"
 */
export const afterPoolConnectionConfig = async (
  _connectionContext: ConnectionContext,
  connection: DatabasePoolConnection,
) => {
  await connection.query(sql.typeAlias('null')`
    CREATE SCHEMA IF NOT EXISTS public;
    SET search_path TO public;

    SET TIME ZONE 'UTC';
  `)

  return null
}
