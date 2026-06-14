"use client";

import React from "react";
import { Accordion, AccordionItem } from "@heroui/react";

const faqs = [
  {
    question: "What is the typical timeline for a project?",
    answer: "Standard website projects typically range from 4 to 8 weeks. Larger enterprise platforms or automation systems may take 12 weeks or more depending on complexity.",
  },
  {
    question: "How do you determine pricing?",
    answer: "Our pricing is value-based, tailored to the specific growth goals and technical requirements of your business. We offer both project-based fees and monthly strategic retainers.",
  },
  {
    question: "Do you work with startups outside of Ethiopia?",
    answer: "Yes, while our primary focus is the Ethiopian SMB sector, we curate digital experiences for innovative brands globally, with a special emphasis on the emerging Pan-African market.",
  },
  {
    question: "What technologies do you use?",
    answer: "We specialize in modern, high-performance tech stacks including Next.js, Tailwind CSS, and Sanity CMS, ensuring your digital presence is fast, scalable, and easy to manage.",
  },
];

export const FAQ = () => {
  return (
    <section className="py-24">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold tracking-tight mb-4">Common Inquiries</h2>
          <p className="text-default-500">Everything you need to know about starting your journey with Aligoo.</p>
        </div>
        
        <Accordion variant="splitted" selectionMode="multiple" className="gap-4">
          {faqs.map((faq, index) => (
            <AccordionItem
              key={index}
              aria-label={faq.question}
              title={faq.question}
              className="px-6 bg-default-50 shadow-none border-none data-[open=true]:bg-background transition-colors"
              classNames={{
                title: "font-bold text-lg",
                content: "text-default-500 pb-6",
              }}
            >
              {faq.answer}
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
};
