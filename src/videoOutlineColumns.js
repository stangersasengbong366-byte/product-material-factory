export const VIDEO_OUTLINE_SINGLE_COLUMN_LIMIT = 60;

export function splitVideoOutlineGroups(
  groups,
  rowCount,
  singleColumnLimit = VIDEO_OUTLINE_SINGLE_COLUMN_LIMIT,
) {
  const numberedGroups = groups.map((group, index) => ({
    ...group,
    groupNumber: index + 1,
  }));

  if (rowCount <= singleColumnLimit) {
    return { isSplit: false, columns: [numberedGroups] };
  }

  const leftRowCount = Math.ceil(rowCount / 2);
  const columns = [[], []];
  let consumedRows = 0;

  numberedGroups.forEach((group) => {
    const leftCapacity = Math.max(0, leftRowCount - consumedRows);
    const leftItems = group.items.slice(0, leftCapacity);
    const rightItems = group.items.slice(leftItems.length);

    if (leftItems.length) columns[0].push({ ...group, items: leftItems });
    if (rightItems.length) columns[1].push({ ...group, items: rightItems });
    consumedRows += leftItems.length;
  });

  return { isSplit: true, columns };
}
