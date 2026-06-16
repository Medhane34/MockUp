// app/components/TremorSafelist.tsx
export default function TremorSafelist() {
    return (
        <div aria-hidden="true" className="hidden">
            {/* Backgrounds */}
            <div className="bg-emerald-500 bg-sky-500 bg-blue-500 bg-cyan-500 bg-slate-500 bg-amber-500 bg-indigo-500 bg-rose-500" />
            <div className="bg-emerald-100 bg-sky-100 bg-blue-100 bg-cyan-100 bg-slate-100 bg-amber-100" />
            {/* Text */}
            <div className="text-emerald-500 text-sky-500 text-blue-500 text-cyan-500 text-slate-500 text-amber-500 text-indigo-500 text-rose-500" />
            {/* SVG Fill & Stroke */}
            <div className="fill-emerald-500 fill-sky-500 fill-blue-500 fill-cyan-500 fill-slate-500 fill-amber-500 fill-indigo-500 fill-rose-500" />
            <div className="stroke-emerald-500 stroke-sky-500 stroke-blue-500 stroke-cyan-500 stroke-slate-500 stroke-amber-500 stroke-indigo-500 stroke-rose-500" />
            {/* Borders */}
            <div className="border-emerald-500 border-sky-500 border-blue-500 border-cyan-500 border-slate-500 border-amber-500" />
        </div>
    );
}
