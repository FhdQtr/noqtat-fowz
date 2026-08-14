export const BUILTIN_QUESTION_STATS: Record<string, { easy: number; medium: number; hard: number }> = {
  multiple_choice: { easy: 323, medium: 322, hard: 144 },
  true_false: { easy: 80, medium: 21, hard: 7 },
  riddle: { easy: 36, medium: 17, hard: 6 },
  flag: { easy: 13, medium: 4, hard: 3 },
  completion: { easy: 10, medium: 10, hard: 10 },
  ordering: { easy: 9, medium: 9, hard: 3 },
  image: { easy: 7, medium: 3, hard: 2 },
  memory: { easy: 3, medium: 3, hard: 3 },
  acting: { easy: 8, medium: 8, hard: 8 },
};

export const BUILTIN_QUESTION_COUNT = Object.values(BUILTIN_QUESTION_STATS)
  .reduce((total, levels) => total + levels.easy + levels.medium + levels.hard, 0);
