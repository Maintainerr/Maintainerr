export interface ISectionHeading {
  /** The complete heading, numbering included - fragments cannot be translated. */
  label: string
  description?: string
}

const SectionHeading = (props: ISectionHeading) => {
  return (
    <div className="section mt-4 mb-4 h-full w-full">
      <h3 className="sm-heading flex max-w-6xl">{props.label}</h3>
      {props.description ? (
        <p className="description">{props.description}</p>
      ) : undefined}
    </div>
  )
}
export default SectionHeading
