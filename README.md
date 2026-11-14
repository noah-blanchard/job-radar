# JobRadar

Agrégateur personnel d'offres new grad 2027. Il collecte les offres depuis des API publiques et des flux officiels, les normalise, les déduplique, les score pour mon profil, et envoie un digest quotidien. Auto-hébergé sur Dokploy.

- Spécification : [`docs/MASTER_PROMPT_jobradar.md`](docs/MASTER_PROMPT_jobradar.md)
- État des sources : [`SOURCES.md`](SOURCES.md)
- Décisions techniques : [`DECISIONS.md`](DECISIONS.md)

## Architecture

```
apps/web        Next.js (App Router) : dashboard, auth, /healthz
apps/worker     process long-vivant : scheduler croner, runs des connecteurs, /healthz :8081
packages/core   env, logger, connecteurs, normalisation, classification (classify/), score (score/), alertes (alerts/)
packages/db     schéma Drizzle, migrations SQL, client Postgres
config/         profile.yaml, sources.yaml, companies.seed.yaml
scripts/backup/ backup.sh (pg_dump quotidien), restore.sh
```

Services compose : `db` (Postgres 16), `migrate` (one-shot), `worker`, `web`, `backup` (pg_dump quotidien, volume `backups`).

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
docker compose exec worker node dist/cli.js rescore                      # reclasse et rescore toutes les offres (lots de 1 000)
docker compose exec worker node dist/cli.js rescore --if-changed         # seulement si profile.yaml a changé
docker compose exec worker node dist/cli.js alerts test                  # aperçu [TEST] du digest sur chaque canal
docker compose exec worker node dist/cli.js alerts digest                # digest de la dernière échéance (idempotent)
docker compose exec worker node dist/cli.js alerts health                # contrôles de santé (idempotent)
```

Hors Docker : `pnpm --filter @jobradar/worker cli run all`, et `pnpm detect-ats <url-carrières>` pour ajouter une entreprise à la main (détection par URL, sinon sondage des API publiques des ATS avec le nom de domaine ; jamais de scraping HTML).

Planification (heure de Toronto) :

- `ATS_CRON` (toutes les 6 h) : balayage des ATS, jitter de 0 à 10 min par connecteur, budget `ATS_SWEEP_MAX_MINUTES`. Les entreprises sont prises par priorité puis de la moins récemment à jour à la plus récente : celles non atteintes passent en tête au balayage suivant.
- `AGGREGATORS_CRON` (05:30) : Adzuna, Jooble, JSearch, Findwork, avec leurs quotas journaliers (`*_DAILY_MAX_CALLS`, table `api_usage`).
- `FEEDS_CRON` (toutes les 6 h) : listes GitHub new grad, flux remote, HN « Who is hiring? ».

Chaque run passe toutes les URLs vues dans `detectAts` : les boards inconnus deviennent des entreprises « découvertes », visibles dans `/companies` et balayées au run ATS suivant.

## Classification et score

- **New grad (règles)** : titre (positif : new grad, junior, entry-level, early career, graduate…, négatif : senior, staff, lead, manager, II/III, et stage/intern/co-op car seul le temps plein compte), années d'expérience dans la description (> 2 ans = pas new grad), indice de la source (listes new grad, filtre entry-level). Cas ambigus : `is_new_grad = null`. La raison s'affiche dans la fiche.
- **Score 0-100** piloté par `config/profile.yaml` : lieu (premier critère qui matche), new grad, domaines (titre ×2, description ×1), langue, priorité `high`, fraîcheur < 24 h, salaire affiché ; exclusions = 0 ; pas new grad = 20 max. Le détail (`score_breakdown`) est affiché sur `/jobs/[id]`.
- **Recalcul** : après chaque run (offres touchées), et en entier quand `profile.yaml` change (hash dans `kv`, vérifié au démarrage du worker et avant chaque balayage). Modifier le profil = éditer le fichier puis redéployer ; `cli rescore` force un recalcul complet (~75 s pour 93 000 offres).
- **LLM (optionnel)** : `LLM_ENABLED=true` + `ANTHROPIC_API_KEY` ; `claude-haiku-5-5` tranche seulement les offres ambiguës, dans la limite de `LLM_DAILY_MAX_CALLS` par jour, avec un cache par empreinte. Sans clé, tout fonctionne par règles.

## Alertes

Canaux activés par leurs variables (`.env`) : **ntfy** (`NTFY_TOPIC`, plus `NTFY_TOKEN` si le topic est protégé), **e-mail** (`SMTP_HOST` + `ALERT_EMAIL_TO`, plus `SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`), Discord (`DISCORD_WEBHOOK_URL`), Telegram (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`).

- **Digest** à `DIGEST_CRON` (08:00 Toronto) : offres vues dans les 24 h avant l'échéance, new grad ou inconnu, score ≥ `DIGEST_MIN_SCORE`, triées par score et groupées par pays. E-mail HTML (25 offres par pays, 150 au plus, lien vers le reste) ; push = compteur + top 5. Les quotas épuisés y sont signalés. Envoyé même vide. Rattrapé dans les 12 h si le worker était arrêté à 08:00.
- **Instantanée** (`INSTANT_ALERTS_ENABLED`) : après chaque run, nouvelles offres (< 24 h) avec score ≥ `INSTANT_MIN_SCORE`, ou d'une entreprise `priority = high` avec score ≥ `DIGEST_MIN_SCORE`.
- **Santé** (toutes les 15 min et au démarrage) : entreprise ou source en échec 3 fois de suite, worker silencieux plus de `HEALTH_SILENCE_HOURS`, aucune nouvelle offre en 48 h, backup en échec ou de plus de 30 h.
- **Jamais deux fois** : table `alerts_sent` (canal, type, clé). Un canal en échec est réessayé au passage suivant ; les autres ne reçoivent rien de plus.
- **Test** : bouton « Tester les canaux » de `/settings` (exécuté par le worker dans la minute, résultat affiché sur la page) ou `cli alerts test`.

ntfy : installe l'app ntfy (Android/iOS), abonne-toi au topic `NTFY_TOPIC` sur le serveur `ntfy.sh` (ou ton instance). Sur ntfy.sh, quiconque connaît le topic peut lire les alertes : prends un nom long et aléatoire (`jobradar-` + 16 caractères), ou réserve-le avec un compte et mets son jeton (`tk_…`) dans `NTFY_TOKEN`.

## Dashboard

| Page | Contenu |
|---|---|
| `/` Inbox | Table paginée côté serveur (50/page), filtres dans l'URL (texte, pays, ville, mode, new grad, domaine, source, entreprise, score min., vu depuis 24 h/3 j/7 j, statut, fermées), tri score/fraîcheur. Clavier : `j/k`, `s` sauvegarder, `a` postulé, `x` ignorer, `o` ouvrir, `Entrée` fiche. |
| `/jobs/[id]` | Description nettoyée, détail du score, sources, statut et notes, zone « Actions » (phase 2). |
| `/pipeline` | Kanban sauvegardée / postulé / entretien / refusée (glisser-déposer ou menu). |
| `/companies` | Entreprises, ATS, statut, offres ouvertes, priorité éditable, ajout par URL. |
| `/sources` | Santé, quota du jour utilisé/restant, bouton « lancer » (demande exécutée par le worker dans la minute). |
| `/stats` | Nouvelles offres par jour (30 j) par source et par pays, part new grad, top entreprises. |
| `/settings` | `profile.yaml` effectif et son hash, seuils d'alerte, canaux et bouton « Tester les canaux ». |

## Git

- `main` : branche principale.
- Branches de travail : `feat/<jalon>-<sujet>`, `fix/…`, `chore/…`, `docs/…`, fusionnées par PR.
- Commits conventionnels (`feat(connectors): greenhouse`).

## Déploiement Dokploy (runbook)

Ressources : ~2 Go de RAM pour la stack (limites : db 512m, web 512m, worker 384m, migrate et backup 256m), quelques Go de disque (base locale de 100 000 offres : 1,3 Go ; un dump : ~115 Mo × 14 jours).

### 1. Préparer

- Un enregistrement DNS `A` (ou `CNAME`) `jobs.sonomusa.tech` vers l'IP du VPS Dokploy.
- Dokploy relié à GitHub (Settings → Git → GitHub App) avec accès au repo `noah-blanchard/job-radar`.

### 2. Créer l'app Compose

1. Projet → **Create Service → Compose**, nom `jobradar`, type **Docker Compose**.
2. Onglet **General** : provider **GitHub**, repo `noah-blanchard/job-radar`, branche `main`, **Compose Path** `./docker-compose.yml`. Dokploy lance `docker compose -f docker-compose.yml …` : l'override local (ports publiés) n'est pas chargé, aucun port n'est exposé.
3. Onglet **Environment** : coller le contenu de `.env.example` et remplir. Commentaires **sur leur propre ligne** uniquement. Obligatoires : `POSTGRES_PASSWORD`, `DASHBOARD_PASSWORD`, `AUTH_SECRET` (`openssl rand -base64 32`), `CONTACT_EMAIL`, `PUBLIC_BASE_URL=https://jobs.sonomusa.tech`. Pour les alertes : `NTFY_TOPIC` (et/ou les `SMTP_*` + `ALERT_EMAIL_TO`). Clés des agrégateurs : celles que tu as (`ADZUNA_*`, `JOOBLE_KEY`, `RAPIDAPI_KEY`, `FINDWORK_KEY`). Dokploy écrit cet onglet dans `.env` à côté du compose, lu par `env_file`.
4. Onglet **Domains** : **Add Domain** → host `jobs.sonomusa.tech`, service `web`, port `3000`, HTTPS activé, certificat **Let's Encrypt**.
5. **Deploy**. Dans les logs : `migrate` se termine en 0, puis `worker`, `web` et `backup` démarrent et passent `healthy` (onglet Monitoring / `docker ps`).
6. Déploiement continu : activer **Autodeploy** (webhook GitHub) pour redéployer à chaque push sur `main`, sinon bouton **Deploy**.

### 3. Premier run

- `https://jobs.sonomusa.tech/healthz` répond `{"ok":true,…}` ; `/login` avec `DASHBOARD_PASSWORD`.
- Le worker synchronise `config/companies.seed.yaml` au démarrage et suit les crons (ATS toutes les 6 h, agrégateurs à 05:30, flux toutes les 6 h, digest à 08:00). Pour remplir la base tout de suite, depuis le terminal du conteneur `worker` (Dokploy → Docker → worker → Terminal) : `node dist/cli.js run tier-b`, puis `node dist/cli.js run ats --max-minutes 60`. Ou le bouton « lancer » de `/sources`.
- `/settings` → **Tester les canaux** : un aperçu [TEST] du digest arrive sur chaque canal configuré dans la minute, et le résultat par canal s'affiche sur la page.
- Le backup : un premier dump est fait au démarrage du service `backup` (logs : `backup ok: /backups/jobradar_….dump`), puis chaque jour à `BACKUP_HOUR` (3 h).

### 4. Restaurer un backup

Sur le VPS (SSH). Les conteneurs portent le nom de l'app Dokploy : repère-les avec `docker ps --format '{{.Names}}' | grep jobradar`.

```bash
B=$(docker ps --format '{{.Names}}' | grep -- '-backup-' | head -n1)
docker exec "$B" restore.sh                                   # liste les dumps
# 1) Vérifier sans toucher à la prod : restauration dans une base de test
docker exec "$B" restore.sh jobradar_2026-11-13_0300.dump jobradar_restore_test
# 2) Restaurer la prod : arrêter worker et web, restaurer, redémarrer
docker stop $(docker ps --format '{{.Names}}' | grep -E -- '-(worker|web)-')
docker exec "$B" restore.sh jobradar_2026-11-13_0300.dump
# puis Deploy dans Dokploy (ou docker start des deux conteneurs)
```

`restore.sh` vérifie l'archive puis restaure en une seule transaction (`pg_restore --clean --if-exists --single-transaction`) : en cas d'erreur, rien n'est modifié. Supprimer la base de test ensuite : `docker exec "$B" dropdb jobradar_restore_test`.

Copier un dump hors du serveur : `docker cp "$B":/backups/jobradar_….dump .` ; en restaurer un venu d'ailleurs : `docker cp fichier.dump "$B":/backups/` puis `restore.sh fichier.dump`.

### 5. Ajouter une source

- **Une entreprise** dont l'ATS est déjà géré (Greenhouse, Lever, Ashby, Workday, …) : `/companies` → ajout par URL carrières, ou `node dist/cli.js detect-ats <url>` dans le worker. Pour la garder dans le seed : l'ajouter à `config/companies.seed.yaml`, push.
- **Une nouvelle API** : vérifier l'endpoint par un vrai appel et l'enregistrer comme fixture, écrire le connecteur dans `packages/core/src/connectors/` (interface `Connector`, schéma zod), l'ajouter à `registry.ts` et à `config/sources.yaml` (avec `quota_env` si quota), ajouter la clé à `.env.example` et à `env.ts`, tester, documenter dans `SOURCES.md`, push : le redéploiement l'active.

### 6. Modifier le profil

Éditer `config/profile.yaml`, push, redéployer : au démarrage, le worker voit le nouveau hash et recalcule tous les scores (~1 min pour 100 000 offres). `/settings` montre le hash appliqué.
