# 📄 État des Lieux : Plan Tarifaire (RelancePro)

**Date de mise à jour :** 24 Mai 2024  
**Statut :** 🟡 En cours de définition (Architecture prête, logique métier à finaliser)

\---

## 🎯 Objectif

Documenter la stratégie de monétisation, l'état d'avancement de l'implémentation et les décisions restantes pour lancer la facturation des abonnements RelancePro (cibles : France PCG \& Zone OHADA SYSCOHADA).

\---

## 📊 État Actuel

### ✅ Ce qui est fait

* \[x] Routes et pages UI prévues dans le routing (`/pricing`, `/billing`).
* \[x] Cycle comptable complet (Journal, Grand Livre, Balance, Export FEC/OHADA) développé et fonctionnel.
* \[x] Système de permissions (`usePermissions`) en place pour restreindre l'accès aux fonctionnalités.
* \[x] Gestion multi-entreprises et multi-utilisateurs (Teams) opérationnelle.

### ❌ Ce qui reste à faire

* \[ ] Valider la grille tarifaire définitive (montants et devises).
* \[ ] Ajouter les champs d'abonnement dans la base de données (`teams` ou `company\_settings`).
* \[ ] Implémenter la logique de "Quotas" (ex: blocage après X factures si limite atteinte).
* \[ ] Intégrer le fournisseur de paiement (Stripe pour l'Europe, + solution locale type Paystack/CinetPay pour l'Afrique si nécessaire).
* \[ ] Créer le portail client de gestion d'abonnement (mise à jour CB, téléchargement de factures).

\---

## 💡 Stratégie Tarifaire Proposée (Brouillon)

L'objectif est d'avoir une offre simple, avec un **effet de levier fort sur les fonctionnalités comptables avancées** (que nous venons de développer).

|Fonctionnalité|🌱 Essai Gratuit (14j)|🚀 Starter (TPE/Auto)|💼 Pro (PME)|🏢 Entreprise|
|-|:-:|:-:|:-:|:-:|
|**Prix mensuel estimé**|0 €|\~14 € / mois|\~39 € / mois|Sur devis|
|**Factures / Devis**|10 max|50 / mois|**Illimité**|Illimité|
|**Clients / Prospects**|20 max|100 max|**Illimité**|Illimité|
|**Utilisateurs (Sièges)**|1|1|3|Illimité|
|**Relances automatiques**|❌|✅ Basique|✅ Avancé (Scénarios)|✅ Personnalisé|
|**Export Comptable (FEC/OHADA)**|❌|❌|**✅ Inclus**|✅ Inclus + Accompagnement|
|**Grand Livre \& Balance**|❌|❌|**✅ Inclus**|✅ Inclus|
|**Support**|Email|Email|Prioritaire|Dédié (Slack/Tél)|

*(Note : Une remise de -20% est généralement appliquée pour l'engagement annuel).*

\---

## 🛠️ Tâches Techniques Restantes (To-Do)

### 1\. Base de Données (Appwrite)

Ajouter les champs suivants dans la collection `company\_settings` ou `teams` :

* `subscription\_tier` (String : 'free', 'starter', 'pro', 'enterprise')
* `subscription\_status` (String : 'active', 'past\_due', 'canceled')
* `billing\_cycle` (String : 'monthly', 'yearly')
* `stripe\_customer\_id` (String, optionnel)
* `quota\_invoices\_used` (Number)
* `quota\_invoices\_limit` (Number)

### 2\. Backend / Sécurité

* Créer un middleware ou un hook `useQuota` pour vérifier les limites avant la création d'une facture.
* Mettre à jour les permissions : s'assurer que `reports.export` et `reports.view` (Grand Livre/Balance) sont **uniquement** accessibles aux plans `pro` et `enterprise`.

### 3\. Intégration Paiement

* Choisir et configurer le(s) provider(s) :

  * **Stripe** (Recommandé pour la France/Europe).
  * **Paystack / Flutterwave / CinetPay** (À évaluer pour les paiements par Mobile Money en zone OHADA).
* Développer les Webhooks pour écouter les événements : `invoice.paid`, `customer.subscription.deleted`.

### 4\. Frontend

* Finaliser la page `/pricing` avec les toggles Mensuel/Annuel.
* Finaliser la page `/billing` (historique des paiements, bouton "Mettre à niveau", bouton "Annuler").

\---

## ❓ Décisions à Valider (Action Requise)

Pour avancer, nous avons besoin de trancher sur les points suivants :

1. **Devises acceptées** : Facturons-nous uniquement en **EUR** ? Ou prévoyons-nous une facturation en **XOF/XAF** pour les clients OHADA ? *(Cela impacte le choix du processeur de paiement)*.
2. **Modèle de quota** : Préférez-vous bloquer strictement l'utilisateur quand il atteint sa limite (ex: 50 factures), ou lui permettre de continuer en le facturant au prorata (overage) ?
3. **Période d'essai** : 14 jours avec demande de CB, ou 14 jours sans CB (plus de conversion, mais plus de churn) ?

\---

## 📝 Prochaine Étape Immédiate

1. Valider les montants et les réponses aux "Décisions à valider" ci-dessus.
2. Mettre à jour le schéma de la base de données Appwrite.
3. Implémenter la page `/pricing` avec les données réelles.

