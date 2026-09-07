import styles from './LoadingSkeletons.module.scss'

type SkeletonProps = {
  label?: string
}

export function PageSkeleton({ label = 'Loading VeloPlanner…' }: SkeletonProps) {
  return (
    <main className={styles.page} aria-live="polite" aria-busy="true">
      <div className={styles.shell}>
        <div className={styles.title} />
        <div className={styles.line} />
        <div className={styles.lineShort} />
        <p>{label}</p>
      </div>
    </main>
  )
}

export function CoachSkeleton() {
  return (
    <main className={styles.page} aria-live="polite" aria-busy="true">
      <div className={styles.coachShell}>
        <div className={styles.hero}>
          <div className={styles.title} />
          <div className={styles.line} />
          <div className={styles.lineShort} />
        </div>
        <div className={styles.metricGrid}>
          <div className={styles.metric} />
          <div className={styles.metric} />
          <div className={styles.metric} />
        </div>
        <div className={styles.panel} />
        <div className={styles.panelLarge} />
        <p>Loading your training workspace…</p>
      </div>
    </main>
  )
}

export function ProfileSkeleton() {
  return (
    <main className={styles.page} aria-live="polite" aria-busy="true">
      <div className={styles.coachShell}>
        <div className={styles.title} />
        <div className={styles.line} />
        <div className={styles.formGrid}>
          <div className={styles.field} />
          <div className={styles.field} />
          <div className={styles.field} />
          <div className={styles.field} />
          <div className={styles.fieldWide} />
          <div className={styles.fieldWide} />
        </div>
        <p>Loading athlete profile…</p>
      </div>
    </main>
  )
}

export function IntegrationSkeleton() {
  return (
    <main className={styles.page} aria-live="polite" aria-busy="true">
      <div className={styles.coachShell}>
        <div className={styles.title} />
        <div className={styles.lineShort} />
        <div className={styles.panel} />
        <div className={styles.panel} />
        <p>Loading integrations…</p>
      </div>
    </main>
  )
}
