import type { AttendanceSettings } from '@/features/attendance/api'

export type TeamFlowStepKey =
  | 'team'
  | 'members'
  | 'documents'
  | 'review'
  | 'technical'
  | 'rules'
  | 'payment'
  | 'confirmed'

export type TeamFlowStep = {
  key: TeamFlowStepKey
  labelFa: string
  labelEn: string
}

/**
 * The UI projection of the league attendance settings. Database lifecycle
 * functions use the same settings row, so a disabled step is not rendered or
 * validated independently in individual components.
 */
export function teamFlowSteps(settings: AttendanceSettings | null | undefined): TeamFlowStep[] {
  const attendanceEnabled = settings?.enabled !== false
  const technicalEnabled = attendanceEnabled && (settings?.article_required !== false || settings?.video_required !== false)

  return [
    { key: 'team', labelFa: 'اطلاعات تیم', labelEn: 'Team details' },
    { key: 'members', labelFa: 'اعضای تیم', labelEn: 'Team members' },
    ...(settings?.team_documents_enabled === false
      ? []
      : [{ key: 'documents' as const, labelFa: 'مدارک تیم', labelEn: 'Team documents' }]),
    { key: 'review', labelFa: 'بازبینی اطلاعات', labelEn: 'Review details' },
    ...(technicalEnabled
      ? [{ key: 'technical' as const, labelFa: 'بررسی فنی', labelEn: 'Technical review' }]
      : []),
    ...(attendanceEnabled
      ? [{ key: 'rules' as const, labelFa: 'قوانین حضور', labelEn: 'Attendance rules' }]
      : []),
    { key: 'payment', labelFa: 'صورتحساب و پرداخت', labelEn: 'Invoice and payment' },
    { key: 'confirmed', labelFa: 'مجوز حضور', labelEn: 'Attendance permit' },
  ]
}

export function isTeamFlowStepEnabled(
  settings: AttendanceSettings | null | undefined,
  key: TeamFlowStepKey,
): boolean {
  return teamFlowSteps(settings).some((step) => step.key === key)
}
