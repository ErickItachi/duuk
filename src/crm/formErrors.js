// Field-level messages for forms that use noValidate. The browser's own constraint checks
// (required, e-mail, URL, dates, length) keep running; they are only shown under each field.
const typeMessages = {
  email: 'Informe um e-mail válido, como nome@empresa.com.',
  url: 'Informe o endereço completo, começando com https://.',
}

function nativeMessage(element) {
  const { validity } = element
  if (validity.valid) return ''
  if (validity.valueMissing) return element.tagName === 'SELECT' ? 'Escolha uma opção.' : 'Preencha este campo.'
  if (validity.typeMismatch) return typeMessages[element.type] || 'Confira o formato deste campo.'
  if (validity.badInput) return String(element.type).startsWith('date') ? 'Confira a data e o horário informados.' : 'Confira o valor informado.'
  if (validity.rangeUnderflow) return 'Escolha uma data igual ou posterior à data mínima.'
  if (validity.rangeOverflow) return 'Escolha uma data igual ou anterior à data máxima.'
  if (validity.tooLong) return 'O texto passou do limite de caracteres.'
  return 'Confira este campo.'
}

// Custom messages (checks the server also makes) take priority over the browser's message.
export function formErrors(form, custom = {}) {
  const errors = {}
  for (const element of form.elements) {
    if (!element.name || errors[element.name] || !element.willValidate) continue
    const message = custom[element.name] || nativeMessage(element)
    if (message) errors[element.name] = message
  }
  for (const [name, message] of Object.entries(custom)) if (message && !errors[name]) errors[name] = message
  return errors
}

export const hasErrors = errors => Object.values(errors).some(Boolean)

// Moves focus to the first field with an error, in the order the fields appear.
export function focusFirstError(form, errors) {
  const element = [...form.elements].find(item => item.name && errors[item.name] && !item.disabled)
  element?.focus()
  return !!element
}
