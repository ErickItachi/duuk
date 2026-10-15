// Only the real commercial address gets the DUUK identity. External senders
// keep initials without remote image requests or trusting their display names.
export default function MailAvatar({ people, company = false }) {
  const sender = people?.[0]
  const duuk = company || String(sender?.address || '').trim().toLowerCase() === 'contato@duukfilms.com'
  return <span className={`mail-avatar${duuk ? ' mail-avatar--duuk' : ''}`} aria-hidden="true">{duuk
    ? <img src="/media/duuk-logo-white.png" alt="" width="718" height="886" />
    : (sender?.name || sender?.address || 'E').slice(0, 1).toUpperCase()}</span>
}
