import { Application, ApplicationNames } from '@maintainerr/contracts'
import { IRule } from '../components/Rules/Rule/RuleCreator'

export enum TVLevel {
  SHOW = 'show',
  SEASON = 'season',
  EPISODE = 'episode',
}

export function detectRequiredServices(rules: IRule[]): string[] {
  const usedAppIds = new Set<number>()

  for (const rule of rules) {
    const [groupId] = rule.firstVal
    usedAppIds.add(Number(groupId))

    if (rule.lastVal) {
      const [lastGroupId] = rule.lastVal
      usedAppIds.add(Number(lastGroupId))
    }
  }

  return Array.from(usedAppIds)
    .map((id) => ApplicationNames[id as Application])
    .filter((name): name is string => !!name)
}
