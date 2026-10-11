import { MapPin } from 'lucide-react';
import { formatExpenseAmount, toCents } from '../utils/expenseCalculations.js';

export default function ExpenseTable({ expenses, onEdit, onDelete }) {
  return (
    <div className="table-scroll">
      <table>
        <thead><tr><th>Name</th><th>Expense</th><th>Description</th><th>Location</th><th>Actions</th></tr></thead>
        <tbody>
          {expenses.map((expense, index) => (
            <tr key={expense.id}>
              <td><span className={'avatar avatar-' + (index % 3)}>{expense.paidBy.slice(0, 1)}</span><span className="expense-member-name">{expense.paidBy}</span></td>
              <td className="amount-cell">{formatExpenseAmount(toCents(expense.amount) ?? 0)}</td>
              <td>{expense.description}</td>
              <td><span className="location-cell"><MapPin size={13}/>{expense.location || '—'}</span></td>
              <td><div className="row-actions">
                <button type="button" onClick={() => onEdit(expense)}>Edit</button>
                <button type="button" onClick={() => onDelete(expense)}>Delete</button>
              </div></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!expenses.length && <p className="empty-expenses">No expenses yet. Add one to get started.</p>}
    </div>
  );
}
