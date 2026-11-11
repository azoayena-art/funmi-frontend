import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from "sonner";
import type { ReactNode } from 'react';
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';

import { AuthProvider, useAuth } from './context/AuthContext';
import { TeamProvider } from './context/TeamContext';
import { PaddleProvider } from './context/PaddleContext';

import SuperAdminRoute from './components/SuperAdminRoute';
import RequirePermission from './components/RequirePermission';

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6Lev8TQsAAAAAJU9cC3ihFAwD2nIWsm_lUqKDNoJ';

// ============================================================
// IMPORTS STATIQUES
// ============================================================
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import BalanceComptable from './pages/BalanceComptable';
import AuditLog from './pages/AuditLog';
import Billing from './pages/Billing';

// ============================================================
// IMPORTS DYNAMIQUES
// ============================================================
const LandingPage = lazy(() => import('./pages/LandingPage'));
const PublicQuoteView = lazy(() => import('./pages/PublicQuoteView'));
const PublicInvoiceView = lazy(() => import('./pages/PublicInvoiceView'));
const PublicRequest = lazy(() => import('./pages/PublicRequest'));
const JoinTeam = lazy(() => import('./pages/JoinTeam'));
const AcceptInvitation = lazy(() => import('./pages/AcceptInvitation'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const ConfirmEmail = lazy(() => import('./pages/ConfirmEmail'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

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
const Treasury = lazy(() => import('./pages/Treasury'));
const CashOperations = lazy(() => import('./pages/CashOperations'));
const Statistics = lazy(() => import('./pages/Statistics'));
const ImportExport = lazy(() => import('./pages/ImportExport'));
const Journal = lazy(() => import('./pages/Journal'));
const GrandLivre = lazy(() => import('./pages/GrandLivre'));
const ExportComptable = lazy(() => import('./pages/ExportComptable'));
const AccountMapping = lazy(() => import('./pages/AccountMapping'));
const TeamSettings = lazy(() => import('./pages/TeamSettings'));
const CompanySettings = lazy(() => import('./pages/CompanySettings'));
const BackupUtility = lazy(() => import('./pages/BackupUtility'));
const Pricing = lazy(() => import('./pages/Pricing'));
const SuperAdmin = lazy(() => import('./pages/SuperAdmin'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const LegalNotices = lazy(() => import('./pages/LegalNotices'));
const RefundPolicy = lazy(() => import('./pages/RefundPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const CookieConsentBanner = lazy(() => import('./components/CookieConsentBanner'));

// ============================================================
// COMPOSANTS DE PROTECTION
// ============================================================

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoadingFallback />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.emailVerification === false) return <Navigate to={`/verify-email?email=${encodeURIComponent(user.email)}`} replace />;
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoadingFallback />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function PageLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f2f1e9]">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
        <p className="text-sm text-slate-600">Chargement...</p>
      </div>
    </div>
  );
}

// ============================================================
// ROUTES
// ============================================================

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Routes>
        {/* ==================== 1. ROUTES PUBLIQUES ==================== */}
        <Route path="/" element={<PublicOnlyRoute><LandingPage /></PublicOnlyRoute>} />
        <Route path="/v/:token" element={<PublicQuoteView />} />
        <Route path="/f/:token" element={<PublicInvoiceView />} />
        <Route path="/demande/:slug" element={<PublicRequest />} />
        <Route path="/join-team" element={<JoinTeam />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/confirm-email" element={<ConfirmEmail />} />
        <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
        <Route path="/accept-invitation" element={<AcceptInvitation />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/legal" element={<LegalNotices />} />
        <Route path="/refund" element={<RefundPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/pricing" element={<ProtectedRoute><Pricing /></ProtectedRoute>} />

        {/* ==================== 2. SUPER ADMIN ==================== */}
        <Route path="/tunemetrouveraspas/admin" element={
          <ProtectedRoute>
            <SuperAdminRoute><SuperAdmin /></SuperAdminRoute>
          </ProtectedRoute>
        } />

        {/* ==================== 3. ROUTES TOUS PLANS (Essentiel, Pro, Business, Légende) ==================== */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/statistics" element={<ProtectedRoute><Statistics /></ProtectedRoute>} />
        <Route path="/prospects" element={<ProtectedRoute><Prospects /></ProtectedRoute>} />
        <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
        <Route path="/clients/:id" element={<ProtectedRoute><ClientDetail /></ProtectedRoute>} />
        <Route path="/catalogue" element={<ProtectedRoute><Catalogue /></ProtectedRoute>} />
        <Route path="/quotes" element={<ProtectedRoute><Quotes /></ProtectedRoute>} />
        <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
        <Route path="/invoices/:id" element={<ProtectedRoute><InvoiceDetail /></ProtectedRoute>} />
        <Route path="/company-settings" element={<ProtectedRoute><CompanySettings /></ProtectedRoute>} />
        <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />

        {/* ==================== 4. ROUTES PRO+ (Pro, Business, Légende) ==================== */}
        {/* Inclut : Factures fournisseurs, Relances, Reçus, Trésorerie */}
        <Route path="/received-invoices" element={
          <ProtectedRoute>
            <RequirePermission requiredPermission="invoices.suppliers">
              <ReceivedInvoices />
            </RequirePermission>
          </ProtectedRoute>
        } />
        <Route path="/reminders" element={
          <ProtectedRoute>
            <RequirePermission requiredPermission="reminders.view">
              <Reminders />
            </RequirePermission>
          </ProtectedRoute>
        } />
        <Route path="/receipts" element={
          <ProtectedRoute>
            <RequirePermission requiredPermission="receipts.view">
              <Receipts />
            </RequirePermission>
          </ProtectedRoute>
        } />
        <Route path="/payments" element={
          <ProtectedRoute>
            <RequirePermission requiredPermission="treasury.view">
              <Payments />
            </RequirePermission>
          </ProtectedRoute>
        } />
        <Route path="/treasury" element={
          <ProtectedRoute>
            <RequirePermission requiredPermission="treasury.view">
              <Treasury />
            </RequirePermission>
          </ProtectedRoute>
        } />
        <Route path="/cash-operations" element={
          <ProtectedRoute>
            <RequirePermission requiredPermission="treasury.view">
              <CashOperations />
            </RequirePermission>
          </ProtectedRoute>
        } />

        {/* ==================== 5. ROUTES BUSINESS+ (Business, Légende) ==================== */}
        {/* Inclut : Comptabilité avancée, Gestion d'équipe, Audit */}
        <Route path="/journal" element={
          <ProtectedRoute>
            <Journal />
          </ProtectedRoute>
        } />
        <Route path="/grand-livre" element={
          <ProtectedRoute>
            <GrandLivre />
          </ProtectedRoute>
        } />
        <Route path="/balance-comptable" element={
          <ProtectedRoute>
            <BalanceComptable />
          </ProtectedRoute>
        } />
        <Route path="/export-comptable" element={
          <ProtectedRoute>
            <ExportComptable />
          </ProtectedRoute>
        } />
        <Route path="/account-mapping" element={
          <ProtectedRoute>
            <AccountMapping />
          </ProtectedRoute>
        } />
        <Route path="/import-export" element={
          <ProtectedRoute>
            <ImportExport />
          </ProtectedRoute>
        } />
        <Route path="/team-settings" element={
          <ProtectedRoute>
            <RequirePermission requiredPermission="team.manage">
              <TeamSettings />
            </RequirePermission>
          </ProtectedRoute>
        } />
        <Route path="/backup" element={
          <ProtectedRoute>
            <RequirePermission requiredPermission="team.manage">
              <BackupUtility />
            </RequirePermission>
          </ProtectedRoute>
        } />
        <Route path="/audit-log" element={
          <ProtectedRoute>
            <RequirePermission requiredPermission="team.manage">
              <AuditLog />
            </RequirePermission>
          </ProtectedRoute>
        } />

        {/* ==================== 6. REDIRECTION PAR DÉFAUT ==================== */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}

// ============================================================
// APP PRINCIPAL
// ============================================================

export default function App() {
  return (
    <GoogleReCaptchaProvider reCaptchaKey={RECAPTCHA_SITE_KEY} language="fr" useRecaptchaNet={true} scriptProps={{ async: false, defer: false, appendTo: 'head', nonce: undefined }}>
      <AuthProvider>
        <TeamProvider>
          <PaddleProvider>
            <Toaster position="top-right" richColors closeButton theme="system" toastOptions={{ style: { fontSize: '14px' } }} />
            <BrowserRouter>
              <AppRoutes />
              <Suspense fallback={null}><CookieConsentBanner /></Suspense>
            </BrowserRouter>
          </PaddleProvider>
        </TeamProvider>
      </AuthProvider>
    </GoogleReCaptchaProvider>
  );
}