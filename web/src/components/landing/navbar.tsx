"use client";

import React from "react";
import {
  Link,
  Button,
} from "@heroui/react";

export const Navbar = () => {
  return (
    <nav className="sticky top-0 z-50 w-full bg-background/70 backdrop-blur-md border-b border-divider">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-bold text-foreground text-2xl tracking-tighter italic hover:opacity-100 transition-opacity">
            ALIGOO
          </Link>
          <div className="hidden sm:flex gap-8">
            <Link href="#services" className="text-sm font-medium text-default-600 hover:text-foreground transition-colors">
              Services
            </Link>
            <Link href="#portfolio" className="text-sm font-medium text-default-600 hover:text-foreground transition-colors">
              Portfolio
            </Link>
            <Link href="#process" className="text-sm font-medium text-default-600 hover:text-foreground transition-colors">
              Process
            </Link>
            <Link href="#about" className="text-sm font-medium text-default-600 hover:text-foreground transition-colors">
              About
            </Link>
          </div>
        </div>
        <div className="flex items-center">
          <Button

            variant="secondary"
            size="sm"
            className="font-semibold rounded-full px-6"
          >
            Contact Us
          </Button>
        </div>
      </div>
    </nav>
  );
};
