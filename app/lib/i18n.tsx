'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

type Locale = 'en' | 'pt-PT'

type TranslationKey =
  | 'language'
  | 'coach'
  | 'connectData'
  | 'athlete'
  | 'askCoach'
  | 'askCoachHint'
  | 'reviewPlan'
  | 'planProposal'
  | 'goal'
  | 'length'
  | 'starts'
  | 'schedule'
  | 'tweak'
  | 'dismiss'
  | 'createPlan'
  | 'creating'
  | 'adjustRequest'
  | 'createFirstPlan'
  | 'openingCoach'
  | 'noPlansYet'
  | 'planRequestHint'
  | 'proposalPrompt'
  | 'allRightsReserved'
  | 'noPlansDescription'
  | 'week'
  | 'threeDays'
  | 'day'
  | 'today'
  | 'calendar'
  | 'season'
  | 'progress'
  | 'exports'
  | 'trainingCalendar'

const translations: Record<Locale, Record<TranslationKey, string>> = {
  en: {
    language: 'Language', coach: 'Coach', connectData: 'Connect data', athlete: 'Athlete', askCoach: 'Ask your coach', askCoachHint: 'Ask about your plan, create a workout, or request a change.', reviewPlan: 'Review plan', planProposal: 'Plan proposal', goal: 'Goal', length: 'Length', starts: 'Starts', schedule: 'Schedule', tweak: 'Tweak', dismiss: 'Dismiss', createPlan: 'Create plan', creating: 'Creating…', adjustRequest: 'Adjust request', createFirstPlan: 'Create your first plan above.', openingCoach: 'Opening your coach…', noPlansYet: 'No Plans Yet', planRequestHint: 'Tell me what you want to train for, when, and how much time you have.', proposalPrompt: 'Review the schedule, then confirm to create it with your saved availability and athlete profile.', allRightsReserved: 'All rights reserved.', noPlansDescription: 'Once saved, it will appear here and can be synced with Intervals.icu.', week: 'Week', threeDays: '3 days', day: 'Day', today: 'Today', calendar: 'Calendar', season: 'Season', progress: 'Progress', exports: 'Exports', trainingCalendar: 'Training Calendar',
  },
  'pt-PT': {
    language: 'Idioma', coach: 'Treinador', connectData: 'Ligar dados', athlete: 'Atleta', askCoach: 'Pergunte ao seu treinador', askCoachHint: 'Pergunte sobre o seu plano, crie um treino ou peça uma alteração.', reviewPlan: 'Rever plano', planProposal: 'Proposta de plano', goal: 'Objectivo', length: 'Duração', starts: 'Início', schedule: 'Agendar', tweak: 'Ajustar', dismiss: 'Dispensar', createPlan: 'Criar plano', creating: 'A criar…', adjustRequest: 'Ajustar pedido', createFirstPlan: 'Crie o seu primeiro plano acima.', openingCoach: 'A abrir o seu treinador…', noPlansYet: 'Ainda não existem planos', planRequestHint: 'Diga-me o que pretende treinar, quando e quanto tempo tem disponível.', proposalPrompt: 'Reveja o plano e confirme para o criar com a sua disponibilidade e perfil de atleta guardados.', allRightsReserved: 'Todos os direitos reservados.', noPlansDescription: 'Depois de guardado, ficará disponível aqui e poderá ser sincronizado com o Intervals.icu.', week: 'Semana', threeDays: '3 dias', day: 'Dia', today: 'Hoje', calendar: 'Calendário', season: 'Época', progress: 'Progresso', exports: 'Exportações', trainingCalendar: 'Calendário de treino',
  },
}

const textTranslations: Record<string, string> = {
  'Training Calendar': 'Calendário de treino', 'Ask your coach': 'Pergunte ao seu treinador',
  'Ask about your plan, create a workout, or request a change.': 'Pergunte sobre o seu plano, crie um treino ou peça uma alteração.',
  'Drag to reschedule • Double-click duration/intensity for quick edits • Use ✏️ for full editor': 'Arraste para reagendar • Faça duplo clique na duração/intensidade para edições rápidas • Use ✏️ para o editor completo',
  'Drag to reschedule': 'Arraste para reagendar', 'Click to edit full session': 'Clique para editar a sessão completa', 'Orange border = unsaved changes': 'Contorno laranja = alterações não guardadas',
  'Saved Plans': 'Planos guardados', 'Delete All Plans': 'Eliminar todos os planos', 'Plan Summary': 'Resumo do plano', 'Pending Changes': 'Alterações pendentes', 'Save Changes': 'Guardar alterações', 'Configure Zones': 'Configurar zonas',
  'Goal': 'Objectivo', 'Start': 'Início', 'Updated': 'Actualizado', 'Named plans stay listed here so you can open or delete them without losing track of the calendar.': 'Os planos com nome permanecem aqui para que os possa abrir ou eliminar sem perder o controlo do calendário.',
  'Season Planner': 'Planeador da época', 'Performance Analytics': 'Análise de desempenho', 'Body Metrics Log': 'Registo de métricas corporais', 'What to Eat Today': 'O que comer hoje', 'Integrations': 'Integrações', 'Training Zones': 'Zonas de treino',
  'Track weight, resting HR, and HRV to add context to training load and recovery.': 'Acompanhe o peso, a FC em repouso e a VFC para contextualizar a carga e a recuperação.', 'Weight (kg)': 'Peso (kg)', 'Resting HR (bpm)': 'FC em repouso (bpm)', 'HRV (ms)': 'VFC (ms)', 'Notes': 'Notas', 'Saving...': 'A guardar…', 'Update Metrics': 'Actualizar métricas', 'Save Metrics': 'Guardar métricas', 'Recent entries': 'Registos recentes', 'No metrics logged yet.': 'Ainda não existem métricas registadas.',
  'Track weight, resting HR, and HRV changes alongside training load.': 'Acompanhe as alterações do peso, da FC em repouso e da VFC juntamente com a carga de treino.', '7d Planned Stress': 'Stress planeado (7 dias)', '7d Completed Stress': 'Stress concluído (7 dias)', 'Next 7d Planned Stress': 'Stress planeado nos próximos 7 dias', 'Projected TSB (+7d)': 'TSB projectado (+7 dias)', 'Freshness': 'Frescura', 'Actual Data': 'Dados reais', 'Rider Assessment': 'Avaliação do atleta', 'Summary Stats': 'Estatísticas resumidas', 'Expand all': 'Expandir tudo', 'Collapse all': 'Recolher tudo', 'Hide': 'Ocultar', 'Show': 'Mostrar',
  'Timing Tip': 'Sugestão de timing', 'Ingredients': 'Ingredientes', 'Method': 'Método', 'Done': 'Concluído', 'Mark done': 'Marcar como concluído', 'Print Meal': 'Imprimir refeição', 'Reset Steps': 'Repor passos', 'No training scheduled': 'Não há treino agendado', 'Suggested Meals from Your Plan': 'Refeições sugeridas do seu plano',
  'Connect provider credentials once per browser. Credentials stay local in your browser storage.': 'Ligue as credenciais do fornecedor uma vez por navegador. As credenciais permanecem no armazenamento local do navegador.', 'How to connect Intervals.icu': 'Como ligar o Intervals.icu', 'Please provide both Intervals API key and Athlete ID.': 'Indique a chave API do Intervals e o ID do atleta.', 'Intervals credentials rejected': 'As credenciais do Intervals foram rejeitadas.', 'Failed to save connection': 'Não foi possível guardar a ligação.', 'Failed to disconnect integration': 'Não foi possível desligar a integração.', 'Healthy connection': 'Ligação activa', 'Not connected': 'Não ligado', 'Last validated:': 'Última validação:', 'Connected': 'Ligado', 'Disconnect': 'Desligar', 'Connect Intervals.icu': 'Ligar o Intervals.icu', 'Save Connection': 'Guardar ligação',
  'Your Profile': 'O seu perfil', 'Create Training Plan': 'Criar plano de treino', 'Plan Inputs': 'Dados do plano', 'Describe the plan you want': 'Descreva o plano pretendido', 'Athlete Details': 'Dados do atleta', 'Training Constraints': 'Restrições de treino', 'Available Training Time': 'Tempo de treino disponível', 'Equipment Available': 'Equipamento disponível', 'Current Injuries or Issues': 'Lesões ou problemas actuais', 'Time-Crunched Strategy': 'Estratégia para pouco tempo', 'Nutrition Preferences': 'Preferências nutricionais', 'Fine-tune coaching (optional)': 'Ajustar o acompanhamento (opcional)', 'These settings define what gets scheduled and when it starts.': 'Estas definições determinam o que é agendado e quando começa.', 'These details shape session timing and workout targets without changing the high-level goal.': 'Estes dados determinam o horário das sessões e os objectivos sem alterar o objectivo principal.',
  'Why this workout?': 'Porque este treino?', 'Can I go easier?': 'Posso fazer mais leve?', 'What should I focus on?': 'Em que devo concentrar-me?', 'Suggested questions': 'Perguntas sugeridas', 'Question examples': 'Exemplos de perguntas', 'Proposed training plan': 'Plano de treino proposto', 'Your saved athlete profile and weekly availability will shape the calendar.': 'O seu perfil de atleta e a disponibilidade semanal vão definir o calendário.', 'Session proposal': 'Proposta de sessão', 'Proposed session change': 'Alteração de sessão proposta', 'Session removal': 'Remoção de sessão', 'Review this session and confirm before I add or update it in your plan.': 'Reveja esta sessão e confirme antes de a adicionar ou actualizar no seu plano.', 'This session will be removed from your plan and Intervals.icu. Do you want me to continue?': 'Esta sessão será removida do seu plano e do Intervals.icu. Pretende continuar?', 'Duration': 'Duração', 'Intensity': 'Intensidade', 'Focus': 'Foco', 'Confirm session': 'Confirmar sessão', 'Tweak details': 'Ajustar detalhes', 'Confirm removal': 'Confirmar remoção',
  'Exports': 'Exportações', 'Download or print your current plan.': 'Transfira ou imprima o seu plano actual.', 'Print / Save as PDF': 'Imprimir / Guardar como PDF', 'Export CSV': 'Exportar CSV', 'Export ICS': 'Exportar ICS', 'Garmin/Zwift Bundle': 'Pacote Garmin/Zwift', 'Opens plan in new tab — print or save via browser': 'Abre o plano num novo separador — imprima ou guarde através do navegador', 'Spreadsheet-friendly table': 'Tabela compatível com folhas de cálculo', 'Import to calendar apps': 'Importar para aplicações de calendário', 'ZIP with workouts + guide': 'ZIP com treinos + guia',
  'Plan Name': 'Nome do plano', 'Training Goal': 'Objectivo de treino', 'Plan Start Date': 'Data de início do plano', 'Goal Timeframe (weeks)': 'Duração do objectivo (semanas)', 'Intensity Distribution': 'Distribuição da intensidade', 'Target FTP Increase (watts)': 'Aumento de FTP pretendido (watts)', 'Quality Priority': 'Prioridade da qualidade', 'Hard Sessions Per Week Cap': 'Máximo de sessões intensas por semana', 'Short-Day Preference': 'Preferência para dias curtos', 'Diet Pattern': 'Padrão alimentar', 'Daily Calories Target (optional)': 'Calorias diárias (opcional)', 'Daily Protein (g, optional)': 'Proteína diária (g, opcional)', 'Daily Carbs (g, optional)': 'Hidratos de carbono diários (g, opcional)', 'Daily Fat (g, optional)': 'Gordura diária (g, opcional)', 'Age': 'Idade', 'Height (cm)': 'Altura (cm)', 'Current FTP (watts) - optional': 'FTP actual (watts) - opcional', 'Power Meter & Performance Data': 'Potenciómetro e dados de desempenho', 'I have a power meter on my bike': 'Tenho um potenciómetro na bicicleta', 'hrs': 'h',
  'Athlete Profile': 'Perfil do atleta', 'Manage rider data separately from plan inputs.': 'Gira os dados do atleta separadamente dos dados do plano.', 'Back to Coach': 'Voltar ao treinador', 'Loading profile...': 'A carregar o perfil…', 'Athlete profile saved. New plans will use this profile by default.': 'Perfil do atleta guardado. Os novos planos usarão este perfil por defeito.',
  'Review all saved plans across the year, see phase blocks at a glance, and jump directly into any plan.': 'Consulte todos os planos guardados ao longo do ano, veja as fases de relance e abra directamente qualquer plano.', 'Actual Performance': 'Desempenho real', 'Power Curve': 'Curva de potência', 'Heart Rate Trend (Recent 21 Rides)': 'Tendência da frequência cardíaca (21 treinos recentes)', 'Ride Data Needed': 'Dados de treinos necessários', 'Sync Intervals.icu rides to unlock actual performance analytics.': 'Sincronize os treinos do Intervals.icu para desbloquear a análise de desempenho real.', 'Planned Load': 'Carga planeada', 'Weekly Volume & Intensity': 'Volume e intensidade semanais', 'Intensity Distribution (Planned vs Completed)': 'Distribuição da intensidade (planeada vs concluída)', 'Plan Phase Focus (Week by Week)': 'Foco das fases do plano (semana a semana)', 'Rider Assessment Snapshot': 'Resumo da avaliação do atleta',
  'No Plans Yet': 'Ainda não existem planos', 'No saved plans in this year.': 'Não existem planos guardados neste ano.', 'Week': 'Semana', '3 days': '3 dias', 'Day': 'Dia', 'Today': 'Hoje', 'Previous': 'Anterior', 'Next': 'Seguinte',
}

type LocaleContextValue = { locale: Locale; isPortuguese: boolean; setLocale: (locale: Locale) => void; t: (key: TranslationKey) => string; translateText: (text: string) => string }
const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en')

  useEffect(() => {
    const saved = window.localStorage.getItem('cycling-ai-locale')
    const browserLocale = navigator.language.toLowerCase().startsWith('pt') ? 'pt-PT' : 'en'
    setLocaleState(saved === 'pt-PT' || saved === 'en' ? saved : browserLocale)
  }, [])

  const setLocale = (next: Locale) => {
    setLocaleState(next)
    window.localStorage.setItem('cycling-ai-locale', next)
    document.documentElement.lang = next === 'pt-PT' ? 'pt-PT' : 'en'
  }

  const value = useMemo(() => ({ locale, isPortuguese: locale === 'pt-PT', setLocale, t: (key: TranslationKey) => translations[locale][key], translateText: (text: string) => locale === 'pt-PT' ? textTranslations[text] || text : text }), [locale])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) throw new Error('useLocale must be used inside LocaleProvider')
  return context
}

export type { Locale, TranslationKey }
