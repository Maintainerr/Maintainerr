import { UploadIcon } from '@heroicons/react/outline'
import { ClipboardCopyIcon } from '@heroicons/react/solid'
import Editor from '@monaco-editor/react'
import { useRef } from 'react'
import { toast } from 'react-toastify'
import Alert from '../Alert'
import Modal from '../Modal'

export interface IYamlImporterModal {
  onImport: (yaml: string) => void
  onCancel: () => void
  yaml?: string
}

const YamlImporterModal = (props: IYamlImporterModal) => {
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
      toast.error('Only .yaml or .yml files are allowed.')
      uploadRef.current!.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result
      if (typeof text === 'string') {
        if (text.trim().length === 0) {
          toast.error('Uploaded YAML file is empty.')
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
      toast.success('Copied to clipboard')
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
        toast.success('Copied to clipboard')
      } catch (fallbackError) {
        toast.error('Failed to copy to clipboard')
      }
    }
  }

  return (
    <div>
      <Modal
        loading={false}
        backgroundClickable={false}
        onCancel={() => props.onCancel()}
        okDisabled={false}
        onOk={
          props.yaml
            ? () => download()
            : () => props.onImport((editorRef.current as any).getValue())
        }
        okText={props.yaml ? 'Download' : 'Import'}
        okButtonType={'primary'}
        title={'Yaml Rule Editor'}
        iconSvg={''}
      >
        <input
          type="file"
          accept=".yaml,.yml"
          style={{ display: 'none' }}
          ref={uploadRef}
          onChange={upload}
        />
        <Alert type="info">
          {props.yaml
            ? 'Export your rules to a YAML document'
            : 'Import rules from a YAML document. This will override your current rules'}
        </Alert>
        <div className="mb-2 flex justify-between">
          <label htmlFor="editor-field" className="text-label">
            Rules YAML
          </label>

          {props.yaml ? (
            <button
              onClick={copyToClipboard}
              title="Copy YAML"
              aria-label="Copy YAML"
            >
              <ClipboardCopyIcon className="h-5 w-5 text-amber-600 hover:text-amber-500" />
            </button>
          ) : (
            <button
              onClick={() => uploadRef.current?.click()}
              title="Upload YAML"
              aria-label="Upload YAML"
            >
              <span className="flex justify-center font-semibold text-amber-600 hover:text-amber-500">
                <UploadIcon className="h-5 w-5" />
              </span>
            </button>
          )}
        </div>
        <Editor
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
