import { createTypeParserPreset, type ClientConfiguration } from 'slonik'
import { createFieldNameTransformationInterceptor } from 'slonik-interceptor-field-name-transformation'
import { createZodResultParserInterceptor } from './slonik-zod-result-parser-interceptor'
import { afterPoolConnectionConfig } from './slonik-after-pool-connection-schema'

/*
 * Note: slonik may warn "unsupportedOptions":{"schema":"public"}}" (unsupported DSN parameter) unless the
 * database has "public" schema created subject to various conditions. This is mitigated by creating
 * the schema if it does not exist and setting the search_path to public.
 *
 * It is recommended to always clarify the schema in any queries with postgres to avoid ambiguity.
 *
 * @see https://www.postgresonline.com/article_pfriendly/279.html for nuances regarding search_path
 */

/**
 * Minimal slonik pool config for testing.
 */
export const BASIC_SLONIK_POOL_CONFIG: Partial<ClientConfiguration> = {
  captureStackTrace: true,
  connectionTimeout: 10000,
  idleTimeout: 10000,
  maximumPoolSize: 2,
  interceptors: [
    {
      afterPoolConnection: afterPoolConnectionConfig,
    },
    // createResultParserInterceptor(),
    // createQueryLoggingInterceptor(),
    // ...etc...
  ],
}

/**
 * Minimal slonik pool config for testing using the out-of-the-box type parser presets provided by
 * `createTypeParserPreset()` exported by slonik.
 */
export const PRESET_SLONIK_POOL_CONFIG: Partial<ClientConfiguration> = {
  captureStackTrace: true,
  connectionTimeout: 10000,
  idleTimeout: 10000,
  maximumPoolSize: 2,
  interceptors: [
    {
      afterPoolConnection: afterPoolConnectionConfig,
    },
    // createResultParserInterceptor(),
    // createQueryLoggingInterceptor(),
    // ...etc...
  ],
  typeParsers: [...createTypeParserPreset()],
}

/**
 * Typical slonik pool config for testing: uses the out-of-the-box `createTypeParserPreset()` configuration
 * for type parsing with custom overrides for `json`, `timestamp`, and `timestamptz` field types to return the
 * unmodified raw value.
 *
 * @see https://github.com/gajus/slonik/blob/main/.README/USAGE.md
 */
export const COMMON_SLONIK_POOL_CONFIG: Partial<ClientConfiguration> = {
  captureStackTrace: true,
  connectionTimeout: 10000,
  idleTimeout: 10000,
  maximumPoolSize: 2,
  interceptors: [
    {
      afterPoolConnection: afterPoolConnectionConfig,
    },
  ],
  // override slonik default behaviour of parsing ISO timestamp and timestamptz field types to string
  // otherwise slonik converts to js timestamp (milliseconds)
  typeParsers: [
    ...createTypeParserPreset(),
    {
      name: 'json',
      parse: (value: string | null): string | null => value,
    },
    {
      name: 'timestamp',
      parse: (value: string | null): string | null => value,
    },
    {
      name: 'timestamptz',
      parse: (value: string | null): string | null => value,
    },
  ],
}

/**
 * Typical slonik pool config with the following features:
 *
 * - `slonik-interceptor-field-name-transformation` to convert snake_case to camelCase in query results
 * - adds result parser interceptor for automatic zod schema validation when using `sql.type(...)`
 * - out-of-the-box `createTypeParserPreset()` configuration for type parsing with an override that explicitly
 *   converts `timestamptz` field types to `Date` objects using the `Date` constructor
 *
 * @see https://github.com/gajus/slonik/blob/main/.README/USAGE.md
 */
export const TRANSFORM_SLONIK_POOL_CONFIG: Partial<ClientConfiguration> = {
  captureStackTrace: true,
  connectionTimeout: 10000,
  idleTimeout: 10000,
  maximumPoolSize: 2,
  interceptors: [
    {
      afterPoolConnection: afterPoolConnectionConfig,
    },
    createFieldNameTransformationInterceptor({
      format: 'CAMEL_CASE',
    }),
    createZodResultParserInterceptor(),
  ],
  typeParsers: [
    ...createTypeParserPreset(),
    {
      name: 'timestamptz',
      parse: (str) => new Date(str),
    },
  ],
}
