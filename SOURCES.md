# Sources

État de chaque source. Règle : aucune source n'est codée sans un vrai appel de vérification, et la réponse réelle est gardée comme fixture de test. Si un endpoint ne répond pas comme prévu, la source est désactivée avec sa raison.

Légende : ✅ vérifiée · ⏳ à vérifier · ⛔ désactivée (raison) · 🚫 non supportée / exclue

## Tier A : ATS publics (itèrent sur `companies`)

| Source | Endpoint de départ | État | Notes |
|---|---|---|---|
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` | ⏳ | |
| Lever | `api.lever.co/v0/postings/{slug}?mode=json` (EU : `api.eu.lever.co`) | ⏳ | |
| Ashby | `api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true` | ⏳ | |
| SmartRecruiters | `api.smartrecruiters.com/v1/companies/{id}/postings` | ⏳ | |
| Workday (CXS) | `POST {tenant}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` | ⏳ | ~1 req/s par tenant |
| Workable | `apply.workable.com/api/v1/widget/accounts/{account}` | ⏳ | |
| Recruitee | `{slug}.recruitee.com/api/offers/` | ⏳ | |
| Personio | `{slug}.jobs.personio.de/xml` | ⏳ | |
| BambooHR | `{slug}.bamboohr.com/careers/list` | ⏳ | |
| Breezy | `{slug}.breezy.hr/json` | ⏳ | |
| Teamtailor | `{slug}.teamtailor.com/jobs.rss` | ⏳ | |
| Pinpoint | `{slug}.pinpointhq.com/postings.json` | ⏳ | |
| Rippling ATS | `ats.rippling.com` | ⏳ | |
| Oracle Recruiting Cloud | `…/hcmRestApi/resources/latest/recruitingCEJobRequisitions` | ⏳ | |
| Eightfold | `{tenant}.eightfold.ai/api/apply/v2/jobs` | ⏳ | |
| iCIMS | — | 🚫 | Pas de JSON public stable (hors v1) |
| Taleo | — | 🚫 | Pas de JSON public stable (hors v1) |
| SuccessFactors | — | 🚫 | Pas de JSON public stable (hors v1) |
| Phenom | — | 🚫 | Pas de JSON public stable (hors v1) |

## Tier B : agrégateurs, API gratuites et flux

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
