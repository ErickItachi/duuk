import { useCallback } from 'react'
import { useQuery } from '../office/useQuery'
import { today } from '../office/model'
import { lastMonths, mergeStatements } from './bankModel.mjs'
import { pluggyRequest } from './pluggy-api'

// Cards and investments from the same Meu Pluggy connection appear only when the provider returns them.
const extras = true

async function readOverview(version) {
 try { return await pluggyRequest({ action: 'overview', connection_version: version, extras }) }
 catch (cause) {
  // Older server: rebuild the same window from monthly statements.
  if (cause.message !== 'Operação não permitida.') throw cause
  const now = today(), months = lastMonths(now)
  return mergeStatements(await Promise.all(months.map(month => pluggyRequest({ action: 'statement', month, connection_version: version }))), months, now)
 }
}

export function useBankData() {
 const status = useQuery(useCallback(() => pluggyRequest({ action: 'status' }), []))
 const configured = status.data?.configured === true, version = status.data?.version
 const overview = useQuery(useCallback(() => configured ? readOverview(version) : Promise.resolve(null), [configured, version]))
 const reload = async () => { const next = await status.reload(); if (next?.configured === configured && next?.version === version) await overview.reload() }
 return { status, overview, configured, data: configured ? overview.data : null, reload }
}
