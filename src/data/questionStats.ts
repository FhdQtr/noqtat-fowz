export const BUILTIN_QUESTION_STATS: Record<string, number> = {
  "acting": 30,
  "completion": 50,
  "flag": 160,
  "image": 56,
  "memory": 30,
  "multiple_choice": 739,
  "ordering": 41,
  "riddle": 71,
  "true_false": 105
};

export const BUILTIN_QUESTION_COUNT = Object.values(BUILTIN_QUESTION_STATS).reduce((total, count) => total + count, 0);
