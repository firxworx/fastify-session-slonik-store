# FastifySession PrismaStore

<!-- markdownlint-disable MD033 -->
<p align="center">
  <a href="https://www.npmjs.com/package/@firx/fastify-session-slonik-store">
    <img src="https://img.shields.io/npm/v/@firx/fastify-session-slonik-store.svg?style=for-the-badge" alt="npm version" />
  </a>
  <a href="https://www.npmjs.com/package/@firx/fastify-session-slonik-store">
    <img src="https://img.shields.io/npm/dt/@firx/fastify-session-slonik-store.svg?style=for-the-badge" alt="npm total downloads" />
  </a>
  <a href="https://www.npmjs.com/package/@firx/fastify-session-slonik-store">
    <img src="https://img.shields.io/npm/dm/@firx/fastify-session-slonik-store.svg?style=for-the-badge" alt="npm monthly downloads" />
  </a>
  <a href="https://www.npmjs.com/package/@firx/fastify-session-slonik-store">
    <img src="https://img.shields.io/npm/l/@firx/fastify-session-slonik-store.svg?style=for-the-badge" alt="npm license" />
  </a>
  <br />
  <a href="https://github.com/mgcrea/fastify-session-prisma-store/actions/workflows/main.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/mgcrea/fastify-session-prisma-store/main.yml?style=for-the-badge&branch=master" alt="build status" />
  </a>
  <a href="https://depfu.com/github/mgcrea/fastify-session-prisma-store">
    <img src="https://img.shields.io/depfu/dependencies/github/mgcrea/fastify-session-prisma-store?style=for-the-badge" alt="dependencies status" />
  </a>
</p>
<!-- markdownlint-enable MD037 -->

## Introduction

[Slonik](https://github.com/gajus/slonik) session store for [fastify](https://github.com/fastify/fastify) and [@mgcrea/fastify-session](https://github.com/mgcrea/fastify-session).

Slonik is a stable and battle-proven postgres client that provides runtime and build-time type safety with minimal overhead and first-class support for zod via a _result parser interceptor_.

This session store accepts your app's slonik `DatabasePool` as a configuration value. It is tested to work with different variations of slonik `ClientConfiguration` properties including:

- default (out-of-the-box) configuration with no _interceptors_ or _type parsers_ defined
- _type parser_ configuration that may or may not parse `timestamptz` to `Date` or `string`
- with and without a field name transformation _interceptor_ that renames lower snake_case (postgres convention) field names to camelCase (js convention) in query results
- with and without a result parser _interceptor_ that parses query results vs. a zod schema when queried with `sql.type(...)`

### Requires

- [@mgcrea/fastify-session](https://github.com/mgcrea/fastify-session) to handle sessions
- [@fastify/cookie](https://github.com/fastify/fastify-cookie) for cookie parsing and serialization
- [slonik](https://github.com/gajus/slonik) for postgres connectivity and query execution

### Details:

Written in [TypeScript](https://www.typescriptlang.org/) for static type checking and types exported along with the library.

Built by [tsup](https://tsup.egoist.dev) to provide both CommonJS and ESM packages.

This repo was based off `@mgcrea/fastify-session-prisma-store` to contribute a similar codebase to the ecosystem with compatible dependencies vs. `@mgcrea/fastify-session` and `@mgcrea/fastify-session-prisma-store`.

## Architectural Considerations

Postgres offers a compelling choice for session storage in many scenarios including many types of line-of-business applications. This is especially true if an application already depends on postgres.

Advantages can include:

- sessions provide various security and capability benefits when combined with modern security practices
- leveraging an existing dependency (postgres) can reduce complexity of an application and its infrastructure for better maintainability and simplified deployments
- eliminating the need for an additional service for session storage can help reduce hosting/infrastructure costs

Ensure that your current architecture and infrastructure is ready to support postgres as a session store and that this option can meet the performance and load/capacity needs of your project.

In high-volume production applications and/or situations where a performance or latency requirement is emphasized, solutions such as redis, stateless sessions (e.g. JWT), or encrypted cookie sessions may be superior options vs. postgres depending on your specific requirements.

That said, certain performance concerns related to using postgres can be addressed by using a caching proxy or caching layer for session data. It can also be important to ensure that your database and application servers are located in the same datacenter or region to minimize latency of any queries.

Always use SSL/TLS to encrypt all network traffic between your application server and your database server in production environments or in any environment where sensitive data is being transmitted.

## Installation & Configuration

### Package Installation

Add fastify-session and fastify-session-slonik-store to your fastify + slonik project:

```bash
pnpm add @fastify/cookie @mgcrea/fastify-session @firx/fastify-session-slonik-store

# or with npm
npm install @fastify/cookie @mgcrea/fastify-session @firx/fastify-session-slonik-store
```

If you do not have slonik configured in your project refer to https://github.com/gajus/slonik to get started.
You can reference the test/utils of this repo for examples of how to configure a slonik `DatabasePool`.

### Schema Customization & Deployment

fastify-session-slonik-store requires a table to store session data in your postgres database.

#### Reference Schema

Refer to `database/schema.sql` for a reference table schema that is compatible with this library.
The table schema depends on a postgres function `trigger_set_timestamp` defined in `database/functions.sql`.

This schema can be customized to suit your project requirements.

The schema based off the prisma schema from `@mgcrea/fastify-session-prisma-store` and has a few modifications including minor changes to column names and types.

Notably the `expires_at` column is now a `timestamp with time zone` (`timestamptz`) type instead of a `timestamp without time zone` (`timestamp`) to help ensure that the session expiration time is not affected by the server's time.

It is a best-practice and _highly recommended_ to _always_ use UTC for all development environments, postgres clients, application servers, and database servers to avoid a world of potential issues with timezones.

#### Customizing the Reference Schema

The reference schema creates the session table in the `public` schema: `public.session`. 

You can modify the table schema name and/or rename the table to suit the needs of your project.

The fastify-session-slonik-store constructor accepts a `tableIdentifier` property where you can specify a custom name. It can be a slonik `IdentifierSqlToken` (the return type of `sql.identifier(['schemaName', 'tableName'])`), a tuple (`[schemaName, tableName]`), or a string table name.

Providing a table identifier that includes the schema name is recommended to avoid potential ambiguity and avoid potential issues with the postgres `search_path` configuration.

The following columns are required by the schema:

- `id` - identity column (primary key)
- `sid` - session id
- `expires_at` - session expiration time
- `data` - jsonb column to store session data

Indexes should exist for the `sid` and `expires_at` columns.

The `created_at` and `updated_at` columns are highly recommended.

The reference schema includes an update trigger to set the `updated_at` column. The trigger calls the postgres function `trigger_set_timestamp` defined in `database/functions.sql`.

If you are working with an existing postgres database you may already have a function that provides "updated at"/"modified at" functionality. In that case you can update the trigger to call your function instead and skip running the `database/functions.sql` query on your database.

#### Adding the Session Table to Your Database

Use a CLI or GUI tool to execute the `functions.sql` (if required) and `schema.sql` scripts to your project's database.

## Quickstart

Start by ensuring that you have added a session table to your database.

### Define your Session Data

The following example assumes your project has a zod schema that describes your user session data object. Session data commonly includes properties such as `email`, `role`, etc.

If you do not use zod, at least ensure you define a TypeScript interface or type that describes your session data object.

To provide a hypothetical example of `./your/project/schemas/user-session-data.ts`:

```ts
export interface UserSessionData extends JsonObject, z.infer<typeof zUserSessionData> {}

export const zUserSessionData = z.object({
  id: z.number().int().positive(),
  uid: z.string(),
  name: z.string().nonempty(),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum([ 'user', 'admin' ]),
  isVerified: z.boolean(),
  isActive: z.boolean(),
})
```

Note that `fastify-session` requires that your session data be JSON serializable. This means that you cannot use `Date` objects or other non-JSON serializable types in your session data.

If you require a `Date` object store it as a string (e.g. ISO timestamp) or number (e.g. JS timestamp) and parse it back to a `Date` when you retrieve it. Alternately you can represent data stored as fields such as `email_verified_at` as booleans (e.g. as `isEmailVerified`) to implement your business logic.

If your user session data interface (or type) extends `JsonObject` like the above example then TypeScript will enforce that your session data object is JSON serializable.

If you use the eslint rule `@typescript-eslint/no-empty-interface` you may need to add a `ts-expect-error` comment to avoid the lint error or alternately define the shape of your session data as a TypeScript type vs. interface.

### Configure fastify-session with fastify-session-slonik-store

With an interface defined that describes your session data you can now use it in your fastify project.

Take note of the inline comments in the example below to help you get started:

```ts
import createFastify, { type FastifyInstance, type FastifyServerOptions } from "fastify"
import fastifyCookie from "@fastify/cookie"
import SlonikPgSessionStore from "@firx/fastify-session-slonik-store"
import type { JsonObject } from "@firx/fastify-session-slonik-store"
import fastifySession from "@mgcrea/fastify-session"
import type { DatabasePool } from 'slonik'

// import the interface or type that describes your project's session data
import type { UserSessionData } from './your/project/schemas/user-session-data.ts'

// use typescript declaration merging to add a user property to fastify-session's SessionData interface
// the user object is a common example: you can add whatever properties you like to the session data object
declare module '@mgcrea/fastify-session' {
  interface SessionData {
    user: UserSessionData | undefined
  }
}

const SESSION_TTL = 864e3; // 1 day in seconds

// assume a function that returns your project's environment variables in an object
const ENV = getEnv()

export const buildFastify = (options?: FastifyServerOptions): FastifyInstance => {
  const fastify = createFastify(options)

  // assumes you have decorated your fastify instance with a slonik `DatabasePool` instance named 'slonik'
  // regardless of how you do it you must provide a slonik `DatabasePool` to fastify-session-slonik-store
  const pool: DatabasePool = fastify.slonik

  // you may wish to provide additional configuration options to @fastify/cookie (refer to its documentation)
  fastify.register(fastifyCookie)

  fastify.register(fastifySession, {
    // the name of the session cookie is customizable
    cookieName: 'session',

    // provide a secret (from which a key is derived from) or `key` value as a min 32-byte base-64 encoded string
    secret: 'secret with minimum length of 32 characters',

    // customize this per your project requirement (`false` will only store authenticated sessions)
    // `false` can also help meet EU GDPR privacy requirements and will save on storage space 
    saveUninitialized: false,

    // configure fastify-session-slonik-store
    store: new SlonikPgSessionStore<{ user: UserSessionData }>({
      pool,
      tableIdentifier: ['public', 'session'],
      ttlSeconds: SESSION_TTL,
    }),

    // it is recommended to lock down your cookie settings including with `secure`, `sameSite`, and `httpOnly`
    cookie: {
      domain: ENV.COOKIE_DOMAIN || undefined,
      secure: ENV.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: ENV.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: SESSION_TTL,
    },
  })

  return fastify;
}
```

### CORS

Your API may require a CORS configuration that includes `credentials: true` to allow users' browsers to send cookies with cross-origin requests.

Refer to the documentation for `@fastify/cors` to set up CORS in your project.

### Additional Security

Ensure that you use SSL/TLS in production environments or in any environment where sensitive data is being transmitted.

Consider adding the `@mgcrea/fastify-session-sodium-crypto` package to sign or encrypt your session data.

### Client-Side Implications of HTTP-Only Cookies

Using an `httpOnly` cookie is a recommended security practice to help mitigate the risk of XSS attacks.

Users' browsers will automatically send the cookie along with any requests it makes to your API subject to the cookie's `domain`, `path`, etc. properties.

An HTTP-Only cookie cannot be accessed by client-side JavaScript. If JavaScript can't read a value like a session ID or access token then it can't be used by an attacker to steal or hijack it either.

Commonly-seen yet naive approaches to authentication such as reading and storing a session ID in `localStorage` or `sessionStorage` to then add to requests are not possible when using an `httpOnly` cookie.

To provide user/session data to your client side code you can use server-side rendering techniques and/or employ a technique such as an `/auth/session` endpoint that returns either an authenticated user's session data or an error.

In a pure client-side contexts such as an SPA like a React app, you can "ping" a session endpoint with a request when the app loads. You can also optionally "ping" it on a regular interval as long as the last response was successful.

If a user is authenticated your API can respond with success and return session/profile data in the response body. If a user is not authenticated then your API can respond with an error and return a 401 status code. Your client application can then handle each case and render the appropriate UI.

Your front-end app should not need to know the session ID or any secret values. It only needs to know if the user is authenticated or not.

## Authors

- [Kevin Firko](https://github.com/firxworx) <hello@firxworx.com>

## Acknowledgements

- [Olivier Louvignes](https://github.com/mgcrea) <olivier@mgcrea.io> for his work on fastify-session and his other contributions to the fastify ecosystem

## License

```txt
The MIT License

Copyright (c) 2023 Kevin Firko <hello@firxworx.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
