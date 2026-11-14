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
