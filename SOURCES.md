# Sources

État de chaque source. Règle : aucune source n'est codée sans un vrai appel de vérification, et la réponse réelle (tronquée) est gardée comme fixture dans `packages/core/test/fixtures/`. Si un endpoint ne répond pas comme prévu, la source est désactivée avec sa raison.

Légende : ✅ vérifiée · 🟢 vérifiée **et** connecteur actif · ⏳ à vérifier · ⛔ désactivée (raison) · 🚫 non supportée / exclue

Vérifications du 2026-11-13, faites avec `User-Agent: JobRadar/1.0 (+contact: …)`.

## Tier A : ATS publics (itèrent sur `companies`)

| Source | Endpoint réel | Board de test | État | Notes |
|---|---|---|---|---|
| Greenhouse | `GET boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` | `stripe` (786 offres) | 🟢 M1 | ETag + **304** sur `If-None-Match`. `content` = HTML échappé en entités. Une seule requête par board. |
| Lever | `GET api.lever.co/v0/postings/{slug}?mode=json` | `spotify`, `palantir` | 🟢 M1 | ETag envoyé mais `If-None-Match` ignoré (toujours 200). EU : `api.eu.lever.co` (répond en JSON), `ats_key = "eu:<slug>"`. |
| Ashby | `GET api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true` | `cohere` (121) | 🟢 M1 | ETag + **304**. Adresse structurée et salaire par tier. |
| SmartRecruiters | `GET api.smartrecruiters.com/v1/companies/{id}/postings?limit=100&offset=N` + `/postings/{id}` | `ubisoft2` (288) | 🟢 M1 | Slug insensible à la casse. Description seulement dans le détail : on ne le récupère que pour les offres nouvelles dont le titre n'est pas clairement senior/stage. |
| Workday (CXS) | `POST {tenant}.{wdN}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` + `GET …{externalPath}` | `salesforce/wd12/External_Career_Site` (1 614) | 🟢 M1 | `total` seulement sur la 1re page. 1 req/s par tenant. Les shards **wd1 et wd5 répondaient 521 (Cloudflare) depuis ici** le 2026-11-13, y compris la page HTML et quel que soit le User-Agent : NVIDIA et Autodesk sont dans le seed mais en échec pour l'instant (passent `broken` après 3 échecs). |
| Workable | `GET apply.workable.com/api/v1/widget/accounts/{account}` | `huggingface` | ✅ (M2) | Pas d'ETag. Existe aussi `POST /api/v3/accounts/{a}/jobs` (paginé). |
| Recruitee | `GET {slug}.recruitee.com/api/offers/` | `bunq` | ✅ (M2) | Pas d'ETag. Description complète incluse. |
| Personio | `GET {slug}.jobs.personio.de/xml` (`.com` identique) | `personio` | ✅ (M2) | XML, ETag. |
| BambooHR | `GET {slug}.bamboohr.com/careers/list` | `seek` | ✅ (M2) | JSON. Slug inconnu → 302 vers bamboohr.com. |
| Breezy | `GET {slug}.breezy.hr/json` | `breezy` | ✅ (M2) | ETag. |
| Teamtailor | `GET {host}/jobs.rss` | `career.teamtailor.com` | ✅ (M2) | RSS, ETag. Le sous-domaine n'est pas toujours `{slug}.teamtailor.com`. |
| Rippling ATS | `GET api.rippling.com/platform/api/ats/v1/board/{slug}/jobs` | `rippling` (717) | ✅ (M2) | `ats.rippling.com/{slug}/jobs` redirige vers le site : utiliser l'API. |
| Oracle Recruiting Cloud | `GET {host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=findReqs;siteNumber={site},limit=N` | `eeho.fa.us2` / `CX_45001` | ✅ (M2) | Paginé (`offset`, `hasMore`). |
| Pinpoint | `GET {slug}.pinpointhq.com/postings.json` | — | ⛔ | Aucun tenant de test trouvé (404 sur tous les essais). À réessayer quand la découverte trouvera un board Pinpoint. |
| Eightfold | `GET {tenant}.eightfold.ai/api/apply/v2/jobs` | `microsoft`, `qualcomm` | ⛔ | **403 « Not authorized for PCSX »** sur tous les tenants testés : l'API publique n'est plus accessible. |
| iCIMS | — | | 🚫 | Pas de JSON public stable (hors v1) |
| Taleo | — | | 🚫 | Pas de JSON public stable (hors v1) |
| SuccessFactors | — | | 🚫 | Pas de JSON public stable (hors v1) |
| Phenom | — | | 🚫 | Pas de JSON public stable (hors v1) |

### API carrières maison

| Entreprise | Endpoint | État | Notes |
|---|---|---|---|
| Amazon | `GET www.amazon.jobs/en/search.json?base_query=…&country=CAN&result_limit=…&offset=…` | ✅ (M2) | JSON public avec description, lieu, date. |
| Microsoft | `apply.careers.microsoft.com/api/apply/v2/jobs` (Eightfold) | ⛔ | 403 PCSX : couvert par les agrégateurs. |

## Tier B : agrégateurs, API gratuites et flux (M2)

| Source | Accès | État | Notes |
|---|---|---|---|
| SimplifyJobs New-Grad-Positions | GitHub raw JSON | ⏳ | Source new grad prioritaire, ETag |
| Autres repos new grad 2027 | GitHub | ⏳ | |
| Adzuna | clé (`ADZUNA_APP_ID/KEY`) | ⏳ | quota `ADZUNA_DAILY_MAX_CALLS` |
| Jooble | clé (`JOOBLE_KEY`) | ⏳ | quota `JOOBLE_DAILY_MAX_CALLS` |
| Careerjet | `CAREERJET_AFFID` | ⏳ | |
| France Travail Offres v2 | OAuth client_credentials | ⏳ | `FT_CLIENT_SECRET` manquant dans le `.env` actuel |
| Bundesagentur für Arbeit | `X-API-Key` | ⏳ | désactivé par défaut |
| The Muse | public | ⏳ | |
| Findwork.dev | clé (`FINDWORK_KEY`) | ⏳ | |
| Arbeitnow | public | ⏳ | |
| Remotive | public | ⏳ | |
| RemoteOK | public | ⏳ | conditions d'attribution à respecter |
| Himalayas | public | ⏳ | |
| Jobicy | public | ⏳ | |
| We Work Remotely | RSS | ⏳ | |
| HN « Who is hiring? » | Algolia HN API | ⏳ | |
| JSearch (RapidAPI) | `RAPIDAPI_KEY` | ⏳ | 1 à 3 req/jour max |
| Guichet-Emplois / Job Bank | données ouvertes | ⏳ | seulement si fraîcheur ≤ 7 j |
| USAJobs | — | 🚫 | Exclu : emplois fédéraux réservés aux citoyens US |
| LinkedIn, Indeed, Glassdoor, Wellfound | — | 🚫 | Exclus : pas d'API publique autorisée, scraping interdit |

## Détection d'ATS des entreprises cibles (seed)

Méthode : appels directs aux API publiques (greenhouse, lever, lever EU, ashby, smartrecruiters, workable, recruitee, breezy, bamboohr, personio, teamtailor) sur des variantes de slug, puis vérification du nom d'entreprise dans la réponse. Pas de scraping HTML.

| Entreprise | ATS | Clé | Statut |
|---|---|---|---|
| Stripe | greenhouse | `stripe` | ✅ 786 offres |
| Databricks | greenhouse | `databricks` | ✅ 896 |
| DoorDash | greenhouse | `doordashusa` | ✅ 428 |
| Akuna Capital | greenhouse | `akunacapital` | ✅ 31 |
| Splice | greenhouse | `splice` | ✅ 4 (le compte SmartRecruiters `splice` est une autre entreprise) |
| Spotify | lever | `spotify` | ✅ 85 |
| Behaviour Interactive | lever | `bhvr` | ✅ 25 |
| Cohere | ashby | `cohere` | ✅ 121 |
| Lightspeed | ashby | `lightspeedhq` | ✅ 134 (`lightspeed` = une autre entreprise, robotique) |
| Wealthsimple | ashby | `wealthsimple` | ✅ 41 |
| ServiceNow (+ ex-Element AI) | smartrecruiters | `servicenow` | ✅ 820 |
| Ubisoft (Montréal) | smartrecruiters | `ubisoft2` | ✅ 288, tous studios |
| Genetec | smartrecruiters | `genetec` | ⚠️ 1 offre (Sherbrooke) : à confirmer |
| NVIDIA | workday | `nvidia/wd5/NVIDIAExternalCareerSite` | ⚠️ shard wd5 en 521 |
| Autodesk | workday | `autodesk/wd1/Ext` | ⚠️ shard wd1 en 521 |
| Amazon | API maison | — | M2 |
| Microsoft | Eightfold | — | ⛔ 403 |
| Atlassian, Bell, NXP, Cummins, Xiaomi, Shopify, EA, Unity, Mila, Coveo, Eidos, Moment Factory, LANDR, Native Instruments, Ableton | non trouvé | — | Faux positifs écartés : workable `bce` = Bachmann Chemical, bamboohr `ea` = autre entreprise, smartrecruiters `xiaomi` = compte non officiel. À compléter via `detect-ats` (M2) ou couvert par les agrégateurs. |
