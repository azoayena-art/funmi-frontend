// src/App.tsx
// ✅ Lazy Loading : Chargement à la demande des pages pour optimiser le bundle initial
// 🍪 Intégration du bandeau cookies RGPD
// 📄 Pages légales : PrivacyPolicy + LegalNotices
// 🛡️ reCAPTCHA v3 : Protection anti-bot invisible
// 🔐 Routes de récupération et vérification de mot de passe

import { lazy, Suspense } from 'react';
import { Toaster } from "sonner";
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TeamProvider } from './context/TeamContext';

// ============================================================
// 🔑 reCAPTCHA v3 — Clé publique (Site Key)
// ============================================================
const RECAPTCHA_SITE_KEY =
  import.meta.env.VITE_RECAPTCHA_SITE_KEY ||
  '6Lev8TQsAAAAAJU9cC3ihFAwD2nIWsm_lUqKDNoJ';

// ============================================================
// 🚀 IMPORTS STATIQUES (critiques pour le démarrage)
// ============================================================
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard'; // Page d'accueil : doit être rapide

// ============================================================
// ⚡ IMPORTS DYNAMIQUES (lazy loading)
// Chargés uniquement quand l'utilisateur visite la route
// ============================================================

// Pages publiques
const PublicQuoteView = lazy(() => import('./pages/PublicQuoteView'));
const PublicInvoiceView = lazy(() => import('./pages/PublicInvoiceView'));
const PublicRequest = lazy(() => import('./pages/PublicRequest'));
const JoinTeam = lazy(() => import('./pages/JoinTeam'));
const AcceptInvitation = lazy(() => import('./pages/AcceptInvitation'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const ConfirmEmail = lazy(() => import('./pages/ConfirmEmail'));

// 🔐 Pages de récupération de mot de passe (publiques)
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

// Pages métier (utilisateur connecté)
const Prospects = lazy(() => import('./pages/Prospects'));
const Clients = lazy(() => import('./pages/Clients'));
const ClientDetail = lazy(() => import('./pages/ClientDetail'));
const Catalogue = lazy(() => import('./pages/Catalogue'));
const Quotes = lazy(() => import('./pages/Quotes'));
const Invoices = lazy(() => import('./pages/Invoices'));
const InvoiceDetail = lazy(() => import('./pages/InvoiceDetail'));
const ReceivedInvoices = lazy(() => import('./pages/ReceivedInvoices'));
const Receipts = lazy(() => import('./pages/Receipts'));
const Payments = lazy(() => import('./pages/Payments'));
const Reminders = lazy(() => import('./pages/Reminders'));

// Pages Trésorerie
const Treasury = lazy(() => import('./pages/Treasury'));
const CashOperations = lazy(() => import('./pages/CashOperations'));

// Pages Stats & Exports (pages lourdes, chargées à la demande)
const Statistics = lazy(() => import('./pages/Statistics'));
const ExportComptable = lazy(() => import('./pages/ExportComptable'));
const AccountMapping = lazy(() => import('./pages/AccountMapping'));
const ImportExport = lazy(() => import('./pages/ImportExport'));

// Pages Admin & Configuration
const TeamSettings = lazy(() => import('./pages/TeamSettings'));
const CompanySettings = lazy(() => import('./pages/CompanySettings'));
const SecurityMigration = lazy(() => import('./pages/SecurityMigration'));
const BackupUtility = lazy(() => import('./pages/BackupUtility'));
const SetupAttributes = lazy(() => import('./pages/SetupAttributes'));
const TestPaymentModal = lazy(() => import('./pages/TestPaymentModal'));

// 📄 Pages légales (publiques)
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const LegalNotices = lazy(() => import('./pages/LegalNotices'));

// ============================================================
// 🍪 COMPOSANTS GLOBAUX
// ============================================================
const CookieConsentBanner = lazy(() => import('./components/CookieConsentBanner'));

// ============================================================
// 🛡️ GARDE : Route protégée (utilisateur connecté ET vérifié)
// ============================================================
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin h-10 w-10 border-4 border-purple-600 border-t-transparent rounded-full"></div>
          <p className="text-sm text-slate-600 dark:text-slate-400">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 🛡️ Bloquer si l'email n'est pas vérifié
  if (user.emailVerification === false) {
    return <Navigate to={`/verify-email?email=${encodeURIComponent(user.email)}`} replace />;
  }

  return <>{children}</>;
}

// ============================================================
// 🛡️ GARDE : Route publique (déconnecté uniquement)
// ============================================================
function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="animate-spin h-10 w-10 border-4 border-purple-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

// ============================================================
// ⏳ LOADING FALLBACK (affiché pendant le chargement d'une page lazy)
// ============================================================
function PageLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin h-10 w-10 border-4 border-purple-600 border-t-transparent rounded-full"></div>
        <p className="text-sm text-slate-600 dark:text-slate-400">Chargement de la page...</p>
      </div>
    </div>
  );
}

// ============================================================
// 🗺️ TOUTES LES ROUTES DE L'APPLICATION
// ============================================================
function AppRoutes() {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Routes>
        {/* ===== ROUTES PUBLIQUES (Accessibles à tous) ===== */}
        <Route path="/v/:token" element={<PublicQuoteView />} />
        <Route path="/f/:token" element={<PublicInvoiceView />} />
        <Route path="/demande/:slug" element={<PublicRequest />} />
        <Route path="/join-team" element={<JoinTeam />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/confirm-email" element={<ConfirmEmail />} />

        <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
        <Route path="/accept-invitation" element={<AcceptInvitation />} />

        {/* ===== 🔐 RÉCUPÉRATION DE MOT DE PASSE ===== */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* ===== 📄 PAGES LÉGALES ===== */}
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/legal" element={<LegalNotices />} />

        {/* ===== REDIRECTION RACINE ===== */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* ===== ROUTES PROTÉGÉES (Nécessite connexion + email vérifié) ===== */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/statistics" element={<ProtectedRoute><Statistics /></ProtectedRoute>} />
        
        {/* CRM */}
        <Route path="/prospects" element={<ProtectedRoute><Prospects /></ProtectedRoute>} />
        <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
        <Route path="/clients/:id" element={<ProtectedRoute><ClientDetail /></ProtectedRoute>} />
        <Route path="/catalogue" element={<ProtectedRoute><Catalogue /></ProtectedRoute>} />
        
        {/* Devis & Factures */}
        <Route path="/quotes" element={<ProtectedRoute><Quotes /></ProtectedRoute>} />
        <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
        <Route path="/invoices/:id" element={<ProtectedRoute><InvoiceDetail /></ProtectedRoute>} />
        <Route path="/received-invoices" element={<ProtectedRoute><ReceivedInvoices /></ProtectedRoute>} />
        <Route path="/reminders" element={<ProtectedRoute><Reminders /></ProtectedRoute>} />
        <Route path="/receipts" element={<ProtectedRoute><Receipts /></ProtectedRoute>} />
        
        {/* Trésorerie & Compta */}
        <Route path="/payments" element={<ProtectedRoute><Payments /></ProtectedRoute>} />
        <Route path="/treasury" element={<ProtectedRoute><Treasury /></ProtectedRoute>} />
        <Route path="/cash-operations" element={<ProtectedRoute><CashOperations /></ProtectedRoute>} />
        <Route path="/export-comptable" element={<ProtectedRoute><ExportComptable /></ProtectedRoute>} />
        <Route path="/import-export" element={<ProtectedRoute><ImportExport /></ProtectedRoute>} />
        <Route path="/test-payment" element={<ProtectedRoute><TestPaymentModal /></ProtectedRoute>} />
        
        {/* Paramètres & Admin */}
        <Route path="/team-settings" element={<ProtectedRoute><TeamSettings /></ProtectedRoute>} />
        <Route path="/company-settings" element={<ProtectedRoute><CompanySettings /></ProtectedRoute>} />
        <Route path="/account-mapping" element={<ProtectedRoute><AccountMapping /></ProtectedRoute>} />
        <Route path="/admin/security-migration" element={<ProtectedRoute><SecurityMigration /></ProtectedRoute>} />

        {/* ===== ROUTES UTILITAIRES (À protéger si nécessaire en prod) ===== */}
        <Route path="/setup" element={<SetupAttributes />} />
        <Route path="/backup" element={<BackupUtility />} />
        
        {/* ===== REDIRECTION PAR DÉFAUT ===== */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}

// ============================================================
// 🎯 COMPOSANT PRINCIPAL
// ============================================================
export default function App() {
  return (
    <GoogleReCaptchaProvider
      reCaptchaKey={RECAPTCHA_SITE_KEY}
      language="fr"
      useRecaptchaNet={true}
      scriptProps={{
        async: false,
        defer: false,
        appendTo: 'head',
        nonce: undefined,
      }}
    >
      <AuthProvider>
        <TeamProvider>
          <Toaster
            position="top-right"
            richColors
            closeButton
            theme="system"
            toastOptions={{
              style: {
                fontSize: '14px',
              },
            }}
          />
          <BrowserRouter>
            <AppRoutes />
            
            {/* 🍪 BANDEAU COOKIES RGPD */}
            <Suspense fallback={null}>
              <CookieConsentBanner />
            </Suspense>
          </BrowserRouter>
        </TeamProvider>
      </AuthProvider>
    </GoogleReCaptchaProvider>
  );
}