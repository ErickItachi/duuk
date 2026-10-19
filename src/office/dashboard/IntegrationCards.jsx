import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../admin/components'
import { EmptyState, ErrorState, LoadingPanel } from '../../admin/forms'
import { FinancePrivacy, PrivacyToggle } from '../../finance/privacy'
import { useSpotify } from '../../spotify/SpotifyContext'
import { spotifyArtwork, spotifySubtitle } from '../../spotify/model.mjs'
import { AccountSummary } from '../../billing/BillingResources'
import { DashboardCard } from './cards'

export function AsaasCard({state}){
 return <FinancePrivacy><DashboardCard id="asaas" title="Asaas" brand="asaas" to="/admin/cobrancas" area="Cobranças" tools={<PrivacyToggle/>} state={state}>
  {state.error&&<ErrorState onRetry={state.retry}>{state.message||'Não foi possível consultar o Asaas.'}</ErrorState>}
  {!state.ready&&!state.error?<LoadingPanel label="Consultando saldo Asaas…"/>:state.ready&&<><AccountSummary data={state.data} compact/><Link className="dashboard-integration-action" to="/admin/cobrancas?aba=simulate">Simular taxas de uma venda<Icon name="right" size={14}/></Link></>}
 </DashboardCard></FinancePrivacy>
}
export function SpotifyCard(){
 const music=useSpotify(),[error,setError]=useState(''),item=music?.player?.item,playing=music?.player?.is_playing,disallows=music?.player?.actions?.disallows||{},restricted=music?.player?.device?.is_restricted
 const act=async action=>{setError('');try{await music.act({action})}catch(cause){setError(cause.message)}}
 return <DashboardCard id="spotify" title="Seu Spotify" brand="spotify" to="/admin/spotify" area="Spotify">
  {music?.status?.error&&<ErrorState onRetry={music.status.reload}>{music.status.error}</ErrorState>}
  {!music?.connected?<EmptyState icon="music" title="Sua música no trabalho">Cada membro conecta a própria conta. <Link to="/admin/spotify">Conectar meu Spotify</Link></EmptyState>:<><p className="dashboard-integration-account">{music.status.data?.connection?.display_name||'Sua conta Spotify'} · acesso pessoal</p>
   <div className="dashboard-spotify-track">{item&&spotifyArtwork(item)&&<img src={spotifyArtwork(item)} width="64" height="64" alt=""/>}<div><strong>{item?.name||'Escolha uma música'}</strong><span>{item?spotifySubtitle(item):'Abra sua biblioteca para começar a ouvir.'}</span>{music.player?.device?.name&&<small>{playing?'Tocando em':'Dispositivo'}: {music.player.device.name}</small>}</div></div>
   <div className="dashboard-spotify-controls"><button type="button" className="admin-icon-button" aria-label="Música anterior no dashboard" disabled={music.busy||!item||restricted||disallows.skipping_prev} onClick={()=>act('previous')}><Icon name="skipBack"/></button><button type="button" className="admin-icon-button" aria-label={playing?'Pausar música no dashboard':'Continuar música no dashboard'} disabled={music.busy||!item||restricted||disallows[playing?'pausing':'resuming']} onClick={()=>act(playing?'pause':'play')}><Icon name={playing?'pause':'play'}/></button><button type="button" className="admin-icon-button" aria-label="Próxima música no dashboard" disabled={music.busy||!item||restricted||disallows.skipping_next} onClick={()=>act('next')}><Icon name="skipForward"/></button><button type="button" className="admin-text-button" onClick={music.showDock}>Abrir player</button></div>
   {(error||music.playerError)&&<p className="admin-error" role="alert">{error||music.playerError}</p>}<Link className="dashboard-integration-action" to="/admin/spotify">Biblioteca e meus dispositivos<Icon name="right" size={14}/></Link>
  </>}
 </DashboardCard>
}
