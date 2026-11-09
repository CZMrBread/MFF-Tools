/** České skloňování po číslovce: plural(n, 'vrcholem', 'vrcholy', 'vrcholy') („s 1 vrcholem“, „s 5 vrcholy“). */
export function plural(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}
