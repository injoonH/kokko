import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function signed(n: number) {
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
}
