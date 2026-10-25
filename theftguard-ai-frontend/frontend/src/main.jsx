import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext.js'
import { LanguageProvider } from './context/LanguageContext.js'
import { AppStateProvider } from './state/AppState'
import { OnboardingProvider } from './context/OnboardingContext'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LanguageProvider>
          <AppStateProvider>
            <OnboardingProvider>
              <App />
            </OnboardingProvider>
          </AppStateProvider>
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
