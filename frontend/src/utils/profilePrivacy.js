export function maskName(value) {
  if (typeof value !== 'string' || !value.trim()) return '';

  return value.trim().split(/\s+/u).map((part) => {
    const characters = Array.from(part);
    return `${characters[0]}${'*'.repeat(Math.max(3, characters.length - 1))}`;
  }).join(' ');
}

export function maskEmail(value) {
  if (typeof value !== 'string') return '';

  const email = value.trim();
  const separator = email.lastIndexOf('@');
  if (separator <= 0 || separator === email.length - 1) return '***';

  const localPart = Array.from(email.slice(0, separator));
  const maskedLocalPart = `${localPart[0]}${'*'.repeat(Math.max(3, localPart.length - 1))}`;
  return `${maskedLocalPart}${email.slice(separator)}`;
}

export function maskMobile(value) {
  if (typeof value !== 'string' || !value.trim()) return 'Not provided';

  const digits = value.replace(/\D/g, '').slice(-10);
  if (!digits) return 'Not provided';
  if (digits.length < 10) return `${digits[0]}${'*'.repeat(Math.max(3, digits.length - 1))}`;

  return `${digits.slice(0, 2)}**** **${digits.slice(-2)}`;
}
