import { IdentifierToken } from 'slonik/dist/tokens' // exported as an `as const` value
import { z } from 'zod'

/**
 * Zod schema for a tuple of two strings.
 * In the context of slonik the first item is a schema name and the second is a table name.
 */
export const zTableIdentifier = z.tuple([z.string(), z.string()])

/**
 * Zod schema for an `IdentifierSqlToken`, the return type of slonik's `sql.identifier()`.
 */
export const zSlonikIdentifierSqlToken = z.object({
  names: z.array(z.string()),
  type: z.literal(IdentifierToken),
})
