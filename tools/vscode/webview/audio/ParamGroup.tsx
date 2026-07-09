import { Collapsible } from '@three-flatland/design-system'
import { ParamRow } from './ParamRow'
import { PARAM_GROUPS, type ParamGroupKey, type ParamKey, type ZzfxParams } from './params'

export type ParamGroupProps = {
  groupKey: ParamGroupKey
  params: ZzfxParams
  onChangeParam: (key: ParamKey, next: number) => void
}

export function ParamGroup({ groupKey, params, onChangeParam }: ParamGroupProps) {
  const group = PARAM_GROUPS.find((g) => g.key === groupKey)!
  return (
    <Collapsible heading={group.label} open>
      {group.params.map((key) => (
        <ParamRow key={key} paramKey={key} value={params[key]} onChange={onChangeParam} />
      ))}
    </Collapsible>
  )
}
