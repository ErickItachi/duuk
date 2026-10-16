import { useCallback, useEffect, useRef, useState } from 'react'
import { spotifyRequest } from './api'
import { useLocation } from 'react-router-dom'
import { useQuery } from '../office/useQuery'
import { SpotifyContext } from './SpotifyContext'
import { spotifyEmbed } from './model.mjs'
import './spotify.css'

export default function SpotifyProvider({children}) {
 const {pathname}=useLocation()
 const status=useQuery(useCallback(()=>spotifyRequest({action:'status'}),[])),[player,setPlayer]=useState(null),[playerError,setPlayerError]=useState(''),[embedded,setEmbedded]=useState(null),[busy,setBusy]=useState(false)
 const revision=useRef(0),inFlight=useRef(false),alive=useRef(true),blocked=useRef(false)
 const connected=status.data?.connection?.status==='connected'
 const refreshPlayer=useCallback(async()=>{
  if(inFlight.current||blocked.current)return
  inFlight.current=true;const current=revision.current
  try{const result=await spotifyRequest({action:'player'});if(alive.current&&current===revision.current){setPlayer(result.data);setPlayerError('')}}
  catch(cause){if(alive.current&&current===revision.current){setPlayerError(cause.message);blocked.current=true}}
  finally{inFlight.current=false}
 },[])
 const invalidate=useCallback(()=>{revision.current++},[])
 const stop=useCallback(()=>{alive.current=false;invalidate()},[invalidate])
 useEffect(()=>{alive.current=true;return stop},[stop])
 useEffect(()=>{
  if(!connected||pathname!=='/admin/spotify')return
  blocked.current=false
  const initial=setTimeout(refreshPlayer,0),timer=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine)refreshPlayer()},30000)
  const focus=()=>{if(document.visibilityState==='visible'&&navigator.onLine&&!blocked.current)refreshPlayer()}
  window.addEventListener('focus',focus)
  return()=>{clearTimeout(initial);clearInterval(timer);window.removeEventListener('focus',focus);invalidate()}
 },[connected,pathname,refreshPlayer,invalidate])
 const retryPlayer=useCallback(async()=>{blocked.current=false;await refreshPlayer()},[refreshPlayer])
 const act=async(body)=>{
  if(busy)throw new Error('Aguarde a operação atual.')
  setBusy(true)
  try{const result=await spotifyRequest(body);if(!['status','start','configure'].includes(body.action))await retryPlayer();return result}
  finally{if(alive.current)setBusy(false)}
 }
 const disconnect=async()=>{
  await spotifyRequest({action:'disconnect'});revision.current++;setEmbedded(null);setPlayer(null);setPlayerError('');await status.reload()
 }
 const openEmbed=item=>{if(!spotifyEmbed(item))throw new Error('Este conteúdo pode ser aberto no aplicativo Spotify.');setEmbedded(item)}
 return <SpotifyContext.Provider value={{status,connected,player,playerError,refreshPlayer:retryPlayer,act,busy,embedded,openEmbed,closeEmbed:()=>setEmbedded(null),disconnect}}>{children}</SpotifyContext.Provider>
}
