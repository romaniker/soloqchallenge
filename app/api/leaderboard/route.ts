import { NextResponse } from "next/server";

const PLAYER = {
  gameName: process.env.PLAYER_GAME_NAME || "wot m9 i go afk",
  tagLine: process.env.PLAYER_TAG || "EUW",
};

type Region = { regional: string; platform: string; opgg: string };
const ROUTES: Record<string, Region> = {
  EUW: { regional: "europe", platform: "euw1", opgg: "euw" },
  EUNE: { regional: "europe", platform: "eun1", opgg: "eune" },
  NA: { regional: "americas", platform: "na1", opgg: "na" },
  LAN: { regional: "americas", platform: "la1", opgg: "lan" },
  LAS: { regional: "americas", platform: "la2", opgg: "las" },
  BR: { regional: "americas", platform: "br1", opgg: "br" },
  TR: { regional: "europe", platform: "tr1", opgg: "tr" },
  JP: { regional: "asia", platform: "jp1", opgg: "jp" },
  KR: { regional: "asia", platform: "kr", opgg: "kr" },
  OCE: { regional: "sea", platform: "oc1", opgg: "oce" },
};

const HEADERS = { "X-Riot-Token": process.env.RIOT_API_KEY || "" };

// ==== Tipos concretos (adiós 'any') ====
type AccountDto = { puuid: string; gameName: string; tagLine: string };
type SummonerDto = { id: string; profileIconId: number };
type LeagueEntry = { queueType: string; tier: string; rank: string; leaguePoints: number };
type MatchParticipant = { puuid: string; win: boolean };
type MatchDto = { info?: { participants?: MatchParticipant[] } };

async function riot<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Riot ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

function cap(s: string) {
  return s ? s[0] + s.slice(1).toLowerCase() : s;
}

export async function GET() {
  const key = process.env.RIOT_API_KEY;
  if (!key) return NextResponse.json({ error: "Falta RIOT_API_KEY" }, { status: 500 });

  const tag = (PLAYER.tagLine || "EUW").toUpperCase();
  const R = ROUTES[tag];
  if (!R) return NextResponse.json({ error: `Región no soportada: ${tag}` }, { status: 400 });

  // 1) Riot ID → Account (PUUID)
  const acc = await riot<AccountDto>(
    `https://${R.regional}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
      PLAYER.gameName
    )}/${encodeURIComponent(PLAYER.tagLine)}`
  );

  // 2) PUUID → Summoner (para icono e id)
  const sum = await riot<SummonerDto>(
    `https://${R.platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${acc.puuid}`
  );

  // 3) Liga (tipo correcto, sin any)
  let tier = "Unranked";
  let lp = 0;
  try {
    const leagues = await riot<LeagueEntry[]>(
      `https://${R.platform}.api.riotgames.com/lol/league/v4/entries/by-summoner/${sum.id}`
    );
    const solo = leagues.find((l) => l.queueType === "RANKED_SOLO_5x5");
    if (solo) {
      tier = `${cap(solo.tier)} ${solo.rank}`;
      lp = Number(solo.leaguePoints) || 0;
    }
  } catch {
    // si da 401/403/429 dejamos Unranked/0 LP
  }

  // 4) Últimas ranked solo/duo (queue 420) → W/L
  const ids = await riot<string[]>(
    `https://${R.regional}.api.riotgames.com/lol/match/v5/matches/by-puuid/${acc.puuid}/ids?queue=420&count=10`
  );

  let wins = 0;
  let losses = 0;
  for (const id of ids) {
    try {
      const match = await riot<MatchDto>(
        `https://${R.regional}.api.riotgames.com/lol/match/v5/matches/${id}`
      );
      const p = match.info?.participants?.find((x) => x.puuid === acc.puuid);
      if (p) {
        // ✅ Evita el ternario "como statement" (regla no-unused-expressions)
        if (p.win) {
          wins++;
        } else {
          losses++;
        }
      }
    } catch {
      // ignora partidas que fallen
    }
  }

  const avatarUrl = `https://ddragon.leagueoflegends.com/cdn/14.20.1/img/profileicon/${sum.profileIconId}.png`;

  const payload = [
    {
      id: "self",
      rank: 1,
      avatarUrl,
      gameName: acc.gameName,
      tagLine: acc.tagLine,
      tier,
      lp,
      games: wins + losses,
      wins,
      losses,
      opggUrl: `https://www.op.gg/summoners/${R.opgg}/${encodeURIComponent(
        acc.gameName
      )}-${encodeURIComponent(acc.tagLine)}`,
    },
  ];

  return NextResponse.json(payload);
}
