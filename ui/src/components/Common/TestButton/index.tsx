import { BeakerIcon, CheckIcon, ExclamationIcon } from '@heroicons/react/solid'
import { FormEvent, useState } from 'react'
import GetApiHandler, { PostApiHandler } from '../../../utils/ApiHandler'
import Button from '../Button'
import { SmallLoadingSpinner } from '../LoadingSpinner'

interface ITestButton<T> {
  payload?: T
  testUrl: string
  onTestComplete?: (result: { status: boolean; message: string }) => void
}

interface TestStatus {
  clicked: boolean
  status: boolean
}

interface BasicResponse {
  status: 'OK' | 'NOK'
  code: 0 | 1
  message: string
}

const TestButton = <T,>(props: ITestButton<T>) => {
  const [loading, setLoading] = useState<boolean>(false)
  const [clicked, setClicked] = useState<TestStatus>({
    clicked: false,
    status: false,
  })

  const performTest = async (e: FormEvent) => {
    setLoading(true)

    const handler = props.payload
      ? PostApiHandler(props.testUrl, props.payload)
      : GetApiHandler(props.testUrl)

    await handler.then((resp: BasicResponse) => {
      setClicked({ clicked: true, status: resp.code == 1 ? true : false })
      props.onTestComplete?.({
        status: resp.code === 1 ? true : false,
        message: resp.message,
      })
      setLoading(false)
    })
  }

  return (
    <span className="ml-3 inline-flex rounded-md shadow-sm">
      <Button
        type="button"
        buttonType={
          clicked.clicked ? (clicked.status ? 'success' : 'danger') : 'default'
        }
        onClick={performTest}
      >
        {loading ? (
          <SmallLoadingSpinner />
        ) : clicked.clicked ? (
          clicked.status ? (
            <CheckIcon />
          ) : (
            <ExclamationIcon />
          )
        ) : (
          <BeakerIcon />
        )}
        <span className="ml-1">Test Saved</span>
      </Button>
    </span>
  )
}

export default TestButton
