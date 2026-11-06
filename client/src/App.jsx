import AuthGate from './AuthGate'
import KPIWeekly from './KPIWeekly'
import './auth.css'

export default function App() {
  return (
    <AuthGate>
      {({ user, signOut }) => <KPIWeekly user={user} signOut={signOut} />}
    </AuthGate>
  )
}
