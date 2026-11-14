import type { Locale } from "../config";
import type { Params, Paths, Widen } from "../translate";
import { en } from "./en";
import { fr } from "./fr";

/** What every language must provide: the shape of the French reference dictionary. */
export type Messages = Widen<typeof fr>;
/** Every message key ("inbox.empty", "status.saved"). */
export type MessageKey = Paths<Messages>;
export type T = (key: MessageKey, params?: Params) => string;

/** One dictionary per registered language: a missing one is a type error. */
export const MESSAGES: Record<Locale, Messages> = { fr, en };
