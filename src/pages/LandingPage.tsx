// src/pages/LandingPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Check, Zap, Shield, BarChart3, Menu, X as XIcon, 
  ArrowRight, Star, Building2, Clock, Users, ChevronDown
} from 'lucide-react';

// ============================================================
// ⚙️ CONFIGURATION MODIFIABLE DES PLANS TARIFAIRES
// ============================================================
const PRICING_PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Idéal pour les indépendants qui démarrent.',
    priceMonthly: 0,
    priceYearly: 0,
    features: [
      'Jusqu\'à 5 clients actifs',
      '10 devis & factures / mois',
      'Relances manuelles',
      'Support par email'
    ],
    cta: 'Commencer gratuitement',
    popular: false,
    highlightColor: 'border-slate-700'
  },
  {
    id: 'pro',
    name: 'Professionnel',
    description: 'Pour les artisans et TPE en croissance.',
    priceMonthly: 29,
    priceYearly: 290,
    features: [
      'Clients & devis illimités',
      'Relances automatiques par email',
      'E-facturation B2B (Réforme 2026)',
      'Tableau de bord financier',
      'Export comptable (FEC)',
      'Support prioritaire'
    ],
    cta: 'Essai gratuit de 14 jours',
    popular: true,
    highlightColor: 'border-indigo-500 shadow-indigo-500/20'
  },
  {
    id: 'business',
    name: 'Business',
    description: 'Pour les équipes et les besoins avancés.',
    priceMonthly: 79,
    priceYearly: 790,
    features: [
      'Tout du plan Professionnel',
      'Jusqu\'à 5 utilisateurs',
      'Signature électronique intégrée',
      'API & Webhooks',
      'Manager de compte dédié',
      'Formation à la demande'
    ],
    cta: 'Contacter les ventes',
    popular: false,
    highlightColor: 'border-slate-700'
  }
];

// ============================================================
// 💬 DONNÉES DES TÉMOIGNAGES (Facilement modifiable)
// ============================================================
const TESTIMONIALS = [
  {
    name: 'Sophie Martin',
    role: 'Gérante, Martin Rénovation',
    text: "Depuis que j'utilise RelancePro, mes délais de paiement ont été divisés par deux. Les relances automatiques sont un gain de temps énorme et très professionnel.",
    rating: 5
  },
  {
    name: 'Thomas Dubois',
    role: 'Freelance en Développement Web',
    text: "L'interface est incroyablement intuitive. J'ai pu générer mes premières factures conformes à la réforme 2026 en moins de 5 minutes. Je recommande à 100%.",
    rating: 5
  },
  {
    name: 'Claire Lefebvre',
    role: 'Directrice, Agence Créative Nord',
    text: "Le tableau de bord de trésorerie m'a permis de mieux anticiper mes flux. Le support client est réactif et de très bonne qualité. Un outil indispensable.",
    rating: 5
  }
];

// ============================================================
// ❓ DONNÉES DE LA FAQ (Facilement modifiable)
// ============================================================
const FAQ_ITEMS = [
  {
    question: 'Puis-je changer de plan ou annuler à tout moment ?',
    answer: 'Absolument. Vous pouvez passer au plan supérieur immédiatement (le montant sera proratisé) ou annuler votre abonnement à tout moment depuis votre espace client. Aucun engagement de durée.'
  },
  {
    question: 'Mes données et celles de mes clients sont-elles sécurisées ?',
    answer: 'La sécurité est notre priorité n°1. Toutes vos données sont chiffrées de bout en bout et hébergées sur des serveurs situés en Union Européenne, en totale conformité avec le RGPD.'
  },
  {
    question: 'Comment fonctionne la période d\'essai gratuite ?',
    answer: 'Vous avez accès à toutes les fonctionnalités du plan Professionnel pendant 14 jours, sans demander de carte bancaire. À la fin de la période, vous choisissez de passer à un plan payant ou de rester sur le plan Starter gratuit.'
  },
  {
    question: 'L\'outil est-il conforme à la réforme de la facturation électronique 2026 ?',
    answer: 'Oui, RelancePro est conçu pour être 100% conforme. Nous générons nativement les fichiers Factur-X (XML + PDF) requis et nous mettrons à jour la plateforme automatiquement lors de l\'entrée en vigueur de la réforme.'
  },
  {
    question: 'Proposez-vous un support client en français ?',
    answer: 'Oui, notre équipe de support est basée en France et disponible par email ou chat du lundi au vendredi pour répondre à toutes vos questions techniques ou fonctionnelles.'
  }
];

// ============================================================
// 🎨 COMPOSANT PRINCIPAL
// ============================================================
export default function LandingPage() {
  const navigate = useNavigate();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleRegister = () => navigate('/register');
  const handleLogin = () => navigate('/login');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30">
      
      {/* 🌌 ARRIÈRE-PLAN SUBTIL (Effet Premium) */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[128px]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
      </div>

      {/* 🧭 NAVBAR */}
      <nav className="relative z-50 border-b border-white/5 bg-slate-950/50 backdrop-blur-xl sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Zap className="text-white" size={18} />
              </div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                RelancePro
              </span>
            </div>
            
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-slate-400 hover:text-white transition-colors">Fonctionnalités</a>
              <a href="#pricing" className="text-sm text-slate-400 hover:text-white transition-colors">Tarifs</a>
              <a href="#testimonials" className="text-sm text-slate-400 hover:text-white transition-colors">Témoignages</a>
              <a href="#faq" className="text-sm text-slate-400 hover:text-white transition-colors">FAQ</a>
            </div>

            <div className="hidden md:flex items-center gap-4">
              <button 
                onClick={handleLogin} 
                className="text-sm font-medium text-slate-300 hover:text-white transition-colors px-3 py-2"
              >
                Se connecter
              </button>
              <button 
                onClick={handleRegister}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all shadow-lg shadow-indigo-500/25 active:scale-95"
              >
                S'inscrire gratuitement
              </button>
            </div>

            <button className="md:hidden text-slate-300" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <XIcon /> : <Menu />}
            </button>
          </div>
        </div>
        
        {/* Menu Mobile */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/5 bg-slate-900 p-4 space-y-4">
            <a href="#features" className="block text-slate-300" onClick={() => setMobileMenuOpen(false)}>Fonctionnalités</a>
            <a href="#pricing" className="block text-slate-300" onClick={() => setMobileMenuOpen(false)}>Tarifs</a>
            <a href="#testimonials" className="block text-slate-300" onClick={() => setMobileMenuOpen(false)}>Témoignages</a>
            <a href="#faq" className="block text-slate-300" onClick={() => setMobileMenuOpen(false)}>FAQ</a>
            <button onClick={() => { handleLogin(); setMobileMenuOpen(false); }} className="block w-full text-left text-slate-300 py-2">Se connecter</button>
            <button onClick={() => { handleRegister(); setMobileMenuOpen(false); }} className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold">S'inscrire gratuitement</button>
          </div>
        )}
      </nav>

      {/* 🦸 HERO SECTION */}
      <section className="relative z-10 pt-20 pb-32 px-4 sm:px-6 lg:px-8 text-center">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold mb-8">
            <Star size={12} className="fill-indigo-400" />
            Nouveau : Conformité e-facturation 2026 intégrée
          </div>
          
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
            Encaissez vos factures <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400">
              sans effort ni relance.
            </span>
          </h1>
          
          <p className="text-lg sm:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            Automatisez vos relances clients, générez des devis professionnels en 2 minutes et pilotez votre trésorerie depuis un tableau de bord unique.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button 
              onClick={handleRegister}
              className="w-full sm:w-auto px-8 py-4 text-base font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-2 active:scale-95"
            >
              Créer mon compte gratuit
              <ArrowRight size={18} />
            </button>
            <button 
              onClick={handleLogin}
              className="w-full sm:w-auto px-8 py-4 text-base font-semibold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all flex items-center justify-center gap-2 backdrop-blur-sm"
            >
              <Building2 size={18} />
              J'ai déjà un compte
            </button>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-slate-500 text-sm">
            <div className="flex items-center gap-2"><Check size={16} className="text-emerald-500" /> Sans engagement</div>
            <div className="flex items-center gap-2"><Check size={16} className="text-emerald-500" /> Pas de carte bancaire requise</div>
            <div className="flex items-center gap-2"><Check size={16} className="text-emerald-500" /> Données hébergées en UE</div>
          </div>
        </div>
      </section>

      {/* ⚡ FEATURES */}
      <section id="features" className="relative z-10 py-24 bg-slate-900/50 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Tout ce dont vous avez besoin</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">Une suite complète pour gérer votre cycle de vente, de la création du devis à l'encaissement final.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Zap, title: 'Relances Automatiques', desc: 'Ne perdez plus de temps à relancer. Le système envoie des emails polis et personnalisés aux bons moments.' },
              { icon: Shield, title: 'Conformité 2026', desc: 'Soyez prêt pour la réforme de la facturation électronique avec la génération native de fichiers Factur-X.' },
              { icon: BarChart3, title: 'Trésorerie en temps réel', desc: 'Visualisez votre CA, vos impayés et vos prévisions dans un tableau de bord clair et actionnable.' }
            ].map((feature, idx) => (
              <div key={idx} className="group p-8 rounded-2xl bg-slate-800/30 border border-white/5 hover:border-indigo-500/30 hover:bg-slate-800/50 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <feature.icon className="text-indigo-400" size={24} />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-white">{feature.title}</h3>
                <p className="text-slate-400 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 💎 PRICING SECTION */}
      <section id="pricing" className="relative z-10 py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Des tarifs simples et transparents</h2>
            <p className="text-slate-400 mb-8">Choisissez le plan qui correspond à votre stade de développement.</p>
            
            <div className="inline-flex items-center bg-slate-900 border border-white/10 rounded-full p-1">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${
                  billingCycle === 'monthly' 
                    ? 'bg-indigo-600 text-white shadow-lg' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Mensuel
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`px-6 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2 ${
                  billingCycle === 'yearly' 
                    ? 'bg-indigo-600 text-white shadow-lg' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Annuel
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">-17%</span>
              </button>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 items-start">
            {PRICING_PLANS.map((plan) => {
              const price = billingCycle === 'monthly' ? plan.priceMonthly : plan.priceYearly;
              const period = billingCycle === 'monthly' ? '/mois' : '/an';
              
              return (
                <div 
                  key={plan.id}
                  className={`relative p-8 rounded-2xl border bg-slate-900/40 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 ${
                    plan.popular 
                      ? 'border-indigo-500 shadow-2xl shadow-indigo-500/10 ring-1 ring-indigo-500/50' 
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xs font-bold rounded-full shadow-lg">
                      Le plus populaire
                    </div>
                  )}

                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                    <p className="text-sm text-slate-400">{plan.description}</p>
                  </div>

                  <div className="mb-8">
                    <span className="text-4xl font-bold text-white">{price}€</span>
                    <span className="text-slate-500">{period}</span>
                    {billingCycle === 'yearly' && price > 0 && (
                      <p className="text-xs text-emerald-400 mt-2">
                        Soit {(price / 12).toFixed(2)}€ / mois, facturé annuellement
                      </p>
                    )}
                  </div>

                  <button 
                    onClick={handleRegister}
                    className={`w-full py-3 rounded-lg font-semibold transition-all mb-8 ${
                      plan.popular
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
                        : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
                    }`}
                  >
                    {plan.cta}
                  </button>

                  <ul className="space-y-4">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-sm text-slate-300">
                        <Check size={18} className="text-indigo-400 flex-shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ⭐ TÉMOIGNAGES CLIENTS (Nouveau) */}
      <section id="testimonials" className="relative z-10 py-24 bg-slate-900/50 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ils nous font confiance</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">Rejoignez des milliers de professionnels qui ont simplifié leur gestion administrative.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((testimonial, idx) => (
              <div key={idx} className="p-6 rounded-2xl bg-slate-800/30 border border-white/5 hover:border-indigo-500/20 transition-all duration-300">
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} size={16} className="fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-slate-300 leading-relaxed mb-6 italic">"{testimonial.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                    {testimonial.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{testimonial.name}</p>
                    <p className="text-xs text-slate-400">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ❓ FAQ EN ACCORDÉON (Nouveau) */}
      <section id="faq" className="relative z-10 py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Questions fréquentes</h2>
            <p className="text-slate-400">Tout ce que vous devez savoir avant de vous lancer.</p>
          </div>

          <div className="space-y-4">
            {FAQ_ITEMS.map((item, idx) => (
              <details 
                key={idx} 
                className="group bg-slate-900/40 border border-white/10 rounded-xl overflow-hidden transition-all duration-300 open:border-indigo-500/30 open:bg-slate-800/40"
              >
                <summary className="flex items-center justify-between p-5 cursor-pointer list-none">
                  <span className="text-base font-semibold text-white group-open:text-indigo-300 transition-colors">
                    {item.question}
                  </span>
                  <ChevronDown 
                    size={20} 
                    className="text-slate-400 transition-transform duration-300 group-open:rotate-180 group-open:text-indigo-400 flex-shrink-0 ml-4" 
                  />
                </summary>
                <div className="px-5 pb-5 text-slate-400 leading-relaxed text-sm border-t border-white/5 pt-4">
                  {item.answer}
                </div>
              </details>
            ))}
          </div>

          <div className="mt-12 text-center p-6 rounded-2xl bg-indigo-600/10 border border-indigo-500/20">
            <p className="text-indigo-200 mb-4">Vous avez d'autres questions ?</p>
            <button 
              onClick={handleRegister}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold transition-all shadow-lg shadow-indigo-500/25"
            >
              Contacter notre support
            </button>
          </div>
        </div>
      </section>

      {/* 🦶 FOOTER */}
      <footer className="relative z-10 border-t border-white/5 bg-slate-950 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center">
              <Zap className="text-white" size={14} />
            </div>
            <span className="font-semibold text-slate-300">RelancePro</span>
          </div>
          <div className="text-sm text-slate-500">
            © {new Date().getFullYear()} RelancePro. Tous droits réservés.
          </div>
          <div className="flex gap-6 text-sm text-slate-400">
            <a href="/privacy" className="hover:text-white transition-colors">Confidentialité</a>
            <a href="/legal" className="hover:text-white transition-colors">Mentions légales</a>
            <a href="#" className="hover:text-white transition-colors">CGV</a>
          </div>
        </div>
      </footer>
    </div>
  );
}