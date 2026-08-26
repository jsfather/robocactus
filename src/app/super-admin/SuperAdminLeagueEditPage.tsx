import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button,
  FieldError,
  Input,
  PanelCard,
  Select,
  Textarea,
} from '@/components/ui/FormControls'
import { DateTimeField } from '@/components/ui/DateTimeField'
import { ImageUploadField } from '@/components/ui/ImageUploadField'
import {
  deleteLeagueFaq,
  deleteLeagueFile,
  deleteLeaguePastResult,
  deleteLeaguePerson,
  deleteLeagueSponsor,
  fetchAllLeagues,
  fetchLeagueById,
  fetchLeagueFaqs,
  fetchLeagueFiles,
  fetchLeaguePastResults,
  fetchLeaguePeople,
  fetchLeagueSponsors,
  listToLines,
  linesToList,
  scheduleToText,
  scoringToText,
  textToSchedule,
  textToScoring,
  textToTimeline,
  timelineToText,
  updateLeague,
  upsertLeagueFaq,
  upsertLeagueFile,
  upsertLeaguePastResult,
  upsertLeaguePerson,
  upsertLeagueSponsor,
  type LeagueInput,
} from '@/features/leagues/adminApi'
import type {
  League,
  LeagueFaq,
  LeagueFile,
  LeaguePastResult,
  LeaguePerson,
  LeagueSponsor,
} from '@/types/database'

type Tab =
  | 'basics'
  | 'content'
  | 'specs'
  | 'rules'
  | 'schedule'
  | 'equipment'
  | 'files'
  | 'people'
  | 'sponsors'
  | 'faqs'
  | 'results'

export function SuperAdminLeagueEditPage() {
  const { leagueId = '' } = useParams()
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('basics')
  const [league, setLeague] = useState<League | null>(null)
  const [allLeagues, setAllLeagues] = useState<League[]>([])
  const [files, setFiles] = useState<LeagueFile[]>([])
  const [people, setPeople] = useState<LeaguePerson[]>([])
  const [sponsors, setSponsors] = useState<LeagueSponsor[]>([])
  const [faqs, setFaqs] = useState<LeagueFaq[]>([])
  const [past, setPast] = useState<LeaguePastResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState<LeagueInput | null>(null)
  const [scoringText, setScoringText] = useState('')
  const [scoringTextEn, setScoringTextEn] = useState('')
  const [timelineText, setTimelineText] = useState('')
  const [timelineTextEn, setTimelineTextEn] = useState('')
  const [scheduleText, setScheduleText] = useState('')
  const [scheduleTextEn, setScheduleTextEn] = useState('')
  const [allowedText, setAllowedText] = useState('')
  const [allowedTextEn, setAllowedTextEn] = useState('')
  const [forbiddenText, setForbiddenText] = useState('')
  const [forbiddenTextEn, setForbiddenTextEn] = useState('')

  const [fileTitle, setFileTitle] = useState('')
  const [fileTitleEn, setFileTitleEn] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  const [fileKind, setFileKind] = useState('regulation')
  const [personName, setPersonName] = useState('')
  const [personNameEn, setPersonNameEn] = useState('')
  const [personRole, setPersonRole] = useState('judge')
  const [personSpecialty, setPersonSpecialty] = useState('')
  const [personSpecialtyEn, setPersonSpecialtyEn] = useState('')
  const [personBio, setPersonBio] = useState('')
  const [personBioEn, setPersonBioEn] = useState('')
  const [personPhoto, setPersonPhoto] = useState('')
  const [sponsorName, setSponsorName] = useState('')
  const [sponsorNameEn, setSponsorNameEn] = useState('')
  const [sponsorLogo, setSponsorLogo] = useState('')
  const [sponsorUrl, setSponsorUrl] = useState('')
  const [faqQ, setFaqQ] = useState('')
  const [faqQEn, setFaqQEn] = useState('')
  const [faqA, setFaqA] = useState('')
  const [faqAEn, setFaqAEn] = useState('')
  const [year, setYear] = useState(String(new Date().getFullYear() - 1))
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [third, setThird] = useState('')

  const reload = async () => {
    if (!leagueId) return
    setError(null)
    const [l, all, f, p, s, q, r] = await Promise.all([
      fetchLeagueById(leagueId),
      fetchAllLeagues(),
      fetchLeagueFiles(leagueId),
      fetchLeaguePeople(leagueId),
      fetchLeagueSponsors(leagueId),
      fetchLeagueFaqs(leagueId),
      fetchLeaguePastResults(leagueId),
    ])
    if (!l) {
      setError(t('leaguePage.notFound'))
      return
    }
    setLeague(l)
    setAllLeagues(all.filter((x) => x.id !== l.id))
    setFiles(f)
    setPeople(p)
    setSponsors(s)
    setFaqs(q)
    setPast(r)
    setForm({
      name: l.name,
      name_en: l.name_en ?? '',
      slug: l.slug,
      description: l.description,
      description_en: l.description_en ?? '',
      category: l.category,
      category_en: l.category_en ?? '',
      capacity: l.capacity,
      registration_fee: Number(l.registration_fee),
      captain_fee: Number(l.captain_fee ?? 0),
      member_fee: Number(l.member_fee ?? 0),
      team_edit_deadline: l.team_edit_deadline ?? null,
      min_age: l.min_age ?? null,
      max_age: l.max_age ?? null,
      current_season_year: l.current_season_year ?? new Date().getFullYear(),
      registration_cycle_status: l.registration_cycle_status ?? 'open',
      registration_open_at: l.registration_open_at,
      registration_close_at: l.registration_close_at,
      contact_email: l.contact_email,
      is_active: l.is_active,
      short_description: l.short_description ?? '',
      short_description_en: l.short_description_en ?? '',
      full_description: l.full_description ?? '',
      full_description_en: l.full_description_en ?? '',
      cover_image_url: l.cover_image_url ?? '',
      hero_image_url: l.hero_image_url ?? '',
      hero_video_url: l.hero_video_url ?? '',
      intro_video_url: l.intro_video_url ?? '',
      regulation_pdf_url: l.regulation_pdf_url ?? '',
      rules_summary: l.rules_summary ?? '',
      rules_summary_en: l.rules_summary_en ?? '',
      rules_pdf_url: l.rules_pdf_url ?? '',
      age_range: l.age_range ?? '',
      age_range_en: l.age_range_en ?? '',
      participation_mode: l.participation_mode ?? 'team',
      team_size_min: l.team_size_min ?? null,
      team_size_max: l.team_size_max ?? null,
      event_starts_at: l.event_starts_at ?? null,
      event_ends_at: l.event_ends_at ?? null,
      venue_name: l.venue_name ?? '',
      venue_name_en: l.venue_name_en ?? '',
      venue_address: l.venue_address ?? '',
      venue_address_en: l.venue_address_en ?? '',
      venue_map_embed_url: l.venue_map_embed_url ?? '',
      difficulty_level: l.difficulty_level ?? '',
      difficulty_level_en: l.difficulty_level_en ?? '',
      competition_language: l.competition_language ?? '',
      competition_language_en: l.competition_language_en ?? '',
      discount_info: l.discount_info ?? '',
      discount_info_en: l.discount_info_en ?? '',
      refund_policy: l.refund_policy ?? '',
      refund_policy_en: l.refund_policy_en ?? '',
      show_registered_count: l.show_registered_count ?? true,
      period_override: l.period_override ?? '',
      secretary_name: l.secretary_name ?? '',
      secretary_name_en: l.secretary_name_en ?? '',
      secretary_phone: l.secretary_phone ?? '',
      secretary_telegram: l.secretary_telegram ?? '',
      related_league_ids: (l.related_league_ids as string[]) ?? [],
      judging_path: l.judging_path ?? '',
      judging_path_en: l.judging_path_en ?? '',
      technical_committee_notes: l.technical_committee_notes ?? '',
      technical_committee_notes_en: l.technical_committee_notes_en ?? '',
      results_status: (l.results_status as string) || 'auto',
    })
    setScoringText(scoringToText(l.scoring_rows))
    setScoringTextEn(scoringToText(l.scoring_rows_en))
    setTimelineText(timelineToText(l.timeline_steps))
    setTimelineTextEn(timelineToText(l.timeline_steps_en))
    setScheduleText(scheduleToText(l.day_schedule))
    setScheduleTextEn(scheduleToText(l.day_schedule_en))
    setAllowedText(listToLines(l.allowed_equipment))
    setAllowedTextEn(listToLines(l.allowed_equipment_en))
    setForbiddenText(listToLines(l.forbidden_equipment))
    setForbiddenTextEn(listToLines(l.forbidden_equipment_en))
  }

  useEffect(() => {
    void reload().catch((err: Error) => setError(err.message))
  }, [leagueId])

  const patch = (partial: Partial<LeagueInput>) =>
    setForm((prev) => (prev ? { ...prev, ...partial } : prev))

  const saveMain = async (event: FormEvent) => {
    event.preventDefault()
    if (!form || !leagueId) return
    setBusy(true)
    setError(null)
    try {
      await updateLeague(leagueId, {
        ...form,
        scoring_rows: textToScoring(scoringText),
        scoring_rows_en: textToScoring(scoringTextEn),
        timeline_steps: textToTimeline(timelineText),
        timeline_steps_en: textToTimeline(timelineTextEn),
        day_schedule: textToSchedule(scheduleText),
        day_schedule_en: textToSchedule(scheduleTextEn),
        allowed_equipment: linesToList(allowedText),
        allowed_equipment_en: linesToList(allowedTextEn),
        forbidden_equipment: linesToList(forbiddenText),
        forbidden_equipment_en: linesToList(forbiddenTextEn),
        capacity: form.capacity ? Number(form.capacity) : null,
        registration_fee: Number(form.registration_fee ?? 0),
        captain_fee: Number(form.captain_fee ?? 0),
        member_fee: Number(form.member_fee ?? 0),
        current_season_year: Number(form.current_season_year ?? new Date().getFullYear()),
        team_size_min: form.team_size_min ? Number(form.team_size_min) : null,
        team_size_max: form.team_size_max ? Number(form.team_size_max) : null,
      })
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  if (!form || !league) {
    return <div className="px-4 py-10 text-rc-muted">{error ?? t('app.loading')}</div>
  }

  const tabs: Tab[] = [
    'basics',
    'content',
    'specs',
    'rules',
    'schedule',
    'equipment',
    'files',
    'people',
    'sponsors',
    'faqs',
    'results',
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">{t('admin.leagueDetail.title')}</h1>
          <p className="mt-1 text-rc-muted">{league.name}</p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link to={`/leagues/${league.slug}`} className="text-rc-blue hover:underline">
            {t('admin.leagueDetail.preview')}
          </Link>
          <Link to="/super-admin/leagues" className="text-rc-muted hover:text-rc-blue">
            {t('admin.leagueDetail.back')}
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((key) => (
          <Button
            key={key}
            type="button"
            variant={tab === key ? 'primary' : 'ghost'}
            onClick={() => setTab(key)}
          >
            {t(`admin.leagueDetail.tabs.${key}`)}
          </Button>
        ))}
      </div>

      <FieldError message={error ?? undefined} />

      <form className="space-y-4" onSubmit={(e) => void saveMain(e)}>
        {tab === 'basics' && (
          <PanelCard title={t('admin.leagueDetail.tabs.basics')}>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label={t('admin.leagues.name')} value={form.name} onChange={(e) => patch({ name: e.target.value })} required />
              <Input label="نام لیگ به انگلیسی" value={form.name_en ?? ''} onChange={(e) => patch({ name_en: e.target.value })} required dir="ltr" />
              <Input label={t('admin.leagues.slug')} value={form.slug ?? ''} onChange={(e) => patch({ slug: e.target.value })} dir="ltr" />
              <Input label={t('admin.leagues.category')} value={form.category ?? ''} onChange={(e) => patch({ category: e.target.value })} />
              <Input label="دسته‌بندی انگلیسی" value={form.category_en ?? ''} onChange={(e) => patch({ category_en: e.target.value })} dir="ltr" />
              <Select label={t('admin.leagues.active')} value={form.is_active ? '1' : '0'} onChange={(e) => patch({ is_active: e.target.value === '1' })}>
                <option value="1">{t('admin.leagues.activeYes')}</option>
                <option value="0">{t('admin.leagues.activeNo')}</option>
              </Select>
              <Select
                label={t('admin.leagueDetail.period')}
                value={form.period_override || ''}
                onChange={(e) => patch({ period_override: e.target.value || null })}
              >
                <option value="">{t('admin.leagueDetail.periodAuto')}</option>
                <option value="upcoming">{t('leaguePage.period.upcoming')}</option>
                <option value="open">{t('leaguePage.period.open')}</option>
                <option value="ongoing">{t('leaguePage.period.ongoing')}</option>
                <option value="full">{t('leaguePage.period.full')}</option>
                <option value="ended">{t('leaguePage.period.ended')}</option>
              </Select>
              <Select
                label={t('liveResults.boardMode')}
                value={(form.results_status as string) || 'auto'}
                onChange={(e) =>
                  patch({
                    results_status: e.target.value as 'auto' | 'hidden' | 'live' | 'final',
                  })
                }
              >
                <option value="auto">{t('liveResults.modeAuto')}</option>
                <option value="live">{t('liveResults.modeLive')}</option>
                <option value="final">{t('liveResults.modeFinal')}</option>
                <option value="hidden">{t('liveResults.modeHidden')}</option>
              </Select>
              <Select
                label={t('admin.leagueDetail.showCount')}
                value={form.show_registered_count ? '1' : '0'}
                onChange={(e) => patch({ show_registered_count: e.target.value === '1' })}
              >
                <option value="1">{t('admin.leagueDetail.showOn')}</option>
                <option value="0">{t('admin.leagueDetail.showOff')}</option>
              </Select>
            </div>
          </PanelCard>
        )}

        {tab === 'content' && (
          <PanelCard title={t('admin.leagueDetail.tabs.content')}>
            <div className="space-y-4">
              <Textarea label={t('admin.leagueDetail.shortDesc')} value={form.short_description ?? ''} onChange={(e) => patch({ short_description: e.target.value })} />
              <Textarea label="توضیح کوتاه انگلیسی" value={form.short_description_en ?? ''} onChange={(e) => patch({ short_description_en: e.target.value })} dir="ltr" />
              <Textarea label={t('admin.leagueDetail.fullDesc')} className="min-h-40" value={form.full_description ?? ''} onChange={(e) => patch({ full_description: e.target.value })} />
              <Textarea label="توضیح کامل انگلیسی" className="min-h-40" value={form.full_description_en ?? ''} onChange={(e) => patch({ full_description_en: e.target.value })} dir="ltr" />
              <ImageUploadField
                label={t('admin.leagueDetail.coverImage')}
                value={form.cover_image_url}
                onChange={(url) => patch({ cover_image_url: url })}
              />
              <ImageUploadField
                label={t('admin.leagueDetail.heroImage')}
                value={form.hero_image_url}
                onChange={(url) => patch({ hero_image_url: url })}
              />
              <Input label={t('admin.leagueDetail.heroVideo')} value={form.hero_video_url ?? ''} onChange={(e) => patch({ hero_video_url: e.target.value })} dir="ltr" />
              <Input label={t('admin.leagueDetail.introVideo')} value={form.intro_video_url ?? ''} onChange={(e) => patch({ intro_video_url: e.target.value })} dir="ltr" />
              <Input label={t('admin.leagueDetail.regulationPdf')} value={form.regulation_pdf_url ?? ''} onChange={(e) => patch({ regulation_pdf_url: e.target.value })} dir="ltr" />
              <p className="text-xs text-rc-muted">{t('admin.leagueDetail.galleryHint')}</p>
              <p className="text-xs text-rc-muted">{t('admin.leagueDetail.newsHint')}</p>
            </div>
          </PanelCard>
        )}

        {tab === 'specs' && (
          <PanelCard title={t('admin.leagueDetail.tabs.specs')}>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label={t('leaguePage.age')} value={form.age_range ?? ''} onChange={(e) => patch({ age_range: e.target.value })} />
              <Input label="رده سنی انگلیسی" value={form.age_range_en ?? ''} onChange={(e) => patch({ age_range_en: e.target.value })} dir="ltr" />
              <Input label={t('admin.leagues.capacity')} type="number" value={form.capacity ?? ''} onChange={(e) => patch({ capacity: e.target.value ? Number(e.target.value) : null })} dir="ltr" />
              <Select label={t('leaguePage.mode')} value={form.participation_mode ?? 'team'} onChange={(e) => patch({ participation_mode: e.target.value })}>
                <option value="team">{t('leaguePage.team')}</option>
                <option value="individual">{t('leaguePage.individual')}</option>
              </Select>
              <Input label={t('admin.leagueDetail.teamMin')} type="number" value={form.team_size_min ?? ''} onChange={(e) => patch({ team_size_min: e.target.value ? Number(e.target.value) : null })} dir="ltr" />
              <Input label={t('admin.leagueDetail.teamMax')} type="number" value={form.team_size_max ?? ''} onChange={(e) => patch({ team_size_max: e.target.value ? Number(e.target.value) : null })} dir="ltr" />
              <Input label={t('admin.leagues.fee')} type="number" value={form.registration_fee ?? 0} onChange={(e) => patch({ registration_fee: Number(e.target.value) })} dir="ltr" />
              <Input label="هزینه سرپرست (ریال)" type="number" value={form.captain_fee ?? 0} onChange={(e) => patch({ captain_fee: Number(e.target.value) })} dir="ltr" />
              <Input label="هزینه هر عضو (ریال)" type="number" value={form.member_fee ?? 0} onChange={(e) => patch({ member_fee: Number(e.target.value) })} dir="ltr" />
              <Input label="حداقل سن" type="number" value={form.min_age ?? ''} onChange={(e) => patch({ min_age: e.target.value ? Number(e.target.value) : null })} dir="ltr" />
              <Input label="حداکثر سن" type="number" value={form.max_age ?? ''} onChange={(e) => patch({ max_age: e.target.value ? Number(e.target.value) : null })} dir="ltr" />
              <Input label="سال دوره فعال" type="number" value={form.current_season_year ?? ''} onChange={(e) => patch({ current_season_year: Number(e.target.value) })} dir="ltr" />
              <Select label="وضعیت دوره ثبت‌نام" value={form.registration_cycle_status ?? 'open'} onChange={(e) => patch({ registration_cycle_status: e.target.value })}>
                <option value="draft">پیش‌نویس</option>
                <option value="open">باز</option>
                <option value="closed">بسته</option>
                <option value="archived">بایگانی‌شده</option>
              </Select>
              <DateTimeField label={t('admin.leagues.openAt')} value={form.registration_open_at} onChange={(iso) => patch({ registration_open_at: iso })} />
              <DateTimeField label={t('admin.leagues.closeAt')} value={form.registration_close_at} onChange={(iso) => patch({ registration_close_at: iso })} />
              <DateTimeField label="مهلت مجاز ویرایش اعضای تیم" value={form.team_edit_deadline} onChange={(iso) => patch({ team_edit_deadline: iso })} />
              <DateTimeField label={t('admin.leagueDetail.eventStart')} value={form.event_starts_at} onChange={(iso) => patch({ event_starts_at: iso })} />
              <DateTimeField label={t('admin.leagueDetail.eventEnd')} value={form.event_ends_at} onChange={(iso) => patch({ event_ends_at: iso })} />
              <Input label={t('leaguePage.venue')} value={form.venue_name ?? ''} onChange={(e) => patch({ venue_name: e.target.value })} />
              <Input label="نام محل برگزاری انگلیسی" value={form.venue_name_en ?? ''} onChange={(e) => patch({ venue_name_en: e.target.value })} dir="ltr" />
              <Input label={t('admin.leagueDetail.venueAddress')} value={form.venue_address ?? ''} onChange={(e) => patch({ venue_address: e.target.value })} />
              <Input label="نشانی محل برگزاری انگلیسی" value={form.venue_address_en ?? ''} onChange={(e) => patch({ venue_address_en: e.target.value })} dir="ltr" />
              <Input label={t('admin.leagueDetail.mapEmbed')} value={form.venue_map_embed_url ?? ''} onChange={(e) => patch({ venue_map_embed_url: e.target.value })} dir="ltr" />
              <Input label={t('leaguePage.difficulty')} value={form.difficulty_level ?? ''} onChange={(e) => patch({ difficulty_level: e.target.value })} />
              <Input label="سطح دشواری انگلیسی" value={form.difficulty_level_en ?? ''} onChange={(e) => patch({ difficulty_level_en: e.target.value })} dir="ltr" />
              <Input label={t('leaguePage.language')} value={form.competition_language ?? ''} onChange={(e) => patch({ competition_language: e.target.value })} />
              <Input label="زبان مسابقه انگلیسی" value={form.competition_language_en ?? ''} onChange={(e) => patch({ competition_language_en: e.target.value })} dir="ltr" />
              <Textarea label={t('admin.leagueDetail.discount')} value={form.discount_info ?? ''} onChange={(e) => patch({ discount_info: e.target.value })} />
              <Textarea label="توضیحات تخفیف انگلیسی" value={form.discount_info_en ?? ''} onChange={(e) => patch({ discount_info_en: e.target.value })} dir="ltr" />
              <Textarea label={t('admin.leagueDetail.refund')} value={form.refund_policy ?? ''} onChange={(e) => patch({ refund_policy: e.target.value })} />
              <Textarea label="قوانین بازپرداخت انگلیسی" value={form.refund_policy_en ?? ''} onChange={(e) => patch({ refund_policy_en: e.target.value })} dir="ltr" />
              <Input label={t('admin.leagueDetail.secretaryName')} value={form.secretary_name ?? ''} onChange={(e) => patch({ secretary_name: e.target.value })} />
              <Input label="نام دبیر انگلیسی" value={form.secretary_name_en ?? ''} onChange={(e) => patch({ secretary_name_en: e.target.value })} dir="ltr" />
              <Input label={t('admin.leagueDetail.secretaryPhone')} value={form.secretary_phone ?? ''} onChange={(e) => patch({ secretary_phone: e.target.value })} dir="ltr" />
              <Input label={t('admin.leagues.email')} value={form.contact_email ?? ''} onChange={(e) => patch({ contact_email: e.target.value })} dir="ltr" />
              <Input label={t('admin.leagueDetail.secretaryTelegram')} value={form.secretary_telegram ?? ''} onChange={(e) => patch({ secretary_telegram: e.target.value })} dir="ltr" />
            </div>
            <div className="mt-4">
              <p className="mb-2 text-sm text-rc-muted">{t('admin.leagueDetail.related')}</p>
              <div className="flex flex-wrap gap-3">
                {allLeagues.map((l) => {
                  const checked = (form.related_league_ids ?? []).includes(l.id)
                  return (
                    <label key={l.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const cur = new Set(form.related_league_ids ?? [])
                          if (checked) cur.delete(l.id)
                          else cur.add(l.id)
                          patch({ related_league_ids: [...cur] })
                        }}
                      />
                      {l.name}
                    </label>
                  )
                })}
              </div>
            </div>
          </PanelCard>
        )}

        {tab === 'rules' && (
          <PanelCard title={t('admin.leagueDetail.tabs.rules')}>
            <Textarea label={t('leaguePage.rules')} className="min-h-32" value={form.rules_summary ?? ''} onChange={(e) => patch({ rules_summary: e.target.value })} />
            <Textarea label="خلاصه قوانین انگلیسی" className="min-h-32" value={form.rules_summary_en ?? ''} onChange={(e) => patch({ rules_summary_en: e.target.value })} dir="ltr" />
            <Input label={t('admin.leagueDetail.rulesPdf')} value={form.rules_pdf_url ?? ''} onChange={(e) => patch({ rules_pdf_url: e.target.value })} dir="ltr" />
            <Textarea label={t('admin.leagueDetail.scoringHint')} className="min-h-28 font-mono text-sm" value={scoringText} onChange={(e) => setScoringText(e.target.value)} />
            <Textarea label="امتیازدهی انگلیسی (عنوان | امتیاز)" className="min-h-28 font-mono text-sm" value={scoringTextEn} onChange={(e) => setScoringTextEn(e.target.value)} dir="ltr" />
          </PanelCard>
        )}

        {tab === 'schedule' && (
          <PanelCard title={t('admin.leagueDetail.tabs.schedule')}>
            <Textarea label={t('admin.leagueDetail.timelineHint')} className="min-h-28 font-mono text-sm" value={timelineText} onChange={(e) => setTimelineText(e.target.value)} />
            <Textarea label="مراحل زمانی انگلیسی" className="min-h-28 font-mono text-sm" value={timelineTextEn} onChange={(e) => setTimelineTextEn(e.target.value)} dir="ltr" />
            <Textarea label={t('admin.leagueDetail.dayHint')} className="min-h-28 font-mono text-sm" value={scheduleText} onChange={(e) => setScheduleText(e.target.value)} />
            <Textarea label="برنامه روز مسابقه انگلیسی" className="min-h-28 font-mono text-sm" value={scheduleTextEn} onChange={(e) => setScheduleTextEn(e.target.value)} dir="ltr" />
          </PanelCard>
        )}

        {tab === 'equipment' && (
          <PanelCard title={t('admin.leagueDetail.tabs.equipment')}>
            <Textarea label={t('leaguePage.allowed')} value={allowedText} onChange={(e) => setAllowedText(e.target.value)} />
            <Textarea label="تجهیزات مجاز انگلیسی" value={allowedTextEn} onChange={(e) => setAllowedTextEn(e.target.value)} dir="ltr" />
            <Textarea label={t('leaguePage.forbidden')} value={forbiddenText} onChange={(e) => setForbiddenText(e.target.value)} />
            <Textarea label="تجهیزات غیرمجاز انگلیسی" value={forbiddenTextEn} onChange={(e) => setForbiddenTextEn(e.target.value)} dir="ltr" />
          </PanelCard>
        )}

        {(tab === 'basics' ||
          tab === 'content' ||
          tab === 'specs' ||
          tab === 'rules' ||
          tab === 'schedule' ||
          tab === 'equipment') && (
          <Button type="submit" disabled={busy}>
            {busy ? t('app.loading') : t('common.save')}
          </Button>
        )}
      </form>

      {tab === 'files' && (
        <PanelCard title={t('admin.leagueDetail.tabs.files')}>
          <form
            className="mb-4 grid gap-3 md:grid-cols-4 md:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              void upsertLeagueFile({
                league_id: leagueId,
                title: fileTitle,
                title_en: fileTitleEn,
                file_url: fileUrl,
                file_kind: fileKind,
              })
                .then(() => {
                  setFileTitle('')
                  setFileTitleEn('')
                  setFileUrl('')
                  return reload()
                })
                .catch((err: Error) => setError(err.message))
            }}
          >
            <Input label={t('content.postTitle')} value={fileTitle} onChange={(e) => setFileTitle(e.target.value)} required />
            <Input label="عنوان فایل انگلیسی" value={fileTitleEn} onChange={(e) => setFileTitleEn(e.target.value)} dir="ltr" />
            <Input label="URL" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} dir="ltr" required />
            <Input label={t('content.mediaType')} value={fileKind} onChange={(e) => setFileKind(e.target.value)} />
            <Button type="submit">{t('common.save')}</Button>
          </form>
          <ul className="divide-y divide-rc-line">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>{f.title}</span>
                <Button type="button" variant="danger" onClick={() => void deleteLeagueFile(f.id).then(reload)}>
                  {t('common.delete')}
                </Button>
              </li>
            ))}
          </ul>
        </PanelCard>
      )}

      {tab === 'people' && (
        <div className="space-y-4">
          <PanelCard title={t('admin.leagueDetail.judgingPath')}>
            <Textarea
              label={t('admin.leagueDetail.judgingPath')}
              className="min-h-32"
              value={form.judging_path ?? ''}
              onChange={(e) => patch({ judging_path: e.target.value })}
            />
            <Textarea label="مسیر داوری انگلیسی" className="mt-3 min-h-32" value={form.judging_path_en ?? ''} onChange={(e) => patch({ judging_path_en: e.target.value })} dir="ltr" />
            <Textarea
              label={t('admin.leagueDetail.techNotes')}
              className="mt-3 min-h-28"
              value={form.technical_committee_notes ?? ''}
              onChange={(e) => patch({ technical_committee_notes: e.target.value })}
            />
            <Textarea label="توضیحات کمیته فنی انگلیسی" className="mt-3 min-h-28" value={form.technical_committee_notes_en ?? ''} onChange={(e) => patch({ technical_committee_notes_en: e.target.value })} dir="ltr" />
            <Button type="button" className="mt-3" onClick={() => void saveMain({ preventDefault() {} } as FormEvent)}>
              {t('common.save')}
            </Button>
          </PanelCard>
        <PanelCard title={t('admin.leagueDetail.tabs.people')}>
          <form
            className="mb-4 grid gap-3 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault()
              void upsertLeaguePerson({
                league_id: leagueId,
                full_name: personName,
                full_name_en: personNameEn,
                role_kind: personRole,
                specialty: personSpecialty,
                specialty_en: personSpecialtyEn,
                bio: personBio,
                bio_en: personBioEn,
                photo_url: personPhoto,
              })
                .then(() => {
                  setPersonName('')
                  setPersonNameEn('')
                  setPersonSpecialty('')
                  setPersonSpecialtyEn('')
                  setPersonBio('')
                  setPersonBioEn('')
                  setPersonPhoto('')
                  return reload()
                })
                .catch((err: Error) => setError(err.message))
            }}
          >
            <Input label="نام و نام خانوادگی فارسی" value={personName} onChange={(e) => setPersonName(e.target.value)} required />
            <Input label="Full name in English" value={personNameEn} onChange={(e) => setPersonNameEn(e.target.value)} required dir="ltr" />
            <Select label="Role" value={personRole} onChange={(e) => setPersonRole(e.target.value)}>
              <option value="judge">judge</option>
              <option value="committee">committee</option>
            </Select>
            <Input label={t('leaguePage.specialty')} value={personSpecialty} onChange={(e) => setPersonSpecialty(e.target.value)} />
            <Input label="Specialty in English" value={personSpecialtyEn} onChange={(e) => setPersonSpecialtyEn(e.target.value)} dir="ltr" />
            <div className="md:col-span-2">
              <ImageUploadField label="Photo" value={personPhoto} onChange={(url) => setPersonPhoto(url ?? '')} />
            </div>
            <Textarea label="Bio" value={personBio} onChange={(e) => setPersonBio(e.target.value)} />
            <Textarea label="Biography in English" value={personBioEn} onChange={(e) => setPersonBioEn(e.target.value)} dir="ltr" />
            <Button type="submit">{t('common.save')}</Button>
          </form>
          <ul className="divide-y divide-rc-line">
            {people.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span>
                  {p.full_name} · {p.role_kind}
                </span>
                <span className="flex flex-wrap gap-2"><Link to={`/super-admin/people/${p.id}`}><Button type="button" variant="secondary">ویرایش رزومه</Button></Link><Link to={`/people/${p.slug}`} target="_blank"><Button type="button" variant="ghost">نمایش</Button></Link><Button type="button" variant="danger" onClick={() => void deleteLeaguePerson(p.id).then(reload)}>{t('common.delete')}</Button></span>
              </li>
            ))}
          </ul>
        </PanelCard>
        </div>
      )}

      {tab === 'sponsors' && (
        <PanelCard title={t('admin.leagueDetail.tabs.sponsors')}>
          <form
            className="mb-4 grid gap-3 md:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault()
              void upsertLeagueSponsor({
                league_id: leagueId,
                name: sponsorName,
                name_en: sponsorNameEn,
                logo_url: sponsorLogo,
                website_url: sponsorUrl,
              })
                .then(() => {
                  setSponsorName('')
                  setSponsorNameEn('')
                  setSponsorLogo('')
                  setSponsorUrl('')
                  return reload()
                })
                .catch((err: Error) => setError(err.message))
            }}
          >
            <Input label="Name" value={sponsorName} onChange={(e) => setSponsorName(e.target.value)} required />
            <Input label="نام حامی انگلیسی" value={sponsorNameEn} onChange={(e) => setSponsorNameEn(e.target.value)} dir="ltr" />
            <div className="md:col-span-2">
              <ImageUploadField label="Logo" value={sponsorLogo} onChange={(url) => setSponsorLogo(url ?? '')} />
            </div>
            <Input label="Website" value={sponsorUrl} onChange={(e) => setSponsorUrl(e.target.value)} dir="ltr" />
            <Button type="submit">{t('common.save')}</Button>
          </form>
          <ul className="divide-y divide-rc-line">
            {sponsors.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <span>{s.name}</span>
                <Button type="button" variant="danger" onClick={() => void deleteLeagueSponsor(s.id).then(reload)}>
                  {t('common.delete')}
                </Button>
              </li>
            ))}
          </ul>
        </PanelCard>
      )}

      {tab === 'faqs' && (
        <PanelCard title={t('admin.leagueDetail.tabs.faqs')}>
          <form
            className="mb-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void upsertLeagueFaq({ league_id: leagueId, question: faqQ, question_en: faqQEn, answer: faqA, answer_en: faqAEn })
                .then(() => {
                  setFaqQ('')
                  setFaqQEn('')
                  setFaqA('')
                  setFaqAEn('')
                  return reload()
                })
                .catch((err: Error) => setError(err.message))
            }}
          >
            <Input label="Q" value={faqQ} onChange={(e) => setFaqQ(e.target.value)} required />
            <Input label="Question in English" value={faqQEn} onChange={(e) => setFaqQEn(e.target.value)} dir="ltr" />
            <Textarea label="A" value={faqA} onChange={(e) => setFaqA(e.target.value)} required />
            <Textarea label="Answer in English" value={faqAEn} onChange={(e) => setFaqAEn(e.target.value)} dir="ltr" />
            <Button type="submit">{t('common.save')}</Button>
          </form>
          <ul className="divide-y divide-rc-line">
            {faqs.map((f) => (
              <li key={f.id} className="flex items-center justify-between py-2 text-sm">
                <span>{f.question}</span>
                <Button type="button" variant="danger" onClick={() => void deleteLeagueFaq(f.id).then(reload)}>
                  {t('common.delete')}
                </Button>
              </li>
            ))}
          </ul>
        </PanelCard>
      )}

      {tab === 'results' && (
        <PanelCard title={t('admin.leagueDetail.tabs.results')}>
          <form
            className="mb-4 grid gap-3 md:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault()
              void upsertLeaguePastResult({
                league_id: leagueId,
                season_year: Number(year),
                first_place: first,
                second_place: second,
                third_place: third,
              })
                .then(() => {
                  setFirst('')
                  setSecond('')
                  setThird('')
                  return reload()
                })
                .catch((err: Error) => setError(err.message))
            }}
          >
            <Input label={t('rankings.year')} value={year} onChange={(e) => setYear(e.target.value)} dir="ltr" />
            <Input label={t('companies.gold')} value={first} onChange={(e) => setFirst(e.target.value)} />
            <Input label={t('companies.silver')} value={second} onChange={(e) => setSecond(e.target.value)} />
            <Input label={t('companies.bronze')} value={third} onChange={(e) => setThird(e.target.value)} />
            <Button type="submit">{t('common.save')}</Button>
          </form>
          <ul className="divide-y divide-rc-line">
            {past.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {r.season_year}: {r.first_place} / {r.second_place} / {r.third_place}
                </span>
                <Button type="button" variant="danger" onClick={() => void deleteLeaguePastResult(r.id).then(reload)}>
                  {t('common.delete')}
                </Button>
              </li>
            ))}
          </ul>
        </PanelCard>
      )}
    </div>
  )
}
