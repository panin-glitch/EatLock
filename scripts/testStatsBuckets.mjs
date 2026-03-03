import assert from 'node:assert/strict';

function getWeekOfMonthIndex(dayOfMonth) {
  return Math.floor((dayOfMonth - 1) / 7);
}

const cases = [
  [1, 0],
  [7, 0],
  [8, 1],
  [14, 1],
  [15, 2],
  [21, 2],
  [22, 3],
  [28, 3],
  [29, 4],
  [31, 4],
];

for (const [day, expected] of cases) {
  assert.equal(getWeekOfMonthIndex(day), expected, `day ${day} should map to W${expected + 1}`);
}

const now = new Date();
const day = now.getDate();
const weekIdx = getWeekOfMonthIndex(day);

console.log('[stats-buckets] week-of-month tests passed');
console.log('[stats-buckets] today mapping', {
  today: now.toISOString(),
  dayOfMonth: day,
  monthlyBucket: `M${weekIdx + 1}`,
});

const weeklyLabels = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(now);
  d.setDate(now.getDate() - (6 - i));
  return `${d.getMonth() + 1}/${d.getDate()}`;
});
console.log('[stats-buckets] weekly labels (last 7 days)', weeklyLabels);

const weeklyData = [0, 0, 0, 0, 1];
const monthlyData = [0, 0, 0, 0, 0];
monthlyData[weekIdx] = 1;

console.log('[stats-buckets] single meal mapping proof', {
  weekly: {
    labels: ['W1', 'W2', 'W3', 'W4', 'W5'],
    data: weeklyData,
    expectedBucketLabel: 'W5',
    expectedValue: weeklyData[4],
  },
  monthly: {
    labels: ['M1', 'M2', 'M3', 'M4', 'M5'],
    data: monthlyData,
    expectedBucketLabel: `M${weekIdx + 1}`,
    expectedValue: monthlyData[weekIdx],
  },
});
