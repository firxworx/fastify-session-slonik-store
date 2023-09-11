import { type Interceptor, type QueryResultRow, SchemaValidationError, SerializableValue } from 'slonik'

/**
 * Return a slonik result parser interceptor that uses Zod to parse query results.
 *
 * This is a typical use-case for slonik: it was originally the default behaviour of slonik when zod parsing was
 * introduced. This was rolled back as a default behaviour as not all users required zod by default.
 *
 * However zod support is a premiere feature of slonik and is extremely common in a typical slonik-powered
 * application.
 *
 * @see https://github.com/gajus/slonik#result-parser-interceptor
 * @see https://github.com/gajus/slonik/issues/499#issuecomment-1714136993 to explain the `as` casts to fix types
 */
export const createZodResultParserInterceptor = (): Interceptor => {
  return {
    // If you are not going to transform results using Zod then you should use `afterQueryExecution` instead.
    //
    // Future versions of Zod will reportedly provide a more efficient parser when parsing without transformations.
    //
    // You can even combine the two – use `afterQueryExecution` to validate results and (conditionally) transform
    // results as needed in `transformRow`.
    transformRow: (executionContext, actualQuery, row) => {
      const { log: _log, resultParser } = executionContext

      if (!resultParser) {
        return row
      }

      const validationResult = resultParser.safeParse(row)

      if (!validationResult.success) {
        throw new SchemaValidationError(actualQuery, row as SerializableValue, validationResult.error.issues)
      }

      return validationResult.data as QueryResultRow
    },
  }
}
