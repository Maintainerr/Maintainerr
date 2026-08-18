import { UploadIcon } from '@heroicons/react/outline'
import { ClipboardCopyIcon } from '@heroicons/react/solid'
import { Trans, useLingui } from '@lingui/react/macro'
import { useRef } from 'react'
import { toast } from 'react-toastify'
import Alert from '../Alert'
import Button from '../Button'
import LazyMonacoEditor from '../LazyMonacoEditor'
import Modal from '../Modal'

export interface IYamlImporterModal {
  onImport: (yaml: string) => void
  onCancel: () => void
  yaml?: string
}

const YamlImporterModal = (props: IYamlImporterModal) => {
  const { t } = useLingui()
  const editorRef = useRef(undefined)
  const uploadRef = useRef<HTMLInputElement>(null)

  function handleEditorDidMount(editor: any) {
    editorRef.current = editor
  }

  const upload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validExtensions = ['.yaml', '.yml']
    const lowerName = file.name.toLowerCase()
    if (!validExtensions.some((ext) => lowerName.endsWith(ext))) {
      // Placeholders from the validated list, so the message cannot disagree
      // with what the check accepts.
      const [yamlExtension, ymlExtension] = validExtensions
      toast.error(
        t`Only ${{ yamlExtension }} or ${{ ymlExtension }} files are allowed.`,
      )
      uploadRef.current!.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result
      if (typeof text === 'string') {
        if (text.trim().length === 0) {
          toast.error(t`Uploaded YAML file is empty.`)
          uploadRef.current!.value = ''
          return
        }
        ;(editorRef.current as any).setValue(text)
      }
    }
    reader.readAsText(file)
  }

  const download = async () => {
    if (props.yaml) {
      const blob = new Blob([props.yaml], { type: 'text/yaml' })
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = href
      link.download = `maintainerr_rules_${new Date().getTime()}.yaml`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  const copyToClipboard = async () => {
    const value = (editorRef.current as any)?.getValue?.()
    if (!value?.trim()) return

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value)
      } else {
        throw new Error('Clipboard not available')
      }
      toast.success(t`Copied to clipboard`)
    } catch {
      try {
        const textarea = document.createElement('textarea')
        textarea.value = value
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
        toast.success(t`Copied to clipboard`)
      } catch (fallbackError) {
        toast.error(t`Failed to copy to clipboard`)
      }
    }
  }

  return (
    <div>
      <Modal
        loading={false}
        backgroundClickable={false}
        onCancel={() => props.onCancel()}
        title={t`Yaml Rule Editor`}
        iconSvg={''}
        footerActions={
          <Button
            buttonType="primary"
            className="ml-3"
            onClick={() =>
              props.yaml
                ? void download()
                : props.onImport((editorRef.current as any).getValue())
            }
          >
            {props.yaml ? <Trans>Download</Trans> : <Trans>Import</Trans>}
          </Button>
        }
      >
        <input
          type="file"
          accept=".yaml,.yml"
          style={{ display: 'none' }}
          ref={uploadRef}
          onChange={upload}
        />
        <Alert type="info">
          {props.yaml ? (
            <Trans>Export your rules to a YAML document</Trans>
          ) : (
            <Trans>
              Import rules from a YAML document. This will override your current
              rules
            </Trans>
          )}
        </Alert>
        <div className="mb-2 flex justify-between">
          <label htmlFor="editor-field" className="text-label">
            <Trans>Rules YAML</Trans>
          </label>

          {props.yaml ? (
            <button
              onClick={copyToClipboard}
              title={t`Copy YAML`}
              aria-label={t`Copy YAML`}
            >
              <ClipboardCopyIcon className="h-5 w-5 text-maintainerr-600 hover:text-maintainerr" />
            </button>
          ) : (
            <button
              onClick={() => uploadRef.current?.click()}
              title={t`Upload YAML`}
              aria-label={t`Upload YAML`}
            >
              <span className="flex justify-center font-semibold text-maintainerr-600 hover:text-maintainerr">
                <UploadIcon className="h-5 w-5" />
              </span>
            </button>
          )}
        </div>
        <LazyMonacoEditor
          options={{
            minimap: { enabled: false },
            ...(props.yaml ? { readOnly: true } : undefined),
          }}
          height="70vh"
          defaultLanguage="yaml"
          theme="vs-dark"
          {...(props.yaml ? { defaultValue: props.yaml } : undefined)}
          onMount={handleEditorDidMount}
        />
      </Modal>
    </div>
  )
}

export default YamlImporterModal
