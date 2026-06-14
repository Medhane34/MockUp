"use client";

import React from "react";

const steps = [
  {
    number: "01",
    title: "Discovery",
    description: "Deep diving into your brand values, target audience, and competitive landscape to find your unique edge.",
  },
  {
    number: "02",
    title: "Strategy",
    description: "Crafting a bespoke roadmap focused on ROI and sustainable market penetration in the Ethiopian digital space.",
  },
  {
    number: "03",
    title: "Execution",
    description: "Meticulous development and design focusing on speed, aesthetics, and usability to create a premium experience.",
  },
  {
    number: "04",
    title: "Growth",
    description: "Continuous optimization and data-driven marketing to ensure long-term success and market leadership.",
  },
];

export const Process = () => {
  return (
    <section id="process" className="py-24">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="mb-16">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6 text-center">
            Our <span className="text-primary italic">Process</span> to Excellence
          </h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {steps.map((step, index) => (
            <div key={index} className="flex flex-col gap-6 relative group">
              <div className="text-6xl md:text-7xl font-black text-default-100 group-hover:text-primary/10 transition-colors duration-500 select-none">
                {step.number}
              </div>
              <div className="flex flex-col gap-3">
                <h3 className="text-2xl font-bold">{step.title}</h3>
                <p className="text-default-500 leading-relaxed">
                  {step.description}
                </p>
              </div>
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-12 -right-6 w-12 h-[2px] bg-default-100" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
