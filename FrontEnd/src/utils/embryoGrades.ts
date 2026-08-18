// Clinical ranking of Gardner blastocyst grades, best first. Expansion alone
// doesn't decide quality — 4AA outranks 5AB — so ordering is by explicit list
// rather than a formula.
export const EMBRYO_GRADE_RANKING = [
  // Excellent
  '5AA', '6AA', '4AA', '3AA',
  // Very good
  '5AB', '5BA', '6AB', '6BA', '4AB', '4BA', '3AB', '3BA',
  // Good
  '5BB', '6BB', '4BB', '3BB',
  // Fair
  '5AC', '5CA', '6AC', '6CA', '4AC', '4CA', '3AC', '3CA',
  '5BC', '5CB', '6BC', '6CB', '4BC', '4CB', '3BC', '3CB',
  // Poor
  '5CC', '6CC', '4CC', '3CC',
  // Lower expansion stages
  '2AA', '2AB', '2BA', '2BB', '2AC', '2CA', '2BC', '2CB', '2CC',
  '1AA', '1AB', '1BA', '1BB', '1AC', '1CA', '1BC', '1CB', '1CC',
];

const RANK = new Map(EMBRYO_GRADE_RANKING.map((g, i) => [g, i]));

/** Position in the ranking; unknown grades sort after every known grade. */
export function gradeRank(grade?: string | null): number {
  if (!grade) return Number.MAX_SAFE_INTEGER;
  return RANK.get(grade.toUpperCase()) ?? Number.MAX_SAFE_INTEGER;
}

/** The highest-ranked grade in the list, or the first one present if none are ranked. */
export function bestGrade(grades: (string | null | undefined)[]): string | null {
  const present = grades.filter((g): g is string => !!g);
  if (present.length === 0) return null;
  return present.reduce((best, g) => (gradeRank(g) < gradeRank(best) ? g : best));
}
