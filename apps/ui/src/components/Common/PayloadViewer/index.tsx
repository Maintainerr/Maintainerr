import LazyMonacoEditor from '../LazyMonacoEditor'

/**
 * Read-only JSON viewer for a fixed payload, shared by the telemetry settings
 * panels and the consent prompt so both show the report the same way.
 *
 * It fills its container, which callers give a fixed height: sizing to the
 * content instead would move the surrounding UI when the payload arrives.
 *
 * `scrollBeyondLastLine` is off because those boxes are taller than most
 * payloads: monaco's default lets the view scroll past the final line, which
 * puts a scrollbar on content that already fits.
 */
const PayloadViewer = ({ value }: { value: unknown }) => (
  <LazyMonacoEditor
    options={{
      readOnly: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      overviewRulerLanes: 0,
      renderLineHighlight: 'none',
    }}
    defaultLanguage="json"
    theme="vs-dark"
    value={JSON.stringify(value, null, 2)}
  />
)

export default PayloadViewer
