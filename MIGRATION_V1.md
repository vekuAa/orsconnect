# Migration de BVHL Connect V1 vers ORS Connect V2

## Décision d'architecture

La V1 reste une source de règles métier et de données à migrer. Elle ne doit pas être déployée comme base de la V2.

Principales raisons constatées dans le code reçu :

- API concentrée dans un seul fichier `server.js` de plus de 1 400 lignes ;
- scripts frontend totalisant plusieurs milliers de lignes et fortement couplés au domaine BVHL ;
- URL de production BVHL écrite directement dans plusieurs fichiers ;
- mots de passe comparés en clair dans la route de connexion ;
- sessions JWT stockées dans le `localStorage` du navigateur ;
- CORS et WebSocket ouverts à toutes les origines ;
- répertoire de documents exposé publiquement ;
- routes et champs dupliqués ;
- données financières parfois recalculées à partir de tarifs modifiables ;
- fichier `.env` et documents réels présents dans l'archive.

## Correspondance fonctionnelle

| V1 BVHL | V2 ORS |
|---|---|
| `User` | `profiles` + `concession_access` |
| `Concession` | `concessions` |
| `Vehicle` | `vehicles` |
| `Disponibilite` | `work_days` |
| tarifs dans `User` | `provider_contracts` |
| sauvegarde mensuelle de CA sous forme de tableau | `financial_entries` immuables |
| Socket.IO ouvert | Supabase Realtime protégé par RLS |
| dossier public `uploads` | bucket privé Supabase Storage |

## Données à migrer

1. Concessions actives.
2. Comptes utilisateurs encore nécessaires.
3. Affectations prestataire/concession.
4. Tarifs actifs et date de prise d'effet.
5. Historique des véhicules utile à la facturation.
6. Jours travaillés validés.
7. Documents encore valides, après contrôle et avec accord de conservation.

## Données à ne pas copier automatiquement

- mots de passe existants ;
- tokens JWT ;
- fichier `.env` ;
- fichiers temporaires ou justificatifs expirés ;
- doublons de chiffre d'affaires enregistrés sous forme de snapshots ;
- comptes inactifs sans nécessité légale ou opérationnelle.

Les utilisateurs devront recevoir une invitation Supabase Auth ou effectuer une réinitialisation de mot de passe.

## Ordre de mise en production conseillé

1. Valider les écrans et règles de calcul en démonstration.
2. Créer le projet Supabase de production.
3. Brancher l'authentification et les politiques RLS.
4. Migrer les concessions et les prestataires.
5. Tester une concession pilote.
6. Comparer les calculs V1/V2 sur une période fermée.
7. Basculer les autres sites.
8. Mettre la V1 en lecture seule puis l'archiver.
