import { parsePhoneNumberFromString } from 'libphonenumber-js/min'

export function whatsappPhone(value) {
  const input = String(value || '').trim()
  if (!input || !/^\+?[\d\s().-]+$/.test(input)) return null
  const digits = input.replace(/\D/g, '')
  if (!digits || digits.startsWith('0')) return null
  const national = !input.startsWith('+') && [10, 11].includes(digits.length)
  const phone = parsePhoneNumberFromString(national ? digits : `+${digits}`, national ? 'BR' : undefined)
  return phone?.isValid() ? { number: phone.number, digits: phone.number.slice(1), formatted: phone.formatInternational() } : null
}

export function whatsappLink(value, message = '') {
  const phone = whatsappPhone(value)
  if (!phone || message.length > 4000) return null
  return `https://wa.me/${phone.digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`
}

export const messageVariables = ['nome_cliente', 'nome_empresa', 'nome_projeto', 'data_evento']
export function fillMessage(body, client) {
  const date = client.event_date ? new Date(`${client.event_date}T12:00:00-03:00`) : null
  const values = {
    nome_cliente: client.name || '',
    nome_empresa: client.company || '',
    nome_projeto: client.project_name || '',
    data_evento: date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
  }
  const missing = []
  const text = String(body || '').replace(/\{([a-z_]+)\}/g, (token, key) => {
    if (!Object.hasOwn(values, key) || !values[key]) {
      if (!missing.includes(key)) missing.push(key)
      return token
    }
    return values[key]
  })
  return { text, missing }
}
