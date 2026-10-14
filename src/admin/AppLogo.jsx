const logos = { gemini: '/admin-assets/integrations/gemini.svg', drive: '/admin-assets/integrations/google-drive.png', calendar: '/admin-assets/integrations/google-calendar.png', pluggy: '/admin-assets/integrations/meu-pluggy.svg' }
export default function AppLogo({ app, size = 36 }) {
 return <img src={logos[app]} width={size} height={size} alt="" className="integration-app-logo" />
}
