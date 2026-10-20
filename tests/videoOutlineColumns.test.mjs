import test from "node:test";
import assert from "node:assert/strict";
import { splitVideoOutlineGroups } from "../src/videoOutlineColumns.js";

function buildGroups(count, moduleSize = 10) {
  return Array.from({ length: Math.ceil(count / moduleSize) }, (_, groupIndex) => ({
    module: `模块${groupIndex + 1}`,
    scoreShare: "",
    items: Array.from(
      { length: Math.min(moduleSize, count - groupIndex * moduleSize) },
      (_, itemIndex) => ({ index: groupIndex * moduleSize + itemIndex }),
    ),
  }));
}

for (const [count, expected] of [
  [1, [1]],
  [39, [39]],
  [40, [20, 20]],
  [59, [30, 29]],
  [60, [30, 30]],
  [61, [21, 20, 20]],
  [100, [34, 33, 33]],
  [120, [40, 40, 40]],
]) {
  test(`知识视频 ${count} 节按规则分列`, () => {
    const result = splitVideoOutlineGroups(buildGroups(count), count);
    assert.deepEqual(
      result.columns.map((column) =>
        column.reduce((sum, group) => sum + group.items.length, 0),
      ),
      expected,
    );
  });
}

test("跨列模块保留原模块序号", () => {
  const result = splitVideoOutlineGroups(buildGroups(61, 20), 61);
  assert.equal(result.columns[0].at(-1).groupNumber, 2);
  assert.equal(result.columns[1][0].groupNumber, 2);
  assert.equal(result.columns[1].at(-1).groupNumber, 3);
  assert.equal(result.columns[2][0].groupNumber, 3);
});

test("知识视频严格按 40 与 60 节切换列数", () => {
  assert.equal(splitVideoOutlineGroups(buildGroups(39), 39).columnCount, 1);
  assert.equal(splitVideoOutlineGroups(buildGroups(40), 40).columnCount, 2);
  assert.equal(splitVideoOutlineGroups(buildGroups(60), 60).columnCount, 2);
  assert.equal(splitVideoOutlineGroups(buildGroups(61), 61).columnCount, 3);
});
