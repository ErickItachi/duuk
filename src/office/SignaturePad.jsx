import { useEffect, useRef } from 'react'
export default function SignaturePad({onChange,disabled=false}) {
  const ref=useRef(null),drawing=useRef(false),points=useRef(0)
  useEffect(()=>{const canvas=ref.current;canvas.width=900;canvas.height=300;const ctx=canvas.getContext('2d');ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#20211e'},[])
  const location=(event)=>{const rect=ref.current.getBoundingClientRect();return [(event.clientX-rect.left)*900/rect.width,(event.clientY-rect.top)*300/rect.height]}
  const start=(event)=>{if(disabled)return;event.preventDefault();const ctx=ref.current.getContext('2d');ctx.beginPath();ctx.moveTo(...location(event));drawing.current=true;event.currentTarget.setPointerCapture(event.pointerId)}
  const move=(event)=>{if(!drawing.current)return;const ctx=ref.current.getContext('2d');ctx.lineTo(...location(event));ctx.stroke();points.current++}
  const end=()=>{if(!drawing.current)return;drawing.current=false;if(points.current>2)onChange(ref.current.toDataURL('image/png'))}
  const clear=()=>{ref.current.getContext('2d').clearRect(0,0,900,300);points.current=0;onChange('')}
  return <div className="office-signature"><div><strong>Desenhe sua assinatura</strong><button type="button" disabled={disabled} className="admin-text-button" onClick={clear}>Limpar</button></div><canvas ref={ref} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} aria-label="Área para desenhar assinatura" /><small>Use o mouse ou desenhe com o dedo.</small></div>
}
