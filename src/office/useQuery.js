import { useCallback, useEffect, useRef, useState } from 'react'
export function useQuery(query) {
  const [state,setState]=useState({data:undefined,error:'',loading:true}),revision=useRef(0)
  const invalidate=useCallback(()=>{revision.current++},[])
  const reload=useCallback(async()=>{
    const current=++revision.current
    setState(old=>({...old,loading:true,error:''}))
    try{const data=await query();if(current===revision.current)setState({data,error:'',loading:false});return data}catch(cause){if(current===revision.current)setState(old=>({...old,error:cause.message,loading:false}));return {failed:true,error:cause.message}}
  },[query])
  useEffect(()=>{const timer=window.setTimeout(reload,0);return()=>{window.clearTimeout(timer);invalidate()}},[reload,invalidate])
  return {...state,reload}
}
