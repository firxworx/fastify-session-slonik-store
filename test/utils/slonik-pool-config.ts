import { createTypeParserPreset, type ClientConfiguration } from 'slonik'
import { sql } from '../../src/slonik/sql-tag'

export const DEFAULT_SLONIK_POOL_CONFIG: Partial<ClientConfiguration> = {
  captureStackTrace: true,
  connectionTimeout: 10000,
  idleTimeout: 10000,

  // @see reference - https://github.com/ViacomInc/openap-inventory-manager/blob/399bc6a09d7a77ecb0c17d5263e54401cc9d4e51/src/db/config.ts
  interceptors: [
    {
      // slonik may warn "unsupportedOptions":{"schema":"public"}}" (unsupported DSN parameter)
      // the default schema can be enforced via the following query which executes after each connection is established
      afterPoolConnection: async (_connectionContext, connection) => {
        // @see https://www.postgresonline.com/article_pfriendly/279.html for nuances regarding search_path
        await connection.query(sql.typeAlias('null')`
          CREATE SCHEMA IF NOT EXISTS public;
          SET search_path TO public;

          SET TIME ZONE 'UTC';
        `)

        return null
      },
    },
    // createFieldNameTransformationInterceptor({
    //   format: 'CAMEL_CASE',
    // }),
    // createResultParserInterceptor(),
    // createQueryLoggingInterceptor(),
  ],
  // @todo need to verify these ok if we don't use date + play nice with other interceptors
  typeParsers: [
    ...createTypeParserPreset(),
    {
      name: 'json',
      parse: (value: string): string => value,
    },
    // {

    // },
    // override slonik default behaviour and parse ISO timestamp and timestamptz field types to string
    // otherwise slonik converts to js timestamp (milliseconds)
    {
      name: 'timestamp',
      parse: (value: string | null): string | null => value,
    },
    {
      name: 'timestamptz',
      parse: (value: string | null): string | null => value,
    },
    // example of the default node-pg behaviour to parse timestamptz to Date
    // {
    //   name: 'timestamptz',
    //   parse: (str) => new Date(str),
    // },
  ],
}
