export const BUILTIN_QUESTION_STATS: Record<string, number> = {
  "acting": 30,
  "completion": 30,
  "flag": 160,
  "image": 36,
  "memory": 30,
  "multiple_choice": 739,
  "ordering": 21,
  "riddle": 56,
  "true_false": 105
};

export const BUILTIN_QUESTION_COUNT = Object.values(BUILTIN_QUESTION_STATS).reduce((total, count) => total + count, 0);
