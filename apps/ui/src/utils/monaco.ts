import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker'

// Monaco looks its worker factory up on the global rather than taking it as an
// argument, so this has to be assigned before the first editor mounts.
globalThis.MonacoEnvironment = {
  getWorker: (...[, label]: [workerId: string, label: string]) =>
    label === 'json' ? new jsonWorker() : new editorWorker(),
}

export default monaco
