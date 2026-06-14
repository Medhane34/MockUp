"use client";

import React from "react";
import { Button, Card, CardFooter, Chip, AvatarImage, Avatar } from "@heroui/react";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";

const projects = [
  {
    title: "Blue Nile Coffee",
    category: "E-Commerce • Branding",
    image: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?q=80&w=2078&auto=format&fit=crop",
    tag: "Featured",
  },
  {
    title: "Qene Games",
    category: "Fintech • UI/UX Design",
    image: "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?q=80&w=2070&auto=format&fit=crop",
    tag: "Mobile",
  },
  {
    title: "Arada Studio",
    category: "Corporate • Marketing",
    image: "https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=2069&auto=format&fit=crop",
    tag: "Web",
  },
];

export const Portfolio = () => {
  return (
    <section id="portfolio" className="py-24 bg-default-50">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
          <div className="max-w-2xl">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              Selected <span className="text-primary italic">Works</span>
            </h2>
            <p className="text-lg text-default-500">
              Selection of recent projects that define excellence in the digital realm.
            </p>
          </div>
          <Button
            variant="ghost"
            className="font-bold text-lg p-0 h-auto min-w-0 text-primary hover:bg-transparent"

          >
            Explore all projects
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {projects.map((project, index) => (
            <Card key={index} className="bg-transparent border-none">
              <div className="p-0 overflow-hidden rounded-3xl mb-6">

                <Image
                  width={800}
                  height={600}
                  alt={project.title}
                  className="object-cover w-full h-[400px] hover:scale-105 transition-transform duration-700"
                  src={project.image}
                />


              </div>
              <CardFooter className="flex flex-col items-start p-0 gap-2">
                <div className="flex justify-between w-full items-center">
                  <p className="text-sm font-bold text-primary uppercase tracking-widest">{project.category}</p>
                  <Chip size="sm" variant="soft" className="text-[10px] uppercase font-black">{project.tag}</Chip>
                </div>
                <h3 className="text-2xl font-bold">{project.title}</h3>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
