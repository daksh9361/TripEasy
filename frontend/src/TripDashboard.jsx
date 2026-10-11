import { useEffect, useMemo, useState } from 'react';
import { Check, LayoutDashboard, LogOut, Menu, MessageCircle, Moon, Plane, Plus, ReceiptText, Sun, UserRound, X } from 'lucide-react';
import TripForm from './components/TripForm.jsx';
import ExpenseForm from './components/ExpenseForm.jsx';
import ExpenseTable from './components/ExpenseTable.jsx';
import ChatPage from './components/ChatPage.jsx';
import { api } from './utils/api.js';
import { calculateExpenseSummary, formatCurrency, toCents } from './utils/expenseCalculations.js';

function expensesForSummary(trip) {
  const names = new Map((trip?.members || []).map((member) => [member.id, member.name]));
  return (trip?.expenses || []).map((expense) => ({ ...expense, paidBy: names.get(expense.paidByMemberId) || '' }));
}

function TripHistoryItem({ trip, onView }) {
  const totalCents = trip.expenses.reduce((sum, expense) => sum + (toCents(expense.amount) || 0), 0);
  const startDate = trip.createdAt ? new Date(trip.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Date unavailable';
  const completed = trip.status === 'completed';

  return <article className="trip-history-item">
    <div className="trip-history-copy">
      <h3>{trip.name}<span className={`trip-status-badge ${completed ? 'is-completed' : 'is-active'}`}>{completed ? 'Completed' : 'Active'}</span></h3>
      <p><strong>Members:</strong> {trip.members.map((member) => member.name).join(', ')}</p>
      <div className="trip-history-meta"><span><strong>Total expenses:</strong> {formatCurrency(totalCents)}</span><span><strong>Started:</strong> {startDate}</span></div>
    </div>
    <button type="button" className="button button-secondary" onClick={() => onView(trip)}>View Details</button>
  </article>;
}

function TripHistoryGroup({ title, trips, onView }) {
  return <section className="trip-history-group">
    <div className="trip-history-group-heading"><h3>{title}</h3><span>{trips.length}</span></div>
    {trips.length ? <div className="trip-history-list">{trips.map((trip) => <TripHistoryItem key={trip.id} trip={trip} onView={onView}/>)}</div> : <p className="trip-history-empty">No {title.toLowerCase()} yet.</p>}
  </section>;
}

function ProfilePage({ user, onUserChange, notify }) {
  const [fullName, setFullName] = useState(user.fullName);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [busy, setBusy] = useState(false);

  const updateProfile = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      const result = await api('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ fullName }) });
      onUserChange(result.user); notify('Profile updated.');
    } catch (error) { notify(error.message, true); } finally { setBusy(false); }
  };

  const changePassword = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      const result = await api('/api/auth/password/change', { method: 'POST', body: JSON.stringify(passwords) });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' }); notify(result.message);
    } catch (error) { notify(error.message, true); } finally { setBusy(false); }
  };

  return <section className="content-page">
    <div className="page-heading"><div><p className="eyebrow">ACCOUNT</p><h2>Profile</h2><p>Manage your TripEasy account details.</p></div></div>
    <div className="profile-grid">
      <form className="panel profile-card" onSubmit={updateProfile}>
        <h3>Your details</h3><p className="profile-email">{user.email}</p>
        <label className="field-label">Full Name<input required maxLength="80" value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
        <button className="button button-primary" disabled={busy}>Save Profile</button>
      </form>
      <form className="panel profile-card" onSubmit={changePassword}>
        <h3>Change Password</h3>
        <label className="field-label">Current Password<input required type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={(event) => setPasswords((current) => ({ ...current, currentPassword: event.target.value }))}/></label>
        <label className="field-label">New Password<input required type="password" autoComplete="new-password" minLength="8" maxLength="72" value={passwords.newPassword} onChange={(event) => setPasswords((current) => ({ ...current, newPassword: event.target.value }))}/></label>
        <label className="field-label">Confirm New Password<input required type="password" autoComplete="new-password" minLength="8" maxLength="72" value={passwords.confirmPassword} onChange={(event) => setPasswords((current) => ({ ...current, confirmPassword: event.target.value }))}/></label>
        <button className="button button-primary" disabled={busy}>Update Password</button>
      </form>
    </div>
  </section>;
}

export default function TripDashboard({ user, onLogout, onUserChange }) {
  const [theme, setTheme] = useState(() => {
    try { return window.localStorage.getItem('tripeasy-theme') === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
  });
  const [trips, setTrips] = useState([]);
  const [activeTripId, setActiveTripId] = useState('');
  const [page, setPage] = useState('dashboard');
  const [showTripForm, setShowTripForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showEndTripConfirm, setShowEndTripConfirm] = useState(false);
  const [endingTrip, setEndingTrip] = useState(false);
  const [settlementConfirmation, setSettlementConfirmation] = useState(null);
  const [settlingPayment, setSettlingPayment] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [deletingExpense, setDeletingExpense] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    try { window.localStorage.setItem('tripeasy-theme', theme); } catch { /* Keep the selected theme for this session. */ }
  }, [theme]);

  const notify = (text, isError = false) => {
    setNotice({ text, isError });
    window.setTimeout(() => setNotice(null), 3200);
  };

  useEffect(() => {
    let active = true;
    api('/api/trips')
      .then(({ trips: ownedTrips }) => {
        if (!active) return;
        setTrips(ownedTrips);
        setActiveTripId((current) => ownedTrips.some((trip) => trip.id === current) ? current : (ownedTrips[0]?.id || ''));
      })
      .catch((error) => { if (active) notify(error.message, true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const activeTrip = trips.find((trip) => trip.id === activeTripId) || null;
  const groups = trips.filter((trip) => trip.isGroup);
  const personalTrips = trips.filter((trip) => !trip.isGroup);
  const activeTrips = personalTrips.filter((trip) => trip.status !== 'completed');
  const completedTrips = personalTrips.filter((trip) => trip.status === 'completed');
  const memberCount = activeTrip?.isGroup
    ? activeTrip.members.length
    : new Set((activeTrip?.members || []).map((member) => member.name.trim().toLocaleLowerCase()).filter(Boolean)).size;
  const currentExpenses = useMemo(() => expensesForSummary(activeTrip), [activeTrip]);
  const summary = useMemo(() => calculateExpenseSummary(activeTrip?.members || [], currentExpenses), [activeTrip, currentExpenses]);
  const totalAcrossTrips = personalTrips.reduce((sum, trip) => sum + trip.expenses.reduce((tripSum, expense) => tripSum + (toCents(expense.amount) || 0), 0), 0);
  const expenseCount = personalTrips.reduce((sum, trip) => sum + trip.expenses.length, 0);

  const startTrip = async ({ name, members }) => {
    try {
      const result = await api('/api/trips', { method: 'POST', body: JSON.stringify({ name, members }) });
      setTrips((current) => [result.trip, ...current]); setActiveTripId(result.trip.id);
      setShowTripForm(false); setPage('expenses'); notify('Trip created. Add your first expense when you’re ready.');
    } catch (error) { notify(error.message, true); }
  };

  const saveExpense = async (formValue) => {
    if (!activeTrip) return;
    if (activeTrip.status === 'completed' && !editingExpense) { notify('This trip is completed. New expenses cannot be added.', true); return; }
    const isEditing = Boolean(editingExpense);
    const path = `/api/trips/${activeTrip.id}/expenses${isEditing ? `/${editingExpense.id}` : ''}`;
    try {
      const result = await api(path, { method: isEditing ? 'PATCH' : 'POST', body: JSON.stringify(formValue) });
      setTrips((current) => current.map((trip) => trip.id === result.trip.id ? result.trip : trip));
      setShowExpenseForm(false); setEditingExpense(null); notify(isEditing ? 'Expense updated.' : 'Expense added.');
    } catch (error) { notify(error.message, true); }
  };

  const endTrip = async () => {
    if (!activeTrip || activeTrip.status === 'completed' || endingTrip) return;
    setEndingTrip(true);
    try {
      const result = await api(`/api/trips/${activeTrip.id}/end`, { method: 'PATCH' });
      setTrips((current) => current.map((trip) => trip.id === result.trip.id ? result.trip : trip));
      setShowEndTripConfirm(false);
      setShowExpenseForm(false);
      setEditingExpense(null);
      notify('Trip completed successfully.');
    } catch (error) {
      notify(error.message, true);
    } finally {
      setEndingTrip(false);
    }
  };

  const markPaymentSettled = async () => {
    if (!activeTrip || !settlementConfirmation || settlingPayment) return;
    setSettlingPayment(true);
    try {
      const result = await api(`/api/trips/${activeTrip.id}/settlements/${settlementConfirmation.paymentKey}/settle`, { method: 'POST' });
      setTrips((current) => current.map((trip) => trip.id === result.trip.id ? result.trip : trip));
      setSettlementConfirmation(null);
      notify(result.message || 'Payment marked as settled.');
    } catch (error) {
      notify(error.message, true);
    } finally {
      setSettlingPayment(false);
    }
  };

  const deleteExpense = async (expense) => {
    setDeletingExpense(expense);
  };

  const confirmDeleteExpense = async () => {
    const expense = deletingExpense;
    if (!activeTrip || !expense) return;
    try {
      const result = await api(`/api/trips/${activeTrip.id}/expenses/${expense.id}`, { method: 'DELETE' });
      setTrips((current) => current.map((trip) => trip.id === result.trip.id ? result.trip : trip));
      if (editingExpense?.id === expense.id) { setEditingExpense(null); setShowExpenseForm(false); }
      setDeletingExpense(null); notify('Expense deleted.');
    } catch (error) { setDeletingExpense(null); notify(error.message, true); }
  };

  const copySummary = async () => {
    if (!activeTrip) return;
    const expenseLines = currentExpenses.map((expense) => `- ${expense.paidBy}: ${expense.description}${expense.location ? ` (${expense.location})` : ''} — ${formatCurrency(toCents(expense.amount) || 0)}`);
    const contributionLines = summary.contributions.map((member) => `- ${member.name}: ${formatCurrency(member.paidCents)}`);
    const settlementLines = summary.settlements.length ? summary.settlements.map((item) => `- ${item.from} → ${item.to}: ${formatCurrency(item.amountCents)}`) : ['- Everyone is settled up.'];
    const text = [activeTrip.name, `Members: ${activeTrip.members.map((member) => member.name).join(', ')}`, '', 'Expenses:', ...(expenseLines.length ? expenseLines : ['- None']), '', `Total expense: ${formatCurrency(summary.totalCents)}`, `Per-person share: ${formatCurrency(summary.perPersonCents)}`, '', 'Who paid how much:', ...contributionLines, '', 'Settlement:', ...settlementLines].join('\n');
    try { await navigator.clipboard.writeText(text); notify('Trip summary copied to clipboard.'); }
    catch { notify('Could not access the clipboard. Try again in a secure browser context.', true); }
  };

  const downloadPdf = async () => {
    if (!activeTrip) return;
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new jsPDF();
    doc.setFontSize(19); doc.text('TripEasy Expense Summary', 14, 18);
    doc.setFontSize(12); doc.text(activeTrip.name, 14, 27);
    doc.setFontSize(10); doc.text(`Members: ${activeTrip.members.map((member) => member.name).join(', ')}`, 14, 34);
    autoTable(doc, {
      startY: 41,
      head: [['Name', 'Expense', 'Description', 'Location']],
      body: currentExpenses.map((expense) => [expense.paidBy, formatCurrency(toCents(expense.amount) || 0), expense.description, expense.location || '—']),
      styles: { fontSize: 9 }, headStyles: { fillColor: [37, 132, 82] },
    });
    let y = (doc.lastAutoTable?.finalY || 46) + 10;
    doc.setFontSize(11); doc.text(`Total Expense: ${formatCurrency(summary.totalCents)}`, 14, y); y += 7;
    doc.text(`Per Person: ${formatCurrency(summary.perPersonCents)}`, 14, y); y += 10;
    doc.setFontSize(12); doc.text('Who Paid How Much', 14, y); y += 3;
    autoTable(doc, { startY: y, head: [['Member', 'Contribution']], body: summary.contributions.map((member) => [member.name, formatCurrency(member.paidCents)]), styles: { fontSize: 9 }, headStyles: { fillColor: [37, 132, 82] } });
    y = (doc.lastAutoTable?.finalY || y) + 10;
    if (y > 255) { doc.addPage(); y = 18; }
    doc.setFontSize(12); doc.text('Settlement', 14, y); y += 3;
    autoTable(doc, { startY: y, head: [['From', 'To', 'Amount']], body: summary.settlements.length ? summary.settlements.map((item) => [item.from, item.to, formatCurrency(item.amountCents)]) : [['—', 'Everyone is settled up', '₹0.00']], styles: { fontSize: 9 }, headStyles: { fillColor: [37, 132, 82] } });
    doc.save(`${activeTrip.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'trip'}-expenses.pdf`);
    notify('PDF downloaded.');
  };

  const selectPage = (nextPage) => {
    if (nextPage === 'expenses' && activeTrip?.isGroup) setActiveTripId(personalTrips[0]?.id || '');
    setPage(nextPage); setSidebarOpen(false); setShowTripForm(false);
  };
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'expenses', label: 'Expenses', icon: ReceiptText },
    { id: 'chat', label: 'Chat', icon: MessageCircle },
    { id: 'profile', label: 'Profile', icon: UserRound },
  ];
  const uiExpenses = currentExpenses.map((expense) => ({ ...expense, paidBy: activeTrip?.members.find((member) => member.id === expense.paidByMemberId)?.name || 'Unknown' }));
  const totalPaidCents = summary.contributions.reduce((sum, member) => sum + member.paidCents, 0);
  const settlementSuggestions = activeTrip?.settlementSuggestions || [];

  return <div className="app-shell" data-theme={theme}>
    {sidebarOpen && <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><span className="brand-mark" aria-hidden="true"><Plane size={19} strokeWidth={2.4}/></span><span>TripEasy</span><button className="sidebar-close" aria-label="Close menu" onClick={() => setSidebarOpen(false)}><X size={18}/></button></div>
      <nav aria-label="Main navigation">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => selectPage(id)}><Icon size={18}/>{label}</button>)}</nav>
      <div className="sidebar-user"><span className="user-avatar">{user.fullName.slice(0, 1).toUpperCase()}</span><div className="user-copy"><strong>{user.fullName}</strong><small>{user.email}</small></div><button aria-label="Log out" title="Log out" className="logout-icon" onClick={onLogout}><LogOut size={17}/></button></div>
    </aside>

    <main className="main-content">
      <header className="topbar"><button className="menu-toggle" aria-label="Open menu" onClick={() => setSidebarOpen(true)}><Menu size={20}/></button><span className="topbar-title">{navItems.find((item) => item.id === page)?.label || 'TripEasy'}</span><div className="topbar-user">{user.fullName}</div><button type="button" className="theme-toggle" onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'} title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}>{theme === 'light' ? <Moon size={17}/> : <Sun size={17}/>}<span>{theme === 'light' ? 'Dark' : 'Light'}</span></button></header>

      {page === 'dashboard' && <section className="content-page">
        <div className="page-heading dashboard-heading"><div><p className="eyebrow">YOUR TRIPS</p><h2>Welcome, {user.fullName.split(' ')[0]}</h2><p>Everything for your next getaway, in one place.</p></div><button className="button button-primary create-trip-button" onClick={() => setShowTripForm((value) => !value)}><Plus size={16}/>{showTripForm ? 'Close Trip Form' : 'Create New Trip'}</button></div>
        {showTripForm && <section className="panel trip-create-card"><div className="form-title"><div><p className="eyebrow">NEW TRIP</p><h3>Create a Trip</h3></div><button className="icon-button" aria-label="Close create trip form" onClick={() => setShowTripForm(false)}><X size={18}/></button></div><TripForm onStart={startTrip} onCancel={() => setShowTripForm(false)}/></section>}
        <div className="overview-cards"><article className="panel overview-card"><span>Total Trips</span><strong>{loading ? '—' : personalTrips.length}</strong><small>Personal trips you’ve created</small></article><article className="panel overview-card"><span>Total Expenses</span><strong>{formatCurrency(totalAcrossTrips)}</strong><small>{expenseCount} {expenseCount === 1 ? 'expense' : 'expenses'} across your trips</small></article></div>
        <section className="panel recent-trips trip-history"><div className="section-title"><div><p className="eyebrow">YOUR TRIPS</p><h2>Trip History</h2><p>All trips saved to your account.</p></div></div>
          {loading ? <p className="loading-note">Loading your trips…</p> : personalTrips.length ? <div className="trip-history-groups"><TripHistoryGroup title="Active Trips" trips={activeTrips} onView={(trip) => { setActiveTripId(trip.id); selectPage('expenses'); }}/><TripHistoryGroup title="Completed Trips" trips={completedTrips} onView={(trip) => { setActiveTripId(trip.id); selectPage('expenses'); }}/></div> : <div className="empty-state"><span className="empty-icon"><ReceiptText size={23}/></span><h3>No trips yet</h3><p>Create a trip to start tracking shared expenses.</p><button className="button button-primary" onClick={() => setShowTripForm(true)}><Plus size={16}/>Create New Trip</button></div>}
        </section>
      </section>}

      {page === 'chat' && <ChatPage groups={groups} user={user} selectedGroup={activeTrip?.isGroup ? activeTrip : null} loading={loading} onSelectGroup={(group) => setActiveTripId(group.id)} onGroupChange={(group) => setTrips((current) => [group, ...current.filter((trip) => trip.id !== group.id)])} onViewExpenses={(group) => { setActiveTripId(group.id); setShowExpenseForm(false); setEditingExpense(null); setPage('expenses'); }} notify={notify}/>}

      {page === 'expenses' && <section className="content-page">
        <div className="page-heading expenses-page-heading"><div><p className="eyebrow">YOUR TRIP</p><h2>Trip Expenses</h2><p>Keep your group spending organized.</p></div>{activeTrip?.isGroup ? <button type="button" className="button button-secondary" onClick={() => selectPage('chat')}><MessageCircle size={16}/>Back to Chat</button> : personalTrips.length > 0 && <label className="trip-select-label">Select trip<select value={activeTripId} onChange={(event) => { setActiveTripId(event.target.value); setShowExpenseForm(false); setEditingExpense(null); }} aria-label="Select trip">{personalTrips.map((trip) => <option key={trip.id} value={trip.id}>{trip.name}</option>)}</select></label>}</div>
        {!personalTrips.length && !activeTrip?.isGroup && !loading ? <section className="panel empty-state expenses-empty"><span className="empty-icon"><ReceiptText size={23}/></span><h3>No trips yet</h3><p>Create a trip before adding expenses.</p><button className="button button-primary" onClick={() => { setPage('dashboard'); setShowTripForm(true); }}><Plus size={16}/>Create New Trip</button></section> : loading ? <section className="panel loading-note">Loading your trips…</section> : activeTrip && <>
          <div className="trip-summary-head"><div><span className="eyebrow">TRIP NAME</span><div className="trip-name-row"><h3>{activeTrip.name}</h3>{activeTrip.status === 'completed' && <span className="trip-status-badge">Completed</span>}</div>{activeTrip.completedAt && <p className="trip-completed-date">Completed {new Date(activeTrip.completedAt).toLocaleString()}</p>}<p><strong>Members:</strong> {activeTrip.members.map((member) => member.name).join(', ')}</p></div><div className="trip-actions">{activeTrip.status !== 'completed' && <>{(!activeTrip.isGroup || activeTrip.isAdmin) && <button className="button button-secondary" onClick={() => setShowEndTripConfirm(true)}>End Trip</button>}<button className="button button-primary" onClick={() => { setEditingExpense(null); setShowExpenseForm(true); }}><Plus size={17}/>Add Expense</button></>}</div></div>
          <section className="panel expenses-panel"><div className="section-title"><div><p className="eyebrow">KEEP IT ALL TOGETHER</p><h2>Trip Expenses</h2></div></div>
            {showExpenseForm && (activeTrip.status !== 'completed' || editingExpense) && <div className="add-expense-panel"><div className="form-title"><h3>{editingExpense ? 'Edit Expense' : 'Add Expense'}</h3><button className="icon-button" aria-label="Close expense form" onClick={() => { setShowExpenseForm(false); setEditingExpense(null); }}><X size={18}/></button></div><ExpenseForm key={editingExpense?.id || 'new-expense'} members={activeTrip.members} initialExpense={editingExpense} onCancel={() => { setShowExpenseForm(false); setEditingExpense(null); }} onSave={saveExpense}/></div>}
            <ExpenseTable expenses={uiExpenses} onEdit={(expense) => { setEditingExpense(expense); setShowExpenseForm(true); }} onDelete={deleteExpense}/>
          </section>
          <section className="summary-grid settlement-overview" aria-label="Trip summary"><article className="panel summary-card"><span>Total Trip Expense</span><strong>{formatCurrency(summary.totalCents)}</strong></article><article className="panel summary-card"><span>Total Paid by All Members</span><strong>{formatCurrency(totalPaidCents)}</strong><small>Contributions match trip expenses</small></article><article className="panel summary-card"><span>Equal Share per Member</span><strong>{formatCurrency(summary.perPersonCents)}</strong><small>Shared among {memberCount} {memberCount === 1 ? 'member' : 'members'}</small></article><article className="panel summary-card"><span>Members</span><strong>{memberCount}</strong><small>Unique members in this trip</small></article></section>
          <section className="settlement-grid"><article className="panel split-panel"><p className="eyebrow">TRIP CONTRIBUTIONS</p><h2>Who Paid How Much</h2><div className="member-settlement-list">{summary.contributions.map((member, index) => { const balanceCents = summary.balances[index]?.balanceCents || 0; return <div className="member-settlement-row" key={member.id || member.name}><div className="member-settlement-details"><strong>{member.name}</strong><small>Paid {formatCurrency(member.paidCents)} · Share {formatCurrency(summary.perPersonCents)}</small></div><div className={`member-balance ${balanceCents > 0 ? 'receive' : balanceCents < 0 ? 'pay' : 'balanced'}`}><span>{balanceCents > 0 ? 'To receive' : balanceCents < 0 ? 'To pay' : 'Settled'}</span><strong>{formatCurrency(Math.abs(balanceCents))}</strong></div></div>; })}</div></article><article className="panel split-panel"><p className="eyebrow">BALANCED BETWEEN MEMBERS</p><h2>Settlement</h2><div className="settlement-list">{settlementSuggestions.length ? settlementSuggestions.map((item) => <div className="settlement-payment" key={item.paymentKey}><div className="settlement-payment-line"><span className="payer">{item.from}</span><span className="arrow">→</span><span className="receiver">{item.to}</span><strong>{formatCurrency(item.amountCents)}</strong></div><div className="settlement-payment-actions">{item.status === 'settled' ? <span className="payment-status is-settled">Settled</span> : <><span className="payment-status is-pending">Pending</span><button type="button" className="button button-secondary" onClick={() => setSettlementConfirmation(item)}>Mark as Settled</button></>}</div></div>) : <p className="settlement-empty">Everyone is settled up. No settlement is required.</p>}</div></article></section>
          <div className="export-actions"><button className="button button-secondary" onClick={copySummary}>Copy Summary</button><button className="button button-secondary" onClick={() => downloadPdf().catch(() => notify('Could not create the PDF. Please try again.', true))}>Download PDF</button></div>
        </>}
      </section>}

      {page === 'profile' && <ProfilePage user={user} onUserChange={onUserChange} notify={notify}/>}
      {settlementConfirmation && activeTrip && <div className="dialog-backdrop"><section className="confirm-dialog panel" role="alertdialog" aria-modal="true" aria-labelledby="settlement-confirm-title"><p className="eyebrow">SETTLEMENT PAYMENT</p><h2 id="settlement-confirm-title">Mark payment as settled?</h2><p>Confirm that {settlementConfirmation.from} paid {settlementConfirmation.to} {formatCurrency(settlementConfirmation.amountCents)}.</p><div className="dialog-actions"><button className="button button-secondary" disabled={settlingPayment} onClick={() => setSettlementConfirmation(null)}>Cancel</button><button className="button button-primary" disabled={settlingPayment} onClick={markPaymentSettled}>{settlingPayment ? 'Saving…' : 'Confirm Settled'}</button></div></section></div>}
      {showEndTripConfirm && activeTrip && <div className="dialog-backdrop"><section className="confirm-dialog panel" role="alertdialog" aria-modal="true" aria-labelledby="end-trip-title"><p className="eyebrow">COMPLETE TRIP</p><h2 id="end-trip-title">End this trip?</h2><p>Are you sure you want to end this trip?</p><div className="dialog-actions"><button className="button button-secondary" disabled={endingTrip} onClick={() => setShowEndTripConfirm(false)}>Cancel</button><button className="button button-primary" disabled={endingTrip} onClick={endTrip}>{endingTrip ? 'Ending Trip…' : 'Confirm End Trip'}</button></div></section></div>}
      {deletingExpense && <div className="dialog-backdrop"><section className="confirm-dialog panel" role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><p className="eyebrow">REMOVE EXPENSE</p><h2 id="delete-title">Delete expense?</h2><p>“{deletingExpense.description}” will be removed from this trip.</p><div className="dialog-actions"><button className="button button-secondary" onClick={() => setDeletingExpense(null)}>Cancel</button><button className="button button-danger" onClick={confirmDeleteExpense}>Delete Expense</button></div></section></div>}
      {notice && <div className={`toast ${notice.isError ? 'toast-error' : ''}`} role="status"><Check size={16}/>{notice.text}</div>}
    </main>
  </div>;
}
