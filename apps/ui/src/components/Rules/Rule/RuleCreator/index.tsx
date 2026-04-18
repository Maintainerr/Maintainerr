import {
  ClipboardListIcon,
  DocumentAddIcon,
  MenuIcon,
} from '@heroicons/react/solid'
import { type MediaItemType, MediaType } from '@maintainerr/contracts'
import { isEqual } from 'lodash-es'
import {
  type KeyboardEvent,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react'
import { arrayMove, List } from 'react-movable'
import AddButton from '../../../Common/AddButton'
import Alert from '../../../Common/Alert'
import SectionHeading from '../../../Common/SectionHeading'
import RuleInput from './RuleInput'

export interface IRule {
  operator: string | null
  firstVal: [string, string]
  lastVal?: [string, string]
  section?: number
  customVal?: { ruleTypeId: number; value: string | number }
  arrDiskPath?: string
  action: number
}

export interface ILoadedRule {
  uniqueID: number
  rules: IRule[]
}

interface iRuleCreator {
  mediaType?: MediaType
  dataType?: MediaItemType
  editData?: { rules: IRule[] }
  onUpdate: (rules: IRule[]) => void
  onCancel: () => void
  radarrSettingsId?: number | null
  sonarrSettingsId?: number | null
}

type RuleSlot = { uid: string; rule: IRule | null }
type SectionSlot = { uid: string; rules: RuleSlot[] }

let uidCounter = 0
const newUid = (prefix: string) => `${prefix}-${++uidCounter}`

const DRAG_KEYS = new Set([' ', 'ArrowUp', 'ArrowDown', 'j', 'k', 'Escape'])
const stopDragKeyPropagation =
  (inner: ((e: KeyboardEvent) => void) | undefined) => (e: KeyboardEvent) => {
    inner?.(e)
    if (DRAG_KEYS.has(e.key)) e.stopPropagation()
  }

const buildInitialSections = (
  editData: { rules: IRule[] } | undefined,
): SectionSlot[] => {
  if (!editData?.rules?.length) {
    return [{ uid: newUid('s'), rules: [{ uid: newUid('r'), rule: null }] }]
  }

  const grouped = new Map<number, IRule[]>()
  for (const rule of editData.rules) {
    const key = rule.section ?? 0
    const list = grouped.get(key) ?? []
    list.push(rule)
    grouped.set(key, list)
  }

  return Array.from(grouped.keys())
    .sort((a, b) => a - b)
    .map((key) => ({
      uid: newUid('s'),
      rules: grouped.get(key)!.map((rule) => ({ uid: newUid('r'), rule })),
    }))
}

const flattenSections = (sections: SectionSlot[]): IRule[] => {
  const out: IRule[] = []
  sections.forEach((section, sectionIdx) => {
    section.rules.forEach((slot, ruleIdx) => {
      if (!slot.rule) return
      out.push({
        ...slot.rule,
        section: sectionIdx,
        operator: sectionIdx === 0 && ruleIdx === 0 ? null : slot.rule.operator,
      })
    })
  })
  return out
}

const RuleCreator = (props: iRuleCreator) => {
  const [sections, setSections] = useState<SectionSlot[]>(() =>
    buildInitialSections(props.editData),
  )
  const didMountRef = useRef(false)

  const emitUpdate = useEffectEvent(() => {
    props.onUpdate(flattenSections(sections))
  })

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }
    emitUpdate()
  }, [sections])

  const handleCommit = (uid: string) => (_id: number, rule: IRule) => {
    setSections((prev) => {
      let changed = false
      const next = prev.map((section) => ({
        ...section,
        rules: section.rules.map((slot) => {
          if (slot.uid !== uid) return slot
          if (slot.rule && isEqual(slot.rule, rule)) return slot
          changed = true
          return { ...slot, rule }
        }),
      }))
      return changed ? next : prev
    })
  }

  const handleIncomplete = (uid: string) => () => {
    setSections((prev) => {
      let changed = false
      const next = prev.map((section) => ({
        ...section,
        rules: section.rules.map((slot) => {
          if (slot.uid !== uid || slot.rule === null) return slot
          changed = true
          return { ...slot, rule: null }
        }),
      }))
      return changed ? next : prev
    })
  }

  const handleDelete = (sectionUid: string, ruleUid: string) => () => {
    setSections((prev) => {
      const next = prev
        .map((section) =>
          section.uid !== sectionUid
            ? section
            : {
                ...section,
                rules: section.rules.filter((slot) => slot.uid !== ruleUid),
              },
        )
        .filter((section) => section.rules.length > 0)
      return next.length > 0
        ? next
        : [{ uid: newUid('s'), rules: [{ uid: newUid('r'), rule: null }] }]
    })
  }

  const addRule = (sectionUid: string) => {
    const uid = newUid('r')
    setSections((prev) =>
      prev.map((section) =>
        section.uid !== sectionUid
          ? section
          : { ...section, rules: [...section.rules, { uid, rule: null }] },
      ),
    )
  }

  const addSection = () => {
    const ruleUid = newUid('r')
    setSections((prev) => [
      ...prev,
      { uid: newUid('s'), rules: [{ uid: ruleUid, rule: null }] },
    ])
  }

  const reorderRules = (
    sectionUid: string,
    oldIndex: number,
    newIndex: number,
  ) => {
    if (oldIndex === newIndex) return
    setSections((prev) =>
      prev.map((section) =>
        section.uid !== sectionUid
          ? section
          : { ...section, rules: arrayMove(section.rules, oldIndex, newIndex) },
      ),
    )
  }

  const reorderSections = (oldIndex: number, newIndex: number) => {
    if (oldIndex === newIndex) return
    setSections((prev) => arrayMove(prev, oldIndex, newIndex))
  }

  let absoluteCounter = 0
  const totalRules = sections.reduce((n, s) => n + s.rules.length, 0)
  const completed = sections.reduce(
    (n, s) => n + s.rules.filter((r) => r.rule !== null).length,
    0,
  )
  const allowDelete = totalRules > 1
  const hasIncompleteRule = sections.some((section) =>
    section.rules.some((slot) => slot.rule === null),
  )

  return (
    <div className="text-zinc-100">
      <List
        lockVertically
        values={sections}
        onChange={({ oldIndex, newIndex }) =>
          reorderSections(oldIndex, newIndex)
        }
        renderList={({ children, props: listProps }) => (
          <div ref={listProps.ref}>{children}</div>
        )}
        renderItem={({ value: section, props: itemProps, index }) => {
          const sectionNumber = (index ?? 0) + 1
          const { key: _itemKey, style: itemStyle, ...itemRest } = itemProps
          return (
            <div
              key={section.uid}
              {...itemRest}
              style={{ ...itemStyle, listStyle: 'none' }}
              className="mb-4"
            >
              <div className="rounded-lg bg-zinc-700 px-6 py-0.5 shadow-md">
                <div className="flex items-center">
                  <button
                    type="button"
                    data-movable-handle
                    tabIndex={-1}
                    className="mr-2 flex h-10 w-10 cursor-grab items-center justify-center rounded text-zinc-400 hover:bg-zinc-600 hover:text-zinc-100 active:cursor-grabbing md:h-6 md:w-6"
                    title="Drag to reorder section"
                    aria-label={`Drag handle for section ${sectionNumber}`}
                  >
                    <MenuIcon className="h-4 w-4" />
                  </button>
                  <div className="flex-1">
                    <SectionHeading id={sectionNumber} name="Section" />
                  </div>
                </div>

                <List
                  lockVertically
                  values={section.rules}
                  onChange={({ oldIndex, newIndex }) =>
                    reorderRules(section.uid, oldIndex, newIndex)
                  }
                  renderList={({ children, props: rulesListProps }) => (
                    <div
                      ref={rulesListProps.ref}
                      className="flex flex-col space-y-2"
                    >
                      {children}
                    </div>
                  )}
                  renderItem={({
                    value: slot,
                    props: ruleProps,
                    index: ruleIndex,
                  }) => {
                    const tagId = (ruleIndex ?? 0) + 1
                    const absoluteId = ++absoluteCounter
                    const {
                      key: _ruleKey,
                      style: ruleStyle,
                      onKeyDown: ruleOnKeyDown,
                      ...ruleRest
                    } = ruleProps
                    return (
                      <div
                        key={slot.uid}
                        {...ruleRest}
                        onKeyDown={stopDragKeyPropagation(ruleOnKeyDown)}
                        style={{ ...ruleStyle, listStyle: 'none' }}
                      >
                        <div className="flex w-full items-start">
                          <button
                            type="button"
                            data-movable-handle
                            tabIndex={-1}
                            className="mr-2 mt-3 flex h-10 w-10 shrink-0 cursor-grab items-center justify-center rounded text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 active:cursor-grabbing md:mt-5 md:h-6 md:w-6"
                            title="Drag to reorder rule"
                            aria-label={`Drag handle for rule ${tagId} in section ${sectionNumber}`}
                          >
                            <MenuIcon className="h-4 w-4" />
                          </button>
                          <div className="min-w-0 flex-1">
                            <RuleInput
                              id={absoluteId}
                              tagId={tagId}
                              section={sectionNumber}
                              editData={
                                slot.rule ? { rule: slot.rule } : undefined
                              }
                              mediaType={props.mediaType}
                              dataType={props.dataType}
                              radarrSettingsId={props.radarrSettingsId}
                              sonarrSettingsId={props.sonarrSettingsId}
                              onCommit={handleCommit(slot.uid)}
                              onIncomplete={handleIncomplete(slot.uid)}
                              onDelete={handleDelete(section.uid, slot.uid)}
                              allowDelete={allowDelete}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  }}
                />

                {!hasIncompleteRule ? (
                  <div className="mb-2 flex w-full justify-start">
                    <AddButton
                      className="mx-0"
                      onClick={() => addRule(section.uid)}
                      title={`Add a new rule to Section ${sectionNumber}`}
                      text="Add Rule"
                      icon={<DocumentAddIcon className="h-5 w-5" />}
                      buttonSize="sm"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          )
        }}
      />

      {!hasIncompleteRule ? (
        <div className="mb-3 mt-3 flex w-full justify-start pl-6">
          <div>
            <AddButton
              className="mx-0"
              onClick={addSection}
              title="Add a new section"
              text="New Section"
              icon={<ClipboardListIcon className="h-5 w-5" />}
              buttonSize="sm"
            />
          </div>
        </div>
      ) : null}

      {completed !== totalRules ? (
        <div className="mt-5">
          <Alert type="error">{`Some incomplete rules won't be saved`} </Alert>
        </div>
      ) : null}
    </div>
  )
}

export default RuleCreator
