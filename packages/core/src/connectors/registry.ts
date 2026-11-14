import { adzuna } from "./adzuna";
import { amazon } from "./amazon";
import { ashby } from "./ashby";
import { bamboohr } from "./bamboohr";
import { breezy } from "./breezy";
import { arbeitnow, himalayas, jobicy, remoteok, remotive, weworkremotely } from "./feeds";
import { findwork } from "./findwork";
import { githubSimplifyNewgrad, githubVanshNewgrad } from "./github";
import { greenhouse } from "./greenhouse";
import { hnWhoIsHiring } from "./hn";
import { jooble } from "./jooble";
import { jsearch } from "./jsearch";
import { lever } from "./lever";
import { oracleRc } from "./oracle";
import { personio } from "./personio";
import { pinpoint } from "./pinpoint";
import { recruitee } from "./recruitee";
import { rippling } from "./rippling";
import { smartrecruiters } from "./smartrecruiters";
import { teamtailor } from "./teamtailor";
import type { Connector } from "./types";
import { workable } from "./workable";
import { workday } from "./workday";

/** Every implemented connector. Enabled/disabled state lives in config/sources.yaml. */
export const CONNECTORS: readonly Connector[] = [
  // Tier A: ATS (iterate over companies)
  greenhouse,
  lever,
  ashby,
  smartrecruiters,
  workday,
  workable,
  recruitee,
  personio,
  bamboohr,
  breezy,
  teamtailor,
  pinpoint,
  rippling,
  oracleRc,
  amazon,
  // Tier B: keyword aggregators (daily quota)
  adzuna,
  jooble,
  jsearch,
  findwork,
  // Tier B: lists and feeds
  githubSimplifyNewgrad,
  githubVanshNewgrad,
  arbeitnow,
  remotive,
  remoteok,
  himalayas,
  jobicy,
  weworkremotely,
  hnWhoIsHiring,
];

const byId = new Map(CONNECTORS.map((c) => [c.id, c]));

export function getConnector(id: string): Connector | undefined {
  return byId.get(id);
}

export function listConnectors(): Connector[] {
  return [...CONNECTORS];
}
