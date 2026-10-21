export const AVATAR_SOURCE_LIMIT = 20 * 1024 * 1024
export function avatarCropRect(width, height, zoom = 1, position = { x: 0, y: 0 }) {
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) throw Error('Imagem inválida.')
  const scale = Math.min(4, Math.max(1, Number(zoom) || 1))
  const side = Math.min(width, height) / scale
  const bounded = value => Number.isFinite(value) ? Math.min(1, Math.max(-1, value)) : 0
  return { left: (width - side) * (1 - bounded(position.x)) / 2, top: (height - side) * (1 - bounded(position.y)) / 2, side }
}
