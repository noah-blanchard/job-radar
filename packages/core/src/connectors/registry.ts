import { ashby } from "./ashby";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import { smartrecruiters } from "./smartrecruiters";
import type { Connector } from "./types";
import { workday } from "./workday";

/** Every implemented connector. Enabled/disabled state lives in config/sources.yaml. */
export const CONNECTORS: readonly Connector[] = [
  greenhouse,
  lever,
  ashby,
  smartrecruiters,
  workday,
];

const byId = new Map(CONNECTORS.map((c) => [c.id, c]));

export function getConnector(id: string): Connector | undefined {
  return byId.get(id);
}

export function listConnectors(): Connector[] {
  return [...CONNECTORS];
}
