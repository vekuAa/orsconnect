# ORS Connect V3

ORS Connect V3 est la première version reliée à Supabase pour gérer les utilisateurs, les concessions, les véhicules et les écritures financières ORS.

## Fonctionnalités connectées à Supabase

- authentification réelle par e-mail et mot de passe ;
- sessions sécurisées via cookies SSR ;
- première initialisation de l'espace ORS ;
- création du profil administrateur et de la première concession ;
- véhicules enregistrés dans PostgreSQL ;
- flux « À laver / En lavage / Lavé » ;
- synchronisation Realtime des véhicules ;
- protection contre les doublons d'immatriculation sur un même site et une même journée ;
- affectation d'un prestataire actif ;
- calcul et gel de la rémunération lors de la clôture ;
- écritures financières pour le chiffre d'affaires, le coût prestataire et la marge ;
- tableau de bord alimenté par les données réelles.

## État des autres modules

Les pages Prestataires, Concessions, Finances et Paramètres conservent encore certaines données de démonstration. Elles servent de base visuelle et seront reliées progressivement à Supabase dans les étapes suivantes.

## Installation

```powershell
npm install
```

Copier `.env.example` vers `.env.local` :

```env
NEXT_PUBLIC_SUPABASE_URL=https://VOTRE-PROJET.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxx
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

La clé `SUPABASE_SECRET_KEY` n'est pas nécessaire pour l'authentification ou les véhicules. Elle sera uniquement nécessaire côté serveur pour créer automatiquement de nouveaux comptes prestataires. Ne jamais la préfixer par `NEXT_PUBLIC_`.

## Préparer Supabase

1. Ouvrir le projet Supabase.
2. Aller dans **SQL Editor**.
3. Ouvrir le fichier `supabase/migrations/001_initial_schema.sql`.
4. Copier tout son contenu dans une nouvelle requête SQL.
5. Exécuter la requête.
6. Aller dans **Authentication → Users**.
7. Créer le premier utilisateur ORS avec une adresse e-mail et un mot de passe.
8. Confirmer automatiquement l'adresse lors de la création si Supabase propose cette option.

## Lancer ORS Connect

```powershell
npm run dev
```

Puis ouvrir :

```text
http://localhost:3000
```

À la première connexion, ORS Connect affiche l'écran d'initialisation. Il faut renseigner :

- le nom affiché de l'administrateur ;
- le nom de la première concession ;
- la ville ;
- l'adresse.

Cette initialisation ne peut être exécutée qu'une seule fois.

## Vérifications techniques

```powershell
npm run typecheck
npm run build
```

Le build exige que les variables Supabase soient présentes dans `.env.local`.

## Structure principale

```text
app/                         Pages Next.js et routes serveur
components/                  Interface et modules métier
lib/supabase/                Clients Supabase navigateur, serveur et proxy
supabase/migrations/         Schéma SQL, fonctions métier et politiques RLS
```

## Règle financière

### Prestataire payé à la voiture

```text
rémunération = tarif du contrat correspondant au type de véhicule
```

### Prestataire payé à la journée

Le forfait est enregistré une seule fois par prestataire, concession et journée travaillée.

### Marge ORS

```text
marge brute = montant facturé - rémunération prestataire - frais opérationnels
```

Les montants sont enregistrés dans `financial_entries` afin qu'une modification future des tarifs ne modifie pas rétroactivement l'historique.
