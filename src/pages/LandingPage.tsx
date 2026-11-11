import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Check,
  X,
  Wallet,
  Menu,
  X as XIcon,
  ArrowRight,
  ChevronDown,
  RefreshCcw,
  Lock,
  Receipt,
  BarChart3,
  FileText,
  Clock3,
  TrendingUp,
  TrendingDown,
  Contact,
  Users,
  Camera,
  ExternalLink,
  CalendarDays,
  CreditCard,
  ArrowUpRight,
  CircleCheck,
  LayoutDashboard,
  UserCheck,
  Package,
  FileOutput,
  FileInput,
  BookText,
  BookOpenCheck,
  Scale,
  FileDown,
  BookOpen,
  ArrowRightLeft,
} from 'lucide-react';

// ============================================================
// LIENS
// ============================================================

const SOCIAL_LINKS = {
  linkedin: 'https://www.linkedin.com/in/cr%C3%A9pin-azo-ayena-400a281a2/',
  facebook: 'https://www.facebook.com/profile.php?id=61589421927981',
  instagram: 'https://www.instagram.com/comlanviayena/',
  comeup:
    'https://comeup.com/fr/service/525747/creer-votre-application-excel-professionnelle-avec-formules-et-macros-vba',
};

// ============================================================
// FAQ
// ============================================================

const FAQ_ITEMS = [
  {
    question: 'Puis-je changer de formule à tout moment ?',
    answer:
      'Vous pouvez choisir la formule adaptée à vos besoins. Les possibilités de changement ou de résiliation dépendent des conditions de votre abonnement.',
  },
  {
    question: 'Comment fonctionnent les relances automatiques ?',
    answer:
      'FUNMI vous permet de suivre les factures en attente et de configurer des rappels destinés à vos clients. Les modalités dépendent des paramètres disponibles dans votre espace.',
  },
  {
    question: 'Puis-je créer des devis et des factures ?',
    answer:
      'Oui. FUNMI centralise la gestion de vos documents commerciaux afin de vous aider à préparer vos devis et factures et à suivre leur évolution.',
  },
  {
    question: 'Comment choisir ma formule ?',
    answer:
      'Consultez les tarifs et les fonctionnalités affichées pour chaque formule. Vous pourrez ainsi sélectionner celle qui correspond le mieux à votre activité.',
  },
  {
    question: 'Comment fonctionne le paiement de mon abonnement ?',
    answer:
      'Vous pouvez créer votre compte directement sur FUNMI. La souscription et le paiement de votre abonnement se font ensuite depuis votre espace de gestion, selon la formule choisie.',
  },
];

// ============================================================
// TOUTES LES FONCTIONNALITÉS (section features)
// ============================================================

const ALL_FEATURES = [
  { icon: LayoutDashboard, name: 'Tableau de bord' },
  { icon: BarChart3, name: 'Statistiques' },
  { icon: Users, name: 'Prospects' },
  { icon: UserCheck, name: 'Clients' },
  { icon: Package, name: 'Catalogue' },
  { icon: FileText, name: 'Devis' },
  { icon: FileOutput, name: 'Factures clients' },
  { icon: FileInput, name: 'Factures fournisseurs' },
  { icon: RefreshCcw, name: 'Relances automatiques' },
  { icon: Wallet, name: 'Trésorerie' },
  { icon: ArrowRightLeft, name: 'Entrées & Sorties' },
  { icon: BookText, name: 'Journal' },
  { icon: BookOpenCheck, name: 'Grand Livre' },
  { icon: Scale, name: 'Balance' },
  { icon: FileDown, name: 'Export Comptable' },
  { icon: BookOpen, name: 'Plan Comptable' },
];

// ============================================================
// TABLEAU COMPARATIF DES FONCTIONNALITÉS
// ============================================================

interface FeatureRow {
  name: string;
  essentiel: boolean | string;
  pro: boolean | string;
  business: boolean | string;
  legende: boolean | string;
}

const FEATURE_COMPARISON: FeatureRow[] = [
  { name: 'Tableau de bord', essentiel: true, pro: true, business: true, legende: true },
  { name: 'Statistiques', essentiel: true, pro: true, business: true, legende: true },
  { name: 'Prospects', essentiel: true, pro: true, business: true, legende: true },
  { name: 'Clients', essentiel: true, pro: true, business: true, legende: true },
  { name: 'Catalogue', essentiel: true, pro: true, business: true, legende: true },
  { name: 'Devis', essentiel: true, pro: true, business: true, legende: true },
  { name: 'Factures clients', essentiel: '20/mois', pro: 'Illimité', business: 'Illimité', legende: 'Illimité' },
  { name: 'Factures fournisseurs', essentiel: false, pro: true, business: true, legende: true },
  { name: 'Relances automatiques', essentiel: false, pro: true, business: true, legende: true },
  { name: 'Reçus', essentiel: false, pro: true, business: true, legende: true },
  { name: 'Trésorerie', essentiel: false, pro: true, business: true, legende: true },
  { name: 'Entrées & Sorties', essentiel: false, pro: true, business: true, legende: true },
  { name: 'Journal', essentiel: false, pro: false, business: true, legende: true },
  { name: 'Grand Livre', essentiel: false, pro: false, business: true, legende: true },
  { name: 'Balance', essentiel: false, pro: false, business: true, legende: true },
  { name: 'Export Comptable', essentiel: false, pro: false, business: true, legende: true },
  { name: 'Plan Comptable', essentiel: false, pro: false, business: true, legende: true },
  { name: 'Sauvegardes', essentiel: 'Hebdomadaires', pro: 'Quotidiennes', business: 'Quotidiennes', legende: 'Quotidiennes' },
  { name: 'Historique & Audit', essentiel: false, pro: false, business: true, legende: true },
];

// ============================================================
// RESSOURCES PAR PLAN
// ============================================================

const PLAN_RESOURCES = [
  { resource: 'Utilisateurs', essentiel: '1', pro: '3', business: 'Illimités', legende: 'Illimités' },
  { resource: 'Prospects', essentiel: '50*', pro: 'Illimités', business: 'Illimités', legende: 'Illimités' },
  { resource: 'Devis', essentiel: 'Illimités', pro: 'Illimités', business: 'Illimités', legende: 'Illimités' },
  { resource: 'Factures clients', essentiel: '20/mois', pro: 'Illimitées', business: 'Illimitées', legende: 'Illimitées' },
  { resource: 'Factures fournisseurs', essentiel: 'Bloquées', pro: 'Illimitées', business: 'Illimitées', legende: 'Illimitées' },
  { resource: 'Entreprises', essentiel: '1', pro: '1', business: '1', legende: '1' },
  { resource: 'Entités juridiques', essentiel: '1', pro: '1', business: '1', legende: '1' },
];

// ============================================================
// FORMULES COMMERCIALES FUNMI
// ============================================================

interface PricingPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice?: number;
  yearlyPrice?: number;
  lifetimePrice?: number;
  badge?: string;
}

const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'essentiel',
    name: 'Essentiel',
    description: 'Pour les indépendants qui débutent.',
    monthlyPrice: 9,
    yearlyPrice: 90,
  },
  {
    id: 'pro',
    name: 'Pro',
    badge: 'Plus populaire',
    description: 'Le plus choisi pour automatiser la trésorerie.',
    monthlyPrice: 29,
    yearlyPrice: 290,
  },
  {
    id: 'business',
    name: 'Business',
    description: "L'armure comptable pour les PME établies.",
    monthlyPrice: 59,
    yearlyPrice: 590,
  },
  {
    id: 'legende',
    name: 'Légende',
    description: 'Payez une fois, utilisez pour toujours.',
    lifetimePrice: 1490,
  },
];

// ============================================================
// PETITS COMPOSANTS VISUELS
// ============================================================

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
        <Wallet size={19} strokeWidth={2.2} />
      </div>
      <span className="text-xl font-bold tracking-tight text-slate-950">
        FUNMI
      </span>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="relative mx-auto mt-16 max-w-6xl px-2 sm:mt-20 sm:px-6">
      <div className="absolute inset-x-10 top-8 h-64 rounded-full bg-indigo-200/40 blur-3xl" />
      <div className="absolute -left-8 top-24 h-52 w-52 rounded-full bg-emerald-100/70 blur-3xl" />
      <div className="absolute -right-8 top-10 h-52 w-52 rounded-full bg-violet-100/70 blur-3xl" />

      <div className="relative rounded-[26px] border border-white/80 bg-white p-2 shadow-[0_30px_100px_-35px_rgba(15,23,42,0.28)] sm:p-3">
        <div className="overflow-hidden rounded-[19px] border border-slate-200 bg-[#f8fafc]">
          <div className="flex h-12 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </div>

            <div className="hidden items-center gap-2 rounded-lg bg-slate-50 px-4 py-1.5 text-[11px] text-slate-400 sm:flex">
              <Lock size={11} />
              Espace de gestion FUNMI
            </div>

            <div className="h-7 w-7 rounded-full bg-indigo-100" />
          </div>

          <div className="grid min-h-[390px] grid-cols-1 md:grid-cols-[175px_1fr]">
            <aside className="hidden border-r border-slate-200 bg-white p-4 md:block">
              <div className="mb-7 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
                  <Wallet size={14} />
                </div>
                <span className="text-xs font-bold text-slate-800">FUNMI</span>
              </div>

              <div className="space-y-2">
                {[
                  { icon: BarChart3, label: 'Tableau de bord', active: true },
                  { icon: Receipt, label: 'Factures' },
                  { icon: FileText, label: 'Devis' },
                  { icon: Users, label: 'Clients' },
                  { icon: RefreshCcw, label: 'Relances' },
                ].map(({ icon: Icon, label, active }) => (
                  <div
                    key={label}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[11px] ${
                      active
                        ? 'bg-indigo-50 font-semibold text-indigo-700'
                        : 'text-slate-500'
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </div>
                ))}
              </div>

              <div className="mt-12 rounded-xl bg-slate-50 p-3">
                <div className="mb-2 h-2 w-16 rounded bg-slate-200" />
                <div className="h-1.5 w-full rounded bg-slate-200" />
                <div className="mt-1.5 h-1.5 w-3/4 rounded bg-slate-200" />
              </div>
            </aside>

            <div className="min-w-0 p-4 sm:p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    Vue d'ensemble
                  </p>
                  <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                    Tableau de bord
                  </h3>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-500">
                  <CalendarDays size={12} />
                  Cette période
                  <ChevronDown size={12} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  {
                    label: "Chiffre d'affaires",
                    value: '12 450 €',
                    icon: TrendingUp,
                    color: 'text-indigo-600',
                    bg: 'bg-indigo-50',
                  },
                  {
                    label: 'En attente',
                    value: '2 840 €',
                    icon: Clock3,
                    color: 'text-amber-600',
                    bg: 'bg-amber-50',
                  },
                  {
                    label: 'Encaissé',
                    value: '9 610 €',
                    icon: CircleCheck,
                    color: 'text-emerald-600',
                    bg: 'bg-emerald-50',
                  },
                  {
                    label: 'Impayés',
                    value: '840 €',
                    icon: TrendingDown,
                    color: 'text-rose-600',
                    bg: 'bg-rose-50',
                  },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                  <div
                    key={label}
                    className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-500 sm:text-xs">
                        {label}
                      </span>
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-lg ${bg} ${color}`}
                      >
                        <Icon size={14} />
                      </span>
                    </div>
                    <p className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">
                        Évolution des encaissements
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        Aperçu illustratif
                      </p>
                    </div>
                    <BarChart3 size={16} className="text-indigo-500" />
                  </div>

                  <div className="flex h-28 items-end gap-2 px-1">
                    {[38, 54, 44, 70, 57, 84, 65, 95, 73, 88, 61, 78].map(
                      (height, index) => (
                        <div
                          key={index}
                          className="flex flex-1 items-end"
                          style={{ height: '100%' }}
                        >
                          <div
                            className={`w-full rounded-t-sm ${
                              index === 7 ? 'bg-indigo-600' : 'bg-indigo-100'
                            }`}
                            style={{ height: `${height}%` }}
                          />
                        </div>
                      ),
                    )}
                  </div>
                  <div className="mt-2 flex justify-between text-[9px] text-slate-400">
                    <span>Jan.</span>
                    <span>Fév.</span>
                    <span>Mars</span>
                    <span>Avr.</span>
                    <span>Mai</span>
                    <span>Juin</span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-800">
                      Dernières opérations
                    </p>
                    <ArrowUpRight size={14} className="text-slate-400" />
                  </div>

                  <div className="space-y-4">
                    {[
                      {
                        name: 'Facture client',
                        date: "Aujourd'hui",
                        amount: '+ 850 €',
                        color: 'bg-emerald-50 text-emerald-600',
                        icon: Receipt,
                      },
                      {
                        name: 'Relance envoyée',
                        date: 'Hier',
                        amount: 'En attente',
                        color: 'bg-amber-50 text-amber-600',
                        icon: RefreshCcw,
                      },
                      {
                        name: 'Nouveau devis',
                        date: 'Hier',
                        amount: '1 200 €',
                        color: 'bg-indigo-50 text-indigo-600',
                        icon: FileText,
                      },
                    ].map(({ name, date, amount, color, icon: Icon }) => (
                      <div key={name} className="flex items-center gap-2.5">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${color}`}
                        >
                          <Icon size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[10px] font-medium text-slate-700">
                            {name}
                          </p>
                          <p className="mt-0.5 text-[9px] text-slate-400">
                            {date}
                          </p>
                        </div>
                        <span className="whitespace-nowrap text-[10px] font-semibold text-slate-700">
                          {amount}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -left-1 top-28 hidden w-48 rounded-2xl border border-slate-100 bg-white p-4 shadow-xl shadow-slate-900/10 lg:block xl:-left-10">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <CircleCheck size={16} />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-800">
              Paiement reçu
            </p>
            <p className="text-[9px] text-slate-400">Facture #2026</p>
          </div>
        </div>
        <p className="text-xl font-semibold text-slate-900">850,00 €</p>
        <p className="mt-1 text-[9px] text-emerald-600">
          Encaissement enregistré
        </p>
      </div>

      <div className="absolute -right-1 bottom-16 hidden w-52 rounded-2xl border border-slate-100 bg-white p-4 shadow-xl shadow-slate-900/10 lg:block xl:-right-10">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <RefreshCcw size={15} />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-800">
              Suivi des relances
            </p>
            <p className="text-[9px] text-slate-400">Factures à suivre</p>
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-slate-500">En attente</span>
          <span className="font-semibold text-slate-800">08 factures</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-2/3 rounded-full bg-amber-400" />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================

export default function LandingPage() {
  const navigate = useNavigate();

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>(
    'monthly',
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleRegister = () => navigate('/register');
  const handleLogin = () => navigate('/login');

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const handleChoosePlan = () => {
    handleRegister();
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Rendu d'une cellule de valeur (check / croix / texte)
  const renderCellValue = (value: boolean | string) => {
    if (typeof value === 'boolean') {
      return value ? (
        <Check size={18} className="mx-auto text-emerald-600" />
      ) : (
        <X size={18} className="mx-auto text-slate-300" />
      );
    }
    return <span className="text-xs font-medium text-slate-600">{value}</span>;
  };

  // Rendu de l'en-tête de colonne d'un plan (tarif + lien)
  const renderPlanHeader = (plan: PricingPlan) => {
    const isLifetime = plan.id === 'legende';
    const isPopular = plan.id === 'pro';

    const price = isLifetime
      ? plan.lifetimePrice!
      : billingCycle === 'monthly'
        ? plan.monthlyPrice!
        : plan.yearlyPrice!;

    const period = isLifetime
      ? 'paiement unique'
      : billingCycle === 'monthly'
        ? '/ mois'
        : '/ an';

    return (
      <th
        key={plan.id}
        className={`px-4 py-6 text-center align-top ${
          isLifetime
            ? 'bg-slate-950'
            : isPopular
              ? 'bg-indigo-50/70'
              : 'bg-slate-50'
        }`}
      >
        <div className="flex flex-col items-center gap-2">
          {plan.badge && (
            <span className="rounded-full bg-indigo-600 px-3 py-1 text-[10px] font-bold text-white shadow-sm">
              {plan.badge}
            </span>
          )}

          <span
            className={`text-base font-bold tracking-tight ${
              isLifetime ? 'text-white' : 'text-slate-950'
            }`}
          >
            {plan.name}
          </span>

          <div className="flex items-baseline gap-1">
            <span
              className={`text-3xl font-extrabold tracking-tight ${
                isLifetime ? 'text-white' : 'text-slate-950'
              }`}
            >
              {price.toLocaleString('fr-FR')}
            </span>
            <span
              className={`text-[11px] font-semibold ${
                isLifetime ? 'text-slate-300' : 'text-slate-500'
              }`}
            >
              € {period}
            </span>
          </div>

          <p
            className={`text-[11px] font-semibold ${
              isLifetime ? 'text-amber-300' : 'text-emerald-600'
            }`}
          >
            {isLifetime ? 'Accès à vie' : "14 jours d'essai gratuit"}
          </p>

          <button
            type="button"
            onClick={handleChoosePlan}
            className={`mt-2 w-full max-w-[150px] rounded-full px-4 py-2.5 text-xs font-bold transition-all ${
              isLifetime
                ? 'bg-white text-slate-950 hover:bg-indigo-50'
                : isPopular
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 hover:bg-indigo-700'
                  : 'bg-slate-950 text-white hover:bg-indigo-700'
            }`}
          >
            Créer mon compte
          </button>
        </div>
      </th>
    );
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[#f2f1e9] px-3 py-2 font-sans text-slate-900 sm:px-4 sm:py-4 lg:px-6">
      <div className="pointer-events-none fixed -left-24 top-1/4 hidden h-80 w-80 rounded-full border border-emerald-900/10 lg:block" />
      <div className="pointer-events-none fixed -right-24 bottom-1/4 hidden h-96 w-96 rounded-full border border-emerald-900/10 lg:block" />

      <div className="relative mx-auto max-w-[1440px] overflow-hidden rounded-[24px] bg-white shadow-[0_20px_80px_-30px_rgba(15,23,42,0.18)] sm:rounded-[30px]">
        <div className="flex min-h-8 items-center justify-center bg-slate-950 px-4 py-2 text-center text-[10px] font-medium tracking-wide text-white sm:text-xs">
          Une gestion plus claire pour votre activité
        </div>

        <nav className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 backdrop-blur-xl">
          <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
            <button type="button" onClick={scrollToTop} aria-label="Retour à l'accueil FUNMI">
              <Logo />
            </button>

            <div className="hidden items-center gap-8 md:flex">
              <a href="#features" className="text-[13px] font-medium text-slate-600 transition-colors hover:text-indigo-600">
                Fonctionnalités
              </a>
              <a href="#pricing" className="text-[13px] font-medium text-slate-600 transition-colors hover:text-indigo-600">
                Tarifs
              </a>
              <a href="#how-it-works" className="text-[13px] font-medium text-slate-600 transition-colors hover:text-indigo-600">
                Fonctionnement
              </a>
              <a href="#faq" className="text-[13px] font-medium text-slate-600 transition-colors hover:text-indigo-600">
                FAQ
              </a>
            </div>

            <div className="hidden items-center gap-3 md:flex">
              <button
                type="button"
                onClick={handleLogin}
                className="px-4 py-2 text-[13px] font-semibold text-slate-700 transition-colors hover:text-indigo-600"
              >
                Connexion
              </button>
              <button
                type="button"
                onClick={handleRegister}
                className="group flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-3 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-indigo-700"
              >
                Commencer
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </button>
            </div>

            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 md:hidden"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <XIcon size={21} /> : <Menu size={21} />}
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="border-t border-slate-100 bg-white px-5 py-5 md:hidden">
              <div className="space-y-1">
                {[
                  ['Fonctionnalités', '#features'],
                  ['Tarifs', '#pricing'],
                  ['Fonctionnement', '#how-it-works'],
                  ['FAQ', '#faq'],
                ].map(([label, href]) => (
                  <a
                    key={href}
                    href={href}
                    onClick={closeMobileMenu}
                    className="block rounded-lg px-3 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {label}
                  </a>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    handleLogin();
                    closeMobileMenu();
                  }}
                  className="rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700"
                >
                  Connexion
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleRegister();
                    closeMobileMenu();
                  }}
                  className="rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white"
                >
                  Commencer
                </button>
              </div>
            </div>
          )}
        </nav>

        {/* ======================================================
            HERO
        ====================================================== */}
        <section className="relative overflow-hidden bg-[#fafaf6] px-5 pb-20 pt-20 sm:px-8 sm:pb-24 sm:pt-24 lg:px-12 lg:pt-28">
          <div className="pointer-events-none absolute -left-40 top-10 h-96 w-96 rounded-full bg-emerald-100/50 blur-3xl" />
          <div className="pointer-events-none absolute -right-40 top-0 h-96 w-96 rounded-full bg-indigo-100/50 blur-3xl" />

          <div className="relative z-10 mx-auto max-w-4xl text-center">
            <h1 className="text-[clamp(2.8rem,6vw,5.7rem)] font-semibold leading-[1.04] tracking-[-0.055em] text-slate-950">
              Gérez mieux votre activité.
              <br />
              <span className="text-indigo-600">Encaissez sereinement.</span>
            </h1>

            <p className="mx-auto mt-7 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
              Devis, factures, relances clients et suivi de trésorerie :
              retrouvez les outils nécessaires à la gestion de votre activité
              dans un seul espace.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleRegister}
                className="group flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-7 py-4 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-all hover:bg-indigo-700 sm:w-auto"
              >
                Découvrir FUNMI
                <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
              </button>

              <a
                href="#features"
                className="flex w-full items-center justify-center rounded-full border border-slate-300 bg-white px-7 py-4 text-sm font-semibold text-slate-700 transition-all hover:border-indigo-300 hover:text-indigo-700 sm:w-auto"
              >
                Explorer les fonctionnalités
              </a>
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs text-slate-500">
              <span className="flex items-center gap-2">
                <Check size={14} className="text-emerald-600" />
                Gestion centralisée
              </span>
              <span className="flex items-center gap-2">
                <Check size={14} className="text-emerald-600" />
                Suivi des paiements
              </span>
              <span className="flex items-center gap-2">
                <Check size={14} className="text-emerald-600" />
                Accès en ligne
              </span>
            </div>
          </div>

          <DashboardPreview />
        </section>

        {/* ======================================================
            BANDEAU DE POSITIONNEMENT
        ====================================================== */}
        <section className="border-y border-slate-100 bg-white px-5 py-8 sm:px-8 lg:px-12">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 md:grid-cols-4">
            {[
              { icon: Receipt, title: 'Facturation', description: 'Devis et factures' },
              { icon: RefreshCcw, title: 'Relances', description: 'Suivi des échéances' },
              { icon: BarChart3, title: 'Trésorerie', description: 'Vision des encaissements' },
              { icon: Users, title: 'Clients', description: 'Informations centralisées' },
            ].map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-indigo-600">
                  <Icon size={19} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ======================================================
            FONCTIONNALITÉS (avec les 16 modules)
        ====================================================== */}
        <section id="features" className="scroll-mt-24 bg-white px-5 py-24 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-6xl">
            <div className="grid items-end gap-8 md:grid-cols-2">
              <div>
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
                  Une gestion plus simple
                </p>
                <h2 className="text-4xl font-semibold leading-[1.12] tracking-tight text-slate-950 sm:text-5xl">
                  Tout ce qu'il faut pour piloter votre activité.
                </h2>
              </div>

              <p className="max-w-lg text-base leading-8 text-slate-600 md:justify-self-end">
                FUNMI rassemble vos opérations de gestion dans un espace
                organisé. Vous suivez vos documents, vos clients et vos
                encaissements avec une vision plus claire.
              </p>
            </div>

            {/* Grille éditoriale */}
            <div className="mt-14 grid gap-5 md:grid-cols-12">
              <div className="group overflow-hidden rounded-[24px] border border-slate-200 bg-[#f7f8fc] p-7 md:col-span-7 md:p-9">
                <div className="flex h-full flex-col">
                  <div className="max-w-md">
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                      <RefreshCcw size={23} />
                    </div>
                    <h3 className="text-2xl font-semibold tracking-tight text-slate-950">
                      Des relances mieux organisées
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      Gardez un œil sur les factures en attente et organisez
                      vos rappels clients pour ne plus perdre le fil de vos
                      encaissements.
                    </p>
                  </div>

                  <div className="mt-9 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-transform duration-500 group-hover:-translate-y-1">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Suivi des factures</p>
                        <p className="mt-1 text-[10px] text-slate-400">Exemple de présentation</p>
                      </div>
                      <RefreshCcw size={17} className="text-indigo-600" />
                    </div>

                    {[
                      ['Facture #1048', 'Client A', 'À relancer'],
                      ['Facture #1042', 'Client B', 'En attente'],
                      ['Facture #1039', 'Client C', 'À suivre'],
                    ].map(([invoice, client, status]) => (
                      <div
                        key={invoice}
                        className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 py-3"
                      >
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{invoice}</p>
                          <p className="mt-1 text-[10px] text-slate-400">{client}</p>
                        </div>
                        <span className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] font-medium text-amber-700">
                          {status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="group overflow-hidden rounded-[24px] border border-slate-200 bg-[#f8faf8] p-7 md:col-span-5 md:p-9">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <Receipt size={23} />
                </div>
                <h3 className="text-2xl font-semibold tracking-tight text-slate-950">
                  Vos documents commerciaux au même endroit
                </h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  Préparez vos devis et factures, retrouvez vos documents et
                  suivez leur évolution depuis votre espace de gestion.
                </p>

                <div className="relative mt-8 flex justify-center">
                  <div className="w-full max-w-[250px] rotate-[-5deg] rounded-2xl border border-slate-200 bg-white p-5 shadow-lg transition-transform duration-500 group-hover:rotate-0">
                    <div className="flex items-center justify-between">
                      <div className="h-7 w-7 rounded-lg bg-indigo-600" />
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                        Document
                      </span>
                    </div>
                    <div className="mt-6 h-2 w-24 rounded bg-slate-200" />
                    <div className="mt-2 h-1.5 w-36 rounded bg-slate-100" />
                    <div className="mt-5 space-y-2">
                      <div className="h-1.5 w-full rounded bg-slate-100" />
                      <div className="h-1.5 w-full rounded bg-slate-100" />
                      <div className="h-1.5 w-4/5 rounded bg-slate-100" />
                    </div>
                    <div className="mt-7 border-t border-slate-100 pt-4">
                      <div className="ml-auto h-2 w-20 rounded bg-indigo-100" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="group overflow-hidden rounded-[24px] border border-slate-200 bg-[#fbf8f2] p-7 md:col-span-5 md:p-9">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  <BarChart3 size={23} />
                </div>
                <h3 className="text-2xl font-semibold tracking-tight text-slate-950">
                  Une vision claire de votre trésorerie
                </h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  Consultez les montants facturés, les paiements reçus et les
                  sommes encore en attente pour mieux suivre votre activité.
                </p>

                <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-800">Encaissements</p>
                    <TrendingUp size={17} className="text-emerald-600" />
                  </div>
                  <div className="mt-5 flex h-24 items-end gap-2">
                    {[40, 65, 48, 80, 58, 90, 72, 100].map((height, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t-md bg-amber-200 transition-colors group-hover:bg-indigo-300"
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex justify-between text-[9px] text-slate-400">
                    <span>Période 1</span>
                    <span>Période 2</span>
                    <span>Période 3</span>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-[#f5f5fb] p-7 md:col-span-7 md:p-9">
                <div className="grid items-center gap-8 sm:grid-cols-[1fr_0.8fr]">
                  <div>
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                      <Users size={23} />
                    </div>
                    <h3 className="text-2xl font-semibold tracking-tight text-slate-950">
                      Gardez vos informations clients à portée de main
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      Retrouvez les informations de vos clients et les
                      documents associés sans multiplier les fichiers et les
                      outils.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="mb-4 text-xs font-semibold text-slate-800">Fiche client</p>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                        CL
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Client</p>
                        <p className="text-[10px] text-slate-400">Informations de contact</p>
                      </div>
                    </div>
                    <div className="mt-5 space-y-3">
                      <div className="h-1.5 w-full rounded bg-slate-100" />
                      <div className="h-1.5 w-4/5 rounded bg-slate-100" />
                      <div className="h-1.5 w-3/5 rounded bg-slate-100" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ✅ LES 16 MODULES FUNMI */}
            <div className="mt-20">
              <div className="mb-9 text-center">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
                  Modules inclus
                </p>
                <h3 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                  Toutes les fonctionnalités de votre espace
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {ALL_FEATURES.map(({ icon: Icon, name }) => (
                  <div
                    key={name}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-[#fafaf6] p-4 transition-colors hover:border-indigo-200 hover:bg-indigo-50/40"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/60">
                      <Icon size={17} />
                    </div>
                    <span className="text-sm font-semibold text-slate-800">{name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================
            FONCTIONNEMENT
        ====================================================== */}
        <section id="how-it-works" className="scroll-mt-24 bg-[#f8f8f5] px-5 py-24 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
                Comment ça marche ?
              </p>
              <h2 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                Une gestion organisée en quelques étapes.
              </h2>
              <p className="mt-5 text-base leading-7 text-slate-600">
                Retrouvez vos principaux outils de gestion dans un espace
                conçu pour vous aider à suivre votre activité.
              </p>
            </div>

            <div className="mt-14 grid gap-5 md:grid-cols-3">
              {[
                {
                  number: '01',
                  icon: CreditCard,
                  title: 'Configurez votre espace',
                  description: 'Créez votre compte et renseignez les informations nécessaires à votre activité.',
                },
                {
                  number: '02',
                  icon: FileText,
                  title: 'Gérez vos documents',
                  description: 'Préparez vos devis et factures, puis retrouvez-les dans votre espace.',
                },
                {
                  number: '03',
                  icon: BarChart3,
                  title: 'Suivez votre activité',
                  description: 'Consultez vos encaissements, vos échéances et les factures à suivre.',
                },
              ].map(({ number, icon: Icon, title, description }) => (
                <div key={number} className="rounded-2xl border border-slate-200 bg-white p-7">
                  <div className="mb-8 flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                      <Icon size={21} />
                    </div>
                    <span className="text-sm font-semibold tracking-widest text-slate-300">{number}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ======================================================
            TARIFS : TABLEAU AVEC PRIX + LIENS INTÉGRÉS
        ====================================================== */}
        <section id="pricing" className="scroll-mt-24 bg-white px-5 py-24 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
                Nos formules
              </p>

              <h2 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                Choisissez la formule adaptée à votre activité.
              </h2>

              <p className="mt-5 text-base leading-8 text-slate-600">
                Comparez les fonctionnalités et les ressources incluses dans
                chaque formule pour faire le bon choix.
              </p>

              <div className="mt-9 inline-flex flex-wrap items-center justify-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1.5">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  aria-pressed={billingCycle === 'monthly'}
                  className={`rounded-full px-6 py-3 text-sm font-semibold transition-all ${
                    billingCycle === 'monthly'
                      ? 'bg-slate-950 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  Mensuel
                </button>

                <button
                  type="button"
                  onClick={() => setBillingCycle('yearly')}
                  aria-pressed={billingCycle === 'yearly'}
                  className={`flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-all ${
                    billingCycle === 'yearly'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-indigo-600'
                  }`}
                >
                  Annuel
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                      billingCycle === 'yearly'
                        ? 'bg-white/20 text-white'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    2 mois offerts
                  </span>
                </button>
              </div>
            </div>

            {/* ✅ TABLEAU UNIQUE : tarifs + liens dans l'en-tête (colonnes 2 à 5) */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] table-fixed">
                  <thead>
                    <tr>
                      {/* Colonne 1 : étroite */}
                      <th className="w-[220px] bg-slate-50 px-5 py-6 text-left align-bottom">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Fonctionnalités
                        </span>
                      </th>
                      {PRICING_PLANS.map(renderPlanHeader)}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {FEATURE_COMPARISON.map((feature) => (
                      <tr key={feature.name} className="transition-colors hover:bg-slate-50/70">
                        <td className="px-5 py-3.5 text-sm font-medium text-slate-900">
                          {feature.name}
                        </td>
                        <td className="px-4 py-3.5 text-center">{renderCellValue(feature.essentiel)}</td>
                        <td className="bg-indigo-50/30 px-4 py-3.5 text-center">{renderCellValue(feature.pro)}</td>
                        <td className="px-4 py-3.5 text-center">{renderCellValue(feature.business)}</td>
                        <td className="bg-slate-50/60 px-4 py-3.5 text-center">{renderCellValue(feature.legende)}</td>
                      </tr>
                    ))}
                  </tbody>

                  <tfoot>
                    <tr className="border-t border-slate-200">
                      <td className="px-5 py-5" />
                      {PRICING_PLANS.map((plan) => {
                        const isLifetime = plan.id === 'legende';
                        const isPopular = plan.id === 'pro';
                        return (
                          <td
                            key={plan.id}
                            className={`px-4 py-5 text-center ${
                              isLifetime
                                ? 'bg-slate-950'
                                : isPopular
                                  ? 'bg-indigo-50/70'
                                  : 'bg-slate-50'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={handleChoosePlan}
                              className={`w-full max-w-[150px] rounded-full px-4 py-2.5 text-xs font-bold transition-all ${
                                isLifetime
                                  ? 'bg-white text-slate-950 hover:bg-indigo-50'
                                  : isPopular
                                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                    : 'bg-slate-950 text-white hover:bg-indigo-700'
                              }`}
                            >
                              Choisir {plan.name}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Tableau des ressources */}
            <div className="mt-10 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] table-fixed">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="w-[220px] px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Ressource
                      </th>
                      <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Essentiel
                      </th>
                      <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Pro
                      </th>
                      <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Business
                      </th>
                      <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Légende
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {PLAN_RESOURCES.map((row) => (
                      <tr key={row.resource} className="transition-colors hover:bg-slate-50/70">
                        <td className="px-5 py-3.5 text-sm font-medium text-slate-900">{row.resource}</td>
                        <td className="px-4 py-3.5 text-center text-sm text-slate-600">{row.essentiel}</td>
                        <td className="bg-indigo-50/30 px-4 py-3.5 text-center text-sm text-slate-600">{row.pro}</td>
                        <td className="px-4 py-3.5 text-center text-sm text-slate-600">{row.business}</td>
                        <td className="bg-slate-50/60 px-4 py-3.5 text-center text-sm text-slate-600">{row.legende}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="mt-10 text-center text-xs leading-6 text-slate-400">
              Créez votre compte gratuitement. La souscription et le paiement
              s'effectuent ensuite depuis votre espace FUNMI.
            </p>
          </div>
        </section>

        {/* ======================================================
            BLOC DE CONFIANCE
        ====================================================== */}
        <section className="bg-[#f8f8f5] px-5 py-20 sm:px-8 lg:px-12">
          <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2">
            <div>
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
                Votre activité, votre espace
              </p>
              <h2 className="text-4xl font-semibold leading-tight tracking-tight text-slate-950">
                Moins de dispersion. Plus de visibilité.
              </h2>
              <p className="mt-5 text-base leading-8 text-slate-600">
                Lorsque les informations sont éparpillées, le suivi de
                l'activité devient plus compliqué. FUNMI vous aide à retrouver
                vos documents et vos opérations dans un même environnement.
              </p>

              <button
                type="button"
                onClick={handleRegister}
                className="group mt-8 inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                Créer mon espace
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </button>
            </div>

            <div className="relative mx-auto w-full max-w-md">
              <div className="absolute inset-5 rounded-full bg-indigo-100/70 blur-3xl" />
              <div className="relative rounded-[26px] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-5">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Votre espace FUNMI</p>
                    <p className="mt-1 text-xs text-slate-400">Une vue regroupée de votre activité</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Wallet size={19} />
                  </div>
                </div>

                <div className="space-y-3 pt-5">
                  {[
                    { icon: Receipt, title: 'Documents commerciaux', detail: 'Devis et factures', color: 'bg-indigo-50 text-indigo-600' },
                    { icon: RefreshCcw, title: 'Suivi des relances', detail: 'Échéances et rappels', color: 'bg-amber-50 text-amber-600' },
                    { icon: BarChart3, title: 'Suivi financier', detail: 'Encaissements et factures', color: 'bg-emerald-50 text-emerald-600' },
                    { icon: Users, title: 'Gestion des clients', detail: 'Informations et historique', color: 'bg-violet-50 text-violet-600' },
                  ].map(({ icon: Icon, title, detail, color }) => (
                    <div key={title} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
                        <Icon size={18} />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-slate-800">{title}</p>
                        <p className="mt-1 text-[10px] text-slate-400">{detail}</p>
                      </div>
                      <ArrowUpRight size={15} className="text-slate-300" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================
            FAQ
        ====================================================== */}
        <section id="faq" className="scroll-mt-24 bg-white px-5 py-24 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-3xl">
            <div className="mb-12 text-center">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
                Besoin de précisions ?
              </p>
              <h2 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                Questions fréquentes.
              </h2>
              <p className="mt-5 text-base text-slate-600">
                Quelques réponses pour mieux découvrir FUNMI.
              </p>
            </div>

            <div className="space-y-3">
              {FAQ_ITEMS.map((item, index) => {
                const isOpen = openFaq === index;

                return (
                  <div key={item.question} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : index)}
                      className="flex w-full items-center justify-between gap-5 px-5 py-5 text-left transition-colors hover:bg-slate-50 sm:px-6"
                      aria-expanded={isOpen}
                    >
                      <span className="text-sm font-semibold text-slate-900 sm:text-base">{item.question}</span>
                      <ChevronDown
                        size={19}
                        className={`shrink-0 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </button>

                    <div className={`grid transition-all duration-300 ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="overflow-hidden">
                        <p className="px-5 pb-5 text-sm leading-7 text-slate-600 sm:px-6">{item.answer}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ======================================================
            CTA FINAL
        ====================================================== */}
        <section className="relative overflow-hidden bg-slate-950 px-5 py-24 sm:px-8 lg:px-12">
          <div className="pointer-events-none absolute -right-32 -top-40 h-96 w-96 rounded-full bg-indigo-600/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />

          <div className="relative mx-auto max-w-4xl text-center">
            <div className="mx-auto mb-7 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white">
              <Wallet size={25} />
            </div>

            <h2 className="text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
              Donnez une nouvelle organisation à votre gestion.
            </h2>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-slate-300">
              Centralisez vos documents, suivez vos paiements et gardez une
              meilleure visibilité sur votre activité avec FUNMI.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleRegister}
                className="group flex w-full items-center justify-center gap-2 rounded-full bg-white px-7 py-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-indigo-50 sm:w-auto"
              >
                Commencer avec FUNMI
                <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
              </button>

              <button
                type="button"
                onClick={handleLogin}
                className="w-full rounded-full border border-white/25 px-7 py-4 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
              >
                Se connecter
              </button>
            </div>
          </div>
        </section>

        {/* ======================================================
            FOOTER
        ====================================================== */}
        <footer className="border-t border-slate-100 bg-white px-5 pb-8 pt-14 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 grid gap-10 sm:grid-cols-2 md:grid-cols-5">
              <div className="md:col-span-2">
                <button type="button" onClick={scrollToTop} aria-label="Retour en haut de page">
                  <Logo />
                </button>

                <p className="mt-5 max-w-xs text-sm leading-7 text-slate-500">
                  FUNMI vous accompagne dans la gestion de vos documents
                  commerciaux, de vos relances et du suivi de votre activité.
                </p>

                <div className="mt-6 flex items-center gap-3">
                  <a href={SOCIAL_LINKS.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" title="LinkedIn" className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600">
                    <Contact size={18} />
                  </a>
                  <a href={SOCIAL_LINKS.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" title="Facebook" className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600">
                    <Users size={18} />
                  </a>
                  <a href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" title="Instagram" className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600">
                    <Camera size={18} />
                  </a>
                  <a href={SOCIAL_LINKS.comeup} target="_blank" rel="noopener noreferrer" aria-label="ComeUp" title="ComeUp" className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600">
                    <ExternalLink size={18} />
                  </a>
                </div>
              </div>

              <div>
                <h4 className="mb-5 text-sm font-semibold text-slate-900">Produit</h4>
                <ul className="space-y-3 text-sm text-slate-500">
                  <li><a href="#features" className="transition-colors hover:text-indigo-600">Fonctionnalités</a></li>
                  <li><a href="#pricing" className="transition-colors hover:text-indigo-600">Tarifs</a></li>
                  <li><a href="#how-it-works" className="transition-colors hover:text-indigo-600">Fonctionnement</a></li>
                </ul>
              </div>

              <div>
                <h4 className="mb-5 text-sm font-semibold text-slate-900">Votre compte</h4>
                <ul className="space-y-3 text-sm text-slate-500">
                  <li><a href="/register" className="transition-colors hover:text-indigo-600">Inscription</a></li>
                  <li><a href="/login" className="transition-colors hover:text-indigo-600">Connexion</a></li>
                  <li><a href="#faq" className="transition-colors hover:text-indigo-600">FAQ</a></li>
                </ul>
              </div>

              <div>
                <h4 className="mb-5 text-sm font-semibold text-slate-900">Informations légales</h4>
                <ul className="space-y-3 text-sm text-slate-500">
                  <li><a href="/privacy" className="transition-colors hover:text-indigo-600">Confidentialité</a></li>
                  <li><a href="/terms" className="transition-colors hover:text-indigo-600">Conditions</a></li>
                  <li><a href="/refund" className="transition-colors hover:text-indigo-600">Remboursement</a></li>
                </ul>
              </div>
            </div>

            <div className="flex flex-col items-center justify-between gap-5 border-t border-slate-100 pt-7 md:flex-row">
              <p className="text-xs text-slate-400">
                © {new Date().getFullYear()} FUNMI. Tous droits réservés.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-5 text-xs text-slate-400">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Inscription disponible
                </span>
                <span className="flex items-center gap-1.5">
                  <Lock size={12} />
                  Espace de gestion sécurisé
                </span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}