"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wish-orange)] focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--wish-orange)] text-white hover:bg-[var(--wish-orange-hover)]",
        secondary:
          "bg-white/10 text-foreground border border-[var(--glass-border)] hover:bg-white/15 [html[data-theme=light]_&]:border-black/12 [html[data-theme=light]_&]:bg-black/[0.045] [html[data-theme=light]_&]:hover:bg-black/[0.085]",
        outline:
          "border border-[var(--glass-border)] bg-transparent hover:bg-white/10 text-foreground [html[data-theme=light]_&]:border-black/18 [html[data-theme=light]_&]:bg-white/65 [html[data-theme=light]_&]:hover:bg-black/[0.05]",
        ghost:
          "hover:bg-white/10 text-foreground [html[data-theme=light]_&]:hover:bg-black/[0.06]",
        link: "text-[var(--wish-orange)] underline-offset-4 hover:underline",
        destructive:
          "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
        success:
          "bg-emerald-700 text-white hover:bg-emerald-600 focus-visible:ring-emerald-500",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-12 rounded-lg px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
