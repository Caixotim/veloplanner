# CyclingAI Training Plans App

Welcome to Cycling AI - an intelligent cycling training plan generator with Intervals.icu integration.

## Features

- **Personalized Training Plans**: AI-generated plans based on your goal, fitness level, injuries, and available training time
- **Intervals.icu Integration**: Sync your latest ride data from Intervals.icu for automatic FTP estimation and plan optimization
- **Free Meal Planning**: TheMealDB-backed meal suggestions shaped by diet targets (with local fallback)
- **Optional USDA Enrichment**: Free FoodData Central macro enrichment when a USDA API key is configured
- **Cross-Training**: Equipment-based strength and conditioning workouts (resistance bands, rowing machine, dumbbells, indoor trainer)
- **Print & Export**: Beautiful, print-friendly plans in PDF or CSV format
- **Colorful UI**: Intuitive, icon-rich interface for easy readability

## Getting Started

### Installation

```bash
cd cyclingAI
pnpm install
```

### Development

```bash
pnpm dev
```

The app will be available at `http://localhost:3010`

### Build

```bash
pnpm build
pnpm start
```

## Configuration

Create a `.env.local` file based on `.env.example`.

```env
NEXT_PUBLIC_INTERVALS_ICU_API_URL=https://intervals.icu
USDA_API_KEY=your_usda_api_key
```

Intervals credentials are connected in-app via the Integrations modal.
They are stored per browser in local IndexedDB and are not required in `.env.local`.

## Project Structure

```
cyclingAI/
├── app/
│   ├── components/          # React components
│   ├── lib/                 # Core business logic
│   │   ├── types.ts         # TypeScript type definitions
│   │   ├── trainingPlanner.ts    # Training plan generation
│   │   ├── mealPlanner.ts   # Meal suggestions
│   │   ├── intervalsIntegration.ts    # Intervals.icu API integration
│   │   └── exportPlan.ts    # PDF/CSV export
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── public/                  # Static assets
└── package.json
```

## Core Features Documentation

### Training Plan Generation

The `trainingPlanner.ts` generates personalized 12-week plans based on:

- **Goals**: FTP increase, climbing sustainability, endurance, recovery
- **Training Phases**: Base → Build → Peak → Recovery
- **Session Types**: Recovery, Endurance, Tempo, Threshold, VO2Max, Anaerobic, Strength
- **Time Allocation**: Respects user's available training hours per day

### Meal Suggestions

The `mealPlanner.ts` provides:

- TheMealDB-backed meal suggestions shaped by diet preference and macro targets
- Optional USDA FoodData Central enrichment for more accurate calorie and macro estimates
- Macronutrient calculations (carbs, proteins, fats)
- Meal timing recommendations based on training phase
- Hydration strategy for different session types
- Local Portuguese/Mediterranean fallback recipes when remote meal fetching is unavailable

### Intervals.icu Integration

The `intervalsIntegration.ts` handles:

- Intervals.icu API-backed ride data sync
- FTP estimation from power metrics
- Performance trend analysis
- Auto-plan adjustment recommendations

### Export & Print

The `exportPlan.ts` provides:

- PDF export with print-friendly layout
- CSV export for spreadsheet analysis
- Browser print functionality
- Responsive design that works on mobile

## Customization

### Adding New Training Goals

Edit `trainingPlanner.ts` and add to the `focusMap`:

```typescript
const focusMap: Record<string, Record<string, string[]>> = {
  your_new_goal: {
    base: ['Focus point 1', 'Focus point 2'],
    build: ['...'],
    peak: ['...'],
    recovery: ['...'],
  },
}
```

### Adding New Equipment

Edit `types.ts` and update the `Equipment` union type:

```typescript
export type Equipment = '...' | 'your_new_equipment'
```

### Customizing Meal Suggestions

Edit `mealPlanner.ts` and expand `PORTUGUESE_INGREDIENTS` array and `generateMealSuggestions` function.

## Testing

```bash
pnpm test
pnpm test:watch
```

## Type Checking

```bash
pnpm typecheck
```

## Linting

```bash
pnpm lint
pnpm lint:fix
```

## Future Enhancements

- [ ] Mobile app version (React Native)
- [ ] Strava integration
- [ ] Garmin Connect integration
- [ ] Real-time plan adjustment based on form/fatigue
- [ ] Group training coordination
- [ ] AI-powered coaching tips
- [ ] Performance analytics dashboard
- [ ] Social features (share plans, compare progress)
- [ ] Multi-language support
- [ ] Dark mode

## Technology Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: SCSS Modules
- **UI Library**: Custom React components + SCSS modules
- **Export**: html2canvas + jsPDF
- **Logging**: native `console` logging

## License

UNLICENSED - Internal use only

## Support

For issues or questions, please reach out to the development team.
