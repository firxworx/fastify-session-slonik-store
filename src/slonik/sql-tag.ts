import { createSqlTag } from 'slonik'
import { z } from 'zod'

/**
 * Add common type aliases to the default `sql` tag exported by slonik.
 */
export const sql = createSqlTag({
  typeAliases: {
    id: z.object({
      id: z.number(),
    }),
    count: z.object({
      count: z.number(),
    }),
    null: z.null(),
    void: z.void(),
  },
})
