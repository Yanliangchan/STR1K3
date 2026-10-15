import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export const buttonClasses = (variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) =>
  cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors select-none",
    "disabled:pointer-events-none disabled:opacity-50",
    {
      primary: "bg-primary text-white hover:bg-primary-hover active:bg-primary-strong",
      secondary: "bg-navy-50 text-navy-800 hover:bg-navy-100 border border-navy-100",
      outline: "border border-slate-300 bg-surface text-slate-800 hover:bg-slate-50",
      ghost: "text-slate-700 hover:bg-slate-100",
      danger: "bg-danger text-white hover:bg-danger-hover",
    }[variant],
    {
      sm: "min-h-9 px-3 text-sm",
      md: "min-h-11 px-4 text-[15px]",
      lg: "min-h-12 px-5 text-base",
      icon: "h-11 w-11",
    }[size],
    className,
  );

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant, size, loading, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
