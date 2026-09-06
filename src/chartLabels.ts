// Leave room between neighboring labels and wrap before SVG text can cross columns.
export const wrapChartLabel = (value: string, width: number, characterWidth: number): readonly string[] => {
  const limit = Math.max(1, Math.floor((width - 20) / characterWidth))
  const lines: string[] = []
  let line = ''
  for (const word of value.split(/\s+/)) {
    if (line && line.length + word.length + 1 > limit) {
      lines.push(line)
      line = ''
    }
    line = line ? `${line} ${word}` : word
  }
  if (line) {
    lines.push(line)
  }
  return lines
}
