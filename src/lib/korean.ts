/** "창문을", "제습기를": picks 을/를 by whether the last Hangul syllable has a final consonant. */
export function withObjectParticle(word: string) {
  const last = word.trim().at(-1)
  if (!last) return word
  const code = last.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return `${word}을(를)` // not Hangul: can't tell
  return (code - 0xac00) % 28 === 0 ? `${word}를` : `${word}을`
}
