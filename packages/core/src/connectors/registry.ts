import type { Connector } from "./types";

/** All known connectors, keyed by id. Populated from M1 on. */
const connectors = new Map<string, Connector>();

export function registerConnector(c: Connector): void {
  if (connectors.has(c.id)) throw new Error(`Connector already registered: ${c.id}`);
  connectors.set(c.id, c);
}

export function getConnector(id: string): Connector | undefined {
  return connectors.get(id);
}

export function listConnectors(): Connector[] {
  return [...connectors.values()];
}
