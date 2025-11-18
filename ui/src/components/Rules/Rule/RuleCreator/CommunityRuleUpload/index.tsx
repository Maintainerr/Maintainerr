import { useRef, useState } from 'react'
import { IRule } from '..'
import { PostApiHandler } from '../../../../../utils/ApiHandler'
import { detectRequiredServices } from '../../../../../utils/CommunityRuleMaps'
import Alert from '../../../../Common/Alert'
import Modal from '../../../../Common/Modal'
interface ICommunityRuleUpload {
  rules: IRule[]
  type: 'movie' | 'show'
  level?: 'show' | 'season' | 'episode'
  onSubmit: () => void
  onCancel: () => void
}

const CommunityRuleUpload = (props: ICommunityRuleUpload) => {
  const nameRef = useRef<any>(undefined)
  const descriptionRef = useRef<any>(undefined)
  const uploadedByRef = useRef<any>(undefined)
  const [thanksModal, setThanksModal] = useState<boolean>(false)
  const [failed, setFailed] = useState<string>('')

  const handleUpload = async () => {
    if (nameRef.current.value && descriptionRef.current.value) {
      const requiredServices = detectRequiredServices(props.rules)
      const payload: any = {
        name: nameRef.current.value,
        type: props.type,
        description: descriptionRef.current.value,
        JsonRules: props.rules,
        uploadedBy: uploadedByRef.current.value || undefined,
        requiredServices,
      }

      if (props.type === 'show' && props.level) {
        payload.level = props.level
      }

      await PostApiHandler(`/rules/community`, payload)
        .then((resp) => {
          if (resp.code === 1) {
            setThanksModal(true)
          } else {
            setFailed(resp.result)
          }
        })
        .catch(() => {
          setFailed('Failed to connect to the server. Please try again later.')
        })
    }
  }
  return (
    <div>
      <Modal
        loading={false}
        backgroundClickable={false}
        onCancel={props.onCancel}
        cancelText={'Cancel'}
        okDisabled={false}
        onOk={handleUpload}
        okText={'Upload'}
        okButtonType={'primary'}
        title={'Upload Community Rule'}
        iconSvg={''}
      >
        <div className="mt-6">
          <Alert
            title={`Every attempt should be made to only upload working rules.
                    Rules with less than -100 karma and uploads with no rules, are removed nightly.`}
            type="warning"
          />

          {failed ? (
            <Alert title={`Error: ${failed}`} type="warning" />
          ) : undefined}

          <form>
            <div className="form-row items-center">
              <label htmlFor="name" className="text-label">
                Community Short Name *
              </label>
              <div className="form-input">
                <div className="form-input-field">
                  <input
                    className="!bg-zinc-800"
                    name="name"
                    id="name"
                    type="text"
                    ref={nameRef}
                  ></input>
                </div>
              </div>
            </div>

            <div className="form-row items-center">
              <label htmlFor="description" className="text-label">
                Extended Description *
              </label>
              <div className="form-input">
                <div className="form-input-field">
                  <textarea
                    className="!bg-zinc-800"
                    name="description"
                    id="description"
                    rows={5}
                    ref={descriptionRef}
                  ></textarea>
                </div>
              </div>
            </div>

            <div className="form-row items-center">
              <label htmlFor="uploadedBy" className="text-label">
                Uploaded by (optional)
              </label>
              <div className="form-input">
                <div className="form-input-field items-center">
                  <input
                    className="!bg-zinc-800"
                    name="uploadedBy"
                    id="uploadedBy"
                    type="text"
                    maxLength={20}
                    placeholder="Max 20 characters"
                    ref={uploadedByRef}
                  ></input>
                </div>
              </div>
            </div>
          </form>
        </div>

        {thanksModal ? (
          <Modal
            loading={false}
            backgroundClickable={false}
            onCancel={() => {
              setThanksModal(false)
              props.onSubmit()
            }}
            cancelText={'Close'}
            title={'Upload Successful'}
            iconSvg={''}
          >
            <Alert title={`Thank you for contributing.`} type="info" />
          </Modal>
        ) : undefined}
      </Modal>
    </div>
  )
}

export default CommunityRuleUpload
