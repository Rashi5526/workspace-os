import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { StoreProvider } from './store'
import { AuthGate } from './api/AuthGate'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate>
      {(user, signOut) => (
        <StoreProvider user={user} onSignOut={signOut}>
          <App />
        </StoreProvider>
      )}
    </AuthGate>
  </React.StrictMode>,
)
