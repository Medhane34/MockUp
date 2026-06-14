"use client";

import React from "react";
import { Button, Chip } from "@heroui/react";
import { ArrowRight, Star } from "lucide-react";

export const Hero = () => {
  return (
    <section className="relative py-24 md:py-32 overflow-hidden">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex flex-col items-center text-center gap-8">
          <Chip
            color="success"
            className="px-4 py-1 animate-in fade-in slide-in-from-bottom-4 duration-1000"
          >
            Digital Excellence in East Africa
          </Chip>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight max-w-4xl leading-[1.1] animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-200">
            The Digital <span className="text-primary italic">Curator</span> for Your Brand&apos;s Growth
          </h1>

          <p className="text-lg md:text-xl text-default-500 max-w-2xl animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
            Tailored website design, strategic marketing, and high-impact branding specifically crafted for Ethiopian SMBs ready to dominate the digital landscape.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-4 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-400">
            <Button
              size="lg"
              variant="primary"
              className="px-8 font-bold h-14 rounded-full"
            >
              Start Your Project
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="px-8 font-bold h-14 rounded-full"
            >
              View Portfolio
            </Button>
          </div>

          <div className="mt-16 grid grid-cols-2 md:grid-cols-3 gap-8 md:gap-16 items-center opacity-70 grayscale animate-in fade-in duration-1000 delay-500">
            <div className="flex flex-col items-center gap-1">
              <span className="text-4xl font-bold text-foreground">98%</span>
              <span className="text-xs uppercase tracking-widest font-semibold text-default-400 text-center">Satisfaction Rate</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-4xl font-bold text-foreground">50+</span>
              <span className="text-xs uppercase tracking-widest font-semibold text-default-400 text-center">Projects Delivered</span>
            </div>
            <div className="hidden md:flex flex-col items-center gap-1">
              <span className="text-4xl font-bold text-foreground">24h</span>
              <span className="text-xs uppercase tracking-widest font-semibold text-default-400 text-center">Strategy Response</span>
            </div>
          </div>
        </div>
      </div>

      {/* Background Decor */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-secondary/10 rounded-full blur-[100px]" />
      </div>
    </section>
  );
};
