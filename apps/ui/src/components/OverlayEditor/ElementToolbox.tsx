import {
  AnnotationIcon,
  CursorClickIcon,
  PhotographIcon,
  TemplateIcon,
  VariableIcon,
} from '@heroicons/react/outline'
import type {
  OverlayElement,
  OverlayTemplateMode,
} from '@maintainerr/contracts'

interface ElementToolboxProps {
  mode: OverlayTemplateMode
  onAdd: (el: OverlayElement) => void
  nextLayerOrder: number
}

let _uid = 0
const uid = () => `el-${Date.now()}-${++_uid}`

export function ElementToolbox({ onAdd, nextLayerOrder }: ElementToolboxProps) {
  const addText = () => {
    onAdd({
      id: uid(),
      type: 'text',
      x: 50,
      y: 50,
      width: 300,
      height: 60,
      rotation: 0,
      layerOrder: nextLayerOrder,
      opacity: 1,
      visible: true,
      text: 'New Text',
      fontFamily: 'Inter',
      fontPath: 'Inter-Bold.ttf',
      fontSize: 36,
      fontColor: '#FFFFFF',
      fontWeight: 'bold',
      textAlign: 'left',
      verticalAlign: 'middle',
      backgroundColor: null,
      backgroundRadius: 0,
      backgroundPadding: 0,
      shadow: false,
      uppercase: false,
    })
  }

  const addVariable = () => {
    onAdd({
      id: uid(),
      type: 'variable',
      x: 50,
      y: 50,
      width: 350,
      height: 60,
      rotation: 0,
      layerOrder: nextLayerOrder,
      opacity: 1,
      visible: true,
      segments: [
        { type: 'text', value: 'Leaving ' },
        { type: 'variable', field: 'date' },
      ],
      fontFamily: 'Inter',
      fontPath: 'Inter-Bold.ttf',
      fontSize: 36,
      fontColor: '#FFFFFF',
      fontWeight: 'bold',
      textAlign: 'center',
      verticalAlign: 'middle',
      backgroundColor: null,
      backgroundRadius: 0,
      backgroundPadding: 0,
      shadow: false,
      uppercase: false,
      dateFormat: 'MMM d',
      language: 'en-US',
      enableDaySuffix: false,
      textToday: 'today',
      textDay: 'in 1 day',
      textDays: 'in {0} days',
    })
  }

  const addShape = (shape: 'rectangle' | 'ellipse') => {
    onAdd({
      id: uid(),
      type: 'shape',
      x: 50,
      y: 50,
      width: 200,
      height: shape === 'ellipse' ? 200 : 60,
      rotation: 0,
      layerOrder: nextLayerOrder,
      opacity: 1,
      visible: true,
      shapeType: shape,
      fillColor: '#B20710',
      strokeColor: null,
      strokeWidth: 0,
      cornerRadius: shape === 'rectangle' ? 12 : 0,
    })
  }

  const addImage = () => {
    onAdd({
      id: uid(),
      type: 'image',
      x: 50,
      y: 50,
      width: 200,
      height: 200,
      rotation: 0,
      layerOrder: nextLayerOrder,
      opacity: 1,
      visible: true,
      imagePath: '',
    })
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
        Elements
      </h3>
      <div className="flex flex-col gap-1.5">
        <ToolButton icon={AnnotationIcon} label="Text" onClick={addText} />
        <ToolButton
          icon={VariableIcon}
          label="Variable"
          onClick={addVariable}
        />
        <ToolButton
          icon={TemplateIcon}
          label="Rectangle"
          onClick={() => addShape('rectangle')}
        />
        <ToolButton
          icon={CursorClickIcon}
          label="Ellipse"
          onClick={() => addShape('ellipse')}
        />
        <ToolButton icon={PhotographIcon} label="Image" onClick={addImage} />
      </div>
    </div>
  )
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-300 transition hover:bg-zinc-700"
      onClick={onClick}
    >
      <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
      {label}
    </button>
  )
}
