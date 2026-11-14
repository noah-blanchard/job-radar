import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** Driver-agnostic database handle (postgres-js in prod, PGlite in tests). Query builder only. */
export type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;
