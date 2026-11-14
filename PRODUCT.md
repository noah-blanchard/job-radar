# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Un seul utilisateur, définitivement : le propriétaire du repo, étudiant en génie logiciel (diplôme prévu en mai 2027) qui cherche un premier poste à temps plein « new grad ». Pas d'autre audience : ni vitrine portfolio, ni multi-utilisateur à venir. Chaque décision se juge à l'efficacité de cette seule personne.

Situation principale : des sessions de tri sur ordinateur, au clavier, dans l'Inbox. Le téléphone est secondaire : on y ouvre une offre depuis le lien du digest du matin pour y jeter un œil, pas pour trier en masse.

## Product Purpose

JobRadar collecte en continu toutes les offres accessibles gratuitement par API publique ou flux officiel (ATS publics, agrégateurs à clé gratuite, listes GitHub new grad, flux remote, HN « Who is hiring? »), les normalise, les déduplique, les classe new grad ou non, les score de 0 à 100 pour le profil défini dans `config/profile.yaml`, puis envoie un digest quotidien et des alertes.

Réussite : ne rater aucune offre new grad pertinente (Canada d'abord, UE ensuite), passer le moins de temps possible à écarter le bruit, et suivre ses candidatures jusqu'à l'entretien sans outil externe.

## Positioning

Ce n'est pas un job board : c'est un radar personnel. Il interroge directement les endpoints JSON publics des ATS des entreprises (Greenhouse, Lever, Ashby, Workday…) et découvre de nouveaux boards à partir de chaque URL vue, au lieu de dépendre d'un agrégateur. Le score est entièrement piloté par un fichier de profil versionné et chaque point est explicable dans l'interface (`score_breakdown`).

## Operating Context

- **Tri** : Inbox paginée côté serveur (50/page), filtres reflétés dans l'URL, raccourcis `j/k` naviguer, `s` sauvegarder, `a` postulé, `x` ignorer, `o` ouvrir, `Entrée` fiche.
- **Lecture** : fiche `/jobs/[id]` avec description nettoyée, détail du score, sources, statut et notes.
- **Suivi** : `/pipeline`, kanban sauvegardée / postulé / entretien / refusée.
- **Entretien de la machine** : `/companies` (ATS détecté, priorité, ajout par URL carrières), `/sources` (santé, quotas du jour, lancement manuel), `/stats`, `/settings` (profil effectif et hash, seuils, test des canaux).
- **Alertes hors dashboard** : digest à 08:00 (heure de Toronto) par e-mail HTML et push (ntfy, Discord, Telegram), alertes instantanées et alertes de santé. Le lien du digest est la principale porte d'entrée depuis le téléphone.
- Fuseau `America/Toronto` partout (affichage, crons, digests).

## Capabilities and Constraints

- Monorepo TypeScript : `apps/web` (Next.js App Router, Tailwind, shadcn/ui, TanStack Table, server actions), `apps/worker`, `packages/core`, `packages/db` (Drizzle, Postgres 16). Auto-hébergé sur Dokploy (`jobs.sonomusa.tech`), ressources modestes (web limité à 512 Mo).
- Comptes par e-mail et mot de passe, créés sur invitation de l'administrateur ; le propriétaire est créé au premier démarrage (`ADMIN_EMAIL`, `DASHBOARD_PASSWORD`). Cookie signé ; site non indexé.
- Sources : uniquement publiques et autorisées. Jamais de scraping HTML, de navigateur headless, ni de LinkedIn/Indeed/Glassdoor/Wellfound.
- Classification new grad par règles ; `is_new_grad = null` pour les cas ambigus, raison affichée. LLM optionnel et désactivé par défaut : tout doit fonctionner sans.
- Volume réel : de l'ordre de 100 000 offres en base ; l'interface doit rester rapide sur ce volume.
- Langue : interface en français ou en anglais, au choix de chaque compte (Réglages → Langue ; par défaut la langue du navigateur, sinon le français). Le contenu des offres, les profils, le détail du score et les alertes ne sont pas traduits.
- Phase 2 (hors scope, emplacement réservé) : bouton « Générer CV.tex » dans la zone « Actions » de `/jobs/[id]`.
- Chine hors scope pour l'instant ; l'architecture des connecteurs doit permettre de l'ajouter.

## Brand Commitments

- Nom : JobRadar. Icône existante : `apps/web/src/app/icon.svg`.
- Consigne de départ du spec (`docs/MASTER_PROMPT_jobradar.md`, §11) : sobre, dense, sombre par défaut, lisible sur mobile.
- Ton : français direct et factuel, tutoiement implicite dans la doc, aucun marketing.

## Evidence on Hand

- Données réelles : offres, entreprises, runs de sources, quotas et statistiques en base ; fixtures réelles des connecteurs dans les tests.
- Profil de scoring réel : `config/profile.yaml` (une version de démo est conservée dans `config/profile_demo.yaml`).
- État des sources : `SOURCES.md`. Décisions techniques : `DECISIONS.md`.
- Aucun témoignage, client ou chiffre externe : n'en jamais inventer, le produit n'a pas d'autre public.

## Product Principles

1. **Le temps de tri est la métrique.** Chaque écran sert à décider vite : garder, postuler, ignorer. Le clavier est le chemin principal.
2. **Tout score s'explique.** Une offre n'est jamais classée sans que la raison soit visible et traçable jusqu'au profil.
3. **Densité honnête.** Montrer beaucoup d'offres à la fois sans masquer l'incertitude (new grad inconnu, source en échec, quota épuisé).
4. **La machine se surveille elle-même.** Santé des sources, quotas et fraîcheur sont visibles sans aller lire les logs.
5. **Rien d'inventé.** Pas de source non autorisée, pas d'endpoint supposé, pas de donnée fabriquée dans l'interface.
