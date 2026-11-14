# Décisions

Choix pris sans te demander (option la plus simple), avec leur raison. Les plus récents en bas.

## M0

1. **Versions** : Node 22 dans les images (`node:22-alpine`), pnpm 11.13, Next.js 16.4, React 19.3, Tailwind 4, Drizzle 0.45, Zod 4, ESLint 10, Vitest 5. **TypeScript 6.0** et non 7 : typescript-eslint ne supporte pas encore TS ≥ 6.1.
2. **Packages internes sans étape de build** : `@jobradar/core` et `@jobradar/db` exportent leur source TS. Next les transpile (`transpilePackages`), tsup les bundle pour le worker et migrate, Vitest les lit directement. `moduleResolution: Bundler` partout, donc pas d'extension `.js` dans les imports.
3. **Worker et migrate bundlés en un seul fichier** (tsup, `noExternal` sur tout) : l'image runtime ne contient que `dist/`, sans `node_modules`.
4. **Recherche plein texte** : `jobs.tsv` est une colonne générée `STORED` avec la config `simple` (pas `english`/`french`), parce que les offres mélangent FR et EN et que le stemming d'une langue dégrade l'autre. Poids : titre/entreprise A, lieu B, description C.
5. **Schéma complet dès M0** (toutes les tables de la section 7, plus `kv`) pour éviter une série de migrations. Ajouts par rapport à la spec : `companies.name_key`, `companies.consecutive_failures` (bascule `broken` à 3), `jobs.company_name`, `jobs.canonical_url`, `jobs.missed_runs` (fermeture après 2 runs), `alerts_sent.dedup_key` (unique par canal+type) et la table `kv` (heartbeat du worker, hash de `profile.yaml`, cache LLM).
6. **Session** : JWT HS256 signé avec `AUTH_SECRET` (lib `jose`) dans un cookie httpOnly `jr_session`, `SameSite=Lax`, valable 30 jours, `Secure` si `PUBLIC_BASE_URL` est en https. Le mot de passe est comparé en temps constant (hash SHA-256 puis `timingSafeEqual`), avec un délai de 750 ms après un échec. Pas de verrouillage : l'app est mono-utilisateur.
7. **Protection des routes** : `src/proxy.ts`, la convention Next 16 qui remplace `middleware.ts`. Tout est protégé sauf `/login`, `/healthz` et les assets.
8. **Identifiants Postgres dans compose** : passés par `PGUSER`/`PGPASSWORD` (lus nativement par postgres-js), avec `DATABASE_URL=postgres://db:5432/<db>` sans identifiants. Le mot de passe n'a donc jamais besoin d'être encodé pour une URL (le tien contient des caractères `+/=`).
9. **Ports** : `docker-compose.yml` (prod/Dokploy) ne publie aucun port (`expose` seulement). `docker-compose.override.yml`, chargé automatiquement en local, publie web, worker et db sur `127.0.0.1`. Dokploy lance `docker compose -f docker-compose.yml`, donc l'override n'y est pas appliqué. À confirmer en M6.
10. **CI locale** : `pnpm check` (= `pnpm lint && pnpm typecheck && pnpm test`), parce que `pnpm lint typecheck test` n'enchaîne pas plusieurs scripts.
11. **shadcn/ui** : composants copiés à la main (style new-york, base zinc) au lieu du CLI interactif. `components.json` est présent, donc `pnpm dlx shadcn add <x>` fonctionne pour la suite.
12. **Polices système**, pas de `next/font/google`, pour que le build Docker ne dépende pas du réseau Google.
13. **Branches git** : `main` est la branche principale. Le travail se fait sur des branches `feat/<jalon>-<sujet>` (ex. `feat/m0-scaffold`, `feat/m1-ats-core`), `fix/…`, `chore/…`, `docs/…`, fusionnées par PR. Commits au format conventionnel.

## M1

1. **Dédup** : on cherche d'abord par `(source, source_job_id)` (déjà vu sur cette source), puis par URL canonique, puis par `fingerprint` = sha256(entreprise, titre, ville normalisés), tronqué à 32 caractères. Deux postes identiques (même titre, même ville, même entreprise) avec des req IDs différents deviennent **une** ligne `jobs` avec plusieurs `job_sources` : pour toi, c'est la même offre.
2. **URL canonique** : https, sans `www`, sans hash, sans paramètres de tracking (`utm_*`, `gh_src`, `fbclid`, …), slash final retiré. `gh_jid` est **conservé** parce que c'est l'identifiant du poste sur les pages carrières Greenhouse maison (bug trouvé par les tests sur la fixture Stripe).
3. **Fermeture** : seulement pour les ATS, après 2 runs **complets et réussis** où l'offre est absente (`jobs.missed_runs`). Un run en erreur ne ferme rien. Une offre qui réapparaît est rouverte.
4. **304 Not Modified** : signifie « rien n'a changé », donc toutes les offres ouvertes de ce board sont marquées vues. Les ETag/Last-Modified reçus pendant un run ne sont persistés (table `kv`, clé `etag:<source>:<board>`) **qu'en fin de run réussi**. Sinon, un run planté masquerait des offres derrière un 304 au run suivant.
5. **Requêtes de détail** (SmartRecruiters, Workday) : faites seulement pour les offres pas encore connues **et** dont le titre n'est pas clairement senior/staff/manager/stage (`classify/rules.ts`). Ça divise le volume d'appels (Salesforce : 1 614 offres) sans perdre de candidats new grad. Les autres offres sont stockées à partir des seules données de liste.
6. **`broken`** : 3 échecs consécutifs pour une entreprise, puis `companies.ats_status = 'broken'` et un log `alert: "health"` (l'envoi réel de l'alerte arrive en M5). Un run réussi remet le statut à `ok`.
7. **Client HTTP** : undici, gzip/brotli, pas de suivi de redirection, 2 requêtes simultanées max par hôte, pacing de 1 req/s sur `*.myworkdayjobs.com`, retry exponentiel avec jitter (« equal jitter ») sur 429/5xx/réseau (4 essais), `Retry-After` respecté (au-delà de 2 min, on abandonne).
8. **Planification ATS** : `ATS_CRON` (toutes les 6 h). Les connecteurs tournent en parallèle, chacun démarre après un jitter aléatoire de 0 à 10 min, et les entreprises d'un même connecteur passent séquentiellement, sous un advisory lock Postgres `source:<id>`.
9. **Tests de pipeline** : PGlite (Postgres compilé en WASM, in-process) avec les vraies migrations. Pas de réseau, pas de conteneur. Le code partagé n'utilise que le query builder Drizzle (type `AnyDb`).
10. **Seed** : `syncCompanySeed` est idempotent (au démarrage du worker et avant chaque `cli run`). Il insère les entreprises manquantes et met à jour l'ATS et la priorité depuis le YAML, sans jamais rien supprimer. « Ubisoft Montréal » devient « Ubisoft » parce que le board couvre tous les studios ; Montréal sera favorisée par le score de lieu (M3).
