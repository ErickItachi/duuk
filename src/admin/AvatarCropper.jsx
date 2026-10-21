import { useEffect, useId, useRef, useState } from 'react'
import { Modal, Icon } from './components'
import { ErrorState } from './forms'
import { useUnsavedChanges } from './unsavedChanges'
import { avatarCropRect } from './avatarCrop.mjs'
import './avatar-crop.css'

const clamp = value => Math.min(1, Math.max(-1, value))
export default function AvatarCropper({ file, onClose, onApply }) {
  const [image, setImage] = useState(null), [error, setError] = useState(''), [zoom, setZoom] = useState(1), [position, setPosition] = useState({ x: 0, y: 0 }), [busy, setBusy] = useState(false)
  const gesture = useRef(null), applying = useRef(false), alive = useRef(true), zoomId = useId()
  useUnsavedChanges(true)
  useEffect(() => {
    let disposed = false
    const url = URL.createObjectURL(file), photo = new Image()
    alive.current = true
    photo.onload = () => {
      if (disposed) return
      if (!photo.naturalWidth || !photo.naturalHeight || photo.naturalWidth * photo.naturalHeight > 80000000) { setError('Use uma foto de até 80 megapixels.'); return }
      setImage(photo)
    }
    photo.onerror = () => { if (!disposed) setError('Não foi possível abrir a imagem. Escolha outro JPG, PNG ou WebP.') }
    photo.src = url
    return () => { disposed = true; alive.current = false; URL.revokeObjectURL(url) }
  }, [file])
  const drag = event => {
    const start = gesture.current
    if (!start || !image || event.pointerId !== start.pointerId) return
    const rangeX = (Math.max(1, image.naturalWidth / image.naturalHeight) * zoom - 1) * start.edge / 2
    const rangeY = (Math.max(1, image.naturalHeight / image.naturalWidth) * zoom - 1) * start.edge / 2
    setPosition({ x: rangeX ? clamp(start.x + (event.clientX - start.pointerX) / rangeX) : 0, y: rangeY ? clamp(start.y + (event.clientY - start.pointerY) / rangeY) : 0 })
  }
  const apply = async () => {
    if (!image || applying.current) return
    applying.current = true; setBusy(true); setError('')
    try {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512
      const context = canvas.getContext('2d'), crop = avatarCropRect(image.naturalWidth, image.naturalHeight, zoom, position)
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, 512, 512)
      context.drawImage(image, crop.left, crop.top, crop.side, crop.side, 0, 0, 512, 512)
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9))
      if (!blob || blob.size > 2097152) throw Error('Não foi possível otimizar a foto. Escolha outra imagem.')
      if (alive.current) onApply(new File([blob], 'foto-perfil.jpg', { type: 'image/jpeg' }))
    } catch (cause) { if (alive.current) setError(cause.message) }
    finally { applying.current = false; if (alive.current) setBusy(false) }
  }
  const endDrag = event => { if (gesture.current?.pointerId === event.pointerId) gesture.current = null }
  return <Modal title="Enquadrar foto de perfil" subtitle="Arraste a foto e ajuste o zoom. A área circular mostra como ela aparecerá para a equipe." onClose={() => !busy && onClose()}>
    <div className="admin-modal__body avatar-crop">
      {!image && !error && <p role="status">Abrindo foto…</p>}
      {image && <><div className="avatar-crop__frame" role="group" aria-label="Posição da foto: arraste ou use as setas do teclado" tabIndex={0}
        onPointerDown={event => { if (busy || !event.isPrimary || event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); gesture.current = { pointerId: event.pointerId, pointerX: event.clientX, pointerY: event.clientY, x: position.x, y: position.y, edge: event.currentTarget.getBoundingClientRect().width } }}
        onPointerMove={drag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
        onKeyDown={event => { const moves = { ArrowLeft: [-.08, 0], ArrowRight: [.08, 0], ArrowUp: [0, -.08], ArrowDown: [0, .08] }; if (busy || !moves[event.key]) return; event.preventDefault(); const [x, y] = moves[event.key]; setPosition(old => ({ x: clamp(old.x + x), y: clamp(old.y + y) })) }}>
        <img src={image.src} alt="" aria-hidden="true" draggable={false} style={{ width: `${Math.max(1, image.naturalWidth / image.naturalHeight) * zoom * 100}%`, height: `${Math.max(1, image.naturalHeight / image.naturalWidth) * zoom * 100}%`, left: `${50 + position.x * (Math.max(1, image.naturalWidth / image.naturalHeight) * zoom - 1) * 50}%`, top: `${50 + position.y * (Math.max(1, image.naturalHeight / image.naturalWidth) * zoom - 1) * 50}%` }}/>
      </div><label className="avatar-crop__zoom" htmlFor={zoomId}><span>Zoom da foto <output aria-hidden="true">{zoom.toFixed(2)}×</output></span><input id={zoomId} type="range" min="1" max="4" step="0.05" value={zoom} aria-valuetext={`${zoom.toFixed(2)} vezes`} disabled={busy} onChange={event => setZoom(Number(event.target.value))}/></label><button type="button" className="admin-text-button" disabled={busy} onClick={() => { setPosition({ x: 0, y: 0 }); setZoom(1) }}><Icon name="restore" size={14}/>Centralizar foto</button></>}
      {error && <ErrorState>{error}</ErrorState>}
      <p className="avatar-crop__hint">A foto é otimizada no seu aparelho. Ela só será enviada ao salvar o perfil.</p>
    </div><div className="admin-modal__foot"><button type="button" className="admin-button admin-button--secondary" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" className="admin-button" disabled={!image || busy} onClick={apply}>{busy ? 'Preparando foto…' : 'Usar enquadramento'}</button></div>
  </Modal>
}
