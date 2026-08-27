import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { PanelShell } from '@/components/layout/PanelShell'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { SeoManager } from '@/components/seo/SeoManager'
import {
  DashboardRedirectPage,
  LeagueAdminHomePage,
  StaffHomePage,
  SuperAdminHomePage,
} from '@/app/panel/PanelHomes'
import { HomePage } from '@/app/public/HomePage'
import { LeaguesPage } from '@/app/public/LeaguesPage'
import { LoginPage } from '@/app/public/LoginPage'
import { SignupPage } from '@/app/public/SignupPage'
import { AuthCallbackPage } from '@/app/public/AuthCallbackPage'
import { PaymentCallbackPage } from '@/app/public/PaymentCallbackPage'
import { TeamPaymentPage } from '@/app/public/TeamPaymentPage'
import { StaticContentPage } from '@/app/public/StaticContentPage'
import { RankingsPage } from '@/app/public/RankingsPage'
import { LiveResultsPage } from '@/app/public/LiveResultsPage'
import { CompaniesPage } from '@/app/public/CompaniesPage'
import { CompanyPublicProfilePage } from '@/app/public/CompanyPublicProfilePage'
import { BlogListPage } from '@/app/public/BlogListPage'
import { BlogPostPage } from '@/app/public/BlogPostPage'
import { GalleryPage } from '@/app/public/GalleryPage'
import { NewsPage } from '@/app/public/NewsPage'
import { ContactPage } from '@/app/public/ContactPage'
import { FaqPage } from '@/app/public/FaqPage'
import { LeagueDetailPage } from '@/app/public/LeagueDetailPage'
import { CompanyPanelPage } from '@/app/company/CompanyPanelPage'
import { CompanyCompetitionsPage } from '@/app/company/CompanyCompetitionsPage'
import { TeamPanelPage } from '@/app/team/TeamPanelPage'
import { SuperAdminFinancePage } from '@/app/super-admin/SuperAdminFinancePage'
import { SuperAdminLeagueEditPage } from '@/app/super-admin/SuperAdminLeagueEditPage'
import { SuperAdminLeaguesPage } from '@/app/super-admin/SuperAdminLeaguesPage'
import { SuperAdminUsersPage } from '@/app/super-admin/SuperAdminUsersPage'
import { SuperAdminPagesPage } from '@/app/super-admin/SuperAdminPagesPage'
import { SuperAdminContentPage } from '@/app/super-admin/SuperAdminContentPage'
import { SuperAdminHomeContentPage } from '@/app/super-admin/SuperAdminHomeContentPage'
import { SuperAdminContactInboxPage } from '@/app/super-admin/SuperAdminContactInboxPage'
import { SuperAdminNotificationsPage } from '@/app/super-admin/SuperAdminNotificationsPage'
import { SuperAdminKavenegarPage } from '@/app/super-admin/SuperAdminKavenegarPage'
import { SuperAdminAnalyticsPage } from '@/app/super-admin/SuperAdminAnalyticsPage'
import { LeagueAdminPage } from '@/app/league-admin/LeagueAdminPage'
import { StaffPage } from '@/app/staff/StaffPage'
import { AuthProvider } from '@/hooks/useAuth'
import { UnreadTicketsProvider } from '@/hooks/useUnreadTickets'
import { SiteSettingsProvider } from '@/hooks/useSiteSettings'
import { ToastProvider } from '@/components/ui/Toast'
import { SuperAdminCompaniesPage } from '@/app/super-admin/SuperAdminCompaniesPage'
import { SuperAdminSettingsPage } from '@/app/super-admin/SuperAdminSettingsPage'
import { SuperAdminRegistrationSettingsPage } from '@/app/super-admin/SuperAdminRegistrationSettingsPage'
import { SuperAdminAccessSettingsPage } from '@/app/super-admin/SuperAdminAccessSettingsPage'
import { SuperAdminParticipantsPage } from '@/app/super-admin/SuperAdminParticipantsPage'
import { LiveChatInboxPage } from '@/app/staff/LiveChatInboxPage'
import { AccountProfilePage } from '@/app/panel/AccountProfilePage'
import { PersonProfilePage } from '@/app/public/PersonProfilePage'
import { SuperAdminPersonEditPage } from '@/app/super-admin/SuperAdminPersonEditPage'
import { ForgotPasswordPage } from '@/app/public/ForgotPasswordPage'
import { ResetPasswordPage } from '@/app/public/ResetPasswordPage'

export default function App() {
  return (
    <AuthProvider>
      <SiteSettingsProvider>
        <ToastProvider>
          <UnreadTicketsProvider>
            <BrowserRouter>
              <SeoManager />
              <Routes>
              <Route element={<PublicLayout />}>
                <Route index element={<HomePage />} />
                <Route path="leagues" element={<LeaguesPage />} />
                <Route path="leagues/:slug" element={<LeagueDetailPage />} />
                <Route path="people/:slug" element={<PersonProfilePage />} />
                <Route path="rankings" element={<RankingsPage />} />
                <Route path="live" element={<LiveResultsPage />} />
                <Route path="companies" element={<CompaniesPage />} />
                <Route path="companies/:slug" element={<CompanyPublicProfilePage />} />
                <Route path="blog" element={<BlogListPage />} />
                <Route path="blog/:slug" element={<BlogPostPage />} />
                <Route path="news" element={<NewsPage />} />
                <Route path="gallery" element={<GalleryPage />} />
                <Route path="about" element={<StaticContentPage slug="about" fallbackTitleKey="nav.about" />} />
                <Route path="contact" element={<ContactPage />} />
                <Route path="faq" element={<FaqPage />} />
                <Route
                  path="privacy"
                  element={<StaticContentPage slug="privacy" fallbackTitleKey="nav.privacy" />}
                />
                <Route path="login" element={<LoginPage />} />
                <Route path="forgot-password" element={<ForgotPasswordPage />} />
                <Route path="reset-password" element={<ResetPasswordPage />} />
                <Route path="signup" element={<SignupPage />} />
                <Route path="auth/callback" element={<AuthCallbackPage />} />
              </Route>

              <Route
                element={
                  <ProtectedRoute>
                    <PanelShell />
                  </ProtectedRoute>
                }
              >
                <Route path="dashboard" element={<DashboardRedirectPage />} />
                <Route path="account/profile" element={<AccountProfilePage />} />

                <Route element={<ProtectedRoute roles={['super_admin']} />}>
                  <Route path="super-admin" element={<SuperAdminHomePage />} />
                  <Route path="super-admin/leagues" element={<SuperAdminLeaguesPage />} />
                  <Route path="super-admin/leagues/:leagueId" element={<SuperAdminLeagueEditPage />} />
                  <Route path="super-admin/people/:personId" element={<SuperAdminPersonEditPage />} />
                  <Route path="super-admin/participants" element={<SuperAdminParticipantsPage />} />
                  <Route path="super-admin/companies" element={<SuperAdminCompaniesPage />} />
                  <Route path="super-admin/review" element={<LeagueAdminPage section="review" />} />
                  <Route path="super-admin/tickets" element={<StaffPage section="tickets" />} />
                  <Route path="super-admin/chat" element={<LiveChatInboxPage />} />
                  <Route path="super-admin/triage" element={<StaffPage section="triage" />} />
                  <Route path="super-admin/users" element={<SuperAdminUsersPage />} />
                  <Route path="super-admin/pages" element={<SuperAdminPagesPage />} />
                  <Route path="super-admin/content" element={<SuperAdminContentPage />} />
                  <Route path="super-admin/home" element={<SuperAdminHomeContentPage />} />
                  <Route path="super-admin/contact-inbox" element={<SuperAdminContactInboxPage />} />
                  <Route path="super-admin/notifications" element={<SuperAdminNotificationsPage />} />
                  <Route path="super-admin/kavenegar" element={<SuperAdminKavenegarPage />} />
                  <Route path="super-admin/finance" element={<SuperAdminFinancePage />} />
                  <Route path="super-admin/analytics" element={<SuperAdminAnalyticsPage />} />
                  <Route path="super-admin/settings" element={<SuperAdminSettingsPage />} />
                  <Route path="super-admin/access" element={<SuperAdminAccessSettingsPage />} />
                  <Route
                    path="super-admin/registration"
                    element={<SuperAdminRegistrationSettingsPage />}
                  />
                </Route>

                {/* Legacy paths kept for league_admin / staff roles; SA is redirected in PanelShell */}
                <Route element={<ProtectedRoute roles={['league_admin', 'super_admin']} />}>
                  <Route path="league-admin" element={<LeagueAdminHomePage />} />
                  <Route path="league-admin/review" element={<LeagueAdminPage section="review" />} />
                  <Route path="league-admin/tickets" element={<LeagueAdminPage section="tickets" />} />
                </Route>

                <Route element={<ProtectedRoute roles={['staff', 'super_admin']} />}>
                  <Route path="staff" element={<StaffHomePage />} />
                  <Route path="staff/tickets" element={<StaffPage section="tickets" />} />
                  <Route path="staff/chat" element={<LiveChatInboxPage />} />
                  <Route path="staff/triage" element={<StaffPage section="triage" />} />
                </Route>

                <Route element={<ProtectedRoute roles={['company_admin', 'team_captain', 'super_admin']} />}>
                  <Route path="company" element={<CompanyPanelPage section="overview" />} />
                  <Route path="company/competitions" element={<CompanyCompetitionsPage />} />
                  <Route path="company/teams" element={<CompanyPanelPage section="teams" />} />
                  <Route path="payments/teams/:teamId" element={<TeamPaymentPage />} />
                  <Route path="payments/callback" element={<PaymentCallbackPage />} />
                </Route>

                <Route
                  element={
                    <ProtectedRoute
                      roles={['team_captain', 'company_admin', 'super_admin', 'league_admin', 'staff']}
                    />
                  }
                >
                  <Route path="team" element={<TeamPanelPage />} />
                  <Route path="team/:teamId" element={<TeamPanelPage />} />
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
          </UnreadTicketsProvider>
        </ToastProvider>
      </SiteSettingsProvider>
    </AuthProvider>
  )
}
