import { useState } from 'react';

export default function ExpenseForm({ members, initialExpense, onCancel, onSave }) {
  const [paidByMemberId, setPaidByMemberId] = useState((initialExpense?.paidByMemberId ?? members[0]?.id) || '');
  const [amount, setAmount] = useState(initialExpense?.amount ?? '');
  const [description, setDescription] = useState(initialExpense?.description ?? '');
  const [location, setLocation] = useState(initialExpense?.location ?? '');

  const submit = (event) => {
    event.preventDefault();
    const expense = { paidByMemberId, amount, description: description.trim(), location: location.trim() };
    onSave(expense);
  };

  return (
    <form className="expense-form" onSubmit={submit}>
      <div className="expense-fields">
        <label className="field-label">Paid By
          <select value={paidByMemberId} onChange={(event) => setPaidByMemberId(event.target.value)} required>
            <option value="" disabled>Select a member</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </label>
        <label className="field-label">Amount
          <div className="amount-input"><span>₹</span><input type="number" min="0.01" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0"/></div>
        </label>
        <label className="field-label">Description
          <input required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Hotel"/>
        </label>
        <label className="field-label">Location
          <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Manali"/>
        </label>
      </div>
      <div className="expense-form-actions">
        <button className="button button-primary" type="submit">{initialExpense ? 'Save Changes' : 'Add'}</button>
        <button className="button button-secondary" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

