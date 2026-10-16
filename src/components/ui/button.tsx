import { ButtonHTMLAttributes } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      className={twMerge(clsx("button", variant, className))}
      {...props}
    />
  );
}
