export const BUILTIN_QUESTION_STATS: Record<string, number> = {
  "acting": 30,
  "brand": 20,
  "completion": 51,
  "flag": 160,
  "image": 56,
  "memory": 30,
  "multiple_choice": 746,
  "ordering": 44,
  "riddle": 64,
  "true_false": 106
};

export const BUILTIN_QUESTION_COUNT = Object.values(BUILTIN_QUESTION_STATS).reduce((total, count) => total + count, 0);
