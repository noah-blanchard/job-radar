# Sources

État de chaque source. Règle : aucune source n'est codée sans un vrai appel de vérification, et la réponse réelle (tronquée) est gardée comme fixture dans `packages/core/test/fixtures/`. Si un endpoint ne répond pas comme prévu, la source est désactivée avec sa raison et **aucun connecteur n'est écrit**.

Légende : 🟢 vérifiée **et** connecteur actif · ⛔ désactivée (raison) · 🚫 non supportée / exclue

Vérifications du 2026-11-13, faites avec `User-Agent: JobRadar/1.0 (+contact: …)`. L'activation est dans `config/sources.yaml`.

## Tier A : ATS publics (itèrent sur `companies`, balayage `ATS_CRON`)

| Source | Endpoint réel | Board de test | État | Notes |
|---|---|---|---|---|
| Greenhouse | `GET boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` | `stripe` (786 offres) | 🟢 M1 | ETag + **304** sur `If-None-Match`. `content` = HTML échappé en entités. Les boards EU (`job-boards.eu.greenhouse.io/{token}`) répondent sur le **même** `boards-api.greenhouse.io` (`agency` : 827 offres) ; `boards-api.eu.greenhouse.io` n'existe pas (DNS). |
| Lever | `GET api.lever.co/v0/postings/{slug}?mode=json` | `spotify`, `palantir` | 🟢 M1 | `If-None-Match` ignoré. EU : `api.eu.lever.co`, `ats_key = "eu:<slug>"`. |
| Ashby | `GET api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true` | `cohere` (121) | 🟢 M1 | ETag + **304**. |
| SmartRecruiters | `GET api.smartrecruiters.com/v1/companies/{id}/postings?limit=100&offset=N` + `/postings/{id}` | `ubisoft2` (288) | 🟢 M1 | Identifiant insensible à la casse (stocké en minuscules). |
| Workday (CXS) | `POST {tenant}.{wdN}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` + `GET …{externalPath}` | `salesforce/wd12/External_Career_Site` (1 614) | 🟢 M1 | 1 req/s par tenant. Shards **wd1/wd5 en 521 (Cloudflare)** depuis ici le 2026-11-13. |
| Workable | `GET apply.workable.com/api/v1/widget/accounts/{account}?details=true` | `huggingface` | 🟢 M2 | `details=true` ajoute la description HTML. Pas d'ETag. |
| Recruitee | `GET {slug}.recruitee.com/api/offers/` | `bunq` (23) | 🟢 M2 | Description + requirements complètes. Date `"2026-11-11 13:21:40 UTC"`. |
| Personio | `GET {slug}.jobs.personio.de/xml` | `1komma5grad` (328), `tado`, `personio` | 🟢 M2 | XML (`<workzag-jobs><position>`), descriptions en CDATA, salaire optionnel, ETag. Board vide = `<workzag-jobs/>`. |
| BambooHR | `GET {slug}.bamboohr.com/careers/list` + `/careers/{id}/detail` | `euna` (56) | 🟢 M2 | Description seulement dans le détail (récupéré pour les offres nouvelles et plausibles). Slug inconnu → 302 (traité en erreur). |
| Breezy | `GET {slug}.breezy.hr/json` | `nucleusteq` (32) | 🟢 M2 | ETag faible. Pas de description dans la liste. |
| Teamtailor | `GET {host}/jobs.rss` | `career.teamtailor.com` (21) | 🟢 M2 | RSS + `tt:locations`, `remoteStatus`. `ats_key` = l'hôte complet (pas toujours `{slug}.teamtailor.com`). |
| Pinpoint | `GET {slug}.pinpointhq.com/postings.json` | `wolve` (19), `impulsespace` (214) | 🟢 M2 | Trouvé grâce aux URLs SimplifyJobs (M1 n'avait aucun tenant). Sections HTML complètes, pas de date de publication. |
| Rippling ATS | `GET api.rippling.com/platform/api/ats/v1/board/{slug}/jobs` + `/jobs/{uuid}` | `flexai`, `patientnow` | 🟢 M2 | Liste sans description ; détail pour les offres nouvelles et plausibles. `ats.rippling.com/{slug}/jobs` redirige vers le site. |
| Oracle Recruiting Cloud | `GET {host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=findReqs;siteNumber={site},limit=200,offset=N,sortBy=POSTING_DATES_DESC` | `eeho.fa.us2` / `CX_45001` (2 856) | 🟢 M2 | `expand` obligatoire (sinon pas de liste). `ats_key = "{host}/{site}"`. Résumé court seulement. |
| Eightfold | `GET {tenant}.eightfold.ai/api/apply/v2/jobs` | `microsoft`, `qualcomm` | ⛔ | **403 « Not authorized for PCSX »** sur tous les tenants testés. |
| iCIMS, Taleo, SuccessFactors, Phenom | — | | 🚫 | Pas de JSON public stable (hors v1). |

### API carrières maison

| Entreprise | Endpoint | État | Notes |
|---|---|---|---|
| Amazon | `GET www.amazon.jobs/en/search.json?country={ISO3}&result_limit=100&offset=N&sort=recent` | 🟢 M2 | Connecteur `amazon`, `ats_key = "CAN,FRA"` : Canada (357) et France (211) récupérés **en entier**, donc la fermeture des offres est sûre. Les USA (dizaines de milliers) passent par les agrégateurs et SimplifyJobs. |
| Microsoft | `apply.careers.microsoft.com/api/apply/v2/jobs` (Eightfold) | ⛔ | 403 PCSX : couvert par les agrégateurs. |

## Tier B : agrégateurs, listes et flux (M2)

Sources sans entreprise (`needsCompany: false`) : elles **ne ferment jamais** d'offre et ne rouvrent pas une offre fermée par son ATS. Quotas journaliers dans `api_usage` (jour de Toronto), plafonnés par `*_DAILY_MAX_CALLS`.

| Source | Endpoint réel | Planif. | État | Notes |
|---|---|---|---|---|
| SimplifyJobs New-Grad-Positions | `GET raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json` | feeds | 🟢 | ETag faible + **304**. 18 798 entrées, 3 235 actives (12,9 Mo, 2 Mo gzip). Seules `active && is_visible` sont gardées. Source n° 1 de la découverte (925 boards au premier run). Pas de token envoyé (raw n'en a pas besoin). |
| vanshb03/New-Grad-2027 | `GET raw.githubusercontent.com/vanshb03/New-Grad-2027/dev/.github/scripts/listings.json` | feeds | 🟢 | Même format, 858 actives. URLs en liens courts `go.vansh.nyc` : pas de découverte d'ATS, dédup par empreinte. |
| Autres repos « New Grad 2027 » | recherche GitHub (`zapplyjobs/New-Grad-Jobs-2027`, …) | — | 🚫 | Seulement du Markdown (pas de données structurées). |
| Adzuna | `GET api.adzuna.com/v1/api/jobs/{cc}/search/{p}?app_id&app_key&results_per_page=50&max_days_old=N&sort_by=date&title_only={séniorité}&what_or={mots du domaine}` | aggregators | 🟢 | Requêtes = `ADZUNA_COUNTRIES` × séniorité (junior, graduate, new grad, entry level ; FR : junior, débutant, jeune diplômé) × domaines de `profile.yaml` (90 requêtes, page 2 si besoin). `what=new grad` seul matchait les descriptions (bruit). Quota `ADZUNA_DAILY_MAX_CALLS` (200) : 109 appels au premier run. |
| Jooble | `POST jooble.org/api/{key}` `{keywords, location, page, datecreatedfrom}` | aggregators | 🟢 | La clé ne marche que sur `jooble.org` (`ca.`/`fr.jooble.org` → 403). « Canada », « United States », « Remote » OK ; « Montreal » donne des villes US, « Paris, France » donne 0 : pas de requête France. `id` 64 bits arrondi par `JSON.parse` : identifiant lu dans le lien `/desc/{id}`. Quota `JOOBLE_DAILY_MAX_CALLS` (100) : 21 appels. |
| JSearch (RapidAPI) | `GET jsearch.p.rapidapi.com/search-v2?query=…&page=1&num_pages=1&date_posted=3days` | aggregators | 🟢 | **`/search` répond désormais 404** (« Endpoint does not exist ») ; `/search-v2` renvoie `data.jobs`. Plan gratuit : 200 requêtes/mois → `JSEARCH_DAILY_MAX_CALLS=3`. Requêtes par lieu le plus pondéré (Montréal, Toronto, Canada). Les `apply_options` alimentent la découverte. |
| Findwork | `GET findwork.dev/api/jobs/?search={séniorité}&sort_by=date` (`Authorization: Token`) | aggregators | 🟢 | 10 req/min : hôte cadencé à 6,5 s. Petit volume, surtout remote. Certaines entrées ont `role: null` (ignorées). Quota `FINDWORK_DAILY_MAX_CALLS` (50) : 4 appels. |
| France Travail Offres v2 | `POST entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire` | — | ⛔ | **`invalid_client` / « Client authentication failed »** avec les identifiants fournis (form et HTTP Basic, plusieurs scopes), le 2026-11-13. Format de requête conforme à la doc. Probablement application non abonnée à « Offres d'emploi v2 » ou secret régénéré. Aucun connecteur sans réponse réelle à vérifier : à réessayer quand le token fonctionnera. |
| The Muse | `GET www.themuse.com/api/public/jobs?…` | — | ⛔ | **404** (page Next.js), `api.themuse.com` n'existe plus (DNS) : l'API publique a disparu. |
| Careerjet | `GET public.api.careerjet.net/search?affid=…` | — | ⛔ | Exige un identifiant partenaire (`CAREERJET_AFFID` vide) et un `Referer` déclaré (403 « Undeclared referrer »). |
| Bundesagentur für Arbeit | `GET rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs` (`X-API-Key: jobboerse-jobsuche`) | — | ⛔ | **403** avec la clé publique documentée. Europe hors scope pour l'instant. |
| Guichet-Emplois / Job Bank | open.canada.ca, jeu « Job Postings Advertised on Canada's National Job Bank » | — | ⛔ | CSV **mensuels** (`frequency: P1M`) : fraîcheur > 7 jours, critère non rempli. |
| Arbeitnow | `GET www.arbeitnow.com/api/job-board-api?page=N` | feeds | 🟢 | 300 offres/page, les plus récentes d'abord ; pagination jusqu'au dernier run (3 pages max). Description HTML échappée en entités. Rate limit 50. Lien retour demandé. |
| Remotive | `GET remotive.com/api/remote-jobs?category=software-dev` | feeds | 🟢 | Offres décalées de 24 h, **4 appels/jour max** demandés (`FEEDS_CRON` = 6 h). Lien retour + mention de Remotive obligatoires. |
| Remote OK | `GET remoteok.com/api` | feeds | 🟢 | 1er élément = mentions légales (ignoré). Lien retour vers l'URL Remote OK obligatoire. |
| Himalayas | `GET himalayas.app/jobs/api/search?seniority=Entry-level&country={pays}&sort=recent&page=N` | feeds | 🟢 | Le flux complet (`/jobs/api`) contient 118 000 offres : on utilise la recherche « Entry-level » par pays du profil (Canada, France, United States), jusqu'au dernier run (5 pages max). |
| Jobicy | `GET jobicy.com/api/v2/remote-jobs?count=50&industry=engineering` | feeds | 🟢 | Crédit + lien direct demandés. |
| We Work Remotely | `GET weworkremotely.com/categories/remote-programming-jobs.rss` | feeds | 🟢 | RSS, titre « Entreprise: Poste ». ETag faible ignoré (toujours 200). |
| HN « Who is hiring? » | `GET hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring` puis `?tags=comment,story_{id}&hitsPerPage=1000` | feeds | 🟢 | Fil de novembre 2026 : 361 commentaires, 242 de premier niveau, 215 au format « Entreprise \| Poste \| Lieu ». Les liens des posts alimentent la découverte (37 boards). |
| USAJobs | — | — | 🚫 | Exclu : emplois fédéraux réservés aux citoyens US. |
| LinkedIn, Indeed, Glassdoor, Wellfound | — | — | 🚫 | Exclus : pas d'API publique autorisée, scraping interdit. |

## Découverte automatique

`packages/core/src/discovery/detectAts.ts` reconnaît 14 formats d'URL (Greenhouse dont EU et embed, Lever dont EU, Ashby, Workday `tenant/wdN/site`, SmartRecruiters, Workable, Recruitee, Personio, Breezy, BambooHR, Teamtailor, Pinpoint, Rippling, Oracle RC). Chaque URL de chaque offre (`url`, `applyUrl`, `relatedUrls`) passe par la détection pendant les runs : un board inconnu devient une entreprise `origin = 'discovered'`, sondée au balayage ATS suivant ; une entreprise connue sans ATS reçoit le board détecté.

Premier run réel (2026-11-13) : **960 entreprises découvertes** (Workday 297, Ashby 212, Greenhouse 196, Lever 65, Workable 63, SmartRecruiters 51, Oracle 38, Rippling 21, BambooHR 7, Recruitee 4, Pinpoint 3, Breezy 2, Personio 1).

Ajout manuel : `pnpm detect-ats <url-carrières>` (détection par URL, sinon sondage des API publiques ci-dessus avec le nom de domaine, sans scraping HTML), ou le formulaire de `/companies` (détection par URL seulement).

## Détection d'ATS des entreprises cibles (seed)

Méthode M1 : appels directs aux API publiques sur des variantes de slug, puis vérification du nom d'entreprise dans la réponse. M2 : la découverte a trouvé Cummins et Unity dans les URLs SimplifyJobs.

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
| Amazon | amazon (API maison) | `CAN,FRA` | ✅ M2 |
| Cummins | oracle_rc | `fa-espx-saasfaprod1.fa.ocs.oraclecloud.com/CX_1` | ✅ M2, découvert via SimplifyJobs |
| Unity | workday | `unitytech/wd1/Unity` | ⚠️ M2, découvert via SimplifyJobs ; shard wd1 en 521 |
| NVIDIA | workday | `nvidia/wd5/NVIDIAExternalCareerSite` | ⚠️ shard wd5 en 521 |
| Autodesk | workday | `autodesk/wd1/Ext` | ⚠️ shard wd1 en 521 |
| Microsoft | Eightfold | — | ⛔ 403 |
| Atlassian, Bell, NXP, Xiaomi, Shopify, EA, Mila, Coveo, Eidos, Moment Factory, LANDR, Native Instruments, Ableton | non trouvé | — | Toujours sans ATS public supporté après la découverte. Couverts par les agrégateurs ; à compléter avec `pnpm detect-ats` si un board apparaît. |
