"use client";

import React from "react";
import { Link } from "@heroui/react";
import { Separator } from '@heroui/react';
export const Footer = () => {
  return (
    <footer className="bg-foreground text-background pt-24 pb-12">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-20">
          <div className="flex flex-col gap-6">
            <p className="font-bold text-3xl tracking-tighter italic">ALIGOO</p>
            <p className="text-default-400 text-sm max-w-xs leading-relaxed">
              Curating digital excellence since 2024. Strategic marketing, design, and automation for innovative brands.
            </p>
          </div>

          <div className="flex flex-col gap-6">
            <h4 className="font-bold text-lg">Services</h4>
            <div className="flex flex-col gap-3">
              <Link href="#" className="text-default-400 text-sm hover:text-primary transition-colors">Website Design</Link>
              <Link href="#" className="text-default-400 text-sm hover:text-primary transition-colors">Digital Marketing</Link>
              <Link href="#" className="text-default-400 text-sm hover:text-primary transition-colors">Brand Identity</Link>
              <Link href="#" className="text-default-400 text-sm hover:text-primary transition-colors">Business Automation</Link>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <h4 className="font-bold text-lg">Company</h4>
            <div className="flex flex-col gap-3">
              <Link href="#" className="text-default-400 text-sm hover:text-primary transition-colors">About Us</Link>
              <Link href="#" className="text-default-400 text-sm hover:text-primary transition-colors">Portfolio</Link>
              <Link href="#" className="text-default-400 text-sm hover:text-primary transition-colors">Our Process</Link>
              <Link href="#" className="text-default-400 text-sm hover:text-primary transition-colors">Contact</Link>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <h4 className="font-bold text-lg">Ready to scale?</h4>
            <p className="text-default-400 text-sm leading-relaxed">
              Join the elite brands that are defining the future of the digital marketplace.
            </p>
            <Link href="mailto:hello@aligoo.com" className="font-bold">hello@aligoo.com</Link>
          </div>
        </div>

        <Separator className="bg-white/10 mb-8" />

        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-default-500 text-xs">© 2024 Aligoo Digital Agency. All rights reserved.</p>
          <div className="flex gap-8">
            <Link href="#" className="text-default-500 text-xs hover:text-white transition-colors">Terms of Service</Link>
            <Link href="#" className="text-default-500 text-xs hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="#" className="text-default-500 text-xs hover:text-white transition-colors">Cookie Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
