import { useRef, useState } from 'react'
import { Icon, Modal } from '../admin/components'
import { dateLabel, today } from './model'
import { addDays, calendarDays, monthLabel, monthNames, shiftMonth } from './calendarModel.js'

export function MonthNavigation({month,onChange}) {
 const [choosing,setChoosing] = useState(false)
 return <><div className="office-month-nav"><button type="button" className="admin-icon-button" aria-label="Mês anterior" onClick={()=>onChange(shiftMonth(month,-1))}><Icon name="left" /></button><button type="button" className="office-month-title" aria-label={`Escolher mês: ${monthLabel(month)}`} onClick={()=>setChoosing(true)}><Icon name="calendar" size={18} />{monthLabel(month)}<Icon name="down" size={14} /></button><button type="button" className="admin-icon-button" aria-label="Próximo mês" onClick={()=>onChange(shiftMonth(month,1))}><Icon name="right" /></button></div>{choosing&&<MonthChooser month={month} onChange={value=>{onChange(value);setChoosing(false)}} onClose={()=>setChoosing(false)} />}</>
}

function MonthChooser({month,onChange,onClose}) {
 const [year,setYear]=useState(Number(month.slice(0,4)))
 return <Modal title="Escolher mês" onClose={onClose}><div className="office-calendar-picker"><div className="office-calendar-year"><button type="button" className="admin-icon-button" aria-label="Ano anterior" disabled={year<=1900} onClick={()=>setYear(year-1)}><Icon name="left" /></button><strong>{year}</strong><button type="button" className="admin-icon-button" aria-label="Próximo ano" disabled={year>=2100} onClick={()=>setYear(year+1)}><Icon name="right" /></button></div><div className="office-months">{monthNames.map((name,index)=>{const value=`${year}-${String(index+1).padStart(2,'0')}`;return <button type="button" key={name} className={value===month?'is-selected':''} aria-pressed={value===month} onClick={()=>onChange(value)}>{name}</button>})}</div><button type="button" className="admin-text-button" onClick={()=>onChange(today().slice(0,7))}>Ir para este mês</button></div></Modal>
}

export function DayGrid({month,selected,onSelect,min,max,events=[],compact=false}) {
 const grid=useRef(null),days=calendarDays(month),current=today()
 const move=(event,day)=>{
  const offsets={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-new Date(`${day}T12:00:00Z`).getUTCDay(),End:6-new Date(`${day}T12:00:00Z`).getUTCDay()}
  if (!(event.key in offsets)) return
  event.preventDefault(); const target=addDays(day,offsets[event.key]); if ((min&&target<min)||(max&&target>max))return
  const button=grid.current?.querySelector(`[data-day="${target}"]`);button?.focus()
 }
 return <div className={`office-calendar-grid${compact?' is-compact':''}`} ref={grid}><div className="office-weekdays" aria-hidden="true">{['D','S','T','Q','Q','S','S'].map((name,i)=><span key={i}>{name}</span>)}</div><div className="office-days" role="group" aria-label={monthLabel(month)}>{days.map(day=>{
  const matches=events.filter(e=>e.start_date<=day&&e.end_date>=day),outside=!day.startsWith(month),disabled=(min&&day<min)||(max&&day>max)
  return <button type="button" key={day} data-day={day} disabled={disabled} onKeyDown={e=>move(e,day)} tabIndex={day===(selected&&days.includes(selected)?selected:`${month}-01`)?0:-1} className={`${outside?'is-outside ':''}${day===selected?'is-selected ':''}${day===current?'is-today':''}`} aria-label={`${dateLabel(day)}${matches.length?`, ${matches.length} compromisso${matches.length>1?'s':''}`:''}`} aria-pressed={day===selected} aria-current={day===current?'date':undefined} onClick={()=>onSelect(day)}><span className="office-day-number">{Number(day.slice(-2))}</span>{!compact&&<span className="office-day-events">{matches.slice(0,2).map(e=><span key={e.id} className={`office-day-event is-${e.category}${e.status==='cancelled'?' is-cancelled':''}`}><i />{e.title}</span>)}{matches.length>2&&<small>+{matches.length-2}</small>}</span>}{!compact&&matches.length>0&&<span className="office-day-dot" aria-hidden="true">{matches.length}</span>}</button>
 })}</div></div>
}

export function DateField({label,value,onChange,min,max,disabled=false}) {
 const [open,setOpen]=useState(false),[month,setMonth]=useState((value||today()).slice(0,7))
 return <div className="admin-field"><span>{label}</span><button type="button" disabled={disabled} className="office-date-input" aria-label={`${label}: ${dateLabel(value)}`} aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setMonth((value||today()).slice(0,7));setOpen(true)}}><Icon name="calendar" size={18} /><span>{value?dateLabel(value):'Escolher data'}</span><Icon name="down" size={14} /></button>{open&&<Modal title={label} subtitle="Selecione um dia no calendário." onClose={()=>setOpen(false)}><div className="office-calendar-picker"><MonthNavigation month={month} onChange={setMonth} /><DayGrid compact month={month} selected={value} min={min} max={max} onSelect={day=>{onChange(day);setOpen(false)}} /><button type="button" className="admin-text-button" disabled={(min&&today()<min)||(max&&today()>max)} onClick={()=>{onChange(today());setOpen(false)}}>Selecionar hoje</button></div></Modal>}</div>
}
