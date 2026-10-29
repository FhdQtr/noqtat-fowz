export const BUILTIN_QUESTION_STATS: Record<string, number> = {
  "acting": 30,
  "brand": 20,
  "completion": 49,
  "flag": 160,
  "image": 56,
  "memory": 30,
  "multiple_choice": 743,
  "ordering": 42,
  "riddle": 64,
  "true_false": 105
};

export const BUILTIN_QUESTION_COUNT = Object.values(BUILTIN_QUESTION_STATS).reduce((total, count) => total + count, 0);
