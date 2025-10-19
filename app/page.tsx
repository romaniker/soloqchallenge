"use client";

import Image from "next/image";
import useSWR from "swr";
import { useMemo } from "react";
import type { ReactNode } from "react";

type Player = {
  id: string;
  rank: number;
  avatarUrl: string;
  gameName: string;
  tagLine?: string;
  tier: string;
  lp: number;
  games: number;
  wins: number;
  losses: number;
  opggUrl?: string;
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("La API no devolvió una lista");
  return data as Player[];
};

export default function Page() {
  const { data, error, isLoading } = useSWR<Player[]>("/api/leaderboard", fetcher, {
    refreshInterval: 20000,
    revalidateOnFocus: true,
  });

  const rows = useMemo(
    () => (Array.isArray(data) ? [...data].sort((a, b) => a.rank - b.rank) : []),
    [data]
  );

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl md:text-3xl font-bold mb-6">Leaderboard LoL</h1>

        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50 shadow-2xl">
          <table className="w-full text-sm md:text-base">
            <thead className="bg-neutral-900/70 text-neutral-400">
              <tr>
                <Th className="w-10 text-center">#</Th>
                <Th>Jugador</Th>
                <Th>Cuenta</Th>
                <Th>Rango</Th>
                <Th className="hidden md:table-cell text-right">Partidas</Th>
                <Th className="text-right">W</Th>
                <Th className="text-right">L</Th>
                <Th className="text-right">WR</Th>
                <Th className="text-right">OP.GG</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-neutral-400">Cargando…</td>
                </tr>
              )}

              {error && !isLoading && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-rose-400">
                    Error: {String(error.message)}
                  </td>
                </tr>
              )}

              {!isLoading && !error && rows.map((p) => <Row key={p.id} p={p} />)}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-medium uppercase tracking-wide text-xs ${className}`}>{children}</th>;
}

function Row({ p }: { p: Player }) {
  const wr = p.games ? Math.round((p.wins / p.games) * 100) : 0;
  return (
    <tr className="border-t border-neutral-800 hover:bg-neutral-900/60 transition-colors">
      <td className="px-4 py-3 text-center text-neutral-400">{p.rank}</td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Image
              src={p.avatarUrl}
              alt={p.gameName}
              width={36}
              height={36}
              className="h-9 w-9 rounded-full object-cover"
            />
          <div className="leading-tight">
            <div className="font-semibold">{p.gameName}</div>
          </div>
        </div>
      </td>

      <td className="px-4 py-3 text-neutral-300">
        {p.tagLine ? `${p.gameName}#${p.tagLine}` : "—"}
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs bg-neutral-700/50 text-neutral-300 border-neutral-600">●</span>
          <span className="text-neutral-200">{p.tier}</span>
          <span className="text-neutral-400">({p.lp} LP)</span>
        </div>
      </td>

      <td className="px-4 py-3 text-right hidden md:table-cell">{p.games}</td>
      <td className="px-4 py-3 text-right text-emerald-400 font-semibold">{p.wins}</td>
      <td className="px-4 py-3 text-right text-rose-400 font-semibold">{p.losses}</td>
      <td className="px-4 py-3 text-right">{wr}%</td>
      <td className="px-4 py-3 text-right">
        {p.opggUrl ? (
          <a className="text-indigo-400 hover:text-indigo-300 underline underline-offset-4" href={p.opggUrl} target="_blank" rel="noreferrer">OP.GG</a>
        ) : (
          <span className="text-neutral-500">—</span>
        )}
      </td>
    </tr>
  );
}
