import { Select } from '@/components/ui/FormControls'
import { formatCompetitionCycle, formatSeasonYear } from '@/lib/dates'

const gregorianYears = Array.from({ length: 31 }, (_, index) => 2021 + index)

export function CompetitionCycleFields({
  year,
  month,
  onChange,
}: {
  year: number
  month: number
  onChange: (value: { year: number; month: number }) => void
}) {
  const safeYear = gregorianYears.includes(year) ? year : new Date().getFullYear()
  const safeMonth = month >= 1 && month <= 12 ? month : 1

  return <>
    <Select label="سال شمسی دوره" value={String(safeYear)} onChange={(event) => onChange({ year: Number(event.target.value), month: safeMonth })}>
      {gregorianYears.map((value) => <option key={value} value={value}>{formatSeasonYear(value, 'fa')}</option>)}
    </Select>
    <Select label="ماه دوره" value={String(safeMonth)} onChange={(event) => onChange({ year: safeYear, month: Number(event.target.value) })}>
      {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => {
        const label = formatCompetitionCycle(safeYear, value, 'fa').replace(/[۰-۹0-9]/g, '').trim()
        return <option key={value} value={value}>{label}</option>
      })}
    </Select>
    <p className="-mt-2 rounded-xl bg-sky-50 px-4 py-3 text-xs leading-6 text-sky-800 md:col-span-2">
      دوره به‌صورت انتخابی ثبت می‌شود تا خطای تایپی نداشته باشد؛ تبدیل تقویم برای ذخیره‌سازی و گزارش‌ها خودکار است.
    </p>
  </>
}
