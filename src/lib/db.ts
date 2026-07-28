import { neon } from "@neondatabase/serverless";

type Sql = ReturnType<typeof neon>;
let client: Sql | null = null;

/**
 * The database handle.
 *
 * Created on first use rather than at import time: most pages are statically
 * prerendered, and the build shouldn't need a reachable database to render the
 * obituary.
 *
 * Always DATABASE_URL, which is the *pooled* endpoint. Serverless functions open
 * a connection per invocation and would exhaust Postgres without the pooler.
 * DATABASE_URL_UNPOOLED is for migrations only.
 */
export function db(): Sql {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set — see README.");
    client = neon(url);
  }
  return client;
}
