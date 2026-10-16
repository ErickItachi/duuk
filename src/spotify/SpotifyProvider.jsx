import { useCallback, useEffect, useRef, useState } from 'react'
import { spotifyRequest } from './api'
import { useLocation } from 'react-router-dom'
import { useQuery } from '../office/useQuery'
import { SpotifyContext } from './SpotifyContext'
import { createSpotifyBrowserPlayer, loadSpotifySDK } from './sdk.mjs'
import './spotify.css'

export default function SpotifyProvider({children}) {
 const {pathname}=useLocation()
 const status=useQuery(useCallback(()=>spotifyRequest({action:'status'}),[]))
 const [player,setPlayer]=useState(null),[playerError,setPlayerError]=useState(''),[busy,setBusy]=useState(false),[dock,setDock]=useState(false)
 const [browser,setBrowser]=useState({loading:false,id:'',error:'',needsActivation:false}),[targetId,setTargetId]=useState('')
 const revision=useRef(0),inFlight=useRef(null),alive=useRef(true),blocked=useRef(false),busyRef=useRef(false),sdk=useRef(null),starting=useRef(null),sdkRevision=useRef(0),browserId=useRef(''),chosenDevice=useRef('')
 const selectDevice=id=>{chosenDevice.current=id;setTargetId(id)}
 const connected=status.data?.connection?.status==='connected'
 const streamingAuthorized=['streaming','user-read-email','user-read-private'].every(scope=>status.data?.connection?.scopes?.split(' ').includes(scope))
 const refreshPlayer=useCallback(()=>{
  if(inFlight.current)return inFlight.current
  if(blocked.current)return Promise.resolve()
  const current=revision.current
  const request=(async()=>{
   try{const result=await spotifyRequest({action:'player'});if(alive.current&&current===revision.current){setPlayer(result.data);setPlayerError('')}}
   catch(cause){if(alive.current&&current===revision.current){setPlayerError(cause.message);blocked.current=true}}
   finally{if(inFlight.current===request)inFlight.current=null}
  })()
  inFlight.current=request;return request
 },[])
 const invalidate=useCallback(()=>{revision.current++},[])
 const stopBrowser=useCallback(()=>{sdkRevision.current++;sdk.current?.dispose();sdk.current=null;starting.current=null;browserId.current=''},[])
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;invalidate();stopBrowser()}},[stopBrowser,invalidate])
 useEffect(()=>{
  if(!connected||pathname!=='/admin/spotify'&&!dock)return
  blocked.current=false
  const initial=setTimeout(refreshPlayer,0),timer=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine)refreshPlayer()},30000)
  const focus=()=>{if(document.visibilityState==='visible'&&navigator.onLine&&!blocked.current)refreshPlayer()}
  window.addEventListener('focus',focus)
  return()=>{clearTimeout(initial);clearInterval(timer);window.removeEventListener('focus',focus)}
 },[connected,pathname,dock,refreshPlayer])
 useEffect(()=>{
  if(!player?.is_playing)return
  const timer=setInterval(()=>{if(document.visibilityState==='visible')setPlayer(old=>old?.is_playing?{...old,progress_ms:Math.min(old.item?.duration_ms||Infinity,(old.progress_ms||0)+1000)}:old)},1000)
  return()=>clearInterval(timer)
 },[player?.is_playing])
 const retryPlayer=useCallback(async()=>{await inFlight.current;blocked.current=false;await refreshPlayer()},[refreshPlayer])
 const ensureBrowser=async()=>{
  if(browserId.current&&sdk.current)return {id:browserId.current,instance:sdk.current.instance}
  if(starting.current)return starting.current
  stopBrowser();const generation=sdkRevision.current
  setBrowser({loading:true,id:'',error:'',needsActivation:false})
  const valid=()=>alive.current&&generation===sdkRevision.current
  starting.current=(async()=>{
   try{
    let initial=await spotifyRequest({action:'sdk_token'})
    const Spotify=await loadSpotifySDK()
    if(!valid())throw new Error('Player encerrado.')
    const handle=createSpotifyBrowserPlayer(Spotify,{
     getToken:async()=>{if(!valid())throw new Error('Player encerrado.');const result=initial&&initial.expires_at>Date.now()+60000?initial:await spotifyRequest({action:'sdk_token'});initial=null;if(!valid())throw new Error('Player encerrado.');return result.access_token},
     onReady:id=>{if(valid()){browserId.current=id;setBrowser({loading:false,id,error:'',needsActivation:false})}},
     onOffline:()=>{if(valid()){browserId.current='';setBrowser({loading:false,id:'',error:'Este aparelho ficou offline. Ative o player novamente ou escolha outro dispositivo.',needsActivation:false})}},
     onError:error=>{if(valid()){browserId.current='';setBrowser(old=>({...old,id:'',loading:false,error}))}},
     onAutoplay:()=>{if(valid())setBrowser(old=>({...old,needsActivation:true,error:''}))},
     onState:state=>{if(!valid()||!state?.track_window?.current_track||!browserId.current)return;setPlayer(old=>old?.device?.id===browserId.current||chosenDevice.current===browserId.current?{...old,device:old?.device?.id===browserId.current?old.device:{id:browserId.current,name:'DUUK · Este aparelho',type:'Computer',supports_volume:true,volume_percent:35},item:{...state.track_window.current_track,type:'track'},is_playing:!state.paused,progress_ms:state.position,timestamp:Date.now(),actions:{disallows:state.disallows||{}}}:old)}
    })
    sdk.current=handle
    const id=await handle.ready
    if(!valid())throw new Error('Player encerrado.')
    return {id,instance:handle.instance}
   }catch(cause){if(valid()){sdk.current?.dispose();sdk.current=null;browserId.current='';setBrowser({loading:false,id:'',error:cause.message,needsActivation:false})}throw cause}
   finally{if(valid())starting.current=null}
  })()
  return starting.current
 }
 const activate=()=>sdk.current?.instance.activateElement().catch(()=>{if(alive.current)setBrowser(old=>({...old,needsActivation:true}))})
 const perform=async work=>{
  if(busyRef.current)throw new Error('Aguarde a operação atual.')
  busyRef.current=true;setBusy(true)
  try{return await work()}finally{busyRef.current=false;if(alive.current)setBusy(false)}
 }
 const act=body=>{
  const device_id=body.device_id||targetId||player?.device?.id
  if(device_id===browserId.current)activate()
  return perform(async()=>{const result=await spotifyRequest({...body,...(device_id?{device_id}:{})});if(body.action==='transfer'){selectDevice(body.device_id);setDock(true)}await retryPlayer();return result})
 }
 const playItem=(item,here=false)=>{
  // This must run inside the click handler, before network awaits on iOS.
  activate()
  return perform(async()=>{
   let device_id=targetId||player?.device?.id
   if(here||!device_id){const local=await ensureBrowser();device_id=local.id;selectDevice(device_id)}
   const body=['track','episode'].includes(item.type)?{uris:[item.uri]}:{context_uri:item.uri}
   await spotifyRequest({action:'play',...body,device_id});setDock(true);await retryPlayer()
  })
 }
 const useBrowser=()=>{activate();return perform(async()=>{const local=await ensureBrowser();await spotifyRequest({action:'transfer',device_id:local.id,play:false});selectDevice(local.id);setDock(true);await retryPlayer()})}
 const activateAudio=()=>{activate();return perform(async()=>{const local=await ensureBrowser();await local.instance.resume();setBrowser(old=>({...old,needsActivation:false,error:''}));await retryPlayer()})}
 const disconnect=async()=>{
  await spotifyRequest({action:'disconnect'});revision.current++;stopBrowser();setDock(false);setPlayer(null);setPlayerError('');selectDevice('');setBrowser({loading:false,id:'',error:'',needsActivation:false});await status.reload()
 }
 return <SpotifyContext.Provider value={{status,connected,streamingAuthorized,player,playerError,refreshPlayer:retryPlayer,act,busy,playItem,browser,useBrowser,activateAudio,targetId,dock,hideDock:()=>setDock(false),showDock:()=>setDock(true),disconnect}}>{children}</SpotifyContext.Provider>
}
