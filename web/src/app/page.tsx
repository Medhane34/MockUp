"use client";

import React from "react";
import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { Services } from "@/components/landing/services";
import { Process } from "@/components/landing/process";
import { Portfolio } from "@/components/landing/portfolio";
/* import { FAQ } from "@/components/landing/faq"; */
import { Footer } from "@/components/landing/footer";
import { Card, Avatar, AvatarImage } from "@heroui/react";

const Testimonials = () => {
  return (
    <section className="py-24 overflow-hidden bg-background">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex flex-col items-center mb-16 text-center">
          <h2 className="text-4xl font-bold tracking-tight mb-4 italic">&quot;The scholarly approach Aligoo takes sets them apart. They didn&apos;t just build a site; they built an authority.&quot;</h2>
          <div className="flex flex-col items-center gap-2 mt-8">
            <Avatar>
              <AvatarImage src="https://i.pravatar.cc/150?u=a042581f4e29026704d" className="border-2 border-primary" />
            </Avatar>
            <div>
              <p className="font-bold text-lg">Eleni Gabre-Madhin</p>
              <p className="text-default-500 text-sm">Founder, Blue Nile Coffee</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <Card className="bg-default-50 border-none shadow-none p-4">
            <div className="flex flex-row gap-4 items-center">
              <Avatar>
                <AvatarImage src="https://i.pravatar.cc/150?u=a042581f4e29026704d" className="border-2 border-primary" />
              </Avatar>
              <div>
                <p className="font-bold uppercase tracking-widest text-[10px] text-primary mb-1">Director, Qene Games</p>
                <p className="font-bold text-lg">Dawit Abraham</p>
              </div>
            </div>
          </Card>
          <Card className="bg-default-50 border-none shadow-none p-4">
            <div className="flex flex-row gap-4 items-center">
              <Avatar>
                <AvatarImage src="https://i.pravatar.cc/150?u=a042581f4e29026704d" className="border-2 border-primary" />
              </Avatar>
              <div>
                <p className="font-bold uppercase tracking-widest text-[10px] text-primary mb-1">Creative Lead, Arada Studio</p>
                <p className="font-bold text-lg">Sara Tesfaye</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default function Home() {
  return (
    <div className="relative flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <Services />
        <Portfolio />
        <Process />
        <Testimonials />
        {/* <FAQ /> */}
      </main>
      <Footer />
    </div>
  );
}
