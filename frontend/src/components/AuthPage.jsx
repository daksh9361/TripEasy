import { useState } from 'react';
import { Eye, EyeOff, Plane } from 'lucide-react';
import { api } from '../utils/api.js';

const blankSignup = { fullName: '', email: '', password: '', confirmPassword: '' };

export default function AuthPage({ mode, onModeChange, onAuthenticated, initialMessage }) {
  const [signup, setSignup] = useState(blankSignup);
  const [login, setLogin] = useState({ email: '', password: '' });
  const [forgot, setForgot] = useState({ email: '', otp: '', password: '', confirmPassword: '' });
  const [otpSent, setOtpSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [resetGrant, setResetGrant] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialMessage ? { type: initialMessage.type || 'error', text: initialMessage.text || initialMessage } : null);

  const clearMessage = () => setMessage(null);
  const showError = (error) => setMessage({ type: 'error', text: error.message || 'Could not reach the TripEasy server.' });
  const setSignupField = (event) => {
    const { name, value } = event.target;
    setSignup((current) => ({ ...current, [name]: value }));
    if (name === 'email' || name === 'fullName' || name === 'password' || name === 'confirmPassword') {
      setEmailVerified(false);
      setOtpSent(false);
    }
  };

  const sendSignupOtp = async (event) => {
    event.preventDefault(); clearMessage();
    if (signup.password !== signup.confirmPassword) return setMessage({ type: 'error', text: 'Passwords do not match.' });
    if (new TextEncoder().encode(signup.password).length > 72) return setMessage({ type: 'error', text: 'Password must be 72 bytes or fewer.' });
    setBusy(true);
    try {
      const result = await api('/api/auth/signup/send-otp', { method: 'POST', body: JSON.stringify(signup) });
      setOtpSent(true); setEmailVerified(false); setMessage({ type: 'success', text: result.message });
    } catch (error) { showError(error); } finally { setBusy(false); }
  };

  const verifySignupOtp = async () => {
    clearMessage(); setBusy(true);
    try {
      const result = await api('/api/auth/signup/verify-otp', { method: 'POST', body: JSON.stringify({ email: signup.email, otp: signup.otp }) });
      setEmailVerified(true); setMessage({ type: 'success', text: result.message });
    } catch (error) { showError(error); } finally { setBusy(false); }
  };

  const createAccount = async (event) => {
    event.preventDefault(); clearMessage();
    if (!emailVerified) return setMessage({ type: 'error', text: 'Verify your email before creating your account.' });
    setBusy(true);
    try {
      const result = await api('/api/auth/signup/complete', { method: 'POST', body: JSON.stringify({ email: signup.email }) });
      setMessage({ type: 'success', text: result.message });
      onAuthenticated(result.user);
    } catch (error) { showError(error); } finally { setBusy(false); }
  };

  const submitLogin = async (event) => {
    event.preventDefault(); clearMessage(); setBusy(true);
    try {
      const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(login) });
      onAuthenticated(result.user);
    } catch (error) { showError(error); } finally { setBusy(false); }
  };

  const sendResetOtp = async (event) => {
    event.preventDefault(); clearMessage(); setBusy(true);
    try {
      const result = await api('/api/auth/password/forgot/send-otp', { method: 'POST', body: JSON.stringify({ email: forgot.email }) });
      setOtpSent(true); setResetGrant(''); setMessage({ type: 'success', text: result.message });
    } catch (error) { showError(error); } finally { setBusy(false); }
  };

  const verifyResetOtp = async () => {
    clearMessage(); setBusy(true);
    try {
      const result = await api('/api/auth/password/forgot/verify-otp', { method: 'POST', body: JSON.stringify({ email: forgot.email, otp: forgot.otp }) });
      setResetGrant(result.resetGrant); setMessage({ type: 'success', text: result.message });
    } catch (error) { showError(error); } finally { setBusy(false); }
  };

  const resetPassword = async (event) => {
    event.preventDefault(); clearMessage();
    if (forgot.password !== forgot.confirmPassword) return setMessage({ type: 'error', text: 'Passwords do not match.' });
    setBusy(true);
    try {
      const result = await api('/api/auth/password/forgot/reset', { method: 'POST', body: JSON.stringify({ email: forgot.email, resetGrant, password: forgot.password, confirmPassword: forgot.confirmPassword }) });
      setLogin({ email: forgot.email, password: '' }); onModeChange('login');
      setMessage({ type: 'success', text: result.message }); setOtpSent(false); setResetGrant('');
    } catch (error) { showError(error); } finally { setBusy(false); }
  };

  const switchMode = (nextMode) => {
    clearMessage(); setShowPassword(false); setOtpSent(false); setEmailVerified(false); setResetGrant(''); onModeChange(nextMode);
  };

  const title = mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Log in to TripEasy';
  const intro = mode === 'signup' ? 'Sign up to keep your trip expenses together.' : mode === 'forgot' ? 'Verify your email to reset your password.' : 'Log in to continue to your trip dashboard.';

  return (
    <main className="auth-shell">
      <header className="auth-brand"><span className="brand-mark" aria-hidden="true"><Plane size={19} strokeWidth={2.4}/></span><h1>TripEasy</h1></header>
      <section className="auth-card panel">
        <p className="eyebrow">{mode === 'signup' ? 'PLAN BETTER TRIPS' : mode === 'forgot' ? 'ACCOUNT RECOVERY' : 'WELCOME BACK'}</p>
        <h2>{title}</h2><p className="auth-intro">{intro}</p>
        {message && <div className={`auth-message ${message.type}`} role="status">{message.text}</div>}

        {mode === 'signup' && <form className="auth-form" onSubmit={emailVerified ? createAccount : sendSignupOtp}>
          <label className="field-label">Full Name<input name="fullName" autoComplete="name" required maxLength="80" value={signup.fullName} onChange={setSignupField} placeholder="Your full name" disabled={emailVerified}/></label>
          <label className="field-label">Email Address<input name="email" autoComplete="email" type="email" required maxLength="254" value={signup.email} onChange={setSignupField} placeholder="you@example.com" disabled={emailVerified}/></label>
          <label className="field-label">Password<span className="password-field"><input name="password" autoComplete="new-password" type={showPassword ? 'text' : 'password'} required minLength="8" maxLength="72" value={signup.password} onChange={setSignupField} placeholder="At least 8 characters" disabled={emailVerified}/><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></span></label>
          <label className="field-label">Confirm Password<input name="confirmPassword" autoComplete="new-password" type={showPassword ? 'text' : 'password'} required minLength="8" maxLength="72" value={signup.confirmPassword} onChange={setSignupField} placeholder="Enter your password again" disabled={emailVerified}/></label>
          {otpSent && <label className="field-label">Email OTP<input name="otp" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" required value={signup.otp || ''} onChange={(event) => setSignup((current) => ({ ...current, otp: event.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder="6-digit code" disabled={emailVerified}/></label>}
          {emailVerified ? <button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create Account'}</button> : <button className="button button-primary auth-submit" type={otpSent ? 'button' : 'submit'} onClick={otpSent ? verifySignupOtp : undefined} disabled={busy}>{busy ? 'Please wait…' : otpSent ? 'Verify OTP' : 'Send OTP'}</button>}
          <p className="auth-switch">Already have an account? <button type="button" onClick={() => switchMode('login')}>Log in</button></p>
        </form>}

        {mode === 'login' && <form className="auth-form" onSubmit={submitLogin}>
          <label className="field-label">Email Address<input name="email" autoComplete="username" type="email" required value={login.email} onChange={(event) => setLogin((current) => ({ ...current, email: event.target.value }))} placeholder="you@example.com"/></label>
          <label className="field-label">Password<span className="password-field"><input name="password" autoComplete="current-password" type={showPassword ? 'text' : 'password'} required value={login.password} onChange={(event) => setLogin((current) => ({ ...current, password: event.target.value }))} placeholder="Your password"/><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></span></label>
          <div className="auth-inline"><button type="button" onClick={() => switchMode('forgot')}>Forgot Password?</button></div>
          <button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Login'}</button>
          <p className="auth-switch">New to TripEasy? <button type="button" onClick={() => switchMode('signup')}>Create an account</button></p>
        </form>}

        {mode === 'forgot' && <form className="auth-form" onSubmit={resetGrant ? resetPassword : sendResetOtp}>
          <label className="field-label">Email Address<input type="email" autoComplete="email" required value={forgot.email} onChange={(event) => { setForgot((current) => ({ ...current, email: event.target.value })); setOtpSent(false); setResetGrant(''); }} placeholder="you@example.com" disabled={Boolean(resetGrant)}/></label>
          {otpSent && !resetGrant && <label className="field-label">Email OTP<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" required value={forgot.otp} onChange={(event) => setForgot((current) => ({ ...current, otp: event.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder="6-digit code"/></label>}
          {resetGrant && <><label className="field-label">New Password<input type="password" autoComplete="new-password" required minLength="8" maxLength="72" value={forgot.password} onChange={(event) => setForgot((current) => ({ ...current, password: event.target.value }))} placeholder="At least 8 characters"/></label><label className="field-label">Confirm New Password<input type="password" autoComplete="new-password" required minLength="8" maxLength="72" value={forgot.confirmPassword} onChange={(event) => setForgot((current) => ({ ...current, confirmPassword: event.target.value }))} placeholder="Enter it again"/></label></>}
          <button className="button button-primary auth-submit" type={otpSent && !resetGrant ? 'button' : 'submit'} onClick={otpSent && !resetGrant ? verifyResetOtp : undefined} disabled={busy}>{busy ? 'Please wait…' : resetGrant ? 'Reset Password' : otpSent ? 'Verify OTP' : 'Send OTP'}</button>
          <p className="auth-switch"><button type="button" onClick={() => switchMode('login')}>Back to Login</button></p>
        </form>}
      </section>
      <p className="auth-footnote">TripEasy protects your account with verified email and secure password storage.</p>
    </main>
  );
}
