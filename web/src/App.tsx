import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout, BareLayout, PublicLayout } from '@/components/layout/Layouts';
import { RedirectIfAuthenticated, RequireAdmin, RequireAuth, RequireStaff } from '@/routes/guards';

// Every page is loaded on demand so the first paint stays small.
const LandingPage = lazy(() => import('@/pages/LandingPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('@/pages/auth/VerifyEmailPage'));
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const ExplorePage = lazy(() => import('@/pages/ExplorePage'));
const MembersPage = lazy(() => import('@/pages/MembersPage'));
const MemberProfilePage = lazy(() => import('@/pages/MemberProfilePage'));
const MySkillsPage = lazy(() => import('@/pages/MySkillsPage'));
const MatchesPage = lazy(() => import('@/pages/MatchesPage'));
const ExchangeRequestsPage = lazy(() => import('@/pages/ExchangeRequestsPage'));
const ExchangesPage = lazy(() => import('@/pages/ExchangesPage'));
const ExchangeWorkspacePage = lazy(() => import('@/pages/ExchangeWorkspacePage'));
const CalendarPage = lazy(() => import('@/pages/CalendarPage'));
const MessagesPage = lazy(() => import('@/pages/MessagesPage'));
const LearningPage = lazy(() => import('@/pages/LearningPage'));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'));
const ReviewsPage = lazy(() => import('@/pages/ReviewsPage'));
const CommunityPage = lazy(() => import('@/pages/CommunityPage'));
const CommunityPostPage = lazy(() => import('@/pages/CommunityPostPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const HelpPage = lazy(() => import('@/pages/HelpPage'));
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage'));
const TermsPage = lazy(() => import('@/pages/TermsPage'));
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'));
const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboardPage'));
const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsersPage'));
const AdminReportsPage = lazy(() => import('@/pages/admin/AdminReportsPage'));
const AdminCategoriesPage = lazy(() => import('@/pages/admin/AdminCategoriesPage'));
const AdminAuditPage = lazy(() => import('@/pages/admin/AdminAuditPage'));

export function App() {
  return (
    <Routes>
      {/* Public pages: landing, discovery and legal */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/members/:username" element={<MemberProfilePage />} />
        <Route path="/community" element={<CommunityPage />} />
        <Route path="/community/posts/:id" element={<CommunityPostPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
      </Route>

      {/* Authentication */}
      <Route element={<BareLayout />}>
        <Route element={<RedirectIfAuthenticated />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Route>

      {/* Onboarding: signed in, but without the app chrome */}
      <Route element={<RequireAuth />}>
        <Route element={<BareLayout />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
        </Route>
      </Route>

      {/* Authenticated application */}
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/my-skills" element={<MySkillsPage />} />
          <Route path="/matches" element={<MatchesPage />} />
          <Route path="/exchanges" element={<ExchangesPage />} />
          <Route path="/exchanges/requests" element={<ExchangeRequestsPage />} />
          <Route path="/exchanges/:id" element={<ExchangeWorkspacePage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/messages/:conversationId" element={<MessagesPage />} />
          <Route path="/learning" element={<LearningPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      {/* Staff area */}
      <Route element={<RequireStaff />}>
        <Route element={<AppLayout />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="reports" element={<AdminReportsPage />} />
            <Route element={<RequireAdmin />}>
              <Route path="categories" element={<AdminCategoriesPage />} />
              <Route path="audit" element={<AdminAuditPage />} />
            </Route>
          </Route>
        </Route>
      </Route>

      <Route path="/home" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
