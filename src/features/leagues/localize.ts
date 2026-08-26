import type { League, LeagueFaq, LeagueFile, LeaguePerson, LeagueSponsor } from '@/types/database'

export type ContentLocale = 'fa' | 'en'

export function contentLocale(language: string): ContentLocale {
  return language === 'en' ? 'en' : 'fa'
}

function prefer<T>(base: T, translated: T | null | undefined, locale: ContentLocale): T {
  return locale === 'en' && translated != null && translated !== '' ? translated : base
}

export function localizeLeague(league: League, locale: ContentLocale): League {
  if (locale === 'fa') return league
  return {
    ...league,
    name: prefer(league.name, league.name_en, locale),
    description: prefer(league.description, league.description_en, locale),
    category: prefer(league.category, league.category_en, locale),
    short_description: prefer(league.short_description, league.short_description_en, locale),
    full_description: prefer(league.full_description, league.full_description_en, locale),
    rules_summary: prefer(league.rules_summary, league.rules_summary_en, locale),
    age_range: prefer(league.age_range, league.age_range_en, locale),
    venue_name: prefer(league.venue_name, league.venue_name_en, locale),
    venue_address: prefer(league.venue_address, league.venue_address_en, locale),
    difficulty_level: prefer(league.difficulty_level, league.difficulty_level_en, locale),
    competition_language: prefer(league.competition_language, league.competition_language_en, locale),
    scoring_rows: prefer(league.scoring_rows, league.scoring_rows_en, locale),
    timeline_steps: prefer(league.timeline_steps, league.timeline_steps_en, locale),
    day_schedule: prefer(league.day_schedule, league.day_schedule_en, locale),
    allowed_equipment: prefer(league.allowed_equipment, league.allowed_equipment_en, locale),
    forbidden_equipment: prefer(league.forbidden_equipment, league.forbidden_equipment_en, locale),
    discount_info: prefer(league.discount_info, league.discount_info_en, locale),
    refund_policy: prefer(league.refund_policy, league.refund_policy_en, locale),
    secretary_name: prefer(league.secretary_name, league.secretary_name_en, locale),
    judging_path: prefer(league.judging_path, league.judging_path_en, locale),
    technical_committee_notes: prefer(league.technical_committee_notes, league.technical_committee_notes_en, locale),
  }
}

export function localizePerson(person: LeaguePerson, locale: ContentLocale): LeaguePerson {
  if (locale === 'fa') return person
  return {
    ...person,
    full_name: prefer(person.full_name, person.full_name_en, locale),
    specialty: prefer(person.specialty, person.specialty_en, locale),
    bio: prefer(person.bio, person.bio_en, locale),
  }
}

export function localizeFaq(faq: LeagueFaq, locale: ContentLocale): LeagueFaq {
  if (locale === 'fa') return faq
  return {
    ...faq,
    question: prefer(faq.question, faq.question_en, locale),
    answer: prefer(faq.answer, faq.answer_en, locale),
  }
}

export function localizeFile(file: LeagueFile, locale: ContentLocale): LeagueFile {
  return locale === 'en' ? { ...file, title: prefer(file.title, file.title_en, locale) } : file
}

export function localizeSponsor(sponsor: LeagueSponsor, locale: ContentLocale): LeagueSponsor {
  return locale === 'en' ? { ...sponsor, name: prefer(sponsor.name, sponsor.name_en, locale) } : sponsor
}

