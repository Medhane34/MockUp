"use client";

import React from "react";
import { Card, CardHeader } from "@heroui/react";
import { Monitor, Megaphone, Palette, Cpu } from "lucide-react";

const services = [
  {
    title: "Website Design",
    description: "Bespoke digital experiences that convert visitors into loyal customers. Mobile-first, speed-optimized, and visually stunning.",
    icon: Monitor,
  },
  {
    title: "Marketing",
    description: "Strategic digital campaigns across social media and search engines, focusing on ROI and sustainable market penetration.",
    icon: Megaphone,
  },
  {
    title: "Branding",
    description: "Visual identities that resonate with the local market and project global authority, crafted for innovative brands.",
    icon: Palette,
  },
  {
    title: "Business Automation",
    description: "Streamlining your workflows with intelligent software solutions, allowing you to focus on growth while we handle the repetitive tasks.",
    icon: Cpu,
  },
];

export const Services = () => {
  return (
    <section id="services" className="py-24 bg-default-50">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
          <div className="max-w-2xl">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              Services Tailored for <span className="text-primary italic">Dominance</span>
            </h2>
            <p className="text-lg text-default-500">
              We don&apos;t just build; we curate. Every design choice is backed by data and psychological insights to drive user engagement.
            </p>
          </div>
          <div className="hidden md:block">
            <p className="text-sm uppercase tracking-widest font-bold text-default-400">Expert Strategy • Local Focus</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {services.map((service, index) => (
            <Card key={index} className="border-none bg-background shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="flex gap-3 px-6 pt-8 pb-4">
                <div className="p-3 rounded-2xl bg-default-100 text-foreground">
                  <service.icon size={28} />
                </div>
              </CardHeader>
              <div className="px-6 pb-8">
                <h3 className="text-xl font-bold mb-3">{service.title}</h3>
                <p className="text-default-500 text-sm leading-relaxed">
                  {service.description}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
