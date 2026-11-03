/** A live value (Bizi counts): when the text changes it swaps at once. No fade, in any motion setting: a number you read must be the number now. */
export function Tick({ children }: { children: string }) {
  return <span>{children}</span>
}
