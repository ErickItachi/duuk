import { useCallback, useEffect, useState } from 'react'
import { useQuery } from '../useQuery'
import { listContracts, listEvents, listMetrics } from '../api'
import { shiftMonth } from '../calendarModel'
import { today } from '../model'
import { mergeEvents } from './model'
import { directory, listActivities, listClients, listFollowups } from '../../crm/api'
import { listFinanceMonth } from '../../finance/finance-api'
import { pluggyRequest } from '../../finance/pluggy-api'

// Each widget reads its own source, so one failure never blanks the rest of the page.
// Sources the member cannot open resolve to null without touching the network.
const skip = () => Promise.resolve(null)

async function loadEvents() {
  const month = today().slice(0, 7)
  const [current, next] = await Promise.all([listEvents(month), listEvents(shiftMonth(month, 1))])
  return mergeEvents(current, next)
}
const loadFinance = () => listFinanceMonth(today().slice(0, 7))
// The balance is the one reported by the connected account, with the provider's update time.
async function loadBank() {
  const status = await pluggyRequest({ action: 'status' })
  if (!status?.configured) return { configured: false, canConfigure: status?.can_configure === true }
  const statement = await pluggyRequest({ action: 'statement', month: today().slice(0, 7), connection_version: status.version })
  return { configured: true, account: statement.account, updatedAt: statement.provider_updated_at || null, warning: statement.warning || null }
}
const loadMetrics = () => listMetrics(30)

export function useDashboardData(can) {
  const events = useQuery(useCallback(() => can.agenda ? loadEvents() : skip(), [can.agenda]))
  const clients = useQuery(useCallback(() => can.followups || can.pipeline || can.activity ? listClients() : skip(), [can.followups, can.pipeline, can.activity]))
  const followups = useQuery(useCallback(() => can.followups ? listFollowups() : skip(), [can.followups]))
  const activities = useQuery(useCallback(() => can.activity ? listActivities() : skip(), [can.activity]))
  const people = useQuery(useCallback(() => can.agenda || can.followups || can.activity ? directory() : skip(), [can.agenda, can.followups, can.activity]))
  const contracts = useQuery(useCallback(() => can.contracts ? listContracts() : skip(), [can.contracts]))
  const finance = useQuery(useCallback(() => can.finance ? loadFinance() : skip(), [can.finance]))
  const bank = useQuery(useCallback(() => can.finance ? loadBank() : skip(), [can.finance]))
  const metrics = useQuery(useCallback(() => can.insights ? loadMetrics() : skip(), [can.insights]))
  const required = [events, clients, followups, activities, contracts, finance, bank, metrics]
  // Reloads every widget and resolves with how many of them failed. Names of the team only
  // enrich rows, so a failure there never counts against the refresh.
  const refresh = async () => {
    people.reload()
    const results = await Promise.all(required.map(source => source.reload()))
    return results.filter(result => result?.failed).length
  }
  return { events, clients, followups, activities, people, contracts, finance, bank, metrics, refresh }
}

// Combines the sources a widget needs into one loading/error state with a single retry.
// `data` is the first source's data, for widgets that read a single source.
export function combine(...sources) {
  const failing = sources.filter(source => source.error)
  return {
    ready: sources.every(source => source.data != null),
    loading: sources.some(source => source.loading),
    error: failing.length > 0,
    message: failing[0]?.error || '',
    data: sources[0]?.data ?? null,
    retry: () => Promise.all(failing.map(source => source.reload())),
  }
}

// Re-renders once a minute so "Agora", "Encerrado" and the day roll over while the page stays open.
export function useMinute() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}
