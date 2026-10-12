import { useState } from 'react';
import { Eye, EyeOff, Plane } from 'lucide-react';
import { api } from '../utils/api.js';

const blankSignup = { fullName: '', email: '', password: '', confirmPassword: '' };

export default function AuthPage({ mode, onModeChange, onAuthenticated, initialMessage }) {
  const [signup, setSignup] = useState(blankSignup);
  const [login, setLogin] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialMessage ? { type: initialMessage.type || 'error', text: initialMessage.text || initialMessage } : null);

  const clearMessage = () => setMessage(null);
  const showError = (error) => setMessage({ type: 'error', text: error.message || 'Could not reach the TripEasy server.' });

  const createAccount = async (event) => {
    event.preventDefault();
    clearMessage();
    if (signup.password !== signup.confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    if (new TextEncoder().encode(signup.password).length > 72) {
      setMessage({ type: 'error', text: 'Password must be 72 bytes or fewer.' });
      return;
    }

    setBusy(true);
    try {
      const result = await api('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify(signup),
      });
      setSignup(blankSignup);
      setLogin({ email: signup.email.trim(), password: '' });
      onModeChange('login');
      setMessage({ type: 'success', text: result.message });
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const submitLogin = async (event) => {
    event.preventDefault();
    clearMessage();
    setBusy(true);
    try {
      const result = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(login),
      });
      onAuthenticated(result.user);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (nextMode) => {
    clearMessage();
    setShowPassword(false);
    onModeChange(nextMode);
  };

  const title = mode === 'signup' ? 'Create your account' : 'Log in to TripEasy';
  const intro = mode === 'signup'
    ? 'Sign up to keep your trip expenses together.'
    : 'Log in to continue to your trip dashboard.';

  return (
    <main className="auth-shell">
      <header className="auth-brand"><span className="brand-mark" aria-hidden="true"><Plane size={19} strokeWidth={2.4}/></span><h1>TripEasy</h1></header>
      <section className="auth-card panel">
        <p className="eyebrow">{mode === 'signup' ? 'PLAN BETTER TRIPS' : 'WELCOME BACK'}</p>
        <h2>{title}</h2>
        <p className="auth-intro">{intro}</p>
        {message && <div className={`auth-message ${message.type}`} role="status">{message.text}</div>}

        {mode === 'signup' && <form className="auth-form" onSubmit={createAccount}>
          <label className="field-label">Full Name<input name="fullName" autoComplete="name" required maxLength="80" value={signup.fullName} onChange={(event) => setSignup((current) => ({ ...current, fullName: event.target.value }))} placeholder="Your full name"/></label>
          <label className="field-label">Email Address<input name="email" autoComplete="email" type="email" required maxLength="254" value={signup.email} onChange={(event) => setSignup((current) => ({ ...current, email: event.target.value }))} placeholder="you@example.com"/></label>
          <label className="field-label">Password<span className="password-field"><input name="password" autoComplete="new-password" type={showPassword ? 'text' : 'password'} required minLength="8" maxLength="72" value={signup.password} onChange={(event) => setSignup((current) => ({ ...current, password: event.target.value }))} placeholder="At least 8 characters"/><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></span></label>
          <label className="field-label">Confirm Password<input name="confirmPassword" autoComplete="new-password" type={showPassword ? 'text' : 'password'} required minLength="8" maxLength="72" value={signup.confirmPassword} onChange={(event) => setSignup((current) => ({ ...current, confirmPassword: event.target.value }))} placeholder="Enter your password again"/></label>
          <button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create Account'}</button>
          <p className="auth-switch">Already have an account? <button type="button" onClick={() => switchMode('login')}>Log in</button></p>
        </form>}

        {mode === 'login' && <form className="auth-form" onSubmit={submitLogin}>
          <label className="field-label">Email Address<input name="email" autoComplete="username" type="email" required value={login.email} onChange={(event) => setLogin((current) => ({ ...current, email: event.target.value }))} placeholder="you@example.com"/></label>
          <label className="field-label">Password<span className="password-field"><input name="password" autoComplete="current-password" type={showPassword ? 'text' : 'password'} required value={login.password} onChange={(event) => setLogin((current) => ({ ...current, password: event.target.value }))} placeholder="Your password"/><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></span></label>
          <button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Login'}</button>
          <p className="auth-switch">New to TripEasy? <button type="button" onClick={() => switchMode('signup')}>Create an account</button></p>
        </form>}
      </section>
      <p className="auth-footnote">TripEasy protects your account with secure password storage and session authentication.</p>
    </main>
  );
}
