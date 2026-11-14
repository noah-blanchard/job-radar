# JobRadar

Agrégateur personnel d'offres new grad 2027. Il collecte les offres depuis des API publiques et des flux officiels, les normalise, les déduplique, les score pour mon profil, et envoie un digest quotidien. Auto-hébergé sur Dokploy.

- Spécification : [`docs/MASTER_PROMPT_jobradar.md`](docs/MASTER_PROMPT_jobradar.md)
- État des sources : [`SOURCES.md`](SOURCES.md)
- Décisions techniques : [`DECISIONS.md`](DECISIONS.md)

## Architecture

```
apps/web        Next.js (App Router) : dashboard, auth, /healthz
apps/worker     process long-vivant : scheduler croner, runs des connecteurs, /healthz :8081
packages/core   env, logger, connecteurs, normalisation, classification, scoring, alertes
packages/db     schéma Drizzle, migrations SQL, client Postgres
config/         profile.yaml, sources.yaml, companies.seed.yaml
```

Services compose : `db` (Postgres 16), `migrate` (one-shot), `worker`, `web`. Le service `backup` arrive en M6.

## Démarrage local (Docker)

Prérequis : Docker Desktop.

```bash
cp .env.example .env    # remplir POSTGRES_PASSWORD, DASHBOARD_PASSWORD, AUTH_SECRET (>= 32 car.), CONTACT_EMAIL
docker compose up --build
```

- Dashboard : http://127.0.0.1:3000 (connexion avec `DASHBOARD_PASSWORD`)
- Santé web : `curl 127.0.0.1:3000/healthz`
- Santé worker : `curl 127.0.0.1:8081/healthz`
- Postgres : `127.0.0.1:5432` (local uniquement)

Les ports ne sont publiés que par `docker-compose.override.yml`, qui ne sert qu'en local.

## Développement (hors Docker)

Prérequis : Node ≥ 22, pnpm 11.

```bash
pnpm install
docker compose up -d db          # Postgres seul
pnpm db:migrate                  # applique les migrations (lit DATABASE_URL, host localhost)
pnpm dev:web                     # http://localhost:3000
pnpm dev:worker
```

Pour `next dev`, crée `apps/web/.env.local` avec `DATABASE_URL`, `DASHBOARD_PASSWORD`, `AUTH_SECRET` et `PUBLIC_BASE_URL=http://localhost:3000`. Le worker lit `.env.local` à la racine s'il existe.

Vérifications (la « CI locale ») :

```bash
pnpm check        # lint + typecheck + tests (aucun test n'appelle le réseau)
```

Modifier le schéma : éditer `packages/db/src/schema.ts`, puis `pnpm db:generate` et commiter le SQL généré dans `packages/db/migrations/`.

## Opérations (CLI du worker)

```bash
docker compose exec worker node dist/cli.js seed                         # synchronise config/companies.seed.yaml
docker compose exec worker node dist/cli.js run all                      # toutes les sources activées (ATS + Tier B)
docker compose exec worker node dist/cli.js run ats --max-minutes 30     # balayage ATS (budget en minutes)
docker compose exec worker node dist/cli.js run tier-b                   # agrégateurs + listes/flux (alias : aggregators, feeds)
docker compose exec worker node dist/cli.js run greenhouse --company stripe
docker compose exec worker node dist/cli.js detect-ats https://jobs.lever.co/acme [--name Acme] [--dry-run]
docker compose exec worker node dist/cli.js stats                        # compteurs, doublons, entreprises par origine
```

Hors Docker : `pnpm --filter @jobradar/worker cli run all`, et `pnpm detect-ats <url-carrières>` pour ajouter une entreprise à la main (détection par URL, sinon sondage des API publiques des ATS avec le nom de domaine ; jamais de scraping HTML).

Planification (heure de Toronto) :

- `ATS_CRON` (toutes les 6 h) : balayage des ATS, jitter de 0 à 10 min par connecteur, budget `ATS_SWEEP_MAX_MINUTES`. Les entreprises sont prises par priorité puis de la moins récemment à jour à la plus récente : celles non atteintes passent en tête au balayage suivant.
- `AGGREGATORS_CRON` (05:30) : Adzuna, Jooble, JSearch, Findwork, avec leurs quotas journaliers (`*_DAILY_MAX_CALLS`, table `api_usage`).
- `FEEDS_CRON` (toutes les 6 h) : listes GitHub new grad, flux remote, HN « Who is hiring? ».

Chaque run passe toutes les URLs vues dans `detectAts` : les boards inconnus deviennent des entreprises « découvertes », visibles dans `/companies` et balayées au run ATS suivant.

## Git

- `main` : branche principale.
- Branches de travail : `feat/<jalon>-<sujet>`, `fix/…`, `chore/…`, `docs/…`, fusionnées par PR.
- Commits conventionnels (`feat(connectors): greenhouse`).

## Déploiement Dokploy

Le runbook complet (création de l'app Compose, variables, domaine, premier run, restauration d'un backup, ajout d'une source) sera écrit au jalon M6.
