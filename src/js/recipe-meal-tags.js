/**
 * Recipe meal-type tag helpers
 * Stored inside recipe description using a hidden marker line:
 * [meal_types:breakfast,lunch]
 */

export const MEAL_TYPE_OPTIONS = ['breakfast', 'lunch', 'dinner'];

const MARKER_REGEX = /^\[meal_types:([^\]]*)\]\s*$/im;

export function normalizeMealType(value) {
  const v = String(value || '').trim().toLowerCase();
  return MEAL_TYPE_OPTIONS.includes(v) ? v : '';
}

export function parseRecipeMealTypes(description = '') {
  const match = String(description || '').match(MARKER_REGEX);
  if (!match) return [];
  return match[1]
    .split(',')
    .map(normalizeMealType)
    .filter(Boolean);
}

export function stripMealTypeMarker(description = '') {
  return String(description || '')
    .replace(MARKER_REGEX, '')
    .trim();
}

export function buildDescriptionWithMealTypes(description = '', mealTypes = []) {
  const cleanDescription = stripMealTypeMarker(description);
  const normalized = [...new Set((mealTypes || []).map(normalizeMealType).filter(Boolean))];
  if (normalized.length === 0) return cleanDescription;

  const marker = `[meal_types:${normalized.join(',')}]`;
  return cleanDescription ? `${cleanDescription}\n\n${marker}` : marker;
}
