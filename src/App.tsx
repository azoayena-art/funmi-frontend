import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from "sonner";
import type { ReactNode } from 'react';
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';

import { AuthProvider, useAuth } from './context/AuthContext';
import { TeamProvider } from './context/TeamContext';
import ModuleGuard from './components/ModuleGuard';

// ✅ 1. Import de la Landing Page
import LandingPage from './pages/LandingPage'; 
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';

const PublicQuoteView = lazy(() => import('./pages/PublicQuoteView'));
const PublicInvoiceView = lazy(() => import('./pages/PublicInvoiceView'));
const PublicRequest = lazy(() => import('./pages/PublicRequest'));
const JoinTeam = lazy(() => import('./pages/JoinTeam'));
const AcceptInvitation = lazy(() => import('./pages/AcceptInvitation'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const ConfirmEmail = lazy(() => import('./pages/ConfirmEmail'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const LegalNotices = lazy(() => import('./pages/LegalNotices'));
const Pricing = lazy(() => import('./pages/Pricing'));
const PaddleCheckout = lazy(() => import('./pages/PaddleCheckout'));

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

const ExportComptable = lazy(() => import('./pages/ExportComptable'));
const AccountMapping = lazy(() => import('./pages/AccountMapping'));
const ImportExport = lazy(() => import('./pages/ImportExport'));
const Journal = lazy(() => import('./pages/Journal'));
const GrandLivre = lazy(() => import('./pages/GrandLivre'));
const BalanceComptable = lazy(() => import('./pages/BalanceComptable'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const TeamSettings = lazy(() => import('./pages/TeamSettings'));
const CompanySettings = lazy(() => import('./pages/CompanySettings'));
const BackupUtility = lazy(() => import('./pages/BackupUtility'));
const Billing = lazy(() => import('./pages/Billing'));

const CookieConsentBanner = lazy(() => import('./components/CookieConsentBanner'));

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6Lev8TQsAAAAAJU9cC3ihFAwD2nIWsm_lUqKDNoJ';

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
  if (!user) return <Navigate to="/login" replace />;
  if (user.emailVerification === false) {
    return <Navigate to={`/verify-email?email=${encodeURIComponent(user.email)}`} replace />;
  }
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="animate-spin h-10 w-10 border-4 border-purple-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }
  // ✅ Si l'utilisateur est connecté, on le redirige vers le dashboard, pas vers la landing
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

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

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Routes>
        {/* ✅ 2. La route racine est maintenant la Landing Page (publique, sans protection) */}
        <Route path="/" element={<LandingPage />} />
        
        <Route path="/v/:token" element={<PublicQuoteView />} />
        <Route path="/f/:token" element={<PublicInvoiceView />} />
        <Route path="/demande/:slug" element={<PublicRequest />} />
        <Route path="/join-team" element={<JoinTeam />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/confirm-email" element={<ConfirmEmail />} />
        
        {/* Routes publiques réservées aux non-connectés */}
        <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
        
        <Route path="/accept-invitation" element={<AcceptInvitation />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/legal" element={<LegalNotices />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/checkout" element={<PaddleCheckout />} />

        {/* Routes protégées */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        
        <Route path="/statistics" element={
          <ProtectedRoute>
            <ModuleGuard module="statistics"><Statistics /></ModuleGuard>
          </ProtectedRoute>
        } />
        
        <Route path="/prospects" element={<ProtectedRoute><Prospects /></ProtectedRoute>} />
        <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
        <Route path="/clients/:id" element={<ProtectedRoute><ClientDetail /></ProtectedRoute>} />
        <Route path="/catalogue" element={<ProtectedRoute><Catalogue /></ProtectedRoute>} />
        
        <Route path="/quotes" element={<ProtectedRoute><Quotes /></ProtectedRoute>} />
        <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
        <Route path="/invoices/:id" element={<ProtectedRoute><InvoiceDetail /></ProtectedRoute>} />
        <Route path="/received-invoices" element={
          <ProtectedRoute>
            <ModuleGuard module="receivedInvoices"><ReceivedInvoices /></ModuleGuard>
          </ProtectedRoute>
        } />
        <Route path="/receipts" element={<ProtectedRoute><Receipts /></ProtectedRoute>} />
        
        <Route path="/reminders" element={
          <ProtectedRoute>
            <ModuleGuard module="reminders"><Reminders /></ModuleGuard>
          </ProtectedRoute>
        } />
        <Route path="/payments" element={<ProtectedRoute><Payments /></ProtectedRoute>} />
        <Route path="/treasury" element={
          <ProtectedRoute>
            <ModuleGuard module="treasury"><Treasury /></ModuleGuard>
          </ProtectedRoute>
        } />
        <Route path="/cash-operations" element={
          <ProtectedRoute>
            <ModuleGuard module="cashOperations"><CashOperations /></ModuleGuard>
          </ProtectedRoute>
        } />
        
        <Route path="/journal" element={
          <ProtectedRoute>
            <ModuleGuard module="journal" showLockIcon={false}><Journal /></ModuleGuard>
          </ProtectedRoute>
        } />
        <Route path="/grand-livre" element={
          <ProtectedRoute>
            <ModuleGuard module="grandLivre" showLockIcon={false}><GrandLivre /></ModuleGuard>
          </ProtectedRoute>
        } />
        <Route path="/balance-comptable" element={
          <ProtectedRoute>
            <ModuleGuard module="balance" showLockIcon={false}><BalanceComptable /></ModuleGuard>
          </ProtectedRoute>
        } />
        <Route path="/export-comptable" element={
          <ProtectedRoute>
            <ModuleGuard module="exportComptable" showLockIcon={false}><ExportComptable /></ModuleGuard>
          </ProtectedRoute>
        } />
        <Route path="/account-mapping" element={
          <ProtectedRoute>
            <ModuleGuard module="accountMapping" showLockIcon={false}><AccountMapping /></ModuleGuard>
          </ProtectedRoute>
        } />
        <Route path="/import-export" element={
          <ProtectedRoute>
            <ModuleGuard module="importExport" showLockIcon={false}><ImportExport /></ModuleGuard>
          </ProtectedRoute>
        } />
        <Route path="/audit-log" element={
          <ProtectedRoute>
            <ModuleGuard module="audit" showLockIcon={false}><AuditLog /></ModuleGuard>
          </ProtectedRoute>
        } />
        
        <Route path="/team-settings" element={<ProtectedRoute><TeamSettings /></ProtectedRoute>} />
        <Route path="/company-settings" element={<ProtectedRoute><CompanySettings /></ProtectedRoute>} />
        <Route path="/backup" element={
          <ProtectedRoute>
            <ModuleGuard module="backup"><BackupUtility /></ModuleGuard>
          </ProtectedRoute>
        } />
        <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <GoogleReCaptchaProvider reCaptchaKey={RECAPTCHA_SITE_KEY} language="fr" useRecaptchaNet={true} scriptProps={{ async: false, defer: false, appendTo: 'head', nonce: undefined }}>
      <AuthProvider>
        <TeamProvider>
          <Toaster position="top-right" richColors closeButton theme="system" toastOptions={{ style: { fontSize: '14px' } }} />
          <BrowserRouter>
            <AppRoutes />
            <Suspense fallback={null}>
              <CookieConsentBanner />
            </Suspense>
          </BrowserRouter>
        </TeamProvider>
      </AuthProvider>
    </GoogleReCaptchaProvider>
  );
}