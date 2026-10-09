// Google credentials are opaque: current authorization keys use a different
// format from legacy API keys. Syntax only excludes unsafe input; models.list
// remains authoritative for authentication and model availability.
export function isGeminiCredential(value) {
 return typeof value === 'string' && value.length >= 30 && value.length <= 200 && !/[^A-Za-z0-9._-]/.test(value)
}
