const CHINESE_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const CHINESE_UNITS = ["", "十", "百", "千"];

export function toChineseNumeral(value) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number) || number <= 0 || number > 9999)
    return String(value);

  let result = "";
  let zeroPending = false;
  const highestUnit = Math.floor(Math.log10(number));

  for (let unit = highestUnit; unit >= 0; unit -= 1) {
    const base = 10 ** unit;
    const digit = Math.floor(number / base) % 10;
    if (!digit) {
      if (result && number % base) zeroPending = true;
      continue;
    }
    if (zeroPending) result += CHINESE_DIGITS[0];
    result += `${CHINESE_DIGITS[digit]}${CHINESE_UNITS[unit]}`;
    zeroPending = false;
  }

  return result.replace(/^一十/, "十");
}
