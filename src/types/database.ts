export type UserRole =
  | 'super_admin'
  | 'league_admin'
  | 'staff'
  | 'company_admin'
  | 'team_captain'

export type RegistrationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'waitlisted'

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'
export type TicketStatus = 'open' | 'answered' | 'closed'
export type ContentStatus = 'draft' | 'published'

export type BlogPost = {
  id: string
  title: string
  slug: string
  cover_image: string | null
  body: string
  status: ContentStatus
  published_at: string | null
  author_id: string | null
  created_at: string
  excerpt?: string | null
  seo_title?: string | null
  meta_description?: string | null
  og_image?: string | null
  updated_at?: string | null
  category_id?: string | null
  author_name?: string | null
  cover_alt?: string | null
  category?: ContentCategory | null
}

export type ContentCategory = { id: string; name_fa: string; name_en: string; slug: string; created_at: string }

export type Announcement = {
  id: string
  title: string
  body: string
  league_id: string | null
  status: ContentStatus
  published_at: string | null
  created_by: string | null
  excerpt?: string | null
  seo_title?: string | null
  meta_description?: string | null
  cover_image?: string | null
  updated_at?: string | null
  slug?: string | null
  category_id?: string | null
  author_name?: string | null
  cover_alt?: string | null
  og_image?: string | null
  category?: ContentCategory | null
}

export type GalleryCategory = {
  id: string
  name_fa: string
  name_en: string
  cover_url: string | null
  description_fa?: string | null
  description_en?: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}

export type GalleryItem = {
  id: string
  media_url: string
  media_type: string
  league_id: string | null
  category_id?: string | null
  season_year: number | null
  caption: string | null
  created_at: string
}

export type AccountType = 'individual' | 'legal'
export type AccountStatus = 'pending' | 'active' | 'rejected' | 'suspended'

export type Profile = {
  id: string
  full_name: string
  phone: string
  email?: string | null
  auth_channel?: 'phone' | 'email'
  email_verified_at?: string | null
  national_id: string | null
  role: UserRole
  created_at: string
  account_type?: AccountType
  account_status?: AccountStatus
  company_name?: string | null
  company_national_id?: string | null
  economic_code?: string | null
  address?: string | null
  username?: string | null
  first_name_fa?: string | null
  last_name_fa?: string | null
  first_name_en?: string | null
  last_name_en?: string | null
  birth_date?: string | null
  postal_code?: string | null
  legal_representative_national_id?: string | null
  phone_verified_at?: string | null
  identity_completed_at?: string | null
  activated_at?: string | null
  rejection_reason?: string | null
  gender?: 'male' | 'female' | 'other' | null
  province?: string | null
  city?: string | null
  landline?: string | null
  country_code?: string | null
  nationality?: string | null
  residence?: string | null
  is_foreign?: boolean
  passport_number?: string | null
  avatar_url?: string | null
  staff_department?: 'support' | 'finance' | 'operations' | 'content' | null
}

export type Company = {
  id: string
  name: string
  slug: string
  logo_url: string | null
  bio: string | null
  founded_year: number | null
  website: string | null
  created_at: string
  cover_image_url?: string | null
  tagline?: string | null
  entity_type?: 'individual' | 'company' | 'institute' | 'school' | 'university' | 'academy' | 'club' | 'other'
}

export type CompanyMember = {
  company_id: string
  user_id: string
  is_owner: boolean
}

export type LeaguePeriod = 'upcoming' | 'open' | 'ongoing' | 'ended' | 'full'

export type LeagueScoringRow = { label: string; points: string }
export type LeagueTimelineStep = { title: string; date?: string; description?: string }
export type LeagueDaySlot = { time: string; title: string; description?: string }

export type LeagueFile = {
  id: string
  league_id: string
  title: string
  title_en?: string | null
  file_url: string
  file_kind: string
  sort_order: number
  created_at: string
}

export type LeaguePerson = {
  id: string
  league_id: string
  full_name: string
  slug: string
  full_name_en?: string | null
  photo_url: string | null
  specialty: string | null
  specialty_en?: string | null
  bio: string | null
  bio_en?: string | null
  identity_summary_fa?: string | null
  identity_summary_en?: string | null
  education_fa?: string | null
  education_en?: string | null
  honors_fa?: string | null
  honors_en?: string | null
  awards_fa?: string | null
  awards_en?: string | null
  courses_fa?: string | null
  courses_en?: string | null
  company_info_fa?: string | null
  company_info_en?: string | null
  birth_date?: string | null
  nationality_fa?: string | null
  nationality_en?: string | null
  city_fa?: string | null
  city_en?: string | null
  email?: string | null
  phone?: string | null
  website_url?: string | null
  linkedin_url?: string | null
  is_profile_published?: boolean
  updated_at?: string
  role_kind: 'judge' | 'committee' | string
  sort_order: number
  created_at: string
}

export type LeagueSponsor = {
  id: string
  league_id: string
  name: string
  name_en?: string | null
  logo_url: string | null
  website_url: string | null
  sort_order: number
  created_at: string
}

export type LeagueFaq = {
  id: string
  league_id: string
  question: string
  question_en?: string | null
  answer: string
  answer_en?: string | null
  sort_order: number
  created_at: string
}

export type LeaguePastResult = {
  id: string
  league_id: string
  season_year: number
  first_place: string | null
  second_place: string | null
  third_place: string | null
  created_at: string
}

export type League = {
  id: string
  name: string
  name_en?: string | null
  slug: string
  description: string | null
  description_en?: string | null
  category: string | null
  category_en?: string | null
  capacity: number | null
  registration_fee: number
  registration_open_at: string | null
  registration_close_at: string | null
  contact_email: string | null
  is_active: boolean
  created_at: string
  short_description?: string | null
  short_description_en?: string | null
  full_description?: string | null
  full_description_en?: string | null
  cover_image_url?: string | null
  hero_image_url?: string | null
  hero_video_url?: string | null
  intro_video_url?: string | null
  regulation_pdf_url?: string | null
  rules_summary?: string | null
  rules_summary_en?: string | null
  rules_pdf_url?: string | null
  age_range?: string | null
  age_range_en?: string | null
  participation_mode?: string | null
  team_size_min?: number | null
  team_size_max?: number | null
  event_starts_at?: string | null
  event_ends_at?: string | null
  venue_name?: string | null
  venue_name_en?: string | null
  venue_address?: string | null
  venue_address_en?: string | null
  venue_map_embed_url?: string | null
  difficulty_level?: string | null
  difficulty_level_en?: string | null
  competition_language?: string | null
  competition_language_en?: string | null
  scoring_rows?: LeagueScoringRow[] | null
  scoring_rows_en?: LeagueScoringRow[] | null
  timeline_steps?: LeagueTimelineStep[] | null
  timeline_steps_en?: LeagueTimelineStep[] | null
  day_schedule?: LeagueDaySlot[] | null
  day_schedule_en?: LeagueDaySlot[] | null
  allowed_equipment?: string[] | null
  allowed_equipment_en?: string[] | null
  forbidden_equipment?: string[] | null
  forbidden_equipment_en?: string[] | null
  discount_info?: string | null
  discount_info_en?: string | null
  refund_policy?: string | null
  refund_policy_en?: string | null
  show_registered_count?: boolean | null
  period_override?: LeaguePeriod | string | null
  secretary_name?: string | null
  secretary_name_en?: string | null
  secretary_phone?: string | null
  secretary_telegram?: string | null
  related_league_ids?: string[] | null
  judging_path?: string | null
  judging_path_en?: string | null
  technical_committee_notes?: string | null
  technical_committee_notes_en?: string | null
  /** auto | hidden | live | final — controls public live results board */
  results_status?: 'auto' | 'hidden' | 'live' | 'final' | string | null
  captain_fee?: number
  member_fee?: number
  coach_fee?: number
  result_formula?: 'average' | 'sum'
  required_judge_count?: number | null
  team_edit_deadline?: string | null
  min_age?: number | null
  max_age?: number | null
  current_season_year?: number
  registration_cycle_status?: 'draft' | 'open' | 'closed' | 'archived' | string
}

export type Team = {
  id: string
  company_id: string
  league_id: string
  captain_id: string
  name: string
  name_en?: string | null
  motto_fa?: string | null
  motto_en?: string | null
  season_year?: number | null
  province: string | null
  city: string | null
  member_count: number | null
  status: RegistrationStatus
  rejection_reason: string | null
  submitted_at: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  created_at: string
  lifecycle_status?: 'draft' | 'incomplete' | 'awaiting_documents' | 'awaiting_review' | 'awaiting_payment' | 'completed' | 'cancelled'
  registration_stage?: 'team_info' | 'members' | 'documents' | 'review' | 'invoice' | 'payment' | 'completed'
  registration_progress?: number
  registration_draft?: Record<string, unknown>
  last_completed_step?: number
  last_activity_at?: string
  registration_started_at?: string
  registration_completed_at?: string | null
}

export type TeamMember = {
  id: string
  team_id: string
  full_name: string
  first_name?: string | null
  last_name?: string | null
  first_name_fa?: string | null
  last_name_fa?: string | null
  first_name_en?: string | null
  last_name_en?: string | null
  role: string | null
  national_id: string | null
  birth_date: string | null
  education?: string | null
  national_id_doc_path?: string | null
  review_status?: 'pending' | 'approved' | 'rejected' | string
  rejection_reason?: string | null
  father_name_fa?: string | null
  father_name_en?: string | null
  photo_url?: string | null
  phone?: string | null
  residence?: string | null
  province?: string | null
  city?: string | null
  country_code?: string | null
  nationality?: string | null
  is_foreign?: boolean
  passport_number?: string | null
  education_level?: 'primary' | 'middle_school' | 'high_school' | 'associate' | 'bachelor' | 'master' | 'doctorate' | null
  field_of_study?: string | null
}

export type DocumentRow = {
  id: string
  team_id: string
  file_path: string
  doc_type: string
  uploaded_at: string
  team_member_id?: string | null
}

export type CaptainInvite = {
  id: string
  company_id: string
  team_id: string | null
  phone: string
  full_name_hint: string | null
  invited_by: string
  accepted_at: string | null
  created_at: string
}

export type StaticPage = {
  slug: string
  title: string
  body: string
  title_en?: string | null
  body_en?: string | null
  excerpt_en?: string | null
  updated_at: string
  excerpt?: string | null
  seo_title?: string | null
  meta_description?: string | null
  og_image?: string | null
  cover_image?: string | null
}

export type HomeBanner = {
  id: string
  title: string
  subtitle: string | null
  image_url: string
  link_url: string | null
  sort_order: number
  is_active: boolean
}

export type ContactMessage = {
  id: string
  full_name: string
  email: string
  phone: string | null
  subject: string
  body: string
  created_at: string
}

export type LeagueAdmin = {
  league_id: string
  user_id: string
  assignment_role?: 'judge' | 'head_judge' | 'operator'
}

export type ParticipantFieldRule = {
  field_key: string
  label_fa: string
  label_en: string
  is_required: boolean
  is_locked: boolean
  applies_to: 'individual' | 'legal' | 'both'
  updated_at: string
}

export type JudgeScore = {
  id: string
  league_id: string
  team_id: string
  judge_id: string
  season_year: number
  score_payload: Record<string, number | string>
  total_score: number
  notes: string | null
  status: 'draft' | 'submitted'
  submitted_at: string | null
  created_at: string
  updated_at: string
}

export type JudgeSubmissionProgress = {
  team_id: string
  league_id: string
  season_year: number
  required_count: number
  submitted_count: number
  missing_judges: string[] | null
}

export type Invoice = {
  id: string
  team_id: string
  company_id: string
  amount: number
  discount_code: string | null
  discount_amount: number
  status: PaymentStatus
  gateway_ref: string | null
  paid_at: string | null
  invoice_number: string | null
  created_at: string
  terms_accepted_at?: string | null
  terms_version?: string | null
  payment_method?: 'online' | 'card_to_card'
  receipt_path?: string | null
  receipt_status?: 'pending_review' | 'approved' | 'rejected' | null
  receipt_rejection_reason?: string | null
  receipt_submitted_at?: string | null
  receipt_reviewed_at?: string | null
  admin_note?: string | null
  archived_at?: string | null
  archived_by?: string | null
  updated_at?: string
  registration_id?: string | null
}

export type Ticket = {
  id: string
  team_id: string
  league_id: string | null
  assigned_to: string | null
  subject: string
  status: TicketStatus
  created_at: string
  department_id?: string | null
}

export type TicketDepartment = {
  id: string
  name: string
  slug: string
  description: string | null
  is_active: boolean
  sort_order: number
  created_at: string
}

export type SiteNavItem = {
  id: string
  href: string
  label_fa: string
  label_en: string
  enabled: boolean
  order: number
}

export type SiteSettings = {
  id: number
  site_name_fa: string
  site_name_en: string
  tagline_fa: string | null
  tagline_en: string | null
  logo_url: string | null
  favicon_url: string | null
  color_primary: string | null
  color_accent: string | null
  seo_title_fa: string | null
  seo_title_en: string | null
  seo_description_fa: string | null
  seo_description_en: string | null
  og_image_default: string | null
  footer_fa: string | null
  footer_en: string | null
  contact_blurb_fa: string | null
  contact_blurb_en: string | null
  nav_items: SiteNavItem[]
  updated_at: string
  inactive_message_fa?: string | null
  inactive_message_en?: string | null
  support_phone?: string | null
  business_hours?: Record<string, unknown> | null
  chat_enabled?: boolean
  agents_online?: boolean
  chat_welcome_fa?: string | null
  chat_welcome_en?: string | null
  chat_away_fa?: string | null
  chat_away_en?: string | null
  chat_offline_fa?: string | null
  chat_offline_en?: string | null
  chat_wait_timeout_seconds?: number | null
  chat_wait_message_fa?: string | null
  chat_wait_message_en?: string | null
  copyright_fa?: string | null
  copyright_en?: string | null
  developer_credit_fa?: string | null
  developer_credit_en?: string | null
  developer_name?: string | null
  developer_url?: string | null
  contact_email?: string | null
  contact_address_fa?: string | null
  contact_address_en?: string | null
  contact_map_embed_url?: string | null
  instagram_url?: string | null
  telegram_url?: string | null
  linkedin_url?: string | null
  whatsapp_url?: string | null
  trust_seal_url?: string | null
  trust_seal_href?: string | null
  trust_seal_html?: string | null
  login_logo_url?: string | null
  login_cover_url?: string | null
  login_welcome_title_fa?: string | null
  login_welcome_title_en?: string | null
  login_welcome_text_fa?: string | null
  login_welcome_text_en?: string | null
}

export type TicketMessage = {
  id: string
  ticket_id: string
  sender_id: string
  body: string
  created_at: string
  attachment_url?: string | null
  attachment_name?: string | null
  attachment_mime?: string | null
  attachment_size?: number | null
}

export type CompanyAchievement = {
  id: string
  company_id: string
  title: string
  description: string | null
  year: number | null
  icon: string | null
}

export type ResultRow = {
  id: string
  league_id: string
  team_id: string
  company_id: string
  season_year: number
  rank: number | null
  score: number | null
  notes: string | null
  published_at: string | null
}

export type NotificationLog = {
  id: string
  team_id: string | null
  channel: string
  template_key: string
  status: string
  sent_at: string | null
  created_at: string | null
  idempotency_key: string
  phone: string | null
  email?: string | null
  error_message: string | null
  meta: Record<string, unknown> | null
  provider_message_id: string | null
}

type Relationship = {
  foreignKeyName: string
  columns: string[]
  isOneToOne?: boolean
  referencedRelation: string
  referencedColumns: string[]
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: {
          id: string
          full_name: string
          phone: string
          national_id?: string | null
          role?: UserRole
          created_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          phone?: string
          national_id?: string | null
          role?: UserRole
          created_at?: string
        }
        Relationships: []
      }
      companies: {
        Row: Company
        Insert: {
          id?: string
          name: string
          slug: string
          logo_url?: string | null
          bio?: string | null
          founded_year?: number | null
          website?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          logo_url?: string | null
          bio?: string | null
          founded_year?: number | null
          website?: string | null
          created_at?: string
        }
        Relationships: []
      }
      company_members: {
        Row: CompanyMember
        Insert: {
          company_id: string
          user_id: string
          is_owner?: boolean
        }
        Update: {
          company_id?: string
          user_id?: string
          is_owner?: boolean
        }
        Relationships: Relationship[]
      }
      leagues: {
        Row: League
        Insert: {
          id?: string
          name: string
          slug: string
          description?: string | null
          category?: string | null
          capacity?: number | null
          registration_fee?: number
          registration_open_at?: string | null
          registration_close_at?: string | null
          contact_email?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: Partial<League>
        Relationships: []
      }
      teams: {
        Row: Team
        Insert: {
          id?: string
          company_id: string
          league_id: string
          captain_id: string
          name: string
          province?: string | null
          city?: string | null
          member_count?: number | null
          status?: RegistrationStatus
          rejection_reason?: string | null
          submitted_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          league_id?: string
          captain_id?: string
          name?: string
          province?: string | null
          city?: string | null
          member_count?: number | null
          status?: RegistrationStatus
          rejection_reason?: string | null
          submitted_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          created_at?: string
        }
        Relationships: Relationship[]
      }
      team_members: {
        Row: TeamMember
        Insert: {
          id?: string
          team_id: string
          full_name: string
          role?: string | null
          national_id?: string | null
          birth_date?: string | null
        }
        Update: Partial<TeamMember>
        Relationships: Relationship[]
      }
      documents: {
        Row: DocumentRow
        Insert: {
          id?: string
          team_id: string
          file_path: string
          doc_type: string
          uploaded_at?: string
        }
        Update: Partial<DocumentRow>
        Relationships: Relationship[]
      }
      captain_invites: {
        Row: CaptainInvite
        Insert: {
          id?: string
          company_id: string
          team_id?: string | null
          phone: string
          full_name_hint?: string | null
          invited_by: string
          accepted_at?: string | null
          created_at?: string
        }
        Update: Partial<CaptainInvite>
        Relationships: Relationship[]
      }
    }
    Views: Record<string, never>
    Functions: {
      create_company: {
        Args: {
          p_name: string
          p_slug: string
          p_bio?: string | null
          p_founded_year?: number | null
          p_website?: string | null
          p_logo_url?: string | null
        }
        Returns: Company
      }
      resolve_team_captain: {
        Args: {
          p_company_id: string
          p_phone: string
          p_full_name_hint?: string | null
        }
        Returns: string
      }
      profile_exists_by_phone: {
        Args: { p_phone: string }
        Returns: boolean
      }
    }
    Enums: {
      user_role: UserRole
      registration_status: RegistrationStatus
      payment_status: PaymentStatus
      ticket_status: TicketStatus
      content_status: ContentStatus
    }
    CompositeTypes: Record<string, never>
  }
}
