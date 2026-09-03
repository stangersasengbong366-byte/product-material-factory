export function formatCourseDate(value) {
  const label = String(value ?? "").trim();
  if (!label) return "";

  const chineseDate = label.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (chineseDate) {
    return joinDateParts(chineseDate[1], chineseDate[2], chineseDate[3]);
  }

  const yearFirst = label.match(/^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})$/);
  if (yearFirst) {
    return joinDateParts(yearFirst[1], yearFirst[2], yearFirst[3]);
  }

  const yearLast = label.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/);
  if (yearLast) {
    const year = yearLast[3].length === 2 ? `20${yearLast[3]}` : yearLast[3];
    return joinDateParts(year, yearLast[1], yearLast[2]);
  }

  return label;
}

function joinDateParts(year, month, day) {
  return `${Number(year)}/${Number(month)}/${Number(day)}`;
}
