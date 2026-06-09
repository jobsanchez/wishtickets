"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface GuestSignupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  redirectTo: string;
}

export function GuestSignupDialog({
  open,
  onOpenChange,
  redirectTo,
}: GuestSignupDialogProps) {
  function handleSignUp() {
    window.location.href = `/signup?redirectTo=${encodeURIComponent(redirectTo)}`;
  }

  function handleSignIn() {
    window.location.href = `/login?redirectTo=${encodeURIComponent(redirectTo)}`;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="w-[min(96vw,44rem)] max-w-[44rem] !p-6 sm:!p-8">
        <DialogHeader className="flex flex-col items-center text-center sm:text-center">
          <div className="mb-4 flex items-center justify-center">
            <Image src="/logo.webp" alt="" width={44} height={44} className="h-11 w-11 object-contain" aria-hidden />
          </div>
          <DialogTitle className="text-xl text-foreground">
            Be part of the experience!
          </DialogTitle>
          <DialogDescription className="mt-2 text-base">
            <span className="block">Create an account to book your tickets and be part of the experience.</span>
            <span className="mt-2 block">Already with us? Sign in and continue your journey.</span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-7 pt-1 px-1 pb-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button
            onClick={handleSignUp}
            className="w-full min-w-0 bg-[var(--wish-orange)] hover:bg-[var(--wish-orange-hover)]"
          >
            Sign up for free
          </Button>
          <Button
            onClick={handleSignIn}
            className="w-full min-w-0 bg-yellow-500 text-black hover:bg-yellow-400"
          >
            I&apos;m a Member
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            className="w-full min-w-0 bg-slate-700 text-white hover:bg-slate-600"
          >
            I&apos;ll Explore First
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
