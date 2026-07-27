import { NextResponse } from 'next/server'
import type { DietPreference, MealSuggestion } from '@/app/lib/types'

type MealsRequestPayload = {
  durationWeeks?: number
  nutrition?: {
    dietPreference?: DietPreference
    dailyCalories?: number
    dailyProteinGrams?: number
    dailyCarbGrams?: number
    dailyFatGrams?: number
  }
}

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'post_workout'

type TheMealDbMealListItem = {
  idMeal: string
  strMeal: string
}

type TheMealDbMeal = {
  idMeal: string
  strMeal: string
  strCategory?: string
  strArea?: string
  strInstructions?: string
  [key: string]: string | undefined
}

type TheMealDbSearchResponse = {
  meals: TheMealDbMeal[] | null
}

type TheMealDbFilterResponse = {
  meals: TheMealDbMealListItem[] | null
}

type UsdaSearchResponse = {
  foods?: Array<{
    description?: string
    foodNutrients?: Array<{
      nutrientName?: string
      nutrientNumber?: string
      value?: number
    }>
  }>
}

type MealNutritionEstimate = Pick<MealSuggestion, 'caloriesEstimate' | 'carbs' | 'proteins' | 'fats' | 'nutritionSource'>

type MealApiDebug = {
  provider: 'themealdb'
  cache: {
    themealdbSearchHits: number
    themealdbSearchMisses: number
    themealdbFilterHits: number
    themealdbFilterMisses: number
    usdaHits: number
    usdaMisses: number
  }
}

const THEMEALDB_BASE_URL = 'https://www.themealdb.com/api/json/v1/1'
const USDA_BASE_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

const mealDbSearchCache = new Map<string, { expiresAt: number; value: TheMealDbMeal[] }>()
const mealDbFilterCache = new Map<string, { expiresAt: number; value: TheMealDbMeal[] }>()
const usdaNutritionCache = new Map<string, { expiresAt: number; value: MealNutritionEstimate | null }>()

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as MealsRequestPayload
    const durationWeeks = normalizeDurationWeeks(payload.durationWeeks)
    const nutrition = payload.nutrition || {}
    const debug: MealApiDebug = {
      provider: 'themealdb',
      cache: {
        themealdbSearchHits: 0,
        themealdbSearchMisses: 0,
        themealdbFilterHits: 0,
        themealdbFilterMisses: 0,
        usdaHits: 0,
        usdaMisses: 0,
      },
    }

    const recipesByMealType = await fetchRecipesByMealType(nutrition, debug)
    const meals = await mapTheMealDbRecipesToMeals(recipesByMealType, durationWeeks, nutrition, debug)

    const response = NextResponse.json({
      provider: 'themealdb',
      meals,
      debug,
    })
    response.headers.set('x-meals-provider', 'themealdb')
    response.headers.set('x-meals-cache-search-hits', String(debug.cache.themealdbSearchHits))
    response.headers.set('x-meals-cache-filter-hits', String(debug.cache.themealdbFilterHits))
    response.headers.set('x-meals-cache-usda-hits', String(debug.cache.usdaHits))
    return response
  } catch (error) {
    console.error('Failed to fetch TheMealDB meal suggestions', error)
    return NextResponse.json({ error: 'Failed to fetch meal suggestions' }, { status: 500 })
  }
}

function normalizeDurationWeeks(value?: number): number {
  const candidate = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 12
  return Math.max(1, Math.min(candidate, 30))
}

async function fetchRecipesByMealType(
  nutrition: NonNullable<MealsRequestPayload['nutrition']>,
  debug: MealApiDebug
): Promise<Record<MealType, TheMealDbMeal[]>> {
  const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack', 'post_workout']
  const entries = await Promise.all(
    mealTypes.map(async (mealType) => [mealType, await fetchRecipesForMealType(mealType, nutrition, debug)] as const)
  )

  const byMealType: Record<MealType, TheMealDbMeal[]> = {
    breakfast: entries.find(([mealType]) => mealType === 'breakfast')?.[1] || [],
    lunch: entries.find(([mealType]) => mealType === 'lunch')?.[1] || [],
    dinner: entries.find(([mealType]) => mealType === 'dinner')?.[1] || [],
    snack: entries.find(([mealType]) => mealType === 'snack')?.[1] || [],
    post_workout: entries.find(([mealType]) => mealType === 'post_workout')?.[1] || [],
  }

  if (byMealType.post_workout.length === 0) {
    byMealType.post_workout = byMealType.snack.slice(0, 8)
  }

  return byMealType
}

async function fetchRecipesForMealType(
  mealType: MealType,
  nutrition: NonNullable<MealsRequestPayload['nutrition']>,
  debug: MealApiDebug
): Promise<TheMealDbMeal[]> {
  const sources = buildMealSources(mealType, nutrition.dietPreference)
  const seenIds = new Set<string>()
  const meals: TheMealDbMeal[] = []

  for (const source of sources) {
    const nextMeals = source.kind === 'search'
      ? await searchMealsByName(source.value, debug)
      : await lookupMealsFromFilter(source.kind, source.value, debug)

    for (const meal of nextMeals) {
      if (seenIds.has(meal.idMeal)) {
        continue
      }
      // Skip desserts — they're not useful for a training nutrition plan
      if (meal.strCategory?.toLowerCase() === 'dessert') {
        continue
      }

      seenIds.add(meal.idMeal)
      meals.push(meal)
    }

    if (meals.length >= 20) {
      break
    }
  }

  return meals.slice(0, 20)
}

function buildMealSources(
  mealType: MealType,
  dietPreference?: DietPreference
): Array<{ kind: 'search' | 'ingredient' | 'category' | 'area'; value: string }> {
  const mediterraneanBias = dietPreference === 'mediterranean'

  if (mealType === 'breakfast') {
    return [
      { kind: 'search', value: 'breakfast' },
      { kind: 'area', value: 'Spanish' },      // Mediterranean, high quality recipes
      { kind: 'area', value: 'Italian' },       // Mediterranean baseline
      { kind: 'search', value: 'porridge' },
      { kind: 'ingredient', value: mediterraneanBias ? 'yogurt' : 'egg' },
    ]
  }

  if (mealType === 'lunch') {
    return [
      { kind: 'area', value: 'Portuguese' },    // Primary — sardines, bacalhau, piri-piri
      { kind: 'area', value: 'Spanish' },       // Secondary — large pool, culturally adjacent
      { kind: 'search', value: 'bacalhau' },    // Specific Portuguese dish searches
      { kind: 'search', value: 'sardine' },
      { kind: 'search', value: 'piri piri chicken' },
      { kind: 'category', value: 'Seafood' },
      { kind: 'ingredient', value: mediterraneanBias ? 'chickpeas' : 'chicken_breast' },
    ]
  }

  if (mealType === 'dinner') {
    return [
      { kind: 'area', value: 'Portuguese' },    // Primary — stew, grilled fish, pork
      { kind: 'area', value: 'Spanish' },       // Secondary
      { kind: 'search', value: 'fish stew' },   // Caldeirada-style
      { kind: 'search', value: 'grilled chicken' },
      { kind: 'area', value: 'Italian' },       // Tertiary Mediterranean fallback
      { kind: 'category', value: 'Seafood' },
      { kind: 'ingredient', value: mediterraneanBias ? 'potato' : 'rice' },
    ]
  }

  if (mealType === 'post_workout') {
    return [
      { kind: 'search', value: 'smoothie' },
      { kind: 'search', value: 'banana' },
      { kind: 'search', value: 'yogurt' },
      { kind: 'search', value: 'oat' },
    ]
  }

  return [
    { kind: 'search', value: 'banana' },
    { kind: 'search', value: 'fruit' },
    { kind: 'search', value: 'yogurt' },
    { kind: 'ingredient', value: mediterraneanBias ? 'almonds' : 'peanut_butter' },
  ]
}

async function searchMealsByName(query: string, debug: MealApiDebug): Promise<TheMealDbMeal[]> {
  const cached = readCache(mealDbSearchCache, query)
  if (cached) {
    debug.cache.themealdbSearchHits += 1
    return cached
  }

  debug.cache.themealdbSearchMisses += 1

  const response = await fetch(`${THEMEALDB_BASE_URL}/search.php?s=${encodeURIComponent(query)}`, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`TheMealDB search failed (${response.status}) for query ${query}`)
  }

  const payload = (await response.json()) as TheMealDbSearchResponse
  const meals = payload.meals || []
  writeCache(mealDbSearchCache, query, meals)
  return meals
}

async function lookupMealsFromFilter(kind: 'ingredient' | 'category' | 'area', value: string, debug: MealApiDebug): Promise<TheMealDbMeal[]> {
  const cacheKey = `${kind}:${value}`
  const cached = readCache(mealDbFilterCache, cacheKey)
  if (cached) {
    debug.cache.themealdbFilterHits += 1
    return cached
  }

  debug.cache.themealdbFilterMisses += 1

  const paramName = kind === 'ingredient' ? 'i' : kind === 'category' ? 'c' : 'a'
  const response = await fetch(`${THEMEALDB_BASE_URL}/filter.php?${paramName}=${encodeURIComponent(value)}`, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`TheMealDB filter failed (${response.status}) for ${kind} ${value}`)
  }

  const payload = (await response.json()) as TheMealDbFilterResponse
  const items = (payload.meals || []).slice(0, 15)
  const detailed = await Promise.all(items.map((item) => lookupMealById(item.idMeal)))
  const meals = detailed.filter((meal): meal is TheMealDbMeal => Boolean(meal))
  writeCache(mealDbFilterCache, cacheKey, meals)
  return meals
}

async function lookupMealById(id: string): Promise<TheMealDbMeal | null> {
  const response = await fetch(`${THEMEALDB_BASE_URL}/lookup.php?i=${encodeURIComponent(id)}`, { cache: 'no-store' })
  if (!response.ok) {
    return null
  }

  const payload = (await response.json()) as TheMealDbSearchResponse
  return payload.meals?.[0] || null
}

async function mapTheMealDbRecipesToMeals(
  recipesByMealType: Record<MealType, TheMealDbMeal[]>,
  durationWeeks: number,
  nutrition: NonNullable<MealsRequestPayload['nutrition']>,
  debug: MealApiDebug
): Promise<MealSuggestion[]> {
  const suggestions: MealSuggestion[] = []
  const nutritionCache = new Map<string, MealNutritionEstimate>()

  for (let weekNumber = 1; weekNumber <= durationWeeks; weekNumber++) {
    const breakfast = pickRotatingMeal(recipesByMealType.breakfast, weekNumber)
    const lunch = pickRotatingMeal(recipesByMealType.lunch, weekNumber)
    const snack = pickRotatingMeal(recipesByMealType.snack, weekNumber)
    const dinner = pickRotatingMeal(recipesByMealType.dinner, weekNumber)
    const postWorkout = pickRotatingMeal(recipesByMealType.post_workout, weekNumber)
    const carbSnack = pickRotatingMeal(recipesByMealType.snack, weekNumber + 3)

    if (breakfast) suggestions.push(await buildMealSuggestion(`themealdb_${weekNumber}_breakfast`, weekNumber, breakfast, 'breakfast', nutrition, nutritionCache, debug))
    if (lunch) suggestions.push(await buildMealSuggestion(`themealdb_${weekNumber}_lunch`, weekNumber, lunch, 'lunch', nutrition, nutritionCache, debug))
    if (snack) suggestions.push(await buildMealSuggestion(`themealdb_${weekNumber}_snack`, weekNumber, snack, 'snack', nutrition, nutritionCache, debug))
    if (postWorkout) suggestions.push(await buildMealSuggestion(`themealdb_${weekNumber}_post`, weekNumber, postWorkout, 'post_workout', nutrition, nutritionCache, debug, 2))
    if (dinner) suggestions.push(await buildMealSuggestion(`themealdb_${weekNumber}_dinner`, weekNumber, dinner, 'dinner', nutrition, nutritionCache, debug))
    if (carbSnack) suggestions.push(await buildMealSuggestion(`themealdb_${weekNumber}_carb`, weekNumber, carbSnack, 'snack', nutrition, nutritionCache, debug, 6))
  }

  return suggestions
}

function pickRotatingMeal(meals: TheMealDbMeal[], weekNumber: number): TheMealDbMeal | null {
  if (meals.length === 0) {
    return null
  }

  return meals[(weekNumber - 1) % meals.length] || null
}

async function buildMealSuggestion(
  id: string,
  weekNumber: number,
  meal: TheMealDbMeal,
  mealType: MealType,
  nutrition: NonNullable<MealsRequestPayload['nutrition']>,
  nutritionCache: Map<string, MealNutritionEstimate>,
  debug: MealApiDebug,
  dayOfWeek?: number
): Promise<MealSuggestion> {
  const ingredients = extractIngredients(meal)
  const nutrients = await estimateMealNutrition(meal, ingredients, mealType, nutrition, nutritionCache, debug)

  return {
    id,
    weekNumber,
    dayOfWeek,
    meal: mealType,
    name: meal.strMeal,
    description: summarizeMeal(meal.strInstructions) || `${meal.strMeal} selected from TheMealDB for your training week.`,
    timingTip: defaultTimingTipByMeal(mealType),
    ingredients,
    caloriesEstimate: nutrients.caloriesEstimate,
    carbs: nutrients.carbs,
    proteins: nutrients.proteins,
    fats: nutrients.fats,
    portugueseIngredients: detectPortugueseBias(meal, ingredients),
    prepTimeMinutes: defaultPrepTimeByMeal(mealType),
    nutritionSource: nutrients.nutritionSource,
  }
}

function extractIngredients(meal: TheMealDbMeal): string[] {
  const ingredients: string[] = []

  for (let index = 1; index <= 20; index++) {
    const ingredient = meal[`strIngredient${index}`]?.trim()
    const measure = meal[`strMeasure${index}`]?.trim()
    if (!ingredient) {
      continue
    }

    ingredients.push(measure ? `${measure} ${ingredient}`.trim() : ingredient)
  }

  return ingredients.slice(0, 10)
}

async function estimateMealNutrition(
  meal: TheMealDbMeal,
  ingredients: string[],
  mealType: MealType,
  nutrition: NonNullable<MealsRequestPayload['nutrition']>,
  nutritionCache: Map<string, MealNutritionEstimate>,
  debug: MealApiDebug
): Promise<MealNutritionEstimate> {
  if (nutritionCache.has(meal.idMeal)) {
    return nutritionCache.get(meal.idMeal)!
  }

  const lowerIngredients = ingredients.join(' ').toLowerCase()
  const defaults = buildDefaultNutritionTargets(mealType, nutrition)

  let carbs = defaults.carbs
  let proteins = defaults.proteins
  let fats = defaults.fats

  if (/(rice|pasta|potato|bread|oat|banana|bean|lentil|chickpea)/.test(lowerIngredients)) {
    carbs += 10
  }
  if (/(chicken|beef|turkey|salmon|tuna|fish|egg|yogurt|milk)/.test(lowerIngredients)) {
    proteins += 8
  }
  if (/(olive oil|avocado|nuts|almond|peanut|coconut|cheese)/.test(lowerIngredients)) {
    fats += 5
  }
  if (mealType === 'post_workout') {
    carbs += 8
    proteins += 5
  }

  const heuristicEstimate = {
    caloriesEstimate: Math.round(carbs * 4 + proteins * 4 + fats * 9),
    carbs,
    proteins,
    fats,
    nutritionSource: 'heuristic' as const,
  }

  const enrichedEstimate = await fetchUsdaNutritionEstimate(meal, ingredients, debug)
  const resolvedEstimate = enrichedEstimate || heuristicEstimate
  nutritionCache.set(meal.idMeal, resolvedEstimate)
  return resolvedEstimate
}

async function fetchUsdaNutritionEstimate(
  meal: TheMealDbMeal,
  ingredients: string[],
  debug: MealApiDebug
): Promise<MealNutritionEstimate | null> {
  const apiKey = process.env.USDA_API_KEY
  if (!apiKey) {
    return null
  }

  const cacheKey = `${meal.idMeal}:${ingredients.join('|')}`
  const cached = readCache(usdaNutritionCache, cacheKey)
  if (cached !== undefined) {
    debug.cache.usdaHits += 1
    return cached
  }

  debug.cache.usdaMisses += 1

  const queries = [
    meal.strMeal,
    ingredients
      .map((ingredient) => ingredient.replace(/^\d+[\d\s/.,-]*\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(' '),
  ].filter(Boolean) as string[]

  for (const query of queries) {
    try {
      const response = await fetch(`${USDA_BASE_URL}?api_key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, pageSize: 3 }),
        cache: 'no-store',
      })

      if (!response.ok) {
        continue
      }

      const payload = (await response.json()) as UsdaSearchResponse
      const topFood = payload.foods?.[0]
      if (!topFood?.foodNutrients?.length) {
        continue
      }

      const caloriesEstimate = Math.round(extractUsdaNutrient(topFood.foodNutrients, ['energy', 'calories'], ['1008']))
      const proteins = Math.round(extractUsdaNutrient(topFood.foodNutrients, ['protein'], ['1003']))
      const carbs = Math.round(extractUsdaNutrient(topFood.foodNutrients, ['carbohydrate'], ['1005']))
      const fats = Math.round(extractUsdaNutrient(topFood.foodNutrients, ['total lipid (fat)', 'fat'], ['1004']))

      if (caloriesEstimate > 0 || carbs > 0 || proteins > 0 || fats > 0) {
        const result = {
          caloriesEstimate: caloriesEstimate || Math.round(carbs * 4 + proteins * 4 + fats * 9),
          carbs,
          proteins,
          fats,
          nutritionSource: 'usda' as const,
        }
        writeCache(usdaNutritionCache, cacheKey, result)
        return result
      }
    } catch {
      continue
    }
  }

  writeCache(usdaNutritionCache, cacheKey, null)
  return null
}

function readCache<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string): T | undefined {
  const entry = cache.get(key)
  if (!entry) {
    return undefined
  }

  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return undefined
  }

  return entry.value
}

function writeCache<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string, value: T): void {
  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
}

function extractUsdaNutrient(
  nutrients: Array<{ nutrientName?: string; nutrientNumber?: string; value?: number }>,
  candidateNames: string[],
  candidateNumbers: string[]
): number {
  const nutrient = nutrients.find((entry) => {
    const normalizedName = entry.nutrientName?.toLowerCase() || ''
    const nutrientNumber = entry.nutrientNumber || ''

    return candidateNames.some((name) => normalizedName.includes(name)) || candidateNumbers.includes(nutrientNumber)
  })

  return typeof nutrient?.value === 'number' && Number.isFinite(nutrient.value) ? nutrient.value : 0
}

function buildDefaultNutritionTargets(
  mealType: MealType,
  nutrition: NonNullable<MealsRequestPayload['nutrition']>
): { carbs: number; proteins: number; fats: number } {
  const dailyCarbTarget = nutrition.dailyCarbGrams || 320
  const dailyProteinTarget = nutrition.dailyProteinGrams || 140
  const dailyFatTarget = nutrition.dailyFatGrams || 75

  return {
    carbs: Math.max(18, Math.round(perMealTarget(dailyCarbTarget, mealType))),
    proteins: Math.max(10, Math.round(perMealTarget(dailyProteinTarget, mealType))),
    fats: Math.max(4, Math.round(perMealTarget(dailyFatTarget, mealType))),
  }
}

function perMealTarget(dailyTarget: number, mealType: MealType): number {
  if (mealType === 'breakfast') return dailyTarget * 0.24
  if (mealType === 'lunch') return dailyTarget * 0.28
  if (mealType === 'dinner') return dailyTarget * 0.27
  if (mealType === 'post_workout') return dailyTarget * 0.13
  return dailyTarget * 0.08
}

function summarizeMeal(instructions?: string): string {
  if (!instructions) {
    return ''
  }

  return instructions.replace(/\s+/g, ' ').trim()
}

function detectPortugueseBias(meal: TheMealDbMeal, ingredients: string[]): boolean {
  const text = `${meal.strArea || ''} ${meal.strCategory || ''} ${ingredients.join(' ')}`.toLowerCase()
  return /(portuguese|sardine|cod|olive oil|chickpea|bean|tomato)/.test(text)
}

function defaultPrepTimeByMeal(mealType: MealType): number {
  if (mealType === 'snack' || mealType === 'post_workout') return 10
  if (mealType === 'breakfast') return 15
  return 30
}

function defaultTimingTipByMeal(mealType: MealType): string {
  if (mealType === 'breakfast') return '2-3h before training: prefer easy-to-digest carbs with moderate protein.'
  if (mealType === 'lunch') return 'Use as a recovery lunch or as the main pre-evening-ride fueling meal.'
  if (mealType === 'dinner') return 'Evening meal should reinforce glycogen recovery and overnight muscle repair.'
  if (mealType === 'post_workout') return 'Take within 30-45 min after training to speed up recovery.'
  return 'Best used as a light top-up 60-90 min before training or as a bridge snack later in the day.'
}
