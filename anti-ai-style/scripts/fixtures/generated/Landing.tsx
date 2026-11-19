// Fixture: a screen assembled from defaults. Every line here is a tell on purpose.
import { Inter } from "next/font/google";

export function Landing() {
  return (
    <main className="bg-gradient-to-br from-indigo-500 to-purple-600 text-center">
      <div className="absolute -top-24 left-1/2 h-96 w-96 rounded-full bg-purple-400 blur-3xl" />
      <h1 className="bg-clip-text text-center text-transparent">Unlock the power of your workflow</h1>
      <p className="text-center">Seamlessly manage everything in one place 🚀</p>
      <section className="grid grid-cols-3 gap-8 text-center">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-xl backdrop-blur-lg transition-all hover:scale-105">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100">✨</div>
          <h3 className="text-center">Lightning fast</h3>
          <p className="text-center">Built for teams like Acme Corp.</p>
        </div>
        <div className="rounded-2xl p-8 shadow-indigo-500/50" data-aos="fade-up">
          <p className="rounded-3xl">Reviewed by John Doe</p>
        </div>
        <div className="rounded-2xl"><span className="rounded-xl" /></div>
        <div className="rounded-2xl"><span className="rounded-xl" /></div>
        <div className="rounded-2xl"><span className="rounded-[24px]" /></div>
      </section>
    </main>
  );
}
