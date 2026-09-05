import type { Team } from '@/types/database'

export const REGISTRATION_STAGES = ['team_info', 'members', 'documents', 'review', 'technical', 'technical_review', 'rules', 'invoice', 'payment', 'completed'] as const
export const REGISTRATION_PROGRESS = [8, 22, 34, 44, 55, 64, 74, 82, 88, 100] as const

export function registrationLifecycleForStep(step: number): {
  stage: NonNullable<Team['registration_stage']>
  progress: number
  lifecycleStatus: NonNullable<Team['lifecycle_status']>
} {
  const safeStep = Math.max(0, Math.min(REGISTRATION_STAGES.length - 1, Math.trunc(step)))
  const stage = REGISTRATION_STAGES[safeStep]
  const progress = REGISTRATION_PROGRESS[safeStep]
  const lifecycleStatus = safeStep >= 9 ? 'completed' : safeStep >= 7 ? 'awaiting_payment' : safeStep >= 6 ? 'awaiting_rules' : safeStep >= 5 ? 'awaiting_technical_review' : safeStep >= 3 ? 'awaiting_review' : safeStep >= 2 ? 'awaiting_documents' : 'incomplete'
  return { stage, progress, lifecycleStatus }
}
