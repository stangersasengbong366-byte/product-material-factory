export const VIDEO_OUTLINE_SINGLE_COLUMN_LIMIT = 39;
export const VIDEO_OUTLINE_TWO_COLUMN_LIMIT = 60;

export function getVideoOutlineColumnCount(rowCount) {
  if (rowCount <= VIDEO_OUTLINE_SINGLE_COLUMN_LIMIT) return 1;
  if (rowCount <= VIDEO_OUTLINE_TWO_COLUMN_LIMIT) return 2;
  return 3;
}

export function splitVideoOutlineGroups(
  groups,
  rowCount,
) {
  const numberedGroups = groups.map((group, index) => ({
    ...group,
    groupNumber: index + 1,
  }));
  const columnCount = getVideoOutlineColumnCount(rowCount);

  if (columnCount === 1) {
    return { isSplit: false, columnCount, columns: [numberedGroups] };
  }

  const baseSize = Math.floor(rowCount / columnCount);
  const remainder = rowCount % columnCount;
  const columnCapacities = Array.from(
    { length: columnCount },
    (_, index) => baseSize + (index < remainder ? 1 : 0),
  );
  const columns = Array.from({ length: columnCount }, () => []);
  let columnIndex = 0;
  let usedInColumn = 0;

  numberedGroups.forEach((group) => {
    let itemIndex = 0;
    while (itemIndex < group.items.length && columnIndex < columnCount) {
      const available = columnCapacities[columnIndex] - usedInColumn;
      const items = group.items.slice(itemIndex, itemIndex + available);
      if (items.length) columns[columnIndex].push({ ...group, items });
      itemIndex += items.length;
      usedInColumn += items.length;
      if (usedInColumn === columnCapacities[columnIndex]) {
        columnIndex += 1;
        usedInColumn = 0;
      }
    }
  });

  return { isSplit: true, columnCount, columns };
}
