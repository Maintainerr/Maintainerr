import { Trans } from '@lingui/react/macro'
import { use } from 'react'
import { UseFormRegisterReturn } from 'react-hook-form'
import LocaleContext from '../../../contexts/locale-context'
import BrandLink from '../../Common/BrandLink'
import { Select } from '../../Forms/Select'

/**
 * A registered form field rather than an immediately-applied control: the
 * language follows the same Save flow as the rest of general settings, even
 * though it is stored per browser rather than on the server.
 */
const LanguageSelector = ({
  field,
}: {
  field: UseFormRegisterReturn<'locale'>
}) => {
  const { available } = use(LocaleContext)

  return (
    <div className="form-row">
      <label htmlFor="locale" className="text-label">
        <Trans>Display language</Trans>
      </label>
      <div className="form-input">
        <div className="form-input-field">
          <Select id="locale" {...field}>
            {Object.entries(available).map(([code, display]) => (
              // `lang` lets the browser and screen readers pronounce each
              // option in its own language.
              <option key={code} value={code} lang={code}>
                {display}
              </option>
            ))}
          </Select>
        </div>
        <p className="sm-description">
          <Trans>
            Saved in this browser.{' '}
            <BrandLink
              external
              href="https://hosted.weblate.org/engage/maintainerr/"
            >
              Untranslated text
            </BrandLink>{' '}
            falls back to English.
          </Trans>
        </p>
      </div>
    </div>
  )
}

export default LanguageSelector
