export interface ISectionHeading {
  id: number
  name: string
  description?: string
}

const SectionHeading = (props: ISectionHeading) => {
  return (
    <div className="section mb-4 mt-4 h-full w-full">
      <h3 className="sm-heading flex max-w-6xl">
        {props.id ? `${props.name} #${props.id}` : `${props.name} #1`}
      </h3>
      {props.description ? (
        <p className="description">{props.description}</p>
      ) : undefined}
    </div>
  )
}
export default SectionHeading
