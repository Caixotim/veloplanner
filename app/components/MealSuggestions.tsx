import styles from './MealSuggestions.module.scss'
import type { MealSuggestion } from '@/app/lib/types'

interface MealSuggestionsProps {
  meals: MealSuggestion[]
  week?: number
}

// Stable display order for meal categories
const MEAL_ORDER: MealSuggestion['meal'][] = ['breakfast', 'lunch', 'snack', 'dinner', 'post_workout']

const MEAL_META: Record<
  MealSuggestion['meal'],
  { icon: string; label: string; accent: string }
> = {
  breakfast:    { icon: '🍳', label: 'Breakfast',    accent: '#f39c12' },
  lunch:        { icon: '🍽️', label: 'Lunch',        accent: '#3498db' },
  snack:        { icon: '🥗', label: 'Snacks',       accent: '#2ecc71' },
  dinner:       { icon: '🥘', label: 'Dinner',       accent: '#9b59b6' },
  post_workout: { icon: '⚡', label: 'Post-Workout', accent: '#e74c3c' },
}

/**
 * Deduplicate meals by name so we show each recipe once regardless of how
 * many weeks the plan spans.
 */
function uniqueByName(meals: MealSuggestion[]): MealSuggestion[] {
  const seen = new Set<string>()
  return meals.filter(m => {
    if (seen.has(m.name)) return false
    seen.add(m.name)
    return true
  })
}

export function MealSuggestions({ meals, week }: MealSuggestionsProps) {
  // When a specific week is selected show that week's meals (no dedup needed).
  // Otherwise show the full unique recipe catalogue.
  const displayMeals = week
    ? meals.filter(m => m.weekNumber === week)
    : uniqueByName(meals)

  const mealsByType = MEAL_ORDER.reduce<Record<string, MealSuggestion[]>>(
    (acc, type) => {
      acc[type] = displayMeals.filter(m => m.meal === type)
      return acc
    },
    {}
  )

  // Drop categories that have no recipes in the current view
  const activeCategories = MEAL_ORDER.filter(type => mealsByType[type].length > 0)

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>🥗 Mediterranean Meal Plan</h2>
      <p className={styles.subtitle}>
        {week ? `Week ${week} meals` : 'Full recipe catalogue — cycles across your training weeks'}
      </p>

      <div className={styles.mealsGrid}>
        {activeCategories.map(mealType => {
          const meta = MEAL_META[mealType]
          return (
            <div key={mealType} className={styles.mealCategory}>
              <h3 className={styles.categoryTitle} style={{ borderColor: meta.accent }}>
                <span className={styles.icon}>{meta.icon}</span>
                {meta.label}
              </h3>

              <div className={styles.mealsList}>
                {mealsByType[mealType].map(meal => (
                  <div key={meal.id} className={styles.mealCard}>
                    <div className={styles.mealHeader}>
                      <h4 className={styles.mealName}>{meal.name}</h4>
                      <div className={styles.mealHeaderMeta}>
                        {meal.nutritionSource && (
                          <span className={meal.nutritionSource === 'usda' ? styles.sourceBadgeUsda : styles.sourceBadgeHeuristic}>
                            {meal.nutritionSource === 'usda' ? 'USDA macros' : 'Estimated macros'}
                          </span>
                        )}
                        <span className={styles.prepTime}>⏱️ {meal.prepTimeMinutes}min</span>
                      </div>
                    </div>

                    <p className={styles.mealDescription}>{meal.description}</p>

                    {meal.timingTip && (
                      <div className={styles.timingTip}>
                        <span className={styles.timingIcon}>🕐</span>
                        <span>{meal.timingTip}</span>
                      </div>
                    )}

                    <div className={styles.ingredients}>
                      <strong>Ingredients:</strong>
                      <ul>
                        {meal.ingredients.slice(0, 4).map((ing, idx) => (
                          <li key={idx}>{ing}</li>
                        ))}
                        {meal.ingredients.length > 4 && (
                          <li className={styles.moreIngredients}>+{meal.ingredients.length - 4} more</li>
                        )}
                      </ul>
                    </div>

                    <div className={styles.nutrition}>
                      <div className={styles.nutrientBadge}>
                        <span className={styles.nutrientValue}>{meal.caloriesEstimate}</span>
                        <span className={styles.nutrientLabel}>kcal</span>
                      </div>
                      <div className={styles.nutrientBadge}>
                        <span className={styles.nutrientValue}>{meal.carbs}g</span>
                        <span className={styles.nutrientLabel}>carbs</span>
                      </div>
                      <div className={styles.nutrientBadge}>
                        <span className={styles.nutrientValue}>{meal.proteins}g</span>
                        <span className={styles.nutrientLabel}>protein</span>
                      </div>
                      <div className={styles.nutrientBadge}>
                        <span className={styles.nutrientValue}>{meal.fats}g</span>
                        <span className={styles.nutrientLabel}>fat</span>
                      </div>
                    </div>

                    {meal.portugueseIngredients && (
                      <div className={styles.portugueseBadge}>🇵🇹 Portuguese Ingredients</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className={styles.tips}>
        <h3>💡 Nutrition Timing Guide</h3>
        <ul>
          <li><strong>4h before a big ride</strong> — high-carb, low-fat meal (e.g. rice pudding, pasta)</li>
          <li><strong>2-3h before training</strong> — moderate meal with carbs + protein; avoid excess fat</li>
          <li><strong>60-90 min before</strong> — small snack: banana, rice cakes, or a smoothie</li>
          <li><strong>During rides 3h+</strong> — 40-60g carbs/hour; real food every 45-60 min</li>
          <li><strong>Within 30 min after</strong> — prioritise carbs + protein (3:1 ratio) for glycogen recovery</li>
          <li><strong>Night before a long ride</strong> — salmon or pasta dinner; fills glycogen without heavy digestion load</li>
          <li><strong>Rest days</strong> — reduce carbs slightly, keep protein high; focus on iron-rich and anti-inflammatory foods</li>
        </ul>
      </div>
    </div>
  )
}


