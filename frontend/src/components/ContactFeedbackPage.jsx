import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { api } from '../utils/api.js';

const ADMIN_REQUIRED = 'Admin access is required to view submissions.';

export default function ContactFeedbackPage({ user, notify }) {
  const [contact, setContact] = useState({ name: user.fullName || '', email: user.email || '', subject: '', message: '' });
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [contactBusy, setContactBusy] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [contactSuccess, setContactSuccess] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState('');
  const [adminAccess, setAdminAccess] = useState(false);
  const [adminLoading, setAdminLoading] = useState(true);
  const [adminError, setAdminError] = useState('');
  const [submissions, setSubmissions] = useState([]);

  useEffect(() => {
    let active = true;
    api('/api/contact-feedback/admin')
      .then((result) => {
        if (!active) return;
        setAdminAccess(true);
        setSubmissions(result.submissions || []);
      })
      .catch((error) => {
        if (!active) return;
        if (error.message !== ADMIN_REQUIRED) setAdminError(error.message || 'Could not load admin submissions.');
      })
      .finally(() => { if (active) setAdminLoading(false); });
    return () => { active = false; };
  }, []);

  const updateContact = (field, value) => setContact((current) => ({ ...current, [field]: value }));

  const submitContact = async (event) => {
    event.preventDefault();
    setContactBusy(true);
    setContactSuccess('');
    try {
      const result = await api('/api/contact-feedback', {
        method: 'POST',
        body: JSON.stringify({ type: 'contact', ...contact }),
      });
      setContact({ name: user.fullName || '', email: user.email || '', subject: '', message: '' });
      setContactSuccess(result.message);
      notify(result.message);
    } catch (error) {
      notify(error.message, true);
    } finally {
      setContactBusy(false);
    }
  };

  const submitFeedback = async (event) => {
    event.preventDefault();
    setFeedbackBusy(true);
    setFeedbackSuccess('');
    try {
      const result = await api('/api/contact-feedback', {
        method: 'POST',
        body: JSON.stringify({ type: 'feedback', rating, feedback }),
      });
      setRating(0);
      setFeedback('');
      setFeedbackSuccess(result.message);
      notify(result.message);
    } catch (error) {
      notify(error.message, true);
    } finally {
      setFeedbackBusy(false);
    }
  };

  return <section className="content-page contact-feedback-page">
    <div className="page-heading">
      <div><p className="eyebrow">WE’RE LISTENING</p><h2>Contact &amp; Feedback</h2><p>Send us a message or tell us how TripEasy is working for you.</p></div>
    </div>

    <div className="contact-feedback-grid">
      <form className="panel contact-feedback-card" onSubmit={submitContact}>
        <div className="contact-feedback-card-heading"><span className="contact-feedback-icon contact-icon"><span aria-hidden="true">✉</span></span><div><h3>Contact Us</h3><p>Questions or problems? Send our team a note.</p></div></div>
        <label className="field-label">Name<input required maxLength="80" autoComplete="name" value={contact.name} onChange={(event) => updateContact('name', event.target.value)} /></label>
        <label className="field-label">Email<input required type="email" maxLength="254" autoComplete="email" value={contact.email} onChange={(event) => updateContact('email', event.target.value)} /></label>
        <label className="field-label">Subject<input required maxLength="120" value={contact.subject} onChange={(event) => updateContact('subject', event.target.value)} /></label>
        <label className="field-label">Message<textarea required maxLength="3000" rows="5" value={contact.message} onChange={(event) => updateContact('message', event.target.value)} /></label>
        <button type="submit" className="button button-primary" disabled={contactBusy}>{contactBusy ? 'Sending…' : 'Send Message'}</button>
        {contactSuccess && <p className="contact-feedback-success" role="status">{contactSuccess}</p>}
      </form>

      <form className="panel contact-feedback-card" onSubmit={submitFeedback}>
        <div className="contact-feedback-card-heading"><span className="contact-feedback-icon feedback-icon"><Star size={19}/></span><div><h3>Share Feedback</h3><p>Your suggestions help us make TripEasy better.</p></div></div>
        <fieldset className="rating-fieldset">
          <legend className="field-label">Rate your TripEasy experience</legend>
          <div className="rating-stars" role="group" aria-label="Choose a rating from 1 to 5 stars">
            {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" className={`rating-star ${value <= rating ? 'is-selected' : ''}`} aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`} aria-pressed={rating === value} onClick={() => setRating(value)}><Star size={30} fill={value <= rating ? 'currentColor' : 'none'}/></button>)}
            <span className="rating-value">{rating ? `${rating}/5` : 'Choose a rating'}</span>
          </div>
        </fieldset>
        <label className="field-label">Your feedback<textarea required maxLength="3000" rows="7" placeholder="Share a suggestion, experience, or problem…" value={feedback} onChange={(event) => setFeedback(event.target.value)} /></label>
        <button type="submit" className="button button-primary" disabled={feedbackBusy || rating < 1}>{feedbackBusy ? 'Submitting…' : 'Submit Feedback'}</button>
        {feedbackSuccess && <p className="contact-feedback-success" role="status">{feedbackSuccess}</p>}
      </form>
    </div>

    {!adminLoading && adminAccess && <section className="panel contact-admin-inbox">
      <div className="contact-admin-heading"><div><p className="eyebrow">PRIVATE ADMIN VIEW</p><h3>Contact Messages &amp; Feedback</h3></div><span>{submissions.length}</span></div>
      {adminError && <p className="contact-feedback-error" role="alert">{adminError}</p>}
      {submissions.length ? <div className="contact-submission-list">{submissions.map((submission) => <article className="contact-submission" key={submission._id}>
        <div className="contact-submission-heading"><span className={`contact-submission-type ${submission.type}`}>{submission.type === 'contact' ? 'Contact message' : 'Feedback'}</span><time dateTime={submission.createdAt}>{new Date(submission.createdAt).toLocaleString()}</time></div>
        <p className="contact-submission-person">{submission.name || 'TripEasy user'}{submission.email && <> · <a href={`mailto:${submission.email}`}>{submission.email}</a></>}</p>
        {submission.type === 'contact' ? <><h4>{submission.subject}</h4><p className="contact-submission-body">{submission.message}</p></> : <><p className="contact-submission-rating" aria-label={`${submission.rating} out of 5 stars`}>{'★'.repeat(submission.rating || 0)}<span>{'★'.repeat(5 - (submission.rating || 0))}</span> {submission.rating}/5</p><p className="contact-submission-body">{submission.feedback}</p></>}
      </article>)}</div> : <p className="contact-admin-empty">No submissions yet.</p>}
    </section>}
    {!adminLoading && adminError && !adminAccess && <p className="contact-feedback-error admin-load-error" role="status">{adminError}</p>}
  </section>;
}
