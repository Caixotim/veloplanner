'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import styles from './DailyNutritionGuide.module.scss'
import type { MealSuggestion, SessionType, TrainingPlan, TrainingSession } from '@/app/lib/types'
import { PrinterIcon } from './icons/AppIcons'

interface DailyNutritionGuideProps {
  plan: TrainingPlan
  meals: MealSuggestion[]
}

type NutritionWindow = {
  id: string
  label: string
  icon: string
  timing: string
  advice: string
  why: string
  advantage: string
  keyFoods: string[]
  mealCategory?: MealSuggestion['meal']
}

const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  threshold: 'Threshold',
  vo2max: 'VO2 Max',
  anaerobic: 'Anaerobic',
  tempo: 'Tempo',
  endurance: 'Endurance',
  strength: 'Strength',
  recovery: 'Recovery',
}

const SESSION_TYPE_ICONS: Record<SessionType, string> = {
  threshold: '⚡',
  vo2max: '🔥',
  anaerobic: '💪',
  tempo: '🚴',
  endurance: '🛣️',
  strength: '🏋️',
  recovery: '☁️',
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getSessionForDate(plan: TrainingPlan, targetDate: Date): TrainingSession | null {
  const key = formatDateKey(targetDate)
  for (const week of plan.weeks) {
    for (const session of week.sessions) {
      if (formatDateKey(new Date(session.date)) === key) return session
    }
  }
  return null
}

function isHardSession(type: SessionType): boolean {
  return type === 'threshold' || type === 'vo2max' || type === 'anaerobic'
}

function buildNutritionWindows(
  todaySession: TrainingSession | null,
  tomorrowSession: TrainingSession | null
): NutritionWindow[] {
  const windows: NutritionWindow[] = []
  const isRestDay = !todaySession || (todaySession.type === 'recovery' && todaySession.duration === 0)
  const sessionType = todaySession?.type ?? 'recovery'
  const isHard = !isRestDay && isHardSession(sessionType)
  const isLong = (todaySession?.duration ?? 0) >= 75

  if (isRestDay) {
    windows.push({
      id: 'rest',
      label: 'Rest Day Eating',
      icon: '🛌',
      timing: 'All day',
      advice: "Eat balanced meals focused on whole foods and protein. Don't skip meals or restrict — your body is repairing and adapting from previous sessions.",
      why: 'Training adaptation happens during rest. Protein (1.6–2g/kg/day) supplies amino acids for muscle protein synthesis. Carbohydrates replenish glycogen stores so you arrive at the next session fully fuelled.',
      advantage: 'Consistent fuelling on rest days accelerates recovery and ensures each next session starts from a replenished baseline — compounding adaptation over weeks.',
      keyFoods: ['Lean chicken or fish', 'Rice, pasta or potato', 'Vegetables', 'Greek yogurt', 'Eggs', 'Nuts'],
    })
  } else if (isHard) {
    windows.push({
      id: 'pre',
      label: 'Before Your Session',
      icon: '⏰',
      timing: '2–3 hours before',
      advice: `Eat a carb-dominant meal 2–3 hours before your ${SESSION_TYPE_LABELS[sessionType]} session. Keep fat and fibre low so digestion is complete. A banana or energy bar 30–45 min before is fine if you're still hungry.`,
      why: 'Threshold and VO2 work runs almost entirely on glycogen. Even partial depletion raises RPE, limits sustainable power, and degrades interval quality. Glycogen is synthesised slowly — you cannot top it up 20 minutes before a session.',
      advantage: 'Arriving glycogen-replete is the highest-leverage preparation for quality sessions. Studies consistently show 3–8% higher peak power and significantly better interval repeatability when carbohydrate availability is adequate.',
      keyFoods: ['White toast with jam', 'Porridge / oats', 'Banana', 'Rice + lean protein', 'Energy bar'],
      mealCategory: 'breakfast',
    })

    if (isLong) {
      windows.push({
        id: 'during',
        label: 'During Your Session',
        icon: '🚴',
        timing: `Every 20 min (session is ${todaySession!.duration} min)`,
        advice: 'Take 30–60g of carbohydrates per hour from the first 30 minutes. Gel, banana, chews, or sports drink all work. Drink 400–600ml per hour in normal conditions.',
        why: 'Liver glycogen lasts roughly 90 minutes at hard intensities. Once depleted, power drops sharply and perceived effort climbs dramatically. Regular fuelling maintains blood glucose, spares glycogen, and sustains interval quality.',
        advantage: 'Consistent mid-session fuelling delays fatigue onset by 30–60 minutes, maintains neuromuscular efficiency, and reduces the post-session cortisol spike — allowing faster recovery into the next hard session.',
        keyFoods: ['Energy gels', 'Banana', 'Chews', 'Rice cakes', 'Isotonic sports drink'],
      })
    }

    windows.push({
      id: 'post',
      label: 'After Your Session',
      icon: '⚡',
      timing: 'Within 30 minutes',
      advice: 'Aim for 20–30g of protein + 60–80g of fast carbs within 30 minutes. A recovery shake and banana is ideal. If a full meal fits this window, prioritise protein + carbs over fat.',
      why: 'Muscle protein synthesis peaks in the first 30–60 minutes post-training. Protein in this window drives MPS 3× higher than the same intake outside it. Carbohydrates restore glycogen and reduce cortisol-driven breakdown.',
      advantage: 'Early post-workout recovery nutrition sets the tone for the full 24-hour adaptation window. Athletes who consistently fuel within 30 minutes show faster glycogen restoration and greater long-term strength and power gains.',
      keyFoods: ['Whey or plant protein shake', 'Banana or fruit', 'Chocolate milk', 'Rice + chicken', 'Yogurt + granola'],
      mealCategory: 'post_workout',
    })

    windows.push({
      id: 'day',
      label: 'Rest of Today',
      icon: '🥗',
      timing: 'Lunch and dinner',
      advice: "Continue eating well through the day. Don't restrict post-training. Include protein in every meal and maintain carbohydrate intake to support overnight glycogen synthesis.",
      why: 'Full glycogen recovery after hard training takes 24–48 hours and depends on total carbohydrate intake across the day — not just the post-ride window. Restricting afternoon and evening eating slows recovery and blunts adaptation.',
      advantage: 'Consistent fuelling across the full day maintains anabolic hormone levels, sustains immune function under training load, and ensures you arrive at the next session fully prepared rather than partially recovered.',
      keyFoods: ['Salmon or chicken', 'Pasta, rice or sweet potato', 'Vegetables', 'Legumes', 'Greek yogurt'],
      mealCategory: 'lunch',
    })
  } else if (sessionType === 'endurance') {
    windows.push({
      id: 'pre',
      label: 'Before Your Session',
      icon: '⏰',
      timing: '2–3 hours before',
      advice: 'A normal balanced breakfast 2–3 hours before is fine. Include carbs and moderate protein. You can tolerate some fat and fibre with endurance sessions compared to intensity work.',
      why: "Zone 2 endurance uses fat oxidation alongside glycogen. You don't need to hyper-carb-load, but arriving glycogen-depleted still raises RPE earlier and compresses the full aerobic training stimulus you're aiming for.",
      advantage: "Endurance rides in a fuelled state develop fat oxidation capacity more effectively than 'fasted' training for most trained athletes. Starting well-fed extends the aerobic zone time available and yields more total stimulus per session.",
      keyFoods: ['Oats with fruit', 'Eggs on toast', 'Banana + nut butter', 'Smoothie'],
      mealCategory: 'breakfast',
    })

    if (isLong) {
      windows.push({
        id: 'during',
        label: 'During Your Session',
        icon: '🚴',
        timing: `From 45 min in (session is ${todaySession!.duration} min)`,
        advice: `For ${todaySession!.duration}-minute rides, aim for 40–60g carbs/hour from the 45-minute mark. Don't wait until you feel tired — fuelling is proactive, not reactive.`,
        why: 'Long aerobic rides deplete glycogen gradually. Fuelling from early in the ride preserves glycogen stores, maintains fat oxidation efficiency, and ensures full recovery by the next session.',
        advantage: 'Well-fuelled long rides accumulate more quality Zone 2 time and produce a stronger endurance adaptation signal. Arriving home glycogen-replete shortens recovery time and allows better quality in the next 24 hours.',
        keyFoods: ['Banana', 'Rice cakes', 'Energy bars', 'Medjool dates', 'Isotonic drink'],
      })
    }

    windows.push({
      id: 'post',
      label: 'After Your Session',
      icon: '⚡',
      timing: 'Within 45 minutes',
      advice: "Protein + carbs post-ride. A full meal is ideal if appetite allows. Don't skip this window on long rides — the carbohydrate demand is high and appetite sometimes suppresses the instinct to eat.",
      why: 'Endurance rides create significant glycogen depletion and moderate muscle stress. Post-ride fuelling initiates glycogen synthesis and reduces the cortisol-driven breakdown window, consolidating the aerobic adaptations from the session.',
      advantage: 'Post-ride fuelling within 45 minutes reduces delayed-onset muscle soreness, accelerates glycogen restoration by 2×, and maintains hormonal balance — allowing you to back up with quality training sooner.',
      keyFoods: ['Chocolate milk', 'Rice + chicken', 'Protein smoothie', 'Greek yogurt + fruit'],
      mealCategory: 'post_workout',
    })
  } else if (sessionType === 'strength') {
    windows.push({
      id: 'pre',
      label: 'Before Your Session',
      icon: '⏰',
      timing: '1.5–2 hours before',
      advice: 'Moderate protein + carbs 1.5–2 hours before. Avoid heavy fat or fibre immediately before. Eggs on toast, yogurt with oats, or a protein smoothie all work well.',
      why: 'Strength training creates significant muscle protein breakdown. Pre-training protein provides amino acids during the session, and early carbohydrate raises insulin slightly — which is anabolic. Arriving in a fed state improves motor unit recruitment and early-set strength output.',
      advantage: 'Pre-strength session protein increases net muscle protein balance by 25–40% compared to training fasted. This compounds over weeks into measurable strength and power gains that directly translate to cycling performance.',
      keyFoods: ['Eggs on toast', 'Greek yogurt + oats', 'Protein smoothie', 'Chicken wrap'],
      mealCategory: 'breakfast',
    })

    windows.push({
      id: 'post',
      label: 'After Your Session',
      icon: '⚡',
      timing: 'Within 30 minutes',
      advice: '20–40g protein as soon as possible after the session. Add carbs to support glycogen and amplify the anabolic response.',
      why: 'Muscle protein synthesis (MPS) is maximally elevated for 2–4 hours post-strength training. Protein in this window drives MPS 3× higher than the same protein outside it. This is the highest-leverage nutrition window for off-bike cycling strength work.',
      advantage: 'Consistent post-strength fuelling over a training block produces significantly greater increases in peak power and neuromuscular output — directly benefiting sprint and attack capacity on the bike.',
      keyFoods: ['Whey or plant protein', 'Greek yogurt', 'Cottage cheese', 'Eggs + toast'],
      mealCategory: 'post_workout',
    })
  } else {
    // tempo or non-zero recovery
    windows.push({
      id: 'general',
      label: "Today's Nutrition",
      icon: '🥗',
      timing: 'Across the day',
      advice: 'Eat balanced meals. Include carbs before and after your session. Tempo and recovery sessions do not demand special fuelling, but consistent intake throughout the day supports ongoing adaptation.',
      why: 'Even moderate-intensity sessions create glycogen demand and some muscle stress. Consistent carbohydrate intake across the day ensures glycogen is rebuilt between sessions, which compounds into better training quality week to week.',
      advantage: 'Consistent daily fuelling — even on lighter days — maintains hormonal balance, immune function, and energy availability, supporting the higher-quality hard sessions that drive fitness gains.',
      keyFoods: ['Whole grain bread', 'Rice or pasta', 'Lean protein', 'Fruit', 'Vegetables'],
      mealCategory: 'lunch',
    })
  }

  // Tonight prep for tomorrow if it's a hard or long session
  const tomorrowType = tomorrowSession?.type
  if (tomorrowType && isHardSession(tomorrowType)) {
    windows.push({
      id: 'tonight',
      label: 'Tonight — Prepare for Tomorrow',
      icon: '🌙',
      timing: 'Evening meal',
      advice: tomorrowSession?.preDayNutritionTip
        ? tomorrowSession.preDayNutritionTip
        : `Tomorrow is a ${SESSION_TYPE_LABELS[tomorrowType]} session. Make dinner carb-dominant — pasta, rice, or bread with lean protein. Keep fat moderate and avoid high-fibre foods late in the evening.`,
      why: 'Muscle and liver glycogen synthesis takes 8–24 hours when carbohydrate availability is adequate. A carb-rich evening meal before a hard session is one of the most consistent performance-elevating interventions in applied sports nutrition.',
      advantage: 'Athletes who carb-load the evening before intense sessions consistently achieve 5–10% more total work done and maintain higher average power across the full session compared to those who eat normally.',
      keyFoods: ['Pasta + tomato sauce + chicken', 'White rice + salmon', 'Bread + lean protein', 'Jacket potato'],
      mealCategory: 'dinner',
    })
  } else if (tomorrowSession && tomorrowType === 'endurance' && (tomorrowSession.duration ?? 0) >= 90) {
    windows.push({
      id: 'tonight',
      label: 'Tonight — Long Ride Tomorrow',
      icon: '🌙',
      timing: 'Evening meal',
      advice: "Tomorrow is a long endurance ride. Eat a solid dinner with good carbohydrate content. You don't need to carb-load heavily, but don't under-eat either.",
      why: 'Long aerobic rides draw on both fat and glycogen. Starting with full glycogen allows the ride to use the full aerobic training stimulus rather than becoming limited by substrate availability in the later stages.',
      advantage: 'A well-fuelled long ride yields more Zone 2 minutes, a stronger endurance adaptation signal, and better fat oxidation efficiency — all of which compound into measurable endurance gains.',
      keyFoods: ['Rice or pasta', 'Lean protein', 'Moderate vegetables', 'Bread'],
      mealCategory: 'dinner',
    })
  }

  return windows
}

export function DailyNutritionGuide({ plan, meals }: DailyNutritionGuideProps) {
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  const todaySession = getSessionForDate(plan, today)
  const tomorrowSession = getSessionForDate(plan, tomorrow)

  const nutritionWindows = buildNutritionWindows(todaySession, tomorrowSession)
  const isRestDay = !todaySession || (todaySession.type === 'recovery' && todaySession.duration === 0)
  const outOfPlanRange = !todaySession && plan.weeks.length > 0

  const relevantMeals = React.useMemo(() => {
    const categories = new Set(nutritionWindows.map((w) => w.mealCategory).filter(Boolean))
    const matched = meals.filter((m) => categories.has(m.meal))
    if (matched.length > 0) return matched.slice(0, 4)
    return meals.slice(0, 3)
  }, [meals, nutritionWindows])

  const [activeMealDetails, setActiveMealDetails] = React.useState<MealSuggestion | null>(null)
  const [completedSteps, setCompletedSteps] = React.useState<Set<string>>(new Set())
  const [portalReady, setPortalReady] = React.useState(false)

  React.useEffect(() => {
    setPortalReady(true)
  }, [])

  React.useEffect(() => {
    if (!portalReady || typeof document === 'undefined') {
      return
    }

    if (activeMealDetails) {
      const previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = previousOverflow
      }
    }

    return
  }, [activeMealDetails, portalReady])

  const toggleStepDone = (stepKey: string) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(stepKey)) {
        next.delete(stepKey)
      } else {
        next.add(stepKey)
      }
      return next
    })
  }

  const resetMealSteps = (mealId: string) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev)
      for (const key of Array.from(next)) {
        if (key.startsWith(`${mealId}-step-`)) {
          next.delete(key)
        }
      }
      return next
    })
  }

  const printMeal = (meal: MealSuggestion) => {
    if (typeof window === 'undefined') {
      return
    }

    const popup = window.open('', '_blank', 'width=900,height=700')
    if (!popup) {
      return
    }

    const escapedName = escapeHtml(meal.name)
    const escapedTip = escapeHtml(meal.timingTip)
    const escapedIngredients = meal.ingredients.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
    const escapedMethodSteps = toInstructionSteps(meal.description)
      .map((step, index) => `<li><span class="stepIndex">${index + 1}</span><span class="stepText">${escapeHtml(step)}</span></li>`)
      .join('')

    popup.document.write(`
      <html>
        <head>
          <title>Meal Card - ${escapedName}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              margin: 20px;
              color: #1f2f3f;
              line-height: 1.45;
            }
            .header {
              margin-bottom: 14px;
              border-bottom: 1px solid #d6e4f0;
              padding-bottom: 8px;
            }
            h1 {
              margin: 0;
              font-size: 26px;
              color: #163b5c;
            }
            .meta {
              margin-top: 6px;
              color: #4c5f74;
              font-size: 14px;
            }
            .layout {
              display: grid;
              grid-template-columns: 240px 1fr;
              gap: 16px;
              align-items: start;
            }
            .asideCard,
            .mainCard {
              border: 1px solid #d7e4f1;
              border-radius: 10px;
              background: #f9fcff;
              padding: 12px;
              margin-bottom: 12px;
            }
            .asideCard h2,
            .mainCard h2 {
              margin: 0 0 8px;
              font-size: 13px;
              letter-spacing: 0.06em;
              text-transform: uppercase;
              color: #275170;
            }
            .macros {
              display: flex;
              flex-wrap: wrap;
              gap: 6px;
            }
            .chip {
              border: 1px solid #c2d8ee;
              border-radius: 999px;
              padding: 4px 9px;
              font-weight: 700;
              color: #274466;
              background: #eaf3ff;
              font-size: 12px;
            }
            .timing {
              margin: 0;
              font-size: 14px;
              color: #36536d;
              line-height: 1.5;
            }
            .ingredients {
              margin: 0;
              padding-left: 18px;
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 6px 14px;
            }
            .ingredients li {
              color: #2f4a60;
              font-size: 14px;
            }
            .steps {
              margin: 0;
              padding-left: 0;
              list-style: none;
              display: flex;
              flex-direction: column;
              gap: 8px;
            }
            .steps li {
              border: 1px solid #dbe6f1;
              border-radius: 8px;
              background: #ffffff;
              display: grid;
              grid-template-columns: 28px 1fr;
              gap: 8px;
              padding: 8px;
              align-items: start;
            }
            .stepIndex {
              width: 24px;
              height: 24px;
              border-radius: 999px;
              border: 1px solid #a9c5e2;
              background: #eef6ff;
              color: #214f79;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              font-size: 12px;
              font-weight: 800;
              line-height: 1;
            }
            .stepText {
              color: #2f4a60;
              font-size: 14px;
              line-height: 1.55;
            }
            @media print {
              body { margin: 10mm; }
              .layout { grid-template-columns: 220px 1fr; }
            }
          </style>
        </head>
        <body>
          <section class="header">
            <h1>${escapedName}</h1>
            <p class="meta">Prep time: ${meal.prepTimeMinutes} min</p>
          </section>

          <section class="layout">
            <aside>
              <article class="asideCard">
                <h2>Nutrition</h2>
                <div class="macros">
                  <span class="chip">${meal.caloriesEstimate} kcal</span>
                  <span class="chip">Carbs ${meal.carbs}g</span>
                  <span class="chip">Protein ${meal.proteins}g</span>
                  <span class="chip">Fat ${meal.fats}g</span>
                </div>
              </article>

              <article class="asideCard">
                <h2>Timing Tip</h2>
                <p class="timing">${escapedTip}</p>
              </article>
            </aside>

            <main>
              <article class="mainCard">
                <h2>Ingredients</h2>
                <ul class="ingredients">${escapedIngredients}</ul>
              </article>

              <article class="mainCard">
                <h2>Method</h2>
                <ol class="steps">${escapedMethodSteps}</ol>
              </article>
            </main>
          </section>
        </body>
      </html>
    `)
    popup.document.close()
    popup.focus()
    popup.print()
    popup.close()
  }

  const dateLabel = today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>What to Eat Today</h2>
          <p className={styles.dateLabel}>{dateLabel}</p>
        </div>
      </div>

      {/* Today's session context */}
      <div className={styles.sessionRow}>
        <div className={styles.sessionCard}>
          {outOfPlanRange ? (
            <>
              <span className={styles.sessionIcon}>📅</span>
              <div>
                <strong>Today is outside the plan window</strong>
                <p>General balanced eating applies</p>
              </div>
            </>
          ) : isRestDay ? (
            <>
              <span className={styles.sessionIcon}>🛌</span>
              <div>
                <strong>Rest day</strong>
                <p>No training scheduled</p>
              </div>
            </>
          ) : todaySession ? (
            <>
              <span className={styles.sessionIcon}>{SESSION_TYPE_ICONS[todaySession.type]}</span>
              <div>
                <strong>{SESSION_TYPE_LABELS[todaySession.type]} · {todaySession.duration} min</strong>
                <p>{todaySession.focus?.slice(0, 2).join(' · ')}</p>
              </div>
            </>
          ) : null}
        </div>

        {tomorrowSession && (
          <div className={styles.tomorrowBadge}>
            <span>Tomorrow:</span>
            <span>{SESSION_TYPE_ICONS[tomorrowSession.type]}</span>
            <span>{SESSION_TYPE_LABELS[tomorrowSession.type]}</span>
            <span className={styles.tomorrowDuration}>{tomorrowSession.duration} min</span>
          </div>
        )}
      </div>

      {/* Nutrition windows */}
      <div className={styles.windowsGrid}>
        {nutritionWindows.map((window) => (
          <article key={window.id} className={styles.windowCard}>
            <div className={styles.windowHeader}>
              <span className={styles.windowIcon}>{window.icon}</span>
              <div className={styles.windowMeta}>
                <h3 className={styles.windowLabel}>{window.label}</h3>
                <span className={styles.windowTiming}>{window.timing}</span>
              </div>
            </div>

            <p className={styles.windowAdvice}>{window.advice}</p>

            <details className={styles.whyDetails}>
              <summary className={styles.whySummary}>
                <span className={styles.whySummaryIcon}>▸</span> Why this matters
              </summary>
              <div className={styles.whyBody}>
                <div className={styles.whySection}>
                  <span className={styles.whySectionLabel}>The science</span>
                  <p>{window.why}</p>
                </div>
                <div className={styles.whySection}>
                  <span className={styles.whySectionLabel}>The advantage</span>
                  <p>{window.advantage}</p>
                </div>
              </div>
            </details>

            <div className={styles.keyFoods}>
              {window.keyFoods.map((food) => (
                <span key={food} className={styles.foodChip}>
                  {food}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>

      {/* Suggested meals from plan */}
      {relevantMeals.length > 0 && (
        <section className={styles.suggestedMeals}>
          <h3 className={styles.suggestedMealsTitle}>Suggested Meals from Your Plan</h3>
          <div className={styles.mealsRow}>
            {relevantMeals.map((meal) => {
              return (
                <div
                  key={meal.id}
                  className={styles.mealTile}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveMealDetails(meal)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setActiveMealDetails(meal)
                    }
                  }}
                  aria-label={`Open details for ${meal.name}`}
                >
                  <div className={styles.mealTileTop}>
                    <strong className={styles.mealTileName}>{meal.name}</strong>
                    <div className={styles.mealTileMeta}>
                      {meal.nutritionSource && (
                        <span className={meal.nutritionSource === 'usda' ? styles.sourceBadgeUsda : styles.sourceBadgeHeuristic}>
                          {meal.nutritionSource === 'usda' ? 'USDA macros' : 'Estimated macros'}
                        </span>
                      )}
                      <span className={styles.mealTileTime}>⏱️ {meal.prepTimeMinutes} min</span>
                    </div>
                  </div>
                  <p className={styles.mealTileDesc}>
                    {meal.description}
                  </p>
                  {meal.timingTip && (
                    <p className={styles.mealTileTip}>
                      🕐 {meal.timingTip}
                    </p>
                  )}
                  <div className={styles.mealTileActions}>
                    <button
                      className={styles.mealActionBtn}
                      onClick={(event) => {
                        event.stopPropagation()
                        printMeal(meal)
                      }}
                      type="button"
                    >
                      Print
                    </button>
                  </div>
                  <div className={styles.mealTileMacros}>
                    <span>{meal.caloriesEstimate} kcal</span>
                    <span>C {meal.carbs}g</span>
                    <span>P {meal.proteins}g</span>
                    <span>F {meal.fats}g</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {portalReady && activeMealDetails && createPortal(
        <div className={styles.mealModalBackdrop} onClick={() => setActiveMealDetails(null)}>
          <div className={styles.mealModal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.mealModalHeader}>
              <div>
                <h4>{activeMealDetails.name}</h4>
                <p>Prep time: {activeMealDetails.prepTimeMinutes} min</p>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setActiveMealDetails(null)} type="button" aria-label="Close meal details">
                Close
              </button>
            </div>

            <div className={styles.mealModalLayout}>
              <aside className={styles.mealModalAside}>
                <section className={styles.mealQuickCard}>
                  <h5>Nutrition</h5>
                  <div className={styles.mealTileMacros}>
                    <span>{activeMealDetails.caloriesEstimate} kcal</span>
                    <span>C {activeMealDetails.carbs}g</span>
                    <span>P {activeMealDetails.proteins}g</span>
                    <span>F {activeMealDetails.fats}g</span>
                  </div>
                </section>
                <section className={styles.mealQuickCard}>
                  <h5>Timing Tip</h5>
                  <p>{activeMealDetails.timingTip}</p>
                </section>
              </aside>

              <div className={styles.mealModalMain}>
                <section className={styles.mealModalBody}>
                  <h5>Ingredients</h5>
                  <ul className={styles.ingredientsList}>
                    {activeMealDetails.ingredients.map((ingredient) => (
                      <li key={ingredient}>{ingredient}</li>
                    ))}
                  </ul>
                </section>

                <section className={styles.mealModalBody}>
                  <h5>Method</h5>
                  <ol className={styles.methodSteps}>
                    {toInstructionSteps(activeMealDetails.description).map((step, index) => {
                      const stepKey = `${activeMealDetails.id}-step-${index}`
                      const isDone = completedSteps.has(stepKey)

                      return (
                        <li key={stepKey} className={isDone ? styles.methodStepDone : undefined}>
                          <button
                            type="button"
                            className={styles.methodStepBtn}
                            onClick={() => toggleStepDone(stepKey)}
                            aria-pressed={isDone}
                          >
                            <span className={styles.methodStepIndex}>{index + 1}</span>
                            <span className={styles.methodStepText}>{step}</span>
                            <span className={styles.methodStepState}>{isDone ? 'Done' : 'Mark done'}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ol>
                </section>
              </div>
            </div>
            <div className={styles.mealModalFooter}>
              <button
                className={styles.mealActionBtnPrimary}
                onClick={() => printMeal(activeMealDetails)}
                type="button"
              >
                <PrinterIcon size={14} />
                Print Meal
              </button>
              <button
                className={styles.mealActionBtn}
                onClick={() => resetMealSteps(activeMealDetails.id)}
                type="button"
              >
                Reset Steps
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  )
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function toInstructionSteps(description: string): string[] {
  const normalized = description.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return []
  }

  const bySentence = normalized
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (bySentence.length > 1) {
    return bySentence.slice(0, 12)
  }

  const byCommas = normalized
    .split(/,\s+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 14)

  if (byCommas.length > 1) {
    return byCommas.slice(0, 12)
  }

  return [normalized]
}
