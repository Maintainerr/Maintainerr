import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/solid'
import { ICommunityRule } from '../CommunityRuleModal'

interface ICommunityRuleTableRow {
  onClick?: (id: number) => void
  onDoubleClick?: (id: number) => void
  onThumbsUp?: (id: number) => void
  onThumbsDown?: (id: number) => void
  thumbsActive: boolean
  clicked: boolean
  rule: ICommunityRule
}

const CommunityRuleTableRow = (props: ICommunityRuleTableRow) => {
  const onClick = () => {
    if (props.onClick) {
      props.onClick(props.rule.id!)
    }
  }

  const onDoubleClick = () => {
    if (props.onDoubleClick) {
      props.onDoubleClick(props.rule.id!)
    }
  }

  const onThumbsUp = () => {
    if (props.onThumbsUp) {
      props.onThumbsUp(props.rule.id!)
    }
  }

  const onThumbsDown = () => {
    if (props.onThumbsDown) {
      props.onThumbsDown(props.rule.id!)
    }
  }

  return (
    <tr className={props.clicked ? 'bg-zinc-600' : ''}>
      <td
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        className="whitespace-wrap inline-block max-h-44 w-60 overflow-hidden overflow-ellipsis px-4 py-4 text-left text-sm leading-5 text-white md:w-96"
      >
        {props.rule.name}
      </td>
      <td className="px-4 py-4 text-center text-sm leading-5 text-white">
        <div
          className="flex items-center justify-center"
          title={
            props.thumbsActive
              ? ''
              : 'You have already submitted karma for this rule.'
          }
        >
          <ChevronUpIcon
            onClick={
              props.thumbsActive &&
              props.rule.karma !== undefined &&
              props.rule.karma < 990
                ? onThumbsUp
                : undefined
            }
            className={
              props.thumbsActive &&
              props.rule.karma !== undefined &&
              props.rule.karma < 990
                ? 'w-6 cursor-pointer hover:text-amber-700'
                : 'w-6 text-zinc-700'
            }
          />
          {props.rule.karma}
          <ChevronDownIcon
            onClick={props.thumbsActive ? onThumbsDown : undefined}
            className={
              props.thumbsActive
                ? 'w-6 cursor-pointer hover:text-amber-700'
                : 'w-6 text-zinc-700'
            }
          />
        </div>
      </td>
      <td className="px-4 py-4 text-center text-sm leading-5 text-white">
        {props.rule.uploadedBy ? props.rule.uploadedBy : '?'}
      </td>
      <td className="px-4 py-4 text-center text-sm leading-5 text-white">
        {props.rule.appVersion ? props.rule.appVersion : '?'}
      </td>
    </tr>
  )
}
export default CommunityRuleTableRow
