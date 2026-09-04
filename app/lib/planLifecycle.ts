import type { TrainingPlan, TrainingPlanStatus } from './types'

export function getPlanStatus(plan: Pick<TrainingPlan, 'status'>): TrainingPlanStatus {
  return plan.status || 'draft'
}

export function publishPlan(plan: TrainingPlan, publishedAt = new Date().toISOString()): TrainingPlan {
  return {
    ...plan,
    status: 'active',
    revision: Math.max(plan.revision || 0, 1),
    publishedAt,
    updatedAt: new Date(publishedAt),
  }
}

export function archivePlan(plan: TrainingPlan): TrainingPlan {
  return {
    ...plan,
    status: 'archived',
    revision: (plan.revision || 0) + 1,
    updatedAt: new Date(),
  }
}
