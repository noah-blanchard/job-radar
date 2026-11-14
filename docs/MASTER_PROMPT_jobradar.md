# Master Prompt : JobRadar (agrégateur d'offres new grad 2027, auto-hébergé sur Dokploy)

> À coller tel quel dans Claude Code à la racine d'un repo vide. Commence en **plan mode**.

---

## 0. Rôle et façon de travailler

Tu es le lead engineer de **JobRadar**, un outil perso mono-utilisateur. Tu travailles par jalons (section 11). Pour chaque jalon :

- Annonce le plan court, puis implémente.
- Ne déclare un jalon terminé que si ses **critères d'acceptation** passent (tests verts, `docker compose up` OK, vérification manuelle décrite).
- Un commit par sous-étape logique, messages conventionnels (`feat(connectors): greenhouse`).
- **N'invente jamais un endpoint.** Chaque source est vérifiée par un vrai appel (`curl`) avant d'écrire son connecteur. La réponse réelle est enregistrée comme fixture de test. Si un endpoint ne répond pas comme prévu : connecteur `enabled: false`, raison notée dans `SOURCES.md`, et tu passes à la suite.
- Ne me pose des questions que pour : secrets/clés API, choix irréversibles. Pour le reste, prends l'option la plus simple et note-la dans `DECISIONS.md`.

## 1. Objectif

Collecter en continu **toutes les offres accessibles gratuitement via API publique ou flux officiel** (JSON, XML, RSS), les normaliser, dédupliquer, scorer pour mon profil new grad, et :

1. **Phase 1 (ce prompt)** : dashboard tout-en-un + alertes quotidiennes.
2. **Phase 2 (plus tard, hors scope)** : bouton « Générer CV.tex » par offre. Prévois juste l'emplacement (route `/jobs/[id]` avec zone d'actions) sans l'implémenter.

Chine : **hors scope pour l'instant**. L'architecture de connecteurs doit permettre de l'ajouter plus tard sans refactor.

## 2. Contraintes non négociables

- Uniquement des sources **publiques et autorisées** : API officielles, endpoints JSON publics des ATS utilisés par les pages carrières, RSS/XML. **Pas** de scraping HTML, pas de navigateur headless, pas de contournement d'anti-bot, pas de LinkedIn/Indeed/Glassdoor/Wellfound.
- Politesse réseau : `User-Agent: JobRadar/1.0 (+contact: $CONTACT_EMAIL)`, concurrence limitée par hôte, retry exponentiel avec jitter sur 429/5xx, respect de `Retry-After`, `ETag`/`If-Modified-Since` quand dispo.
- Quotas des API à clé suivis en base (table `api_usage`) : un connecteur n'excède jamais son quota journalier/mensuel configuré.
- Aucun secret dans le repo. `.env.example` exhaustif et commenté.
- Tout doit tourner sans clé API Anthropic. Le LLM est une **option** (`LLM_ENABLED=false` par défaut).
- Fuseau : `America/Toronto` partout (cron, affichage, digests).

## 3. Stack (imposée)

- **Monorepo TypeScript**, pnpm workspaces, Node 22, TS strict.
  - `apps/web` : Next.js (App Router), Tailwind, shadcn/ui, TanStack Table, server actions pour les mutations.
  - `apps/worker` : process Node long-vivant, scheduler `croner`, `undici` pour HTTP, `p-limit` par hôte.
  - `packages/db` : Drizzle ORM + migrations, Postgres 16.
  - `packages/core` : connecteurs, normalisation, dédup, classification, scoring, alertes.
- Validation des réponses API avec **zod** (un schéma par source). Une réponse invalide = erreur loggée, pas un crash.
- Tests : Vitest. Les tests n'appellent **jamais** le réseau (fixtures enregistrées).
- Logs JSON structurés (pino).

## 4. Arborescence attendue

```
jobradar/
  apps/web/            # dashboard
  apps/worker/         # scheduler + runs
  packages/core/
    src/connectors/    # un fichier par source + registry.ts
    src/normalize/
    src/classify/
    src/score/
    src/alerts/
    src/discovery/     # détection d'ATS depuis URLs
  packages/db/
  config/
    profile.yaml       # mon profil de matching
    companies.seed.yaml
    sources.yaml       # activation, quotas, fréquences
  docker-compose.yml
  .env.example
  SOURCES.md           # tableau d'état de chaque source (vérifiée / désactivée + raison)
  DECISIONS.md
  README.md            # runbook déploiement Dokploy
```

## 5. Interface de connecteur

```ts
interface Connector {
  id: string;                         // "greenhouse", "adzuna", ...
  kind: "ats" | "aggregator" | "feed";
  needsCompany: boolean;              // true pour les ATS (itère sur companies)
  fetch(ctx: FetchCtx, company?: Company): AsyncIterable<RawJob>;
}
```

- `FetchCtx` fournit : client HTTP poli, compteur de quota, logger, `since` (dernier run OK).
- Chaque run crée une ligne `source_runs` (source, company, début, fin, status, nb_fetched, nb_new, erreur).
- Un connecteur qui échoue 3 runs d'affilée pour une entreprise : `companies.ats_status = 'broken'` + alerte santé.

## 6. Sources à implémenter (vérifier chacune avant de coder)

Les URLs ci-dessous sont des points de départ. **Vérifie le format réel** et ajuste. Marqué *(à vérifier)* = incertain, désactive si ça ne marche pas.

### Tier A : ATS publics sans clé (itèrent sur la table `companies`)

| Source | Endpoint |
|---|---|
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` |
| Lever | `GET https://api.lever.co/v0/postings/{slug}?mode=json` (EU : `api.eu.lever.co`) |
| Ashby | `GET https://api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true` |
| SmartRecruiters | `GET https://api.smartrecruiters.com/v1/companies/{id}/postings?limit=100&offset=N` + détail `/postings/{postingId}` |
| Workday (CXS) | `POST https://{tenant}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` body `{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}` ; détail `GET .../job/{externalPath}`. Paginer, limiter à ~1 req/s par tenant. |
| Workable | `apply.workable.com/api/v1/widget/accounts/{account}` *(à vérifier)* |
| Recruitee | `GET https://{slug}.recruitee.com/api/offers/` |
| Personio | `GET https://{slug}.jobs.personio.de/xml` (ou `.com`) |
| BambooHR | `GET https://{slug}.bamboohr.com/careers/list` *(à vérifier)* |
| Breezy | `GET https://{slug}.breezy.hr/json` |
| Teamtailor | RSS `https://{slug}.teamtailor.com/jobs.rss` *(à vérifier)* |
| Pinpoint | `GET https://{slug}.pinpointhq.com/postings.json` *(à vérifier)* |
| Rippling ATS | `ats.rippling.com` board API *(à vérifier)* |
| Oracle Recruiting Cloud | `.../hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&finder=findReqs;siteNumber={site}` *(à vérifier)* |
| Eightfold | `GET https://{tenant}.eightfold.ai/api/apply/v2/jobs?domain={domain}&start=0&num=10` *(à vérifier)* |

Hors v1 (pas de JSON public stable) : iCIMS, Taleo, SuccessFactors, Phenom. Liste-les dans `SOURCES.md` comme « non supporté ».

### Tier B : agrégateurs et API gratuites (requêtes par mots-clés/lieux)

| Source | Accès | Usage |
|---|---|---|
| **SimplifyJobs New-Grad-Positions** (GitHub) | JSON du repo (`listings.json`, chemin à vérifier) | Source prioritaire new grad + seed d'entreprises. Lire via raw.githubusercontent, ETag. |
| Autres repos new grad 2027 (GitHub) | Cherche les repos actifs « New Grad 2027 » avec données structurées | Idem, si format exploitable |
| **Adzuna** | clé gratuite (`ADZUNA_APP_ID/KEY`), pays `ca`, `us`, `gb`, `fr`… | Requêtes ciblées new grad × villes, `max_days_old=2` |
| **Jooble** | clé gratuite sur demande (`JOOBLE_KEY`), `POST https://jooble.org/api/{key}` | Idem |
| Careerjet | API partenaire gratuite (`CAREERJET_AFFID`) *(à vérifier)* | Idem |
| **France Travail** « Offres d'emploi v2 » | gratuit, OAuth client_credentials (`FT_CLIENT_ID/SECRET`) | France (je suis français, pertinent) |
| Bundesagentur für Arbeit Jobsuche | API publique, header `X-API-Key` *(à vérifier)* | Désactivé par défaut (Europe plus tard) |
| The Muse | `GET https://www.themuse.com/api/public/jobs?level=Entry%20Level&page=N` | Entry level |
| Findwork.dev | clé gratuite (`FINDWORK_KEY`) | Tech |
| Arbeitnow | `GET https://www.arbeitnow.com/api/job-board-api` | Europe/remote |
| Remotive | `GET https://remotive.com/api/remote-jobs?category=software-dev` | Remote |
| RemoteOK | `GET https://remoteok.com/api` | Remote (respecter leurs conditions d'attribution) |
| Himalayas | `GET https://himalayas.app/jobs/api` | Remote |
| Jobicy | `GET https://jobicy.com/api/v2/remote-jobs` | Remote |
| We Work Remotely | RSS | Remote |
| HN « Who is hiring? » | API Algolia HN (`hn.algolia.com/api/v1`), thread mensuel de `whoishiring` | Commentaires parsés : entreprise, lieu, remote, URL |
| JSearch (RapidAPI) | free tier très limité (`RAPIDAPI_KEY`) | 1 à 3 requêtes/jour max, requêtes à fort rendement (« new grad software engineer Canada ») |
| Guichet-Emplois / Job Bank Canada | données ouvertes *(à vérifier : y a-t-il un flux exploitable et frais ?)* | Activer seulement si fraîcheur ≤ 7 j |

Exclus volontairement : USAJobs (emplois fédéraux réservés aux citoyens US). Note-le dans `SOURCES.md`.

### Découverte automatique (effet boule de neige)

- `discovery/detectAts(url)` : regex sur toutes les URLs vues (Tier B, repos GitHub, seed) pour reconnaître `boards.greenhouse.io/{token}`, `job-boards.greenhouse.io/{token}`, `jobs.lever.co/{slug}`, `jobs.ashbyhq.com/{org}`, `*.myworkdayjobs.com/...`, `jobs.smartrecruiters.com/{id}`, `apply.workable.com/{account}`, `*.recruitee.com`, `*.jobs.personio.*`, `*.breezy.hr`, etc.
- Toute entreprise découverte est insérée dans `companies` (`origin='discovered'`) puis sondée au run ATS suivant.
- Script `pnpm detect-ats <careers-url>` pour ajouter une entreprise à la main.

### Seed initial (`config/companies.seed.yaml`)

- Mes cibles prioritaires (détecte leur ATS toi-même, ne suppose rien) : Atlassian, Bell, Stripe, Databricks, DoorDash, NVIDIA, Amazon, Microsoft, Akuna Capital, NXP, Cummins, Xiaomi (bureaux hors Chine), Shopify, Ubisoft Montréal, EA, Unity, Autodesk, Cohere, Mila, ServiceNow, Coveo, Lightspeed, Wealthsimple, Element AI/ServiceNow, Genetec, Behaviour Interactive, Eidos, Moment Factory, LANDR, Native Instruments, Ableton, Spotify, Splice.
- Puis toutes les entreprises extraites des repos new grad GitHub.
- Amazon et Microsoft ont des APIs de recherche maison : vérifie s'il existe un endpoint JSON public de leur page carrières ; sinon, couvre-les via les agrégateurs.

## 7. Modèle de données (Postgres)

- `companies` (id, name, ats, ats_key, careers_url, origin, priority, ats_status, last_ok_at)
- `jobs` (id, fingerprint UNIQUE, source, source_job_id, company_id, title, location_raw, city, region, country, remote ENUM(onsite,hybrid,remote,unknown), employment_type, seniority, is_new_grad BOOL, is_new_grad_reason, salary_min, salary_max, salary_currency, posted_at, first_seen_at, last_seen_at, closed_at, url, apply_url, description_html, description_text, lang, score, score_breakdown JSONB, tsv tsvector)
- `job_sources` (job_id, source, source_job_id, url) : une offre vue sur plusieurs sources = une ligne `jobs`, plusieurs `job_sources`
- `job_status` (job_id, status ENUM(new,saved,applied,interview,rejected,ignored), notes, updated_at)
- `source_runs`, `api_usage`, `alerts_sent` (job_id, channel, kind, sent_at) pour ne jamais alerter deux fois
- Index GIN sur `tsv`, index sur `(first_seen_at desc)`, `(score desc)`, `country`.

Règles :
- `fingerprint` = hash de `(company normalisé, titre normalisé, ville normalisée)` ; URL canonique en clé secondaire.
- `first_seen_at` est la vérité pour « nouvelle offre ». `posted_at` est indicatif.
- Offre absente de sa source ATS pendant 2 runs complets : `closed_at = now()`.
- Normalisation des lieux : parser « Montréal, QC », « Montreal, Quebec, Canada », « Remote - Canada », etc. vers `city/region/country`. Table d'alias maison (pas d'API de géocodage payante).

## 8. Classification et scoring

### Filtre new grad (règles d'abord)

- Positif titre : `new grad|new graduate|university grad|graduate (program|engineer|developer)|entry[- ]level|junior|early career|campus|class of 2027|2027|jeune diplômé|débutant|nouveau diplômé`.
- Négatif titre : `senior|sr\.|staff|principal|lead|manager|director|head of|architect|II|III|IV|intern|internship|co-?op|stage|stagiaire` (je veux du temps plein, pas des stages).
- Description : années d'expérience exigées (`(\d+)\+? years`) ; >2 ans = pas new grad.
- Cas ambigus : `is_new_grad = null`. Si `LLM_ENABLED=true`, envoyer à `claude-haiku-5-5` avec sortie JSON stricte `{is_new_grad, seniority, years_required, visa_or_work_auth_notes, language_required}`. Cap `LLM_DAILY_MAX_CALLS` (défaut 200). Cache par fingerprint.

### Score (0 à 100, `score_breakdown` explicable dans l'UI)

Piloté entièrement par `config/profile.yaml` :

```yaml
grad_date: 2027-05
seniority: new_grad
locations:            # poids
  - { match: "Montréal|Montreal", weight: 30 }
  - { match: "Toronto", weight: 25 }
  - { country: CA, weight: 22 }
  - { remote: true, country: CA, weight: 22 }
  - { country: FR, weight: 12 }
  - { country: US, weight: 10 }
  - { remote: true, weight: 10 }
domains:              # mots-clés titre (x2) et description (x1)
  audio_dsp: [audio, dsp, "digital signal processing", juce, vst, "audio plugin", music]
  fullstack: [full[- ]?stack, react, next\.js, typescript, node, frontend, backend]
  ai_ml: [machine learning, ml engineer, ai engineer, llm, pytorch, data scientist]
  data_eng: [data engineer, spark, airflow, dbt, lakehouse, iceberg, kafka]
  gamedev: [game, gameplay, unity, unreal, engine programmer]
  systems: [c\+\+, embedded, low[- ]latency, gpu, cuda]
languages: [fr, en]
work_auth_note: ""    # à remplir par moi
exclude_companies: []
exclude_title: [sales, recruiter, marketing, "account executive"]
```

Bonus : entreprise `priority` élevée, fraîcheur (< 24 h), salaire affiché. Malus : `is_new_grad = false` (score plafonné à 20).

## 9. Planification (worker)

- Tier A ATS : toutes les **6 h**, réparti (jitter) pour ne pas tout lancer à la même minute.
- Tier B avec quota (Adzuna, Jooble, JSearch, France Travail…) : **1 fois/jour** à 05:30, requêtes générées depuis `profile.yaml` (domaines × lieux), budget de quota respecté.
- Repos GitHub + flux remote : toutes les 6 h.
- Recalcul du score : après chaque run, et en entier si `profile.yaml` change (hash du fichier en base).
- Verrou par source (advisory lock Postgres) : jamais deux runs simultanés de la même source.
- Endpoint `GET /healthz` sur le worker (dernier tick, runs en échec).

## 10. Alertes

Canaux configurables par env, tous optionnels : **ntfy** (push mobile, je peux l'héberger sur Dokploy), **e-mail SMTP** (nodemailer), **Discord webhook**, **Telegram bot**.

1. **Digest quotidien à 08:00 Toronto** : nouvelles offres des dernières 24 h, `is_new_grad != false`, score ≥ `DIGEST_MIN_SCORE` (défaut 40), triées par score, groupées par pays. Chaque ligne : titre, entreprise, lieu, score, âge, lien dashboard + lien candidature. E-mail HTML propre + résumé court en push (top 5 + compteur).
2. **Alerte instantanée** (optionnelle) : score ≥ `INSTANT_MIN_SCORE` (défaut 75) ou entreprise `priority = high`.
3. **Alerte santé** : source en échec 3 fois, quota épuisé, worker silencieux > 12 h, zéro nouvelle offre toutes sources confondues sur 48 h.
4. Idempotence via `alerts_sent`. Bouton « Envoyer un digest test » dans le dashboard.

## 11. Dashboard (tout-en-un)

Auth : mono-utilisateur, page de login, mot de passe `DASHBOARD_PASSWORD`, cookie de session signé `AUTH_SECRET`, middleware sur toutes les routes sauf `/login` et `/healthz`.

Pages :
- **`/` Inbox** : tableau des offres (TanStack Table, pagination serveur). Filtres : texte (full-text Postgres), pays, ville, remote, new grad (oui/non/inconnu), domaine, source, entreprise, score min, « vu depuis » (24 h, 3 j, 7 j, tout), statut, « inclure les fermées ». Tri par score / fraîcheur. Filtres reflétés dans l'URL. Raccourcis clavier : `j/k` naviguer, `s` sauvegarder, `a` postulé, `x` ignorer, `o` ouvrir le lien.
- **`/jobs/[id]`** : description nettoyée, `score_breakdown` lisible, sources où l'offre apparaît, statut + notes, zone « Actions » vide réservée à la phase 2 (CV).
- **`/pipeline`** : kanban par statut (saved, applied, interview, rejected).
- **`/companies`** : liste, ATS détecté, statut, nb d'offres ouvertes, priorité éditable, ajout via URL carrières (appelle `detectAts`).
- **`/sources`** : santé de chaque source (dernier run, durée, nb fetched/new, erreurs, quota utilisé/restant), bouton « lancer maintenant ».
- **`/stats`** : nouvelles offres/jour par source et par pays (30 j), part new grad, top entreprises.
- **`/settings`** : lecture de `profile.yaml` effectif, seuils d'alerte, test des canaux.

Design : sobre, dense, dark mode par défaut, lisible sur mobile (je consulte depuis le téléphone via le lien du digest).

## 12. Déploiement Dokploy

- `docker-compose.yml` avec : `db` (postgres:16, volume nommé, healthcheck), `migrate` (one-shot Drizzle, `depends_on: db healthy`), `worker`, `web`, `backup` (pg_dump quotidien, rotation 14 jours, volume dédié).
- Images multi-stage, non-root, `restart: unless-stopped`, limites mémoire raisonnables (VPS modeste).
- Pas de port DB exposé publiquement. `web` exposé via le domaine configuré dans Dokploy (ex. `jobs.sonomusa.tech`), HTTPS géré par Traefik/Dokploy.
- Toutes les variables dans `.env.example` : `DATABASE_URL`, `CONTACT_EMAIL`, `TZ`, `DASHBOARD_PASSWORD`, `AUTH_SECRET`, clés des sources, canaux d'alerte, seuils, `LLM_ENABLED`, `ANTHROPIC_API_KEY`, `LLM_DAILY_MAX_CALLS`.
- `README.md` : runbook pas à pas (créer l'app Compose dans Dokploy depuis le repo GitHub, variables, domaine, premier run, restauration d'un backup, ajout d'une source).

## 13. Jalons et critères d'acceptation

**M0. Scaffold** : monorepo, Drizzle + migrations, compose local, login, page `/sources` vide, `/healthz`.
✅ `docker compose up` démarre tout, login OK, CI locale (`pnpm lint typecheck test`) verte.

**M1. ATS cœur** : Greenhouse, Lever, Ashby, SmartRecruiters, Workday + seed + normalisation + dédup + `source_runs` + fermeture des offres.
✅ Fixtures réelles par connecteur, tests de normalisation des lieux (≥ 30 cas), un run réel sur le seed remplit `jobs` sans doublons.

**M2. Tier B + découverte** : repos GitHub new grad, Adzuna, Jooble, France Travail, The Muse, flux remote, HN, JSearch (quota), puis ATS secondaires (Workable, Recruitee, Personio, Breezy, etc.) selon vérification.
✅ `SOURCES.md` à jour (vérifiée/désactivée + raison pour chaque source), compteurs de quota respectés en test, `detectAts` couvert par tests, entreprises découvertes automatiquement visibles dans `/companies`.

**M3. Classification et score** : règles new grad, `profile.yaml`, score explicable, LLM optionnel.
✅ Jeu de 50 titres annotés à la main en test (précision new grad ≥ 90 % sur les cas non ambigus), changer `profile.yaml` recalcule les scores.

**M4. Dashboard complet** (section 11).
✅ Parcours manuel : filtrer « Canada, new grad, 24 h, score ≥ 50 », ouvrir une offre, la passer en « applied », la retrouver dans `/pipeline`.

**M5. Alertes** : digest quotidien, instantané, santé, sur au moins ntfy + e-mail.
✅ Bouton test envoie sur chaque canal configuré, aucun doublon après deux exécutions consécutives du digest.

**M6. Prod** : backups, limites, logs, README runbook, déploiement Dokploy.
✅ Déployé, tourne 48 h sans intervention, un digest reçu, restauration d'un backup testée.

## 14. Hors scope phase 1

- Génération de CV (phase 2 : `cv.yaml` maître + Claude + template LaTeX + tectonic).
- Chine (connecteurs 校招 / Moka / Beisen) : à ajouter plus tard via l'interface `Connector`.
- Candidature automatique : jamais.

Commence par M0. Avant de coder les connecteurs de M1, vérifie les endpoints Tier A par de vrais appels et montre-moi le tableau de résultats.
