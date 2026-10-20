export function digitsOnly(value: string) {
  return String(value ?? "").replace(/\D/g, "");
}

/** DDD + 8 dígitos locais (ignora o 9 móvel). 5577991776299 e 557791776299 → 7791776299 */
export function brazilMobileKey(value: string) {
  let digits = digitsOnly(value);
  if (digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length === 11 && digits[2] === "9") {
    digits = `${digits.slice(0, 2)}${digits.slice(3)}`;
  }
  return digits;
}

/** Formatos BR com e sem o 9º dígito, para achar o mesmo cliente. */
export function waPhoneVariants(value: string) {
  const digits = digitsOnly(value);
  const variants = new Set<string>();
  if (digits) variants.add(digits);
  if (digits.startsWith("55") && digits.length === 12) {
    variants.add(`${digits.slice(0, 4)}9${digits.slice(4)}`);
  }
  if (digits.startsWith("55") && digits.length === 13 && digits[4] === "9") {
    variants.add(`${digits.slice(0, 4)}${digits.slice(5)}`);
  }
  return [...variants];
}

export function sameWaPhone(left: string, right: string) {
  const a = digitsOnly(left);
  const b = digitsOnly(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const keyA = brazilMobileKey(a);
  const keyB = brazilMobileKey(b);
  return Boolean(keyA && keyB && keyA === keyB);
}
