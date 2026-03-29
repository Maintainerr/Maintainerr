export const startsWithDigit = (value: string): boolean => {
  const firstCharacter = value[0]

  return (
    firstCharacter !== undefined &&
    firstCharacter >= '0' &&
    firstCharacter <= '9'
  )
}
