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
  [50, [50]],
  [60, [60]],
  [61, [31, 30]],
  [100, [50, 50]],
  [101, [51, 50]],
  [120, [60, 60]],
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
});
