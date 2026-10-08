const logos = { gemini: '/admin-assets/integrations/gemini.svg', drive: '/admin-assets/integrations/google-drive.png', calendar: '/admin-assets/integrations/google-calendar.png' }
export default function AppLogo({ app, size = 36 }) {
 return <img src={logos[app]} width={size} height={size} alt="" className="integration-app-logo" />
}
