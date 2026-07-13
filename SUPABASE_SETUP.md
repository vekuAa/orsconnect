# Mise en service Supabase

## 1. Variables locales

Créer `.env.local` à la racine du projet :

```env
NEXT_PUBLIC_SUPABASE_URL=https://VOTRE-PROJET.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxx
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Ne pas mettre de clé `sb_secret_...` dans une variable `NEXT_PUBLIC_`.

## 2. Base de données

Dans Supabase, ouvrir **SQL Editor**, puis exécuter entièrement :

```text
supabase/migrations/001_initial_schema.sql
```

Le script crée les tables, les rôles, les politiques RLS, les fonctions métier et la publication Realtime des véhicules.

## 3. Premier utilisateur

Dans **Authentication → Users** :

1. créer un utilisateur avec e-mail et mot de passe ;
2. confirmer son adresse lors de la création ;
3. démarrer ORS Connect ;
4. se connecter ;
5. compléter l'écran « Initialiser ORS Connect ».

Le premier utilisateur devient administrateur ORS. Toute tentative ultérieure d'initialisation est refusée par la base de données.
