import { kvGet, kvSet, type AnyDb } from "@jobradar/db";
import type { ValidatorStore, Validators } from "../http/client";

/** Conditional-GET validators persisted in the `kv` table (key "etag:<cacheKey>"). */
export function kvValidatorStore(db: AnyDb): ValidatorStore {
  return {
    get: (key) => kvGet<Validators>(db, `etag:${key}`),
    set: (key, v) => kvSet(db, `etag:${key}`, v),
  };
}
