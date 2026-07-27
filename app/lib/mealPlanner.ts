/**
 * Portuguese Mediterranean-style meal suggestions for cyclists
 */

import type { MealSuggestion } from './types'
import type { DietPreference, UserProfile } from './types'

export interface MealCategory {
  name: string
  suggestions: MealSuggestion[]
}

/**
 * Recipe pools — enough variety to avoid repetition across a 30-week plan
 */
type RecipeBase = Omit<MealSuggestion, 'id' | 'weekNumber' | 'dayOfWeek'>

const BREAKFAST_POOL: RecipeBase[] = [
  {
    meal: 'breakfast',
    name: 'Pão com Mel e Banana',
    description: 'Whole grain bread with Portuguese honey and banana.',
    timingTip: '3-4h before your ride — simple carbs + natural sugars give steady fuel without GI stress.',
    ingredients: ['Pão integral', 'Mel português', 'Banana', 'Azeite extra virgem'],
    caloriesEstimate: 350,
    carbs: 65,
    proteins: 8,
    fats: 6,
    portugueseIngredients: true,
    prepTimeMinutes: 5,
  },
  {
    meal: 'breakfast',
    name: 'Aveia com Frutas Vermelhas e Mel',
    description: 'Rolled oats with mixed berries and honey — slow-release carbs for endurance days.',
    timingTip: '2-3h before moderate sessions; top up with a banana 30 min before if still hungry.',
    ingredients: ['Aveia', 'Mirtilos', 'Morangos', 'Mel', 'Iogurte grego'],
    caloriesEstimate: 380,
    carbs: 68,
    proteins: 12,
    fats: 5,
    portugueseIngredients: false,
    prepTimeMinutes: 10,
  },
  {
    meal: 'breakfast',
    name: 'Tosta de Queijo Serra com Ovo',
    description: 'Sourdough toast with Serra cheese and a soft-boiled egg — protein + carbs combo.',
    timingTip: '3h before a strength or threshold session to prime glycogen and muscle protein synthesis.',
    ingredients: ['Pão de centeio', 'Queijo da Serra', 'Ovo cozido', 'Azeite', 'Tomate cereja'],
    caloriesEstimate: 420,
    carbs: 48,
    proteins: 22,
    fats: 16,
    portugueseIngredients: true,
    prepTimeMinutes: 10,
  },
  {
    meal: 'breakfast',
    name: 'Batido Verde com Proteína',
    description: 'Green smoothie with spinach, banana, whey protein and almond milk.',
    timingTip: 'Ideal 60-90 min before short rides (<90 min) for fast fuel without feeling full.',
    ingredients: ['Espinafres', 'Banana', 'Proteína de whey', 'Leite de amêndoa', 'Mel'],
    caloriesEstimate: 310,
    carbs: 45,
    proteins: 24,
    fats: 4,
    portugueseIngredients: false,
    prepTimeMinutes: 5,
  },
  {
    meal: 'breakfast',
    name: 'Panquecas de Aveia e Banana',
    description: 'Oat and banana pancakes — high-carb, easy to digest.',
    timingTip: '3-4h before a big ride for sustained energy; pair with honey for extra carbs.',
    ingredients: ['Aveia', 'Banana', 'Ovo', 'Mel', 'Canela'],
    caloriesEstimate: 440,
    carbs: 78,
    proteins: 14,
    fats: 8,
    portugueseIngredients: false,
    prepTimeMinutes: 15,
  },
  {
    meal: 'breakfast',
    name: 'Iogurte Grego com Granola e Figos',
    description: 'Thick Greek yogurt with homemade granola and fresh figs.',
    timingTip: '2-3h before recovery or base rides — moderate carbs, high protein without spiking insulin.',
    ingredients: ['Iogurte grego', 'Granola', 'Figos frescos', 'Mel', 'Amêndoas'],
    caloriesEstimate: 360,
    carbs: 52,
    proteins: 18,
    fats: 9,
    portugueseIngredients: true,
    prepTimeMinutes: 5,
  },
  {
    meal: 'breakfast',
    name: 'Ovos Mexidos com Pão Integral e Abacate',
    description: 'Scrambled eggs with whole grain toast and avocado.',
    timingTip: '3h before a strength session; fat + protein supports hormonal balance on heavy training days.',
    ingredients: ['Ovos', 'Pão integral', 'Abacate', 'Sal', 'Pimenta', 'Azeite'],
    caloriesEstimate: 450,
    carbs: 38,
    proteins: 24,
    fats: 22,
    portugueseIngredients: false,
    prepTimeMinutes: 12,
  },
  {
    meal: 'breakfast',
    name: 'Taça de Arroz Doce Saudável',
    description: 'Warm rice pudding with cinnamon and honey — traditional Portuguese.',
    timingTip: '4h before a long ride: slow-digesting rice gives a steady glucose stream throughout your effort.',
    ingredients: ['Arroz carolino', 'Leite', 'Canela', 'Mel', 'Limão (raspa)'],
    caloriesEstimate: 390,
    carbs: 72,
    proteins: 9,
    fats: 6,
    portugueseIngredients: true,
    prepTimeMinutes: 20,
  },
]

const LUNCH_POOL: RecipeBase[] = [
  {
    meal: 'lunch',
    name: 'Arroz de Sardinha com Legumes',
    description: 'Rice with sardines and fresh Mediterranean vegetables.',
    timingTip: '1-2h after a morning ride — high-carb + lean protein accelerates glycogen restoration.',
    ingredients: ['Arroz', 'Sardinas', 'Pimentos', 'Tomates', 'Cebola', 'Alho', 'Azeite'],
    caloriesEstimate: 520,
    carbs: 70,
    proteins: 28,
    fats: 12,
    portugueseIngredients: true,
    prepTimeMinutes: 30,
  },
  {
    meal: 'lunch',
    name: 'Salada de Atum com Grão-de-Bico',
    description: 'Tuna and chickpea salad with olive oil dressing.',
    timingTip: '2-3h before an afternoon session — moderate carbs + lean protein, no heavy fat to slow digestion.',
    ingredients: ['Atum em conserva', 'Grão-de-bico', 'Tomate', 'Pepino', 'Cebola roxa', 'Azeite', 'Limão'],
    caloriesEstimate: 430,
    carbs: 42,
    proteins: 35,
    fats: 10,
    portugueseIngredients: true,
    prepTimeMinutes: 10,
  },
  {
    meal: 'lunch',
    name: 'Massa Integral com Frango e Pesto',
    description: 'Whole grain pasta with grilled chicken and homemade basil pesto.',
    timingTip: '3-4h before an evening ride — your best carb-load lunch to fill glycogen stores fully.',
    ingredients: ['Massa integral', 'Frango grelhado', 'Manjericão', 'Amêndoas', 'Azeite', 'Alho', 'Parmesão'],
    caloriesEstimate: 580,
    carbs: 75,
    proteins: 38,
    fats: 14,
    portugueseIngredients: false,
    prepTimeMinutes: 25,
  },
  {
    meal: 'lunch',
    name: 'Sopa de Feijão Verde com Pão',
    description: 'Green bean and vegetable soup with whole grain bread — light recovery option.',
    timingTip: 'Best on rest days or after easy rides; broth replenishes sodium after sweating.',
    ingredients: ['Feijão verde', 'Cenoura', 'Batata', 'Cebola', 'Azeite', 'Pão integral'],
    caloriesEstimate: 380,
    carbs: 58,
    proteins: 14,
    fats: 8,
    portugueseIngredients: true,
    prepTimeMinutes: 25,
  },
  {
    meal: 'lunch',
    name: 'Prato de Quinoa com Vegetais Assados',
    description: 'Quinoa bowl with roasted Mediterranean vegetables and feta cheese.',
    timingTip: '2h before afternoon training — complete protein in quinoa helps pre-prime muscles for threshold work.',
    ingredients: ['Quinoa', 'Beringela', 'Courgette', 'Pimentos', 'Queijo feta', 'Azeite', 'Orégãos'],
    caloriesEstimate: 460,
    carbs: 55,
    proteins: 18,
    fats: 16,
    portugueseIngredients: false,
    prepTimeMinutes: 30,
  },
  {
    meal: 'lunch',
    name: 'Bacalhau com Batata-Doce Assada',
    description: 'Baked salted cod with sweet potato — classic Portuguese recovery meal.',
    timingTip: "Post-ride within 2h: cod's slow protein + sweet potato carbs support muscle repair over 3-4h.",
    ingredients: ['Bacalhau demolhado', 'Batata-doce', 'Cebola', 'Alho', 'Azeite', 'Salsa'],
    caloriesEstimate: 490,
    carbs: 50,
    proteins: 38,
    fats: 10,
    portugueseIngredients: true,
    prepTimeMinutes: 40,
  },
  {
    meal: 'lunch',
    name: 'Wraps de Frango com Hummus',
    description: 'Wholemeal wraps filled with grilled chicken, hummus and crisp vegetables.',
    timingTip: '2-3h before a tempo or VO2max session — easy to digest, avoids cramps at high intensity.',
    ingredients: ['Wrap integral', 'Frango grelhado', 'Hummus', 'Alface', 'Tomate', 'Pepino'],
    caloriesEstimate: 420,
    carbs: 48,
    proteins: 32,
    fats: 10,
    portugueseIngredients: false,
    prepTimeMinutes: 10,
  },
  {
    meal: 'lunch',
    name: 'Risotto de Cogumelos e Espinafres',
    description: 'Creamy mushroom and spinach risotto — iron-rich vegetarian option.',
    timingTip: 'On rest or easy days: iron from spinach aids oxygen transport — good prep for a hard day tomorrow.',
    ingredients: ['Arroz arbóreo', 'Cogumelos', 'Espinafres', 'Cebola', 'Azeite', 'Parmesão', 'Caldo de legumes'],
    caloriesEstimate: 510,
    carbs: 68,
    proteins: 16,
    fats: 14,
    portugueseIngredients: false,
    prepTimeMinutes: 35,
  },
]

const DINNER_POOL: RecipeBase[] = [
  {
    meal: 'dinner',
    name: 'Bacalhau à Brás com Batata-doce',
    description: 'Shredded cod with sweet potato and egg — traditional Portuguese recovery meal.',
    timingTip: '2-3h before sleep to support overnight muscle repair; protein + carbs before bed aids adaptation.',
    ingredients: ['Bacalhau', 'Batata-doce', 'Cebola', 'Alho', 'Azeite', 'Ovo'],
    caloriesEstimate: 450,
    carbs: 48,
    proteins: 32,
    fats: 14,
    portugueseIngredients: true,
    prepTimeMinutes: 35,
  },
  {
    meal: 'dinner',
    name: 'Frango no Pimento com Azeite',
    description: 'Chicken with bell peppers and olive oil — lean protein for muscle repair.',
    timingTip: '4-5h before an early morning ride so carbs are fully digested; protein overnight aids repair.',
    ingredients: ['Frango', 'Pimentos vermelhos', 'Cebola', 'Alho', 'Azeite extra virgem', 'Arroz integral'],
    caloriesEstimate: 480,
    carbs: 50,
    proteins: 35,
    fats: 12,
    portugueseIngredients: true,
    prepTimeMinutes: 40,
  },
  {
    meal: 'dinner',
    name: 'Salmão Grelhado com Batata Nova',
    description: 'Grilled salmon fillet with new potatoes and green salad.',
    timingTip: 'Night before a long ride: omega-3s reduce inflammation; potatoes fill glycogen for the next morning.',
    ingredients: ['Salmão', 'Batata nova', 'Limão', 'Endro', 'Azeite', 'Alface'],
    caloriesEstimate: 520,
    carbs: 45,
    proteins: 38,
    fats: 18,
    portugueseIngredients: false,
    prepTimeMinutes: 30,
  },
  {
    meal: 'dinner',
    name: 'Caldo Verde com Linguiça Magra',
    description: 'Traditional Portuguese kale soup with lean sausage and cornbread.',
    timingTip: 'Recovery dinner on easy days: warm and easy to digest, replenishes sodium and potassium post-sweat.',
    ingredients: ['Couve galega', 'Batata', 'Linguiça magra', 'Cebola', 'Azeite', 'Broa de milho'],
    caloriesEstimate: 420,
    carbs: 50,
    proteins: 22,
    fats: 14,
    portugueseIngredients: true,
    prepTimeMinutes: 30,
  },
  {
    meal: 'dinner',
    name: 'Lasanha de Legumes Mediterrânica',
    description: 'Vegetable lasagna with courgette, aubergine and ricotta.',
    timingTip: '3-4h before sleep on a build-phase day; carb + protein supports overnight glycogen recovery.',
    ingredients: ['Massa de lasanha', 'Courgette', 'Beringela', 'Ricotta', 'Tomate', 'Manjericão'],
    caloriesEstimate: 490,
    carbs: 60,
    proteins: 24,
    fats: 14,
    portugueseIngredients: false,
    prepTimeMinutes: 50,
  },
  {
    meal: 'dinner',
    name: 'Strogonoff de Frango com Arroz',
    description: 'Light chicken stroganoff with basmati rice — balanced macro meal.',
    timingTip: '2h before sleep on moderate training days; easy to digest, prevents midnight hunger without heavy fat.',
    ingredients: ['Frango', 'Cogumelos', 'Creme vegetal', 'Cebola', 'Páprica', 'Arroz basmati'],
    caloriesEstimate: 500,
    carbs: 58,
    proteins: 33,
    fats: 10,
    portugueseIngredients: false,
    prepTimeMinutes: 30,
  },
  {
    meal: 'dinner',
    name: 'Atum Grelhado com Legumes e Massa',
    description: 'Grilled fresh tuna steak with roasted vegetables and whole grain pasta.',
    timingTip: 'Night before a race or peak session: fresh tuna provides creatine and B12 for neuromuscular performance.',
    ingredients: ['Atum fresco', 'Massa integral', 'Tomate cherry', 'Espinafres', 'Azeite', 'Alcaparras'],
    caloriesEstimate: 530,
    carbs: 55,
    proteins: 42,
    fats: 12,
    portugueseIngredients: true,
    prepTimeMinutes: 25,
  },
  {
    meal: 'dinner',
    name: 'Lentilhas Estufadas com Espinafres',
    description: 'Braised lentils with spinach, tomato and cumin — plant-based iron boost.',
    timingTip: 'On rest days: lentils replenish iron lost through training; combine with vitamin C for absorption.',
    ingredients: ['Lentilhas verdes', 'Espinafres', 'Tomates', 'Cebola', 'Alho', 'Cominho', 'Azeite'],
    caloriesEstimate: 390,
    carbs: 55,
    proteins: 22,
    fats: 7,
    portugueseIngredients: false,
    prepTimeMinutes: 30,
  },
]

const SNACK_POOL: RecipeBase[] = [
  {
    meal: 'snack',
    name: 'Iogurte Grego com Mel e Amêndoas',
    description: 'Greek yogurt with honey and almonds — quick recovery option.',
    timingTip: 'Within 30 min post-training: the 3:1 carb-to-protein ratio is ideal for glycogen replenishment.',
    ingredients: ['Iogurte grego', 'Mel', 'Amêndoas', 'Mel de abelhas português'],
    caloriesEstimate: 280,
    carbs: 35,
    proteins: 18,
    fats: 8,
    portugueseIngredients: true,
    prepTimeMinutes: 3,
  },
  {
    meal: 'snack',
    name: 'Pão Integral com Azeitunas e Queijo Serra',
    description: 'Whole grain bread with olives and Serra cheese.',
    timingTip: '2h before a long ride: dense carbs + salt from olives prime sodium stores for extended sweating.',
    ingredients: ['Pão integral português', 'Azeitunas pretas', 'Queijo da Serra', 'Azeite'],
    caloriesEstimate: 380,
    carbs: 52,
    proteins: 14,
    fats: 14,
    portugueseIngredients: true,
    prepTimeMinutes: 5,
  },
  {
    meal: 'snack',
    name: 'Banana com Manteiga de Amendoim',
    description: 'Banana with natural peanut butter — portable pre-ride fuel.',
    timingTip: '60-90 min before a short ride (<2h): fast carbs + small fat slows glucose spike for steady energy.',
    ingredients: ['Banana', 'Manteiga de amendoim natural'],
    caloriesEstimate: 250,
    carbs: 38,
    proteins: 7,
    fats: 9,
    portugueseIngredients: false,
    prepTimeMinutes: 2,
  },
  {
    meal: 'snack',
    name: 'Mix de Frutos Secos e Frutas Secas',
    description: 'Trail mix with almonds, walnuts, dried mango and dark chocolate chips.',
    timingTip: 'During long rides (3h+): take 40-50g every 45-60 min as real-food alternative to gels.',
    ingredients: ['Amêndoas', 'Nozes', 'Manga seca', 'Chocolate negro 70%', 'Bagas de goji'],
    caloriesEstimate: 320,
    carbs: 32,
    proteins: 8,
    fats: 18,
    portugueseIngredients: false,
    prepTimeMinutes: 2,
  },
  {
    meal: 'snack',
    name: 'Tosta de Ricotta com Tâmaras',
    description: 'Sourdough toast with ricotta cheese and medjool dates.',
    timingTip: '2h before a strength session: dates provide fast carbs, ricotta supplies leucine for protein synthesis.',
    ingredients: ['Pão de fermentação lenta', 'Ricotta', 'Tâmaras Medjool', 'Mel', 'Sal marinho'],
    caloriesEstimate: 300,
    carbs: 44,
    proteins: 12,
    fats: 7,
    portugueseIngredients: false,
    prepTimeMinutes: 5,
  },
  {
    meal: 'snack',
    name: 'Batata-Doce Assada com Requeijão',
    description: 'Mini baked sweet potato with requeijão (Portuguese ricotta) and herbs.',
    timingTip: '2-3h pre-ride: slow-release sweet potato carbs + easy protein avoids GI distress at high intensity.',
    ingredients: ['Batata-doce pequena', 'Requeijão', 'Cebolinho', 'Sal', 'Azeite'],
    caloriesEstimate: 270,
    carbs: 40,
    proteins: 10,
    fats: 7,
    portugueseIngredients: true,
    prepTimeMinutes: 35,
  },
  {
    meal: 'snack',
    name: 'Arroz Doce Frio com Canela',
    description: 'Cold rice pudding portion with cinnamon for quick glycogen top-up.',
    timingTip: '60-90 min before medium sessions when you need easy carbs but little bulk.',
    ingredients: ['Arroz cozido', 'Leite', 'Canela', 'Mel'],
    caloriesEstimate: 290,
    carbs: 52,
    proteins: 8,
    fats: 4,
    portugueseIngredients: true,
    prepTimeMinutes: 4,
  },
  {
    meal: 'snack',
    name: 'Pêra com Queijo Fresco',
    description: 'Pear slices with fresh cheese and a pinch of sea salt.',
    timingTip: 'Great afternoon snack on easy days to keep protein frequent without heavy calories.',
    ingredients: ['Pêra', 'Queijo fresco', 'Sal marinho', 'Nozes'],
    caloriesEstimate: 210,
    carbs: 24,
    proteins: 11,
    fats: 8,
    portugueseIngredients: true,
    prepTimeMinutes: 3,
  },
]

const POST_WORKOUT_POOL: RecipeBase[] = [
  {
    meal: 'post_workout',
    name: 'Batido de Recuperação com Banana',
    description: 'Whey shake with banana and oat milk for rapid recovery.',
    timingTip: 'Within 30 minutes after hard sessions to accelerate glycogen restoration and muscle repair.',
    ingredients: ['Proteína whey', 'Banana', 'Leite de aveia', 'Mel', 'Canela'],
    caloriesEstimate: 340,
    carbs: 48,
    proteins: 26,
    fats: 5,
    portugueseIngredients: false,
    prepTimeMinutes: 4,
  },
  {
    meal: 'post_workout',
    name: 'Leite com Chocolate e Tosta Integral',
    description: 'Chocolate milk paired with whole grain toast for a classic 3:1 refuel.',
    timingTip: 'Best immediately after endurance rides longer than 90 minutes.',
    ingredients: ['Leite com chocolate', 'Pão integral', 'Mel'],
    caloriesEstimate: 360,
    carbs: 56,
    proteins: 18,
    fats: 7,
    portugueseIngredients: true,
    prepTimeMinutes: 3,
  },
  {
    meal: 'post_workout',
    name: 'Iogurte Grego com Granola e Kiwi',
    description: 'Greek yogurt bowl with granola and kiwi for protein plus vitamin C.',
    timingTip: 'Ideal after threshold or VO2 sessions when appetite is low.',
    ingredients: ['Iogurte grego', 'Granola', 'Kiwi', 'Mel'],
    caloriesEstimate: 330,
    carbs: 44,
    proteins: 21,
    fats: 8,
    portugueseIngredients: false,
    prepTimeMinutes: 4,
  },
]

type MealGenerationOptions = {
  profile?: Partial<UserProfile> | null
}

type ApiMealResponse = {
  meals?: MealSuggestion[]
  debug?: {
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
}

/**
 * Generate a rotating set of meal suggestions across a training plan.
 * Recipes cycle through their pools so every week gets a different recipe.
 */
export function generateMealSuggestions(durationWeeks: number): MealSuggestion[] {
  const suggestions: MealSuggestion[] = []

  for (let weekNumber = 1; weekNumber <= durationWeeks; weekNumber++) {
    const bIdx = (weekNumber - 1) % BREAKFAST_POOL.length
    const lIdx = (weekNumber - 1) % LUNCH_POOL.length
    const sIdx = (weekNumber - 1) % SNACK_POOL.length
    const dIdx = (weekNumber - 1) % DINNER_POOL.length
    const pIdx = (weekNumber - 1) % POST_WORKOUT_POOL.length
    const snack2Idx = (weekNumber + 2) % SNACK_POOL.length
    // Carb-load snack offset by half the pool so it differs from the regular snack
    const cIdx = (Math.floor(SNACK_POOL.length / 2) + weekNumber - 1) % SNACK_POOL.length

    suggestions.push({ id: `meal_${weekNumber}_breakfast`, weekNumber, ...BREAKFAST_POOL[bIdx] })
    suggestions.push({ id: `meal_${weekNumber}_lunch`, weekNumber, ...LUNCH_POOL[lIdx] })
    suggestions.push({ id: `meal_${weekNumber}_snack`, weekNumber, ...SNACK_POOL[sIdx] })
    suggestions.push({ id: `meal_${weekNumber}_post_workout`, weekNumber, dayOfWeek: 2, ...POST_WORKOUT_POOL[pIdx] })
    suggestions.push({ id: `meal_${weekNumber}_second_snack`, weekNumber, dayOfWeek: 4, ...SNACK_POOL[snack2Idx] })
    suggestions.push({ id: `meal_${weekNumber}_dinner`, weekNumber, ...DINNER_POOL[dIdx] })
    suggestions.push({ id: `meal_${weekNumber}_carb_load`, weekNumber, dayOfWeek: 6, ...SNACK_POOL[cIdx] })
  }

  return suggestions
}

/**
 * Try the free recipe provider route first, then fallback to local meals.
 */
export async function generateMealSuggestionsWithApi(
  durationWeeks: number,
  options: MealGenerationOptions = {}
): Promise<MealSuggestion[]> {
  const fallback = generateMealSuggestions(durationWeeks)

  try {
    const response = await fetch('/api/meals/suggestions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        durationWeeks,
        nutrition: buildApiNutritionRequest(options.profile),
      }),
    })

    if (!response.ok) {
      return fallback
    }

    const payload = (await response.json()) as ApiMealResponse
    const apiMeals = payload.meals || []

    if (payload.debug) {
      console.info('Meals API debug', payload.debug)
    }

    // Require enough meals to cover all weeks; otherwise fallback to deterministic local plan.
    if (apiMeals.length < durationWeeks * 6) {
      return fallback
    }

    return apiMeals
  } catch (error) {
    console.warn('Meal API unavailable. Falling back to local meal pool.', { error })
    return fallback
  }
}

function buildApiNutritionRequest(profile?: Partial<UserProfile> | null) {
  return {
    dietPreference: normalizeDietPreference(profile?.dietPreference),
    dailyCalories: safeNumber(profile?.dailyCalorieTarget),
    dailyProteinGrams: safeNumber(profile?.dailyProteinTargetGrams),
    dailyCarbGrams: safeNumber(profile?.dailyCarbTargetGrams),
    dailyFatGrams: safeNumber(profile?.dailyFatTargetGrams),
  }
}

function normalizeDietPreference(dietPreference?: DietPreference): DietPreference {
  if (!dietPreference) {
    return 'mediterranean'
  }

  return dietPreference
}

function safeNumber(value?: number): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return undefined
  }

  return Math.round(value)
}

function defaultTimingTipByMeal(meal: MealSuggestion['meal']): string {
  if (meal === 'breakfast') return '2-3h before training: prioritize easy-to-digest carbohydrates and moderate protein.'
  if (meal === 'lunch') return 'Post-morning ride or pre-evening ride: keep carbs high to sustain glycogen availability.'
  if (meal === 'dinner') return 'Evening recovery meal: combine carbs and protein for overnight adaptation.'
  if (meal === 'post_workout') return 'Consume within 30 minutes after training for faster glycogen and muscle recovery.'
  return 'Use as a pre-ride top-up (60-90 min) or during long rides when additional carbs are needed.'
}

/**
 * Get nutritional advice based on training phase
 */
export function getNutritionAdvice(phase: string, injuryRestrictions: string[]): string[] {
  const adviceMap: Record<string, string[]> = {
    base: [
      'Focus on consistent carbohydrate intake (6-8g per kg bodyweight daily)',
      'Include plenty of anti-inflammatory Mediterranean foods - olives, olive oil, fish',
      'Hydrate well with water + electrolytes during training',
      'Eat protein with every meal for muscle recovery (1.2-1.6g per kg)',
    ],
    build: [
      'Increase carbohydrate timing around workouts',
      'Pre-workout: 1-3g carbs per kg body weight 1-3 hours before',
      'Post-workout: combine carbs + protein within 30 minutes',
      'Portuguese seafood is excellent for micronutrients and lean protein',
    ],
    peak: [
      'Maintain race-day nutrition practice',
      'Ensure adequate sleep and recovery nutrition',
      'Portuguese fish and olive oil combo optimizes inflammation response',
      'Stay consistent - no major dietary changes before events',
    ],
    recovery: [
      'Reduce overall calorie intake slightly',
      'Focus on whole grains, vegetables, and lean proteins',
      'Mediterranean diet naturally supports recovery',
      'Include fermented foods and probiotics for gut health',
    ],
  }

  const baseAdvice = adviceMap[phase] || adviceMap['base']

  if (injuryRestrictions.includes('knee')) {
    baseAdvice.push('Anti-inflammatory foods: turmeric, ginger, omega-3 fish like sardines')
  }
  if (injuryRestrictions.includes('lower_back')) {
    baseAdvice.push('Maintain strong core - include calcium and magnesium rich foods')
  }

  return baseAdvice
}

/**
 * Generate hydration strategy based on training session
 */
export function generateHydrationStrategy(
  sessionType: string,
  durationMinutes: number,
  bodyWeightKg: number
): { fluidPerHour: number; electrolytes: string; recommendations: string[] } {
  const baseFluidPerHour = bodyWeightKg * 6 // 6ml per kg bodyweight
  const maxFluidPerHour = Math.min(baseFluidPerHour, 1000) // max 1L per hour

  const sessionIntensityMap: Record<string, number> = {
    recovery: 0.7,
    endurance: 0.8,
    tempo: 0.9,
    threshold: 1.0,
    vo2max: 0.95,
    anaerobic: 0.8, // shorter, intense
    strength: 0.6,
  }

  const intensityFactor = sessionIntensityMap[sessionType] || 0.8
  const fluidPerHour = Math.round(maxFluidPerHour * intensityFactor)

  const recommendations: string[] = []

  if (durationMinutes < 60) {
    recommendations.push('Water only for sessions under 1 hour')
  } else if (durationMinutes < 120) {
    recommendations.push(`Consume ${fluidPerHour}ml per hour of 6% carbohydrate drink`)
  } else {
    recommendations.push(`Consume ${fluidPerHour}ml per hour of 6-8% carbohydrate drink`)
    recommendations.push('Include sodium: 300-600mg per liter of fluid')
  }

  return {
    fluidPerHour,
    electrolytes: durationMinutes > 90 ? 'Sports drink with electrolytes' : 'Water',
    recommendations,
  }
}
