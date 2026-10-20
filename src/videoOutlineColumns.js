export const VIDEO_OUTLINE_SINGLE_COLUMN_LIMIT = 39;
export const VIDEO_OUTLINE_TWO_COLUMN_LIMIT = 60;

export function getVideoOutlineColumnCount(rowCount) {
  if (rowCount <= VIDEO_OUTLINE_SINGLE_COLUMN_LIMIT) return 1;
  if (rowCount <= VIDEO_OUTLINE_TWO_COLUMN_LIMIT) return 2;
  return 3;
}

export function splitVideoOutlineGroups(groups, rowCount) {
  const numberedGroups = groups.map((group, index) => ({
    ...group,
    groupNumber: index + 1,
  }));
  const columnCount = getVideoOutlineColumnCount(rowCount);

  if (columnCount === 1) {
    return { isSplit: false, columnCount, columns: [numberedGroups] };
  }

  const actualRowCount = numberedGroups.reduce(
    (sum, group) => sum + group.items.length,
    0,
  );
  const baseSize = Math.floor(actualRowCount / columnCount);
  const remainder = actualRowCount % columnCount;
  const columnCapacities = Array.from(
    { length: columnCount },
    (_, index) => baseSize + (index < remainder ? 1 : 0),
  );
  const columns = Array.from({ length: columnCount }, () => []);
  const consumed = Array(columnCount).fill(0);
  let columnIndex = 0;

  numberedGroups.forEach((group) => {
    let itemOffset = 0;
    while (itemOffset < group.items.length && columnIndex < columnCount) {
      const capacity = columnCapacities[columnIndex] - consumed[columnIndex];
      if (capacity <= 0) {
        columnIndex += 1;
        continue;
      }
      const items = group.items.slice(itemOffset, itemOffset + capacity);
      if (items.length) {
        columns[columnIndex].push({ ...group, items });
        consumed[columnIndex] += items.length;
        itemOffset += items.length;
      }
      if (consumed[columnIndex] >= columnCapacities[columnIndex]) columnIndex += 1;
    }
  });

  return { isSplit: true, columnCount, columns };
}
