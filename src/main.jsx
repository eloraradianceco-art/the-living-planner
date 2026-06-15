import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App_Planner'
import ResetPassword from './ResetPassword'
import './styles.css'

const isReset = window.location.pathname === '/reset-password'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      {isReset ? <ResetPassword /> : <App />}
    </BrowserRouter>
  </React.StrictMode>
)
