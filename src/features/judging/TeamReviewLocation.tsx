import { useEffect, useState } from 'react'
import { backend } from '@/lib/backend'
import type { Team } from '@/types/database'

type Location = { team_id: string; correspondence_address: string | null }

export function TeamReviewLocation({ team, language }: { team: Pick<Team,'id'|'province'|'city'>; language: string }) {
  const [location,setLocation]=useState<Location | null>(null)
  const [failed,setFailed]=useState(false)
  const en=language.startsWith('en')
  useEffect(()=>{
    let active=true
    setLocation(null);setFailed(false)
    void backend.rpc('get_team_review_location',{p_team_id:team.id}).then(({data,error})=>{
      if(!active) return
      if(error){setFailed(true);return}
      setLocation(data as Location)
    }).catch(()=>{if(active)setFailed(true)})
    return()=>{active=false}
  },[team.id])
  const missing=en?'Not provided':'ثبت نشده'
  return <section className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4 sm:p-5">
    <h3 className="mb-4 flex items-center gap-2 text-sm font-black text-sky-950"><svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>{en?'Team location':'موقعیت و نشانی تیم'}</h3>
    <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
      <div><dt className="text-xs text-slate-600">{en?'Province':'استان تیم'}</dt><dd className="mt-1 break-words text-sm font-bold text-slate-900">{team.province || missing}</dd></div>
      <div><dt className="text-xs text-slate-600">{en?'City':'شهر تیم'}</dt><dd className="mt-1 break-words text-sm font-bold text-slate-900">{team.city || missing}</dd></div>
      <div className="min-w-0 border-t border-sky-100 pt-3 sm:col-span-2"><dt className="text-xs text-slate-600">{en?'Registrant correspondence address':'نشانی مکاتبات ثبت‌کننده'}</dt><dd className="mt-1 whitespace-pre-wrap text-sm leading-7 text-slate-900 [overflow-wrap:anywhere]">{failed ? en?'Address unavailable':'نشانی مکاتبات در دسترس نیست' : location?.team_id===team.id ? location.correspondence_address || missing : en?'Loading…':'در حال بارگذاری…'}</dd></div>
    </dl>
  </section>
}
