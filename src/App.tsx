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
import { AnnouncementPage } from '@/app/public/AnnouncementPage'
import { ContactPage } from '@/app/public/ContactPage'
import { FaqPage } from '@/app/public/FaqPage'
import { LeagueDetailPage } from '@/app/public/LeagueDetailPage'
import { CompanyPanelPage } from '@/app/company/CompanyPanelPage'
import { ParticipantTicketsPage } from '@/app/company/ParticipantTicketsPage'
import { CompanyCompetitionsPage } from '@/app/company/CompanyCompetitionsPage'
import { TeamPanelPage } from '@/app/team/TeamPanelPage'
import { TeamAttendancePage } from '@/app/team/TeamAttendancePage'
import { SuperAdminFinancePage } from '@/app/super-admin/SuperAdminFinancePage'
import { SuperAdminLeagueEditPage } from '@/app/super-admin/SuperAdminLeagueEditPage'
import { SuperAdminLeaguesPage } from '@/app/super-admin/SuperAdminLeaguesPage'
import { SuperAdminUsersPage } from '@/app/super-admin/SuperAdminUsersPage'
import { SuperAdminCollaboratorsPage } from '@/app/super-admin/SuperAdminCollaboratorsPage'
import { SuperAdminPagesPage } from '@/app/super-admin/SuperAdminPagesPage'
import { SuperAdminContentPage } from '@/app/super-admin/SuperAdminContentPage'
import { SuperAdminHomeContentPage } from '@/app/super-admin/SuperAdminHomeContentPage'
import { SuperAdminContactInboxPage } from '@/app/super-admin/SuperAdminContactInboxPage'
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
import { SuperAdminIncompleteRegistrationsPage } from '@/app/super-admin/SuperAdminIncompleteRegistrationsPage'
import { LiveChatInboxPage } from '@/app/staff/LiveChatInboxPage'
import { AccountProfilePage } from '@/app/panel/AccountProfilePage'
import { AccountInvoicesPage } from '@/app/panel/AccountInvoicesPage'
import { PersonProfilePage } from '@/app/public/PersonProfilePage'
import { SuperAdminPersonEditPage } from '@/app/super-admin/SuperAdminPersonEditPage'
import { ForgotPasswordPage } from '@/app/public/ForgotPasswordPage'
import { ResetPasswordPage } from '@/app/public/ResetPasswordPage'
import { ScrollToTop } from '@/components/layout/ScrollToTop'
import { RegistrationGuidePage } from '@/app/public/RegistrationGuidePage'
import { AboutPage } from '@/app/public/AboutPage'

export default function App() {
  return (
    <AuthProvider>
      <SiteSettingsProvider>
        <ToastProvider>
          <UnreadTicketsProvider>
            <BrowserRouter>
              <ScrollToTop />
              <SeoManager />
              <Routes>
              <Route element={<PublicLayout />}>
                <Route index element={<HomePage />} />
                <Route path="leagues" element={<LeaguesPage />} />
                <Route path="leagues/:slug" element={<LeagueDetailPage />} />
                <Route path="people/:slug" element={<PersonProfilePage />} />
                <Route path="rankings" element={<RankingsPage />} />
                <Route path="live" element={<LiveResultsPage />} />
                <Route path="live/:leagueSlug" element={<LiveResultsPage />} />
                <Route path="companies" element={<CompaniesPage />} />
                <Route path="companies/:slug" element={<CompanyPublicProfilePage />} />
                <Route path="participants" element={<CompaniesPage />} />
                <Route path="participants/:slug" element={<CompanyPublicProfilePage />} />
                <Route path="blog" element={<BlogListPage />} />
                <Route path="blog/:slug" element={<BlogPostPage />} />
                <Route path="news" element={<NewsPage />} />
                <Route path="news/:slug" element={<AnnouncementPage />} />
                <Route path="gallery" element={<GalleryPage />} />
                <Route path="about" element={<AboutPage />} />
                <Route path="contact" element={<ContactPage />} />
                <Route path="faq" element={<FaqPage />} />
                <Route
                  path="privacy"
                  element={<StaticContentPage slug="privacy" fallbackTitleKey="nav.privacy" />}
                />
                <Route path="terms" element={<StaticContentPage slug="terms" fallbackTitleKey="nav.terms" />} />
                <Route path="registration-guide" element={<RegistrationGuidePage />} />
                <Route path="login" element={<LoginPage />} />
                <Route path="forgot-password" element={<ForgotPasswordPage />} />
                <Route path="reset-password" element={<ResetPasswordPage />} />
                <Route path="signup" element={<SignupPage />} />
                <Route path="auth/callback" element={<AuthCallbackPage />} />
                <Route path="payments/callback" element={<PaymentCallbackPage />} />
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
                <Route path="account/invoices" element={<AccountInvoicesPage />} />
                <Route path="account/invoices/:invoiceId" element={<AccountInvoicesPage />} />

                <Route element={<ProtectedRoute roles={['super_admin']} />}>
                  <Route path="super-admin" element={<SuperAdminHomePage />} />
                  <Route path="super-admin/leagues" element={<SuperAdminLeaguesPage />} />
                  <Route path="super-admin/leagues/:leagueId" element={<SuperAdminLeagueEditPage />} />
                  <Route path="super-admin/people/:personId" element={<SuperAdminPersonEditPage />} />
                  <Route path="super-admin/participants" element={<SuperAdminParticipantsPage />} />
                  <Route path="super-admin/incomplete-registrations" element={<SuperAdminIncompleteRegistrationsPage />} />
                  <Route path="super-admin/companies" element={<SuperAdminCompaniesPage />} />
                  <Route path="super-admin/review" element={<LeagueAdminPage section="review" />} />
                  <Route path="super-admin/scores" element={<LeagueAdminPage section="scores" />} />
                  <Route path="super-admin/live-results" element={<LeagueAdminPage section="live" />} />
                  <Route path="super-admin/tickets" element={<StaffPage section="tickets" />} />
                  <Route path="super-admin/chat" element={<LiveChatInboxPage />} />
                  <Route path="super-admin/triage" element={<StaffPage section="triage" />} />
                  <Route path="super-admin/users" element={<SuperAdminUsersPage />} />
                  <Route path="super-admin/collaborators" element={<SuperAdminCollaboratorsPage />} />
                  <Route path="super-admin/pages" element={<SuperAdminPagesPage />} />
                  <Route path="super-admin/content" element={<SuperAdminContentPage />} />
                  <Route path="super-admin/home" element={<SuperAdminHomeContentPage />} />
                  <Route path="super-admin/contact-inbox" element={<SuperAdminContactInboxPage />} />
                  <Route path="super-admin/notifications" element={<Navigate to="/super-admin/kavenegar" replace />} />
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
                <Route element={<ProtectedRoute roles={['league_admin', 'super_admin']} />}><Route path="league-admin" element={<LeagueAdminHomePage />} /></Route>
                <Route element={<ProtectedRoute roles={['league_admin', 'super_admin']} permission="team_review" />}><Route path="league-admin/review" element={<LeagueAdminPage section="review" />} /></Route>
                <Route element={<ProtectedRoute roles={['league_admin', 'super_admin']} permission="team_review" />}><Route path="league-admin/scores" element={<LeagueAdminPage section="scores" />} /></Route>
                <Route element={<ProtectedRoute roles={['league_admin', 'super_admin']} permission="tickets" />}><Route path="league-admin/tickets" element={<LeagueAdminPage section="tickets" />} /></Route>

                <Route element={<ProtectedRoute roles={['staff', 'super_admin']} />}><Route path="staff" element={<StaffHomePage />} /></Route>
                <Route element={<ProtectedRoute roles={['staff', 'super_admin']} permission="tickets" />}><Route path="staff/tickets" element={<StaffPage section="tickets" />} /></Route>
                <Route element={<ProtectedRoute roles={['staff', 'super_admin']} permission="chat" />}><Route path="staff/chat" element={<LiveChatInboxPage />} /></Route>
                <Route element={<ProtectedRoute roles={['staff', 'super_admin']} permission="triage|account_activation" />}><Route path="staff/triage" element={<StaffPage section="triage" />} /></Route>
                <Route element={<ProtectedRoute roles={['staff', 'super_admin']} permission="finance" />}><Route path="staff/finance" element={<SuperAdminFinancePage />} /></Route>

                <Route element={<ProtectedRoute roles={['company_admin', 'team_captain', 'super_admin']} />}>
                  <Route path="company" element={<CompanyPanelPage section="overview" />} />
                  <Route path="company/competitions" element={<CompanyCompetitionsPage />} />
                  <Route path="company/teams" element={<CompanyPanelPage section="teams" />} />
                  <Route path="account/tickets" element={<ParticipantTicketsPage />} />
                  <Route path="payments/teams/:teamId" element={<TeamPaymentPage />} />
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
                  <Route path="team/:teamId/attendance" element={<TeamAttendancePage />} />
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
