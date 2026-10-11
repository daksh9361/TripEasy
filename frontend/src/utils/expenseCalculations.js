const currencyFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function toCents(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{0,2})?$/.test(text)) return null;

  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatCurrency(cents) {
  return '₹' + currencyFormatter.format((Number(cents) || 0) / 100);
}

export function formatExpenseAmount(cents) {
  const amount = (Number(cents) || 0) / 100;
  const formatted = amount.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return '₹' + formatted;
}

function allocateBalancedBalances(members, paidByMember, totalCents) {
  if (!members.length) return [];

  const count = members.length;
  const provisional = members.map((member, index) => {
    const numerator = (paidByMember.get(member.key) || 0) * count - totalCents;
    const balanceCents = Math.floor(numerator / count);
    return {
      id: member.id,
      name: member.name,
      key: member.key,
      index,
      balanceCents,
      remainder: numerator - balanceCents * count,
    };
  });

  const floorTotal = provisional.reduce((sum, entry) => sum + entry.balanceCents, 0);
  const centsToDistribute = -floorTotal;
  const byRemainder = [...provisional].sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (let i = 0; i < centsToDistribute; i += 1) {
    byRemainder[i].balanceCents += 1;
  }

  return provisional;
}

function makeSettlements(balances) {
  const debtors = balances
    .filter((member) => member.balanceCents < 0)
    .map((member) => ({ id: member.id, name: member.name, remaining: -member.balanceCents }));
  const creditors = balances
    .filter((member) => member.balanceCents > 0)
    .map((member) => ({ id: member.id, name: member.name, remaining: member.balanceCents }));

  const settlements = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amountCents = Math.min(debtor.remaining, creditor.remaining);

    if (amountCents > 0) {
      settlements.push({ from: debtor.name, to: creditor.name, fromMemberId: debtor.id, toMemberId: creditor.id, amountCents });
      debtor.remaining -= amountCents;
      creditor.remaining -= amountCents;
    }

    if (debtor.remaining === 0) debtorIndex += 1;
    if (creditor.remaining === 0) creditorIndex += 1;
  }

  return settlements;
}

export function calculateExpenseSummary(members, expenses) {
  const normalizedMembers = members.map((member) => typeof member === 'string'
    ? { id: member, name: member, key: member }
    : { id: member.id, name: member.name, key: member.id || member.name });
  const paidByMember = new Map(normalizedMembers.map((member) => [member.key, 0]));
  let totalCents = 0;

  for (const expense of expenses) {
    const cents = toCents(expense.amount);
    if (cents === null || cents < 0) continue;
    totalCents += cents;
    const paidByKey = expense.paidByMemberId || expense.paidBy;
    if (paidByMember.has(paidByKey)) {
      paidByMember.set(paidByKey, paidByMember.get(paidByKey) + cents);
    }
  }

  const balances = allocateBalancedBalances(normalizedMembers, paidByMember, totalCents);
  const balanceTotal = balances.reduce((sum, member) => sum + member.balanceCents, 0);
  if (balanceTotal !== 0) {
    throw new Error('Settlement rounding did not balance to zero.');
  }

  return {
    totalCents,
    perPersonCents: members.length ? Math.round(totalCents / members.length) : 0,
    contributions: normalizedMembers.map((member) => ({ id: member.id, name: member.name, paidCents: paidByMember.get(member.key) || 0 })),
    balances,
    settlements: makeSettlements(balances),
  };
}
