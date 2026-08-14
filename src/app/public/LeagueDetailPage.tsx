import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/FormControls'
import { usePageSeo } from '@/components/seo/SeoManager'
import { useAuth } from '@/hooks/useAuth'
import { fetchLeagueDetailBundle, type LeagueDetailBundle } from '@/features/leagues/detailApi'
import { computeLeaguePeriod, periodBadgeClass } from '@/features/leagues/period'
import { formatAmountToman } from '@/features/payments/api'
import { formatAppDateTime, leagueCoverUrl } from '@/lib/dates'

function CountdownHud({ target }: { target: string }) {
  const { t } = useTranslation()
  const [parts, setParts] = useState({ d: 0, h: 0, m: 0, done: false })

  useEffect(() => {
    const tick = () => {
      const ms = new Date(target).getTime() - Date.now()
      if (ms <= 0) {
        setParts({ d: 0, h: 0, m: 0, done: true })
        return
      }
      setParts({
        d: Math.floor(ms / 86400000),
        h: Math.floor((ms % 86400000) / 3600000),
        m: Math.floor((ms % 3600000) / 60000),
        done: false,
      })
    }
    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [target])

  if (parts.done) {
    return (
      <p className="font-mono text-sm tracking-widest text-rc-accent uppercase">
        {t('leaguePage.countdownDone')}
      </p>
    )
  }

  const cells = [
    { label: 'D', value: parts.d },
    { label: 'H', value: parts.h },
    { label: 'M', value: parts.m },
  ]

  return (
    <div>
      <p className="mb-2 font-mono text-[10px] tracking-[0.35em] text-rc-blue uppercase">
        {t('leaguePage.countdown')}
      </p>
      <div className="flex flex-wrap gap-2">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className="min-w-[4.5rem] border border-rc-blue/35 bg-black/35 px-3 py-2 text-center backdrop-blur-sm"
          >
            <p className="font-mono text-2xl font-semibold tabular-nums text-rc-text md:text-3xl">
              {String(cell.value).padStart(2, '0')}
            </p>
            <p className="font-mono text-[10px] tracking-widest text-rc-muted">{cell.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function SectionFrame({
  index,
  title,
  children,
  tone = 'default',
}: {
  index: string
  title: string
  children: ReactNode
  tone?: 'default' | 'accent'
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="relative"
    >
      <div className="mb-6 flex items-end gap-4 border-b border-rc-line pb-3">
        <span
          className={[
            'font-mono text-xs tracking-[0.3em]',
            tone === 'accent' ? 'text-rc-accent' : 'text-rc-blue',
          ].join(' ')}
        >
          {index}
        </span>
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h2>
        <span className="ms-auto hidden h-px flex-1 bg-gradient-to-l from-transparent to-rc-blue/40 sm:block" />
      </div>
      {children}
    </motion.section>
  )
}

function Corners({ className = '' }: { className?: string }) {
  return (
    <>
      <span className={`pointer-events-none absolute start-0 top-0 size-3 border-s-2 border-t-2 border-rc-blue/70 ${className}`} />
      <span className={`pointer-events-none absolute end-0 top-0 size-3 border-e-2 border-t-2 border-rc-blue/70 ${className}`} />
      <span className={`pointer-events-none absolute start-0 bottom-0 size-3 border-s-2 border-b-2 border-rc-blue/70 ${className}`} />
      <span className={`pointer-events-none absolute end-0 bottom-0 size-3 border-e-2 border-b-2 border-rc-blue/70 ${className}`} />
    </>
  )
}

export function LeagueDetailPage() {
  const { slug } = useParams()
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [bundle, setBundle] = useState<LeagueDetailBundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [openFaq, setOpenFaq] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    void fetchLeagueDetailBundle(slug)
      .then((data) => {
        setBundle(data)
        if (!data) setError(t('leaguePage.notFound'))
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [slug, t])

  const league = bundle?.league
  const period = useMemo(
    () => (league ? computeLeaguePeriod(league, bundle?.registeredCount ?? 0) : 'upcoming'),
    [league, bundle?.registeredCount],
  )

  usePageSeo({
    title: league?.name,
    description: league?.short_description || league?.description || undefined,
    image: leagueCoverUrl(league || {}) || undefined,
  })

  if (loading) {
    return (
      <div className="league-mission flex min-h-[50vh] items-center justify-center px-4">
        <p className="font-mono text-sm tracking-widest text-rc-muted uppercase">{t('app.loading')}</p>
      </div>
    )
  }

  if (!bundle || !league) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="font-mono text-red-400">{error ?? t('leaguePage.notFound')}</p>
        <Link to="/leagues" className="mt-4 inline-block font-mono text-sm text-rc-blue hover:underline">
          {t('leaguePage.back')}
        </Link>
      </div>
    )
  }

  const scoring = league.scoring_rows ?? []
  const timeline = league.timeline_steps ?? []
  const schedule = league.day_schedule ?? []
  const allowed = league.allowed_equipment ?? []
  const forbidden = league.forbidden_equipment ?? []
  const canRegister = period === 'open'
  const regPath = user ? '/dashboard' : canRegister ? '/signup' : '/login'
  const statusLabel =
    period === 'open'
      ? t('leaguePage.statusOpen')
      : period === 'full'
        ? t('leaguePage.statusFull')
        : t('leaguePage.statusClosed')
  const cover = leagueCoverUrl(league)
  const showCountdown =
    Boolean(league.event_starts_at) && new Date(league.event_starts_at!).getTime() > Date.now()

  let section = 1
  const nextIndex = () => String(section++).padStart(2, '0')

  const rich = (html: string) =>
    /<\/?[a-z][\s\S]*>/i.test(html) ? (
      <div
        className="max-w-3xl leading-relaxed text-rc-muted [&_a]:text-rc-blue [&_h2]:text-rc-text [&_strong]:text-rc-text"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    ) : (
      <p className="max-w-3xl whitespace-pre-wrap leading-relaxed text-rc-muted">{html}</p>
    )

  const ctaLabel = user
    ? t('leaguePage.goPanel')
    : canRegister
      ? t('leaguePage.register')
      : t('leaguePage.registerClosed')

  const specs = [
    [t('leaguePage.age'), league.age_range],
    [t('leaguePage.capacity'), league.capacity != null ? String(league.capacity) : null],
    [
      t('leaguePage.mode'),
      league.participation_mode === 'individual' ? t('leaguePage.individual') : t('leaguePage.team'),
    ],
    [
      t('leaguePage.teamSize'),
      league.team_size_min || league.team_size_max
        ? `${league.team_size_min ?? '—'} – ${league.team_size_max ?? '—'}`
        : null,
    ],
    [
      t('leaguePage.eventTime'),
      league.event_starts_at ? formatAppDateTime(league.event_starts_at, i18n.language) : null,
    ],
    [t('leaguePage.venue'), league.venue_name],
    [t('leaguePage.difficulty'), league.difficulty_level],
    [t('leaguePage.language'), league.competition_language],
  ].filter(([, v]) => Boolean(v)) as [string, string][]

  return (
    <div className="league-mission relative overflow-hidden">
      {/* Atmosphere */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--rc-glow-blue),_transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--rc-glow-orange),_transparent_50%)]" />
        <div className="league-mission-grid absolute inset-0" />
      </div>

      {/* HERO — full-bleed composition */}
      <section className="relative min-h-[88vh] overflow-hidden">
        {league.hero_video_url ? (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src={league.hero_video_url}
            autoPlay
            muted
            loop
            playsInline
          />
        ) : cover ? (
          <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#07101f] via-rc-bg to-[#1a0f08]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-rc-bg via-rc-bg/75 to-rc-bg/25" />
        <div className="league-mission-scan absolute inset-0" />
        <div className="league-mission-grid absolute inset-0 opacity-60" />

        {/* HUD corner frame */}
        <div className="pointer-events-none absolute inset-4 border border-rc-blue/20 md:inset-8">
          <Corners />
        </div>

        <div className="relative mx-auto flex min-h-[88vh] max-w-6xl flex-col justify-end px-4 pb-16 pt-28 md:pb-20">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
          >
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-2 border px-3 py-1 font-mono text-[11px] tracking-wider uppercase ${periodBadgeClass(period)}`}
              >
                <span className="size-1.5 rounded-full bg-current league-node-pulse" />
                {t(`leaguePage.period.${period}`)}
              </span>
              <span
                className={`inline-flex items-center gap-2 border px-3 py-1 font-mono text-[11px] tracking-wider ${periodBadgeClass(
                  period === 'open' ? 'open' : period === 'full' ? 'full' : 'ended',
                )}`}
              >
                {statusLabel}
              </span>
              {league.category ? (
                <span className="border border-rc-line bg-black/30 px-3 py-1 font-mono text-[11px] tracking-wider text-rc-muted uppercase backdrop-blur-sm">
                  {league.category}
                </span>
              ) : null}
            </div>

            <p className="font-mono text-[11px] tracking-[0.4em] text-rc-blue uppercase">
              RoboCactus · Mission Pack
            </p>
            <h1 className="mt-3 max-w-4xl text-4xl font-bold leading-[1.1] tracking-tight md:text-6xl">
              {league.name}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-rc-muted md:text-lg">
              {league.short_description || league.description}
            </p>

            {showCountdown ? (
              <div className="mt-8">
                <CountdownHud target={league.event_starts_at!} />
              </div>
            ) : null}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to={regPath}
                className="group relative inline-flex items-center gap-2 bg-rc-accent px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
              >
                <span className="font-mono text-[10px] tracking-widest opacity-80">01</span>
                {ctaLabel}
                <span className="transition group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5">→</span>
              </Link>
              {league.regulation_pdf_url ? (
                <a
                  href={league.regulation_pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 border border-rc-blue/50 bg-rc-blue/10 px-6 py-3 text-sm text-rc-blue backdrop-blur-sm transition hover:bg-rc-blue/20"
                >
                  <span className="font-mono text-[10px] tracking-widest">02</span>
                  {t('leaguePage.downloadRules')}
                </a>
              ) : null}
            </div>

            {league.show_registered_count !== false ? (
              <p className="mt-6 font-mono text-xs tracking-wide text-rc-muted">
                <span className="text-rc-blue">▸</span>{' '}
                {t('leaguePage.registeredCount', { count: bundle.registeredCount })}
              </p>
            ) : null}
          </motion.div>
        </div>
      </section>

      <div className="relative mx-auto max-w-6xl space-y-20 px-4 py-16 md:py-24">
        {(league.full_description || league.description) && (
          <SectionFrame index={nextIndex()} title={t('leaguePage.about')}>
            <div className="relative border border-rc-line bg-rc-surface/80 p-6 backdrop-blur-sm md:p-8">
              <Corners />
              {rich(league.full_description || league.description || '')}
            </div>
          </SectionFrame>
        )}

        {specs.length > 0 && (
          <SectionFrame index={nextIndex()} title={t('leaguePage.specs')}>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {specs.map(([label, value], i) => (
                <li
                  key={label}
                  className="group relative overflow-hidden border border-rc-line bg-rc-surface/90 p-4 transition hover:border-rc-blue/45"
                >
                  <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rc-blue/60 to-transparent opacity-0 transition group-hover:opacity-100" />
                  <p className="font-mono text-[10px] tracking-[0.25em] text-rc-muted uppercase">{label}</p>
                  <p className="mt-2 text-lg font-semibold leading-snug">{value}</p>
                  <p className="mt-3 font-mono text-[10px] text-rc-blue/50">
                    SYS.{String(i + 1).padStart(2, '0')}
                  </p>
                </li>
              ))}
            </ul>
          </SectionFrame>
        )}

        {(league.rules_summary || league.rules_pdf_url) && (
          <SectionFrame index={nextIndex()} title={t('leaguePage.rules')}>
            <div className="relative border border-rc-line bg-rc-surface/80 p-6 md:p-8">
              <Corners />
              {league.rules_summary ? rich(league.rules_summary) : null}
              {league.rules_pdf_url ? (
                <a
                  href={league.rules_pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex border border-rc-blue/40 bg-rc-blue/10 px-4 py-2 font-mono text-xs tracking-wide text-rc-blue hover:bg-rc-blue/20"
                >
                  {t('leaguePage.downloadRulesPdf')} ↗
                </a>
              ) : null}
            </div>
          </SectionFrame>
        )}

        {(league.judging_path || league.technical_committee_notes) && (
          <SectionFrame index={nextIndex()} title={t('admin.leagueDetail.judgingPath')}>
            <div className="relative space-y-4 border border-rc-line bg-rc-surface/80 p-6 md:p-8">
              <Corners />
              {league.judging_path ? rich(league.judging_path) : null}
              {league.technical_committee_notes ? (
                <div>
                  <p className="mb-2 font-mono text-[10px] tracking-[0.2em] text-rc-blue uppercase">
                    {t('admin.leagueDetail.techNotes')}
                  </p>
                  {rich(league.technical_committee_notes)}
                </div>
              ) : null}
            </div>
          </SectionFrame>
        )}

        {scoring.length > 0 && (
          <SectionFrame index={nextIndex()} title={t('leaguePage.scoring')}>
            <div className="overflow-hidden border border-rc-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-rc-line bg-rc-navy/80 font-mono text-[11px] tracking-widest text-rc-muted uppercase">
                    <th className="px-4 py-3 text-start">{t('leaguePage.criteria')}</th>
                    <th className="px-4 py-3 text-start">{t('leaguePage.points')}</th>
                  </tr>
                </thead>
                <tbody>
                  {scoring.map((row, i) => (
                    <tr key={i} className="border-t border-rc-line-soft odd:bg-rc-surface/40">
                      <td className="px-4 py-3">{row.label}</td>
                      <td className="px-4 py-3 font-mono text-rc-accent">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionFrame>
        )}

        {timeline.length > 0 && (
          <SectionFrame index={nextIndex()} title={t('leaguePage.timeline')}>
            <ol className="relative space-y-0 border-s border-rc-blue/30 ps-8">
              {timeline.map((step, i) => (
                <li key={i} className="relative pb-8 last:pb-0">
                  <span className="absolute -start-[2.15rem] top-1 size-3 border-2 border-rc-blue bg-rc-bg league-node-pulse" />
                  <p className="font-mono text-[10px] tracking-[0.3em] text-rc-blue">
                    PHASE {String(i + 1).padStart(2, '0')}
                  </p>
                  <p className="mt-1 text-lg font-semibold">{step.title}</p>
                  {step.date ? (
                    <p className="mt-1 font-mono text-xs text-rc-muted">
                      {Number.isNaN(new Date(step.date).getTime())
                        ? step.date
                        : formatAppDateTime(step.date, i18n.language)}
                    </p>
                  ) : null}
                  {step.description ? (
                    <p className="mt-1 max-w-2xl text-sm text-rc-muted">{step.description}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </SectionFrame>
        )}

        {(allowed.length > 0 || forbidden.length > 0) && (
          <SectionFrame index={nextIndex()} title={t('leaguePage.equipment')}>
            <div className="grid gap-4 md:grid-cols-2">
              {allowed.length ? (
                <div className="relative border border-emerald-500/25 bg-emerald-500/5 p-5">
                  <Corners className="!border-emerald-500/60" />
                  <p className="mb-4 font-mono text-[11px] tracking-[0.25em] text-emerald-400 uppercase">
                    {t('leaguePage.allowed')}
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {allowed.map((x) => (
                      <li
                        key={x}
                        className="border border-emerald-500/30 bg-rc-bg/40 px-3 py-1.5 font-mono text-xs text-rc-text"
                      >
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {forbidden.length ? (
                <div className="relative border border-red-500/25 bg-red-500/5 p-5">
                  <Corners className="!border-red-500/60" />
                  <p className="mb-4 font-mono text-[11px] tracking-[0.25em] text-red-400 uppercase">
                    {t('leaguePage.forbidden')}
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {forbidden.map((x) => (
                      <li
                        key={x}
                        className="border border-red-500/30 bg-rc-bg/40 px-3 py-1.5 font-mono text-xs text-rc-text"
                      >
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </SectionFrame>
        )}

        {bundle.files.length > 0 && (
          <SectionFrame index={nextIndex()} title={t('leaguePage.files')}>
            <ul className="grid gap-2 sm:grid-cols-2">
              {bundle.files.map((f, i) => (
                <li key={f.id}>
                  <a
                    href={f.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center justify-between gap-3 border border-rc-line bg-rc-surface px-4 py-3 transition hover:border-rc-blue/50 hover:bg-rc-hover"
                  >
                    <span>
                      <span className="me-2 font-mono text-[10px] text-rc-blue">
                        F{String(i + 1).padStart(2, '0')}
                      </span>
                      {f.title}
                    </span>
                    <span className="font-mono text-[10px] tracking-wide text-rc-muted uppercase">
                      {f.file_kind} ↗
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </SectionFrame>
        )}

        {(league.intro_video_url || league.hero_video_url) && (
          <SectionFrame index={nextIndex()} title={t('leaguePage.video')}>
            <div className="relative aspect-video overflow-hidden border border-rc-line bg-black">
              <Corners />
              {(league.intro_video_url || league.hero_video_url || '').includes('youtube') ||
              (league.intro_video_url || '').includes('youtu.be') ? (
                <iframe
                  title="intro"
                  src={(league.intro_video_url || league.hero_video_url || '').replace(
                    'watch?v=',
                    'embed/',
                  )}
                  className="h-full w-full"
                  allowFullScreen
                />
              ) : (
                <video
                  src={league.intro_video_url || league.hero_video_url || ''}
                  controls
                  className="h-full w-full"
                />
              )}
            </div>
          </SectionFrame>
        )}

        {bundle.gallery.length > 0 && (
          <SectionFrame index={nextIndex()} title={t('leaguePage.gallery')}>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {bundle.gallery.map((g) => (
                <li
                  key={g.id}
                  className="group relative overflow-hidden border border-rc-line bg-rc-navy"
                >
                  {g.media_type === 'video' ? (
                    <video src={g.media_url} controls className="aspect-[4/3] w-full bg-black" />
                  ) : (
                    <img
                      src={g.media_url}
                      alt={g.caption ?? ''}
                      className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  )}
                  {g.caption || g.season_year ? (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                      <p className="font-mono text-[10px] text-rc-blue">
                        {g.season_year ? `Y${g.season_year}` : 'ARCHIVE'}
                      </p>
                      {g.caption ? <p className="text-xs text-white/90">{g.caption}</p> : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </SectionFrame>
        )}

        {bundle.pastResults.length > 0 && (
          <SectionFrame index={nextIndex()} title={t('leaguePage.pastResults')}>
            <div className="overflow-x-auto border border-rc-line">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b border-rc-line bg-rc-navy/80 font-mono text-[11px] tracking-widest text-rc-muted uppercase">
                    <th className="px-4 py-3 text-start">{t('rankings.year')}</th>
                    <th className="px-4 py-3 text-start">{t('companies.gold')}</th>
                    <th className="px-4 py-3 text-start">{t('companies.silver')}</th>
                    <th className="px-4 py-3 text-start">{t('companies.bronze')}</th>
                  </tr>
                </thead>
                <tbody>
                  {bundle.pastResults.map((r) => (
                    <tr key={r.id} className="border-t border-rc-line-soft">
                      <td className="px-4 py-3 font-mono text-rc-blue">{r.season_year}</td>
                      <td className="px-4 py-3 text-amber-400">{r.first_place ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-300">{r.second_place ?? '—'}</td>
                      <td className="px-4 py-3 text-orange-400/90">{r.third_place ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionFrame>
        )}

        {bundle.faqs.length > 0 && (
          <SectionFrame index={nextIndex()} title={t('leaguePage.faq')}>
            <ul className="divide-y divide-rc-line border border-rc-line">
              {bundle.faqs.map((item, i) => {
                const open = openFaq === item.id
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-4 text-start text-sm font-medium transition hover:bg-rc-hover"
                      onClick={() => setOpenFaq(open ? null : item.id)}
                    >
                      <span className="font-mono text-[10px] text-rc-blue">
                        Q{String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="flex-1">{item.question}</span>
                      <span className="font-mono text-rc-blue">{open ? '−' : '+'}</span>
                    </button>
                    {open ? (
                      <p className="border-t border-rc-line-soft bg-rc-navy/50 px-4 py-4 ps-12 text-sm text-rc-muted">
                        {item.answer}
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </SectionFrame>
        )}

        {bundle.judges.length > 0 && (
          <SectionFrame index={nextIndex()} title={t('leaguePage.judges')}>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {bundle.judges.map((p) => (
                <li
                  key={p.id}
                  className="relative border border-rc-line bg-rc-surface/90 p-5 transition hover:border-rc-blue/40"
                >
                  <Corners />
                  <div className="flex items-start gap-4">
                    {p.photo_url ? (
                      <img
                        src={p.photo_url}
                        alt=""
                        className="size-16 border border-rc-blue/30 object-cover"
                      />
                    ) : (
                      <div className="flex size-16 items-center justify-center border border-rc-line bg-rc-navy font-mono text-rc-blue">
                        ID
                      </div>
                    )}
                    <div>
                      <p className="font-semibold">{p.full_name}</p>
                      {p.specialty ? (
                        <p className="mt-1 font-mono text-[11px] tracking-wide text-rc-blue">
                          {p.specialty}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {p.bio ? <p className="mt-4 text-sm leading-relaxed text-rc-muted">{p.bio}</p> : null}
                </li>
              ))}
            </ul>
          </SectionFrame>
        )}

        {bundle.committee.length > 0 && (
          <SectionFrame index={nextIndex()} title={t('leaguePage.committee')}>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {bundle.committee.map((p) => (
                <li
                  key={p.id}
                  className="relative border border-rc-line bg-rc-surface/90 p-5 transition hover:border-rc-accent/40"
                >
                  <Corners className="!border-rc-accent/60" />
                  <div className="flex items-start gap-4">
                    {p.photo_url ? (
                      <img
                        src={p.photo_url}
                        alt=""
                        className="size-16 border border-rc-accent/30 object-cover"
                      />
                    ) : null}
                    <div>
                      <p className="font-semibold">{p.full_name}</p>
                      {p.specialty ? (
                        <p className="mt-1 font-mono text-[11px] text-rc-accent">{p.specialty}</p>
                      ) : null}
                    </div>
                  </div>
                  {p.bio ? <p className="mt-4 text-sm text-rc-muted">{p.bio}</p> : null}
                </li>
              ))}
            </ul>
          </SectionFrame>
        )}

        {bundle.sponsors.length > 0 && (
          <SectionFrame index={nextIndex()} title={t('leaguePage.sponsors')}>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {bundle.sponsors.map((s) => {
                const inner = s.logo_url ? (
                  <img src={s.logo_url} alt={s.name} className="mx-auto h-10 object-contain opacity-90" />
                ) : (
                  <span className="font-mono text-sm">{s.name}</span>
                )
                return (
                  <li
                    key={s.id}
                    className="flex min-h-24 items-center justify-center border border-rc-line bg-rc-surface/80 px-4 py-6"
                  >
                    {s.website_url ? (
                      <a href={s.website_url} target="_blank" rel="noreferrer" className="block w-full text-center">
                        {inner}
                      </a>
                    ) : (
                      inner
                    )}
                  </li>
                )
              })}
            </ul>
          </SectionFrame>
        )}

        {bundle.news.length > 0 && (
          <SectionFrame index={nextIndex()} title={t('leaguePage.news')}>
            <ul className="space-y-3">
              {bundle.news.map((n) => (
                <li key={n.id} className="relative border border-rc-line border-s-2 border-s-rc-accent bg-rc-surface p-5">
                  <p className="font-mono text-[10px] tracking-widest text-rc-accent uppercase">Intel</p>
                  <p className="mt-1 font-semibold">{n.title}</p>
                  <div
                    className="mt-2 text-sm text-rc-muted"
                    dangerouslySetInnerHTML={{ __html: n.body }}
                  />
                </li>
              ))}
            </ul>
          </SectionFrame>
        )}

        <SectionFrame index={nextIndex()} title={t('leaguePage.fees')} tone="accent">
          <div className="relative overflow-hidden border border-rc-accent/30 bg-gradient-to-br from-rc-accent/10 via-rc-surface to-transparent p-6 md:p-8">
            <Corners className="!border-rc-accent/70" />
            <p className="font-mono text-[11px] tracking-[0.3em] text-rc-accent uppercase">Entry fee</p>
            <p className="mt-2 font-mono text-3xl text-rc-accent md:text-4xl">
              {formatAmountToman(Number(league.registration_fee))}{' '}
              <span className="text-base text-rc-muted">{t('payment.currency')}</span>
            </p>
            {league.discount_info ? (
              <p className="mt-4 max-w-2xl text-sm text-rc-muted">{league.discount_info}</p>
            ) : null}
            {league.refund_policy ? (
              <p className="mt-2 max-w-2xl text-sm text-rc-muted">{league.refund_policy}</p>
            ) : null}
            <div className="mt-6">
              <Link to={regPath}>
                <Button type="button" className="!rounded-none px-6">
                  {ctaLabel}
                </Button>
              </Link>
            </div>
          </div>
        </SectionFrame>

        {schedule.length > 0 && (
          <SectionFrame index={nextIndex()} title={t('leaguePage.daySchedule')}>
            <ul className="overflow-hidden border border-rc-line">
              {schedule.map((s, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[5.5rem_1fr] gap-4 border-t border-rc-line-soft first:border-t-0 odd:bg-rc-surface/50"
                >
                  <span className="flex items-center justify-center border-e border-rc-line bg-rc-navy/50 px-2 py-3 font-mono text-sm text-rc-blue">
                    {s.time}
                  </span>
                  <div className="py-3 pe-4">
                    <p className="font-medium">{s.title}</p>
                    {s.description ? (
                      <p className="text-sm text-rc-muted">{s.description}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </SectionFrame>
        )}

        {league.venue_map_embed_url && (
          <SectionFrame index={nextIndex()} title={t('leaguePage.map')}>
            <div className="relative border border-rc-line">
              <Corners />
              <iframe
                title="map"
                src={league.venue_map_embed_url}
                className="h-80 w-full"
                loading="lazy"
              />
            </div>
            {league.venue_address ? (
              <p className="mt-3 font-mono text-xs text-rc-muted">{league.venue_address}</p>
            ) : null}
          </SectionFrame>
        )}

        {(league.secretary_name || league.contact_email || league.secretary_phone) && (
          <SectionFrame index={nextIndex()} title={t('leaguePage.contact')}>
            <div className="relative grid gap-4 border border-rc-line bg-rc-surface p-6 sm:grid-cols-2 md:grid-cols-4">
              <Corners />
              {league.secretary_name ? (
                <div>
                  <p className="font-mono text-[10px] tracking-widest text-rc-muted uppercase">Name</p>
                  <p className="mt-1 font-medium">{league.secretary_name}</p>
                </div>
              ) : null}
              {league.secretary_phone ? (
                <div>
                  <p className="font-mono text-[10px] tracking-widest text-rc-muted uppercase">Phone</p>
                  <p className="mt-1 font-mono" dir="ltr">
                    {league.secretary_phone}
                  </p>
                </div>
              ) : null}
              {league.contact_email ? (
                <div>
                  <p className="font-mono text-[10px] tracking-widest text-rc-muted uppercase">Email</p>
                  <a
                    className="mt-1 block text-rc-blue hover:underline"
                    href={`mailto:${league.contact_email}`}
                  >
                    {league.contact_email}
                  </a>
                </div>
              ) : null}
              {league.secretary_telegram ? (
                <div>
                  <p className="font-mono text-[10px] tracking-widest text-rc-muted uppercase">Comms</p>
                  <a
                    className="mt-1 inline-block text-rc-blue hover:underline"
                    href={league.secretary_telegram}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Telegram / WhatsApp
                  </a>
                </div>
              ) : null}
            </div>
          </SectionFrame>
        )}

        {bundle.related.length > 0 && (
          <SectionFrame index={nextIndex()} title={t('leaguePage.related')}>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {bundle.related.map((l) => {
                const relatedCover = leagueCoverUrl(l)
                return (
                  <li key={l.id}>
                    <Link
                      to={`/leagues/${l.slug}`}
                      className="group relative block overflow-hidden border border-rc-line bg-rc-surface transition hover:border-rc-blue/50"
                    >
                      <div className="aspect-[16/9] bg-rc-navy">
                        {relatedCover ? (
                          <img
                            src={relatedCover}
                            alt=""
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          />
                        ) : null}
                      </div>
                      <div className="p-4">
                        <p className="font-mono text-[10px] tracking-widest text-rc-blue uppercase">
                          {l.slug}
                        </p>
                        <p className="mt-1 font-semibold">{l.name}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-rc-muted">
                          {l.short_description || l.description}
                        </p>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </SectionFrame>
        )}
      </div>
    </div>
  )
}
