import type { IdentifierSqlToken, ListSqlToken } from 'slonik'
import { sql } from 'slonik'
import { z } from 'zod'

import { isStringArray } from '../types/array.type-guards'
import { isSlonikIdentifierSqlToken } from '../types/slonik.type-guards'
import type { ZodObjectKeys } from '../types/zod.type-utils'

/**
 * Convert a camelCase string to lower_snake_case.
 *
 * Be mindful of corner cases with case conversions e.g. such as with acronyms.
 */
export function camelToSnake(input = ''): string {
  return input.replace(/[A-Z]+/g, (match) => `_${match.toLowerCase()}`).replace(/^_/, '')
}

/**
 * Return a slonik `IdentifierSqlToken` for use in slonik-powered SQL queries given a string, string array, or
 * `IdentifierSqlToken`.
 *
 * These are typically used to express table names, column names, and other identifiers within an SQL query.
 *
 * This helper normalizes identifiers and slonik's `sql.identifier()` ensures that they are appropriately wrapped
 * in double quotes and that code is protected from SQL injection attacks.
 *
 * It accepts varying input types as a convenience when building queries or writing functions that build queries
 * e.g. 'user', ['public', 'user'], or sql.identifier(['public', 'user']).
 */
export function getSlonikIdentifierSqlToken(input: string | string[] | IdentifierSqlToken): IdentifierSqlToken {
  return isSlonikIdentifierSqlToken(input) ? input : sql.identifier(Array.isArray(input) ? input : [input])
}

/**
 * Return a slonik `IdentifierSqlToken` for use in slonik-powered SQL queries given a string, string array, or
 * `IdentifierSqlToken`.
 *
 * This function is similar to `getSlonikIdentifierSqlToken()` except this function converts camelCase identifiers
 * found in `string` and `string[]` input to snake_case identifiers per project convention.
 *
 * Be mindful of corner cases with case conversions e.g. such as with acronyms.
 *
 * Input that is already an `IdentifierSqlToken` is returned as-is.
 *
 * @see getSlonikIdentifierSqlToken
 * @throws {@link Error} if an unsupported input value type is encountered at runtime
 */
export function getNormalizedSlonikIdentifierSqlToken(
  input: string | string[] | IdentifierSqlToken,
): IdentifierSqlToken {
  if (isSlonikIdentifierSqlToken(input)) {
    return input
  }

  if (isStringArray(input)) {
    return getSlonikIdentifierSqlToken(input.map(camelToSnake))
  }

  if (typeof input === 'string') {
    return getSlonikIdentifierSqlToken(camelToSnake(input))
  }

  throw new Error('getNormalizedSlonikIdentifierSqlToken: unsupported input type')
}

/**
 * Build a list of fields/columns from a zod schema for use in a slonik-powered SQL query, returned
 * as a `ListSqlToken`.
 *
 * This function will convert camelCase field names to snake_case column names per project convention to
 * support the use of snake_case within the database (per common postgres conventions) and camelCase
 * within JS/TS.
 *
 * Be mindful of corner cases with case conversions e.g. such as with acronyms.
 */
export function buildSqlColumnsList<T extends z.ZodObject<z.ZodRawShape>>(zodModelSchema: T): ListSqlToken {
  const fields: ZodObjectKeys<T>[] = Object.keys(zodModelSchema.shape).map(camelToSnake)
  const columns: IdentifierSqlToken[] = fields.map((fieldName) => sql.identifier([String(fieldName)]))

  return sql.join(columns, sql.fragment`, `)
}
