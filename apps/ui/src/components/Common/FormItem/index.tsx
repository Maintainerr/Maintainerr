interface IFormItem {
  children: React.ReactNode
  label: string
  htmlField?: string
}

const FormItem = (props: IFormItem) => {
  return (
    <div className="form-row">
      <label
        htmlFor={`${props.htmlField ? props.htmlField : props.label}-field`}
        className="text-label"
      >
        {props.label}
      </label>
      <div className="form-input">
        <div className="form-input-field">{props.children}</div>
      </div>
    </div>
  )
}

export default FormItem
