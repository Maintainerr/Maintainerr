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
const stopDragKeyPropagation = (
  inner: ((e: KeyboardEvent) => void) | undefined,
) => (e: KeyboardEvent) => {
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
  const [newRuleUids, setNewRuleUids] = useState<Set<string>>(new Set())
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

  const clearNewRuleUid = (uid: string) => {
    setNewRuleUids((prev) => {
      if (!prev.has(uid)) return prev
      const next = new Set(prev)
      next.delete(uid)
      return next
    })
  }

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
    clearNewRuleUid(uid)
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
    clearNewRuleUid(ruleUid)
  }

  const addRule = (sectionUid: string) => {
    const uid = newUid('r')
    setNewRuleUids((prev) => new Set(prev).add(uid))
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
    setNewRuleUids((prev) => new Set(prev).add(ruleUid))
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
  const hasPendingAdd = newRuleUids.size > 0

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
                    const isNew = newRuleUids.has(slot.uid)
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
                                !isNew && slot.rule
                                  ? { rule: slot.rule }
                                  : undefined
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

                {!hasPendingAdd ? (
                  <div className="mb-2 flex w-full justify-end">
                    <button
                      type="button"
                      className="flex h-8 rounded bg-maintainerr-600 text-zinc-200 shadow-md hover:bg-maintainerr"
                      onClick={() => addRule(section.uid)}
                      title={`Add a new rule to Section ${sectionNumber}`}
                    >
                      <DocumentAddIcon className="m-auto ml-5 h-5" />
                      <p className="button-text m-auto ml-1 mr-5 text-zinc-200">
                        Add Rule
                      </p>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          )
        }}
      />

      {!hasPendingAdd ? (
        <div className="mb-3 mt-3 flex w-full">
          <div className="m-auto xl:m-0">
            <button
              type="button"
              className="flex h-8 rounded bg-maintainerr-600 text-zinc-200 shadow-md hover:bg-maintainerr"
              onClick={addSection}
              title="Add a new section"
            >
              <ClipboardListIcon className="m-auto ml-5 h-5" />
              <p className="button-text m-auto ml-1 mr-5 text-zinc-200">
                New Section
              </p>
            </button>
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
